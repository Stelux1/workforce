-- Teamora temelj (spec v1.4, D30 K1/K2; docs/TEAMORA-DATA-MODEL.md §2.1–§2.3): uloge i prava, audit log,
-- migration_report, Job Roles (project_roles), smene, kursevi, vremenska zona.
--
-- Bezbedno za produkciju sa postojećim podacima:
--  * idempotentno (if not exists / create or replace / on conflict / drop … if exists);
--  * ništa se ne briše; operater → hr (isti pristup kao pre: politike postojećih tabela se ovde NE menjaju, to radi
--    20261125020000_prava_rls.sql, a podrazumevana prava HR-a pokrivaju sve što je operater imao — R7);
--  * aktivnost naloga se ne dira; prvi admin ostaje zaštićen (guard_last_admin);
--  * D14: ništa anon-u; pomoćne/trigger funkcije zatvorene i za authenticated.

-- ═════════════════════════════ 1. profiles: 4 uloge, opseg projekata ═════════════════════════════
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'hr' where role = 'operater';
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'project_manager', 'hr', 'finance'));
alter table public.profiles alter column role set default 'hr';
alter table public.profiles add column if not exists project_scope text not null default 'all';
alter table public.profiles drop constraint if exists profiles_project_scope_check;
alter table public.profiles add constraint profiles_project_scope_check check (project_scope in ('all', 'assigned'));

-- Nov nalog: neaktivan HR; prvi nalog na praznoj bazi je aktivan admin. Postojeći nalozi se ne diraju.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('public.handle_new_user'));
  v_first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when v_first then 'admin' else 'hr' end,
    v_first);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ═════════════════════════════ 2. katalog uloga i prava ═════════════════════════════
create table if not exists public.roles (
  code text primary key check (code in ('admin', 'project_manager', 'hr', 'finance')),
  name text not null
);

create table if not exists public.permissions (
  code text primary key,
  description text not null,
  sensitive boolean not null default false
);

create table if not exists public.role_permissions (
  role text not null references public.roles (code) on delete cascade,
  permission text not null references public.permissions (code) on delete cascade,
  primary key (role, permission)
);

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null references public.permissions (code) on delete cascade,
  granted boolean not null,
  created_by uuid default auth.uid(),
  created_date timestamptz default now(),
  primary key (user_id, permission)
);

create table if not exists public.user_project_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid default auth.uid(),
  created_date timestamptz default now(),
  primary key (user_id, project_id)
);
create index if not exists user_project_access_project_idx on public.user_project_access (project_id);

insert into public.roles (code, name) values
  ('admin', 'Admin'),
  ('project_manager', 'Project Manager'),
  ('hr', 'HR'),
  ('finance', 'Finance')
on conflict (code) do nothing;

insert into public.permissions (code, description, sensitive) values
  ('projects.manage',          'Projekti, Job Roles (bez tarifa), klijent na projektu', false),
  ('assignments.manage',       'Dodavanje, izmena, završetak i prebacivanje angažmana (bez tarifa)', false),
  ('rates.view_b2b',           'Čitanje B2B tarifa i prihoda', true),
  ('rates.view_b2c',           'Čitanje B2C tarifa, troška rada i isplata radniku', true),
  ('rates.manage',             'Unos i izmena tarifa (Rate History)', true),
  ('timesheets.edit',          'Unos sati, izmena nacrta, slanje na odobrenje', false),
  ('timesheets.approve',       'Odobravanje i odbijanje satnica', false),
  ('timesheets.correct',       'Vraćanje odobrene satnice na izmenu uz razlog', true),
  ('payroll.view',             'Mesečni obračun, obaveze i isplate (čitanje)', true),
  ('payroll.manage',           'Zaključavanje meseca, obračun, generisanje i potvrda obaveza', true),
  ('payments.record',          'Unos i storno isplata', true),
  ('costs.view',               'Troškovi projekata (čitanje)', true),
  ('costs.manage',             'Troškovi projekata (unos i izmena)', true),
  ('billing.view',             'Billing pregled, uplate klijenata (čitanje)', true),
  ('billing.manage',           'Billing status, eksterni račun, uplate klijenata, klijenti', true),
  ('reports.financial',        'Finansijski izveštaji, finansijski KPI, finansijski izvoz', true),
  ('employees.manage',         'Profil radnika (operativni podaci), dobavljači', false),
  ('employees.private.view',   'Lični podaci radnika: JMBG, lična karta, pasoš, banka (čitanje)', true),
  ('employees.private.edit',   'Lični podaci radnika: JMBG, lična karta, pasoš, banka (izmena)', true),
  ('engagement.manage',        'Istorija angažovanja (direktno ili preko dobavljača, primalac isplate)', true),
  ('documents.manage',         'Dokumenta radnika (otpremanje, izmena)', false),
  ('documents.view_sensitive', 'Fajlovi osetljivih dokumenata', true),
  ('onboarding.manage',        'Obavezna dokumenta, priprema onboarding paketa', false),
  ('onboarding.export',        'Preuzimanje onboarding ZIP paketa', true),
  ('workforce.manage',         'Smene, potrebna radna snaga, raspored, zamene', false),
  ('leave.approve',            'Odobravanje i odbijanje odsustva', false),
  ('leave.approve_shortage',   'Odobrenje odsustva uprkos manjku radnika (uz razlog)', false),
  ('users.manage',             'Podešavanja → Korisnici i prava', true),
  ('settings.manage',          'Ostala podešavanja (koeficijenti, kategorije, firma, jezik, vrste dokumenata, kursevi)', false),
  ('audit.view',               'Pun audit log', true)
on conflict (code) do nothing;

insert into public.role_permissions (role, permission)
select r.role, r.permission
from (values
  ('project_manager', 'projects.manage'), ('hr', 'projects.manage'),
  ('project_manager', 'assignments.manage'), ('hr', 'assignments.manage'),
  ('project_manager', 'rates.view_b2b'), ('finance', 'rates.view_b2b'),
  ('finance', 'rates.view_b2c'),
  ('finance', 'rates.manage'),
  ('project_manager', 'timesheets.edit'), ('hr', 'timesheets.edit'), ('finance', 'timesheets.edit'),
  ('project_manager', 'timesheets.approve'), ('finance', 'timesheets.approve'),
  ('finance', 'timesheets.correct'),
  ('finance', 'payroll.view'), ('finance', 'payroll.manage'), ('finance', 'payments.record'),
  ('project_manager', 'costs.view'), ('finance', 'costs.view'),
  ('project_manager', 'costs.manage'), ('finance', 'costs.manage'),
  ('finance', 'billing.view'), ('finance', 'billing.manage'),
  ('finance', 'reports.financial'),
  ('hr', 'employees.manage'),
  ('hr', 'employees.private.view'), ('finance', 'employees.private.view'),
  ('hr', 'employees.private.edit'),
  ('finance', 'engagement.manage'),
  ('hr', 'documents.manage'), ('hr', 'documents.view_sensitive'),
  ('project_manager', 'onboarding.manage'), ('hr', 'onboarding.manage'),
  ('project_manager', 'onboarding.export'), ('hr', 'onboarding.export'),
  ('project_manager', 'workforce.manage'), ('hr', 'workforce.manage'),
  ('project_manager', 'leave.approve'), ('hr', 'leave.approve'),
  ('project_manager', 'leave.approve_shortage')
) as r(role, permission)
on conflict do nothing;

-- ═════════════════════════════ 3. helperi prava ═════════════════════════════
-- Admin ima sva prava implicitno; override ne može da mu oduzme pravo. Neaktivan nalog nema nijedno pravo.
create or replace function public.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not pr.active then false
      when pr.role = 'admin' then true
      else coalesce(
        (select o.granted from public.user_permission_overrides o
          where o.user_id = pr.id and o.permission = p_code),
        exists (select 1 from public.role_permissions rp
                 where rp.role = pr.role and rp.permission = p_code))
    end
    from public.profiles pr where pr.id = auth.uid()), false)
$$;

-- Projekat je vidljiv adminu, nalogu sa project_scope='all' i nalogu sa 'assigned' kome je projekat dodeljen.
create or replace function public.can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select pr.active and (pr.role = 'admin' or pr.project_scope = 'all'
      or (p_project is not null and exists (
            select 1 from public.user_project_access a
             where a.user_id = pr.id and a.project_id = p_project)))
    from public.profiles pr where pr.id = auth.uid()), false)
$$;

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select pr.role from public.profiles pr where pr.id = auth.uid() and pr.active
$$;

create or replace function public.my_permissions() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not pr.active then '{}'::text[]
      when pr.role = 'admin' then (select coalesce(array_agg(p.code order by p.code), '{}') from public.permissions p)
      else (
        select coalesce(array_agg(p.code order by p.code), '{}')
        from public.permissions p
        where coalesce(
          (select o.granted from public.user_permission_overrides o where o.user_id = pr.id and o.permission = p.code),
          exists (select 1 from public.role_permissions rp where rp.role = pr.role and rp.permission = p.code)))
    end
    from public.profiles pr where pr.id = auth.uid()), '{}'::text[])
$$;

revoke execute on function public.has_permission(text), public.can_see_project(uuid),
  public.current_app_role(), public.my_permissions() from public, anon;
grant execute on function public.has_permission(text), public.can_see_project(uuid),
  public.current_app_role(), public.my_permissions() to authenticated;

-- Override nad nalogom admina se odbija (admin ionako ima sva prava).
create or replace function public.guard_permission_override() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin') then
    raise exception 'Admin ima sva prava; pojedinačna prava mu se ne menjaju' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_permission_override() from public, anon, authenticated;
drop trigger if exists user_permission_overrides_guard on public.user_permission_overrides;
create trigger user_permission_overrides_guard before insert or update on public.user_permission_overrides
  for each row execute function public.guard_permission_override();

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.user_project_access enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['roles', 'permissions', 'role_permissions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))',
                   t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using ((select public.has_permission(''users.manage''))) '
                   'with check ((select public.has_permission(''users.manage'')))', t || '_write', t);
  end loop;
  foreach t in array array['user_permission_overrides', 'user_project_access'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated '
                   'using (user_id = (select auth.uid()) or (select public.has_permission(''users.manage'')))',
                   t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated '
                   'using ((select public.has_permission(''users.manage''))) '
                   'with check ((select public.has_permission(''users.manage'')))', t || '_write', t);
  end loop;
end $$;

-- ═════════════════════════════ 4. migration_report ═════════════════════════════
create table if not exists public.migration_report (
  id bigint generated always as identity primary key,
  migration text not null,
  entity text not null,
  entity_id text,
  issue text not null,
  details jsonb,
  created_date timestamptz default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index if not exists migration_report_migration_idx on public.migration_report (migration, issue);

-- Upis iz migracija; ista beleška (migracija, entitet, id, problem, detalji) se ne upisuje dvaput (ponovno pokretanje).
create or replace function public.migration_note(p_migration text, p_entity text, p_entity_id text, p_issue text,
  p_details jsonb default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  select m.id into v_id from public.migration_report m
   where m.migration = p_migration and m.entity = p_entity and m.entity_id is not distinct from p_entity_id
     and m.issue = p_issue and m.details is not distinct from p_details
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.migration_report (migration, entity, entity_id, issue, details)
  values (p_migration, p_entity, p_entity_id, p_issue, p_details)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.migration_note(text, text, text, text, jsonb) from public, anon, authenticated;

alter table public.migration_report enable row level security;
revoke insert, delete, truncate on public.migration_report from authenticated;
drop policy if exists migration_report_read on public.migration_report;
create policy migration_report_read on public.migration_report for select to authenticated
  using ((select public.has_permission('users.manage')) or (select public.has_permission('settings.manage')));
drop policy if exists migration_report_resolve on public.migration_report;
create policy migration_report_resolve on public.migration_report for update to authenticated
  using ((select public.has_permission('users.manage')) or (select public.has_permission('settings.manage')))
  with check ((select public.has_permission('users.manage')) or (select public.has_permission('settings.manage')));

-- ═════════════════════════════ 5. audit log ═════════════════════════════
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete', 'status', 'correction', 'download', 'prepare')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  reason text,
  project_id uuid,
  actor uuid default auth.uid(),
  actor_role text,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id);
create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_project_idx on public.audit_log (project_id);

-- Bezbedno čitanje uuid-a iz jsonb (red bez project_id ili sa neispravnom vrednošću → null).
create or replace function public.audit_jsonb_uuid(p jsonb, p_key text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return (p ->> p_key)::uuid;
exception when others then
  return null;
end $$;
revoke execute on function public.audit_jsonb_uuid(jsonb, text) from public, anon, authenticated;

-- Trigger: insert/update/delete → red u audit_log. UPDATE se beleži samo ako se promenilo nešto osim updated_date.
-- RPC može da postavi app.audit_action ('status', 'correction') i app.audit_reason (set_config(..., true)).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_changed text[];
  v_row jsonb;
begin
  if tg_op = 'UPDATE' then
    if (v_old - 'updated_date') = (v_new - 'updated_date') then
      return new;
    end if;
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(v_new) as k union select jsonb_object_keys(v_old)) keys
    where k <> 'updated_date' and (v_old ->> k) is distinct from (v_new ->> k);
  end if;
  v_row := coalesce(v_new, v_old);
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_fields, reason,
                                project_id, actor, actor_role)
  values (tg_table_name, coalesce(v_row ->> 'id', ''),
          coalesce(nullif(current_setting('app.audit_action', true), ''), lower(tg_op)),
          v_old, v_new, v_changed,
          nullif(current_setting('app.audit_reason', true), ''),
          public.audit_jsonb_uuid(v_row, 'project_id'),
          auth.uid(), public.current_app_role());
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.audit_row() from public, anon, authenticated;

-- Događaj bez promene reda (download, prepare). Interna: poziva se iz security definer RPC-ova.
create or replace function public.audit_event(p_table text, p_record text, p_action text, p_data jsonb,
  p_reason text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into public.audit_log (table_name, record_id, action, new_data, reason, project_id, actor, actor_role)
  values (p_table, coalesce(p_record, ''), p_action, p_data,
          coalesce(p_reason, nullif(current_setting('app.audit_reason', true), '')),
          public.audit_jsonb_uuid(p_data, 'project_id'),
          auth.uid(), public.current_app_role())
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.audit_event(text, text, text, jsonb, text) from public, anon, authenticated;

-- Nepromenljivost: niko (ni admin kroz API) ne menja i ne briše audit.
create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Audit log se ne menja i ne briše' using errcode = '42501';
end $$;
revoke execute on function public.audit_log_immutable() from public, anon, authenticated;
drop trigger if exists audit_log_immutable on public.audit_log;
create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();
revoke insert, update, delete, truncate on public.audit_log from authenticated;

-- Ko čita audit red bez audit.view: po resursu (isto pravo kao za čitanje samog reda).
create or replace function public.can_read_audit(p_table text, p_project uuid, p_new jsonb, p_old jsonb)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_table
    when 'project_costs' then public.has_permission('costs.view') and public.can_see_project(p_project)
    when 'project_assignments' then public.is_staff() and public.can_see_project(p_project)
    when 'project_roles' then public.is_staff() and public.can_see_project(p_project)
    when 'rates' then
      (p_project is null or public.can_see_project(p_project))
      and case coalesce(p_new ->> 'kind', p_old ->> 'kind')
            when 'revenue' then public.has_permission('rates.view_b2b')
            when 'cost' then public.has_permission('rates.view_b2c')
            else false end
    when 'timesheets' then public.has_permission('timesheets.approve') and public.can_see_project(p_project)
    when 'timesheet_entries' then public.has_permission('timesheets.approve') and public.can_see_project(p_project)
    when 'billing_summaries' then public.has_permission('billing.view')
    when 'client_payments' then public.has_permission('billing.view')
    when 'payables' then public.has_permission('payroll.view')
    when 'payments' then public.has_permission('payroll.view')
    when 'leave_requests' then public.has_permission('leave.approve')
    when 'documents' then public.has_permission('documents.manage')
    when 'required_documents' then public.has_permission('onboarding.manage') and public.can_see_project(p_project)
    when 'onboarding_packages' then public.has_permission('onboarding.manage') and public.can_see_project(p_project)
    else false
  end
$$;
revoke execute on function public.can_read_audit(text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.can_read_audit(text, uuid, jsonb, jsonb) to authenticated;

alter table public.audit_log enable row level security;
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log for select to authenticated
  using ((select public.has_permission('audit.view'))
         or public.can_read_audit(table_name, project_id, new_data, old_data));

do $$
declare
  t text;
begin
  foreach t in array array['project_assignments', 'rates', 'timesheets', 'leave_requests', 'documents', 'project_costs']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I '
                   'for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

-- ═════════════════════════════ 6. Job Roles (project_roles) ═════════════════════════════
create table if not exists public.project_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  title_key text generated always as (lower(btrim(title))) stored,
  department_position text,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  sort integer not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (project_id, title_key)
);

drop trigger if exists project_roles_updated on public.project_roles;
create trigger project_roles_updated before update on public.project_roles
  for each row execute function public.set_updated_date();
drop trigger if exists project_roles_audit on public.project_roles;
create trigger project_roles_audit after insert or update or delete on public.project_roles
  for each row execute function public.audit_row();

-- Backfill: 1) projects.job_roles[*].title (sort = redni broj), 2) dodele, 3) assigned_employees[*].position,
-- 4) rates.position (scope project). Bez duplikata po title_key; drugo pokretanje ne dodaje ništa.
insert into public.project_roles (project_id, title, sort)
with c as (
  select p.id as project_id,
         btrim(coalesce(case jsonb_typeof(j.e) when 'object' then coalesce(j.e ->> 'title', j.e ->> 'name')
                                               when 'string' then j.e #>> '{}' end, '')) as title,
         1 as prio, j.ord::int as ord
    from public.projects p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.job_roles) = 'array' then p.job_roles
                                                 else '[]'::jsonb end) with ordinality as j(e, ord)
  union all
  select a.project_id, btrim(coalesce(a.position, '')), 2, 0
    from public.project_assignments a where a.project_id is not null
  union all
  select p.id, btrim(coalesce(case when jsonb_typeof(j.e) = 'object' then j.e ->> 'position' end, '')), 3, 0
    from public.projects p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.assigned_employees) = 'array'
                                                 then p.assigned_employees else '[]'::jsonb end) as j(e)
  union all
  select r.project_id, btrim(coalesce(r.position, '')), 4, 0
    from public.rates r where r.scope = 'project' and r.project_id is not null
), d as (
  select distinct on (project_id, lower(title)) project_id, title, prio, ord
    from c where title <> ''
   order by project_id, lower(title), prio, ord
)
select d.project_id, d.title,
       case when d.prio = 1 then d.ord
            else 1000 + (row_number() over (partition by d.project_id order by d.prio, lower(d.title)))::int end
  from d
on conflict (project_id, title_key) do nothing;

-- Preimenovanje Job Role osvežava snimke naziva (dodele, tarife) na istom projektu (T25).
create or replace function public.propagate_project_role_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.title is distinct from old.title then
    perform set_config('app.snapshot_sync', 'on', true);
    update public.project_assignments set position = new.title
     where project_id = new.project_id and lower(btrim(coalesce(position, ''))) = old.title_key
       and position is distinct from new.title;
    update public.rates set position = new.title
     where project_id = new.project_id and scope = 'project'
       and lower(btrim(coalesce(position, ''))) = old.title_key and position is distinct from new.title;
    perform set_config('app.snapshot_sync', 'off', true);
  end if;
  return new;
end $$;
revoke execute on function public.propagate_project_role_rename() from public, anon, authenticated;
drop trigger if exists propagate_project_role_rename on public.project_roles;
create trigger propagate_project_role_rename after update of title on public.project_roles
  for each row execute function public.propagate_project_role_rename();

alter table public.project_roles enable row level security;
drop policy if exists project_roles_read on public.project_roles;
create policy project_roles_read on public.project_roles for select to authenticated
  using (public.can_see_project(project_id));
drop policy if exists project_roles_write on public.project_roles;
create policy project_roles_write on public.project_roles for all to authenticated
  using ((select public.has_permission('projects.manage')) and public.can_see_project(project_id))
  with check ((select public.has_permission('projects.manage')) and public.can_see_project(project_id));

-- ═════════════════════════════ 7. smene ═════════════════════════════
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  name text not null check (btrim(name) <> ''),
  start_time time not null,
  end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  sort integer not null default 0,
  active boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index if not exists shifts_code_key
  on public.shifts (coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(code));

drop trigger if exists shifts_updated on public.shifts;
create trigger shifts_updated before update on public.shifts
  for each row execute function public.set_updated_date();

alter table public.shifts enable row level security;
drop policy if exists shifts_read on public.shifts;
create policy shifts_read on public.shifts for select to authenticated
  using ((select public.is_staff()) and (project_id is null or public.can_see_project(project_id)));
drop policy if exists shifts_write on public.shifts;
create policy shifts_write on public.shifts for all to authenticated
  using ((select public.has_permission('workforce.manage')) and (project_id is null or public.can_see_project(project_id)))
  with check ((select public.has_permission('workforce.manage')) and (project_id is null or public.can_see_project(project_id)));

-- ═════════════════════════════ 8. kursevi ═════════════════════════════
-- Kurs je „jedinica valute za 1 EUR" na datum kursa (K3). Koristi ga samo eksplicitna konverzija u izveštajima.
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  currency text not null check (currency in ('RSD', 'GBP', 'USD')),
  units_per_eur numeric(14, 6) not null check (units_per_eur > 0),
  source text,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_date timestamptz not null default now(),
  unique (rate_date, currency)
);

alter table public.exchange_rates enable row level security;
drop policy if exists exchange_rates_read on public.exchange_rates;
create policy exchange_rates_read on public.exchange_rates for select to authenticated
  using ((select public.is_staff()));
drop policy if exists exchange_rates_write on public.exchange_rates;
create policy exchange_rates_write on public.exchange_rates for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

-- ═════════════════════════════ 9. vremenska zona ═════════════════════════════
-- Firma je u Slovačkoj (D26); admin menja. Projekat bez zone koristi zonu iz app_settings.
alter table public.app_settings add column if not exists time_zone text not null default 'Europe/Bratislava';
alter table public.projects add column if not exists time_zone text;

-- Nova tabela dobija iste dozvole kao ostale (RLS odlučuje); anon ništa (D14).
revoke all on public.roles, public.permissions, public.role_permissions, public.user_permission_overrides,
  public.user_project_access, public.migration_report, public.audit_log, public.project_roles, public.shifts,
  public.exchange_rates from anon;
