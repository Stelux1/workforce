-- Teamora T-A1: angažman je jedna evidencija (project_assignments) i Rate History (rates) — docs/TEAMORA-DATA-MODEL.md
-- §2.4 i §2.5, spec §2.3, §4.5, §5 (D30 K3, K5). Rizici R1–R4, R8 (§6).
--
--  1. project_assignments: Job Role (project_role_id), vrsta (transfer/additional/replacement), izvor, odsustvo, smena,
--     End (ended_*), legacy_source. Payee se popunjava iz angažmana radnika (fill_assignment_engagement). Preklapanje
--     istog radnika na istom projektu se odbija za nove/izmenjene redove (guard_assignment_overlap); postojeća
--     preklapanja idu u migration_report (R8). Radnik/projekat dodele sa radom ili tarifom se ne menjaju, a datumi se
--     ne sužavaju preko dana sa satima (guard_assignment_rates v2).
--  2. projects.assigned_employees / projects.job_roles postaju izvedeni keš BEZ tarifa (sync_project_assignment_cache);
--     direktan upis se odbija svima, i adminu (guard_project_cache umesto guard_project_rates, D22).
--  3. Backfill dodela iz JSON-a i iz satnica (legacy_source), pun JSON pre izmene u migration_report (R1).
--  4. rates: project_role_id, superseded_by, change_reason, rate_key i exclusion rates_no_overlap. Postojeća
--     preklapanja se normalizuju tako da izbor za svaki dan ostane isti (R3); svaka izmena u reportu.
--  5. Tarife iz JSON-a i profila prelaze u rates (popunjavanje rupa, isti rezultat; R2). Posebne satnice iz profila
--     i job_roles.b2c_rate idu samo u report.
--  6. resolve_rate (assignment_rate → role_rate → project_rate → employee_rate; valuta dozvoljena, K3);
--     resolve_timesheet_rate je omotač za postojeći guard_timesheet (do T-A2 04 prima samo EUR po satu, kao i do sada);
--     stari izbor se čuva kao resolve_timesheet_rate_v1 (do W3). Razlika izbora za svaku neodobrenu satnicu i dan →
--     migration_report 'rate_resolution_changed' (R4). Odobrene satnice (snimak) se ne diraju (D10).
--  7. Istorija tarifa: posle unosa se ne menjaju iznos, valuta, jedinica, ključ ni početak (guard_rate_history);
--     promena cene samo kroz change_rate (stari red se zatvara dan pre), nov red kroz set_rate; brisanje samo ako
--     nijedna satnica ne koristi tarifu u snimku.
--  8. RPC-ovi A2: create/update/end/transfer/additional/cancel_assignment (assignments.manage + can_see_project,
--     tarife uz rates.manage), uz app.audit_reason.
--
-- Napomena o rate_key: ključ je „isto mesto u izboru tarife" — za tarifu angažmana (assignment_id, kind), za Job Role
-- (projekat, uloga, kind, radnik), za radnika (radnik, kind), za ceo projekat i staru poziciju bez uloge (projekat,
-- pozicija, kind, radnik). Snimak naziva pozicije (position) ne pravi drugu tarifu: dve tarife iste dodele sa
-- različitim snimkom naziva bi inače mogle da se preklope i izbor bi bio dvosmislen.
--
-- Idempotentno; bez brisanja poslovnih podataka; D14 (ništa anon-u). Zavisi od 20261125010000 (T-B).

-- ═════════════════════════════ 0. pomoćno za ovu migraciju (samo u ovoj sesiji) ═════════════════════════════
create or replace function pg_temp.note(p_entity text, p_entity_id text, p_issue text, p_details jsonb)
returns void language sql as $$
  select null::void from (select public.migration_note('20261125030000_angazmani_tarife', p_entity, p_entity_id, p_issue,
                                                       p_details)) x
$$;

-- Izbor tarife PRE ove migracije za svaku neodobrenu satnicu i svaki dan sa satima (poredi se na kraju, R4).
drop table if exists pg_temp.ma03_before;
create temp table ma03_before as
select t.id as timesheet_id, t.employee_id, t.project_id, d.work_date, s.side,
       public.resolve_timesheet_rate(s.side, t.employee_id, t.project_id, d.work_date) as res
  from public.timesheets t
  cross join lateral public.timesheet_days(t) d
  cross join (values ('worker'), ('client')) s(side)
 where t.approval_status <> 'approved' and d.hours > 0;

-- ═════════════════════════════ 1. kolone ═════════════════════════════
alter table public.project_assignments
  add column if not exists project_role_id uuid references public.project_roles (id) on delete restrict,
  add column if not exists assignment_type text not null default 'standard',
  add column if not exists source_assignment_id uuid references public.project_assignments (id) on delete restrict,
  add column if not exists leave_request_id uuid references public.leave_requests (id) on delete set null,
  add column if not exists default_shift_id uuid references public.shifts (id) on delete set null,
  add column if not exists ended_at timestamptz,
  add column if not exists ended_by uuid references auth.users (id) on delete set null,
  add column if not exists end_reason text,
  add column if not exists legacy_source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_assignment_type_check') then
    alter table public.project_assignments add constraint project_assignments_assignment_type_check
      check (assignment_type in ('standard', 'transfer', 'additional', 'replacement'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_legacy_source_check') then
    alter table public.project_assignments add constraint project_assignments_legacy_source_check
      check (legacy_source in ('assigned_employees_json', 'timesheets'));
  end if;
  -- Radnik podizvođača mora imati dobavljača (payee, §7 T12). Postojeći redovi se ne proveravaju (NOT VALID).
  if not exists (select 1 from pg_constraint where conname = 'project_assignments_vendor_payee') then
    alter table public.project_assignments add constraint project_assignments_vendor_payee
      check (engagement_type is distinct from 'subcontractor_worker' or vendor_id is not null) not valid;
  end if;
end $$;

create index if not exists project_assignments_pair_idx on public.project_assignments (employee_id, project_id);
create index if not exists project_assignments_role_idx on public.project_assignments (project_role_id);

alter table public.rates
  add column if not exists project_role_id uuid references public.project_roles (id) on delete restrict,
  add column if not exists superseded_by uuid references public.rates (id) on delete set null,
  add column if not exists change_reason text;

-- Ključ tarife (vidi napomenu na vrhu): isti ključ + preklopljen period + aktivna = dvosmislen izbor.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'rates' and column_name = 'rate_key') then
    alter table public.rates add column rate_key text generated always as (
      case
        when scope = 'assignment' then 'assignment|' || kind || '|' || coalesce(assignment_id::text, '')
        when scope = 'employee' then 'employee|' || kind || '|' || coalesce(employee_id::text, '')
        when project_role_id is not null then 'role|' || kind || '|' || coalesce(project_id::text, '') || '|'
          || project_role_id::text || '|' || coalesce(employee_id::text, '')
        else 'project|' || kind || '|' || coalesce(project_id::text, '') || '|' || public.rate_trim(position) || '|'
          || coalesce(employee_id::text, '')
      end) stored;
  end if;
end $$;
create index if not exists rates_assignment_idx on public.rates (assignment_id);
create index if not exists rates_role_idx on public.rates (project_role_id);

-- ═════════════════════════════ 2. dodela: payee, preklapanje, nepromenljivost ═════════════════════════════
-- Dani sa satima (ne-odbijene satnice) radnika na projektu u opsegu, koje ne pokriva nijedna DRUGA ne-otkazana
-- dodela istog para (to su dani „ove" dodele). Do T-A2 (timesheets.assignment_id) veza ide preko para i datuma.
create or replace function public.assignment_work_days(p_employee uuid, p_project uuid, p_from date, p_to date,
  p_exclude uuid) returns setof date
language sql stable security definer set search_path = '' as $$
  select distinct d.work_date
    from public.timesheets t
    cross join lateral public.timesheet_days(t) d
   where t.employee_id = p_employee and t.project_id = p_project and t.approval_status <> 'rejected'
     and t.week_start <= coalesce(p_to, 'infinity'::date) and t.week_start >= p_from - 6
     and d.hours > 0 and d.work_date >= p_from and (p_to is null or d.work_date <= p_to)
     and not exists (
       select 1 from public.project_assignments o
        where o.employee_id = p_employee and o.project_id = p_project and o.id is distinct from p_exclude
          and o.status <> 'cancelled' and o.start_date <= d.work_date
          and (o.end_date is null or o.end_date >= d.work_date))
$$;

-- Tarifa je korišćena u snimku satnice (v1: worker/client.ref; v2: days[*].worker/client.ref).
create or replace function public.rate_in_snapshot(p_rate uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.timesheets t
     where t.rate_snapshot is not null
       and jsonb_path_exists(t.rate_snapshot, '$.**.ref ? (@ == $id)', jsonb_build_object('id', p_rate::text)))
$$;

-- Payee (§7, T12): prazan engagement_type/vendor_id se popunjava iz angažmana koji pokriva početak dodele.
create or replace function public.fill_assignment_engagement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_eh public.employment_history;
begin
  if new.engagement_type is null and new.vendor_id is null then
    select * into v_eh from public.employment_history eh
     where eh.employee_id = new.employee_id
       and (new.affiliation_id is null or eh.id = new.affiliation_id)
       and eh.start_date <= new.start_date and (eh.end_date is null or eh.end_date >= new.start_date)
     order by eh.start_date desc, eh.id limit 1;
    if v_eh.id is not null then
      new.affiliation_id := v_eh.id;
      new.engagement_type := v_eh.engagement_type;
      new.vendor_id := v_eh.vendor_id;
      new.vendor_name := v_eh.vendor_name;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists project_assignments_fill_engagement on public.project_assignments;
create trigger project_assignments_fill_engagement before insert on public.project_assignments
  for each row execute function public.fill_assignment_engagement();

-- Isti radnik, isti projekat, ne-otkazane dodele: periodi se ne preklapaju (§4.5.5). Samo novi i izmenjeni redovi (R8).
create or replace function public.guard_assignment_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_other public.project_assignments;
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.employee_id, new.project_id, new.start_date, new.end_date, new.status)
       is not distinct from (old.employee_id, old.project_id, old.start_date, old.end_date, old.status) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('pa:' || new.employee_id::text));
  select * into v_other from public.project_assignments a
   where a.employee_id = new.employee_id and a.project_id = new.project_id and a.id <> new.id
     and a.status <> 'cancelled'
     and daterange(a.start_date, a.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
   order by a.start_date limit 1;
  if v_other.id is not null then
    raise exception 'Radnik već ima dodelu na ovom projektu od % do % — dodele istog radnika na istom projektu ne smeju da se preklapaju',
      to_char(v_other.start_date, 'DD.MM.YYYY'), coalesce(to_char(v_other.end_date, 'DD.MM.YYYY'), 'neodređeno')
      using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists project_assignments_guard_overlap on public.project_assignments;
create trigger project_assignments_guard_overlap
  before insert or update of employee_id, project_id, start_date, end_date, status on public.project_assignments
  for each row execute function public.guard_assignment_overlap();

-- guard_assignment_rates v2 (zamenjuje pravilo „samo admin" iz 20261114240000):
--  * Job Role mora pripadati projektu; position je snimak naziva uloge (stari unos samo sa nazivom dobija ulogu).
--  * Smena: globalna ili smena tog projekta.
--  * Svima (i SQL-u): radnik/projekat dodele sa radom ili tarifom se ne menjaju; datumi/otkazivanje ne smeju da
--    ostave dan sa satima bez dodele; dodela sa satima se ne briše (End ili Cancel umesto brisanja).
--  * API (van RPC-ova): assignments.manage + vidljiv projekat; bez rates.manage se dodeli koja ima tarifu angažmana
--    ne menjaju datumi, status ni uloga direktnim upisom — za to su Edit/End (RPC), koji zatvaraju i tarife.
create or replace function public.guard_assignment_rates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_api boolean := auth.uid() is not null and coalesce(current_setting('app.assignment_rpc', true), '') <> 'on';
  v_role public.project_roles;
  v_day date;
  v_shift_project uuid;
begin
  if tg_op = 'DELETE' then
    if v_api and not (public.has_permission('assignments.manage') and public.can_see_project(old.project_id)) then
      raise exception 'Nemate pravo „assignments.manage"' using errcode = '42501';
    end if;
    select min(d) into v_day from public.assignment_work_days(old.employee_id, old.project_id, old.start_date,
                                                              old.end_date, old.id) d;
    if v_day is not null and old.status <> 'cancelled' then
      raise exception 'Dodela ima unete sate (od %) i ne briše se — završite je (End) ili napravite novu', to_char(v_day, 'DD.MM.YYYY')
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  -- Osvežavanje snimka naziva (preimenovan projekat, uloga ili radnik) prolazi bez ostalih provera.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.snapshot_sync', true), '') = 'on'
     and (new.employee_id, new.project_id, new.project_role_id, new.start_date, new.end_date, new.status)
         is not distinct from (old.employee_id, old.project_id, old.project_role_id, old.start_date, old.end_date, old.status) then
    return new;
  end if;

  -- Job Role i snimak naziva
  if new.project_role_id is not null then
    select * into v_role from public.project_roles r where r.id = new.project_role_id;
    if v_role.id is null or v_role.project_id <> new.project_id then
      raise exception 'Job Role ne pripada projektu dodele' using errcode = 'check_violation';
    end if;
    new.position := v_role.title;
  elsif public.rate_trim(new.position) <> '' then
    select * into v_role from public.project_roles r
     where r.project_id = new.project_id and r.title_key = lower(btrim(new.position));
    if v_role.id is not null then
      new.project_role_id := v_role.id;
      new.position := v_role.title;
    end if;
  end if;

  if new.default_shift_id is not null then
    select s.project_id into v_shift_project from public.shifts s where s.id = new.default_shift_id;
    if not found or (v_shift_project is not null and v_shift_project <> new.project_id) then
      raise exception 'Smena ne pripada projektu dodele' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if (new.employee_id, new.project_id) is distinct from (old.employee_id, old.project_id)
       and (exists (select 1 from public.assignment_work_days(old.employee_id, old.project_id, old.start_date,
                                                              old.end_date, old.id))
            or exists (select 1 from public.rates r where r.assignment_id = old.id)) then
      raise exception 'Radnik i projekat dodele sa unetim satima ili tarifom se ne menjaju — završite je i napravite novu dodelu'
        using errcode = 'check_violation';
    end if;
    if (new.start_date, new.end_date, new.status) is distinct from (old.start_date, old.end_date, old.status) then
      select min(d) into v_day
        from public.assignment_work_days(old.employee_id, old.project_id, old.start_date, old.end_date, old.id) d
       where new.status = 'cancelled' or d < new.start_date or (new.end_date is not null and d > new.end_date);
      if v_day is not null then
        raise exception 'Dodela ima unete sate % — period ne može da se skrati tako da ti sati ostanu bez dodele',
          to_char(v_day, 'DD.MM.YYYY') using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if v_api then
    if not (public.has_permission('assignments.manage') and public.can_see_project(new.project_id)
            and (tg_op = 'INSERT' or public.can_see_project(old.project_id))) then
      raise exception 'Nemate pravo „assignments.manage"' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and not public.has_permission('rates.manage')
       and (new.start_date, new.end_date, new.status, new.project_role_id)
           is distinct from (old.start_date, old.end_date, old.status, old.project_role_id)
       and exists (select 1 from public.rates r where r.assignment_id = old.id and r.status = 'active') then
      raise exception 'Dodela ima tarifu angažmana — period, status i Job Role menjajte kroz Edit / End Assignment'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists project_assignments_guard_rates on public.project_assignments;
create trigger project_assignments_guard_rates before insert or update or delete on public.project_assignments
  for each row execute function public.guard_assignment_rates();

-- Prikazni status iz datuma (§4.4); isto kao assignmentStatus u src/lib/assignments.js.
create or replace function public.assignment_display_status(a public.project_assignments, p_today date) returns text
language sql immutable set search_path = '' as $$
  select case
    when a.status = 'cancelled' then 'cancelled'
    when a.end_date < p_today then 'completed'
    when a.start_date > p_today then 'upcoming'
    when a.end_date is not null and a.end_date <= p_today + 30 then 'ending_soon'
    else 'active'
  end
$$;

-- ═════════════════════════════ 3. keš u projects (bez tarifa) ═════════════════════════════
create or replace function public.refresh_project_assignment_cache(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_prev text := coalesce(current_setting('app.assignment_sync', true), '');
  v_emps jsonb;
  v_roles jsonb;
begin
  if p_project is null then
    return;
  end if;
  select coalesce(jsonb_agg(x.obj order by x.name, x.employee_id), '[]') into v_emps
  from (
    select distinct on (a.employee_id) a.employee_id,
           coalesce(nullif(btrim(a.employee_name), ''), btrim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, ''))) as name,
           jsonb_build_object(
             'employee_id', a.employee_id,
             'employee_name', coalesce(nullif(btrim(a.employee_name), ''), btrim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, ''))),
             'position', a.position, 'project_role_id', a.project_role_id, 'assignment_id', a.id) as obj
      from public.project_assignments a
      left join public.employees e on e.id = a.employee_id
     where a.project_id = p_project and a.status <> 'cancelled'
     order by a.employee_id, a.start_date desc, a.id
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title) order by r.sort, r.title), '[]') into v_roles
    from public.project_roles r where r.project_id = p_project and r.status = 'active';

  perform set_config('app.assignment_sync', 'on', true);
  update public.projects p set assigned_employees = v_emps, job_roles = v_roles
   where p.id = p_project and (p.assigned_employees, p.job_roles) is distinct from (v_emps, v_roles);
  perform set_config('app.assignment_sync', v_prev, true);
end $$;

create or replace function public.sync_project_assignment_cache() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Ugnežđeni IF: PL/pgSQL razrešava polja zapisa pre AND-a, pa provera polja ide tek u grani svoje tabele.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'project_assignments' then
      if (new.employee_id, new.project_id, new.position, new.project_role_id, new.status, new.start_date, new.employee_name)
         is not distinct from
         (old.employee_id, old.project_id, old.position, old.project_role_id, old.status, old.start_date, old.employee_name) then
        return null;
      end if;
    elsif tg_table_name = 'project_roles' then
      if (new.project_id, new.title, new.status, new.sort) is not distinct from (old.project_id, old.title, old.status, old.sort) then
        return null;
      end if;
    end if;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_project_assignment_cache(old.project_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
    perform public.refresh_project_assignment_cache(new.project_id);
  end if;
  return null;
end $$;

-- Direktan upis keša se odbija svima (i adminu); piše ga samo sync uz app.assignment_sync.
create or replace function public.guard_project_cache() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.assignment_sync', true), '') = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' and (coalesce(new.assigned_employees, '[]') <> '[]' or coalesce(new.job_roles, '[]') <> '[]'))
     or (tg_op = 'UPDATE' and (new.assigned_employees is distinct from old.assigned_employees
                               or new.job_roles is distinct from old.job_roles)) then
    raise exception 'Radnici i Job Roles se menjaju kroz angažmane i Job Roles' using errcode = '42501';
  end if;
  return new;
end $$;

-- Keš se uključuje tek posle backfill-a (niže); stari guard (tarife u JSON-u) se gasi odmah.
drop trigger if exists projects_guard_rates on public.projects;
drop function if exists public.guard_project_rates();
drop function if exists public.rate_pair_locked(uuid, uuid);
drop function if exists public.project_rate_positions(uuid);
drop function if exists public.project_employee_rate_terms(jsonb);
drop function if exists public.project_role_rate_terms(jsonb);

-- ═════════════════════════════ 4. backfill dodela (§2.4, R1) ═════════════════════════════
-- 4a. Pun JSON svakog projekta pre izmene (tarife iz JSON-a ostaju sačuvane u reportu).
select pg_temp.note('projects', p.id::text, 'assigned_employees_backup',
                    jsonb_build_object('name', p.name, 'assigned_employees', p.assigned_employees, 'job_roles', p.job_roles))
  from public.projects p
 where (coalesce(p.assigned_employees, '[]') <> '[]' or coalesce(p.job_roles, '[]') <> '[]')
   and not exists (select 1 from public.migration_report m where m.migration = '20261125030000_angazmani_tarife'
                      and m.issue = 'assigned_employees_backup' and m.entity_id = p.id::text);

-- 4b. Svaki element assigned_employees ima dodelu.
do $$
declare
  p record;
  e record;
  v_emp uuid;
  v_pos text;
  v_role uuid;
  v_first date;
  v_last date;
  v_end date;
begin
  for p in select * from public.projects order by created_date, id loop
    for e in
      select x.value, x.ord
        from jsonb_array_elements(case when jsonb_typeof(p.assigned_employees) = 'array' then p.assigned_employees
                                       else '[]'::jsonb end) with ordinality x(value, ord)
       order by x.ord
    loop
      v_emp := null;
      if jsonb_typeof(e.value) = 'object'
         and (e.value ->> 'employee_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        select em.id into v_emp from public.employees em where em.id = (e.value ->> 'employee_id')::uuid;
      end if;
      if v_emp is null then
        perform pg_temp.note('projects', p.id::text, 'invalid_assigned_employee',
                             jsonb_build_object('index', e.ord, 'element', e.value));
        continue;
      end if;

      v_pos := nullif(public.rate_trim(e.value ->> 'position'), '');
      select r.id into v_role from public.project_roles r where r.project_id = p.id and r.title_key = lower(v_pos);

      if exists (select 1 from public.project_assignments a
                  where a.employee_id = v_emp and a.project_id = p.id and a.status <> 'cancelled') then
        -- Postojeća dodela: samo prazna pozicija dobija poziciju sa spiska (Job Role po nazivu dodaje guard / 4d).
        update public.project_assignments a set position = v_pos
         where a.employee_id = v_emp and a.project_id = p.id and a.status <> 'cancelled'
           and nullif(public.rate_trim(a.position), '') is null and v_pos is not null;
        continue;
      end if;

      select min(t.week_start), max(d.work_date) filter (where d.hours > 0) into v_first, v_last
        from public.timesheets t cross join lateral public.timesheet_days(t) d
       where t.employee_id = v_emp and t.project_id = p.id;
      v_end := case when p.status = 'completed' and p.end_date is not null then greatest(p.end_date, v_last) end;

      insert into public.project_assignments (employee_id, employee_name, project_id, project_name, position,
                                              project_role_id, start_date, end_date, status, legacy_source, notes)
      select v_emp,
             coalesce(nullif(btrim(e.value ->> 'employee_name'), ''), btrim(coalesce(em.last_name, '') || ' ' || coalesce(em.first_name, ''))),
             p.id, p.name, v_pos, v_role,
             least(v_first, p.start_date, p.created_date::date), v_end, 'active', 'assigned_employees_json',
             'Prenos sa spiska radnika projekta (migracija 03)'
        from public.employees em where em.id = v_emp;
    end loop;
  end loop;
end $$;

-- 4c. Par (radnik, projekat) sa satnicama, a bez dodele: završena dodela od prvog do poslednjeg dana sa satima.
insert into public.project_assignments (employee_id, employee_name, project_id, project_name, start_date, end_date,
                                        status, legacy_source, notes)
select x.employee_id,
       btrim(coalesce(em.last_name, '') || ' ' || coalesce(em.first_name, '')),
       x.project_id, pr.name, x.first_day, x.last_day, 'completed', 'timesheets',
       'Napravljeno iz satnica (radnik nije bio na spisku projekta, migracija 03)'
  from (
    select t.employee_id, t.project_id,
           coalesce(min(d.work_date) filter (where d.hours > 0), min(t.week_start)) as first_day,
           coalesce(max(d.work_date) filter (where d.hours > 0), max(t.week_start) + 6) as last_day
      from public.timesheets t cross join lateral public.timesheet_days(t) d
     where t.project_id is not null
     group by t.employee_id, t.project_id
  ) x
  join public.employees em on em.id = x.employee_id
  join public.projects pr on pr.id = x.project_id
 where not exists (select 1 from public.project_assignments a
                    where a.employee_id = x.employee_id and a.project_id = x.project_id and a.status <> 'cancelled');

-- 4d. Job Role za sve postojeće dodele po nazivu pozicije.
update public.project_assignments a set project_role_id = r.id, position = r.title
  from public.project_roles r
 where a.project_role_id is null and r.project_id = a.project_id and r.title_key = lower(btrim(a.position))
   and btrim(coalesce(a.position, '')) <> '';

-- 4e. Postojeća preklapanja dodela (R8) i dani sa satima bez dodele — samo report, ništa se ne menja.
select pg_temp.note('project_assignments', a.id::text, 'assignment_overlap',
                    jsonb_build_object('employee_id', a.employee_id, 'project_id', a.project_id,
                                       'a', jsonb_build_object('id', a.id, 'start', a.start_date, 'end', a.end_date),
                                       'b', jsonb_build_object('id', b.id, 'start', b.start_date, 'end', b.end_date)))
  from public.project_assignments a
  join public.project_assignments b on b.employee_id = a.employee_id and b.project_id = a.project_id and b.id::text > a.id::text
 where a.status <> 'cancelled' and b.status <> 'cancelled'
   and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]');

select pg_temp.note('timesheets', x.timesheet_id::text, 'timesheet_outside_assignment',
                    jsonb_build_object('employee_id', x.employee_id, 'project_id', x.project_id, 'dates', x.dates))
  from (
    select t.id as timesheet_id, t.employee_id, t.project_id, jsonb_agg(d.work_date order by d.work_date) as dates
      from public.timesheets t cross join lateral public.timesheet_days(t) d
     where t.project_id is not null and d.hours > 0
       and not exists (select 1 from public.project_assignments a
                        where a.employee_id = t.employee_id and a.project_id = t.project_id and a.status <> 'cancelled'
                          and a.start_date <= d.work_date and (a.end_date is null or a.end_date >= d.work_date))
     group by t.id, t.employee_id, t.project_id
  ) x;

-- ═════════════════════════════ 5. rates: uloga, normalizacija, exclusion (§2.5, R3) ═════════════════════════════
-- 5a. Tarifa projekta za poziciju dobija Job Role po nazivu.
update public.rates r set project_role_id = pr.id
  from public.project_roles pr
 where r.scope = 'project' and r.project_role_id is null and r.project_id = pr.project_id
   and pr.title_key = lower(btrim(r.position)) and btrim(coalesce(r.position, '')) <> '';

-- 5b. Aktivna tarifa sa iznosom 0 nikad nije bila tarifa (izbor je preskače) → neaktivna.
select pg_temp.note('rates', r.id::text, 'rate_zero_deactivated', to_jsonb(r) - 'rate_key')
  from public.rates r where r.status = 'active' and r.amount = 0;
update public.rates set status = 'inactive', change_reason = 'migracija 03: iznos 0 nije tarifa'
 where status = 'active' and amount = 0;

-- 5c. Isti ključ i isti početak više puta: ostaje pobednik izbora (najnoviji created_date, pa id), ostali neaktivni.
do $$
declare
  d record;
begin
  for d in
    select x.id, x.winner, to_jsonb(r) - 'rate_key' as row_data
      from (select id, first_value(id) over w as winner, row_number() over w as rn
              from public.rates where status = 'active'
            window w as (partition by rate_key, effective_from order by created_date desc, id::text collate "C")) x
      join public.rates r on r.id = x.id
     where x.rn > 1
  loop
    perform pg_temp.note('rates', d.id::text, 'rate_duplicate_deactivated',
                         jsonb_build_object('kept', d.winner, 'row', d.row_data));
    update public.rates set status = 'inactive', change_reason = 'migracija 03: duplikat istog početka'
     where id = d.id;
  end loop;
end $$;

-- 5d. Preklapanja istog ključa: svaki dan zadržava tarifu koju je izbor i do sada birao (najnoviji početak).
--     Red se zatvara pre sledećeg; ako je trajao duže od njega, posle kraja sledećeg nastavlja kopija.
do $$
declare
  k text;
  isl record;
  v_row public.rates;
  v_new uuid;
begin
  for k in
    select distinct a.rate_key from public.rates a
      join public.rates b on b.rate_key = a.rate_key and b.id <> a.id and b.status = 'active'
     where a.status = 'active'
       and daterange(a.effective_from, a.effective_to, '[]') && daterange(b.effective_from, b.effective_to, '[]')
  loop
    for isl in
      with r as (
        select id, effective_from as f, effective_to as t, created_date as c
          from public.rates where rate_key = k and status = 'active'),
      p as (select f as d from r union select t + 1 from r where t is not null),
      seg as (select d as s, lead(d) over (order by d) - 1 as e from p),
      w as (
        select seg.s, seg.e,
               (select r.id from r where r.f <= seg.s and (r.t is null or r.t >= seg.s)
                 order by r.f desc, r.c desc, r.id::text collate "C" limit 1) as wid
          from seg),
      g as (select s, e, wid, row_number() over (order by s) - row_number() over (partition by wid order by s) as grp
              from w where wid is not null)
      select wid, min(s) as s, case when bool_or(e is null) then null else max(e) end as e,
             row_number() over (partition by wid order by min(s)) as n
        from g group by wid, grp
       order by wid, s
    loop
      select * into v_row from public.rates where id = isl.wid;
      if isl.n = 1 then
        if v_row.effective_to is distinct from isl.e then
          perform pg_temp.note('rates', v_row.id::text, 'rate_overlap_closed',
                               jsonb_build_object('from', v_row.effective_from, 'old_to', v_row.effective_to, 'new_to', isl.e));
          update public.rates set effective_to = isl.e,
                 change_reason = coalesce(change_reason || '; ', '') || 'migracija 03: zatvoreno pre sledeće tarife'
           where id = v_row.id;
        end if;
      else
        if not exists (select 1 from public.rates x where x.rate_key = k and x.status = 'active'
                          and x.effective_from = isl.s and x.change_reason like 'split: migracija 03%') then
          insert into public.rates (scope, kind, unit, amount, currency, employee_id, employee_name, project_id,
                                    project_name, position, assignment_id, project_role_id, effective_from, effective_to,
                                    status, notes, change_reason, created_date)
          values (v_row.scope, v_row.kind, v_row.unit, v_row.amount, v_row.currency, v_row.employee_id,
                  v_row.employee_name, v_row.project_id, v_row.project_name, v_row.position, v_row.assignment_id,
                  v_row.project_role_id, isl.s, isl.e, 'active', v_row.notes, 'split: migracija 03',
                  v_row.created_date)
          returning id into v_new;
          perform pg_temp.note('rates', v_row.id::text, 'rate_overlap_split',
                               jsonb_build_object('copy_id', v_new, 'from', isl.s, 'to', isl.e));
        end if;
      end if;
    end loop;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rates_no_overlap') then
    alter table public.rates add constraint rates_no_overlap exclude using gist (
      rate_key with =, daterange(effective_from, effective_to, '[]') with &&) where (status = 'active');
  end if;
end $$;

-- ═════════════════════════════ 6. prenos starih izvora u rates (R2) ═════════════════════════════
-- 6a. assigned_employees[*].b2c_rate / b2b_rate → tarifa angažmana na svakoj ne-otkazanoj dodeli para, samo za
--     podintervale koje postojeća tarifa angažmana istog kind-a ne pokriva (ona je i ranije pobeđivala).
with src as (
  select p.id as project_id, (x.value ->> 'employee_id')::uuid as employee_id, s.kind,
         (array_agg(public.rate_value(x.value -> s.field) order by x.ord)
            filter (where public.rate_value(x.value -> s.field) is not null))[1] as amount
    from public.projects p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.assigned_employees) = 'array'
                                                 then p.assigned_employees else '[]'::jsonb end) with ordinality x(value, ord)
    cross join (values ('cost', 'b2c_rate'), ('revenue', 'b2b_rate')) s(kind, field)
   where jsonb_typeof(x.value) = 'object'
     and (x.value ->> 'employee_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   group by p.id, (x.value ->> 'employee_id')::uuid, s.kind
), gaps as (
  select a.id as assignment_id, a.employee_id, a.project_id, src.kind, src.amount, g.r
    from src
    join public.project_assignments a on a.employee_id = src.employee_id and a.project_id = src.project_id
                                     and a.status <> 'cancelled'
    cross join lateral unnest(
      datemultirange(daterange(a.start_date, a.end_date, '[]'))
      - coalesce((select range_agg(daterange(r.effective_from, r.effective_to, '[]')) from public.rates r
                   where r.scope = 'assignment' and r.assignment_id = a.id and r.kind = src.kind
                     and r.status = 'active' and r.amount > 0), '{}'::datemultirange)) g(r)
   where src.amount is not null
)
insert into public.rates (scope, kind, unit, amount, currency, assignment_id, employee_id, project_id, effective_from,
                          effective_to, status, change_reason)
select 'assignment', g.kind, 'hourly', g.amount, 'EUR', g.assignment_id, g.employee_id, g.project_id, lower(g.r),
       upper(g.r) - 1, 'active', 'migracija 03: assigned_employees'
  from gaps g;

-- 6b. job_roles[*].b2b_rate → tarifa Job Role (B2B), samo kad na projektu nema aktivne tarife projekta (prihod) koja
--     je ranije pobeđivala zanimanje; inače report za Finance. b2c_rate zanimanja nikad nije bio nivo izbora → report.
do $$
declare
  j record;
  v_from date;
begin
  for j in
    select p.id as project_id, p.start_date, p.created_date, x.ord, x.value,
           public.rate_trim(x.value ->> 'title') as title,
           public.rate_value(x.value -> 'b2b_rate') as b2b, public.rate_value(x.value -> 'b2c_rate') as b2c,
           r.id as role_id, r.title as role_title
      from public.projects p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.job_roles) = 'array' then p.job_roles
                                                   else '[]'::jsonb end) with ordinality x(value, ord)
      left join public.project_roles r on r.project_id = p.id and r.title_key = lower(public.rate_trim(x.value ->> 'title'))
     where jsonb_typeof(x.value) = 'object'
  loop
    if j.b2c is not null then
      perform pg_temp.note('projects', j.project_id::text, 'job_role_b2c_dropped',
                           jsonb_build_object('title', j.title, 'b2c_rate', j.b2c));
    end if;
    continue when j.b2b is null;
    if j.role_id is null then
      perform pg_temp.note('projects', j.project_id::text, 'job_role_without_role', j.value);
      continue;
    end if;
    continue when exists (select 1 from public.rates r where r.scope = 'project' and r.kind = 'revenue'
                             and r.project_role_id = j.role_id and r.change_reason = 'migracija 03: job_roles');
    -- Ranije je tarifa projekta za tu poziciju ili za ceo projekat pobeđivala zanimanje.
    if exists (select 1 from public.rates r where r.scope = 'project' and r.kind = 'revenue' and r.status = 'active'
                  and r.project_id = j.project_id and r.amount > 0
                  and coalesce(r.change_reason, '') <> 'migracija 03: job_roles'
                  and (r.project_role_id = j.role_id or (r.project_role_id is null and public.rate_trim(r.position) = ''))) then
      perform pg_temp.note('projects', j.project_id::text, 'job_role_rate_shadowed',
                           jsonb_build_object('title', j.title, 'b2b_rate', j.b2b, 'project_role_id', j.role_id));
      continue;
    end if;
    select least(j.start_date, min(d.work_date) filter (where d.hours > 0), j.created_date::date) into v_from
      from public.timesheets t cross join lateral public.timesheet_days(t) d where t.project_id = j.project_id;
    v_from := coalesce(v_from, least(j.start_date, j.created_date::date));
    insert into public.rates (scope, kind, unit, amount, currency, project_id, project_role_id, position,
                              effective_from, status, change_reason)
    values ('project', 'revenue', 'hourly', j.b2b, 'EUR', j.project_id, j.role_id, j.role_title, v_from, 'active',
            'migracija 03: job_roles');
  end loop;
end $$;

-- 6c. employee_private.b2c_hourly_rate / b2b_hourly_rate (profil više nije izvor, D30 K5) → tarifa radnika za
--     podintervale [početak, ∞) koje postojeća tarifa radnika istog kind-a ne pokriva. Kolone profila ostaju (D26).
with src as (
  select ep.employee_id, s.kind, round(s.amount, 2) as amount,
         least(e.start_date, (select min(d.work_date) from public.timesheets t cross join lateral public.timesheet_days(t) d
                               where t.employee_id = ep.employee_id and d.hours > 0), e.created_date::date) as from_day
    from public.employee_private ep
    join public.employees e on e.id = ep.employee_id
    cross join lateral (values ('cost', ep.b2c_hourly_rate), ('revenue', ep.b2b_hourly_rate)) s(kind, amount)
   where s.amount > 0
), gaps as (
  select src.employee_id, src.kind, src.amount, g.r
    from src
    cross join lateral unnest(
      datemultirange(daterange(src.from_day, null, '[]'))
      - coalesce((select range_agg(daterange(r.effective_from, r.effective_to, '[]')) from public.rates r
                   where r.scope = 'employee' and r.employee_id = src.employee_id and r.kind = src.kind
                     and r.status = 'active' and r.amount > 0), '{}'::datemultirange)) g(r)
)
insert into public.rates (scope, kind, unit, amount, currency, employee_id, effective_from, effective_to, status,
                          change_reason)
select 'employee', g.kind, 'hourly', g.amount, 'EUR', g.employee_id, lower(g.r), upper(g.r) - 1, 'active',
       'migracija 03: profil radnika'
  from gaps g;

-- 6d. Posebne satnice iz profila više nisu izvor (spec §5 zna samo za koeficijente) → report po radniku (R4).
select pg_temp.note('employee_private', ep.employee_id::text, 'profile_special_rate_dropped',
                    jsonb_strip_nulls(jsonb_build_object('overtime_rate', ep.overtime_rate, 'weekend_rate', ep.weekend_rate,
                                                         'holiday_rate', ep.holiday_rate)))
  from public.employee_private ep
 where coalesce(ep.overtime_rate, 0) > 0 or coalesce(ep.weekend_rate, 0) > 0 or coalesce(ep.holiday_rate, 0) > 0;

-- 6e. Snimci imena za prikaz (Rate History) na redovima bez njih (npr. upravo prenetim).
update public.rates r set employee_name = btrim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, ''))
  from public.employees e where e.id = r.employee_id and r.employee_name is null;
update public.rates r set project_name = p.name
  from public.projects p where p.id = r.project_id and r.project_name is null;

-- ═════════════════════════════ 7. istorija tarifa (guard_rate_history) ═════════════════════════════
create or replace function public.guard_rate_history() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user boolean := auth.uid() is not null;
  v_a public.project_assignments;
  v_role public.project_roles;
begin
  if tg_op = 'DELETE' then
    if v_user and not public.has_permission('rates.manage') then
      raise exception 'Nemate pravo „rates.manage"' using errcode = '42501';
    end if;
    if public.rate_in_snapshot(old.id) then
      raise exception 'Tarifa je primenjena u satnicama i ne briše se — postavite je na Neaktivna'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(current_setting('app.snapshot_sync', true), '') = 'on'
       and (new.amount, new.currency, new.unit, new.kind, new.scope, new.assignment_id, new.project_id,
            new.project_role_id, new.employee_id, new.effective_from, new.effective_to, new.status)
           is not distinct from
           (old.amount, old.currency, old.unit, old.kind, old.scope, old.assignment_id, old.project_id,
            old.project_role_id, old.employee_id, old.effective_from, old.effective_to, old.status) then
      return new; -- osvežen snimak naziva (projekat, radnik, Job Role)
    end if;
    -- End / Cancel dodele (assignments.manage) zatvaraju ili gase tarife te dodele — posledica, ne nova cena.
    if v_user and not public.has_permission('rates.manage')
       and coalesce(current_setting('app.assignment_rpc', true), '') <> 'on' then
      raise exception 'Nemate pravo „rates.manage"' using errcode = '42501';
    end if;
    if (new.amount, new.currency, new.unit, new.kind, new.scope, new.assignment_id, new.project_id,
        new.project_role_id, new.employee_id, new.effective_from, public.rate_trim(new.position))
       is distinct from
       (old.amount, old.currency, old.unit, old.kind, old.scope, old.assignment_id, old.project_id,
        old.project_role_id, old.employee_id, old.effective_from, public.rate_trim(old.position)) then
      raise exception 'Iznos, valuta, jedinica, nivo i početak važenja tarife se ne menjaju — novu cenu unesite kao „Promeni od datuma"'
        using errcode = 'check_violation';
    end if;
    if new.status = 'active' and new.amount <= 0 then
      raise exception 'Iznos tarife mora biti veći od 0' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- INSERT
  if v_user and not public.has_permission('rates.manage') then
    raise exception 'Nemate pravo „rates.manage"' using errcode = '42501';
  end if;
  if new.status = 'active' and new.amount <= 0 then
    raise exception 'Iznos tarife mora biti veći od 0' using errcode = 'check_violation';
  end if;
  if new.scope = 'assignment' then
    select * into v_a from public.project_assignments a where a.id = new.assignment_id;
    if v_a.id is null then
      raise exception 'Tarifa angažmana mora biti vezana za dodelu' using errcode = 'check_violation';
    end if;
    new.employee_id := v_a.employee_id;
    new.employee_name := v_a.employee_name;
    new.project_id := v_a.project_id;
    new.project_name := v_a.project_name;
    new.project_role_id := null;
    new.position := v_a.position;
  elsif new.scope = 'project' then
    new.assignment_id := null;
    if new.project_id is null then
      raise exception 'Tarifa projekta mora biti vezana za projekat' using errcode = 'check_violation';
    end if;
    if new.project_role_id is null and public.rate_trim(new.position) <> '' then
      select r.id into new.project_role_id from public.project_roles r
       where r.project_id = new.project_id and r.title_key = lower(btrim(new.position));
      if new.project_role_id is null then
        raise exception 'Pozicija „%" nije Job Role ovog projekta — prvo dodajte Job Role', public.rate_trim(new.position)
          using errcode = 'check_violation';
      end if;
    end if;
    if new.project_role_id is not null then
      select * into v_role from public.project_roles r where r.id = new.project_role_id;
      if v_role.project_id is distinct from new.project_id then
        raise exception 'Job Role ne pripada projektu tarife' using errcode = 'check_violation';
      end if;
      new.position := v_role.title;
    end if;
    select p.name into new.project_name from public.projects p where p.id = new.project_id;
  else -- employee
    if new.employee_id is null then
      raise exception 'Tarifa radnika mora biti vezana za radnika' using errcode = 'check_violation';
    end if;
    new.assignment_id := null;
    new.project_id := null;
    new.project_name := null;
    new.project_role_id := null;
    new.position := null;
  end if;
  if new.employee_id is not null then
    select btrim(coalesce(e.last_name, '') || ' ' || coalesce(e.first_name, '')) into new.employee_name
      from public.employees e where e.id = new.employee_id;
  end if;
  return new;
end $$;
drop trigger if exists rates_guard_history on public.rates;
create trigger rates_guard_history before insert or update or delete on public.rates
  for each row execute function public.guard_rate_history();

-- ═════════════════════════════ 8. jedan izbor tarife u bazi (resolve_rate) ═════════════════════════════
-- Redosled (ista za B2B i B2C): tarifa angažmana → tarifa Job Role → tarifa projekta (ceo projekat) → tarifa radnika.
-- Dodela: p_assignment ako pokriva datum, inače ne-otkazana dodela koja pokriva datum (najnoviji početak, pa id).
-- Unutar nivoa pobeđuje najnoviji effective_from (uz rates_no_overlap uvek jedan). Valuta je dozvoljena (K3);
-- pobednik koji nije po satu → {error:'unit'}; ništa → {error:'missing'} (D11). Isto kao src/lib/payroll/rates.js v2.
create or replace function public.resolve_rate(p_side text, p_employee uuid, p_project uuid, p_date date,
  p_assignment uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kind text;
  v_a public.project_assignments;
  v_r public.rates;
  v_source text;
begin
  v_kind := case p_side when 'worker' then 'cost' when 'client' then 'revenue' end;
  if v_kind is null then raise exception 'Nepoznata strana tarife: %', p_side; end if;
  if p_date is null then raise exception 'Nedostaje datum rada za izbor tarife'; end if;
  if p_employee is null then raise exception 'Nedostaje radnik za izbor tarife'; end if;

  if p_project is not null then
    select * into v_a from public.project_assignments a
     where a.employee_id = p_employee and a.project_id = p_project and a.status <> 'cancelled'
       and a.start_date <= p_date and (a.end_date is null or a.end_date >= p_date)
     order by (a.id = p_assignment) desc nulls last, a.start_date desc, a.id::text collate "C"
     limit 1;
  end if;

  foreach v_source in array array['assignment_rate', 'role_rate', 'project_rate', 'employee_rate'] loop
    v_r := null;
    if v_source = 'assignment_rate' and v_a.id is not null then
      select * into v_r from public.rates r
       where r.scope = 'assignment' and r.assignment_id = v_a.id and r.kind = v_kind and r.status = 'active'
         and r.amount > 0 and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
       order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;
    elsif v_source = 'role_rate' and v_a.project_role_id is not null then
      select * into v_r from public.rates r
       where r.scope = 'project' and r.project_id = p_project and r.project_role_id = v_a.project_role_id
         and r.kind = v_kind and r.status = 'active' and r.amount > 0
         and (r.employee_id is null or r.employee_id = p_employee)
         and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
       order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;
    elsif v_source = 'project_rate' and p_project is not null then
      select * into v_r from public.rates r
       where r.scope = 'project' and r.project_id = p_project and r.project_role_id is null
         and public.rate_trim(r.position) = '' and r.kind = v_kind and r.status = 'active' and r.amount > 0
         and (r.employee_id is null or r.employee_id = p_employee)
         and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
       order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;
    elsif v_source = 'employee_rate' then
      select * into v_r from public.rates r
       where r.scope = 'employee' and r.employee_id = p_employee and r.kind = v_kind and r.status = 'active'
         and r.amount > 0 and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date)
       order by r.effective_from desc, r.created_date desc, r.id::text collate "C" limit 1;
    end if;

    if v_r.id is not null then
      if v_r.unit <> 'hourly' then
        return jsonb_build_object('error', 'unit', 'source', v_source, 'ref', v_r.id::text, 'amount', v_r.amount,
                                  'currency', v_r.currency, 'unit', v_r.unit, 'assignment_id', v_a.id,
                                  'project_role_id', v_a.project_role_id);
      end if;
      return jsonb_build_object('rate', round(v_r.amount, 2), 'currency', v_r.currency, 'source', v_source,
                                'ref', v_r.id::text, 'assignment_id', v_a.id, 'project_role_id', v_a.project_role_id);
    end if;
  end loop;
  return jsonb_build_object('error', 'missing', 'assignment_id', v_a.id, 'project_role_id', v_a.project_role_id);
end $$;

-- Stari izbor se čuva do W3 (provera razlika, R4).
do $$
begin
  if to_regprocedure('public.resolve_timesheet_rate_v1(text, uuid, uuid, date)') is null then
    alter function public.resolve_timesheet_rate(text, uuid, uuid, date) rename to resolve_timesheet_rate_v1;
  end if;
end $$;

-- Omotač za postojeći guard_timesheet (dok ga T-A2 ne zameni): oblik {rate, source, ref}; tarifa koja nije EUR je
-- za stari obračun i dalje greška jedinice (obračun reda je u EUR, D7), bez prelaska na sledeći nivo.
create or replace function public.resolve_timesheet_rate(p_side text, p_employee_id uuid, p_project_id uuid, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb := public.resolve_rate(p_side, p_employee_id, p_project_id, p_date, null);
begin
  if v ->> 'error' = 'missing' then
    return jsonb_build_object('error', 'missing');
  end if;
  if v ->> 'error' = 'unit' then
    return v - 'assignment_id' - 'project_role_id';
  end if;
  if v ->> 'currency' <> 'EUR' then
    return jsonb_build_object('error', 'unit', 'source', v ->> 'source', 'ref', v ->> 'ref', 'amount', v -> 'rate',
                              'currency', v ->> 'currency', 'unit', 'hourly');
  end if;
  return jsonb_build_object('rate', v -> 'rate', 'source', v ->> 'source', 'ref', v ->> 'ref');
end $$;

-- Oznaka novog izvora u poruci odobravanja (ostalo isto kao 20261114180000).
create or replace function public.timesheet_rate_problem(p_b2c numeric, p_b2b numeric, p_worker jsonb, p_client jsonb,
                                                        p_date date)
returns text
language plpgsql stable set search_path = '' as $$
declare
  s record;
  v_missing text[] := '{}';
  v_source_label constant jsonb := '{"assignment_rate": "tarifa angažmana", "role_rate": "tarifa Job Role",
    "project_rate": "tarifa projekta/pozicije", "employee_rate": "tarifa radnika",
    "project_employee": "satnica radnika na projektu", "job_role": "zanimanje na projektu", "profile": "profil radnika"}';
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

-- ═════════════════════════════ 9. RPC: tarife (Rate History) ═════════════════════════════
create or replace function public.rate_reason(p_reason text) returns text
language plpgsql immutable set search_path = '' as $$
begin
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Razlog je obavezan (najmanje 5 znakova)' using errcode = 'check_violation';
  end if;
  return btrim(p_reason);
end $$;

-- Nov red istorije: {scope, kind, assignment_id, project_id, project_role_id, employee_id, effective_from,
-- effective_to, amount, currency, unit, notes, reason}.
create or replace function public.set_rate(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_project uuid := nullif(p ->> 'project_id', '')::uuid;
  v_assignment uuid := nullif(p ->> 'assignment_id', '')::uuid;
begin
  perform public.require_permission('rates.manage');
  if v_assignment is not null then
    select a.project_id into v_project from public.project_assignments a where a.id = v_assignment;
  end if;
  if v_project is not null and not public.can_see_project(v_project) then
    raise exception 'Nemate pristup ovom projektu' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce(nullif(btrim(p ->> 'reason'), ''), 'Nova tarifa'), true);
  insert into public.rates (scope, kind, unit, amount, currency, assignment_id, project_id, project_role_id, employee_id,
                            position, effective_from, effective_to, status, notes, change_reason)
  values (coalesce(nullif(p ->> 'scope', ''), 'project'), p ->> 'kind', coalesce(nullif(p ->> 'unit', ''), 'hourly'),
          (p ->> 'amount')::numeric, coalesce(nullif(p ->> 'currency', ''), 'EUR'), v_assignment, v_project,
          nullif(p ->> 'project_role_id', '')::uuid, nullif(p ->> 'employee_id', '')::uuid, nullif(p ->> 'position', ''),
          (p ->> 'effective_from')::date, nullif(p ->> 'effective_to', '')::date, 'active', nullif(p ->> 'notes', ''),
          nullif(btrim(p ->> 'reason'), ''))
  returning id into v_id;
  perform set_config('app.audit_reason', '', true);
  return v_id;
end $$;

-- Promena cene od datuma: stari red se zatvara dan pre (ili postaje neaktivan ako je isti početak), nov red nosi
-- novu cenu do starog kraja. Odobrene satnice čuvaju svoj snimak (D10).
create or replace function public.change_rate(p_rate uuid, p_effective_from date, p_amount numeric, p_currency text,
  p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.rates;
  v_id uuid := gen_random_uuid();
  v_reason text;
begin
  perform public.require_permission('rates.manage');
  select * into v_old from public.rates where id = p_rate for update;
  if v_old.id is null then
    raise exception 'Tarifa ne postoji' using errcode = 'check_violation';
  end if;
  if v_old.project_id is not null and not public.can_see_project(v_old.project_id) then
    raise exception 'Nemate pristup ovom projektu' using errcode = '42501';
  end if;
  if v_old.status <> 'active' then
    raise exception 'Menja se samo aktivna tarifa' using errcode = 'check_violation';
  end if;
  if p_effective_from is null or p_effective_from < v_old.effective_from
     or (v_old.effective_to is not null and p_effective_from > v_old.effective_to) then
    raise exception 'Datum promene mora biti u periodu važenja tarife (od % do %)', to_char(v_old.effective_from, 'DD.MM.YYYY'),
      coalesce(to_char(v_old.effective_to, 'DD.MM.YYYY'), 'neodređeno') using errcode = 'check_violation';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Iznos tarife mora biti veći od 0' using errcode = 'check_violation';
  end if;
  v_reason := public.rate_reason(p_reason);
  perform set_config('app.audit_reason', v_reason, true);

  if p_effective_from = v_old.effective_from then
    update public.rates set status = 'inactive' where id = v_old.id;
  else
    update public.rates set effective_to = p_effective_from - 1 where id = v_old.id;
  end if;
  insert into public.rates (id, scope, kind, unit, amount, currency, assignment_id, project_id, project_role_id,
                            employee_id, position, effective_from, effective_to, status, notes, change_reason)
  values (v_id, v_old.scope, v_old.kind, v_old.unit, round(p_amount, 2), coalesce(nullif(p_currency, ''), v_old.currency),
          v_old.assignment_id, v_old.project_id, v_old.project_role_id, v_old.employee_id, v_old.position,
          p_effective_from, v_old.effective_to, 'active', v_old.notes, v_reason);
  update public.rates set superseded_by = v_id, change_reason = coalesce(change_reason, v_reason) where id = v_old.id;
  perform set_config('app.audit_reason', '', true);
  return v_id;
end $$;

-- ═════════════════════════════ 10. RPC: angažmani (A2) ═════════════════════════════
create or replace function public.assignment_access(p_project uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('assignments.manage');
  if not public.can_see_project(p_project) then
    raise exception 'Nemate pristup ovom projektu' using errcode = '42501';
  end if;
end $$;

-- Tarifa iz {amount, currency} uz dodelu (od početka dodele).
create or replace function public.assignment_rate_input(p_assignment uuid, p_kind text, p_rate jsonb, p_from date,
  p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_rate is null or jsonb_typeof(p_rate) <> 'object' or coalesce(nullif(p_rate ->> 'amount', '')::numeric, 0) <= 0 then
    return;
  end if;
  perform public.require_permission('rates.manage');
  insert into public.rates (scope, kind, unit, amount, currency, assignment_id, effective_from, status, change_reason)
  values ('assignment', p_kind, 'hourly', round((p_rate ->> 'amount')::numeric, 2),
          coalesce(nullif(p_rate ->> 'currency', ''), 'EUR'), p_assignment, p_from, 'active', p_reason);
end $$;

-- Polja: employee_id, project_id, project_role_id, start_date, end_date, default_shift_id, notes, assignment_type,
-- source_assignment_id, leave_request_id, b2c {amount, currency}, b2b {amount, currency}, reason.
create or replace function public.create_assignment(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_emp public.employees;
  v_project public.projects;
  v_start date := nullif(p ->> 'start_date', '')::date;
  v_reason text := nullif(btrim(p ->> 'reason'), '');
begin
  select * into v_project from public.projects where id = nullif(p ->> 'project_id', '')::uuid;
  if v_project.id is null then
    raise exception 'Projekat ne postoji' using errcode = 'check_violation';
  end if;
  perform public.assignment_access(v_project.id);
  select * into v_emp from public.employees where id = nullif(p ->> 'employee_id', '')::uuid;
  if v_emp.id is null then
    raise exception 'Radnik ne postoji' using errcode = 'check_violation';
  end if;
  if v_start is null then
    raise exception 'Datum početka dodele je obavezan' using errcode = 'check_violation';
  end if;
  if nullif(p ->> 'project_role_id', '') is null then
    raise exception 'Job Role je obavezan' using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', coalesce(v_reason, 'Nova dodela'), true);
  perform set_config('app.assignment_rpc', 'on', true);
  insert into public.project_assignments (employee_id, employee_name, project_id, project_name, project_role_id,
                                          start_date, end_date, default_shift_id, notes, assignment_type,
                                          source_assignment_id, leave_request_id, status)
  values (v_emp.id, btrim(coalesce(v_emp.last_name, '') || ' ' || coalesce(v_emp.first_name, '')), v_project.id,
          v_project.name, (p ->> 'project_role_id')::uuid, v_start, nullif(p ->> 'end_date', '')::date,
          nullif(p ->> 'default_shift_id', '')::uuid, nullif(p ->> 'notes', ''),
          coalesce(nullif(p ->> 'assignment_type', ''), 'standard'), nullif(p ->> 'source_assignment_id', '')::uuid,
          nullif(p ->> 'leave_request_id', '')::uuid, 'active')
  returning id into v_id;
  perform public.assignment_rate_input(v_id, 'cost', p -> 'b2c', v_start, coalesce(v_reason, 'Tarifa pri dodeli'));
  perform public.assignment_rate_input(v_id, 'revenue', p -> 'b2b', v_start, coalesce(v_reason, 'Tarifa pri dodeli'));
  perform set_config('app.assignment_rpc', 'off', true);
  perform set_config('app.audit_reason', '', true);
  return v_id;
end $$;

-- Uloga, datumi, smena, napomena (radnik i projekat se ne menjaju). Polja koja nisu u p ostaju ista.
create or replace function public.update_assignment(p_id uuid, p jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
begin
  select * into v_a from public.project_assignments where id = p_id for update;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  perform public.assignment_access(v_a.project_id);
  if v_a.status = 'cancelled' then
    raise exception 'Otkazana dodela se ne menja' using errcode = 'check_violation';
  end if;
  if p ? 'project_role_id' and nullif(p ->> 'project_role_id', '') is null then
    raise exception 'Job Role je obavezan' using errcode = 'check_violation';
  end if;
  perform set_config('app.audit_reason', coalesce(nullif(btrim(p_reason), ''), 'Izmena dodele'), true);
  perform set_config('app.assignment_rpc', 'on', true);
  update public.project_assignments set
    project_role_id = case when p ? 'project_role_id' then (p ->> 'project_role_id')::uuid else project_role_id end,
    start_date = case when p ? 'start_date' then (p ->> 'start_date')::date else start_date end,
    end_date = case when p ? 'end_date' then nullif(p ->> 'end_date', '')::date else end_date end,
    default_shift_id = case when p ? 'default_shift_id' then nullif(p ->> 'default_shift_id', '')::uuid else default_shift_id end,
    notes = case when p ? 'notes' then nullif(p ->> 'notes', '') else notes end
  where id = p_id;
  perform set_config('app.assignment_rpc', 'off', true);
  perform set_config('app.audit_reason', '', true);
  return p_id;
end $$;

-- Kraj angažmana: ne pre poslednjeg dana rada; otvorene tarife angažmana se zatvaraju na taj dan.
create or replace function public.end_assignment(p_id uuid, p_end_date date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
  v_last date;
  v_reason text;
begin
  select * into v_a from public.project_assignments where id = p_id for update;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  perform public.assignment_access(v_a.project_id);
  v_reason := public.rate_reason(p_reason);
  if v_a.status = 'cancelled' then
    raise exception 'Otkazana dodela se ne završava' using errcode = 'check_violation';
  end if;
  if p_end_date is null or p_end_date < v_a.start_date then
    raise exception 'Kraj dodele ne može biti pre početka (%)', to_char(v_a.start_date, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;
  select max(d) into v_last from public.assignment_work_days(v_a.employee_id, v_a.project_id, v_a.start_date,
                                                             v_a.end_date, v_a.id) d;
  if v_last is not null and p_end_date < v_last then
    raise exception 'Poslednji dan rada na dodeli je % — kraj ne može biti pre njega', to_char(v_last, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;

  perform set_config('app.audit_reason', v_reason, true);
  perform set_config('app.assignment_rpc', 'on', true);
  update public.project_assignments
     set end_date = p_end_date, ended_at = now(), ended_by = auth.uid(), end_reason = v_reason
   where id = p_id;
  update public.rates
     set effective_to = p_end_date
   where scope = 'assignment' and assignment_id = p_id and status = 'active' and effective_from <= p_end_date
     and (effective_to is null or effective_to > p_end_date);
  perform set_config('app.assignment_rpc', 'off', true);
  perform set_config('app.audit_reason', '', true);
  return p_id;
end $$;

-- Transfer: stara dodela se završava dan pre, nova (assignment_type 'transfer') počinje p_date. Sati ostaju na staroj.
create or replace function public.transfer_assignment(p_id uuid, p_date date, p_project uuid, p_role uuid, p_rates jsonb,
  p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
  v_reason text := public.rate_reason(p_reason);
begin
  select * into v_a from public.project_assignments where id = p_id;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  if p_date is null or p_date <= v_a.start_date then
    raise exception 'Datum transfera mora biti posle početka stare dodele (%)', to_char(v_a.start_date, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;
  perform public.end_assignment(p_id, p_date - 1, v_reason);
  return public.create_assignment(jsonb_build_object(
    'employee_id', v_a.employee_id, 'project_id', coalesce(p_project, v_a.project_id),
    'project_role_id', coalesce(p_role, v_a.project_role_id), 'start_date', p_date,
    'default_shift_id', case when coalesce(p_project, v_a.project_id) = v_a.project_id then v_a.default_shift_id end,
    'assignment_type', 'transfer', 'source_assignment_id', v_a.id,
    'b2c', p_rates -> 'b2c', 'b2b', p_rates -> 'b2b', 'reason', v_reason));
end $$;

-- Dodatni angažman istog radnika, bez ukidanja starog.
create or replace function public.additional_assignment(p_id uuid, p jsonb, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
begin
  select * into v_a from public.project_assignments where id = p_id;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  return public.create_assignment(coalesce(p, '{}'::jsonb) || jsonb_build_object(
    'employee_id', v_a.employee_id, 'assignment_type', 'additional', 'source_assignment_id', v_a.id,
    'reason', public.rate_reason(p_reason)));
end $$;

-- Poništavanje: samo dodela bez rada i bez tarife koja je u snimku satnice. Tarife dodele postaju neaktivne.
create or replace function public.cancel_assignment(p_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
  v_reason text;
begin
  select * into v_a from public.project_assignments where id = p_id for update;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  perform public.assignment_access(v_a.project_id);
  v_reason := public.rate_reason(p_reason);
  if exists (select 1 from public.assignment_work_days(v_a.employee_id, v_a.project_id, v_a.start_date, v_a.end_date, v_a.id)) then
    raise exception 'Dodela ima unete sate i ne poništava se — završite je (End)' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.rates r where r.assignment_id = p_id and public.rate_in_snapshot(r.id)) then
    raise exception 'Tarifa dodele je u odobrenoj satnici — dodela se ne poništava, završite je (End)'
      using errcode = 'check_violation';
  end if;
  perform set_config('app.audit_reason', v_reason, true);
  perform set_config('app.assignment_rpc', 'on', true);
  update public.project_assignments
     set status = 'cancelled', ended_at = now(), ended_by = auth.uid(), end_reason = v_reason
   where id = p_id;
  update public.rates set status = 'inactive', change_reason = coalesce(change_reason || '; ', '') || 'dodela poništena'
   where assignment_id = p_id and status = 'active';
  perform set_config('app.assignment_rpc', 'off', true);
  perform set_config('app.audit_reason', '', true);
  return p_id;
end $$;

-- ═════════════════════════════ 11. keš: uključivanje i prvo punjenje (bez tarifa, R2) ═════════════════════════════
drop trigger if exists project_assignments_sync_cache on public.project_assignments;
create trigger project_assignments_sync_cache after insert or update or delete on public.project_assignments
  for each row execute function public.sync_project_assignment_cache();
drop trigger if exists project_roles_sync_cache on public.project_roles;
create trigger project_roles_sync_cache after insert or update or delete on public.project_roles
  for each row execute function public.sync_project_assignment_cache();

select public.refresh_project_assignment_cache(p.id) from public.projects p;

drop trigger if exists projects_guard_cache on public.projects;
create trigger projects_guard_cache before insert or update on public.projects
  for each row execute function public.guard_project_cache();

-- ═════════════════════════════ 12. razlika izbora tarife za neodobrene satnice (R4) ═════════════════════════════
with now_res as (
  select b.*, public.resolve_rate(b.side, b.employee_id, b.project_id, b.work_date, null) as res_new from ma03_before b
), cmp as (
  select n.*,
         jsonb_build_object('rate', n.res ->> 'rate', 'currency', case when n.res ? 'rate' then 'EUR' else n.res ->> 'currency' end,
                            'error', n.res ->> 'error') as o,
         jsonb_build_object('rate', n.res_new ->> 'rate', 'currency', n.res_new ->> 'currency', 'error', n.res_new ->> 'error') as nw
    from now_res n
)
select pg_temp.note('timesheets', c.timesheet_id::text, 'rate_resolution_changed',
                    jsonb_build_object('timesheet_id', c.timesheet_id, 'date', c.work_date, 'side', c.side,
                                       'old', c.res, 'new', c.res_new))
  from cmp c
 where (c.o ->> 'error') is distinct from (c.nw ->> 'error')
    or (c.o ->> 'error') is null and ((c.o ->> 'rate')::numeric is distinct from (c.nw ->> 'rate')::numeric
                                      or (c.o ->> 'currency') is distinct from (c.nw ->> 'currency'));

drop table if exists pg_temp.ma03_before;

-- ═════════════════════════════ 13. prava (D14) ═════════════════════════════
revoke execute on function
  public.assignment_work_days(uuid, uuid, date, date, uuid), public.rate_in_snapshot(uuid),
  public.fill_assignment_engagement(), public.guard_assignment_overlap(), public.guard_assignment_rates(),
  public.refresh_project_assignment_cache(uuid), public.sync_project_assignment_cache(), public.guard_project_cache(),
  public.guard_rate_history(), public.resolve_rate(text, uuid, uuid, date, uuid),
  public.resolve_timesheet_rate(text, uuid, uuid, date), public.resolve_timesheet_rate_v1(text, uuid, uuid, date),
  public.timesheet_rate_problem(numeric, numeric, jsonb, jsonb, date), public.rate_reason(text),
  public.assignment_access(uuid), public.assignment_rate_input(uuid, text, jsonb, date, text)
from public, anon, authenticated;

revoke execute on function
  public.assignment_display_status(public.project_assignments, date), public.set_rate(jsonb),
  public.change_rate(uuid, date, numeric, text, text), public.create_assignment(jsonb),
  public.update_assignment(uuid, jsonb, text), public.end_assignment(uuid, date, text),
  public.transfer_assignment(uuid, date, uuid, uuid, jsonb, text), public.additional_assignment(uuid, jsonb, text),
  public.cancel_assignment(uuid, text)
from public, anon;
grant execute on function
  public.assignment_display_status(public.project_assignments, date), public.set_rate(jsonb),
  public.change_rate(uuid, date, numeric, text, text), public.create_assignment(jsonb),
  public.update_assignment(uuid, jsonb, text), public.end_assignment(uuid, date, text),
  public.transfer_assignment(uuid, date, uuid, uuid, jsonb, text), public.additional_assignment(uuid, jsonb, text),
  public.cancel_assignment(uuid, text)
to authenticated;

-- rates.rate_key (generisana kolona) poziva rate_trim pri svakom upisu tarife — i kroz API (rates.manage).
-- Čista funkcija nad tekstom, bez podataka: izvršavanje sme svaki prijavljen korisnik (anon i dalje ne).
grant execute on function public.rate_trim(text) to authenticated;
