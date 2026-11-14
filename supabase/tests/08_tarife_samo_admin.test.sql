-- Testovi za P0 iz pregleda 14.11.2026 (veče): operater ne menja tarifu koju baza bira pri odobravanju
-- (migracija 20261114240000_tarife_samo_admin.sql, D3, D4, D16). Tri puta iz nalaza:
--   1. satnica radnika na projektu i zanimanja (projects.assigned_employees / job_roles);
--   2. dodele sa tarifom (project_assignments: radnik, projekat, pozicija, datumi, status, brisanje) i „tuđa" pozicija;
--   3. FK kaskada iz dodele / projekta u Tarife (sada on delete restrict).
-- Za svaki put: pokušaj operatera se odbija, a odobravanje i dalje bira adminovu tarifu. Operater i dalje raspoređuje
-- radnike bez tarife; admin radi sve. Sopstveni podaci sa oznakom QA-8 i 2035. godina; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(68);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('78111111-1111-4111-8111-111111111111', 'qa8-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('78222222-2222-4222-8222-222222222222', 'qa8-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '78111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater', active = true where id = '78222222-2222-4222-8222-222222222222';
-- Samo redovni sati (pon 8h), koeficijent 1 — iznos = 8 × tarifa.
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name) values ('c8800000-0000-4000-8000-0000000000c1', 'QA-8 klijent');
insert into public.projects (id, name, client_name, job_roles) values
  -- P1: tarife projekta 12/27 i tarifa pozicije „QA-8 Poslovođa" 25 (Tarife); zanimanje „QA-8 Zavarivač" 22 (B2B).
  ('b8800000-0000-4000-8000-0000000000b1', 'QA-8 projekat', 'QA-8 klijent', '[{"title": "QA-8 Zavarivač", "b2b_rate": 22}]'),
  -- P2: dodele sa tarifom angažmana (scenario 2 iz pregleda: Pomoćnik 10 €/h, Poslovođa 25 €/h).
  ('b8800000-0000-4000-8000-0000000000b2', 'QA-8 projekat dodele', 'QA-8 klijent', '[]'),
  -- P3: samo tarifa projekta, bez dodela. P5: dodela sa tarifom, bez satnica (brisanje projekta kaskadom).
  ('b8800000-0000-4000-8000-0000000000b3', 'QA-8 projekat sa tarifom', 'QA-8 klijent', '[]'),
  ('b8800000-0000-4000-8000-0000000000b5', 'QA-8 projekat za brisanje', 'QA-8 klijent', '[]');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d8800000-0000-4000-8000-0000000000d1', 'QA-8', 'Radnik', 'QA-8-001'),
  ('d8800000-0000-4000-8000-0000000000d2', 'QA-8', 'Drugi', 'QA-8-002'),
  ('d8800000-0000-4000-8000-0000000000d3', 'QA-8', 'Treći', 'QA-8-003');
insert into public.employee_private (employee_id, b2c_hourly_rate, b2b_hourly_rate) values ('d8800000-0000-4000-8000-0000000000d1', 14, 20);
insert into public.project_assignments (id, employee_id, project_id, position, start_date) values
  ('a8800000-0000-4000-8000-0000000000a1', 'd8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b2', 'QA-8 Pomoćnik', '2035-01-01'),
  ('a8800000-0000-4000-8000-0000000000a2', 'd8800000-0000-4000-8000-0000000000d2', 'b8800000-0000-4000-8000-0000000000b2', 'QA-8 Poslovođa', '2035-01-01'),
  -- Dodela bez reda u Tarifama, ali na poziciji koja na P1 ima tarifu (25 €/h).
  ('a8800000-0000-4000-8000-0000000000a3', 'd8800000-0000-4000-8000-0000000000d2', 'b8800000-0000-4000-8000-0000000000b1', 'QA-8 Poslovođa', '2035-01-01'),
  ('a8800000-0000-4000-8000-0000000000a5', 'd8800000-0000-4000-8000-0000000000d3', 'b8800000-0000-4000-8000-0000000000b5', 'QA-8 Monter', '2035-01-01');
insert into public.rates (id, scope, kind, amount, project_id, position, assignment_id, effective_from) values
  ('e8800000-0000-4000-8000-000000000001', 'project', 'cost', 12, 'b8800000-0000-4000-8000-0000000000b1', null, null, '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000002', 'project', 'revenue', 27, 'b8800000-0000-4000-8000-0000000000b1', null, null, '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000003', 'project', 'cost', 25, 'b8800000-0000-4000-8000-0000000000b1', 'QA-8 Poslovođa', null, '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000004', 'assignment', 'cost', 10, 'b8800000-0000-4000-8000-0000000000b2', null, 'a8800000-0000-4000-8000-0000000000a1', '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000005', 'assignment', 'cost', 25, 'b8800000-0000-4000-8000-0000000000b2', null, 'a8800000-0000-4000-8000-0000000000a2', '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000006', 'project', 'revenue', 30, 'b8800000-0000-4000-8000-0000000000b2', null, null, '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000007', 'project', 'cost', 11, 'b8800000-0000-4000-8000-0000000000b3', null, null, '2035-01-01'),
  ('e8800000-0000-4000-8000-000000000008', 'assignment', 'cost', 9, 'b8800000-0000-4000-8000-0000000000b5', null, 'a8800000-0000-4000-8000-0000000000a5', '2035-01-01');

select is((select string_agg(conname || ':' || confdeltype::text, ', ' order by conname) from pg_constraint
           where conrelid = 'public.rates'::regclass and conname in ('rates_assignment_id_fkey', 'rates_project_id_fkey')),
  'rates_assignment_id_fkey:r, rates_project_id_fkey:r', 'tarife se ne brišu kaskadno sa dodelom ni sa projektom (on delete restrict)');

-- ═════ 1. satnica radnika na projektu i zanimanja (scenario 1 iz pregleda) ═════
set local role authenticated;
set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "position": "", "b2c_rate": 99, "b2b_rate": 27}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Satnicu radnika na projektu (B2C/B2B tarifu) upisuje samo admin',
  'scenario 1: operater ne upisuje prilagođenu B2C satnicu radnika na projektu');
select throws_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "b2c_rate": "99"}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Satnicu radnika na projektu (B2C/B2B tarifu) upisuje samo admin', 'ni kao tekst');
-- Operater šalje satnicu sa brojem koji bi hteo (nacrt se čuva — iznos nacrta nije odobren novac).
select lives_ok($$insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate, approval_status)
  values ('f8800000-0000-4000-8000-0000000000f1', 'd8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b1',
          '2035-03-05', 8, 99, 27, 'submitted')$$, 'operater šalje satnicu (nacrt)');

set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f8800000-0000-4000-8000-0000000000f1'$$,
  '23514', 'Tarifa radnika (99,00) ne odgovara važećoj tarifi (12,00, izvor: tarifa projekta/pozicije) — osvežite stranicu i odobrite ponovo',
  'scenario 1: admin ne može da odobri broj koji je operater upisao');
select lives_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 12, b2b_rate = 27
  where id = 'f8800000-0000-4000-8000-0000000000f1'$$, 'admin odobrava adminovu tarifu projekta');
select is((select (worker_cost, client_revenue, rate_snapshot #>> '{worker,source}')::text from public.timesheets
           where id = 'f8800000-0000-4000-8000-0000000000f1'),
  '(96.00,216.00,project_rate)', 'scenario 1: odobreno 8 × 12 (ne 8 × 99 = 792), izvor tarifa projekta');

-- Operater i dalje raspoređuje radnike bez tarife.
set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d2", "employee_name": "Drugi QA-8", "position": "QA-8 Zavarivač"}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'operater dodaje radnika bez tarife (zanimanje sa liste)');
select lives_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d2", "employee_name": "Drugi QA-8 (novo ime)", "position": "QA-8 Monter"}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'operater menja poziciju i ime radnika bez tarife');
select throws_ok($$update public.projects set assigned_employees = assigned_employees ||
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d3", "position": "QA-8 Poslovođa"}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Pozicija „QA-8 Poslovođa" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin',
  'operater ne dodaje radnika na poziciju koja ima tarifu u Tarifama');
select throws_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d2", "position": " QA-8 Poslovođa "}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Pozicija „QA-8 Poslovođa" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin',
  'ni ne prebacuje radnika bez tarife na tu poziciju');
select lives_ok($$update public.projects set assigned_employees = '[]' where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  'operater uklanja radnika bez tarife');

-- Zanimanja sa tarifom: operater ih ne dodaje, ne menja, ne preimenuje i ne briše.
select throws_ok($$update public.projects set job_roles = '[{"title": "QA-8 Zavarivač", "b2b_rate": 50}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin', 'operater ne menja B2B tarifu zanimanja');
select throws_ok($$update public.projects set job_roles = '[{"title": "QA-8 Električar", "b2b_rate": 22}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin', 'ni ne preimenuje zanimanje sa tarifom');
select throws_ok($$update public.projects set job_roles = '[]' where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin', 'ni ne briše zanimanje sa tarifom');
select throws_ok($$update public.projects set job_roles = job_roles || '[{"title": "QA-8 Monter", "b2c_rate": 9}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin', 'ni ne dodaje zanimanje sa tarifom');
select lives_ok($$update public.projects set job_roles = job_roles || '[{"title": "QA-8 Pomoćni"}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'operater dodaje zanimanje bez tarife');
select lives_ok($$update public.projects set job_roles = '[{"title": "QA-8 Zavarivač", "b2b_rate": 22}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'i briše zanimanje bez tarife');
select lives_ok($$update public.projects set description = 'QA-8 opis', location = 'QA-8 mesto'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'operater menja ostala polja projekta');

-- Nov projekat operatera: bez tarifa u spisku radnika i zanimanjima.
select throws_ok($$insert into public.projects (name, client_name, assigned_employees) values ('QA-8 nov 1', 'QA-8 klijent',
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "b2b_rate": 40}]')$$,
  '42501', 'Satnicu radnika na projektu (B2C/B2B tarifu) upisuje samo admin', 'operater ne pravi projekat sa satnicom radnika');
select throws_ok($$insert into public.projects (name, client_name, job_roles) values ('QA-8 nov 2', 'QA-8 klijent',
    '[{"title": "QA-8 Zavarivač", "b2b_rate": 40}]')$$,
  '42501', 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin', 'ni projekat sa zanimanjem sa tarifom');
select lives_ok($$insert into public.projects (id, name, client_name, job_roles, assigned_employees) values
  ('b8800000-0000-4000-8000-0000000000b4', 'QA-8 nov 3', 'QA-8 klijent', '[{"title": "QA-8 Zavarivač"}]',
   '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "position": "QA-8 Zavarivač"}]')$$,
  'operater pravi projekat sa radnikom i zanimanjem bez tarife');

-- Admin upisuje satnicu radnika na projektu; operater je ne menja i ne uklanja radnika.
set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$update public.projects set
    assigned_employees = '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "employee_name": "Radnik QA-8", "position": "QA-8 Zavarivač", "b2c_rate": 18, "b2b_rate": 24}]',
    job_roles = '[{"title": "QA-8 Zavarivač", "b2b_rate": 23}]'
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'admin upisuje satnicu radnika na projektu i menja tarifu zanimanja');

set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$update public.projects set assigned_employees = '[]' where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin', 'operater ne uklanja radnika sa satnicom');
select throws_ok($$update public.projects set assigned_employees = jsonb_set(assigned_employees, '{0,b2c_rate}', '99')
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin', 'ni ne menja njegovu satnicu');
select throws_ok($$update public.projects set assigned_employees = jsonb_set(assigned_employees, '{0,position}', '"QA-8 Monter"')
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin', 'ni njegovu poziciju');
select throws_ok($$update public.projects set assigned_employees = jsonb_set(assigned_employees, '{0,employee_id}', '"d8800000-0000-4000-8000-0000000000d3"')
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin',
  'ni ne prebacuje tuđu satnicu na drugog radnika (promena ID-a)');
select throws_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "position": "QA-8 Monter"}]'::jsonb || assigned_employees
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  '42501', 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin',
  'ni dupli unos istog radnika ispred (menja poziciju koju bira izbor tarife)');
select lives_ok($$update public.projects set assigned_employees = jsonb_set(assigned_employees, '{0,employee_name}', '"Radnik QA-8 (novo)"')
  where id = 'b8800000-0000-4000-8000-0000000000b1'$$, 'operater menja ime za prikaz radnika sa satnicom');
reset role;
select is(public.resolve_timesheet_rate('worker', 'd8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b1', '2035-03-12') ->> 'rate',
  '18.00', 'baza i dalje bira adminovu satnicu radnika na projektu (18)');
set local role authenticated;

-- ═════ 2. dodele sa tarifom (scenario 2 iz pregleda) ═════
select throws_ok($$update public.project_assignments set employee_id = 'd8800000-0000-4000-8000-0000000000d1'
  where id = 'a8800000-0000-4000-8000-0000000000a2'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin',
  'scenario 2: operater ne prebacuje tuđu dodelu sa tarifom (Poslovođa 25) na radnika');
select throws_ok($$delete from public.project_assignments where id = 'a8800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin',
  'scenario 2: ni ne briše dodelu sa tarifom');
select throws_ok($$update public.project_assignments set position = 'QA-8 Poslovođa' where id = 'a8800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin', 'ni ne menja poziciju');
select throws_ok($$update public.project_assignments set start_date = '2035-06-01' where id = 'a8800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin', 'ni početak');
select throws_ok($$update public.project_assignments set end_date = '2035-02-01' where id = 'a8800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin', 'ni kraj');
select throws_ok($$update public.project_assignments set status = 'cancelled' where id = 'a8800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin', 'ni status');
select throws_ok($$update public.project_assignments set project_id = 'b8800000-0000-4000-8000-0000000000b1' where id = 'a8800000-0000-4000-8000-0000000000a2'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin', 'ni projekat');
select throws_ok($$insert into public.project_assignments (employee_id, project_id, position, start_date)
  values ('d8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b2', 'QA-8 Monter', '2035-02-01')$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin',
  'ni ne dodaje radniku pod tarifom novu dodelu na istom projektu (prekrila bi poziciju)');
select lives_ok($$update public.project_assignments set notes = 'QA-8 napomena', employee_name = 'Radnik QA-8'
  where id = 'a8800000-0000-4000-8000-0000000000a1'$$, 'operater menja napomenu i ime za prikaz dodele sa tarifom');
select lives_ok($$update public.projects set name = 'QA-8 projekat dodele (novo ime)' where id = 'b8800000-0000-4000-8000-0000000000b2'$$,
  'operater preimenuje projekat sa dodelama pod tarifom');
select is((select project_name from public.project_assignments where id = 'a8800000-0000-4000-8000-0000000000a1'),
  'QA-8 projekat dodele (novo ime)', 'preimenovanje osvežava ime u dodeli');
reset role;
select is((select count(*)::int from public.rates where scope = 'assignment' and project_id = 'b8800000-0000-4000-8000-0000000000b2'),
  2, 'adminove tarife dodela su ostale');
select is(public.resolve_timesheet_rate('worker', 'd8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b2', '2035-03-05') ->> 'rate',
  '10.00', 'scenario 2: baza za radnika i dalje bira njegovu tarifu angažmana (10, ne 25)');
set local role authenticated;

select lives_ok($$insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate, approval_status)
  values ('f8800000-0000-4000-8000-0000000000f2', 'd8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b2',
          '2035-03-05', 8, 25, 30, 'submitted')$$, 'operater šalje satnicu sa tuđom tarifom (nacrt)');
set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f8800000-0000-4000-8000-0000000000f2'$$,
  '23514', 'Tarifa radnika (25,00) ne odgovara važećoj tarifi (10,00, izvor: tarifa angažmana) — osvežite stranicu i odobrite ponovo',
  'scenario 2: tuđa tarifa se ne odobrava');
select lives_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 10 where id = 'f8800000-0000-4000-8000-0000000000f2'$$,
  'admin odobrava tarifu angažmana radnika');
select is((select (worker_cost, client_revenue, rate_snapshot #>> '{worker,ref}')::text from public.timesheets
           where id = 'f8800000-0000-4000-8000-0000000000f2'),
  '(80.00,240.00,e8800000-0000-4000-8000-000000000004)', 'scenario 2: odobreno 8 × 10 iz adminove tarife dodele');

-- „Tuđa" pozicija: dodela bez reda u Tarifama, ali na poziciji sa tarifom (P1: Poslovođa 25).
set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$update public.project_assignments set employee_id = 'd8800000-0000-4000-8000-0000000000d3'
  where id = 'a8800000-0000-4000-8000-0000000000a3'$$,
  '42501', 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin',
  'operater ne prebacuje tuđu dodelu na poziciji sa tarifom na drugog radnika');
select throws_ok($$insert into public.project_assignments (employee_id, project_id, position, start_date)
  values ('d8800000-0000-4000-8000-0000000000d3', 'b8800000-0000-4000-8000-0000000000b1', 'QA-8 Poslovođa', '2035-01-01')$$,
  '42501', 'Pozicija „QA-8 Poslovođa" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin',
  'ni ne pravi dodelu na poziciji sa tarifom');

-- Dodele bez tarife operater i dalje vodi.
select lives_ok($$insert into public.project_assignments (id, employee_id, project_id, position, start_date)
  values ('a8800000-0000-4000-8000-0000000000a4', 'd8800000-0000-4000-8000-0000000000d3', 'b8800000-0000-4000-8000-0000000000b1', 'QA-8 Monter', '2035-01-01')$$,
  'operater pravi dodelu bez tarife');
select lives_ok($$update public.project_assignments set end_date = '2035-12-31', status = 'completed', position = 'QA-8 Pomoćni'
  where id = 'a8800000-0000-4000-8000-0000000000a4'$$, 'operater menja datume, status i poziciju dodele bez tarife');
select throws_ok($$update public.project_assignments set position = 'QA-8 Poslovođa' where id = 'a8800000-0000-4000-8000-0000000000a4'$$,
  '42501', 'Pozicija „QA-8 Poslovođa" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin',
  'ali je ne prebacuje na poziciju sa tarifom');
select lives_ok($$delete from public.project_assignments where id = 'a8800000-0000-4000-8000-0000000000a4'$$,
  'operater briše dodelu bez tarife');
select throws_ok($$select public.rate_pair_locked('d8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b2')$$,
  '42501', null, 'pomoćne funkcije (čitaju Tarife) nisu dostupne kroz API');

-- ═════ 3. brisanje dodele / projekta sa tarifama ═════
select throws_ok($$delete from public.projects where id = 'b8800000-0000-4000-8000-0000000000b3'$$,
  '23503', 'update or delete on table "projects" violates foreign key constraint "rates_project_id_fkey" on table "rates"',
  'operater ne briše projekat sa tarifom (tarifa se više ne briše kaskadno)');
select throws_ok($$delete from public.projects where id = 'b8800000-0000-4000-8000-0000000000b5'$$, null::char(5), null,
  'operater ne briše projekat čija dodela ima tarifu (ni kaskadom)');
select lives_ok($$delete from public.projects where id = 'b8800000-0000-4000-8000-0000000000b4'$$,
  'operater briše projekat bez tarifa');

set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$delete from public.project_assignments where id = 'a8800000-0000-4000-8000-0000000000a2'$$,
  '23503', 'update or delete on table "project_assignments" violates foreign key constraint "rates_assignment_id_fkey" on table "rates"',
  'ni admin ne briše dodelu koja ima tarifu — prvo briše tarifu');
select throws_ok($$delete from public.projects where id = 'b8800000-0000-4000-8000-0000000000b3'$$,
  '23503', 'update or delete on table "projects" violates foreign key constraint "rates_project_id_fkey" on table "rates"',
  'ni projekat koji ima tarifu');
select throws_ok($$delete from public.projects where id = 'b8800000-0000-4000-8000-0000000000b5'$$, '23503', null,
  'ni projekat čija dodela ima tarifu');
select is((select count(*)::int from public.rates where id in ('e8800000-0000-4000-8000-000000000007', 'e8800000-0000-4000-8000-000000000008')),
  2, 'tarife projekta i dodele su ostale');
select lives_ok($$delete from public.rates where assignment_id = 'a8800000-0000-4000-8000-0000000000a2'$$, 'admin briše tarifu dodele');
select lives_ok($$delete from public.project_assignments where id = 'a8800000-0000-4000-8000-0000000000a2'$$, 'pa dodelu');

-- ═════ admin i dalje radi sve ═════
select lives_ok($$update public.project_assignments set employee_id = 'd8800000-0000-4000-8000-0000000000d3', start_date = '2035-02-01'
  where id = 'a8800000-0000-4000-8000-0000000000a3'$$, 'admin prebacuje dodelu na poziciji sa tarifom na drugog radnika');
select lives_ok($$update public.project_assignments set position = 'QA-8 Pomoćnik 2', status = 'completed'
  where id = 'a8800000-0000-4000-8000-0000000000a1'$$, 'admin menja poziciju i status dodele sa tarifom');
select lives_ok($$insert into public.project_assignments (employee_id, project_id, position, start_date)
  values ('d8800000-0000-4000-8000-0000000000d1', 'b8800000-0000-4000-8000-0000000000b1', 'QA-8 Poslovođa', '2035-04-01')$$,
  'admin pravi dodelu na poziciji sa tarifom');
select lives_ok($$update public.projects set assigned_employees = '[]', job_roles = '[]' where id = 'b8800000-0000-4000-8000-0000000000b1'$$,
  'admin uklanja radnika sa satnicom i zanimanje sa tarifom');
select lives_ok($$insert into public.projects (name, client_name, job_roles, assigned_employees) values ('QA-8 nov admin', 'QA-8 klijent',
    '[{"title": "QA-8 Zavarivač", "b2b_rate": 40}]', '[{"employee_id": "d8800000-0000-4000-8000-0000000000d1", "b2c_rate": 15}]')$$,
  'admin pravi projekat sa tarifama');

select * from finish();
rollback;
