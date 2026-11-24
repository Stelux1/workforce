-- Obaveštenje o manjku prati trenutne brojeve (migracija 20261125160400_obavestenja_osvezavanje.sql, spec §15.01).
-- Potrebno 3, planiran 1 → „nedostaje 2"; posle smanjenja potrebe na 2 → isto obaveštenje kaže „nedostaje 1",
-- pročitanost ostaje. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email, instance_id, aud, role) values
  ('73500000-0000-4000-8000-0000000000a1', 'qa35-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '73500000-0000-4000-8000-0000000000a1';
insert into public.projects (id, name, client_name) values ('73500000-0000-4000-8000-0000000000b1', 'QA-35 projekat', 'QA-35 klijent');
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('73500000-0000-4000-8000-0000000000c1', '73500000-0000-4000-8000-0000000000b1', 'QA-35 Zavarivač');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('73500000-0000-4000-8000-0000000000d1', null, 'QA35-J', 'Jutro', '06:00', '14:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73500000-0000-4000-8000-0000000000e1', 'QA-35', 'Jedan', 'QA-35-001');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, default_shift_id, start_date, status) values
  ('73500000-0000-4000-8000-0000000000f1', '73500000-0000-4000-8000-0000000000e1', '73500000-0000-4000-8000-0000000000b1',
   '73500000-0000-4000-8000-0000000000c1', '73500000-0000-4000-8000-0000000000d1', current_date - 5, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.workforce_requirements (id, project_id, project_role_id, shift_id, date_from, date_to, required_count) values
  ('73500000-0000-4000-8000-000000000101', '73500000-0000-4000-8000-0000000000b1', '73500000-0000-4000-8000-0000000000c1',
   '73500000-0000-4000-8000-0000000000d1', current_date + 2, current_date + 2, 3);

set local role authenticated;
set local request.jwt.claims to '{"sub":"73500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.refresh_notifications()$$, 'prvo osvežavanje');
select is((select (payload ->> 'deficit')::int from public.notifications
            where event_key = 'shortage:73500000-0000-4000-8000-0000000000b1:73500000-0000-4000-8000-0000000000c1:73500000-0000-4000-8000-0000000000d1:' || (current_date + 2)),
  2, 'manjak 2 (potrebno 3, planiran 1)');
select lives_ok($$select public.mark_notifications_read(array(select id from public.notifications where event_key like 'shortage:73500000-%'))$$,
  'admin čita obaveštenje');

reset role;
set local request.jwt.claims to '{}';
update public.workforce_requirements set required_count = 2 where id = '73500000-0000-4000-8000-000000000101';
set local role authenticated;
set local request.jwt.claims to '{"sub":"73500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select public.refresh_notifications();

select results_eq($$select (payload ->> 'deficit')::int, message like '%missing 1' from public.notifications
                     where event_key like 'shortage:73500000-%'$$,
  $$values (1, true)$$, 'isto obaveštenje sada kaže manjak 1 (nema zastarelih brojeva, nema duplikata)');
select is((select count(*)::int from public.notification_reads r join public.notifications n on n.id = r.notification_id
            where n.event_key like 'shortage:73500000-%'), 1, 'pročitanost ostaje posle osvežavanja brojeva');

select * from finish();
rollback;
