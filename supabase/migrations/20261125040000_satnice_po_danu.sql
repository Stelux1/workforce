-- Phase 7, T-A2 (docs/TEAMORA-DATA-MODEL.md §2.6; spec §6.01–6.06, §5.10, D30 K3/K11/K12, §15.03):
-- satnice po danu rada, intervali rada, tok statusa po pravima, korekcija uz razlog i vidljivost novca.
--
--  * timesheets: dodela (assignment_id, obavezna za Submit/Approve), valuta po strani, ko/kad je poslao i odbio,
--    calc_problems (bez iznosa — vidljivo svima), estimate_days (procena neodobrenog reda), broj i razlog korekcija.
--    Jedan red po (radnik, projekat, dodela, nedelja) — prelazak usred nedelje daje dva reda.
--  * timesheet_entries: opcioni intervali rada po danu (početak/kraj ili smena, pauza); isti radnik ne sme imati
--    preklopljene intervale ni na različitim projektima (T10). Dan sa unosima = zbir unosa (sinhronizuje baza).
--  * work_rules.max_daily_hours: zbir sati radnika u jednom danu preko svih projekata (spec §6).
--  * guard_timesheet v4: prava (timesheets.edit / approve; vraćanje odobrenog samo reopen_timesheet uz
--    timesheets.correct), tarifa PO DATUMU RADA kroz resolve_rate (K12, T07), koeficijent iz hour_types,
--    snimak v2 sa dnevnim linijama. Vrednosti tarifa koje pošalje ekran se ignorišu.
--  * reopen_timesheet: korekcija odobrene satnice uz razlog i audit 'correction' (K11).
--  * labor_day_lines / labor_day_problems: jedan izvor dnevnih linija odobrenih sati (v1 i v2) za Payables i Billing.
--  * T26: iznosi i tarife satnice nisu u column grant-u; čitaju se kroz view timesheet_money sa maskom po pravu.
--
-- Postojeći podaci (D10): odobrene satnice i njihovi snimci (v1) se ne menjaju. Jedini backfill nad odobrenim redom je
-- assignment_id (null → vrednost) uz app.migration_backfill, bez korisnika. Nejednoznačni redovi ostaju bez dodele i
-- idu u migration_report. Neodobreni redovi dobijaju preračun (procena, problemi) po važećim pravilima.
-- Idempotentno: drugo pokretanje ne menja ništa.

-- ═════════════════════════════ 1. kolone ═════════════════════════════
alter table public.work_rules add column if not exists max_daily_hours numeric(4, 2) not null default 24;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'work_rules_max_daily_hours_check') then
    alter table public.work_rules add constraint work_rules_max_daily_hours_check
      check (max_daily_hours > 0 and max_daily_hours <= 24);
  end if;
end $$;
comment on column public.work_rules.max_daily_hours is
  'najviše sati radnika u jednom danu, zbir svih ne-odbijenih satnica i projekata (spec §6); menja admin u Koeficijenti i praznici';

alter table public.timesheets
  add column if not exists assignment_id uuid references public.project_assignments (id) on delete restrict,
  add column if not exists worker_currency text not null default 'EUR',
  add column if not exists client_currency text not null default 'EUR',
  add column if not exists submitted_by uuid references auth.users (id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists rejected_by uuid references auth.users (id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists calc_problems jsonb,
  add column if not exists estimate_days jsonb,
  add column if not exists correction_count integer not null default 0,
  add column if not exists last_correction_reason text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'timesheets_worker_currency_check') then
    alter table public.timesheets add constraint timesheets_worker_currency_check
      check (worker_currency in ('EUR', 'RSD', 'GBP', 'USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'timesheets_client_currency_check') then
    alter table public.timesheets add constraint timesheets_client_currency_check
      check (client_currency in ('EUR', 'RSD', 'GBP', 'USD'));
  end if;
end $$;
create index if not exists timesheets_assignment_idx on public.timesheets (assignment_id);
create index if not exists timesheets_employee_week_idx on public.timesheets (employee_id, week_start);

comment on column public.timesheets.assignment_id is 'dodela (project_assignments) na koju se beleže sati; obavezna za Submit i Approve';
comment on column public.timesheets.calc_problems is
  'null = obračun reda je potpun; inače [{code, date?, side?, detail?}] bez iznosa (assignment_missing, assignment_ambiguous, outside_assignment, rate_missing, rate_unit, coef_missing, mixed_currency, no_project)';
comment on column public.timesheets.estimate_days is 'procena neodobrenog reda: dnevne linije po važećim pravilima (timesheet_day_lines); nije konačan obračun';
comment on column public.timesheets.b2c_rate is 'izvedeno: tarifa radnika ako je ista za sve dane nedelje, inače null (rate_snapshot.worker.mixed)';
comment on column public.timesheets.b2b_rate is 'izvedeno: tarifa klijenta ako je ista za sve dane nedelje, inače null (rate_snapshot.client.mixed)';

-- Jedan red po radniku, projektu, dodeli i nedelji (transfer usred nedelje na istom projektu = dva reda).
drop index if exists public.timesheets_one_per_week;
create unique index if not exists timesheets_one_per_assignment_week
  on public.timesheets (employee_id, project_id, assignment_id, week_start) nulls not distinct
  where project_id is not null;

-- ═════════════════════════════ 2. intervali rada ═════════════════════════════
create extension if not exists btree_gist with schema extensions;

create table if not exists public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.timesheets (id) on delete cascade,
  employee_id uuid not null,                 -- denormalizovano iz reda (trigger), za proveru preklapanja
  project_id uuid,
  assignment_id uuid,
  work_date date not null,                   -- mora biti u nedelji reda
  shift_id uuid references public.shifts (id) on delete set null,
  start_time time,
  end_time time,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  hours numeric(5, 2) not null check (hours > 0 and hours <= 24),
  work_interval tsrange generated always as (
    case when start_time is not null and end_time is not null then
      tsrange(work_date + start_time,
              work_date + end_time + case when end_time <= start_time then interval '1 day' else interval '0' end, '[)')
    end) stored,
  counts boolean not null default true,      -- false dok je red odbijen (trigger sa reda)
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint timesheet_entries_times check ((start_time is null) = (end_time is null)),
  constraint timesheet_entries_no_overlap exclude using gist
    (employee_id with =, work_interval with &&) where (counts and work_interval is not null)
);
create index if not exists timesheet_entries_timesheet_idx on public.timesheet_entries (timesheet_id, work_date);
create index if not exists timesheet_entries_employee_idx on public.timesheet_entries (employee_id, work_date);
comment on table public.timesheet_entries is
  'intervali rada po danu (spec §6, T10): dan sa unosima = zbir sati unosa; preklapanje intervala istog radnika se odbija';

drop trigger if exists timesheet_entries_updated on public.timesheet_entries;
create trigger timesheet_entries_updated before update on public.timesheet_entries
  for each row execute function public.set_updated_date();

-- ═════════════════════════════ 3. pomoćne funkcije ═════════════════════════════
-- Problem obračuna reda (bez iznosa): { code, date?, side?, detail? }.
create or replace function public.timesheet_problem(p_code text, p_date date default null, p_side text default null,
  p_detail text default null) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('code', p_code, 'date', p_date, 'side', p_side, 'detail', p_detail))
$$;

-- Dani nedelje sa satima (indeks 0–6, datum, sati).
create or replace function public.timesheet_day_hours(t public.timesheets) returns table (i int, work_date date, hours numeric)
language sql immutable set search_path = '' as $$
  select d.i, (t.week_start + d.i)::date, d.h
  from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
               (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) as d(i, h)
  where coalesce(d.h, 0) > 0
$$;

-- Dodela koja pokriva sve dane sa satima (ili, bez sati, bar jedan dan nedelje): { id } ili { problem }.
create or replace function public.timesheet_pick_assignment(t public.timesheets) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_has_hours boolean := exists (select 1 from public.timesheet_day_hours(t));
begin
  if t.project_id is null then return jsonb_build_object('problem', 'no_project'); end if;
  select coalesce(array_agg(a.id order by a.start_date desc, a.id), '{}') into v_ids
  from public.project_assignments a
  where a.employee_id = t.employee_id and a.project_id = t.project_id and a.status <> 'cancelled'
    and case when v_has_hours then
          not exists (select 1 from public.timesheet_day_hours(t) d
                      where d.work_date < a.start_date or (a.end_date is not null and d.work_date > a.end_date))
        else a.start_date <= t.week_start + 6 and (a.end_date is null or a.end_date >= t.week_start) end;
  if cardinality(v_ids) = 1 then return jsonb_build_object('id', v_ids[1]); end if;
  return jsonb_build_object('problem', case when cardinality(v_ids) = 0 then 'assignment_missing' else 'assignment_ambiguous' end);
end $$;

-- ───────────── dnevne linije reda po važećim pravilima (K12) ─────────────
-- Vraća { days: [linije], problems: [...] }. Linija dana:
--   { date, code, hours, project_role_id, worker: { rate, currency, source, ref, coef, from? }, client: {…},
--     worker_cost, client_revenue }
-- Dan se razvrstava kao timesheet_hours_by_type (D29): praznik u subotu/nedelju → praznik_vikend, praznik → praznik,
-- vikend → vikend, radni dan → redovno do praga i prekovremeno preko praga. Tarifa dana: resolve_rate(strana, radnik,
-- projekat, datum, dodela); koeficijent: hour_types (praznik_vikend = veći od praznika i vikenda, jednaki → praznik).
-- Iznos linije = round(sati × tarifa × koeficijent, 2). Posebne satnice iz profila se više ne koriste (K5).
create or replace function public.timesheet_day_calc(t public.timesheets) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_threshold numeric;
  d record;
  s record;
  v_kind text;
  v_holiday boolean;
  v_parts jsonb;
  p jsonb;
  v_code text;
  v_hours numeric;
  v_res jsonb;
  v_side jsonb;
  v_sides jsonb;
  v_rate numeric;
  v_coef numeric;
  v_from text;
  v_c1 numeric;
  v_c2 numeric;
  v_amount numeric;
  v_role uuid;
  v_days jsonb := '[]';
  v_problems jsonb := '[]';
  v_assignment public.project_assignments;
begin
  select w.daily_regular_hours into v_threshold from public.work_rules w where w.id;
  v_threshold := coalesce(v_threshold, 8);
  if t.project_id is null then
    v_problems := v_problems || public.timesheet_problem('no_project');
  end if;
  if t.assignment_id is not null then
    select * into v_assignment from public.project_assignments a where a.id = t.assignment_id;
  end if;

  for d in select * from public.timesheet_day_hours(t) order by 1 loop
    v_holiday := exists (select 1 from public.holidays h where h.date = d.work_date);
    v_kind := case when v_holiday and d.i >= 5 then 'praznik_vikend' when v_holiday then 'praznik'
                   when d.i >= 5 then 'vikend' else 'radni' end;
    v_parts := case when v_kind = 'radni' then jsonb_build_array(
                       jsonb_build_object('code', 'redovni', 'hours', least(d.hours, v_threshold)),
                       jsonb_build_object('code', 'prekovremeni', 'hours', greatest(d.hours - v_threshold, 0)))
                    else jsonb_build_array(jsonb_build_object('code', v_kind, 'hours', d.hours)) end;

    if v_assignment.id is not null and (d.work_date < v_assignment.start_date
         or (v_assignment.end_date is not null and d.work_date > v_assignment.end_date)) then
      v_problems := v_problems || public.timesheet_problem('outside_assignment', d.work_date);
    end if;

    for p in select value from jsonb_array_elements(v_parts) loop
      v_code := p ->> 'code';
      v_hours := (p ->> 'hours')::numeric;
      continue when v_hours <= 0;
      v_sides := '{}';
      v_role := v_assignment.project_role_id;

      for s in select * from (values (1, 'worker'), (2, 'client')) as x(ord, side) order by ord loop
        -- tarifa dana
        v_rate := null;
        v_res := null;
        if t.project_id is not null then
          v_res := public.resolve_rate(s.side, t.employee_id, t.project_id, d.work_date, t.assignment_id);
          if v_res ? 'error' then
            if v_res ->> 'error' = 'unit' then
              v_problems := v_problems || public.timesheet_problem('rate_unit', d.work_date, s.side, v_res ->> 'unit');
            else
              v_problems := v_problems || public.timesheet_problem('rate_missing', d.work_date, s.side);
            end if;
          else
            v_rate := round((v_res ->> 'rate')::numeric, 2);
            v_role := coalesce(v_role, nullif(v_res ->> 'project_role_id', '')::uuid);
          end if;
        end if;
        -- koeficijent (prazan NIJE 1,00 — D5)
        v_from := null;
        if v_code = 'praznik_vikend' then
          select case when s.side = 'worker' then ht.worker_coef else ht.client_coef end into v_c1
            from public.hour_types ht where ht.code = 'praznik';
          select case when s.side = 'worker' then ht.worker_coef else ht.client_coef end into v_c2
            from public.hour_types ht where ht.code = 'vikend';
          if v_c1 is null then
            v_problems := v_problems || public.timesheet_problem('coef_missing', null, s.side, 'praznik');
          end if;
          if v_c2 is null then
            v_problems := v_problems || public.timesheet_problem('coef_missing', null, s.side, 'vikend');
          end if;
          if v_c1 is not null and v_c2 is not null then
            v_coef := greatest(v_c1, v_c2);
            v_from := case when v_c1 >= v_c2 then 'praznik' else 'vikend' end;
          else
            v_coef := null;
          end if;
        else
          select case when s.side = 'worker' then ht.worker_coef else ht.client_coef end into v_coef
            from public.hour_types ht where ht.code = v_code;
          if not found then v_coef := null; end if;
          if v_coef is null then
            v_problems := v_problems || public.timesheet_problem('coef_missing', null, s.side, v_code);
          end if;
        end if;

        v_amount := case when v_rate is not null and v_coef is not null then round(v_hours * v_rate * v_coef, 2) end;
        v_side := jsonb_build_object(
          'rate', v_rate,
          'currency', v_res ->> 'currency',
          'source', v_res ->> 'source',
          'ref', v_res ->> 'ref',
          'coef', trim_scale(v_coef));
        if v_from is not null then v_side := v_side || jsonb_build_object('from', v_from); end if;
        v_sides := v_sides || jsonb_build_object(s.side, v_side,
                     case when s.side = 'worker' then 'worker_cost' else 'client_revenue' end, v_amount);
      end loop;

      v_days := v_days || (jsonb_build_object('date', d.work_date, 'code', v_code, 'hours', trim_scale(v_hours),
                                              'project_role_id', v_role) || v_sides);
    end loop;
  end loop;

  -- Dve različite valute iste strane u istoj nedelji: iznos reda nema jednu valutu (K3).
  for s in select * from (values ('worker'), ('client')) as x(side) loop
    if (select count(distinct l -> s.side ->> 'currency') from jsonb_array_elements(v_days) l
        where l -> s.side ->> 'currency' is not null) > 1 then
      v_problems := v_problems || public.timesheet_problem('mixed_currency', null, s.side);
    end if;
  end loop;

  -- isti problem jednom (coef_missing se beleži po danu)
  select coalesce(jsonb_agg(x.p order by x.ord), '[]') into v_problems
  from (select distinct on (e.value) e.value as p, e.ord from jsonb_array_elements(v_problems) with ordinality e(value, ord)
        order by e.value, e.ord) x;

  return jsonb_build_object('days', v_days, 'problems', v_problems);
end $$;

-- Ugovor (§0): dnevne linije reda.
create or replace function public.timesheet_day_lines(t public.timesheets) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.timesheet_day_calc(t) -> 'days'
$$;

-- ───────────── maska novca u snimku/proceni (T26) ─────────────
-- Nulira stranu radnika (worker, worker_*, special_rate) bez rates.view_b2c, stranu klijenta (client, client_*) bez
-- rates.view_b2b i profit bez oba prava — u svim nivoima (vrh, days, lines).
create or replace function public.mask_money_json(p jsonb, p_b2c boolean, p_b2b boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb;
begin
  if p is null then return null; end if;
  if jsonb_typeof(p) = 'object' then
    select coalesce(jsonb_object_agg(e.key, case
        when (e.key in ('worker', 'special_rate') or e.key like 'worker\_%') and not p_b2c then 'null'::jsonb
        when (e.key = 'client' or e.key like 'client\_%') and not p_b2b then 'null'::jsonb
        when e.key = 'profit' and not (p_b2c and p_b2b) then 'null'::jsonb
        else public.mask_money_json(e.value, p_b2c, p_b2b) end), '{}'::jsonb)
      into v_out from jsonb_each(p) e;
    return v_out;
  elsif jsonb_typeof(p) = 'array' then
    select coalesce(jsonb_agg(public.mask_money_json(a.value, p_b2c, p_b2b) order by a.ord), '[]'::jsonb)
      into v_out from jsonb_array_elements(p) with ordinality a(value, ord);
    return v_out;
  end if;
  return p;
end $$;

create or replace function public.mask_rate_snapshot(p jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.mask_money_json(p, public.has_permission('rates.view_b2c'), public.has_permission('rates.view_b2b'))
$$;

-- Poruka problema obračuna za grešku pri Submit/Approve (bez iznosa).
create or replace function public.timesheet_problems_text(p jsonb) returns text
language sql immutable set search_path = '' as $$
  select string_agg(case x.code
      when 'no_project' then 'satnica nije vezana za projekat'
      when 'assignment_missing' then 'nema dodele radnika na projektu koja pokriva sve dane sa satima'
      when 'assignment_ambiguous' then 'više dodela pokriva ove dane — izaberite dodelu'
      when 'outside_assignment' then 'dani van dodele: ' || x.dates
      when 'rate_missing' then format('nema tarife %s za %s', case x.side when 'worker' then 'radnika (B2C)' else 'klijenta (B2B)' end, x.dates)
      when 'rate_unit' then format('tarifa %s nije po satu (%s) za %s', case x.side when 'worker' then 'radnika' else 'klijenta' end, x.detail, x.dates)
      when 'coef_missing' then format('nedostaje koeficijent %s (%s) — Podešavanja → Koeficijenti i praznici', x.detail,
                                      case x.side when 'worker' then 'radnik' else 'klijent' end)
      when 'mixed_currency' then format('tarife %s u istoj nedelji su u različitim valutama', case x.side when 'worker' then 'radnika' else 'klijenta' end)
      else x.code end, '; ' order by x.ord)
  from (
    select e.value ->> 'code' as code, e.value ->> 'side' as side, e.value ->> 'detail' as detail, min(e.ord) as ord,
           string_agg(to_char((e.value ->> 'date')::date, 'DD.MM.YYYY'), ', ' order by e.value ->> 'date') as dates
    from jsonb_array_elements(coalesce(p, '[]')) with ordinality e(value, ord)
    group by 1, 2, 3
  ) x
$$;

-- ═════════════════════════════ 4. guard_timesheet v4 ═════════════════════════════
create or replace function public.guard_timesheet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_system boolean := auth.uid() is null;                      -- postgres / migracija (bez korisnika)
  v_backfill boolean := auth.uid() is null and coalesce(current_setting('app.migration_backfill', true), '') = 'on';
  v_reopen boolean := coalesce(current_setting('app.timesheet_reopen', true), '') = 'on';
  v_entries_sync boolean := coalesce(current_setting('app.entries_sync', true), '') = 'on';
  v_from text;
  v_to text;
  v_hours_changed boolean;
  v_can_edit boolean;
  v_can_approve boolean;
  v_locked date;
  v_threshold numeric;
  v_max numeric;
  v_pick jsonb;
  v_calc jsonb;
  v_days jsonb;
  v_problems jsonb;
  v_a public.project_assignments;
  v_dayname text[] := array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  r record;
  v_w_rates numeric[];
  v_c_rates numeric[];
  v_w_cur text[];
  v_c_cur text[];
begin
  -- Osvežavanje samo imena za prikaz (preimenovan projekat/klijent) prolazi i kroz zaključan mesec.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.snapshot_sync', true), '') = 'on'
     and (to_jsonb(new) - array['project', 'client_name', 'employee_name', 'vendor_name', 'updated_date'])
         = (to_jsonb(old) - array['project', 'client_name', 'employee_name', 'vendor_name', 'updated_date']) then
    return new;
  end if;

  -- Backfill dodele (§1.3, R5): samo assignment_id null → vrednost, bez korisnika; ostatak reda se ne dira.
  if tg_op = 'UPDATE' and v_backfill and old.assignment_id is null and new.assignment_id is not null
     and (to_jsonb(new) - array['assignment_id', 'updated_date']) = (to_jsonb(old) - array['assignment_id', 'updated_date']) then
    return new;
  end if;

  v_from := case when tg_op = 'INSERT' then null else old.approval_status end;

  -- ───── brisanje ─────
  if tg_op = 'DELETE' then
    if not v_system and not (public.has_permission('timesheets.edit') and public.can_see_project(old.project_id)) then
      raise exception 'Nemate pravo da brišete satnice ovog projekta' using errcode = '42501';
    end if;
    if old.approval_status = 'approved' then
      raise exception 'Odobrena satnica ne može da se obriše; korekcija ide kroz vraćanje uz razlog' using errcode = 'check_violation';
    end if;
    select date_trunc('month', d.work_date)::date into v_locked
    from public.timesheet_days(old) d where public.month_is_locked(d.work_date) limit 1;
    if v_locked is not null then
      raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Projekat upisan imenom dobija project_id ako je ime jednoznačno.
  if new.project_id is null and new.project is not null then
    select p.id into new.project_id from public.projects p where p.name = new.project
    and (select count(*) from public.projects p2 where p2.name = new.project) = 1;
  end if;

  v_to := new.approval_status;
  v_can_edit := v_system or (public.has_permission('timesheets.edit') and public.can_see_project(new.project_id));
  v_can_approve := not v_system and public.has_permission('timesheets.approve') and public.can_see_project(new.project_id);
  v_hours_changed := tg_op = 'INSERT' or (new.employee_id, new.project_id, new.assignment_id, new.week_start,
      new.mon_hours, new.tue_hours, new.wed_hours, new.thu_hours, new.fri_hours, new.sat_hours, new.sun_hours)
    is distinct from (old.employee_id, old.project_id, old.assignment_id, old.week_start,
      old.mon_hours, old.tue_hours, old.wed_hours, old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours);

  -- ───── zaključan mesec (stari i novi dani) ─────
  if tg_op = 'UPDATE' then
    select date_trunc('month', d.work_date)::date into v_locked
    from public.timesheet_days(old) d where public.month_is_locked(d.work_date) limit 1;
    if v_locked is not null then
      raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
    end if;
  end if;
  select date_trunc('month', d.work_date)::date into v_locked
  from public.timesheet_days(new) d where public.month_is_locked(d.work_date) limit 1;
  if v_locked is not null then
    raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
  end if;

  -- ───── odobrena satnica je zaključana (D10, spec §6.05) ─────
  if v_from = 'approved' then
    if v_to = 'approved' then
      if not (v_can_approve or (not v_system and public.has_permission('timesheets.correct'))) then
        raise exception 'Nemate pravo da menjate odobrenu satnicu' using errcode = '42501';
      end if;
      if v_hours_changed or (new.affiliation_id, new.vendor_id) is distinct from (old.affiliation_id, old.vendor_id) then
        raise exception 'Odobrena satnica se ne menja; korekcija ide kroz vraćanje uz razlog (Reopen)' using errcode = 'check_violation';
      end if;
      -- iznosi, tarife, snimak i tok statusa ostaju onakvi kakvi su odobreni
      new.hours_by_type := old.hours_by_type;   new.overtime_hours := old.overtime_hours;
      new.total_hours := old.total_hours;       new.b2c_rate := old.b2c_rate;      new.b2b_rate := old.b2b_rate;
      new.worker_cost := old.worker_cost;       new.client_revenue := old.client_revenue; new.profit := old.profit;
      new.rate_snapshot := old.rate_snapshot;   new.worker_currency := old.worker_currency;
      new.client_currency := old.client_currency; new.calc_problems := old.calc_problems;
      new.estimate_days := old.estimate_days;   new.approved_by := old.approved_by; new.approved_date := old.approved_date;
      new.submitted_by := old.submitted_by;     new.submitted_at := old.submitted_at;
      new.correction_count := old.correction_count; new.last_correction_reason := old.last_correction_reason;
      return new;
    end if;
    if not v_reopen then
      raise exception 'Odobrena satnica se vraća u nacrt samo korekcijom uz razlog (Reopen)' using errcode = '42501';
    end if;
    if v_to <> 'draft' then
      raise exception 'Korekcija vraća satnicu u nacrt' using errcode = 'check_violation';
    end if;
  else
    -- ───── prelazi statusa i prava ─────
    if v_to in ('approved', 'rejected') and v_from is distinct from v_to then
      if not v_can_approve then
        raise exception 'Nemate pravo da odobravate ili odbijate satnice ovog projekta' using errcode = '42501';
      end if;
      if v_to = 'rejected' and v_from is distinct from 'submitted' then
        raise exception 'Odbiti se može samo poslata satnica' using errcode = 'check_violation';
      end if;
      if v_to = 'approved' and v_from = 'rejected' then
        raise exception 'Odbijenu satnicu prvo vratite u nacrt' using errcode = 'check_violation';
      end if;
      if v_hours_changed and tg_op = 'UPDATE' and not v_can_edit then
        raise exception 'Nemate pravo da menjate sate ove satnice' using errcode = '42501';
      end if;
    else
      if not v_can_edit and not (tg_op = 'UPDATE' and v_from = v_to and not v_hours_changed and v_can_approve) then
        raise exception 'Nemate pravo da unosite ili menjate satnice ovog projekta' using errcode = '42501';
      end if;
      if v_to = 'submitted' and v_from = 'rejected' then
        raise exception 'Odbijenu satnicu prvo vratite u nacrt' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- ───── ručna izmena dana koji ima intervale ─────
  if tg_op = 'UPDATE' and not v_entries_sync then
    if new.week_start is distinct from old.week_start
       and exists (select 1 from public.timesheet_entries e where e.timesheet_id = old.id) then
      raise exception 'Satnica ima intervale rada; nedelja se ne menja' using errcode = 'check_violation';
    end if;
    for r in
      select o.i, o.h as old_h, n.h as new_h
      from (select * from (values (0, old.mon_hours), (1, old.tue_hours), (2, old.wed_hours), (3, old.thu_hours),
                                  (4, old.fri_hours), (5, old.sat_hours), (6, old.sun_hours)) v(i, h)) o
      join (select * from (values (0, new.mon_hours), (1, new.tue_hours), (2, new.wed_hours), (3, new.thu_hours),
                                  (4, new.fri_hours), (5, new.sat_hours), (6, new.sun_hours)) v(i, h)) n using (i)
      where o.h is distinct from n.h
    loop
      if exists (select 1 from public.timesheet_entries e where e.timesheet_id = old.id and e.work_date = old.week_start + r.i) then
        raise exception 'Dan % ima intervale rada — sati se menjaju kroz intervale', to_char(old.week_start + r.i, 'DD.MM.YYYY')
          using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  new.total_hours := new.mon_hours + new.tue_hours + new.wed_hours + new.thu_hours
                   + new.fri_hours + new.sat_hours + new.sun_hours;

  -- ───── dodela ─────
  if new.assignment_id is not null then
    select * into v_a from public.project_assignments a where a.id = new.assignment_id;
    if v_a.id is null or v_a.employee_id <> new.employee_id or v_a.project_id is distinct from new.project_id then
      raise exception 'Dodela ne pripada ovom radniku i projektu' using errcode = 'check_violation';
    end if;
    if v_a.status = 'cancelled' then
      raise exception 'Dodela je otkazana; izaberite važeću dodelu' using errcode = 'check_violation';
    end if;
    v_pick := null;
  else
    v_pick := public.timesheet_pick_assignment(new);
    new.assignment_id := (v_pick ->> 'id')::uuid;
  end if;

  -- ───── dnevni zbir preko svih projekata (spec §6, T10) ─────
  select w.daily_regular_hours, w.max_daily_hours into v_threshold, v_max from public.work_rules w where w.id;
  v_threshold := coalesce(v_threshold, 8);
  v_max := coalesce(v_max, 24);
  if v_to <> 'rejected' and (v_hours_changed or v_from = 'rejected') then
    perform pg_advisory_xact_lock(hashtext('ts:' || new.employee_id::text));
    for r in
      select d.work_date, d.hours + coalesce(sum(o.hours), 0) as total,
             string_agg(distinct coalesce(p.name, o.project, '—'), ', ') as projects
      from public.timesheet_day_hours(new) d
      left join lateral (
        select x.hours, t2.project, t2.project_id
        from public.timesheets t2, lateral public.timesheet_day_hours(t2) x
        where t2.employee_id = new.employee_id and t2.week_start = new.week_start and t2.id <> new.id
          and t2.approval_status <> 'rejected' and x.work_date = d.work_date
      ) o on true
      left join public.projects p on p.id = o.project_id
      group by d.work_date, d.hours
      having d.hours + coalesce(sum(o.hours), 0) > v_max
      order by d.work_date
    loop
      raise exception 'Dnevni zbir sati za % bi bio % h (najviše % h u danu); ostali projekti tog dana: %',
        to_char(r.work_date, 'DD.MM.YYYY'), trim_scale(r.total), trim_scale(v_max), coalesce(r.projects, '—')
        using errcode = 'check_violation';
    end loop;
  end if;

  -- ───── vrste sati, dnevne linije, procena i problemi (računa baza; ekran ne šalje tarife ni iznose) ─────
  new.hours_by_type := public.timesheet_hours_by_type(new, v_threshold);
  new.overtime_hours := (new.hours_by_type ->> 'prekovremeni')::numeric;
  v_calc := public.timesheet_day_calc(new);
  v_days := v_calc -> 'days';
  v_problems := v_calc -> 'problems';
  if v_pick ? 'problem' and v_pick ->> 'problem' <> 'no_project' then
    v_problems := jsonb_build_array(public.timesheet_problem(v_pick ->> 'problem')) || v_problems;
  end if;

  select array_agg(distinct (l -> 'worker' ->> 'rate')::numeric) filter (where l -> 'worker' ->> 'rate' is not null),
         array_agg(distinct (l -> 'client' ->> 'rate')::numeric) filter (where l -> 'client' ->> 'rate' is not null),
         array_agg(distinct l -> 'worker' ->> 'currency') filter (where l -> 'worker' ->> 'currency' is not null),
         array_agg(distinct l -> 'client' ->> 'currency') filter (where l -> 'client' ->> 'currency' is not null)
    into v_w_rates, v_c_rates, v_w_cur, v_c_cur
  from jsonb_array_elements(v_days) l;

  new.b2c_rate := case when cardinality(v_w_rates) = 1 and not exists (select 1 from jsonb_array_elements(v_days) l
                         where l -> 'worker' ->> 'rate' is null) then v_w_rates[1] end;
  new.b2b_rate := case when cardinality(v_c_rates) = 1 and not exists (select 1 from jsonb_array_elements(v_days) l
                         where l -> 'client' ->> 'rate' is null) then v_c_rates[1] end;
  new.worker_currency := case when cardinality(v_w_cur) = 1 then v_w_cur[1] else coalesce(new.worker_currency, 'EUR') end;
  new.client_currency := case when cardinality(v_c_cur) = 1 then v_c_cur[1] else coalesce(new.client_currency, 'EUR') end;
  new.worker_cost := case when not exists (select 1 from jsonb_array_elements(v_days) l where l ->> 'worker_cost' is null)
                            and coalesce(cardinality(v_w_cur), 0) <= 1
                          then (select coalesce(sum((l ->> 'worker_cost')::numeric), 0) from jsonb_array_elements(v_days) l) end;
  new.client_revenue := case when not exists (select 1 from jsonb_array_elements(v_days) l where l ->> 'client_revenue' is null)
                              and coalesce(cardinality(v_c_cur), 0) <= 1
                            then (select coalesce(sum((l ->> 'client_revenue')::numeric), 0) from jsonb_array_elements(v_days) l) end;
  new.profit := case when new.worker_cost is not null and new.client_revenue is not null
                      and new.worker_currency = new.client_currency then new.client_revenue - new.worker_cost end;
  new.calc_problems := case when jsonb_array_length(v_problems) > 0 then v_problems end;

  -- ───── Submit: dodela i dani u njenom opsegu ─────
  if v_to in ('submitted', 'approved') and v_from is distinct from v_to and v_from is distinct from 'submitted' then
    if new.project_id is null then
      raise exception 'Satnica mora biti vezana za projekat sa liste' using errcode = 'check_violation';
    end if;
    if new.assignment_id is null or exists (select 1 from jsonb_array_elements(coalesce(new.calc_problems, '[]')) e
                                            where e ->> 'code' in ('assignment_missing', 'assignment_ambiguous', 'outside_assignment')) then
      raise exception 'Satnica ne može da se pošalje: %', public.timesheet_problems_text(
        coalesce(new.calc_problems, jsonb_build_array(public.timesheet_problem('assignment_missing'))))
        using errcode = 'check_violation';
    end if;
    new.submitted_by := v_uid;
    new.submitted_at := now();
  end if;

  -- ───── Approve: bez problema; snimak v2 sa dnevnim linijama ─────
  if v_to = 'approved' then
    if new.calc_problems is not null then
      raise exception 'Satnica ne može da se odobri: %', public.timesheet_problems_text(new.calc_problems)
        using errcode = 'check_violation';
    end if;
    if new.worker_cost is null or new.client_revenue is null then
      raise exception 'Satnica nema potpun obračun i ne može da se odobri' using errcode = 'check_violation';
    end if;
    new.rate_snapshot := jsonb_build_object(
      'version', 2,
      'daily_regular_hours', trim_scale(v_threshold),
      'max_daily_hours', trim_scale(v_max),
      'holidays', (select coalesce(jsonb_agg(h.date order by h.date), '[]'::jsonb) from public.holidays h
                   where h.date between new.week_start and new.week_start + 6),
      'days', v_days,
      'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                  'code', g.code, 'hours', trim_scale(g.hours), 'worker_source', 'coef',
                  'worker_rate', g.wr, 'worker_coef', g.wc, 'worker_currency', g.wcur,
                  'client_rate', g.cr, 'client_coef', g.cc, 'client_currency', g.ccur,
                  'worker_cost', g.cost, 'client_revenue', g.revenue) order by g.ord, g.wr, g.cr), '[]'::jsonb)
                from (select l ->> 'code' as code, min(array_position(array['redovni', 'prekovremeni', 'vikend', 'praznik', 'praznik_vikend'], l ->> 'code')) as ord,
                             (l -> 'worker' ->> 'rate')::numeric as wr, (l -> 'worker' ->> 'coef')::numeric as wc, l -> 'worker' ->> 'currency' as wcur,
                             (l -> 'client' ->> 'rate')::numeric as cr, (l -> 'client' ->> 'coef')::numeric as cc, l -> 'client' ->> 'currency' as ccur,
                             sum((l ->> 'hours')::numeric) as hours, sum((l ->> 'worker_cost')::numeric) as cost,
                             sum((l ->> 'client_revenue')::numeric) as revenue
                      from jsonb_array_elements(v_days) l group by 1, 3, 4, 5, 6, 7, 8) g),
      'worker', jsonb_build_object('rate', new.b2c_rate, 'mixed', new.b2c_rate is null),
      'client', jsonb_build_object('rate', new.b2b_rate, 'mixed', new.b2b_rate is null),
      'approved_at', now());
    new.estimate_days := null;
    new.approved_by := v_uid;
    new.approved_date := now();
  else
    new.estimate_days := v_days;
    new.rate_snapshot := null; -- snimak postoji samo za odobren red; nacrt se računa po važećim pravilima
    new.approved_by := null;
    new.approved_date := null;
  end if;

  if v_to = 'rejected' and v_from is distinct from 'rejected' then
    new.rejected_by := v_uid;
    new.rejected_at := now();
    new.rejection_reason := nullif(btrim(coalesce(new.rejection_reason, '')), '');
  end if;

  return new;
end $$;

-- Status reda → da li njegovi intervali učestvuju u proveri preklapanja (odbijen = ne); dodela/projekat → unosi.
create or replace function public.sync_timesheet_entries_from_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.approval_status = 'rejected') is distinct from (old.approval_status = 'rejected')
     or (new.employee_id, new.project_id, new.assignment_id) is distinct from (old.employee_id, old.project_id, old.assignment_id) then
    perform set_config('app.entries_counts', 'on', true);
    update public.timesheet_entries e
       set counts = new.approval_status <> 'rejected', employee_id = new.employee_id,
           project_id = new.project_id, assignment_id = new.assignment_id
     where e.timesheet_id = new.id;
    perform set_config('app.entries_counts', 'off', true);
  end if;
  return new;
end $$;

drop trigger if exists timesheets_sync_entries on public.timesheets;
create trigger timesheets_sync_entries after update on public.timesheets
  for each row execute function public.sync_timesheet_entries_from_row();

-- ═════════════════════════════ 5. intervali: čuvar i zbir dana ═════════════════════════════
create or replace function public.guard_timesheet_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.timesheets;
  v_shift public.shifts;
  v_minutes numeric;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.entries_counts', true), '') = 'on' then
    return new; -- samo counts/denormalizacija sa reda
  end if;

  select * into v_t from public.timesheets t where t.id = case when tg_op = 'DELETE' then old.timesheet_id else new.timesheet_id end;
  if v_t.id is null then
    if tg_op = 'DELETE' then return old; end if; -- kaskadno brisanje reda
    raise exception 'Satnica ne postoji' using errcode = 'foreign_key_violation';
  end if;
  if auth.uid() is not null and not (public.has_permission('timesheets.edit') and public.can_see_project(v_t.project_id)) then
    raise exception 'Nemate pravo da unosite sate ovog projekta' using errcode = '42501';
  end if;
  if v_t.approval_status = 'approved' then
    raise exception 'Odobrena satnica se ne menja; korekcija ide kroz vraćanje uz razlog (Reopen)' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  if tg_op = 'UPDATE' and new.timesheet_id <> old.timesheet_id then
    raise exception 'Interval ne može da pređe u drugu satnicu' using errcode = 'check_violation';
  end if;
  if new.work_date < v_t.week_start or new.work_date > v_t.week_start + 6 then
    raise exception 'Datum % nije u nedelji satnice (od %)', to_char(new.work_date, 'DD.MM.YYYY'), to_char(v_t.week_start, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;

  new.employee_id := v_t.employee_id;
  new.project_id := v_t.project_id;
  new.assignment_id := v_t.assignment_id;
  new.counts := v_t.approval_status <> 'rejected';

  if new.shift_id is not null then
    select * into v_shift from public.shifts s where s.id = new.shift_id;
    if v_shift.project_id is not null and v_shift.project_id is distinct from v_t.project_id then
      raise exception 'Smena pripada drugom projektu' using errcode = 'check_violation';
    end if;
    if new.start_time is null and new.end_time is null then
      new.start_time := v_shift.start_time;
      new.end_time := v_shift.end_time;
    end if;
  end if;

  if new.start_time is not null and new.end_time is not null then
    v_minutes := extract(epoch from (new.work_date + new.end_time
                   + case when new.end_time <= new.start_time then interval '1 day' else interval '0' end
                   - (new.work_date + new.start_time))) / 60 - new.break_minutes;
    if v_minutes <= 0 then
      raise exception 'Pauza je duža od intervala rada' using errcode = 'check_violation';
    end if;
    new.hours := round(v_minutes / 60, 2); -- sati iz vremena (ono što pošalje ekran se ignoriše)
  elsif new.hours is null then
    raise exception 'Unesite vreme početka i kraja, smenu ili broj sati' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists timesheet_entries_guard on public.timesheet_entries;
create trigger timesheet_entries_guard before insert or update or delete on public.timesheet_entries
  for each row execute function public.guard_timesheet_entry();

-- Dan sa unosima = zbir sati unosa (upisuje baza uz app.entries_sync; guard_timesheet tada dozvoljava izmenu dana).
create or replace function public.sync_timesheet_day_from_entries() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_col text;
  v_sum numeric;
begin
  if coalesce(current_setting('app.entries_counts', true), '') = 'on' then
    return null;
  end if;
  for r in
    select distinct x.timesheet_id, x.work_date
    from (select old.timesheet_id, old.work_date where tg_op in ('UPDATE', 'DELETE')
          union all select new.timesheet_id, new.work_date where tg_op in ('INSERT', 'UPDATE')) x
  loop
    select (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[(r.work_date - t.week_start) + 1] || '_hours'
      into v_col from public.timesheets t where t.id = r.timesheet_id;
    continue when v_col is null; -- red je obrisan (kaskada)
    select coalesce(sum(e.hours), 0) into v_sum from public.timesheet_entries e
     where e.timesheet_id = r.timesheet_id and e.work_date = r.work_date;
    if v_sum > 24 then
      raise exception 'Intervali za % daju % h — dan ima najviše 24 h', to_char(r.work_date, 'DD.MM.YYYY'), trim_scale(v_sum)
        using errcode = 'check_violation';
    end if;
    perform set_config('app.entries_sync', 'on', true);
    execute format('update public.timesheets set %I = $1 where id = $2 and %I is distinct from $1', v_col, v_col)
      using v_sum, r.timesheet_id;
    perform set_config('app.entries_sync', 'off', true);
  end loop;
  return null;
end $$;

drop trigger if exists timesheet_entries_sync_day on public.timesheet_entries;
create trigger timesheet_entries_sync_day after insert or update or delete on public.timesheet_entries
  for each row execute function public.sync_timesheet_day_from_entries();

drop trigger if exists timesheet_entries_audit on public.timesheet_entries;
create trigger timesheet_entries_audit after insert or update or delete on public.timesheet_entries
  for each row execute function public.audit_row();

-- ═════════════════════════════ 6. korekcija odobrene satnice (K11, §6.05) ═════════════════════════════
create or replace function public.reopen_timesheet(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.timesheets;
  v_reason text := btrim(coalesce(p_reason, ''));
  m record;
  v_run public.payroll_runs;
begin
  select * into v_t from public.timesheets t where t.id = p_id for update;
  if v_t.id is null then
    raise exception 'Satnica ne postoji' using errcode = 'check_violation';
  end if;
  if not (public.has_permission('timesheets.correct') and public.can_see_project(v_t.project_id)) then
    raise exception 'Nemate pravo na korekciju odobrene satnice' using errcode = '42501';
  end if;
  if v_t.approval_status <> 'approved' then
    raise exception 'Korekcija važi samo za odobrenu satnicu' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'Razlog korekcije je obavezan (najmanje 5 znakova)' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', v_reason, true);
  perform set_config('app.audit_action', 'correction', true);

  -- Pogođen period: zaključan mesec se otključava samo dok nema odobrenog/isplaćenog obračuna.
  for m in
    select distinct date_trunc('month', d.work_date)::date as month
    from public.timesheet_days(v_t) d where public.month_is_locked(d.work_date) order by 1
  loop
    if exists (select 1 from public.payroll_runs pr where pr.month = m.month and pr.status in ('approved', 'paid')) then
      raise exception 'Period je zaključen odobrenim obračunom — korekcija ide kao Payable adjustment (Payroll)'
        using errcode = 'check_violation';
    end if;
    for v_run in select * from public.payroll_runs pr where pr.month = m.month and pr.status = 'draft' loop
      perform public.audit_event('payroll_runs', v_run.id::text, 'correction', to_jsonb(v_run), v_reason);
      delete from public.payroll_runs where id = v_run.id;
    end loop;
    perform public.audit_event('month_locks', m.month::text, 'correction',
      (select to_jsonb(ml) from public.month_locks ml where ml.month = m.month), v_reason);
    delete from public.month_locks where month = m.month;
  end loop;

  perform set_config('app.timesheet_reopen', 'on', true);
  update public.timesheets
     set approval_status = 'draft', correction_count = correction_count + 1, last_correction_reason = v_reason
   where id = p_id;
  perform set_config('app.timesheet_reopen', 'off', true);
  perform set_config('app.audit_action', '', true);
  perform set_config('app.audit_reason', '', true);
end $$;

-- ═════════════════════════════ 7. dnevne linije odobrenih sati (jedan izvor) ═════════════════════════════
-- Problemi odobrenih satnica u periodu (isto kao timesheetDayLines u JS): bez snimka, sati ≠ snimak, tarifa ili
-- koeficijent koji fali u snimku. Satnica sa problemom nema linija u labor_day_lines.
create or replace function public.labor_day_problems(p_from date, p_to date)
returns table (timesheet_id uuid, employee_id uuid, project_id uuid, week_start date, code text, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.timesheets;
  v_thr numeric;
  v_hw boolean;
  v_bad text;
begin
  for t in
    select x.* from public.timesheets x
    where x.approval_status = 'approved' and x.week_start between p_from - 6 and p_to
      and exists (select 1 from public.timesheet_days(x) d where d.work_date between p_from and p_to)
  loop
    timesheet_id := t.id; employee_id := t.employee_id; project_id := t.project_id; week_start := t.week_start;
    detail := null;
    if t.project_id is null then
      code := 'no_project'; return next; continue;
    end if;
    if t.rate_snapshot is null or jsonb_typeof(t.rate_snapshot) <> 'object' then
      code := 'no_snapshot'; return next; continue;
    end if;

    if t.rate_snapshot ->> 'version' = '2' then
      if jsonb_typeof(t.rate_snapshot -> 'days') is distinct from 'array' then
        code := 'no_snapshot'; return next; continue;
      end if;
      if exists (
          select 1 from (
            select d.work_date, d.hours as h, coalesce((select sum((l ->> 'hours')::numeric)
              from jsonb_array_elements(t.rate_snapshot -> 'days') l where (l ->> 'date')::date = d.work_date), 0) as s
            from (select (t.week_start + i)::date as work_date, coalesce(h, 0) as hours
                  from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
                               (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) v(i, h)) d) q
          where q.h <> q.s) then
        code := 'snapshot_mismatch'; return next; continue;
      end if;
      select string_agg(distinct l ->> 'code', ', ') into v_bad
      from jsonb_array_elements(t.rate_snapshot -> 'days') l
      where (l ->> 'date')::date between p_from and p_to
        and ((l -> 'worker' ->> 'rate') is null or (l -> 'client' ->> 'rate') is null);
      if v_bad is not null then code := 'missing_rate'; detail := v_bad; return next; continue; end if;
      select string_agg(distinct l ->> 'code', ', ') into v_bad
      from jsonb_array_elements(t.rate_snapshot -> 'days') l
      where (l ->> 'date')::date between p_from and p_to
        and ((l -> 'worker' ->> 'coef') is null or (l -> 'client' ->> 'coef') is null);
      if v_bad is not null then code := 'missing_coef'; detail := v_bad; return next; end if;
      continue;
    end if;

    -- v1: prag i praznici iz snimka; sati po vrsti cele nedelje moraju da odgovaraju linijama snimka.
    v_thr := case when (t.rate_snapshot ->> 'daily_regular_hours') ~ '^[0-9.]+$'
                  then (t.rate_snapshot ->> 'daily_regular_hours')::numeric end;
    if jsonb_typeof(t.rate_snapshot -> 'lines') is distinct from 'array' or not coalesce(v_thr > 0, false) then
      code := 'no_snapshot'; return next; continue;
    end if;
    v_hw := exists (select 1 from jsonb_array_elements(t.rate_snapshot -> 'lines') l where l ->> 'code' = 'praznik_vikend');
    if exists (
        select 1
        from (select c.code, coalesce(sum(x.hours), 0) as h
              from unnest(array['redovni', 'prekovremeni', 'vikend', 'praznik', 'praznik_vikend']) c(code)
              left join public.timesheet_v1_day_split(t, null, null) x on x.hour_type = c.code
              group by c.code) w
        where w.h <> coalesce((select (l ->> 'hours')::numeric from jsonb_array_elements(t.rate_snapshot -> 'lines') l
                               where l ->> 'code' = w.code limit 1), 0)) then
      code := 'snapshot_mismatch'; return next; continue;
    end if;
    select string_agg(distinct x.hour_type, ', ') into v_bad
    from public.timesheet_v1_day_split(t, p_from, p_to) x
    where x.worker_rate is null or x.client_rate is null;
    if v_bad is not null then code := 'missing_rate'; detail := v_bad; return next; continue; end if;
    select string_agg(distinct x.hour_type, ', ') into v_bad
    from public.timesheet_v1_day_split(t, p_from, p_to) x
    where x.worker_coef is null or x.client_coef is null;
    if v_bad is not null then code := 'missing_coef'; detail := v_bad; return next; end if;
  end loop;
end $$;

-- v1 snimak po danu (port timesheetMonthLines): dan se razvrstava po pragu i praznicima iz snimka, tarife i
-- koeficijenti iz `lines` po vrsti; posebna satnica iz profila (worker_source = 'special') ima koeficijent 1.
create or replace function public.timesheet_v1_day_split(t public.timesheets, p_from date, p_to date)
returns table (work_date date, hour_type text, hours numeric, worker_rate numeric, worker_coef numeric, worker_source text,
               client_rate numeric, client_coef numeric)
language sql stable set search_path = '' as $$
  with s as (
    select t.rate_snapshot as snap,
           case when (t.rate_snapshot ->> 'daily_regular_hours') ~ '^[0-9.]+$'
                then (t.rate_snapshot ->> 'daily_regular_hours')::numeric end as thr,
           exists (select 1 from jsonb_array_elements(t.rate_snapshot -> 'lines') l where l ->> 'code' = 'praznik_vikend') as hw
  ),
  d as (
    select (t.week_start + v.i)::date as work_date, v.i, v.h,
           exists (select 1 from s, jsonb_array_elements_text(coalesce(s.snap -> 'holidays', '[]')) hd
                   where left(hd, 10) = to_char(t.week_start + v.i, 'YYYY-MM-DD')) as holiday
    from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
                 (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) v(i, h)
    where coalesce(v.h, 0) > 0
      and (p_from is null or (t.week_start + v.i) >= p_from) and (p_to is null or (t.week_start + v.i) <= p_to)
  ),
  parts as (
    select d.work_date, x.code, x.h
    from d, s, lateral (
      select * from (values
        ('praznik_vikend', case when d.holiday and d.i >= 5 and s.hw then d.h else 0 end),
        ('praznik', case when d.holiday and not (d.i >= 5 and s.hw) then d.h else 0 end),
        ('vikend', case when not d.holiday and d.i >= 5 then d.h else 0 end),
        ('redovni', case when not d.holiday and d.i < 5 then least(d.h, s.thr) else 0 end),
        ('prekovremeni', case when not d.holiday and d.i < 5 then greatest(d.h - s.thr, 0) else 0 end)) v(code, h)
    ) x
    where x.h > 0
  )
  select p.work_date, p.code, p.h,
         case when ll.l ->> 'worker_source' = 'special'
              then round(nullif(coalesce(ll.l ->> 'special_rate', ll.l ->> 'worker_rate'), '')::numeric, 2)
              else round(nullif(ll.l ->> 'worker_rate', '')::numeric, 2) end,
         case when ll.l ->> 'worker_source' = 'special' then 1 else nullif(ll.l ->> 'worker_coef', '')::numeric end,
         case when ll.l ->> 'worker_source' = 'special' then 'special' else 'v1' end,
         round(nullif(ll.l ->> 'client_rate', '')::numeric, 2),
         nullif(ll.l ->> 'client_coef', '')::numeric
  from parts p
  cross join s
  left join lateral (select e.value as l from jsonb_array_elements(s.snap -> 'lines') e
                     where e.value ->> 'code' = p.code limit 1) ll on true
$$;

create or replace function public.labor_day_lines(p_from date, p_to date, p_project uuid default null)
returns table (timesheet_id uuid, employee_id uuid, project_id uuid, client_id uuid, assignment_id uuid, project_role_id uuid,
  payee_type text, payee_id uuid, work_date date, hour_type text, hours numeric,
  worker_rate numeric, worker_coef numeric, worker_currency text, worker_source text,
  client_rate numeric, client_coef numeric, client_currency text, client_source text, snapshot_version int)
language sql stable security definer set search_path = '' as $$
  with ts as (
    select t.* from public.timesheets t
    where t.approval_status = 'approved' and t.project_id is not null
      and t.week_start between p_from - 6 and p_to and (p_project is null or t.project_id = p_project)
      and t.id not in (select pr.timesheet_id from public.labor_day_problems(p_from, p_to) pr)
  ),
  lines as (
    select t.id as timesheet_id, (l ->> 'date')::date as work_date, l ->> 'code' as hour_type, (l ->> 'hours')::numeric as hours,
           (l -> 'worker' ->> 'rate')::numeric as worker_rate, (l -> 'worker' ->> 'coef')::numeric as worker_coef,
           l -> 'worker' ->> 'currency' as worker_currency, l -> 'worker' ->> 'source' as worker_source,
           (l -> 'client' ->> 'rate')::numeric as client_rate, (l -> 'client' ->> 'coef')::numeric as client_coef,
           l -> 'client' ->> 'currency' as client_currency, l -> 'client' ->> 'source' as client_source,
           nullif(l ->> 'project_role_id', '')::uuid as project_role_id, 2 as snapshot_version
    from ts t, jsonb_array_elements(t.rate_snapshot -> 'days') l
    where t.rate_snapshot ->> 'version' = '2' and (l ->> 'date')::date between p_from and p_to
    union all
    select t.id, x.work_date, x.hour_type, x.hours, x.worker_rate, x.worker_coef, 'EUR', x.worker_source,
           x.client_rate, x.client_coef, 'EUR', 'v1', null, 1
    from ts t, lateral public.timesheet_v1_day_split(t, p_from, p_to) x
    where t.rate_snapshot ->> 'version' is distinct from '2'
  )
  select t.id, t.employee_id, t.project_id, p.client_id, t.assignment_id, coalesce(l.project_role_id, a.project_role_id),
         case when py.vendor_id is not null then 'vendor' else 'employee' end,
         coalesce(py.vendor_id, t.employee_id),
         l.work_date, l.hour_type, l.hours, l.worker_rate, l.worker_coef, l.worker_currency, l.worker_source,
         l.client_rate, l.client_coef, l.client_currency, l.client_source, l.snapshot_version
  from lines l
  join ts t on t.id = l.timesheet_id
  left join public.projects p on p.id = t.project_id
  left join public.project_assignments a on a.id = t.assignment_id
  left join lateral (
    select h.engagement_type, h.vendor_id from public.employment_history h
    where h.employee_id = t.employee_id and h.start_date <= l.work_date and (h.end_date is null or h.end_date >= l.work_date)
    order by h.start_date desc limit 1
  ) eh on true
  -- Primalac (§7, T12): dodela podizvođača → vendor; bez dodele snimak vendora na satnici, pa angažman na datum.
  cross join lateral (select case
      when a.id is not null then case when a.engagement_type = 'subcontractor_worker' then a.vendor_id end
      when t.vendor_id is not null then t.vendor_id
      when eh.engagement_type = 'subcontractor_worker' then eh.vendor_id end as vendor_id) py
  order by l.work_date, t.employee_id, t.id, l.hour_type
$$;

-- ═════════════════════════════ 8. vidljivost novca (T26, §15) ═════════════════════════════
-- Iznosi i tarife satnice nisu u column grant-u; čitaju se kroz timesheet_money sa maskom po pravu.
-- Svaka buduća nova kolona timesheets mora dobiti grant select (kolona) u istoj migraciji.
revoke select on public.timesheets from authenticated;
revoke all on public.timesheets from anon;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'timesheets'
    and c.column_name not in ('b2c_rate', 'b2b_rate', 'worker_cost', 'client_revenue', 'profit', 'rate_snapshot', 'estimate_days');
  execute format('grant select (%s) on public.timesheets to authenticated', v_cols);
end $$;

create or replace view public.timesheet_money with (security_barrier) as
select t.id as timesheet_id,
  case when public.has_permission('rates.view_b2b') then t.b2b_rate end as b2b_rate,
  case when public.has_permission('rates.view_b2b') then t.client_revenue end as client_revenue,
  case when public.has_permission('rates.view_b2c') then t.b2c_rate end as b2c_rate,
  case when public.has_permission('rates.view_b2c') then t.worker_cost end as worker_cost,
  case when public.has_permission('rates.view_b2b') and public.has_permission('rates.view_b2c') then t.profit end as profit,
  public.mask_rate_snapshot(t.rate_snapshot) as rate_snapshot,
  public.mask_rate_snapshot(t.estimate_days) as estimate_days
from public.timesheets t
where public.is_staff()
  and (public.can_see_project(t.project_id) or (t.project_id is null and public.can_see_project(null)));
comment on view public.timesheet_money is
  'iznosi i tarife satnice po pravu (T26): B2B uz rates.view_b2b, B2C uz rates.view_b2c, profit uz oba; snimak i procena maskirani';
revoke all on public.timesheet_money from public, anon;
grant select on public.timesheet_money to authenticated;

-- ═════════════════════════════ 9. intervali: prava (RLS kao timesheets) ═════════════════════════════
alter table public.timesheet_entries enable row level security;
revoke all on public.timesheet_entries from anon;
grant select, insert, update, delete on public.timesheet_entries to authenticated;
select public.apply_table_policies('timesheet_entries',
  '(select public.is_staff()) and public.can_see_project(project_id)',
  '((select public.has_permission(''timesheets.edit''))) and public.can_see_project(project_id)');

-- ═════════════════════════════ 10. funkcije: izvršavanje (D14) ═════════════════════════════
revoke execute on function public.timesheet_problem(text, date, text, text), public.timesheet_day_hours(public.timesheets),
  public.timesheet_pick_assignment(public.timesheets), public.timesheet_day_calc(public.timesheets),
  public.timesheet_day_lines(public.timesheets), public.mask_money_json(jsonb, boolean, boolean),
  public.timesheet_problems_text(jsonb), public.guard_timesheet(), public.sync_timesheet_entries_from_row(),
  public.guard_timesheet_entry(), public.sync_timesheet_day_from_entries(),
  public.labor_day_problems(date, date), public.timesheet_v1_day_split(public.timesheets, date, date),
  public.labor_day_lines(date, date, uuid)
  from public, anon, authenticated;
-- View timesheet_money poziva masku kao korisnik koji čita (funkcije u view-u traže execute pozivaoca).
revoke execute on function public.mask_rate_snapshot(jsonb) from public, anon;
grant execute on function public.mask_rate_snapshot(jsonb) to authenticated;
revoke execute on function public.reopen_timesheet(uuid, text) from public, anon;
grant execute on function public.reopen_timesheet(uuid, text) to authenticated;

-- ═════════════════════════════ 11. postojeći podaci ═════════════════════════════
-- 11.1 dodela za postojeće redove (R5): jedina izmena odobrenog reda; nejednoznačni/bez dodele → migration_report.
do $$
declare
  t public.timesheets;
  v_pick jsonb;
begin
  perform set_config('app.migration_backfill', 'on', true);
  for t in select * from public.timesheets x where x.assignment_id is null and x.project_id is not null order by x.week_start, x.id loop
    v_pick := public.timesheet_pick_assignment(t);
    if v_pick ? 'id' then
      update public.timesheets set assignment_id = (v_pick ->> 'id')::uuid where id = t.id;
    elsif not exists (select 1 from public.migration_report mr where mr.migration = '20261125040000'
                        and mr.entity = 'timesheets' and mr.entity_id = t.id::text and mr.resolved_at is null) then
      perform public.migration_note('20261125040000', 'timesheets', t.id::text, v_pick ->> 'problem',
        jsonb_build_object('employee_id', t.employee_id, 'project_id', t.project_id, 'week_start', t.week_start,
                           'approval_status', t.approval_status));
    end if;
  end loop;
  perform set_config('app.migration_backfill', 'off', true);
end $$;

-- 11.2 neodobreni redovi: procena i problemi po važećim pravilima (iznosi nacrta se računaju ponovo, kao pri svakoj
-- izmeni nacrta). Red u zaključanom mesecu ili koji ne prolazi novu proveru ostaje kakav je + migration_report.
do $$
declare
  t record;
begin
  for t in select x.id from public.timesheets x where x.approval_status <> 'approved' and x.estimate_days is null loop
    begin
      update public.timesheets set updated_date = updated_date where id = t.id;
    exception when others then
      if not exists (select 1 from public.migration_report mr where mr.migration = '20261125040000'
                       and mr.entity = 'timesheets' and mr.entity_id = t.id::text and mr.issue = 'draft_not_recalculated') then
        perform public.migration_note('20261125040000', 'timesheets', t.id::text, 'draft_not_recalculated',
          jsonb_build_object('error', sqlerrm));
      end if;
    end;
  end loop;
end $$;

-- ═════════════════════════════ 12. employee_private: novac radnika (T26, §15) ═════════════════════════════
-- HR čita lične podatke (employees.private.view), ali ne i zaradu ni satnice iz profila. salary uz payroll.view;
-- b2c_hourly_rate, overtime_rate, weekend_rate, holiday_rate uz rates.view_b2c; b2b_hourly_rate uz rates.view_b2b.
-- Čita se kroz view employee_private_money; upis bez prava ne menja te kolone (trigger zadržava staru vrednost).
revoke select on public.employee_private from authenticated;
revoke all on public.employee_private from anon;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'employee_private'
    and c.column_name not in ('salary', 'b2c_hourly_rate', 'b2b_hourly_rate', 'overtime_rate', 'weekend_rate', 'holiday_rate');
  execute format('grant select (%s) on public.employee_private to authenticated', v_cols);
end $$;

create or replace view public.employee_private_money with (security_barrier) as
select ep.employee_id,
  case when public.has_permission('payroll.view') then ep.salary end as salary,
  case when public.has_permission('rates.view_b2c') then ep.b2c_hourly_rate end as b2c_hourly_rate,
  case when public.has_permission('rates.view_b2b') then ep.b2b_hourly_rate end as b2b_hourly_rate,
  case when public.has_permission('rates.view_b2c') then ep.overtime_rate end as overtime_rate,
  case when public.has_permission('rates.view_b2c') then ep.weekend_rate end as weekend_rate,
  case when public.has_permission('rates.view_b2c') then ep.holiday_rate end as holiday_rate
from public.employee_private ep
where public.has_permission('employees.private.view');
comment on view public.employee_private_money is
  'zarada i satnice iz profila radnika po pravu (T26): salary uz payroll.view, B2C uz rates.view_b2c, B2B uz rates.view_b2b';
revoke all on public.employee_private_money from public, anon;
grant select on public.employee_private_money to authenticated;

create or replace function public.guard_employee_private_money() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pay boolean := auth.uid() is null or public.has_permission('payroll.view');
  v_b2c boolean := auth.uid() is null or public.has_permission('rates.view_b2c');
  v_b2b boolean := auth.uid() is null or public.has_permission('rates.view_b2b');
begin
  if not v_pay then new.salary := case when tg_op = 'UPDATE' then old.salary end; end if;
  if not v_b2c then
    new.b2c_hourly_rate := case when tg_op = 'UPDATE' then old.b2c_hourly_rate end;
    new.overtime_rate := case when tg_op = 'UPDATE' then old.overtime_rate end;
    new.weekend_rate := case when tg_op = 'UPDATE' then old.weekend_rate end;
    new.holiday_rate := case when tg_op = 'UPDATE' then old.holiday_rate end;
  end if;
  if not v_b2b then new.b2b_hourly_rate := case when tg_op = 'UPDATE' then old.b2b_hourly_rate end; end if;
  return new;
end $$;
revoke execute on function public.guard_employee_private_money() from public, anon, authenticated;
drop trigger if exists employee_private_money_guard on public.employee_private;
create trigger employee_private_money_guard before insert or update on public.employee_private
  for each row execute function public.guard_employee_private_money();
