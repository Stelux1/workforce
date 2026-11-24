-- Angažman kao jedna evidencija (migracija 20261125030000_angazmani_tarife.sql, docs/TEAMORA-DATA-MODEL.md §2.4,
-- spec §2.3, §4.5; T01, T06 (baza), T25). Sopstveni podaci (QA-22, 2033), sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ───── posle migracije: svaki ispravan element starog JSON-a ima dodelu (R1) ─────
select is((
  select count(*)::int
    from public.migration_report m
    cross join lateral jsonb_array_elements(case when jsonb_typeof(m.details -> 'assigned_employees') = 'array'
                                                 then m.details -> 'assigned_employees' else '[]'::jsonb end) e
    join public.employees em on em.id::text = e ->> 'employee_id'
   where m.migration = '20261125030000_angazmani_tarife' and m.issue = 'assigned_employees_backup'
     and not exists (select 1 from public.project_assignments a
                      where a.employee_id = em.id and a.project_id::text = m.entity_id)),
  0, 'svaki radnik sa starog spiska projekta ima dodelu (project_assignments)');
select is((select count(*)::int from public.projects p, jsonb_array_elements(p.assigned_employees) e
            where e ? 'b2c_rate' or e ? 'b2b_rate'), 0, 'keš assigned_employees više nema tarife (R2)');
select is((select count(*)::int from public.projects p, jsonb_array_elements(p.job_roles) e where e ? 'b2b_rate'), 0,
  'keš job_roles više nema tarife (R2)');

-- ───── priprema ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('72211111-1111-4111-8111-111111111111', 'qa22-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72222222-2222-4222-8222-222222222222', 'qa22-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72233333-3333-4333-8333-333333333333', 'qa22-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '72211111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = '72222222-2222-4222-8222-222222222222';
update public.profiles set role = 'project_manager', active = true where id = '72233333-3333-4333-8333-333333333333';
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name) values ('c2200000-0000-4000-8000-0000000000c1', 'QA-22 klijent');
insert into public.projects (id, name, client_name) values
  ('b2200000-0000-4000-8000-0000000000b1', 'QA-22 projekat A', 'QA-22 klijent'),
  ('b2200000-0000-4000-8000-0000000000b2', 'QA-22 projekat B', 'QA-22 klijent');
insert into public.project_roles (id, project_id, title) values
  ('a2210000-0000-4000-8000-0000000000e1', 'b2200000-0000-4000-8000-0000000000b1', 'QA-22 Zavarivač'),
  ('a2210000-0000-4000-8000-0000000000e2', 'b2200000-0000-4000-8000-0000000000b2', 'QA-22 Monter');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d2200000-0000-4000-8000-0000000000d1', 'QA-22', 'Radnik', 'QA-22-001'),
  ('d2200000-0000-4000-8000-0000000000d2', 'QA-22', 'Drugi', 'QA-22-002');
insert into public.rates (scope, kind, amount, project_id, project_role_id, effective_from) values
  ('project', 'cost', 40, 'b2200000-0000-4000-8000-0000000000b1', 'a2210000-0000-4000-8000-0000000000e1', '2033-01-01'),
  ('project', 'revenue', 55, 'b2200000-0000-4000-8000-0000000000b1', 'a2210000-0000-4000-8000-0000000000e1', '2033-01-01'),
  ('project', 'cost', 42, 'b2200000-0000-4000-8000-0000000000b2', 'a2210000-0000-4000-8000-0000000000e2', '2033-01-01'),
  ('project', 'revenue', 58, 'b2200000-0000-4000-8000-0000000000b2', 'a2210000-0000-4000-8000-0000000000e2', '2033-01-01');

-- ───── HR dodaje radnika na projekat (Add Assignment, bez tarife) ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.create_assignment('{"employee_id": "d2200000-0000-4000-8000-0000000000d1",
    "project_id": "b2200000-0000-4000-8000-0000000000b1", "project_role_id": "a2210000-0000-4000-8000-0000000000e1",
    "start_date": "2033-03-01", "b2c": {"amount": 99, "currency": "EUR"}}')$$,
  '42501', null, 'HR ne može da upiše tarifu kroz dodelu (rates.manage)');
create temp table qa22 (k text primary key, id uuid);
grant all on qa22 to authenticated;
insert into qa22 select 'a1', public.create_assignment('{"employee_id": "d2200000-0000-4000-8000-0000000000d1",
    "project_id": "b2200000-0000-4000-8000-0000000000b1", "project_role_id": "a2210000-0000-4000-8000-0000000000e1",
    "start_date": "2033-03-01", "notes": "QA-22"}');
select is((select (position, assignment_type, status)::text from public.project_assignments where id = (select id from qa22 where k = 'a1')),
  '("QA-22 Zavarivač",standard,active)', 'dodela ima Job Role (snimak naziva) i vrstu standard');
-- §2.3.3: dodela sa kartice projekta je ista evidencija koju čita /rates (project_assignments), i keš projekta je prati.
select is((select e ->> 'assignment_id' from public.projects p, jsonb_array_elements(p.assigned_employees) e
            where p.id = 'b2200000-0000-4000-8000-0000000000b1'), (select id::text from qa22 where k = 'a1'),
  'keš projekta (Workers) pokazuje istu dodelu');
select throws_ok($$select public.create_assignment('{"employee_id": "d2200000-0000-4000-8000-0000000000d1",
    "project_id": "b2200000-0000-4000-8000-0000000000b1", "project_role_id": "a2210000-0000-4000-8000-0000000000e1",
    "start_date": "2033-06-01"}')$$,
  '23P01', 'Radnik već ima dodelu na ovom projektu od 01.03.2033 do neodređeno — dodele istog radnika na istom projektu ne smeju da se preklapaju',
  'preklopljena dodela istog radnika na istom projektu je odbijena');
select throws_ok($$insert into public.project_assignments (employee_id, project_id, start_date)
    values ('d2200000-0000-4000-8000-0000000000d1', 'b2200000-0000-4000-8000-0000000000b1', '2033-02-01')$$,
  '23P01', null, 'i direktnim upisom');

-- T01: isti radnik na dva projekta = dva reda dodele, jedan radnik.
insert into qa22 select 'b1', public.create_assignment('{"employee_id": "d2200000-0000-4000-8000-0000000000d1",
    "project_id": "b2200000-0000-4000-8000-0000000000b2", "project_role_id": "a2210000-0000-4000-8000-0000000000e2",
    "start_date": "2033-03-01", "end_date": "2033-03-31"}');
select is((select (count(*), count(distinct employee_id))::text from public.project_assignments
            where employee_id = 'd2200000-0000-4000-8000-0000000000d1' and status <> 'cancelled'),
  '(2,1)', 'T01: radnik na dva projekta ima dva reda dodele, a broji se jednom');

-- Keš se ne piše direktno (ni admin).
set local request.jwt.claims to '{"sub":"72211111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$update public.projects set assigned_employees = '[]' where id = 'b2200000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnici i Job Roles se menjaju kroz angažmane i Job Roles', 'direktan upis assigned_employees je odbijen i adminu');
select throws_ok($$update public.projects set job_roles = '[{"title": "x", "b2b_rate": 99}]' where id = 'b2200000-0000-4000-8000-0000000000b1'$$,
  '42501', null, 'direktan upis job_roles je odbijen');

-- Rad na dodeli A1: nedelja 07.03.2033, pon 8 h, odobrena.
insert into public.timesheets (id, employee_id, project_id, assignment_id, week_start, mon_hours, approval_status)
  select 'f2200000-0000-4000-8000-0000000000f1', 'd2200000-0000-4000-8000-0000000000d1', 'b2200000-0000-4000-8000-0000000000b1',
         id, '2033-03-07', 8, 'submitted' from qa22 where k = 'a1';
update public.timesheets set approval_status = 'approved' where id = 'f2200000-0000-4000-8000-0000000000f1';
reset role;
create temp table qa22_ts as select id, assignment_id, total_hours, worker_cost, client_revenue, rate_snapshot
  from public.timesheets where id = 'f2200000-0000-4000-8000-0000000000f1';
grant all on qa22_ts to authenticated;
set local role authenticated;

-- ───── End / Cancel / brisanje (T06, baza) ─────
set local request.jwt.claims to '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.end_assignment((select id from qa22 where k = 'a1'), '2033-03-06', 'kraj pre rada')$$,
  '23514', 'Poslednji dan rada na dodeli je 07.03.2033 — kraj ne može biti pre njega', 'End pre poslednjeg dana rada je odbijen');
select throws_ok($$select public.cancel_assignment((select id from qa22 where k = 'a1'), 'greška u unosu')$$,
  '23514', null, 'dodela sa satima se ne poništava');
select throws_ok($$update public.project_assignments set start_date = '2033-03-08' where id = (select id from qa22 where k = 'a1')$$,
  '23514', null, 'period se ne sužava preko dana sa satima');
select throws_ok($$update public.project_assignments set employee_id = 'd2200000-0000-4000-8000-0000000000d2'
    where id = (select id from qa22 where k = 'a1')$$, '23514', null, 'radnik dodele sa radom se ne menja');

-- ───── Transfer: stara se zatvara, sati ostaju na njoj ─────
insert into qa22 select 't1', public.transfer_assignment((select id from qa22 where k = 'a1'), '2033-03-14',
  'b2200000-0000-4000-8000-0000000000b1', 'a2210000-0000-4000-8000-0000000000e1', null, 'premeštaj na drugu smenu');
select is((select (end_date, end_reason)::text from public.project_assignments where id = (select id from qa22 where k = 'a1')),
  '(2033-03-13,"premeštaj na drugu smenu")', 'Transfer zatvara staru dodelu dan pre');
select is((select (assignment_type, source_assignment_id = (select id from qa22 where k = 'a1'), start_date)::text
             from public.project_assignments where id = (select id from qa22 where k = 't1')),
  '(transfer,t,2033-03-14)', 'nova dodela je transfer sa izvorom');
reset role;
select is((select (t.assignment_id, t.total_hours, t.worker_cost, t.client_revenue, t.rate_snapshot)::text
             from public.timesheets t where t.id = 'f2200000-0000-4000-8000-0000000000f1'),
  (select (assignment_id, total_hours, worker_cost, client_revenue, rate_snapshot)::text from qa22_ts),
  'Transfer: satnica stare dodele ostaje ista (dodela, sati, iznosi, snimak)');
select is((select count(*)::int from public.timesheets where assignment_id = (select id from qa22 where k = 'a1')), 1,
  'broj satnica stare dodele je isti');

-- Additional i Cancel (bez rada).
set local role authenticated;
set local request.jwt.claims to '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$select public.cancel_assignment((select id from qa22 where k = 'b1'), 'pogrešan projekat')$$,
  'dodela bez rada se poništava');
select is((select jsonb_array_length(assigned_employees) from public.projects where id = 'b2200000-0000-4000-8000-0000000000b2'), 0,
  'poništena dodela nestaje iz keša projekta');
select throws_ok($$delete from public.project_assignments where id = (select id from qa22 where k = 'a1')$$,
  '23514', null, 'dodela sa satima se ne briše');

-- ───── T25: PM preimenuje Job Role i projekat — veze i tarife ostaju ─────
set local request.jwt.claims to '{"sub":"72233333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok($$update public.project_roles set title = 'QA-22 Zavarivač TIG' where id = 'a2210000-0000-4000-8000-0000000000e1'$$,
  'PM preimenuje Job Role (dodele i tarife na toj ulozi se osvežavaju bez greške)');
select lives_ok($$update public.projects set name = 'QA-22 projekat A (novo ime)' where id = 'b2200000-0000-4000-8000-0000000000b1'$$,
  'PM preimenuje projekat');
reset role;
set local request.jwt.claims to '{}';
select is((select string_agg(distinct position, ',') from public.project_assignments
            where project_role_id = 'a2210000-0000-4000-8000-0000000000e1'), 'QA-22 Zavarivač TIG',
  'T25: dodele nose novi naziv uloge (snimak), veza je project_role_id');
select is(public.resolve_rate('client', 'd2200000-0000-4000-8000-0000000000d1', 'b2200000-0000-4000-8000-0000000000b1', '2033-03-20')
            ->> 'rate', '55.00', 'T25: tarifa Job Role važi i posle preimenovanja');
select is(public.assignment_display_status(a, '2033-03-20'), 'completed', 'prikazni status zatvorene dodele je completed')
  from public.project_assignments a where a.id = (select id from qa22 where k = 'a1');

select * from finish();
rollback;
