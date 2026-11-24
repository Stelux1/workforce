-- Rate History (migracija 20261125030000_angazmani_tarife.sql, docs/TEAMORA-DATA-MODEL.md §2.5, spec §5, T07).
-- Isti primer „T07" je u src/lib/payroll/rateHistory.test.js. Sopstveni podaci (QA-23, 2033), sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ───── priprema (postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('72311111-1111-4111-8111-111111111111', 'qa23-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72322222-2222-4222-8222-222222222222', 'qa23-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72333333-3333-4333-8333-333333333333', 'qa23-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '72311111-1111-4111-8111-111111111111';
update public.profiles set role = 'finance', active = true where id = '72322222-2222-4222-8222-222222222222';
update public.profiles set role = 'hr', active = true where id = '72333333-3333-4333-8333-333333333333';
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name) values ('c2300000-0000-4000-8000-0000000000c1', 'QA-23 klijent');
insert into public.projects (id, name, client_name) values ('b2300000-0000-4000-8000-0000000000b1', 'QA-23 projekat', 'QA-23 klijent');
insert into public.project_roles (id, project_id, title) values
  ('a2310000-0000-4000-8000-0000000000e1', 'b2300000-0000-4000-8000-0000000000b1', 'QA-23 Zavarivač');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d2300000-0000-4000-8000-0000000000d1', 'QA-23', 'Radnik', 'QA-23-001');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, start_date) values
  ('a2300000-0000-4000-8000-0000000000a1', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1',
   'a2310000-0000-4000-8000-0000000000e1', '2033-03-01');
insert into public.rates (id, scope, kind, amount, assignment_id, effective_from) values
  ('e2300000-0000-4000-8000-000000000001', 'assignment', 'cost', 45, 'a2300000-0000-4000-8000-0000000000a1', '2033-03-01');
insert into public.rates (id, scope, kind, amount, project_id, project_role_id, effective_from) values
  ('e2300000-0000-4000-8000-000000000002', 'project', 'revenue', 60, 'b2300000-0000-4000-8000-0000000000b1',
   'a2310000-0000-4000-8000-0000000000e1', '2033-03-01');

select is((select (employee_id, project_id, position)::text from public.rates where id = 'e2300000-0000-4000-8000-000000000001'),
  '(d2300000-0000-4000-8000-0000000000d1,b2300000-0000-4000-8000-0000000000b1,"QA-23 Zavarivač")',
  'tarifa angažmana dobija radnika, projekat i snimak uloge iz dodele');

-- Satnica nedelje 07.03.2033 (pon 8 h), odobrena pre promene tarife.
set local role authenticated;
set local request.jwt.claims to '{"sub":"72311111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.timesheets (id, employee_id, project_id, assignment_id, week_start, mon_hours, approval_status) values
  ('f2300000-0000-4000-8000-0000000000f1', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1',
   'a2300000-0000-4000-8000-0000000000a1', '2033-03-07', 8, 'submitted');
update public.timesheets set approval_status = 'approved' where id = 'f2300000-0000-4000-8000-0000000000f1';
reset role;
create temp table qa23_snap as select rate_snapshot, worker_cost, client_revenue from public.timesheets
 where id = 'f2300000-0000-4000-8000-0000000000f1';
select is((select (worker_cost, client_revenue)::text from qa23_snap), '(360.00,480.00)',
  'T07: odobrena nedelja pre promene — 8 × 45 trošak, 8 × 60 prihod');

-- ───── Finance menja tarifu od 15. ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72322222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.change_rate('e2300000-0000-4000-8000-000000000001', '2033-03-15', 50, 'EUR', 'x')$$,
  '23514', 'Razlog je obavezan (najmanje 5 znakova)', 'promena tarife bez razloga je odbijena');
select throws_ok($$select public.change_rate('e2300000-0000-4000-8000-000000000001', '2033-02-15', 50, 'EUR', 'T07 nova tarifa od 15.')$$,
  '23514', null, 'datum promene pre početka tarife je odbijen');
select lives_ok($$select public.change_rate('e2300000-0000-4000-8000-000000000001', '2033-03-15', 50, 'EUR', 'T07 nova tarifa od 15.')$$,
  'T07: change_rate od 15.');
reset role;

select is((select (effective_to, status, superseded_by is not null)::text from public.rates where id = 'e2300000-0000-4000-8000-000000000001'),
  '(2033-03-14,active,t)', 'T07: stara tarifa je zatvorena 14. i zna ko ju je zamenio');
select is((select (amount, effective_from, effective_to, change_reason)::text from public.rates
            where id = (select superseded_by from public.rates where id = 'e2300000-0000-4000-8000-000000000001')),
  '(50.00,2033-03-15,,"T07 nova tarifa od 15.")', 'T07: nova tarifa 50 važi od 15., sa razlogom');
select is(public.resolve_rate('worker', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1', '2033-03-14') ->> 'rate',
  '45.00', 'T07: dan 14. koristi staru tarifu (45)');
select is(public.resolve_rate('worker', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1', '2033-03-15') ->> 'rate',
  '50.00', 'T07: dan 15. koristi novu tarifu (50)');
select is(public.resolve_rate('client', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1', '2033-03-15')
            - 'ref' - 'assignment_id' - 'project_role_id',
  '{"rate": 60.00, "currency": "EUR", "source": "role_rate"}'::jsonb, 'B2B dolazi iz tarife Job Role');
select is((select (rate_snapshot, worker_cost, client_revenue)::text from public.timesheets where id = 'f2300000-0000-4000-8000-0000000000f1'),
  (select (rate_snapshot, worker_cost, client_revenue)::text from qa23_snap),
  'T07: odobrena satnica pre promene ima isti rate_snapshot i iznose (D10)');

-- ───── preklapanje i susedne tarife ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72322222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.set_rate('{"scope": "assignment", "kind": "cost", "assignment_id": "a2300000-0000-4000-8000-0000000000a1",
    "amount": 55, "effective_from": "2033-04-01", "reason": "preklapanje"}')$$,
  '23P01', null, 'preklapajuća tarifa istog angažmana je odbijena (rates_no_overlap)');
select lives_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d2300000-0000-4000-8000-0000000000d1",
    "amount": 10, "effective_from": "2033-01-01", "effective_to": "2033-01-31"}')$$, 'tarifa radnika za januar');
select lives_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d2300000-0000-4000-8000-0000000000d1",
    "amount": 11, "effective_from": "2033-02-01"}')$$, 'susedna tarifa (od 1. februara) se prima');
select throws_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d2300000-0000-4000-8000-0000000000d1",
    "amount": 12, "effective_from": "2033-01-31", "effective_to": "2033-01-31"}')$$,
  '23P01', null, 'tarifa koja deli jedan dan sa postojećom je odbijena');

-- ───── istorija: šta se posle unosa ne menja ─────
select throws_ok($$update public.rates set amount = 99 where id = 'e2300000-0000-4000-8000-000000000002'$$,
  '23514', 'Iznos, valuta, jedinica, nivo i početak važenja tarife se ne menjaju — novu cenu unesite kao „Promeni od datuma"',
  'iznos postojeće tarife se ne menja direktno');
select throws_ok($$update public.rates set effective_from = '2033-02-01' where id = 'e2300000-0000-4000-8000-000000000002'$$,
  '23514', null, 'ni početak važenja');
select lives_ok($$update public.rates set notes = 'QA-23 napomena', effective_to = '2033-12-31' where id = 'e2300000-0000-4000-8000-000000000002'$$,
  'napomena i kraj važenja se menjaju');
select throws_ok($$delete from public.rates where id = 'e2300000-0000-4000-8000-000000000001'$$,
  '23514', 'Tarifa je primenjena u satnicama i ne briše se — postavite je na Neaktivna',
  'tarifa iz snimka odobrene satnice se ne briše');
select lives_ok($$delete from public.rates where employee_id = 'd2300000-0000-4000-8000-0000000000d1' and scope = 'employee' and amount = 11$$,
  'nekorišćena tarifa se briše');

-- Isti početak: stari red postaje neaktivan.
select lives_ok($$select public.change_rate('e2300000-0000-4000-8000-000000000002', '2033-03-01', 62, 'EUR', 'ispravka B2B od početka')$$,
  'promena od istog datuma');
reset role;
select is((select status from public.rates where id = 'e2300000-0000-4000-8000-000000000002'), 'inactive',
  'promena od istog početka: stari red je neaktivan');
select is(public.resolve_rate('client', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1', '2033-03-02') ->> 'rate',
  '62.00', 'nova B2B tarifa važi od početka');

-- ───── HR nema pravo na tarife ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.rates where project_id = 'b2300000-0000-4000-8000-0000000000b1'), 0,
  'HR ne čita ni B2B ni B2C tarife');
select throws_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d2300000-0000-4000-8000-0000000000d1",
    "amount": 99, "effective_from": "2034-01-01"}')$$, '42501', null, 'HR ne unosi tarife (rates.manage)');
select throws_ok($$select public.resolve_rate('worker', 'd2300000-0000-4000-8000-0000000000d1', 'b2300000-0000-4000-8000-0000000000b1', '2033-03-15')$$,
  '42501', null, 'izbor tarife u bazi nije RPC');
reset role;

set local request.jwt.claims to '{}';
-- Valuta je dozvoljena (K3); stari obračun (resolve_timesheet_rate) je i dalje samo EUR.
insert into public.rates (scope, kind, amount, currency, employee_id, effective_from) values
  ('employee', 'revenue', 40, 'GBP', 'd2300000-0000-4000-8000-0000000000d1', '2033-01-01');
select is(public.resolve_rate('client', 'd2300000-0000-4000-8000-0000000000d1', null, '2033-03-15') ->> 'currency', 'GBP',
  'resolve_rate vraća tarifu u GBP sa valutom');
select is(public.resolve_timesheet_rate('client', 'd2300000-0000-4000-8000-0000000000d1', null, '2033-03-15') ->> 'error', 'unit',
  'omotač za stari obračun ne prima ne-EUR tarifu');

select * from finish();
rollback;
