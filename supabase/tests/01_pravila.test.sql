-- Testovi pravila baze (DECISIONS.md D3, D10, D12). Pokretanje: npm run test:db
-- Koriste sopstvene oznake i 2031. godinu da ne zavise od podataka u lokalnoj bazi; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- ───── priprema (kao postgres, zaobilazi RLS) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'test-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'test-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '11111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '22222222-2222-4222-8222-222222222222';

insert into public.clients (id, name) values ('c0000000-0000-4000-8000-0000000000c1', 'Test klijent pgTAP');
insert into public.projects (id, name, client_name) values ('b0000000-0000-4000-8000-0000000000b1', 'Test projekat pgTAP', 'Test klijent pgTAP');
insert into public.employees (id, first_name, last_name, employee_id) values ('d0000000-0000-4000-8000-0000000000d1', 'Pera', 'Perić', 'TEST-PGTAP-001');
insert into public.employee_private (employee_id, jmbg, iban, b2c_hourly_rate) values ('d0000000-0000-4000-8000-0000000000d1', '0101990710008', 'RS35000000000000000000', 12);
insert into public.rates (scope, kind, amount, employee_id, effective_from) values ('employee', 'cost', 12, 'd0000000-0000-4000-8000-0000000000d1', '2026-01-01');

select is((select client_id from public.projects where id = 'b0000000-0000-4000-8000-0000000000b1'),
  'c0000000-0000-4000-8000-0000000000c1'::uuid, 'projekat dobija client_id iz imena klijenta');

-- ───── anonimni ─────
set local role anon;
select throws_ok('select * from public.employees', '42501', null, 'anonimni korisnik nema pristup radnicima');
reset role;

-- ───── operater ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*) from public.employees where id = 'd0000000-0000-4000-8000-0000000000d1')::int, 1, 'operater vidi radnike');
select is((select count(*) from public.employee_private)::int, 0, 'operater ne vidi JMBG, banku ni tarife radnika');
select is((select count(*) from public.rates)::int, 0, 'operater ne vidi tarife');
select lives_ok($$insert into public.timesheets (id, employee_id, project, week_start, mon_hours, tue_hours, total_hours)
  values ('f0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000d1', 'Test projekat pgTAP', '2031-10-06', 8, 8, 99)$$,
  'operater unosi satnicu kao nacrt');
select is((select project_id from public.timesheets where id = 'f0000000-0000-4000-8000-0000000000f1'),
  'b0000000-0000-4000-8000-0000000000b1'::uuid, 'satnica upisana imenom projekta dobija project_id');
select is((select total_hours from public.timesheets where id = 'f0000000-0000-4000-8000-0000000000f1'), 16.00::numeric,
  'ukupno sati računa baza, ne klijent');
select throws_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 12, b2b_rate = 20
  where id = 'f0000000-0000-4000-8000-0000000000f1'$$, '42501', null, 'operater ne može da odobri satnicu');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours, approval_status, b2c_rate, b2b_rate)
  values ('d0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-10-13', 8, 'approved', 12, 20)$$,
  '42501', null, 'operater ne može da upiše odobrenu satnicu');
update public.profiles set role = 'admin' where id = '22222222-2222-4222-8222-222222222222';
select is((select role from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'operater',
  'operater ne može sam sebi da da admin ulogu');

-- ───── admin ─────
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is((select count(*) from public.employee_private where employee_id = 'd0000000-0000-4000-8000-0000000000d1')::int, 1, 'admin vidi JMBG i banku');
select throws_like($$update public.timesheets set approval_status = 'approved' where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  '%nema tarifu%', 'satnica bez tarife ne može da se odobri (nikad 0)');
select lives_ok($$update public.timesheets set approval_status = 'approved', b2c_rate = 12, b2b_rate = 20
  where id = 'f0000000-0000-4000-8000-0000000000f1'$$, 'admin odobrava satnicu sa tarifom');
select is((select approved_by from public.timesheets where id = 'f0000000-0000-4000-8000-0000000000f1'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'baza beleži ko je odobrio');
select throws_ok($$update public.timesheets set mon_hours = 9 where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'odobrena satnica ne može da se menja');
select throws_ok($$delete from public.timesheets where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'odobrena satnica ne može da se obriše');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours)
  values ('d0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-10-06', 4)$$,
  '23505', null, 'isti radnik, projekat i nedelja samo jednom');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours)
  values ('d0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-10-08', 4)$$,
  '23514', null, 'nedelja mora da počne ponedeljkom');
select throws_ok($$update public.employee_private set jmbg = '0101990710009' where employee_id = 'd0000000-0000-4000-8000-0000000000d1'$$,
  '23514', null, 'JMBG sa pogrešnom kontrolnom cifrom je odbijen');
insert into public.employment_history (employee_id, engagement_type, start_date) values ('d0000000-0000-4000-8000-0000000000d1', 'direct_employee', '2026-01-01');
select throws_ok($$insert into public.employment_history (employee_id, engagement_type, start_date)
  values ('d0000000-0000-4000-8000-0000000000d1', 'direct_employee', '2026-06-01')$$,
  '23P01', null, 'preklapajući angažman istog radnika je odbijen');

-- zaključavanje meseca, uključujući nedelju koja prelazi iz septembra u oktobar
insert into public.timesheets (id, employee_id, project_id, week_start, thu_hours)
  values ('f0000000-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-09-29', 8);
select throws_like($$select public.lock_month('2031-10-01')$$, '%neodobrenih%',
  'nedelja 29.9.–5.10. sa neodobrenim satima u oktobru blokira zaključavanje oktobra');
delete from public.timesheets where id = 'f0000000-0000-4000-8000-0000000000f2';
select lives_ok($$select public.lock_month('2031-10-15')$$, 'mesec bez neodobrenih satnica se zaključava');
select throws_ok($$insert into public.timesheets (employee_id, project_id, week_start, tue_hours)
  values ('d0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-10-20', 8)$$,
  '23514', null, 'u zaključan mesec ne može da se unese');
select throws_ok($$update public.timesheets set approval_status = 'draft' where id = 'f0000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'u zaključanom mesecu odobrena satnica ne može da se vrati u nacrt');
select lives_ok($$insert into public.timesheets (employee_id, project_id, week_start, mon_hours)
  values ('d0000000-0000-4000-8000-0000000000d1', 'b0000000-0000-4000-8000-0000000000b1', '2031-09-22', 8)$$,
  'septembar nije pogođen zaključavanjem oktobra');

-- obračun
select throws_ok($$insert into public.payroll_runs (month, eur_rsd_rate, params) values ('2031-11-01', 117.2, '{}')$$,
  '23514', null, 'obračun za nezaključan mesec je odbijen');
insert into public.payroll_runs (id, month, eur_rsd_rate, params) values ('a1000000-0000-4000-8000-0000000000a1', '2031-10-01', 117.2, '{}');
insert into public.payslips (id, run_id, employee_id, engagement_type, rate_basis, work_fraction, total_hours, basis_amount, total_cost, payout)
  values ('a2000000-0000-4000-8000-0000000000a2', 'a1000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000d1',
          'direct_employee', 'neto', 1, 16, 192, 300, 192);
insert into public.payslip_projects (payslip_id, project_id, hours, worker_amount, labor_cost, revenue)
  values ('a2000000-0000-4000-8000-0000000000a2', 'b0000000-0000-4000-8000-0000000000b1', 16, 192, 299.99, 320);
select throws_like($$select public.approve_payroll_run('a1000000-0000-4000-8000-0000000000a1')$$,
  '%nije usklađen%', 'obračun čija raspodela ne daje tačan zbir ne može da se odobri');
update public.payslip_projects set labor_cost = 300 where payslip_id = 'a2000000-0000-4000-8000-0000000000a2';

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.payroll_runs)::int, 0, 'operater ne vidi obračun iako postoji');
select is((select count(*) from public.payslips)::int, 0, 'operater ne vidi platne listiće');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$select public.approve_payroll_run('a1000000-0000-4000-8000-0000000000a1')$$, 'usklađen obračun se odobrava');
select throws_ok($$update public.payslips set payout = 999 where id = 'a2000000-0000-4000-8000-0000000000a2'$$,
  '23514', null, 'platni listić odobrenog obračuna ne može da se menja');

-- preimenovanja ne kvare veze
update public.clients set name = 'Novi naziv klijenta' where id = 'c0000000-0000-4000-8000-0000000000c1';
select is((select client_name from public.projects where id = 'b0000000-0000-4000-8000-0000000000b1'), 'Novi naziv klijenta',
  'preimenovanje klijenta osvežava projekat');
reset role;
update public.projects set name = 'Novi naziv projekta' where id = 'b0000000-0000-4000-8000-0000000000b1';
select is((select count(*) from public.timesheets where project_id = 'b0000000-0000-4000-8000-0000000000b1' and project = 'Novi naziv projekta')::int,
  2, 'preimenovanje projekta osvežava ime i u satnicama zaključanog meseca i ne gubi vezu');

-- poslednji admin
update public.profiles set active = false where role = 'admin' and id <> '11111111-1111-4111-8111-111111111111';
select throws_ok($$update public.profiles set role = 'operater' where id = '11111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'poslednji aktivan admin ne može da se ukloni');

select * from finish();
rollback;
