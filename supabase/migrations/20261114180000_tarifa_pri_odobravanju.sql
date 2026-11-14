-- Faza 2: pri odobravanju baza proverava i samu tarifu satnice, ne samo da je > 0 (D3, D4, D16).
-- Do sada je operater preko API-ja mogao da upiše proizvoljnu tarifu u nacrt (npr. 99 €/h), a odobravanje je
-- proveravalo samo da tarifa postoji. Sada guard_timesheet u trenutku odobravanja bira tarifu po istom redosledu kao
-- src/lib/payroll/rates.js (resolveRates) za nedelju reda (week_start — isti datum koji šalje approvalPayload) i
-- odbija red čija b2c_rate / b2b_rate ne odgovara toj tarifi, ili kad tarife nema ili nije EUR po satu.
-- Izvor i oznaku tarife u rate_snapshot sada upisuje baza; ono što pošalje ekran se ignoriše.
-- Postojeći redovi se ne diraju: provera važi samo za prelazak u „odobreno", odobren red se ne proverava ponovo (D10).

-- ───────────── pomoćne funkcije (isto kao rates.js / timesheet.js) ─────────────
-- text() iz rates.js: prazna vrednost = '', inače bez razmaka na krajevima.
create or replace function public.rate_trim(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '^\s+|\s+$', '', 'g')
$$;

-- validRate (src/lib/payroll/timesheet.js) za vrednost iz JSON polja projekta (assigned_employees, job_roles):
-- broj, ili tekst koji je decimalan broj; > 0 → zaokruženo na cent, inače null — 0, prazno i tekst koji nije broj
-- nisu tarifa (ide se na sledeći nivo).
create or replace function public.rate_value(p jsonb) returns numeric
language sql immutable set search_path = '' as $$
  select case when v.n > 0 then round(v.n, 2) end
  from (select case
    when jsonb_typeof(p) = 'number' then p::numeric
    when jsonb_typeof(p) = 'string' and (p #>> '{}') ~ '^\s*[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?\s*$'
      then (p #>> '{}')::numeric
  end as n) v
$$;

-- ───────────── jedan izbor tarife u bazi (ogledalo resolveSideRate iz rates.js) ─────────────
-- Redosled — prvi nivo koji ima tarifu > 0 pobeđuje:
--   radnik (trošak, 'worker'):  tarifa angažmana → satnica radnika na projektu (assigned_employees.b2c_rate)
--                               → tarifa projekta/pozicije → tarifa radnika → profil (b2c_hourly_rate)
--   klijent (prihod, 'client'): isto, sa zanimanjem na projektu (job_roles.b2b_rate) pre tarife radnika
-- Red iz Tarifa važi kad je aktivan i effective_from ≤ datum ≤ effective_to (kraj otvoren ili uključen); najnoviji
-- effective_from pobeđuje, pa created_date, pa id — kao pickLatest. Dodela važi kad nije otkazana i pokriva datum.
-- Pozicija: iz dodele koja važi tog dana (najnoviji početak, pa id — redosled kojim ih stranica učitava), pa iz
-- spiska radnika na projektu. Tarifa za poziciju ima prednost nad tarifom za ceo projekat; tuđa pozicija se ne koristi.
-- Vraća { rate, source, ref } (source i ref isti kao u rates.js), ili { error: 'missing' }, ili
-- { error: 'unit', source, ref, amount, currency, unit } kad pobednik nije EUR po satu (bez prelaska na sledeći nivo).
create or replace function public.resolve_timesheet_rate(p_side text, p_employee_id uuid, p_project_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_field text;            -- polje u assigned_employees / job_roles
  v_order text[];
  v_project public.projects;
  v_project_id uuid;
  v_assigned jsonb := '[]';
  v_roles jsonb := '[]';
  v_assignment_ids uuid[] := '{}';
  v_position text := '';
  v_source text;
  v_hit jsonb;
begin
  if p_side = 'worker' then
    v_kind := 'cost';
    v_field := 'b2c_rate';
    v_order := array['assignment_rate', 'project_employee', 'project_rate', 'employee_rate', 'profile'];
  elsif p_side = 'client' then
    v_kind := 'revenue';
    v_field := 'b2b_rate';
    v_order := array['assignment_rate', 'project_employee', 'project_rate', 'job_role', 'employee_rate', 'profile'];
  else
    raise exception 'Nepoznata strana tarife: %', p_side;
  end if;
  if p_date is null then raise exception 'Nedostaje datum rada za izbor tarife'; end if;
  if p_employee_id is null then raise exception 'Nedostaje radnik za izbor tarife'; end if;

  if p_project_id is not null then
    select * into v_project from public.projects p where p.id = p_project_id;
    v_project_id := v_project.id; -- projekat koji ne postoji = bez projekta (kao project?.id u rates.js)
  end if;

  if v_project_id is not null then
    -- Radnik na spisku projekta (redosled iz JSON niza).
    select coalesce(jsonb_agg(e.value order by e.ord), '[]') into v_assigned
    from jsonb_array_elements(case when jsonb_typeof(v_project.assigned_employees) = 'array'
                                   then v_project.assigned_employees else '[]' end) with ordinality e(value, ord)
    where e.value ->> 'employee_id' = p_employee_id::text;
    v_roles := case when jsonb_typeof(v_project.job_roles) = 'array' then v_project.job_roles else '[]' end;

    -- Dodele ovog radnika na ovom projektu koje važe tog dana.
    select coalesce(array_agg(a.id), '{}') into v_assignment_ids
    from public.project_assignments a
    where a.employee_id = p_employee_id and a.project_id = v_project_id and a.status <> 'cancelled'
      and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date);

    v_position := coalesce(
      (select public.rate_trim(a.position) from public.project_assignments a
       where a.id = any (v_assignment_ids) and public.rate_trim(a.position) <> ''
       order by a.start_date desc, a.id limit 1),
      (select public.rate_trim(e.value ->> 'position') from jsonb_array_elements(v_assigned) with ordinality e(value, ord)
       where public.rate_trim(e.value ->> 'position') <> '' order by e.ord limit 1),
      '');
  end if;

  foreach v_source in array v_order loop
    v_hit := null;

    if v_source = 'assignment_rate' then
      select jsonb_build_object('rate', round(r.amount, 2), 'ref', r.id::text, 'amount', r.amount,
                                'currency', r.currency, 'unit', r.unit) into v_hit
      from public.rates r
      where r.status = 'active' and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
        and r.amount > 0 and r.scope = 'assignment' and r.kind = v_kind and r.assignment_id = any (v_assignment_ids)
        and (r.employee_id is null or r.employee_id = p_employee_id)
      order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;

    elsif v_source = 'project_employee' then
      select jsonb_build_object('rate', public.rate_value(e.value -> v_field),
                                'ref', format('project:%s:employee:%s', v_project_id, p_employee_id),
                                'currency', 'EUR', 'unit', 'hourly') into v_hit
      from jsonb_array_elements(v_assigned) with ordinality e(value, ord)
      where public.rate_value(e.value -> v_field) is not null
      order by e.ord limit 1;

    elsif v_source = 'project_rate' and v_project_id is not null then
      -- Tarifa za poziciju radnika (ako je ima), pa tek onda tarifa za ceo projekat (bez pozicije).
      select jsonb_build_object('rate', round(r.amount, 2), 'ref', r.id::text, 'amount', r.amount,
                                'currency', r.currency, 'unit', r.unit) into v_hit
      from public.rates r
      where r.status = 'active' and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
        and r.amount > 0 and r.scope = 'project' and r.kind = v_kind and r.project_id = v_project_id
        and (r.employee_id is null or r.employee_id = p_employee_id)
        and ((v_position <> '' and public.rate_trim(r.position) = v_position) or public.rate_trim(r.position) = '')
      order by (public.rate_trim(r.position) <> '') desc, r.effective_from desc, r.created_date desc,
               r.id::text collate "C"
      limit 1;

    elsif v_source = 'job_role' and v_project_id is not null and v_position <> '' then
      select jsonb_build_object('rate', public.rate_value(j.value -> v_field),
                                'ref', format('project:%s:job_role:%s', v_project_id, v_position),
                                'currency', 'EUR', 'unit', 'hourly') into v_hit
      from jsonb_array_elements(v_roles) with ordinality j(value, ord)
      where public.rate_trim(j.value ->> 'title') = v_position and public.rate_value(j.value -> v_field) is not null
      order by j.ord limit 1;

    elsif v_source = 'employee_rate' then
      select jsonb_build_object('rate', round(r.amount, 2), 'ref', r.id::text, 'amount', r.amount,
                                'currency', r.currency, 'unit', r.unit) into v_hit
      from public.rates r
      where r.status = 'active' and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
        and r.amount > 0 and r.scope = 'employee' and r.kind = v_kind and r.employee_id = p_employee_id
      order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;

    elsif v_source = 'profile' then
      select jsonb_build_object('rate', round(x.rate, 2), 'ref', format('employee:%s:profile', p_employee_id),
                                'currency', 'EUR', 'unit', 'hourly') into v_hit
      from (select case when p_side = 'worker' then ep.b2c_hourly_rate else ep.b2b_hourly_rate end as rate
            from public.employee_private ep where ep.employee_id = p_employee_id) x
      where x.rate > 0;
    end if;

    if v_hit is not null then
      if v_hit ->> 'currency' <> 'EUR' or v_hit ->> 'unit' <> 'hourly' then
        return jsonb_build_object('error', 'unit', 'source', v_source, 'ref', v_hit ->> 'ref', 'amount', v_hit -> 'amount',
                                  'currency', v_hit ->> 'currency', 'unit', v_hit ->> 'unit');
      end if;
      return jsonb_build_object('rate', v_hit -> 'rate', 'source', v_source, 'ref', v_hit ->> 'ref');
    end if;
  end loop;

  return jsonb_build_object('error', 'missing');
end $$;

-- ───────────── poruka kad tarifa reda nije važeća tarifa ─────────────
-- null = tarife reda su tačno one iz jedinstvenog izbora. Kao resolveRates: tarifa koja nije EUR po satu ima prednost
-- nad tarifom koja fali (radnik pa klijent); zatim tarifa koja fali; zatim tarifa reda koja se razlikuje.
create or replace function public.timesheet_rate_problem(p_b2c numeric, p_b2b numeric, p_worker jsonb, p_client jsonb,
                                                        p_date date)
returns text
language plpgsql stable set search_path = '' as $$
declare
  s record;
  v_missing text[] := '{}';
  v_source_label constant jsonb := '{"assignment_rate": "tarifa angažmana", "project_employee": "satnica radnika na projektu",
    "project_rate": "tarifa projekta/pozicije", "job_role": "zanimanje na projektu", "employee_rate": "tarifa radnika",
    "profile": "profil radnika"}';
  v_unit_label constant jsonb := '{"hourly": "po satu", "daily": "po danu", "weekly": "nedeljno", "monthly": "mesečno"}';
begin
  for s in
    select v.label, v.res, v.rate
    from (values (1, 'radnika', p_worker, p_b2c), (2, 'klijenta', p_client, p_b2b)) as v(ord, label, res, rate)
    order by v.ord
  loop
    if s.res ->> 'error' = 'unit' then
      return format('Važeća tarifa %s (izvor: %s) je %s %s %s — odobravanje prima samo EUR po satu; ispravite tu tarifu u Tarife i dodele',
        s.label, coalesce(v_source_label ->> (s.res ->> 'source'), s.res ->> 'source'),
        replace(to_char((s.res ->> 'amount')::numeric, 'FM9999999990.00'), '.', ','), s.res ->> 'currency',
        coalesce(v_unit_label ->> (s.res ->> 'unit'), s.res ->> 'unit'));
    end if;
    if s.res ->> 'error' = 'missing' or s.res ->> 'rate' is null then
      v_missing := v_missing || s.label;
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    return format('Nema važeće tarife %s za nedelju od %s — satnica ne može da se odobri',
      array_to_string(v_missing, ' ni '), to_char(p_date, 'DD.MM.YYYY'));
  end if;

  for s in
    select v.label, v.res, v.rate
    from (values (1, 'radnika', p_worker, p_b2c), (2, 'klijenta', p_client, p_b2b)) as v(ord, label, res, rate)
    order by v.ord
  loop
    if s.rate is distinct from (s.res ->> 'rate')::numeric then
      return format('Tarifa %s (%s) ne odgovara važećoj tarifi (%s, izvor: %s) — osvežite stranicu i odobrite ponovo',
        s.label, coalesce(replace(to_char(s.rate, 'FM9999999990.00'), '.', ','), 'prazno'),
        replace(to_char((s.res ->> 'rate')::numeric, 'FM9999999990.00'), '.', ','),
        coalesce(v_source_label ->> (s.res ->> 'source'), s.res ->> 'source'));
    end if;
  end loop;

  return null;
end $$;

-- Tarife (i profil radnika) sme da vidi samo admin (D3) — ove funkcije se pozivaju samo iz guard_timesheet.
revoke execute on function public.rate_trim(text), public.rate_value(jsonb),
  public.resolve_timesheet_rate(text, uuid, uuid, date),
  public.timesheet_rate_problem(numeric, numeric, jsonb, jsonb, date) from public, anon, authenticated;

-- ───────────── satnica ─────────────
-- Isto kao u 20261114150000_satnice_vrste_sati.sql, uz proveru tarife pri odobravanju i izvor tarife iz baze.
create or replace function public.guard_timesheet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := public.is_admin();
  v_locked date;
  v_threshold numeric;
  v_amounts jsonb;
  v_missing text;
  v_worker jsonb;
  v_client jsonb;
  v_problem text;
begin
  -- Osvežavanje samo imena za prikaz (preimenovan projekat/klijent) prolazi i kroz zaključan mesec.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.snapshot_sync', true), '') = 'on'
     and (new.employee_id, new.project_id, new.week_start, new.mon_hours, new.tue_hours, new.wed_hours,
          new.thu_hours, new.fri_hours, new.sat_hours, new.sun_hours, new.b2c_rate, new.b2b_rate,
          new.worker_cost, new.client_revenue, new.hours_by_type, new.rate_snapshot, new.approval_status)
         is not distinct from
         (old.employee_id, old.project_id, old.week_start, old.mon_hours, old.tue_hours, old.wed_hours,
          old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours, old.b2c_rate, old.b2b_rate,
          old.worker_cost, old.client_revenue, old.hours_by_type, old.rate_snapshot, old.approval_status) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select date_trunc('month', d.work_date)::date into v_locked
    from public.timesheet_days(old) d where public.month_is_locked(d.work_date) limit 1;
    if v_locked is not null then
      raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
    end if;
    if old.approval_status = 'approved' then
      if tg_op = 'DELETE' then
        raise exception 'Odobrena satnica ne može da se obriše; prvo je vratite u nacrt' using errcode = 'check_violation';
      end if;
      if not v_admin then
        raise exception 'Odobrenu satnicu može da menja samo admin' using errcode = '42501';
      end if;
      -- hours_by_type, iznosi i rate_snapshot odobrenog reda su snimak baze — ne porede se, nego se zadržavaju (niže).
      if new.approval_status = 'approved' and (
           (new.employee_id, new.project_id, new.week_start, new.mon_hours, new.tue_hours, new.wed_hours,
            new.thu_hours, new.fri_hours, new.sat_hours, new.sun_hours, new.b2c_rate, new.b2b_rate)
           is distinct from
           (old.employee_id, old.project_id, old.week_start, old.mon_hours, old.tue_hours, old.wed_hours,
            old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours, old.b2c_rate, old.b2b_rate)) then
        raise exception 'Odobrena satnica se ne menja; prvo je vratite u nacrt' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select date_trunc('month', d.work_date)::date into v_locked
  from public.timesheet_days(new) d where public.month_is_locked(d.work_date) limit 1;
  if v_locked is not null then
    raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
  end if;

  -- Projekat upisan imenom dobija project_id ako je ime jednoznačno.
  if new.project_id is null and new.project is not null then
    select p.id into new.project_id from public.projects p where p.name = new.project
    and (select count(*) from public.projects p2 where p2.name = new.project) = 1;
  end if;

  new.total_hours := new.mon_hours + new.tue_hours + new.wed_hours + new.thu_hours
                   + new.fri_hours + new.sat_hours + new.sun_hours;

  if tg_op = 'UPDATE' and old.approval_status = 'approved' and new.approval_status = 'approved' then
    -- Odobrena satnica zadržava ono što je odobreno: kasnija promena tarife, koeficijenta, posebne satnice,
    -- dnevnog praga ili praznika je ne menja (D10). Važi i za redove odobrene pre ove migracije.
    new.hours_by_type := old.hours_by_type;
    new.overtime_hours := old.overtime_hours;
    new.worker_cost := old.worker_cost;
    new.client_revenue := old.client_revenue;
    new.profit := old.profit;
    new.rate_snapshot := old.rate_snapshot;
  else
    -- Sate razvrstava i iznose računa baza; vrednosti koje pošalje ekran se ignorišu (D16).
    select w.daily_regular_hours into v_threshold from public.work_rules w where w.id;
    v_threshold := coalesce(v_threshold, 8); -- isto kao podrazumevani prag u hours.js i work_rules
    new.hours_by_type := public.timesheet_hours_by_type(new, v_threshold);
    new.overtime_hours := (new.hours_by_type ->> 'prekovremeni')::numeric;
    v_amounts := public.timesheet_amounts(new, new.hours_by_type);
    new.worker_cost := (v_amounts ->> 'worker_cost')::numeric;
    new.client_revenue := (v_amounts ->> 'client_revenue')::numeric;
    new.profit := case when new.worker_cost is null or new.client_revenue is null then null
                       else new.client_revenue - new.worker_cost end;
  end if;

  if new.approval_status = 'rejected' and (tg_op = 'INSERT' or old.approval_status <> 'rejected') and not v_admin then
    raise exception 'Satnicu može da odbije samo admin' using errcode = '42501';
  end if;

  if new.approval_status = 'approved' and (tg_op = 'INSERT' or old.approval_status <> 'approved') then
    if not v_admin then
      raise exception 'Satnicu može da odobri samo admin' using errcode = '42501';
    end if;
    if coalesce(new.b2c_rate, 0) <= 0 or coalesce(new.b2b_rate, 0) <= 0 then
      raise exception 'Satnica nema tarifu radnika ili klijenta (ili je 0) i ne može da se odobri' using errcode = 'check_violation';
    end if;
    if new.project_id is null then
      raise exception 'Satnica mora biti vezana za projekat sa liste da bi se odobrila' using errcode = 'check_violation';
    end if;
    -- Tarifa reda mora biti baš ona iz jedinstvenog izbora tarife (D4) za nedelju reda — ne broj koji je neko upisao
    -- u nacrt mimo Tarifa (D3: operater preko API-ja). Isti datum kao approvalPayload (week_start).
    v_worker := public.resolve_timesheet_rate('worker', new.employee_id, new.project_id, new.week_start);
    v_client := public.resolve_timesheet_rate('client', new.employee_id, new.project_id, new.week_start);
    v_problem := public.timesheet_rate_problem(new.b2c_rate, new.b2b_rate, v_worker, v_client, new.week_start);
    if v_problem is not null then
      raise exception '%', v_problem using errcode = 'check_violation';
    end if;
    select string_agg(m.what, ', ') into v_missing from jsonb_array_elements_text(v_amounts -> 'missing_coefs') as m(what);
    if v_missing is not null then
      raise exception 'Nedostaje koeficijent za vrstu sati: % — admin ga upisuje u Koeficijenti i praznici', v_missing
        using errcode = 'check_violation';
    end if;
    if new.worker_cost is null or new.client_revenue is null then
      -- Ne bi smelo da se desi (tarife > 0 i koeficijenti postoje), ali odobren red nikad nema prazan iznos.
      raise exception 'Satnica nema potpun obračun i ne može da se odobri' using errcode = 'check_violation';
    end if;

    -- Snimak u trenutku odobravanja upisuje baza: tarife reda (= važeće tarife) sa izvorom i oznakom iz izbora
    -- tarife u bazi, koeficijenti, posebne satnice, prag i praznici. rate_snapshot sa ekrana se ignoriše.
    new.rate_snapshot := jsonb_build_object(
      'worker', jsonb_build_object('rate', new.b2c_rate, 'source', v_worker ->> 'source', 'ref', v_worker ->> 'ref'),
      'client', jsonb_build_object('rate', new.b2b_rate, 'source', v_client ->> 'source', 'ref', v_client ->> 'ref'),
      'daily_regular_hours', trim_scale(v_threshold),
      'holidays', (select coalesce(jsonb_agg(h.date order by h.date), '[]'::jsonb) from public.holidays h
                   where h.date between new.week_start and new.week_start + 6),
      'lines', v_amounts -> 'lines',
      'approved_at', now());
    new.approved_by := auth.uid();
    new.approved_date := now();
  elsif new.approval_status <> 'approved' then
    new.approved_by := null;
    new.approved_date := null;
    new.rate_snapshot := null; -- snimak postoji samo za odobren red; nacrt se računa po važećim pravilima
  end if;

  return new;
end $$;
