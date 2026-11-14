-- Testovi za proveru tarife pri odobravanju (migracija 20261114180000_tarifa_pri_odobravanju.sql, D3, D4, D16).
-- Baza pri odobravanju bira tarifu po istom redosledu kao src/lib/payroll/rates.js (resolve_timesheet_rate) i odbija
-- satnicu čija b2c_rate / b2b_rate nije ta tarifa. Sopstveni podaci sa oznakom QA-4 i 2033. godina; sve se vraća (rollback).
--
-- PARITET SA rates.js: deo „lanac nivoa" koristi iste oznake, datume i iznose kao blok
-- „isti primer kao pgTAP 04" u src/lib/payroll/payroll.test.js — tarife 15/30 (angažman), 18/24 (radnik na projektu),
-- 12/27 (projekat), 13 (pozicija), 22 (zanimanje), 16/29 (radnik), 14/20 (profil). Ako se promeni jedan fajl, mora i drugi.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('71111111-1111-4111-8111-111111111111', 'qa4-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('72222222-2222-4222-8222-222222222222', 'qa4-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '71111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '72222222-2222-4222-8222-222222222222';
-- Samo redovni sati (pon 8h), koeficijent 1 — iznos = 8 × tarifa.
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name) values ('c7000000-0000-4000-8000-0000000000c1', 'QA-4 klijent');
insert into public.projects (id, name, client_name, job_roles, assigned_employees) values
  ('b7000000-0000-4000-8000-0000000000b1', 'QA-4 projekat', 'QA-4 klijent',
   '[{"title": "QA-4 Zavarivač", "b2b_rate": 22}]',
   '[{"employee_id": "d7000000-0000-4000-8000-0000000000d1", "position": "QA-4 Zavarivač", "b2c_rate": 18, "b2b_rate": 24}]'),
  -- Drugi projekat bez ijedne tarife (tarife projekta 1 važe za sve radnike na njemu).
  ('b7000000-0000-4000-8000-0000000000b2', 'QA-4 projekat bez tarifa', 'QA-4 klijent', '[]', '[]');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d7000000-0000-4000-8000-0000000000d1', 'QA-4', 'Radnik', 'QA-4-001'),
  ('d7000000-0000-4000-8000-0000000000d2', 'QA-4', 'Bez tarife', 'QA-4-002');
insert into public.employee_private (employee_id, b2c_hourly_rate, b2b_hourly_rate) values ('d7000000-0000-4000-8000-0000000000d1', 14, 20);
insert into public.project_assignments (id, employee_id, project_id, position, start_date, status) values
  ('a7000000-0000-4000-8000-0000000000a1', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1',
   'QA-4 Zavarivač', '2033-01-01', 'active');
insert into public.rates (id, scope, kind, amount, employee_id, project_id, assignment_id, effective_from) values
  ('e7000000-0000-4000-8000-000000000001', 'assignment', 'cost', 15, 'd7000000-0000-4000-8000-0000000000d1',
   'b7000000-0000-4000-8000-0000000000b1', 'a7000000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000002', 'assignment', 'revenue', 30, 'd7000000-0000-4000-8000-0000000000d1',
   'b7000000-0000-4000-8000-0000000000b1', 'a7000000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000003', 'project', 'cost', 12, null, 'b7000000-0000-4000-8000-0000000000b1', null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000004', 'project', 'revenue', 27, null, 'b7000000-0000-4000-8000-0000000000b1', null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000005', 'employee', 'cost', 16, 'd7000000-0000-4000-8000-0000000000d1', null, null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000006', 'employee', 'revenue', 29, 'd7000000-0000-4000-8000-0000000000d1', null, null, '2033-01-01');

-- ───── operater upisuje proizvoljnu tarifu u nacrt (API) ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"72222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- 2033-03-07 je ponedeljak (week_start — isti datum po kome approvalPayload bira tarifu).
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate) values
  ('f7000000-0000-4000-8000-0000000000f1', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07', 8, 99, 99),
  ('f7000000-0000-4000-8000-0000000000f2', 'd7000000-0000-4000-8000-0000000000d2', 'b7000000-0000-4000-8000-0000000000b2', '2033-03-07', 8, 12, 20);

-- ───── admin odobrava ─────
set local request.jwt.claims to '{"sub":"71111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f7000000-0000-4000-8000-0000000000f1'$$,
  '23514', 'Tarifa radnika (99,00) ne odgovara važećoj tarifi (15,00, izvor: tarifa angažmana) — osvežite stranicu i odobrite ponovo',
  'tarifa radnika koju je operater upisao mimo Tarifa ne može da se odobri');
select throws_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 15 where id = 'f7000000-0000-4000-8000-0000000000f1'$$,
  '23514', 'Tarifa klijenta (99,00) ne odgovara važećoj tarifi (30,00, izvor: tarifa angažmana) — osvežite stranicu i odobrite ponovo',
  'ni tarifa klijenta koja nije važeća (i kad je tarifa radnika tačna)');
select lives_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 15, b2b_rate = 30,
    rate_snapshot = '{"worker": {"rate": 15, "source": "profile", "ref": "QA-4-lažno"}, "client": {"rate": 30, "source": "job_role", "ref": "QA-4-lažno"}}'
  where id = 'f7000000-0000-4000-8000-0000000000f1'$$, 'tarife iz jedinstvenog izbora (15 / 30) se odobravaju');
select is((select jsonb_build_object('worker', rate_snapshot -> 'worker', 'client', rate_snapshot -> 'client')
           from public.timesheets where id = 'f7000000-0000-4000-8000-0000000000f1'),
  '{"worker": {"rate": 15, "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000001"},
    "client": {"rate": 30, "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000002"}}'::jsonb,
  'izvor i oznaku tarife u snimak upisuje baza (snimak sa ekrana se ignoriše)');
select is((select (worker_cost, client_revenue)::text from public.timesheets where id = 'f7000000-0000-4000-8000-0000000000f1'),
  '(120.00,240.00)', 'odobren iznos: 8 × 15 i 8 × 30');

select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f7000000-0000-4000-8000-0000000000f2'$$,
  '23514', 'Nema važeće tarife radnika ni klijenta za nedelju od 07.03.2033 — satnica ne može da se odobri',
  'radnik bez ijedne tarife: odobravanje odbijeno iako red ima tarife > 0');
reset role;
insert into public.employee_private (employee_id, b2b_hourly_rate) values ('d7000000-0000-4000-8000-0000000000d2', 20);
set local role authenticated;
select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f7000000-0000-4000-8000-0000000000f2'$$,
  '23514', 'Nema važeće tarife radnika za nedelju od 07.03.2033 — satnica ne može da se odobri',
  'poruka kaže kojoj strani fali tarifa');
reset role;
insert into public.rates (id, scope, kind, amount, currency, employee_id, effective_from) values
  ('e7000000-0000-4000-8000-000000000010', 'employee', 'cost', 1500, 'RSD', 'd7000000-0000-4000-8000-0000000000d2', '2033-01-01');
set local role authenticated;
select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f7000000-0000-4000-8000-0000000000f2'$$,
  '23514', 'Važeća tarifa radnika (izvor: tarifa radnika) je 1500,00 RSD po satu — odobravanje prima samo EUR po satu; ispravite tu tarifu u Tarife i dodele',
  'pobednička tarifa u RSD se ne preskače i ne odobrava (kao RateUnitError)');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate, approval_status)
  values ('d7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-14', 8, 15, 31, 'approved')$$,
  '23514', 'Tarifa klijenta (31,00) ne odgovara važećoj tarifi (30,00, izvor: tarifa angažmana) — osvežite stranicu i odobrite ponovo',
  'i satnica upisana odmah kao odobrena mora da ima važeću tarifu');
select throws_ok($$select public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07')$$,
  '42501', null, 'izbor tarife u bazi nije dostupan kroz API (tarife vidi samo admin, D3)');

-- ───── lanac nivoa (kao postgres), datum 2033-03-07 — isti brojevi kao u payroll.test.js ─────
reset role;

select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 15, "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000001"}'::jsonb, 'radnik: tarifa angažmana je prva');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 30, "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000002"}'::jsonb, 'klijent: tarifa angažmana je prva');

-- Otkazana dodela ne važi → satnica radnika na projektu (pozicija sada dolazi iz spiska radnika na projektu).
update public.project_assignments set status = 'cancelled' where id = 'a7000000-0000-4000-8000-0000000000a1';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 18, "source": "project_employee", "ref": "project:b7000000-0000-4000-8000-0000000000b1:employee:d7000000-0000-4000-8000-0000000000d1"}'::jsonb,
  'radnik: satnica na projektu pobeđuje tarifu projekta, radnika i profil');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 24, "source": "project_employee", "ref": "project:b7000000-0000-4000-8000-0000000000b1:employee:d7000000-0000-4000-8000-0000000000d1"}'::jsonb,
  'klijent: satnica na projektu pobeđuje tarifu projekta, zanimanje, radnika i profil');

-- 0 i prazno polje nisu tarifa → tarifa za ceo projekat.
update public.projects set assigned_employees =
  '[{"employee_id": "d7000000-0000-4000-8000-0000000000d1", "position": "QA-4 Zavarivač", "b2c_rate": 0, "b2b_rate": ""}]'
  where id = 'b7000000-0000-4000-8000-0000000000b1';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 12, "source": "project_rate", "ref": "e7000000-0000-4000-8000-000000000003"}'::jsonb,
  'radnik: 0 nije tarifa; tarifa projekta pobeđuje tarifu radnika i profil');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 27, "source": "project_rate", "ref": "e7000000-0000-4000-8000-000000000004"}'::jsonb,
  'klijent: prazno nije tarifa; tarifa projekta pobeđuje zanimanje');

-- Tarifa za poziciju radnika (starija) pobeđuje tarifu za ceo projekat; tuđa pozicija se ne koristi.
insert into public.rates (id, scope, kind, amount, project_id, position, effective_from) values
  ('e7000000-0000-4000-8000-000000000007', 'project', 'cost', 13, 'b7000000-0000-4000-8000-0000000000b1', 'QA-4 Zavarivač', '2032-06-01'),
  ('e7000000-0000-4000-8000-000000000008', 'project', 'cost', 19, 'b7000000-0000-4000-8000-0000000000b1', 'QA-4 Električar', '2033-02-01');
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 13, "source": "project_rate", "ref": "e7000000-0000-4000-8000-000000000007"}'::jsonb,
  'tarifa za poziciju pobeđuje tarifu za ceo projekat, i kad je starija');
-- Kraj važenja je uključen.
update public.rates set effective_to = '2033-03-07' where project_id = 'b7000000-0000-4000-8000-0000000000b1' and scope = 'project';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07') ->> 'ref',
  'e7000000-0000-4000-8000-000000000007', 'tarifa važi i poslednjeg dana (effective_to uključen)');
-- Istekle tarife projekta se ne koriste.
update public.rates set effective_to = '2033-03-06' where project_id = 'b7000000-0000-4000-8000-0000000000b1' and scope = 'project';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 16, "source": "employee_rate", "ref": "e7000000-0000-4000-8000-000000000005"}'::jsonb,
  'istekla tarifa se ignoriše; radnik: tarifa radnika pobeđuje profil (zanimanje ne važi za radnika)');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 22, "source": "job_role", "ref": "project:b7000000-0000-4000-8000-0000000000b1:job_role:QA-4 Zavarivač"}'::jsonb,
  'klijent: zanimanje na projektu pobeđuje tarifu radnika i profil');

update public.projects set job_roles = '[]' where id = 'b7000000-0000-4000-8000-0000000000b1';
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 29, "source": "employee_rate", "ref": "e7000000-0000-4000-8000-000000000006"}'::jsonb,
  'klijent: tarifa radnika pobeđuje profil');

-- Neaktivna i buduća tarifa radnika ne važe → profil.
update public.rates set status = 'inactive' where id = 'e7000000-0000-4000-8000-000000000005';
update public.rates set effective_from = '2033-03-08' where id = 'e7000000-0000-4000-8000-000000000006';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 14, "source": "profile", "ref": "employee:d7000000-0000-4000-8000-0000000000d1:profile"}'::jsonb,
  'radnik: neaktivna tarifa se ignoriše → profil');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 20, "source": "profile", "ref": "employee:d7000000-0000-4000-8000-0000000000d1:profile"}'::jsonb,
  'klijent: tarifa koja tek počinje se ignoriše → profil');

update public.employee_private set b2c_hourly_rate = null, b2b_hourly_rate = null where employee_id = 'd7000000-0000-4000-8000-0000000000d1';
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"error": "missing"}'::jsonb, 'radnik: ništa ne važi → nema tarife (nikad 0)');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"error": "missing"}'::jsonb, 'klijent: ništa ne važi → nema tarife (nikad 0)');

insert into public.rates (id, scope, kind, amount, currency, employee_id, effective_from) values
  ('e7000000-0000-4000-8000-000000000009', 'employee', 'cost', 1500, 'RSD', 'd7000000-0000-4000-8000-0000000000d1', '2033-01-01');
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"error": "unit", "source": "employee_rate", "ref": "e7000000-0000-4000-8000-000000000009", "amount": 1500, "currency": "RSD", "unit": "hourly"}'::jsonb,
  'pobednik u RSD → greška jedinice (kao RateUnitError), bez prelaska na sledeći nivo');

-- ───── odobrena satnica se posle promene tarifa ne proverava ponovo (D10) ─────
set local role authenticated;
select lives_ok($$update public.timesheets set notes = 'QA-4 napomena posle promene tarifa' where id = 'f7000000-0000-4000-8000-0000000000f1'$$,
  'admin menja napomenu odobrene satnice iako tarife više nisu iste');
select is((select (b2c_rate, b2b_rate, rate_snapshot #>> '{worker,source}', worker_cost)::text from public.timesheets where id = 'f7000000-0000-4000-8000-0000000000f1'),
  '(15.00,30.00,assignment_rate,120.00)', 'odobrena satnica zadržava tarife, izvor i iznos iz trenutka odobravanja');

select * from finish();
rollback;
