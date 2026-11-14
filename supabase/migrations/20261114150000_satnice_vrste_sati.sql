-- Faza 2: satnica po vrstama sati (D5, D16). Baza sama razvrstava sate i računa iznose — ekran samo bira tarifu.
--  * hours_by_type uvek računa baza (isto pravilo kao classifyWeek u src/lib/payroll/hours.js):
--    praznik (public.holidays, i kad padne vikendom) → vikend (subota, nedelja) → radni dan: do dnevnog praga
--    (work_rules.daily_regular_hours) redovno, preko praga prekovremeno. overtime_hours = prekovremeni sati
--    (više nije „preko 40h"). hours_by_type koji pošalje ekran se ignoriše.
--  * iznosi uvek iz hours_by_type × tarifa (isto pravilo kao timesheetAmountsByType u hours.js):
--    radnik = sati × posebna satnica iz profila (prekovremeni/vikend/praznik, ako je > 0), inače sati × b2c × koef. radnika;
--    klijent = sati × b2b × koef. klijenta. Zaokruženo na cent po vrsti, pa zbir. Strana kojoj fali tarifa ili
--    koeficijent ima prazan iznos (nikad 0) — nacrt se i dalje čuva, ali odobravanje to odbija sa jasnom porukom.
--  * pri odobravanju baza upisuje rate_snapshot: tarife (izvor i oznaku šalje ekran iz resolveRates), korišćene
--    koeficijente i posebne satnice po vrsti, dnevni prag i praznike te nedelje. Odobren red se više ne preračunava,
--    pa kasnija promena tarife, koeficijenta, praga ili praznika ne menja odobrenu satnicu (D10).
-- Postojeći redovi se ovde ne diraju; nacrt dobija novo računanje pri sledećoj izmeni, odobren red ostaje kakav je.

-- ───────────── vrste sati jedne satnice ─────────────
create or replace function public.timesheet_hours_by_type(t public.timesheets, p_daily_threshold numeric)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'redovni', trim_scale(coalesce(sum(least(d.h, p_daily_threshold)) filter (where d.kind = 'radni'), 0)),
    'prekovremeni', trim_scale(coalesce(sum(greatest(d.h - p_daily_threshold, 0)) filter (where d.kind = 'radni'), 0)),
    'vikend', trim_scale(coalesce(sum(d.h) filter (where d.kind = 'vikend'), 0)),
    'praznik', trim_scale(coalesce(sum(d.h) filter (where d.kind = 'praznik'), 0)))
  from (
    select v.h,
      case when exists (select 1 from public.holidays ho where ho.date = t.week_start + v.i) then 'praznik' -- pobeđuje i vikend
           when v.i >= 5 then 'vikend'                                                                    -- subota, nedelja
           else 'radni' end as kind
    from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
                 (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) as v(i, h)
    where coalesce(v.h, 0) > 0
  ) d
$$;

-- ───────────── iznosi po vrsti sati ─────────────
-- Vraća { lines, worker_cost, client_revenue, missing_coefs }. worker_cost / client_revenue su null kad toj strani
-- fali tarifa ili koeficijent; missing_coefs su npr. ["vikend (radnik)", "vikend (klijent)"].
create or replace function public.timesheet_amounts(t public.timesheets, p_hours jsonb)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r record;
  v_special numeric;
  v_cost numeric;
  v_revenue numeric;
  v_cost_sum numeric := 0;
  v_revenue_sum numeric := 0;
  v_cost_ok boolean := true;
  v_revenue_ok boolean := true;
  v_missing text[] := '{}';
  v_lines jsonb := '[]';
begin
  for r in
    select c.code, coalesce((p_hours ->> c.code)::numeric, 0) as hours, ht.worker_coef, ht.client_coef,
      case c.code when 'prekovremeni' then ep.overtime_rate
                  when 'vikend' then ep.weekend_rate
                  when 'praznik' then ep.holiday_rate end as special -- redovni nema posebnu satnicu
    from (values (1, 'redovni'), (2, 'prekovremeni'), (3, 'vikend'), (4, 'praznik')) as c(ord, code)
    left join public.hour_types ht on ht.code = c.code
    left join public.employee_private ep on ep.employee_id = t.employee_id
    order by c.ord
  loop
    continue when r.hours = 0; -- vrsta bez sati ne traži ni koeficijent ni tarifu

    v_special := case when r.special > 0 then r.special end;
    -- Prazan koeficijent NIJE 1,00 (D5); posebna satnica pokriva samo stranu radnika.
    if v_special is null and r.worker_coef is null then
      v_missing := v_missing || (r.code || ' (radnik)');
    end if;
    if r.client_coef is null then
      v_missing := v_missing || (r.code || ' (klijent)');
    end if;

    v_cost := case when v_special is not null then round(r.hours * v_special, 2)
                   when r.worker_coef is not null and t.b2c_rate > 0 then round(r.hours * t.b2c_rate * r.worker_coef, 2) end;
    v_revenue := case when r.client_coef is not null and t.b2b_rate > 0 then round(r.hours * t.b2b_rate * r.client_coef, 2) end;

    v_cost_ok := v_cost_ok and v_cost is not null;
    v_revenue_ok := v_revenue_ok and v_revenue is not null;
    v_cost_sum := v_cost_sum + coalesce(v_cost, 0);
    v_revenue_sum := v_revenue_sum + coalesce(v_revenue, 0);

    v_lines := v_lines || jsonb_build_object(
      'code', r.code,
      'hours', trim_scale(r.hours),
      'worker_source', case when v_special is not null then 'special' else 'coef' end,
      'worker_rate', coalesce(v_special, t.b2c_rate),
      'worker_coef', case when v_special is null then trim_scale(r.worker_coef) end,
      'special_rate', v_special,
      'client_rate', t.b2b_rate,
      'client_coef', trim_scale(r.client_coef),
      'worker_cost', v_cost,
      'client_revenue', v_revenue);
  end loop;

  return jsonb_build_object(
    'lines', v_lines,
    'worker_cost', case when v_cost_ok then v_cost_sum end,
    'client_revenue', case when v_revenue_ok then v_revenue_sum end,
    'missing_coefs', to_jsonb(v_missing));
end $$;

revoke execute on function public.timesheet_hours_by_type(public.timesheets, numeric),
  public.timesheet_amounts(public.timesheets, jsonb) from public, anon, authenticated;

-- ───────────── satnica ─────────────
create or replace function public.guard_timesheet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := public.is_admin();
  v_locked date;
  v_threshold numeric;
  v_amounts jsonb;
  v_missing text;
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
    select string_agg(m.what, ', ') into v_missing from jsonb_array_elements_text(v_amounts -> 'missing_coefs') as m(what);
    if v_missing is not null then
      raise exception 'Nedostaje koeficijent za vrstu sati: % — admin ga upisuje u Koeficijenti i praznici', v_missing
        using errcode = 'check_violation';
    end if;
    if new.worker_cost is null or new.client_revenue is null then
      -- Ne bi smelo da se desi (tarife > 0 i koeficijenti postoje), ali odobren red nikad nema prazan iznos.
      raise exception 'Satnica nema potpun obračun i ne može da se odobri' using errcode = 'check_violation';
    end if;

    -- Snimak u trenutku odobravanja. Od ekrana se uzimaju samo izvor i oznaka tarife (resolveRates);
    -- tarifa u snimku je uvek ona iz reda (b2c_rate / b2b_rate), a sve ostalo upisuje baza.
    new.rate_snapshot := jsonb_build_object(
      'worker', jsonb_build_object('rate', new.b2c_rate,
        'source', new.rate_snapshot #>> '{worker,source}', 'ref', new.rate_snapshot #>> '{worker,ref}'),
      'client', jsonb_build_object('rate', new.b2b_rate,
        'source', new.rate_snapshot #>> '{client,source}', 'ref', new.rate_snapshot #>> '{client,ref}'),
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
