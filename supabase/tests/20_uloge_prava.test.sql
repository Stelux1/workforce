-- Uloge i prava (T-B; migracije 20261125010000_temelj_uloge_audit.sql i 20261125020000_prava_rls.sql;
-- docs/TEAMORA-DATA-MODEL.md §2.1 i §4; spec §15.02/§15.03, D30 K1/K2).
-- Accept: za svaku ulogu i resurs iz §4 bar jedno R i jedno W (dozvoljeno/odbijeno); PM sa project_scope='assigned'
-- ne čita tuđi projekat; override granted=false oduzima pravo; admin ne može da izgubi pravo.
-- T26 (osnova): PM vidi B2B, ne vidi B2C; HR ne vidi tarife. T24/T19 (pravna osnova): leave.approve_shortage samo
-- PM (i admin), documents.view_sensitive samo HR (i admin).
-- Sopstveni podaci sa oznakom QA-20; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(103);

-- ═════════════════════════════ priprema (kao postgres) ═════════════════════════════
insert into auth.users (id, email, instance_id, aud, role) values
  ('b2011111-1111-4111-8111-111111111111', 'qa20-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2022222-2222-4222-8222-222222222222', 'qa20-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2033333-3333-4333-8333-333333333333', 'qa20-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2044444-4444-4444-8444-444444444444', 'qa20-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2055555-5555-4555-8555-555555555555', 'qa20-hr2@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2066666-6666-4666-8666-666666666666', 'qa20-novi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = 'b2011111-1111-4111-8111-111111111111';
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned' where id = 'b2022222-2222-4222-8222-222222222222';
update public.profiles set role = 'hr', active = true where id in ('b2033333-3333-4333-8333-333333333333', 'b2055555-5555-4555-8555-555555555555');
update public.profiles set role = 'finance', active = true where id = 'b2044444-4444-4444-8444-444444444444';

select is((select (role, active)::text from public.profiles where id = 'b2066666-6666-4666-8666-666666666666'), '(hr,f)',
  'nov nalog je neaktivan HR (handle_new_user, D30 K1)');
select is((select count(*)::int from public.profiles where role = 'operater'), 0, 'posle migracije nema uloge operater (K1)');

insert into public.projects (id, name) values
  ('b20a0000-0000-4000-8000-00000000000a', 'QA-20 Projekat A'),
  ('b20b0000-0000-4000-8000-00000000000b', 'QA-20 Projekat B');
insert into public.user_project_access (user_id, project_id) values
  ('b2022222-2222-4222-8222-222222222222', 'b20a0000-0000-4000-8000-00000000000a');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('b20e0000-0000-4000-8000-0000000000e1', 'QA20', 'Radnik', 'QA-20-001');
insert into public.employee_private (employee_id, iban) values ('b20e0000-0000-4000-8000-0000000000e1', 'RS35000000000000000020');
insert into public.rates (id, scope, kind, amount, project_id, effective_from) values
  ('b20c0000-0000-4000-8000-0000000000a1', 'project', 'revenue', 30, 'b20a0000-0000-4000-8000-00000000000a', '2030-01-01'),
  ('b20c0000-0000-4000-8000-0000000000a2', 'project', 'cost', 18, 'b20a0000-0000-4000-8000-00000000000a', '2030-01-01'),
  ('b20c0000-0000-4000-8000-0000000000b1', 'project', 'revenue', 31, 'b20b0000-0000-4000-8000-00000000000b', '2030-01-01');
insert into public.cost_categories (id, name) values ('b20d0000-0000-4000-8000-0000000000c1', 'QA-20 Kategorija');
insert into public.project_costs (id, project_id, description, amount, currency, cost_date, cost_category_id) values
  ('b20d0000-0000-4000-8000-0000000000a1', 'b20a0000-0000-4000-8000-00000000000a', 'QA-20 trošak A', 100, 'EUR', '2030-01-10', 'b20d0000-0000-4000-8000-0000000000c1'),
  ('b20d0000-0000-4000-8000-0000000000b1', 'b20b0000-0000-4000-8000-00000000000b', 'QA-20 trošak B', 200, 'EUR', '2030-01-10', 'b20d0000-0000-4000-8000-0000000000c1');
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours) values
  ('b20f0000-0000-4000-8000-0000000000a1', 'b20e0000-0000-4000-8000-0000000000e1', 'b20a0000-0000-4000-8000-00000000000a', '2030-01-07', 8),
  ('b20f0000-0000-4000-8000-0000000000b1', 'b20e0000-0000-4000-8000-0000000000e1', 'b20b0000-0000-4000-8000-00000000000b', '2030-01-14', 8);
insert into public.project_roles (id, project_id, title) values
  ('b2010000-0000-4000-8000-0000000000a1', 'b20a0000-0000-4000-8000-00000000000a', 'QA-20 Welder'),
  ('b2010000-0000-4000-8000-0000000000b1', 'b20b0000-0000-4000-8000-00000000000b', 'QA-20 Fitter');
insert into public.payroll_params (valid_from, tax_rate, non_taxable_rsd, min_base_rsd, max_base_rsd, emp_pio, emp_health,
  emp_unemployment, er_pio, er_health)
values ('2040-01-01', 0.1, 1, 1, 2, 0.1, 0.1, 0.01, 0.1, 0.1);

-- ═════════════════════════════ katalog i seed ═════════════════════════════
select is((select count(*)::int from public.permissions), 30, 'katalog ima 30 prava (§2.1)');
select is((select array_agg(code order by code) from public.roles), array['admin', 'finance', 'hr', 'project_manager'],
  'četiri uloge');
select is((select array_agg(permission order by permission) from public.role_permissions where role = 'project_manager'),
  array['assignments.manage', 'costs.manage', 'costs.view', 'leave.approve', 'leave.approve_shortage', 'onboarding.export',
        'onboarding.manage', 'projects.manage', 'rates.view_b2b', 'timesheets.approve', 'timesheets.edit', 'workforce.manage'],
  'PM: podrazumevana prava kao u §2.1 (isto kao ROLE_DEFAULTS u src/lib/permissions.js)');
select is((select array_agg(permission order by permission) from public.role_permissions where role = 'hr'),
  array['assignments.manage', 'documents.manage', 'documents.view_sensitive', 'employees.manage', 'employees.private.edit',
        'employees.private.view', 'leave.approve', 'onboarding.export', 'onboarding.manage', 'projects.manage',
        'timesheets.edit', 'workforce.manage'],
  'HR: podrazumevana prava kao u §2.1 (sve što je imao operater, bez novca — K1, R7)');
select is((select array_agg(permission order by permission) from public.role_permissions where role = 'finance'),
  array['billing.manage', 'billing.view', 'costs.manage', 'costs.view', 'employees.private.view', 'engagement.manage',
        'payments.record', 'payroll.manage', 'payroll.view', 'rates.manage', 'rates.view_b2b', 'rates.view_b2c',
        'reports.financial', 'timesheets.approve', 'timesheets.correct', 'timesheets.edit'],
  'Finance: podrazumevana prava kao u §2.1');
select is((select count(*)::int from public.role_permissions where permission in ('users.manage', 'settings.manage', 'audit.view')), 0,
  'users/settings/audit nema nijedna uloga osim admina');
select ok(not has_function_privilege('anon', 'public.has_permission(text)', 'execute')
      and not has_function_privilege('anon', 'public.my_permissions()', 'execute')
      and not has_function_privilege('authenticated', 'public.audit_event(text,text,text,jsonb,text)', 'execute')
      and not has_function_privilege('authenticated', 'public.migration_note(text,text,text,text,jsonb)', 'execute')
      and has_function_privilege('authenticated', 'public.can_see_project(uuid)', 'execute'),
  'D14: helperi nisu dostupni anon-u; audit_event i migration_note su interni');

-- ═════════════════════════════ admin ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2011111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.current_app_role(), 'admin', 'admin: current_app_role');
select is(cardinality(public.my_permissions()), 30, 'admin: my_permissions = sva prava');
select ok(public.has_permission('users.manage') and public.has_permission('audit.view'), 'admin ima users.manage i audit.view');
select ok(public.can_see_project('b20b0000-0000-4000-8000-00000000000b'), 'admin vidi svaki projekat');
select is((select count(*)::int from public.rates where id::text like 'b20c%'), 3, 'admin R: sve tarife');
select throws_ok($$insert into public.user_permission_overrides (user_id, permission, granted)
  values ('b2011111-1111-4111-8111-111111111111', 'users.manage', false)$$,
  '42501', 'Admin ima sva prava; pojedinačna prava mu se ne menjaju', 'override nad adminom je odbijen');
select lives_ok($$insert into public.exchange_rates (rate_date, currency, units_per_eur) values ('2040-01-01', 'RSD', 117.2)$$,
  'admin W: kurs (settings.manage)');
select lives_ok($$update public.hour_types set name = name where code = 'redovni'$$, 'admin W: podešavanja');
reset role;

-- Admin ne gubi pravo ni kad override postoji (upisan mimo API-ja) ni kad je pravo uloge obrisano.
alter table public.user_permission_overrides disable trigger user_permission_overrides_guard;
insert into public.user_permission_overrides (user_id, permission, granted)
  values ('b2011111-1111-4111-8111-111111111111', 'payroll.manage', false);
alter table public.user_permission_overrides enable trigger user_permission_overrides_guard;
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2011111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.has_permission('payroll.manage') and 'payroll.manage' = any (public.my_permissions()),
  'admin ne može da izgubi pravo (override granted=false se ignoriše)');
reset role;
delete from public.user_permission_overrides where user_id = 'b2011111-1111-4111-8111-111111111111';

-- ═════════════════════════════ Project Manager (assigned: samo projekat A) ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2022222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(public.current_app_role(), 'project_manager', 'PM: current_app_role');
select ok(public.can_see_project('b20a0000-0000-4000-8000-00000000000a') and not public.can_see_project('b20b0000-0000-4000-8000-00000000000b'),
  'PM (assigned) vidi samo dodeljen projekat');
select is((select array_agg(name order by name) from public.projects where name like 'QA-20%'), array['QA-20 Projekat A'],
  'Accept: PM sa project_scope=assigned ne čita tuđi projekat');
with u as (update public.projects set description = 'PM menja A' where id = 'b20a0000-0000-4000-8000-00000000000a' returning 1)
select is((select count(*)::int from u), 1, 'PM W: menja svoj projekat (projects.manage)');
with u as (update public.projects set description = 'PM menja B' where id = 'b20b0000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::int from u), 0, 'PM W: ne menja tuđi projekat');
select is((select count(*)::int from public.employees where id = 'b20e0000-0000-4000-8000-0000000000e1'), 1, 'PM R: radnici');
select throws_ok($$insert into public.employees (first_name, last_name) values ('QA20', 'PM upis')$$, '42501', null,
  'PM W: ne upisuje radnika (employees.manage)');
select is((select count(*)::int from public.employee_private where employee_id = 'b20e0000-0000-4000-8000-0000000000e1'), 0,
  'PM R: ne vidi lične podatke (JMBG, banka)');
select is((select array_agg(kind order by kind) from public.rates where id::text like 'b20c%'), array['revenue'],
  'T26: PM vidi B2B tarifu svog projekta, ne vidi B2C ni tuđi projekat');
select throws_ok($$insert into public.rates (scope, kind, amount, project_id, effective_from)
  values ('project', 'revenue', 40, 'b20a0000-0000-4000-8000-00000000000a', '2031-01-01')$$, '42501', null,
  'PM W: ne unosi tarife (rates.manage)');
select is((select array_agg(description) from public.project_costs where id::text like 'b20d%'), array['QA-20 trošak A'],
  'PM R: troškovi samo svog projekta');
with u as (update public.project_costs set description = 'QA-20 trošak A (PM)' where id = 'b20d0000-0000-4000-8000-0000000000a1' returning 1)
select is((select count(*)::int from u), 1, 'PM W: menja trošak svog projekta (costs.manage)');
select is((select count(*)::int from public.timesheets where id::text like 'b20f%'), 1, 'PM R: satnice samo svog projekta');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'b20b0000-0000-4000-8000-00000000000b', '2030-02-04', 4)$$, '42501', null,
  'PM W: ne unosi satnicu na tuđem projektu');
select lives_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'b20a0000-0000-4000-8000-00000000000a', '2030-02-04', 4)$$,
  'PM W: unosi satnicu na svom projektu (timesheets.edit)');
select is((select array_agg(title) from public.project_roles where id::text like 'b201%'), array['QA-20 Welder'],
  'PM R: Job Roles samo svog projekta');
select is((select count(*)::int from public.payroll_params where valid_from = '2040-01-01'), 0, 'PM R: ne vidi obračun');
select throws_ok($$select public.lock_month('2040-01-01')$$, '42501', 'Nemate pravo „payroll.manage"',
  'PM W: ne zaključava mesec');
select is((select count(*)::int from public.user_project_access), 1, 'PM vidi samo svoj red pristupa projektima');
select ok(public.has_permission('leave.approve_shortage'), 'T24 osnova: PM ima leave.approve_shortage');
select ok(not public.has_permission('documents.view_sensitive'), 'T19 osnova: PM nema documents.view_sensitive');
select throws_ok($$insert into public.clients (name) values ('QA-20 PM klijent')$$, '42501', null, 'PM W: ne upisuje klijente');
reset role;

-- ═════════════════════════════ HR (bivši operater) ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2033333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(public.current_app_role(), 'hr', 'HR: current_app_role');
select is((select count(*)::int from public.projects where name like 'QA-20%'), 2, 'HR R: svi projekti (project_scope=all)');
select lives_ok($$insert into public.employees (first_name, last_name) values ('QA20', 'HR upis')$$, 'HR W: upisuje radnika');
with u as (update public.employee_private set iban = 'RS35000000000000000021' where employee_id = 'b20e0000-0000-4000-8000-0000000000e1' returning 1)
select is((select count(*)::int from u), 1, 'HR R/W: lični podaci (employees.private.*)');
select is((select count(*)::int from public.rates where id::text like 'b20c%'), 0, 'T26: HR ne vidi tarife');
select is((select count(*)::int from public.project_costs where id::text like 'b20d%'), 0, 'HR R: ne vidi troškove');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id)
  values ('b20a0000-0000-4000-8000-00000000000a', 5, 'EUR', '2030-01-11', 'b20d0000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'HR W: ne unosi troškove');
select is((select count(*)::int from public.timesheets where id::text like 'b20f%'), 2, 'HR R: satnice');
select lives_ok($$insert into public.timesheets (employee_id, project_id, week_start, tue_hours)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'b20b0000-0000-4000-8000-00000000000b', '2030-02-11', 6)$$,
  'HR W: unosi satnicu (timesheets.edit)');
select lives_ok($$insert into public.project_assignments (employee_id, project_id, start_date, position)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'b20b0000-0000-4000-8000-00000000000b', '2030-01-01', 'QA-20 bez tarife')$$,
  'HR W: dodela bez tarife (assignments.manage)');
select lives_ok($$insert into public.project_roles (project_id, title) values ('b20b0000-0000-4000-8000-00000000000b', 'QA-20 HR uloga')$$,
  'HR W: Job Role (projects.manage)');
select lives_ok($$insert into public.vendors (name) values ('QA-20 HR dobavljač')$$, 'HR W: dobavljač');
select is((select count(*)::int from public.clients where name like 'QA-20%'), 0, 'HR R: klijenti (prazno, ali bez greške)');
select throws_ok($$insert into public.clients (name) values ('QA-20 HR klijent')$$, '42501', null, 'HR W: ne upisuje klijente');
select throws_ok($$insert into public.employment_history (employee_id, start_date, engagement_type)
  values ('b20e0000-0000-4000-8000-0000000000e1', '2030-01-01', 'direct_employee')$$, '42501', null,
  'HR W: ne menja istoriju angažovanja (engagement.manage)');
select lives_ok($$insert into public.documents (employee_id, title, category) values ('b20e0000-0000-4000-8000-0000000000e1', 'QA-20 ugovor', 'contract')$$,
  'HR W: dokument (documents.manage)');
select ok(public.has_permission('documents.view_sensitive'), 'T19 osnova: HR ima documents.view_sensitive');
select ok(not public.has_permission('leave.approve_shortage'), 'T24 osnova: HR nema leave.approve_shortage');
with u as (update public.hour_types set name = 'HR menja' where code = 'redovni' returning 1)
select is((select count(*)::int from u), 0, 'HR W: ne menja podešavanja (settings.manage)');
select is((select count(*)::int from public.payroll_params where valid_from = '2040-01-01'), 0, 'HR R: ne vidi obračun');
select throws_ok($$select public.payroll_run_problems('00000000-0000-0000-0000-000000000000')$$, '42501', 'Nemate pravo „payroll.view"',
  'HR: ne vidi probleme obračuna');
select is((select count(*)::int from public.profiles), 1, 'HR R: vidi samo svoj profil');
with u as (update public.profiles set active = false where id = 'b2055555-5555-4555-8555-555555555555' returning 1)
select is((select count(*)::int from u), 0, 'HR W: ne menja tuđe naloge (users.manage)');
select throws_ok($$insert into public.user_project_access (user_id, project_id)
  values ('b2033333-3333-4333-8333-333333333333', 'b20b0000-0000-4000-8000-00000000000b')$$, '42501', null,
  'HR W: ne dodeljuje projekte');
select throws_ok($$insert into public.role_permissions (role, permission) values ('hr', 'rates.view_b2c')$$, '42501', null,
  'HR W: ne menja prava uloga');
select is((select count(*)::int from public.permissions), 30, 'HR R: katalog prava');
select lives_ok($$insert into public.leave_requests (employee_id, leave_type, start_date, end_date)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'vacation', '2030-03-02', '2030-03-03')$$, 'HR W: zahtev za odsustvo');
select throws_ok($$insert into public.exchange_rates (rate_date, currency, units_per_eur) values ('2040-02-01', 'RSD', 117)$$,
  '42501', null, 'HR W: ne unosi kurs');
select lives_ok($$insert into public.shifts (code, name, start_time, end_time) values ('QA20N', 'QA-20 noćna', '22:00', '06:00')$$,
  'HR W: smena (workforce.manage)');
select is((select crosses_midnight from public.shifts where code = 'QA20N'), true, 'smena preko ponoći je označena');
select is((select count(*)::int from public.migration_report), 0, 'HR R: ne vidi migration_report');
reset role;

-- ═════════════════════════════ Finance ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2044444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(public.current_app_role(), 'finance', 'Finance: current_app_role');
select is((select count(*)::int from public.rates where id::text like 'b20c%'), 3, 'Finance R: sve tarife (B2B i B2C)');
select lives_ok($$insert into public.rates (scope, kind, amount, project_id, effective_from)
  values ('project', 'cost', 19, 'b20b0000-0000-4000-8000-00000000000b', '2031-01-01')$$, 'Finance W: tarifa (rates.manage)');
select is((select count(*)::int from public.project_costs where id::text like 'b20d%'), 2, 'Finance R: svi troškovi');
select is((select count(*)::int from public.employee_private where employee_id = 'b20e0000-0000-4000-8000-0000000000e1'), 1,
  'Finance R: lični podaci (employees.private.view)');
with u as (update public.employee_private set iban = 'RS35000000000000000022' where employee_id = 'b20e0000-0000-4000-8000-0000000000e1' returning 1)
select is((select count(*)::int from u), 0, 'Finance W: ne menja lične podatke (employees.private.edit)');
select throws_ok($$insert into public.employees (first_name, last_name) values ('QA20', 'Fin upis')$$, '42501', null,
  'Finance W: ne upisuje radnika');
select lives_ok($$insert into public.employment_history (employee_id, start_date, engagement_type)
  values ('b20e0000-0000-4000-8000-0000000000e1', '2030-01-01', 'direct_employee')$$, 'Finance W: istorija angažovanja');
select lives_ok($$insert into public.clients (name) values ('QA-20 Finance klijent')$$, 'Finance W: klijent (billing.manage)');
select is((select count(*)::int from public.payroll_params where valid_from = '2040-01-01'), 1, 'Finance R: obračunski parametri');
select lives_ok($$select public.lock_month('2040-01-01')$$, 'Finance W: zaključava mesec (payroll.manage)');
select lives_ok($$select public.unlock_month('2040-01-01')$$, 'Finance W: otključava mesec');
with u as (update public.projects set description = 'Finance menja' where id = 'b20a0000-0000-4000-8000-00000000000a' returning 1)
select is((select count(*)::int from u), 0, 'Finance W: ne menja projekat (R po §4)');
select throws_ok($$insert into public.project_assignments (employee_id, project_id, start_date)
  values ('b20e0000-0000-4000-8000-0000000000e1', 'b20a0000-0000-4000-8000-00000000000a', '2030-05-01')$$, '42501', null,
  'Finance W: ne upisuje dodelu (assignments.manage)');
select throws_ok($$insert into public.documents (employee_id, title, category) values ('b20e0000-0000-4000-8000-0000000000e1', 'QA-20 Fin', 'contract')$$,
  '42501', null, 'Finance W: ne upisuje dokument');
select throws_ok($$insert into public.shifts (code, name, start_time, end_time) values ('QA20F', 'QA-20 Fin', '06:00', '14:00')$$,
  '42501', null, 'Finance W: ne upisuje smenu');
select throws_ok($$insert into public.project_roles (project_id, title) values ('b20a0000-0000-4000-8000-00000000000a', 'QA-20 Fin uloga')$$,
  '42501', null, 'Finance W: ne upisuje Job Role');
with u as (update public.app_settings set language = language returning 1)
select is((select count(*)::int from u), 0, 'Finance W: ne menja podešavanja aplikacije');
select is((select count(*)::int from public.app_settings), 1, 'Finance R: podešavanja aplikacije');
select is((select time_zone from public.app_settings), 'Europe/Bratislava', 'app_settings.time_zone podrazumevano Europe/Bratislava');
select ok(not public.has_permission('leave.approve'), 'Finance nema leave.approve (§4)');
reset role;

-- ═════════════════════════════ override i neaktivan nalog ═════════════════════════════
insert into public.user_permission_overrides (user_id, permission, granted) values
  ('b2055555-5555-4555-8555-555555555555', 'employees.manage', false),
  ('b2055555-5555-4555-8555-555555555555', 'costs.view', true);
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2055555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok(not public.has_permission('employees.manage') and not ('employees.manage' = any (public.my_permissions())),
  'Accept: override granted=false oduzima pravo');
select throws_ok($$insert into public.employees (first_name, last_name) values ('QA20', 'HR2 upis')$$, '42501', null,
  'override granted=false: baza odbija upis radnika');
select is((select count(*)::int from public.project_costs where id::text like 'b20d%'), 2, 'override granted=true daje pravo (costs.view)');
select is((select count(*)::int from public.user_permission_overrides), 2, 'korisnik vidi svoje izuzetke');
delete from public.user_permission_overrides where user_id = 'b2055555-5555-4555-8555-555555555555';
reset role;
select is((select count(*)::int from public.user_permission_overrides where user_id = 'b2055555-5555-4555-8555-555555555555'), 2,
  'korisnik ne briše svoje izuzetke (users.manage)');

update public.profiles set active = false where id = 'b2044444-4444-4444-8444-444444444444';
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2044444-4444-4444-8444-444444444444","role":"authenticated"}';
select ok(not public.has_permission('rates.view_b2c') and cardinality(public.my_permissions()) = 0
      and public.current_app_role() is null and not public.can_see_project('b20a0000-0000-4000-8000-00000000000a'),
  'neaktivan nalog nema nijedno pravo ni projekat');
reset role;

-- ═════════════════════════════ users.manage dat override-om nije prečica do admina ═════════════════════════════
insert into public.user_permission_overrides (user_id, permission, granted)
  values ('b2033333-3333-4333-8333-333333333333', 'users.manage', true);
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2033333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok($$update public.profiles set role = 'finance' where id = 'b2055555-5555-4555-8555-555555555555'$$,
  'HR sa users.manage menja ulogu drugog korisnika');
select throws_ok($$update public.profiles set role = 'admin' where id = 'b2055555-5555-4555-8555-555555555555'$$, '42501',
  'Ulogu admin i nalog admina menja samo admin', 'ulogu admin daje samo admin');
select throws_ok($$update public.profiles set active = false where id = 'b2011111-1111-4111-8111-111111111111'$$, '42501',
  'Ulogu admin i nalog admina menja samo admin', 'nalog admina menja samo admin');
select throws_ok($$update public.profiles set role = 'finance' where id = 'b2033333-3333-4333-8333-333333333333'$$, '42501',
  'Svoju ulogu, status i opseg projekata ne možete da menjate', 'svoju ulogu ne menja');
select throws_ok($$delete from public.user_permission_overrides where user_id = 'b2033333-3333-4333-8333-333333333333'$$, '42501',
  'Svoja prava i projekte ne možete da menjate', 'svoja prava ne menja');
reset role;

select * from finish();
rollback;
