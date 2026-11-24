-- Workforce model (Teamora spec v1.4 §13.03–13.05, §14.1, 4.3.3; docs/TEAMORA-DATA-MODEL.md §2.11, traka T-G).
--
-- Potreban broj radnika po projektu, Job Role, smeni i datumu (workforce_requirements), raspored vezan za projekat,
-- angažman i smenu (schedules), jedinstvena definicija dostupnosti (workforce_coverage, worker_is_free) i
-- vrsta odsustva za Gantt (absence_kind). JS dvojnik: src/lib/workforce.js (isti primeri u testovima).
--
-- Zavisi od: 20261125010000 (shifts, project_roles, has_permission, can_see_project, audit_row, migration_report)
--            20261125030000 (project_assignments.project_role_id, default_shift_id).
-- Bezbedno za produkciju: samo dodaje (kolone, tabela, funkcije); postojeći redovi rasporeda ostaju kakvi jesu,
-- dobijaju samo izvedeni start_at/end_at. Preklapanja među starim redovima se ne popravljaju nego idu u migration_report.

create extension if not exists btree_gist with schema extensions;

-- ═════════════════════════════ absence_kind ═════════════════════════════
-- Isto kao absenceKind() u src/lib/workforce.js.
create or replace function public.absence_kind(p_leave_type text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_leave_type in ('vacation', 'personal', 'unpaid') then 'leave'
    when p_leave_type = 'sick' then 'sick_leave'
    else 'other_absence'
  end
$$;

-- ═════════════════════════════ schedules: projekat, angažman, smena, status, interval ═════════════════════════════
alter table public.schedules
  add column if not exists project_id uuid references public.projects (id) on delete set null,
  add column if not exists assignment_id uuid references public.project_assignments (id) on delete set null,
  add column if not exists shift_id uuid references public.shifts (id) on delete set null,
  add column if not exists status text not null default 'assigned',
  add column if not exists start_at timestamp,
  add column if not exists end_at timestamp;

alter table public.schedules drop constraint if exists schedules_status_check;
alter table public.schedules add constraint schedules_status_check
  check (status in ('assigned', 'standby', 'replacement', 'released'));

create index if not exists schedules_employee_date_idx on public.schedules (employee_id, date);
create index if not exists schedules_project_date_idx on public.schedules (project_id, date);
create index if not exists schedules_assignment_idx on public.schedules (assignment_id);

-- Izvedena polja: smena (ako je izabrana) određuje vreme; start_at/end_at su uvek date + shift_start/shift_end,
-- a kraj ≤ početak znači da smena prelazi ponoć (kraj je sutradan). Angažman mora biti istog radnika i projekta.
create or replace function public.schedules_fill() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_st time; v_et time; v_shift_project uuid; v_found boolean;
  v_a_emp uuid; v_a_project uuid;
begin
  if new.assignment_id is not null then
    select a.employee_id, a.project_id into v_a_emp, v_a_project from public.project_assignments a where a.id = new.assignment_id;
    if v_a_emp is distinct from new.employee_id then
      raise exception 'Angažman ne pripada tom radniku' using errcode = 'check_violation';
    end if;
    if new.project_id is null then
      new.project_id := v_a_project;
    elsif new.project_id is distinct from v_a_project then
      raise exception 'Angažman ne pripada tom projektu' using errcode = 'check_violation';
    end if;
  end if;

  if new.shift_id is not null then
    select s.start_time, s.end_time, s.project_id, true into v_st, v_et, v_shift_project, v_found
      from public.shifts s where s.id = new.shift_id;
    if v_found is not true then
      raise exception 'Smena ne postoji' using errcode = 'foreign_key_violation';
    end if;
    if v_shift_project is not null and new.project_id is distinct from v_shift_project then
      raise exception 'Smena pripada drugom projektu' using errcode = 'check_violation';
    end if;
    new.shift_start := to_char(v_st, 'HH24:MI');
    new.shift_end := to_char(v_et, 'HH24:MI');
  end if;

  v_st := new.shift_start::time;
  v_et := new.shift_end::time;
  new.start_at := new.date + v_st;
  new.end_at := new.date + v_et + case when v_et <= v_st then interval '1 day' else interval '0' end;
  return new;
end $$;

drop trigger if exists schedules_fill on public.schedules;
create trigger schedules_fill before insert or update on public.schedules
  for each row execute function public.schedules_fill();

-- Stari redovi: izvedi interval (ne diramo updated_date, to nije izmena sadržaja).
alter table public.schedules disable trigger schedules_updated;
update public.schedules s
   set start_at = s.date + s.shift_start::time,
       end_at = s.date + s.shift_end::time
               + case when s.shift_end::time <= s.shift_start::time then interval '1 day' else interval '0' end
 where s.start_at is null or s.end_at is null;
alter table public.schedules enable trigger schedules_updated;

-- Isti radnik ne može imati dva rasporeda (osim „released") koji se preklapaju. Postojeći preklopi se ne diraju
-- (ne blokiraju migraciju): idu u migration_report; trigger važi za nove i izmenjene redove.
create or replace function public.guard_schedule_overlap() returns trigger
language plpgsql set search_path = '' as $$
declare v_other record;
begin
  if new.status = 'released' then return new; end if;
  if tg_op = 'UPDATE'
     and new.employee_id = old.employee_id and new.start_at = old.start_at and new.end_at = old.end_at
     and new.status = old.status then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('sch:' || new.employee_id::text));
  select s.id, s.date, s.project_id into v_other
    from public.schedules s
   where s.employee_id = new.employee_id and s.id <> new.id and s.status <> 'released'
     and tsrange(s.start_at, s.end_at, '[)') && tsrange(new.start_at, new.end_at, '[)')
   limit 1;
  if found then
    raise exception 'Radnik već ima raspored koji se preklapa (% – %) u istom vremenu',
      to_char(new.start_at, 'DD.MM.YYYY HH24:MI'), to_char(new.end_at, 'DD.MM.YYYY HH24:MI')
      using errcode = 'exclusion_violation';
  end if;
  return new;
end $$;

drop trigger if exists schedules_overlap on public.schedules;
create trigger schedules_overlap before insert or update on public.schedules
  for each row execute function public.guard_schedule_overlap();

insert into public.migration_report (migration, entity, entity_id, issue, details)
select '20261125070000_workforce_model', 'schedules', a.id::text, 'schedule_overlap',
       jsonb_build_object('employee_id', a.employee_id, 'other_schedule_id', b.id,
                          'a', jsonb_build_array(a.start_at, a.end_at), 'b', jsonb_build_array(b.start_at, b.end_at))
  from public.schedules a
  join public.schedules b
    on b.employee_id = a.employee_id and b.id > a.id
   and a.status <> 'released' and b.status <> 'released'
   and tsrange(a.start_at, a.end_at, '[)') && tsrange(b.start_at, b.end_at, '[)')
 where not exists (
   select 1 from public.migration_report m
    where m.migration = '20261125070000_workforce_model' and m.issue = 'schedule_overlap' and m.entity_id = a.id::text
      and m.details ->> 'other_schedule_id' = b.id::text);

-- ═════════════════════════════ workforce_requirements ═════════════════════════════
create table if not exists public.workforce_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_role_id uuid not null references public.project_roles (id) on delete restrict,
  shift_id uuid not null references public.shifts (id) on delete restrict,
  date_from date not null,
  date_to date not null,
  required_count integer not null,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint workforce_requirements_dates check (date_to >= date_from),
  constraint workforce_requirements_count check (required_count >= 0),
  constraint workforce_requirements_no_overlap exclude using gist (
    project_role_id with =, shift_id with =, daterange(date_from, date_to, '[]') with &&)
);
create index if not exists workforce_requirements_project_idx on public.workforce_requirements (project_id, date_from, date_to);

-- Job Role mora pripadati projektu, a smena je globalna ili tog projekta.
create or replace function public.guard_workforce_requirement() returns trigger
language plpgsql set search_path = '' as $$
declare v_role_project uuid; v_shift_project uuid;
begin
  select r.project_id into v_role_project from public.project_roles r where r.id = new.project_role_id;
  if v_role_project is distinct from new.project_id then
    raise exception 'Job Role ne pripada tom projektu' using errcode = 'check_violation';
  end if;
  select s.project_id into v_shift_project from public.shifts s where s.id = new.shift_id;
  if v_shift_project is not null and v_shift_project <> new.project_id then
    raise exception 'Smena pripada drugom projektu' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists workforce_requirements_guard on public.workforce_requirements;
create trigger workforce_requirements_guard before insert or update on public.workforce_requirements
  for each row execute function public.guard_workforce_requirement();
drop trigger if exists workforce_requirements_updated on public.workforce_requirements;
create trigger workforce_requirements_updated before update on public.workforce_requirements
  for each row execute function public.set_updated_date();

-- ═════════════════════════════ RLS ═════════════════════════════
alter table public.workforce_requirements enable row level security;

drop policy if exists workforce_requirements_select on public.workforce_requirements;
create policy workforce_requirements_select on public.workforce_requirements for select to authenticated
  using (public.can_see_project(project_id));
drop policy if exists workforce_requirements_insert on public.workforce_requirements;
create policy workforce_requirements_insert on public.workforce_requirements for insert to authenticated
  with check (public.has_permission('workforce.manage') and public.can_see_project(project_id));
drop policy if exists workforce_requirements_update on public.workforce_requirements;
create policy workforce_requirements_update on public.workforce_requirements for update to authenticated
  using (public.has_permission('workforce.manage') and public.can_see_project(project_id))
  with check (public.has_permission('workforce.manage') and public.can_see_project(project_id));
drop policy if exists workforce_requirements_delete on public.workforce_requirements;
create policy workforce_requirements_delete on public.workforce_requirements for delete to authenticated
  using (public.has_permission('workforce.manage') and public.can_see_project(project_id));

-- schedules: čita osoblje (red bez projekta ili projekat koji vidi), menja workforce.manage.
drop policy if exists schedules_staff on public.schedules;
drop policy if exists schedules_select on public.schedules;
create policy schedules_select on public.schedules for select to authenticated
  using ((select public.is_staff()) and (project_id is null or public.can_see_project(project_id)));
drop policy if exists schedules_insert on public.schedules;
create policy schedules_insert on public.schedules for insert to authenticated
  with check (public.has_permission('workforce.manage') and (project_id is null or public.can_see_project(project_id)));
drop policy if exists schedules_update on public.schedules;
create policy schedules_update on public.schedules for update to authenticated
  using (public.has_permission('workforce.manage') and (project_id is null or public.can_see_project(project_id)))
  with check (public.has_permission('workforce.manage') and (project_id is null or public.can_see_project(project_id)));
drop policy if exists schedules_delete on public.schedules;
create policy schedules_delete on public.schedules for delete to authenticated
  using (public.has_permission('workforce.manage') and (project_id is null or public.can_see_project(project_id)));

-- Audit (§15.04)
drop trigger if exists workforce_requirements_audit on public.workforce_requirements;
create trigger workforce_requirements_audit after insert or update or delete on public.workforce_requirements
  for each row execute function public.audit_row();
drop trigger if exists schedules_audit on public.schedules;
create trigger schedules_audit after insert or update or delete on public.schedules
  for each row execute function public.audit_row();

-- ═════════════════════════════ set_workforce_requirement ═════════════════════════════
-- Potreban broj se menja „od datuma": postojeći opseg (uloga, smena) se seče kao Rate History, pa raniji dani
-- ostaju sa starim brojem. p_to = null znači do kraja opsega koji pokriva p_from.
create or replace function public.set_workforce_requirement(
  p_role uuid, p_shift uuid, p_from date, p_to date, p_count integer, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid; v_to date := p_to; v_id uuid; r record;
begin
  if not public.has_permission('workforce.manage') then
    raise exception 'Nemate pravo da menjate potreban broj radnika' using errcode = '42501';
  end if;
  select pr.project_id into v_project from public.project_roles pr where pr.id = p_role;
  if v_project is null then
    raise exception 'Job Role ne postoji' using errcode = 'foreign_key_violation';
  end if;
  if not public.can_see_project(v_project) then
    raise exception 'Nemate pristup tom projektu' using errcode = '42501';
  end if;
  if p_shift is null or p_from is null or p_count is null or p_count < 0 then
    raise exception 'Uloga, smena, datum „od" i broj (≥ 0) su obavezni' using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('wr:' || p_role::text || ':' || p_shift::text));

  if v_to is null then
    select w.date_to into v_to from public.workforce_requirements w
     where w.project_role_id = p_role and w.shift_id = p_shift and p_from between w.date_from and w.date_to;
    if v_to is null then
      raise exception 'Za novi period zadajte i datum „do"' using errcode = 'check_violation';
    end if;
  end if;
  if v_to < p_from then
    raise exception 'Datum „do" je pre datuma „od"' using errcode = 'check_violation';
  end if;

  if nullif(btrim(p_note), '') is not null then
    perform set_config('app.audit_reason', btrim(p_note), true);
  end if;

  for r in
    select * from public.workforce_requirements w
     where w.project_role_id = p_role and w.shift_id = p_shift
       and daterange(w.date_from, w.date_to, '[]') && daterange(p_from, v_to, '[]')
     order by w.date_from
     for update
  loop
    if r.date_from < p_from and r.date_to > v_to then
      update public.workforce_requirements set date_to = p_from - 1 where id = r.id;
      insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count, notes)
      values (r.project_id, r.project_role_id, r.shift_id, v_to + 1, r.date_to, r.required_count, r.notes);
    elsif r.date_from < p_from then
      update public.workforce_requirements set date_to = p_from - 1 where id = r.id;
    elsif r.date_to > v_to then
      update public.workforce_requirements set date_from = v_to + 1 where id = r.id;
    else
      delete from public.workforce_requirements where id = r.id;
    end if;
  end loop;

  insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count, notes)
  values (v_project, p_role, p_shift, p_from, v_to, p_count, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ═════════════════════════════ worker_is_free ═════════════════════════════
-- Slobodan za smenu (T05): aktivan, nije odsutan (odobreno odsustvo), nema zauzet raspored (assigned/replacement)
-- ni podrazumevanu smenu angažmana čiji se interval preklapa. Smena null = ceo dan. Isto kao workerIsFree() u JS-u.
create or replace function public.worker_is_free(p_employee uuid, p_date date, p_shift uuid)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text; v_st time; v_et time; w tsrange;
begin
  if not (select public.is_staff()) then
    raise exception 'Samo osoblje može da proverava raspoloživost' using errcode = '42501';
  end if;

  select e.status into v_status from public.employees e where e.id = p_employee;
  if v_status is null or v_status in ('terminated', 'suspended') then return false; end if;

  if exists (select 1 from public.leave_requests l
              where l.employee_id = p_employee and l.status = 'approved' and p_date between l.start_date and l.end_date) then
    return false;
  end if;

  if p_shift is null then
    w := tsrange(p_date::timestamp, p_date::timestamp + interval '1 day', '[)');
  else
    select s.start_time, s.end_time into v_st, v_et from public.shifts s where s.id = p_shift;
    if v_st is null then
      raise exception 'Smena ne postoji' using errcode = 'foreign_key_violation';
    end if;
    w := tsrange(p_date + v_st, p_date + v_et + case when v_et <= v_st then interval '1 day' else interval '0' end, '[)');
  end if;

  if exists (select 1 from public.schedules s
              where s.employee_id = p_employee and s.status in ('assigned', 'replacement')
                and s.date between p_date - 1 and p_date + 1
                and tsrange(s.start_at, s.end_at, '[)') && w) then
    return false;
  end if;

  if exists (
    select 1
      from public.project_assignments a
      join public.shifts sh on sh.id = a.default_shift_id
      cross join lateral unnest(array[p_date - 1, p_date, p_date + 1]) as g(d)
     where a.employee_id = p_employee and a.status <> 'cancelled'
       and a.start_date <= g.d and (a.end_date is null or a.end_date >= g.d)
       and not exists (select 1 from public.schedules s2 where s2.employee_id = p_employee and s2.date = g.d)
       and tsrange(g.d + sh.start_time,
                   g.d + sh.end_time + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end,
                   '[)') && w) then
    return false;
  end if;

  return true;
end $$;

-- ═════════════════════════════ workforce_coverage ═════════════════════════════
-- Pokrivenost po (projekat, uloga, smena, datum) u [p_from, p_to]. Red postoji samo gde postoji potreba.
-- planirani = redovi rasporeda (assigned/replacement, angažman na toj ulozi) + radnici bez ijednog reda rasporeda tog
-- dana koji imaju angažman na toj ulozi sa tom podrazumevanom smenom; odsutan = odobreno odsustvo (ili simulirani
-- zahtev p_simulate_leave). Isto kao coverage() u JS-u.
create or replace function public.workforce_coverage(
  p_from date, p_to date, p_project uuid default null, p_simulate_leave uuid default null)
returns table (project_id uuid, project_role_id uuid, shift_id uuid, work_date date,
               required integer, planned integer, absent integer, available integer, deficit integer, surplus integer)
language sql stable security definer set search_path = '' as $$
  with req as (
    select r.project_id, r.project_role_id, r.shift_id, d.d::date as work_date, r.required_count
      from public.workforce_requirements r
     cross join lateral generate_series(greatest(r.date_from, p_from)::timestamp, least(r.date_to, p_to)::timestamp, interval '1 day') as d(d)
     where (p_project is null or r.project_id = p_project)
       and public.can_see_project(r.project_id)
  ),
  pl as (
    select q.project_id, q.project_role_id, q.shift_id, q.work_date, s.employee_id
      from req q
      join public.schedules s
        on s.project_id = q.project_id and s.shift_id = q.shift_id and s.date = q.work_date and s.status in ('assigned', 'replacement')
      join public.project_assignments a
        on a.id = s.assignment_id and a.project_role_id = q.project_role_id and a.status <> 'cancelled'
    union
    select q.project_id, q.project_role_id, q.shift_id, q.work_date, a.employee_id
      from req q
      join public.project_assignments a
        on a.project_id = q.project_id and a.project_role_id = q.project_role_id and a.default_shift_id = q.shift_id
       and a.status <> 'cancelled' and a.start_date <= q.work_date and (a.end_date is null or a.end_date >= q.work_date)
     where not exists (select 1 from public.schedules s2 where s2.employee_id = a.employee_id and s2.date = q.work_date)
  ),
  agg as (
    select pl.project_id, pl.project_role_id, pl.shift_id, pl.work_date,
           count(*)::integer as planned,
           (count(*) filter (where exists (
              select 1 from public.leave_requests l
               where l.employee_id = pl.employee_id and pl.work_date between l.start_date and l.end_date
                 and (l.status = 'approved' or l.id = p_simulate_leave))))::integer as absent
      from pl
     group by pl.project_id, pl.project_role_id, pl.shift_id, pl.work_date
  )
  select q.project_id, q.project_role_id, q.shift_id, q.work_date,
         q.required_count,
         coalesce(g.planned, 0),
         coalesce(g.absent, 0),
         coalesce(g.planned, 0) - coalesce(g.absent, 0),
         greatest(q.required_count - (coalesce(g.planned, 0) - coalesce(g.absent, 0)), 0),
         greatest((coalesce(g.planned, 0) - coalesce(g.absent, 0)) - q.required_count, 0)
    from req q
    left join agg g
      on g.project_id = q.project_id and g.project_role_id = q.project_role_id and g.shift_id = q.shift_id and g.work_date = q.work_date
   order by q.work_date, q.project_id, q.project_role_id, q.shift_id
$$;

-- ═════════════════════════════ dozvole (D14) ═════════════════════════════
revoke execute on function public.absence_kind(text) from public, anon;
revoke execute on function public.schedules_fill() from public, anon, authenticated;
revoke execute on function public.guard_schedule_overlap() from public, anon, authenticated;
revoke execute on function public.guard_workforce_requirement() from public, anon, authenticated;
revoke execute on function public.set_workforce_requirement(uuid, uuid, date, date, integer, text) from public, anon;
revoke execute on function public.worker_is_free(uuid, date, uuid) from public, anon;
revoke execute on function public.workforce_coverage(date, date, uuid, uuid) from public, anon;
grant execute on function public.absence_kind(text) to authenticated;
grant execute on function public.set_workforce_requirement(uuid, uuid, date, date, integer, text) to authenticated;
grant execute on function public.worker_is_free(uuid, date, uuid) to authenticated;
grant execute on function public.workforce_coverage(date, date, uuid, uuid) to authenticated;
