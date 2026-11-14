-- Testovi za P1 iz pregleda novčane logike (migracija 20261114250000_angazman_isplata_nalozi.sql, D3, D7, D8, D14, D17):
--  * angažman radnika (employment_history) čita osoblje, a upisuje, menja i briše samo admin;
--  * obračun se ne odobrava sa isplatom < 0 ni za bruto satnicu ispod najniže osnovice (dok knjigovođa ne potvrdi pravilo);
--  * nov nalog je neaktivan operater; samo prvi nalog u praznom sistemu postaje aktivan admin.
-- Sopstveni podaci sa oznakom QA-9, 2035. godina i sopstveni obračunski parametri; sve se vraća (rollback).
--
-- PARITET SA payrollMonth.js: listići su brojevi iz bloka „isti primer kao pgTAP 09" u
-- src/lib/payroll/payrollProblems.test.js (kurs 117,2, najniža osnovica 51.297 / 117,2 = 437,69 €). Ako se promeni
-- jedan fajl, mora i drugi.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ═════════════════════════════ novi nalozi ═════════════════════════════
-- Sistem već ima naloge (bar ove iz testa), pa je svaki nov nalog neaktivan operater.
insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data) values
  ('91111111-1111-4111-8111-111111111111', 'qa9-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-9 Admin"}'),
  ('92222222-2222-4222-8222-222222222222', 'qa9-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null),
  ('93333333-3333-4333-8333-333333333333', 'qa9-novi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null);
select is((select array_agg((email, full_name, role, active)::text order by email) from public.profiles
           where id in ('91111111-1111-4111-8111-111111111111', '92222222-2222-4222-8222-222222222222', '93333333-3333-4333-8333-333333333333')),
  array['(qa9-admin@radnici.local,"QA-9 Admin",operater,f)', '(qa9-novi@radnici.local,qa9-novi@radnici.local,operater,f)',
        '(qa9-operater@radnici.local,qa9-operater@radnici.local,operater,f)'],
  'Accept: nov nalog je neaktivan operater (admin ga aktivira)');
select is((select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'active'), 'false',
  'profil upisan mimo registracije je takođe neaktivan');

-- Admin aktivira QA naloge (kao postgres, zaobilazi RLS).
update public.profiles set role = 'admin', active = true where id = '91111111-1111-4111-8111-111111111111';
update public.profiles set active = true where id = '92222222-2222-4222-8222-222222222222';

-- ───── priprema podataka (kao postgres) ─────
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';
-- Parametri za 2035. (isti brojevi kao 2026) da test ne zavisi od onoga što je upisano u lokalnu bazu.
insert into public.payroll_params (valid_from, tax_rate, non_taxable_rsd, min_base_rsd, max_base_rsd,
  emp_pio, emp_health, emp_unemployment, er_pio, er_health, source_note)
values ('2035-01-01', 0.10, 34221, 51297, 732820, 0.14, 0.0515, 0.0075, 0.10, 0.0515, 'QA-9 parametri (isti kao 2026)');
insert into public.clients (id, name) values ('c9000000-0000-4000-8000-0000000000c1', 'QA-9 klijent');
insert into public.vendors (id, name) values ('e9000000-0000-4000-8000-0000000000e1', 'QA-9 dobavljač');
insert into public.projects (id, name, client_name) values ('b9000000-0000-4000-8000-0000000000b1', 'QA-9 projekat', 'QA-9 klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d9000000-0000-4000-8000-0000000000d1', 'QA-9', 'Mali bruto', 'QA-9-001'),
  ('d9000000-0000-4000-8000-0000000000d2', 'QA-9', 'Bruto', 'QA-9-002'),
  ('d9000000-0000-4000-8000-0000000000d3', 'QA-9', 'Treći', 'QA-9-003');
-- Bruto satnica iz profila (najniži nivo izbora tarife, D4): 6 € i 12 €, klijentu 20 €.
insert into public.employee_private (employee_id, rate_basis, b2c_hourly_rate, b2b_hourly_rate) values
  ('d9000000-0000-4000-8000-0000000000d1', 'bruto', 6, 20),
  ('d9000000-0000-4000-8000-0000000000d2', 'bruto', 12, 20);
insert into public.employment_history (employee_id, engagement_type, vendor_id, start_date) values
  ('d9000000-0000-4000-8000-0000000000d1', 'direct_employee', null, '2035-01-01'),
  ('d9000000-0000-4000-8000-0000000000d2', 'direct_employee', null, '2035-01-01');

-- ───── neaktivan nalog ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"93333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(public.is_staff(), false, 'neaktivan nalog nije osoblje');
select is((select count(*)::int from public.employees), 0, 'neaktivan nalog ne vidi radnike');
select is((select count(*)::int from public.employment_history), 0, 'neaktivan nalog ne vidi angažmane');
select is((select (role, active)::text from public.profiles where id = auth.uid()), '(operater,f)',
  'neaktivan nalog vidi svoj profil (aplikacija prikazuje „Nalog još nije aktiviran")');
update public.profiles set role = 'admin', active = true where id = '93333333-3333-4333-8333-333333333333';
reset role;
select is((select (role, active)::text from public.profiles where id = '93333333-3333-4333-8333-333333333333'), '(operater,f)',
  'neaktivan nalog ne može sam sebe da aktivira ni da postane admin');

-- ═════════════════════════════ angažman: čita osoblje, menja samo admin ═════════════════════════════
select policies_are('public', 'employment_history', array['employment_history_read', 'employment_history_admin_write'],
  'angažman ima samo pravila „osoblje čita" i „admin menja"');

set local role authenticated;
set local request.jwt.claims to '{"sub":"92222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.employment_history
           where employee_id in ('d9000000-0000-4000-8000-0000000000d1', 'd9000000-0000-4000-8000-0000000000d2')),
  2, 'operater vidi angažmane (profil radnika)');
select throws_ok($$insert into public.employment_history (employee_id, engagement_type, start_date)
  values ('d9000000-0000-4000-8000-0000000000d3', 'direct_employee', '2035-01-01')$$,
  '42501', null, 'Accept: operater ne upisuje angažman');
update public.employment_history set engagement_type = 'subcontractor_worker', vendor_id = 'e9000000-0000-4000-8000-0000000000e1'
  where employee_id = 'd9000000-0000-4000-8000-0000000000d1';
update public.employment_history set start_date = '2035-02-01', end_date = '2035-12-31'
  where employee_id = 'd9000000-0000-4000-8000-0000000000d2';
delete from public.employment_history where employee_id = 'd9000000-0000-4000-8000-0000000000d2';
reset role;
select is((select array_agg((engagement_type, vendor_id is null, start_date, end_date is null)::text order by employee_id)
           from public.employment_history
           where employee_id in ('d9000000-0000-4000-8000-0000000000d1', 'd9000000-0000-4000-8000-0000000000d2')),
  array['(direct_employee,t,2035-01-01,t)', '(direct_employee,t,2035-01-01,t)'],
  'Accept: operater ne menja ni ne briše angažman (tip, dobavljač i datumi ostaju)');

set local role authenticated;
set local request.jwt.claims to '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$insert into public.employment_history (employee_id, engagement_type, vendor_id, start_date)
  values ('d9000000-0000-4000-8000-0000000000d3', 'subcontractor_worker', 'e9000000-0000-4000-8000-0000000000e1', '2035-01-01')$$,
  'admin upisuje angažman');
update public.employment_history set engagement_type = 'direct_employee', vendor_id = null, notes = 'QA-9'
  where employee_id = 'd9000000-0000-4000-8000-0000000000d3';
select is((select (engagement_type, notes)::text from public.employment_history where employee_id = 'd9000000-0000-4000-8000-0000000000d3'),
  '(direct_employee,QA-9)', 'admin menja angažman');
delete from public.employment_history where employee_id = 'd9000000-0000-4000-8000-0000000000d3';
select is((select count(*)::int from public.employment_history where employee_id = 'd9000000-0000-4000-8000-0000000000d3'),
  0, 'admin briše angažman');

-- ═════════════════════════════ obračun: isplata < 0 i bruto ispod najniže osnovice ═════════════════════════════
-- Admin odobrava satnice i zaključava mart, april i maj 2035. (5.3., 2.4. i 7.5.2035. su ponedeljci).
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours,
                               b2c_rate, b2b_rate, approval_status) values
  ('f9000000-0000-4000-8000-0000000000f1', 'd9000000-0000-4000-8000-0000000000d1', 'b9000000-0000-4000-8000-0000000000b1',
   '2035-03-05', 8, 0, 0, 0, 0, 6, 20, 'approved'),
  ('f9000000-0000-4000-8000-0000000000f2', 'd9000000-0000-4000-8000-0000000000d2', 'b9000000-0000-4000-8000-0000000000b1',
   '2035-04-02', 8, 8, 0, 0, 0, 12, 20, 'approved'),
  ('f9000000-0000-4000-8000-0000000000f3', 'd9000000-0000-4000-8000-0000000000d2', 'b9000000-0000-4000-8000-0000000000b1',
   '2035-05-07', 8, 8, 8, 8, 8, 12, 20, 'approved');
select lives_ok($$select public.lock_month('2035-03-01'), public.lock_month('2035-04-01'), public.lock_month('2035-05-01')$$,
  'mart, april i maj 2035. se zaključavaju (sve satnice odobrene)');

create temporary table qa9 on commit drop as select
  '{"valid_from": "2035-01-01", "tax_rate": 0.1, "non_taxable_rsd": 34221, "min_base_rsd": 51297, "max_base_rsd": 732820,
    "emp_pio": 0.14, "emp_health": 0.0515, "emp_unemployment": 0.0075, "er_pio": 0.1, "er_health": 0.0515}'::jsonb as p,
  -- mart: 8 h × 6 € bruto → doprinosi na najnižu osnovicu (87,10) veći od bruta → isplata −39,10.
  '[{"employee_id": "d9000000-0000-4000-8000-0000000000d1", "employee_name": "QA-9 Mali bruto", "engagement_type": "direct_employee",
     "vendor_id": null, "rate_basis": "bruto", "work_fraction": 1, "total_hours": 8, "hours_by_type": {"redovni": 8},
     "basis_amount": 48, "bruto": 48, "neto": -39.1, "tax": 0, "emp_pio": 61.28, "emp_health": 22.54, "emp_unemployment": 3.28,
     "er_pio": 43.77, "er_health": 22.54, "total_cost": 114.31, "payout": -39.1, "warnings": ["ispod_najnize_osnovice", "negativan_neto"],
     "projects": [{"project_id": "b9000000-0000-4000-8000-0000000000b1", "hours": 8, "worker_amount": 48, "labor_cost": 114.31, "revenue": 160}]}]'::jsonb as mart,
  -- april: 16 h × 12 € bruto = 192 € ispod najniže osnovice 437,69 € → isplata 104,90. Bez upozorenja: baza ne veruje ekranu.
  '[{"employee_id": "d9000000-0000-4000-8000-0000000000d2", "employee_name": "QA-9 Bruto", "engagement_type": "direct_employee",
     "vendor_id": null, "rate_basis": "bruto", "work_fraction": 1, "total_hours": 16, "hours_by_type": {"redovni": 16},
     "basis_amount": 192, "bruto": 192, "neto": 104.9, "tax": 0, "emp_pio": 61.28, "emp_health": 22.54, "emp_unemployment": 3.28,
     "er_pio": 43.77, "er_health": 22.54, "total_cost": 258.31, "payout": 104.9, "warnings": [],
     "projects": [{"project_id": "b9000000-0000-4000-8000-0000000000b1", "hours": 16, "worker_amount": 192, "labor_cost": 258.31, "revenue": 320}]}]'::jsonb as april,
  -- maj: 40 h × 12 € bruto = 480 € (iznad osnovice) → porez 18,80, neto 365,68, bruto 2 = 552,72.
  '[{"employee_id": "d9000000-0000-4000-8000-0000000000d2", "employee_name": "QA-9 Bruto", "engagement_type": "direct_employee",
     "vendor_id": null, "rate_basis": "bruto", "work_fraction": 1, "total_hours": 40, "hours_by_type": {"redovni": 40},
     "basis_amount": 480, "bruto": 480, "neto": 365.68, "tax": 18.8, "emp_pio": 67.2, "emp_health": 24.72, "emp_unemployment": 3.6,
     "er_pio": 48, "er_health": 24.72, "total_cost": 552.72, "payout": 365.68, "warnings": [],
     "projects": [{"project_id": "b9000000-0000-4000-8000-0000000000b1", "hours": 40, "worker_amount": 480, "labor_cost": 552.72, "revenue": 800}]}]'::jsonb as maj;

-- ───── mart: negativna isplata ─────
select lives_ok($$select public.save_payroll_draft('2035-03-01', 117.2, (select p from qa9), (select mart from qa9))$$,
  'nacrt sa negativnom isplatom se čuva (da se vidi šta je izračunato)');
select is(public.payroll_run_problems((select id from public.payroll_runs where month = '2035-03-01')),
  array['QA-9 Mali bruto: isplata (-39.10) je negativna — iznos manji od nule se ne isplaćuje',
        'QA-9 Mali bruto: zarada po bruto satnici (48.00) je ispod najniže osnovice (437.69) — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate'],
  'negativna isplata i bruto ispod najniže osnovice su problemi sa imenom radnika (ostalo je usklađeno)');
select throws_like($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2035-03-01'))$$,
  '%nije usklađen: QA-9 Mali bruto: isplata (-39.10) je negativna%',
  'Accept: obračun sa negativnom isplatom se ne odobrava (8 h × 6 € bruto)');
select is((select status from public.payroll_runs where month = '2035-03-01'), 'draft', 'mart ostaje nacrt');

-- ───── april: bruto ispod najniže osnovice (deo meseca) ─────
select lives_ok($$select public.save_payroll_draft('2035-04-01', 117.2, (select p from qa9), (select april from qa9))$$,
  'nacrt za april se čuva');
select is(public.payroll_run_problems((select id from public.payroll_runs where month = '2035-04-01')),
  array['QA-9 Bruto: zarada po bruto satnici (192.00) je ispod najniže osnovice (437.69) — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate'],
  'bruto ispod najniže osnovice je problem i kad je isplata pozitivna (i bez upozorenja sa ekrana)');
select throws_like($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2035-04-01'))$$,
  '%nije usklađen: QA-9 Bruto: zarada po bruto satnici (192.00) je ispod najniže osnovice (437.69) — knjigovođa mora da potvrdi pravilo%',
  'Accept: obračun sa bruto satnicom ispod najniže osnovice se ne odobrava (16 h × 12 € bruto)');

-- Osnovica se srazmerava udelu radnog vremena (isto kao fromGross): sa udelom 0,4 osnovica je 175,08 € < 192 €.
reset role;
update public.employee_private set work_fraction = 0.4 where employee_id = 'd9000000-0000-4000-8000-0000000000d2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.payslips set work_fraction = 0.4
  where run_id = (select id from public.payroll_runs where month = '2035-04-01');
select ok(not exists (select 1 from unnest(public.payroll_run_problems((select id from public.payroll_runs where month = '2035-04-01'))) m
                      where m like '%ispod najniže osnovice%'),
  'sa udelom radnog vremena 0,4 bruto 192 € nije ispod srazmerne osnovice');
reset role;
update public.employee_private set work_fraction = 1 where employee_id = 'd9000000-0000-4000-8000-0000000000d2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- ───── maj: normalan slučaj i dalje prolazi ─────
select lives_ok($$select public.save_payroll_draft('2035-05-01', 117.2, (select p from qa9), (select maj from qa9))$$,
  'nacrt za maj se čuva');
select is(public.payroll_run_problems((select id from public.payroll_runs where month = '2035-05-01')), '{}'::text[],
  'bruto satnica iznad najniže osnovice nema problema');
select lives_ok($$select public.approve_payroll_run((select id from public.payroll_runs where month = '2035-05-01'))$$,
  'Accept: normalan obračun sa bruto satnicom se odobrava (40 h × 12 €)');
select is((select status from public.payroll_runs where month = '2035-05-01'), 'approved', 'maj je odobren');

-- ═════════════════════════════ prvi nalog u praznom sistemu ═════════════════════════════
-- Prazan sistem se simulira u ovoj transakciji (rollback): tabela profila se privremeno zameni praznom kopijom,
-- pa handle_new_user vidi da nema nijednog profila. Ništa se ne briše i ništa ne ostaje posle testa.
reset role;
alter table public.profiles rename to profiles_qa9;
create table public.profiles (like public.profiles_qa9 including all);
select is((select count(*)::int from public.profiles), 0, 'simulacija: sistem bez ijednog profila');
insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data) values
  ('94444444-4444-4444-8444-444444444444', 'qa9-prvi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-9 Prvi"}');
insert into auth.users (id, email, instance_id, aud, role) values
  ('95555555-5555-4555-8555-555555555555', 'qa9-drugi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
select is((select (full_name, role, active)::text from public.profiles where id = '94444444-4444-4444-8444-444444444444'),
  '("QA-9 Prvi",admin,t)', 'Accept: prvi nalog u sistemu postaje aktivan admin (kao i do sada)');
select is((select (role, active)::text from public.profiles where id = '95555555-5555-4555-8555-555555555555'),
  '(operater,f)', 'drugi nalog u novom sistemu je neaktivan operater');
select is((select count(*)::int from public.profiles where role = 'admin'), 1, 'samo jedan admin u novom sistemu');

select * from finish();
rollback;
