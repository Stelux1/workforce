-- Testovi za mesečni obračun (migracija 20261114200000_mesecni_obracun.sql, D2, D8, D10, D17).
-- Sopstveni podaci sa oznakom QA-5, mart 2034. i sopstveni obračunski parametri; sve se vraća (rollback).
--
-- PARITET SA payrollMonth.js: listići su brojevi iz bloka „isti primer kao pgTAP 05" u src/lib/payroll/payroll.test.js
-- (kurs 117,2): zaposleni na dva projekta (nedelja 27.2.–5.3. se deli po danu → u martu 16 h na projektu 1, 14 h na
-- projektu 2) i podizvođač (40 h). Ako se promeni jedan fajl, mora i drugi.
begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('81111111-1111-4111-8111-111111111111', 'qa5-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('82222222-2222-4222-8222-222222222222', 'qa5-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '81111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater', active = true where id = '82222222-2222-4222-8222-222222222222';
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';
-- Parametri za 2034. (isti brojevi kao 2026) da test ne zavisi od onoga što je upisano u lokalnu bazu.
insert into public.payroll_params (valid_from, tax_rate, non_taxable_rsd, min_base_rsd, max_base_rsd,
  emp_pio, emp_health, emp_unemployment, er_pio, er_health, source_note)
values ('2034-01-01', 0.10, 34221, 51297, 732820, 0.14, 0.0515, 0.0075, 0.10, 0.0515, 'QA-5 parametri (isti kao 2026)');

insert into public.clients (id, name) values ('c8000000-0000-4000-8000-0000000000c1', 'QA-5 klijent');
insert into public.vendors (id, name) values ('e8000000-0000-4000-8000-0000000000e1', 'QA-5 dobavljač');
insert into public.projects (id, name, client_name, assigned_employees) values
  ('b8000000-0000-4000-8000-0000000000b1', 'QA-5 projekat 1', 'QA-5 klijent',
   '[{"employee_id": "d8000000-0000-4000-8000-0000000000d1", "b2c_rate": 12, "b2b_rate": 20},
     {"employee_id": "d8000000-0000-4000-8000-0000000000d2", "b2c_rate": 15, "b2b_rate": 24}]'),
  ('b8000000-0000-4000-8000-0000000000b2', 'QA-5 projekat 2', 'QA-5 klijent',
   '[{"employee_id": "d8000000-0000-4000-8000-0000000000d1", "b2c_rate": 14, "b2b_rate": 25}]');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d8000000-0000-4000-8000-0000000000d1', 'QA-5', 'Zaposleni', 'QA-5-001'),
  ('d8000000-0000-4000-8000-0000000000d2', 'QA-5', 'Podizvođač', 'QA-5-002'),
  ('d8000000-0000-4000-8000-0000000000d3', 'QA-5', 'Stara satnica', 'QA-5-003');
insert into public.employment_history (employee_id, engagement_type, vendor_id, start_date) values
  ('d8000000-0000-4000-8000-0000000000d1', 'direct_employee', null, '2034-01-01'),
  ('d8000000-0000-4000-8000-0000000000d2', 'subcontractor_worker', 'e8000000-0000-4000-8000-0000000000e1', '2034-01-01');

-- ───── admin odobrava satnice i zaključava mart ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- 2034-02-27 je ponedeljak: pon/uto su februar, sre/čet (1.3. i 2.3.) mart.
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours,
                               b2c_rate, b2b_rate, approval_status) values
  ('f8000000-0000-4000-8000-0000000000f1', 'd8000000-0000-4000-8000-0000000000d1', 'b8000000-0000-4000-8000-0000000000b1',
   '2034-02-27', 8, 8, 8, 8, 0, 12, 20, 'approved'),
  ('f8000000-0000-4000-8000-0000000000f2', 'd8000000-0000-4000-8000-0000000000d1', 'b8000000-0000-4000-8000-0000000000b2',
   '2034-03-27', 8, 0, 0, 0, 6, 14, 25, 'approved'),
  ('f8000000-0000-4000-8000-0000000000f3', 'd8000000-0000-4000-8000-0000000000d2', 'b8000000-0000-4000-8000-0000000000b1',
   '2034-03-06', 8, 8, 8, 8, 8, 15, 24, 'approved');
select lives_ok($$select public.lock_month('2034-03-01')$$, 'mart 2034. se zaključava (sve satnice odobrene)');

-- ───── bez kursa nema obračuna (D2) ─────
select throws_ok($$insert into public.payroll_runs (month, eur_rsd_rate, params) values ('2034-03-01', null, '{}')$$,
  '23514', 'Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec', 'obračun bez kursa je odbijen');
select throws_ok($$insert into public.payroll_runs (month, eur_rsd_rate, params) values ('2034-03-01', 0, '{}')$$,
  '23514', 'Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec', 'kurs 0 nije kurs');
select throws_ok($$select public.save_payroll_draft('2034-03-01', null, '{"valid_from": "2034-01-01"}', '[]')$$,
  '23514', 'Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec', 'nacrt bez kursa je odbijen');
select throws_ok($$select public.save_payroll_draft('2034-04-01', 117.2, '{"valid_from": "2034-01-01"}', '[]')$$,
  '23514', 'Obračun može da se napravi samo za zaključan mesec', 'nacrt za nezaključan mesec je odbijen');
select throws_ok($$select public.save_payroll_draft('2034-03-01', 117.2,
    '{"valid_from": "2026-01-01", "tax_rate": 0.1, "non_taxable_rsd": 34221, "min_base_rsd": 51297, "max_base_rsd": 732820,
      "emp_pio": 0.14, "emp_health": 0.0515, "emp_unemployment": 0.0075, "er_pio": 0.1, "er_health": 0.0515}', '[]')$$,
  '23514', 'Obračunski parametri za mesec su se promenili — osvežite stranicu i generišite ponovo',
  'nacrt računat sa parametrima koji ne važe za mesec je odbijen');

-- ───── nacrt (brojevi iz payroll.test.js „isti primer kao pgTAP 05") ─────
create temporary table qa5_params on commit drop as select
  '{"valid_from": "2034-01-01", "tax_rate": 0.1, "non_taxable_rsd": 34221, "min_base_rsd": 51297, "max_base_rsd": 732820,
    "emp_pio": 0.14, "emp_health": 0.0515, "emp_unemployment": 0.0075, "er_pio": 0.1, "er_health": 0.0515}'::jsonb as p,
  '[{"employee_id": "d8000000-0000-4000-8000-0000000000d1", "employee_name": "QA-5 Zaposleni", "engagement_type": "direct_employee",
     "vendor_id": null, "rate_basis": "neto", "work_fraction": 1, "total_hours": 30, "hours_by_type": {"redovni": 30},
     "basis_amount": 388, "bruto": 511.85, "neto": 388, "tax": 21.99, "emp_pio": 71.66, "emp_health": 26.36,
     "emp_unemployment": 3.84, "er_pio": 51.19, "er_health": 26.36, "total_cost": 589.4, "payout": 388, "warnings": [],
     "projects": [
       {"project_id": "b8000000-0000-4000-8000-0000000000b1", "hours": 16, "worker_amount": 192, "labor_cost": 291.66, "revenue": 320},
       {"project_id": "b8000000-0000-4000-8000-0000000000b2", "hours": 14, "worker_amount": 196, "labor_cost": 297.74, "revenue": 350}]},
    {"employee_id": "d8000000-0000-4000-8000-0000000000d2", "employee_name": "QA-5 Podizvođač", "engagement_type": "subcontractor_worker",
     "vendor_id": "e8000000-0000-4000-8000-0000000000e1", "rate_basis": "neto", "work_fraction": 1, "total_hours": 40,
     "hours_by_type": {"redovni": 40}, "basis_amount": 600, "bruto": null, "neto": null, "tax": null, "emp_pio": null,
     "emp_health": null, "emp_unemployment": null, "er_pio": null, "er_health": null, "total_cost": 600, "payout": 600,
     "warnings": [], "projects": [
       {"project_id": "b8000000-0000-4000-8000-0000000000b1", "hours": 40, "worker_amount": 600, "labor_cost": 600, "revenue": 960}]}]'::jsonb as slips;

select lives_ok($$select public.save_payroll_draft('2034-03-15', 117.2, (select p from qa5_params), (select slips from qa5_params))$$,
  'admin pravi nacrt obračuna za zaključan mesec sa kursom');
select is((select (status, eur_rsd_rate, params ->> 'valid_from')::text from public.payroll_runs where month = '2034-03-01'),
  '(draft,117.2000,2034-01-01)', 'nacrt čuva kurs, a parametre upisuje baza (važe od 1.1.2034)');
select is((select count(*)::int from public.payslips ps join public.payroll_runs r on r.id = ps.run_id where r.month = '2034-03-01'),
  2, 'dva platna listića');
select is((select (sum(pp.labor_cost), (select sum(ps2.total_cost) from public.payslips ps2 join public.payroll_runs r2 on r2.id = ps2.run_id
                                         where r2.month = '2034-03-01'))::text
           from public.payslip_projects pp join public.payslips ps on ps.id = pp.payslip_id
           join public.payroll_runs r on r.id = ps.run_id where r.month = '2034-03-01'),
  '(1189.40,1189.40)', 'Accept: zbir troška po projektima = zbir bruto 2 (trošak) listića');
select is(public.payroll_run_problems((select id from public.payroll_runs where month = '2034-03-01')), '{}'::text[],
  'usklađen nacrt nema problema');

-- Listić sa satima cele nedelje (i februarskim danima) nije usklađen — u mart ulaze samo 1.3. i 2.3.
update public.payslip_projects set hours = 32
  where payslip_id = (select ps.id from public.payslips ps join public.payroll_runs r on r.id = ps.run_id
                      where r.month = '2034-03-01' and ps.employee_id = 'd8000000-0000-4000-8000-0000000000d1')
    and project_id = 'b8000000-0000-4000-8000-0000000000b1';
select throws_like($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2034-03-01'))$$,
  '%nije usklađen%QA-5 Zaposleni: sati na projektu QA-5 projekat 1 (32) ≠ odobreni sati u mesecu (16)%',
  'nedelja preko granice meseca: u mart ulaze samo dani marta');

-- Pogrešan neto (nije bruto − doprinosi − porez) se ne odobrava.
update public.payslip_projects set hours = 16
  where project_id = 'b8000000-0000-4000-8000-0000000000b1' and hours = 32;
update public.payslips set neto = 390, payout = 390 where employee_id = 'd8000000-0000-4000-8000-0000000000d1'
  and run_id = (select id from public.payroll_runs where month = '2034-03-01');
select ok(public.payroll_run_problems((select id from public.payroll_runs where month = '2034-03-01'))
          @> array['QA-5 Zaposleni: neto (390.00) ≠ bruto − doprinosi radnika − porez (388.00)'],
  'neusklađen neto je problem');

-- Promena kursa nacrta briše listiće (ne ostaju izračunati sa starim kursom); nacrt se pravi ponovo.
update public.payroll_runs set eur_rsd_rate = 118 where month = '2034-03-01';
select is((select count(*)::int from public.payslips ps join public.payroll_runs r on r.id = ps.run_id where r.month = '2034-03-01'),
  0, 'promena kursa prazni nacrt');
select lives_ok($$select public.save_payroll_draft('2034-03-01', 117.2, (select p from qa5_params), (select slips from qa5_params))$$,
  'nacrt se generiše ponovo');
select is((select count(*)::int from public.payslips ps join public.payroll_runs r on r.id = ps.run_id where r.month = '2034-03-01'),
  2, 'ponovo generisan nacrt ima dva listića (stari su obrisani, ne duplirani)');

-- Odobrena satnica bez snimka (odobrena pre Faze 2) se ne pogađa: radnik nema listić, odobravanje se odbija.
reset role;
set local session_replication_role = replica; -- samo za test: red kakav je ostao od pre Faze 2 (bez čuvara)
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate, approval_status)
values ('f8000000-0000-4000-8000-0000000000f4', 'd8000000-0000-4000-8000-0000000000d3', 'b8000000-0000-4000-8000-0000000000b1',
        '2034-03-13', 8, 12, 20, 'approved');
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.payroll_run_problems((select id from public.payroll_runs where month = '2034-03-01')),
  array['QA-5 Stara satnica, nedelja od 13.03.2034: odobrena satnica nema snimak tarifa i koeficijenata — vratite je u nacrt i odobrite ponovo',
        'QA-5 Stara satnica: nema platnog listića'],
  'satnica bez snimka i radnik bez listića su problemi sa imenom i nedeljom');
select throws_like($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2034-03-01'))$$,
  '%nije usklađen: QA-5 Stara satnica, nedelja od 13.03.2034: odobrena satnica nema snimak%',
  'obračun sa satnicom bez snimka ne može da se odobri');
reset role;
set local session_replication_role = replica;
delete from public.timesheets where id = 'f8000000-0000-4000-8000-0000000000f4';
set local session_replication_role = origin;

-- ───── operater nema pristup obračunu ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"82222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.payroll_runs), 0, 'operater ne vidi obračune');
select is((select count(*)::int from public.payslips), 0, 'operater ne vidi platne listiće');
select is((select count(*)::int from public.payslip_projects), 0, 'operater ne vidi raspodelu po projektima');
select is((select count(*)::int from public.payroll_params), 0, 'operater ne vidi obračunske parametre');
-- Zaključan mesec sa kursom prolazi čuvara (BEFORE trigger), pa red odbija RLS (WITH CHECK ide posle čuvara).
select throws_ok($$insert into public.payroll_runs (month, eur_rsd_rate, params) values ('2034-03-01', 117.2, '{}')$$,
  '42501', null, 'operater ne može da napravi obračun (RLS)');
select throws_ok($$select public.save_payroll_draft('2034-03-01', 117.2, (select p from qa5_params), '[]')$$,
  '42501', 'Samo admin može da pravi obračun', 'operater ne može da generiše nacrt');
select throws_ok($$select public.payroll_run_problems((select id from public.payroll_runs limit 1))$$,
  '42501', 'Samo admin može da vidi obračun', 'operater ne vidi probleme obračuna');
select throws_ok($$select public.approve_payroll_run('00000000-0000-4000-8000-000000000000')$$,
  '42501', 'Samo admin može da odobri obračun', 'operater ne može da odobri obračun');
select throws_ok($$select public.mark_payroll_paid('00000000-0000-4000-8000-000000000000')$$,
  '42501', 'Samo admin može da označi isplatu', 'operater ne može da označi isplatu');
update public.payroll_runs set notes = 'QA-5 operater';
delete from public.payslips;

set local request.jwt.claims to '{"sub":"81111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select (notes is null, (select count(*) from public.payslips ps where ps.run_id = r.id))::text
           from public.payroll_runs r where r.month = '2034-03-01'),
  '(t,2)', 'izmena i brisanje operatera ne menjaju ništa (RLS)');

-- ───── odobravanje i isplata ─────
select throws_ok($$select public.mark_payroll_paid((select id from public.payroll_runs where month = '2034-03-01'))$$,
  '23514', 'Isplaćen može da bude samo odobren obračun', 'nacrt ne može da bude isplaćen');
select throws_ok($$update public.payroll_runs set status = 'approved' where month = '2034-03-01'$$,
  '23514', null, 'status se ne menja direktno, samo odobravanjem');
select lives_ok($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2034-03-01'))$$,
  'usklađen obračun se odobrava');
select is((select (status, approved_by)::text from public.payroll_runs where month = '2034-03-01'),
  '(approved,81111111-1111-4111-8111-111111111111)', 'baza beleži ko je odobrio');

-- ───── odobren obračun je nepromenljiv ─────
select throws_ok($$update public.payroll_runs set notes = 'QA-5' where month = '2034-03-01'$$,
  '23514', 'Odobren obračun ne može da se menja; status se menja samo odobravanjem/isplatom', 'odobren obračun se ne menja');
select throws_ok($$update public.payroll_runs set eur_rsd_rate = 118 where month = '2034-03-01'$$,
  '23514', null, 'kurs odobrenog obračuna se ne menja');
select throws_ok($$delete from public.payroll_runs where month = '2034-03-01'$$,
  '23514', 'Odobren ili isplaćen obračun ne može da se obriše', 'odobren obračun se ne briše');
select throws_ok($$update public.payslips set payout = 999 where employee_id = 'd8000000-0000-4000-8000-0000000000d1'$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'listić odobrenog obračuna se ne menja');
select throws_ok($$delete from public.payslips where employee_id = 'd8000000-0000-4000-8000-0000000000d2'$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'listić odobrenog obračuna se ne briše');
select throws_ok($$insert into public.payslips (run_id, employee_id, engagement_type, rate_basis, work_fraction, total_hours, basis_amount, total_cost, payout)
  values ((select id from public.payroll_runs where month = '2034-03-01'), 'd8000000-0000-4000-8000-0000000000d3',
          'direct_employee', 'neto', 1, 0, 0, 0, 0)$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'u odobren obračun ne može da se doda listić');
select throws_ok($$update public.payslip_projects set labor_cost = labor_cost + 1 where project_id = 'b8000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'raspodela odobrenog obračuna se ne menja');
select throws_ok($$delete from public.payslip_projects where project_id = 'b8000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'raspodela odobrenog obračuna se ne briše');

-- Listić odobrenog obračuna ne može ni da se prebaci u nacrt drugog meseca.
select lives_ok($$select public.lock_month('2034-02-01')$$, 'februar 2034. se zaključava');
insert into public.payroll_runs (month, eur_rsd_rate, params) values ('2034-02-01', 117.2, '{}');
select throws_ok($$update public.payslips set run_id = (select id from public.payroll_runs where month = '2034-02-01')
  where employee_id = 'd8000000-0000-4000-8000-0000000000d2'
    and run_id = (select id from public.payroll_runs where month = '2034-03-01')$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'listić odobrenog obračuna se ne prebacuje u nacrt');
select throws_ok($$select public.save_payroll_draft('2034-03-01', 117.2, (select p from qa5_params), (select slips from qa5_params))$$,
  '23514', 'Odobren obračun ne može ponovo da se generiše', 'odobren obračun se ne generiše ponovo');
select throws_ok($$select public.unlock_month('2034-03-01')$$,
  '23514', 'Za ovaj mesec postoji obračun; prvo obrišite nacrt obračuna', 'mesec sa obračunom ne može da se otključa');

select lives_ok($$select public.mark_payroll_paid((select id from public.payroll_runs where month = '2034-03-01'))$$,
  'odobren obračun se označava kao isplaćen');
select is((select (status, paid_date is not null)::text from public.payroll_runs where month = '2034-03-01'),
  '(paid,t)', 'isplaćen obračun ima datum isplate');
select throws_ok($$delete from public.payroll_runs where month = '2034-03-01'$$,
  '23514', 'Odobren ili isplaćen obračun ne može da se obriše', 'isplaćen obračun se ne briše');
select throws_ok($$update public.payslips set neto = 1 where employee_id = 'd8000000-0000-4000-8000-0000000000d1'$$,
  '23514', 'Platni listić odobrenog obračuna ne može da se menja', 'listić isplaćenog obračuna se ne menja');
select throws_ok($$select public.mark_payroll_paid((select id from public.payroll_runs where month = '2034-03-01'))$$,
  '23514', 'Isplaćen može da bude samo odobren obračun', 'isplaćen obračun se ne isplaćuje ponovo');

select * from finish();
rollback;
