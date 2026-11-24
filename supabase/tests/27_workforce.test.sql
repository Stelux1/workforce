-- Workforce model (migracija 20261125070000_workforce_model.sql, spec §13.03–13.05, §14.1, 4.3.3; trake T-G).
-- Isti primeri kao src/lib/workforce.test.js (paritet JS/SQL): T05, T20, T21.
-- Sopstveni podaci sa oznakom QA-27 i 2033. godina. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('72700000-0000-4000-8000-0000000000a1', 'qa27-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72700000-0000-4000-8000-0000000000a2', 'qa27-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72700000-0000-4000-8000-0000000000a3', 'qa27-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '72700000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'hr', active = true where id = '72700000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'finance', active = true where id = '72700000-0000-4000-8000-0000000000a3';

insert into public.projects (id, name, client_name) values
  ('72700000-0000-4000-8000-0000000000b1', 'QA-27 projekat', 'QA-27 klijent'),
  ('72700000-0000-4000-8000-0000000000b2', 'QA-27 drugi projekat', 'QA-27 klijent');
-- (trigger keša iz 03 pada na INSERT u project_roles: new.employee_id ne postoji; zaobilazi se samo u pripremi testa)
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000b1', 'QA-27 Zavarivač'),
  ('72700000-0000-4000-8000-0000000000c2', '72700000-0000-4000-8000-0000000000b2', 'QA-27 Kranista');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('72700000-0000-4000-8000-0000000000d1', null, 'QA27-J', 'Jutro', '06:00', '14:00'),
  ('72700000-0000-4000-8000-0000000000d2', null, 'QA27-P', 'Popodne', '14:00', '22:00'),
  ('72700000-0000-4000-8000-0000000000d3', null, 'QA27-N', 'Noć', '22:00', '06:00'),
  ('72700000-0000-4000-8000-0000000000d4', null, 'QA27-R', 'Rano', '04:00', '12:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('72700000-0000-4000-8000-0000000000e1', 'QA-27', 'Jedan', 'QA-27-001'),
  ('72700000-0000-4000-8000-0000000000e2', 'QA-27', 'Dva', 'QA-27-002'),
  ('72700000-0000-4000-8000-0000000000e3', 'QA-27', 'Tri', 'QA-27-003'),
  ('72700000-0000-4000-8000-0000000000e4', 'QA-27', 'Četiri', 'QA-27-004');
insert into public.project_assignments (id, employee_id, project_id, position, project_role_id, default_shift_id, start_date, end_date, status) values
  ('72700000-0000-4000-8000-0000000000f1', '72700000-0000-4000-8000-0000000000e1', '72700000-0000-4000-8000-0000000000b1', 'QA-27 Zavarivač', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-01', null, 'active'),
  ('72700000-0000-4000-8000-0000000000f2', '72700000-0000-4000-8000-0000000000e2', '72700000-0000-4000-8000-0000000000b1', 'QA-27 Zavarivač', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-01', null, 'active'),
  ('72700000-0000-4000-8000-0000000000f3', '72700000-0000-4000-8000-0000000000e3', '72700000-0000-4000-8000-0000000000b1', 'QA-27 Zavarivač', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d2', '2033-03-01', null, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, status) values
  ('72700000-0000-4000-8000-0000000000a9', '72700000-0000-4000-8000-0000000000e1', 'vacation', '2033-03-15', '2033-03-16', 'pending');

-- ───── admin: potreban broj ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72700000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select lives_ok($$select public.set_workforce_requirement('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-01', '2033-03-31', 2, 'QA-27 početno')$$,
  'set_workforce_requirement: prvi opseg 1–31.3. = 2 radnika');

-- 1) dva zahteva za isti role/shift/datum se odbijaju
select throws_ok($$insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count)
  values ('72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-20', '2033-03-25', 5)$$,
  '23P01', null, 'dva zahteva za istu ulogu, smenu i datum su odbijena');
select lives_ok($$insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count)
  values ('72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d2', '2033-03-20', '2033-03-25', 1)$$,
  'ista uloga, druga smena, isti datumi: dozvoljeno');
select throws_ok($$insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count)
  values ('72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000c2', '72700000-0000-4000-8000-0000000000d1', '2033-03-01', '2033-03-02', 1)$$,
  '23514', null, 'Job Role drugog projekta je odbijen');
select throws_ok($$insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count)
  values ('72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d3', '2033-03-05', '2033-03-04', 1)$$,
  '23514', null, 'datum „do" pre „od" je odbijen');

-- pokrivenost bez odsustava: 2 potrebna, 2 planirana po podrazumevanoj smeni
select is((select deficit from public.workforce_coverage('2033-03-04', '2033-03-04', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 0, 'coverage: dva potrebna, dva planirana → deficit 0');
select is((select planned from public.workforce_coverage('2033-03-04', '2033-03-04', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 2, 'coverage: planirana dva radnika');

-- 2) T20: broj se menja od 10., ranije ostaje
select lives_ok($$select public.set_workforce_requirement('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-10', null, 3, 'QA-27 od 10.')$$,
  'T20: set_workforce_requirement od 10. (do kraja opsega)');
select is((select count(*)::int from public.workforce_requirements
            where project_role_id = '72700000-0000-4000-8000-0000000000c1' and shift_id = '72700000-0000-4000-8000-0000000000d1'), 2,
  'T20: opseg je presečen na dva reda');
select is((select required from public.workforce_coverage('2033-03-09', '2033-03-09', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 2, 'T20: 9. ostaje 2');
select is((select required from public.workforce_coverage('2033-03-10', '2033-03-10', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 3, 'T20: od 10. je 3');
select is((select deficit from public.workforce_coverage('2033-03-10', '2033-03-10', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 1, 'T20: coverage posle promene pokazuje novi deficit 1');
select is((select deficit from public.workforce_coverage('2033-03-09', '2033-03-09', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 0, 'T20: deficit pre 10. ostaje 0');
select is((select date_to from public.workforce_requirements
            where project_role_id = '72700000-0000-4000-8000-0000000000c1' and shift_id = '72700000-0000-4000-8000-0000000000d1' and date_from = '2033-03-01'),
  '2033-03-09'::date, 'T20: raniji red se završava 9.');

-- sečenje u sredini opsega: 14.–15. = 2, ostalo (od 10.) ostaje 3 pre i posle
select lives_ok($$select public.set_workforce_requirement('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-03-14', '2033-03-17', 2)$$,
  'opseg se seče i u sredini');
select is((select count(*)::int from public.workforce_requirements
            where project_role_id = '72700000-0000-4000-8000-0000000000c1' and shift_id = '72700000-0000-4000-8000-0000000000d1'), 4,
  'opseg u sredini daje četiri reda (1–9, 10–13, 14–17, 18–31)');

-- 3) T21: simulirani odmor jednog od dva potrebna radnika → deficit 1 za tu ulogu i smenu (15. je potrebno 2)
select is((select deficit from public.workforce_coverage('2033-03-15', '2033-03-15', '72700000-0000-4000-8000-0000000000b1')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 0, 'T21: zahtev na čekanju bez simulacije ne pravi deficit');
select is((select deficit from public.workforce_coverage('2033-03-15', '2033-03-15', '72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000a9')
            where shift_id = '72700000-0000-4000-8000-0000000000d1'), 1, 'T21: simulirani odmor daje deficit 1');
select results_eq($$select planned, absent, available from public.workforce_coverage('2033-03-15', '2033-03-15', '72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000a9')
                     where shift_id = '72700000-0000-4000-8000-0000000000d1'$$,
  $$values (2, 1, 1)$$, 'T21: planirana 2, odsutna 1, dostupna 1');

-- 4) T05: slobodan je radnik sa aktivnom dodelom u drugoj smeni
select is(public.worker_is_free('72700000-0000-4000-8000-0000000000e1', '2033-03-04', '72700000-0000-4000-8000-0000000000d2'), true,
  'T05: e1 radi jutro, popodne je slobodan');
select is(public.worker_is_free('72700000-0000-4000-8000-0000000000e1', '2033-03-04', '72700000-0000-4000-8000-0000000000d1'), false,
  'T05: e1 u svojoj smeni nije slobodan');
select is(public.worker_is_free('72700000-0000-4000-8000-0000000000e1', '2033-03-04', '72700000-0000-4000-8000-0000000000d4'), false,
  'T05: preklopljen interval (04–12 zalazi u 06–14) nije slobodan');
select is(public.worker_is_free('72700000-0000-4000-8000-0000000000e4', '2033-03-04', '72700000-0000-4000-8000-0000000000d1'), true,
  'T05: radnik bez angažmana je slobodan');

-- raspored: smena određuje vreme, preklop se odbija, uzastopne smene prolaze
insert into public.schedules (id, employee_id, date, shift_id, project_id, assignment_id, status, shift_start, shift_end)
values ('72700000-0000-4000-8000-0000000000a5', '72700000-0000-4000-8000-0000000000e2', '2033-03-03', '72700000-0000-4000-8000-0000000000d3',
        '72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000f2', 'assigned', 'x', 'x');
select results_eq($$select shift_start, shift_end, start_at, end_at from public.schedules where id = '72700000-0000-4000-8000-0000000000a5'$$,
  $$values ('22:00'::text, '06:00'::text, '2033-03-03 22:00'::timestamp, '2033-03-04 06:00'::timestamp)$$,
  'raspored: vreme iz smene, noćna smena završava sutradan');
select throws_ok($$insert into public.schedules (employee_id, date, shift_id, project_id, status, shift_start, shift_end)
  values ('72700000-0000-4000-8000-0000000000e2', '2033-03-04', '72700000-0000-4000-8000-0000000000d4', '72700000-0000-4000-8000-0000000000b1', 'assigned', 'x', 'x')$$,
  '23P01', null, 'raspored: preklopljeni interval istog radnika je odbijen');
select lives_ok($$insert into public.schedules (employee_id, date, shift_id, project_id, status, shift_start, shift_end)
  values ('72700000-0000-4000-8000-0000000000e2', '2033-03-04', '72700000-0000-4000-8000-0000000000d1', '72700000-0000-4000-8000-0000000000b1', 'assigned', 'x', 'x')$$,
  'raspored: uzastopne smene (kraj = početak) se ne preklapaju');
select throws_ok($$insert into public.schedules (employee_id, date, shift_id, project_id, assignment_id, status, shift_start, shift_end)
  values ('72700000-0000-4000-8000-0000000000e3', '2033-03-08', '72700000-0000-4000-8000-0000000000d1', '72700000-0000-4000-8000-0000000000b1', '72700000-0000-4000-8000-0000000000f1', 'assigned', 'x', 'x')$$,
  '23514', null, 'raspored: angažman drugog radnika je odbijen');

-- ───── prava ─────
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"72700000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.set_workforce_requirement('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-04-01', '2033-04-02', 1)$$,
  '42501', null, 'Finance nema workforce.manage: RPC odbijen');
select throws_ok($$insert into public.schedules (employee_id, date, shift_start, shift_end) values ('72700000-0000-4000-8000-0000000000e4', '2033-03-08', '08:00', '16:00')$$,
  '42501', null, 'Finance ne može da upisuje raspored');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"72700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.set_workforce_requirement('72700000-0000-4000-8000-0000000000c1', '72700000-0000-4000-8000-0000000000d1', '2033-04-01', '2033-04-02', 1)$$,
  'HR ima workforce.manage: RPC prolazi');

-- absence_kind i zatvorenost za anon
reset role;
select is((select array_agg(public.absence_kind(t) order by t) from unnest(array['vacation','personal','unpaid','sick','maternity','paternity','other']) t),
  array['other_absence','other_absence','other_absence','leave','sick_leave','leave','leave'], 'absence_kind (paritet sa absenceKind u JS-u)');
select is(has_function_privilege('anon', 'public.workforce_coverage(date, date, uuid, uuid)', 'execute'), false, 'anon ne sme workforce_coverage');
select is(has_function_privilege('anon', 'public.set_workforce_requirement(uuid, uuid, date, date, integer, text)', 'execute'), false, 'anon ne sme set_workforce_requirement');

select * from finish();
rollback;
