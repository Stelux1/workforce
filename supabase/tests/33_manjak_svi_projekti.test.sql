-- Manjak zbog odsustva na svim projektima radnika (migracija 20261125160100_manjak_svi_projekti.sql, spec §14.1).
-- Radnik e1 radi na A (PM ga ne vidi) i na B (PM ga vidi). Odsustvo obara jutarnju smenu na OBA projekta.
-- PM sa ograničenim pristupom: workforce_coverage i dalje vidi samo B, ali leave_shortage i decide_leave_request
-- proveravaju i pamte oba, bez tarifa i ličnih podataka. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, instance_id, aud, role) values
  ('73300000-0000-4000-8000-0000000000a1', 'qa33-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73300000-0000-4000-8000-0000000000a2', 'qa33-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned' where id = '73300000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'finance', active = true where id = '73300000-0000-4000-8000-0000000000a2';

insert into public.projects (id, name, client_name) values
  ('73300000-0000-4000-8000-0000000000b1', 'QA-33 Skriveni', 'QA-33 klijent'),
  ('73300000-0000-4000-8000-0000000000b2', 'QA-33 Vidljivi', 'QA-33 klijent');
insert into public.user_project_access (user_id, project_id) values
  ('73300000-0000-4000-8000-0000000000a1', '73300000-0000-4000-8000-0000000000b2');
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('73300000-0000-4000-8000-0000000000c1', '73300000-0000-4000-8000-0000000000b1', 'QA-33 Zavarivač'),
  ('73300000-0000-4000-8000-0000000000c2', '73300000-0000-4000-8000-0000000000b2', 'QA-33 Kranista');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('73300000-0000-4000-8000-0000000000d1', null, 'QA33-J', 'Jutro', '06:00', '10:00'),
  ('73300000-0000-4000-8000-0000000000d2', null, 'QA33-P', 'Podne', '11:00', '15:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73300000-0000-4000-8000-0000000000e1', 'QA-33', 'Odmor', 'QA-33-001');
-- e1: na A jutro, na B podne (dve dodele, smene se ne preklapaju)
insert into public.project_assignments (id, employee_id, project_id, project_role_id, default_shift_id, start_date, end_date, status) values
  ('73300000-0000-4000-8000-0000000000f1', '73300000-0000-4000-8000-0000000000e1', '73300000-0000-4000-8000-0000000000b1',
   '73300000-0000-4000-8000-0000000000c1', '73300000-0000-4000-8000-0000000000d1', '2034-05-01', null, 'active'),
  ('73300000-0000-4000-8000-0000000000f2', '73300000-0000-4000-8000-0000000000e1', '73300000-0000-4000-8000-0000000000b2',
   '73300000-0000-4000-8000-0000000000c2', '73300000-0000-4000-8000-0000000000d2', '2034-05-01', null, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count) values
  ('73300000-0000-4000-8000-0000000000b1', '73300000-0000-4000-8000-0000000000c1', '73300000-0000-4000-8000-0000000000d1', '2034-05-01', '2034-05-31', 1),
  ('73300000-0000-4000-8000-0000000000b2', '73300000-0000-4000-8000-0000000000c2', '73300000-0000-4000-8000-0000000000d2', '2034-05-01', '2034-05-31', 1);
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, status) values
  ('73300000-0000-4000-8000-000000000101', '73300000-0000-4000-8000-0000000000e1', 'vacation', '2034-05-10', '2034-05-10', 'pending');

select ok(not has_function_privilege('authenticated', 'public.workforce_coverage_all(date,date,uuid,uuid)', 'execute'),
  'workforce_coverage_all je interna (nije RPC za authenticated)');
select ok(not has_function_privilege('anon', 'public.leave_shortage(uuid)', 'execute'), 'D14: anon ne zove leave_shortage');

set local role authenticated;
set local request.jwt.claims to '{"sub":"73300000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is((select count(*)::int from public.workforce_coverage('2034-05-10', '2034-05-10')
            where project_id = '73300000-0000-4000-8000-0000000000b1'), 0,
  'PM (assigned) i dalje ne vidi pokrivenost skrivenog projekta kroz workforce_coverage');
select is((select count(*)::int from public.workforce_coverage('2034-05-10', '2034-05-10')
            where project_id = '73300000-0000-4000-8000-0000000000b2'), 1,
  'workforce_coverage omot: vidljivi projekat ostaje isti');
select is(jsonb_array_length(public.leave_shortage('73300000-0000-4000-8000-000000000101')), 2,
  'T21 §14.1: leave_shortage proverava SVE projekte radnika (i onaj koji PM ne vidi)');
select results_eq($$select r ->> 'project_name', (r ->> 'required')::int, (r ->> 'available')::int, (r ->> 'deficit')::int
                      from jsonb_array_elements(public.leave_shortage('73300000-0000-4000-8000-000000000101')) r
                     order by r ->> 'project_name'$$,
  $$values ('QA-33 Skriveni'::text, 1, 0, 1), ('QA-33 Vidljivi'::text, 1, 0, 1)$$,
  'manjak po projektu: naziv, potrebno, dostupno, deficit');
select is((select count(*)::int from jsonb_array_elements(public.leave_shortage('73300000-0000-4000-8000-000000000101')) r
            where r ?| array['rate', 'amount', 'currency', 'employee_id', 'employee_name', 'coveringEmployeeIds', 'missing']), 0,
  'samo brojevi i nazivi: bez tarifa i ličnih podataka');
select is((select r ->> 'shift_name' from jsonb_array_elements(public.leave_shortage('73300000-0000-4000-8000-000000000101')) r
            where r ->> 'project_id' = '73300000-0000-4000-8000-0000000000b1'), 'Jutro 06:00–10:00', 'naziv smene za prikaz');

select lives_ok($$select public.decide_leave_request('73300000-0000-4000-8000-000000000101', 'approved', 'QA-33 hitno, pokrivamo spolja')$$,
  'T24: PM (leave.approve_shortage) odobrava uz razlog');

reset role;
set local request.jwt.claims to '{}';
select results_eq($$select shortage_override, jsonb_array_length(shortage_snapshot) from public.leave_requests where id = '73300000-0000-4000-8000-000000000101'$$,
  $$values (true, 2)$$, 'snimak manjka pamti oba projekta, i skriveni');

set local role authenticated;
set local request.jwt.claims to '{"sub":"73300000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select public.leave_shortage('73300000-0000-4000-8000-000000000101')$$, '42501', null,
  'Finance (bez leave.approve) ne zove leave_shortage');

select * from finish();
rollback;
