-- Payroll obaveze i isplate (migracija 20261125080000_obaveze_isplate.sql, spec §7, docs/TEAMORA-DATA-MODEL.md §2.8):
-- generisanje iz odobrenih satnica, primalac Vendor sa razradom po radniku (T12), delimične isplate i Remaining (T11),
-- preplata / druga valuta / izmena / brisanje / storno bez razloga odbijeni, korekcija sa razlogom, potvrđena obaveza
-- se ne menja (razlika u payable_problems), prava: HR i PM ne vide ništa (T26), audit.
-- Isti brojevi kao src/lib/finance/payables.test.js. Sopstveni podaci sa oznakom QA-28, februar 2036. Rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('92800000-0000-4000-8000-0000000000a1', 'qa28-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('92800000-0000-4000-8000-0000000000a2', 'qa28-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('92800000-0000-4000-8000-0000000000a3', 'qa28-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('92800000-0000-4000-8000-0000000000a4', 'qa28-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '92800000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'finance', active = true where id = '92800000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'hr', active = true where id = '92800000-0000-4000-8000-0000000000a3';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all' where id = '92800000-0000-4000-8000-0000000000a4';

update public.work_rules set daily_regular_hours = 8, max_daily_hours = 24;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.vendors (id, name, payment_terms_days) values
  ('e2800000-0000-4000-8000-0000000000e1', 'QA-28 Vendor d.o.o.', 15);
insert into public.projects (id, name, client_name) values
  ('b2800000-0000-4000-8000-0000000000b1', 'QA-28 projekat', 'QA-28 klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d2800000-0000-4000-8000-0000000000d1', 'QA-28', 'Direktni', 'QA-28-001'),
  ('d2800000-0000-4000-8000-0000000000d2', 'QA-28', 'Vendor Prvi', 'QA-28-002'),
  ('d2800000-0000-4000-8000-0000000000d3', 'QA-28', 'Vendor Drugi', 'QA-28-003');
insert into public.employment_history (employee_id, engagement_type, vendor_id, start_date) values
  ('d2800000-0000-4000-8000-0000000000d1', 'direct_employee', null, '2036-01-01'),
  ('d2800000-0000-4000-8000-0000000000d2', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1', '2036-01-01'),
  ('d2800000-0000-4000-8000-0000000000d3', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1', '2036-01-01');
insert into public.project_assignments (id, employee_id, project_id, start_date, status, engagement_type, vendor_id) values
  ('a2800000-0000-4000-8000-0000000000a1', 'd2800000-0000-4000-8000-0000000000d1', 'b2800000-0000-4000-8000-0000000000b1', '2036-01-01', 'active', 'direct_employee', null),
  ('a2800000-0000-4000-8000-0000000000a2', 'd2800000-0000-4000-8000-0000000000d2', 'b2800000-0000-4000-8000-0000000000b1', '2036-01-01', 'active', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1'),
  ('a2800000-0000-4000-8000-0000000000a3', 'd2800000-0000-4000-8000-0000000000d3', 'b2800000-0000-4000-8000-0000000000b1', '2036-01-01', 'active', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1');
insert into public.rates (scope, kind, amount, unit, currency, assignment_id, effective_from) values
  ('assignment', 'cost', 10, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a1', '2036-01-01'),
  ('assignment', 'revenue', 20, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a1', '2036-01-01'),
  ('assignment', 'cost', 12, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a2', '2036-01-01'),
  ('assignment', 'revenue', 22, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a2', '2036-01-01'),
  ('assignment', 'cost', 12, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a3', '2036-01-01'),
  ('assignment', 'revenue', 22, 'hourly', 'EUR', 'a2800000-0000-4000-8000-0000000000a3', '2036-01-01');

-- Srpski obračun februara sa listićima oba radnika Vendora (T12: listić radnika i dalje postoji). Mesec ostaje
-- otključan (satnice se još unose u testu), pa se pravila obračuna isključuju samo za ovaj upis.
alter table public.payroll_runs disable trigger user;
alter table public.payslips disable trigger user;
insert into public.payroll_runs (id, month, eur_rsd_rate, params) values
  ('c2800000-0000-4000-8000-0000000000c1', '2036-02-01', 117.2, '{}');
insert into public.payslips (run_id, employee_id, engagement_type, vendor_id, rate_basis, work_fraction, total_hours,
  basis_amount, total_cost, payout) values
  ('c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000d2', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1', 'neto', 1, 40, 480, 480, 480),
  ('c2800000-0000-4000-8000-0000000000c1', 'd2800000-0000-4000-8000-0000000000d3', 'subcontractor_worker', 'e2800000-0000-4000-8000-0000000000e1', 'neto', 1, 24, 288, 288, 288);
alter table public.payroll_runs enable trigger user;
alter table public.payslips enable trigger user;

-- Odobrene satnice (nedelja od ponedeljka 4.2.2036): direktni 40 h × 10, Vendor radnici 40 h i 24 h × 12.
set local role authenticated;
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, approval_status) values
  ('f2800000-0000-4000-8000-0000000000f1', 'd2800000-0000-4000-8000-0000000000d1', 'b2800000-0000-4000-8000-0000000000b1', '2036-02-04', 8, 8, 8, 8, 8, 'approved'),
  ('f2800000-0000-4000-8000-0000000000f2', 'd2800000-0000-4000-8000-0000000000d2', 'b2800000-0000-4000-8000-0000000000b1', '2036-02-04', 8, 8, 8, 8, 8, 'approved'),
  ('f2800000-0000-4000-8000-0000000000f3', 'd2800000-0000-4000-8000-0000000000d3', 'b2800000-0000-4000-8000-0000000000b1', '2036-02-04', 8, 8, 8, 0, 0, 'approved');
-- poslata (ne odobrena) satnica ne ulazi u obavezu
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, approval_status) values
  ('f2800000-0000-4000-8000-0000000000f9', 'd2800000-0000-4000-8000-0000000000d1', 'b2800000-0000-4000-8000-0000000000b1', '2036-02-11', 8, 'submitted');

-- ═════════════════════════════ T26: HR i PM nemaju pristup ═════════════════════════════
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.generate_payables('2036-02-01', '2036-02-29')$$, '42501', 'Nemate pravo „payroll.manage"',
  'T26 HR ne generiše obaveze');
select throws_ok($$select * from public.payable_problems('2036-02-01', '2036-02-29')$$, '42501', 'Nemate pravo „payroll.view"',
  'T26 HR ne čita probleme obaveza');
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select throws_ok($$select public.generate_payables('2036-02-01', '2036-02-29')$$, '42501', 'Nemate pravo „payroll.manage"',
  'T26 PM ne generiše obaveze');

-- ═════════════════════════════ generisanje (Finance) ═════════════════════════════
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$insert into public.payables (period_start, period_end, payee_type, employee_id, currency)
  values ('2036-02-01', '2036-02-29', 'employee', 'd2800000-0000-4000-8000-0000000000d1', 'EUR')$$,
  '23514', 'Obaveze nastaju generisanjem iz odobrenih satnica (Generiši obaveze)', 'obaveza se ne unosi ručno');
select throws_ok($$select public.generate_payables('2036-02-10', '2036-02-01')$$, '22023', 'Period nije ispravan',
  'period sa krajem pre početka se odbija');
select is(public.generate_payables('2036-02-01', '2036-02-29'), 2, 'generisanje februara pravi dve obaveze (radnik i Vendor)');
select is(public.generate_payables('2036-02-01', '2036-02-29'), 0, 'ponovno generisanje bez promena ne menja ništa');

-- T12: dva radnika istog Vendora → jedna obaveza Vendoru sa dve labor linije (razrada po radniku)
select is((select count(*)::int from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'), 1,
  'T12 dva radnika istog Vendora → jedna obaveza prema Vendoru');
select is((select (payee_type, currency, calculated_amount, adjustments_amount, total_amount, status, due_date)::text
           from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(vendor,EUR,768.00,0.00,768.00,draft,2036-03-15)',
  'T12 obaveza Vendoru = 40 × 12 + 24 × 12 = 768 €, nacrt, dospeće = kraj perioda + 15 dana roka Vendora');
select is((select string_agg(e.last_name || ':' || l.hours || 'h:' || l.amount, ', ' order by e.last_name)
           from public.payable_lines l join public.payables p on p.id = l.payable_id join public.employees e on e.id = l.employee_id
           where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1' and l.kind = 'labor'),
  'Vendor Drugi:24.00h:288.00, Vendor Prvi:40.00h:480.00', 'T12 dve labor linije, po jedna za svakog radnika Vendora');
select is((select (payee_type, employee_id, calculated_amount, due_date)::text from public.payables
           where employee_id = 'd2800000-0000-4000-8000-0000000000d1'),
  '(employee,d2800000-0000-4000-8000-0000000000d1,400.00,)',
  'direktni radnik: obaveza prema radniku 40 × 10 = 400 € (poslata satnica se ne računa), bez izmišljenog dospeća');
select is((select count(*)::int from public.payslips where run_id = 'c2800000-0000-4000-8000-0000000000c1'), 2,
  'T12 listići oba radnika Vendora u srpskom obračunu i dalje postoje');
select is((select count(*)::int from public.payables where payroll_run_id = 'c2800000-0000-4000-8000-0000000000c1'), 2,
  'obaveze celog meseca su informativno vezane za obračun tog meseca');

-- iznos obaveze se ne menja ručno
select throws_ok($$update public.payables set calculated_amount = 1000 where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Iznos obaveze se računa iz satnica — razliku unesite kao korekciju sa razlogom', 'iznos obaveze se ne menja ručno');
select throws_ok($$update public.payables set period_end = '2036-02-28' where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Period, primalac i valuta obaveze se ne menjaju', 'period obaveze se ne menja');
select throws_ok($$insert into public.payable_lines (payable_id, kind, amount, currency)
  select id, 'labor', 10, 'EUR' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Linije rada menja samo generisanje obaveza', 'labor linija se ne unosi ručno');

-- uplata pre potvrde
select throws_ok($$insert into public.payments (payable_id, payment_date, amount, currency)
  select id, '2036-03-05', 100, 'EUR' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Uplata se evidentira samo za potvrđenu obavezu', 'uplata za nacrt obaveze se odbija');

-- potvrda
select lives_ok($$update public.payables set status = 'confirmed' where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  'Finance potvrđuje obavezu prema Vendoru');
select is((select (status, confirmed_by)::text from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(confirmed,92800000-0000-4000-8000-0000000000a2)', 'potvrda beleži ko je potvrdio');
select throws_ok($$update public.payables set status = 'draft' where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Potvrđena obaveza se ne vraća u nacrt — razliku unesite kao korekciju sa razlogom', 'potvrđena obaveza se ne vraća u nacrt');
select is((select (paid_amount, remaining_amount, payment_status)::text from public.payable_balances b
           join public.payables p on p.id = b.payable_id where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(0.00,768.00,unpaid)', 'pre uplata: Paid 0, Remaining 768, Unpaid');

-- ═════════════════════════════ T11: delimične isplate ═════════════════════════════
select lives_ok($$insert into public.payments (id, payable_id, payment_date, amount, currency, reference, description)
  select 'e2810000-0000-4000-8000-000000000001', id, '2036-03-05', 300, 'EUR', 'IZV-2036-031', 'Prva rata'
  from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$, 'T11 prva delimična isplata 300 €');
select is((select (paid_amount, remaining_amount, payment_status)::text from public.payable_balances b
           join public.payables p on p.id = b.payable_id where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(300.00,468.00,partially_paid)', 'T11 posle 300 €: Remaining 768 − 300 = 468, Partially Paid');
select lives_ok($$insert into public.payments (id, payable_id, payment_date, amount, reference)
  select 'e2810000-0000-4000-8000-000000000002', id, '2036-03-12', 200, 'IZV-2036-044'
  from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$, 'T11 druga delimična isplata 200 € (valuta iz obaveze)');
select is((select (paid_amount, remaining_amount, payment_status)::text from public.payable_balances b
           join public.payables p on p.id = b.payable_id where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(500.00,268.00,partially_paid)', 'T11 posle 200 €: Remaining smanjen tačno za 200 → 268, Partially Paid');
select is((select (currency, recorded_by)::text from public.payments where id = 'e2810000-0000-4000-8000-000000000002'),
  '(EUR,92800000-0000-4000-8000-0000000000a2)', 'uplata beleži valutu i korisnika koji ju je evidentirao');

select throws_ok($$insert into public.payments (payable_id, payment_date, amount, currency)
  select id, '2036-03-13', 268.01, 'EUR' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Preplata — evidentirajte korekciju (adjustment) sa razlogom', 'T11 preplata (268,01 > 268) se odbija');
select throws_ok($$insert into public.payments (payable_id, payment_date, amount, currency)
  select id, '2036-03-13', 10, 'RSD' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Valuta uplate (RSD) mora biti valuta obaveze (EUR)', 'uplata u drugoj valuti se odbija');
select throws_ok($$update public.payments set amount = 250 where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Uplata se ne menja — stornirajte je uz razlog i unesite novu', 'iznos uplate se ne menja');
select throws_ok($$update public.payments set payable_id = (select id from public.payables where employee_id = 'd2800000-0000-4000-8000-0000000000d1')
  where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Uplata se ne menja — stornirajte je uz razlog i unesite novu', 'uplata se ne prevezuje na drugu obavezu (nema duplog povezivanja)');
select throws_ok($$delete from public.payments where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Uplata se ne briše — stornirajte je uz razlog', 'T11 brisanje uplate se odbija');
select throws_ok($$update public.payments set voided_at = now() where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Razlog storna je obavezan (najmanje 5 znakova)', 'T11 storno bez razloga se odbija');
select throws_ok($$update public.payments set voided_at = now(), void_reason = 'greš' where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Razlog storna je obavezan (najmanje 5 znakova)', 'storno sa prekratkim razlogom se odbija');
select lives_ok($$update public.payments set voided_at = now(), void_reason = 'Pogrešan izvod, uplata vraćena'
  where id = 'e2810000-0000-4000-8000-000000000002'$$, 'storno uz razlog');
select is((select (paid_amount, remaining_amount, payment_status)::text from public.payable_balances b
           join public.payables p on p.id = b.payable_id where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(300.00,468.00,partially_paid)', 'stornirana uplata se ne broji: Remaining ponovo 468');
select throws_ok($$update public.payments set void_reason = 'Drugi razlog storna' where id = 'e2810000-0000-4000-8000-000000000002'$$,
  '23514', 'Uplata je već stornirana', 'stornirana uplata se ne menja');
select is((select voided_by from public.payments where id = 'e2810000-0000-4000-8000-000000000002'),
  '92800000-0000-4000-8000-0000000000a2'::uuid, 'storno beleži ko je stornirao');

-- ═════════════════════════════ korekcija (adjustment) ═════════════════════════════
select throws_ok($$insert into public.payable_lines (payable_id, kind, amount)
  select id, 'adjustment', -18 from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Razlog korekcije je obavezan (najmanje 5 znakova)', 'korekcija bez razloga se odbija');
select throws_ok($$insert into public.payable_lines (payable_id, kind, amount, reason)
  select id, 'adjustment', -500, 'Odbitak za opremu' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Korekcija bi obavezu spustila ispod već isplaćenog iznosa (300.00)', 'korekcija ispod isplaćenog se odbija');
select lives_ok($$insert into public.payable_lines (payable_id, kind, employee_id, amount, reason)
  select id, 'adjustment', 'd2800000-0000-4000-8000-0000000000d2', -18, 'Odbitak za izgubljenu opremu'
  from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$, 'korekcija potvrđene obaveze uz razlog');
select is((select (calculated_amount, adjustments_amount, total_amount)::text from public.payables
           where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(768.00,-18.00,750.00)', 'obračunati iznos ostaje 768, korekcija −18, ukupno 750');
select is((select remaining_amount from public.payable_balances b join public.payables p on p.id = b.payable_id
           where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'), 450.00::numeric, 'Remaining = 750 − 300 = 450');
select throws_ok($$update public.payable_lines set amount = -20 where reason = 'Odbitak za izgubljenu opremu'$$,
  '23514', 'Linija obaveze se ne menja — unesite novu korekciju sa razlogom', 'korekcija se ne menja');
select throws_ok($$delete from public.payable_lines where reason = 'Odbitak za izgubljenu opremu'$$,
  '23514', 'Linija potvrđene obaveze se ne briše — unesite novu korekciju sa razlogom', 'korekcija potvrđene obaveze se ne briše');
select lives_ok($$insert into public.payments (payable_id, payment_date, amount, description)
  select id, '2036-03-20', 450, 'Završna uplata' from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  'uplata ostatka 450 €');
select is((select (paid_amount, remaining_amount, payment_status)::text from public.payable_balances b
           join public.payables p on p.id = b.payable_id where p.vendor_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(750.00,0.00,paid)', 'cela obaveza isplaćena: Paid');
select throws_ok($$update public.payables set status = 'cancelled' where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Obaveza sa uplatama se ne otkazuje — prvo stornirajte uplate', 'obaveza sa uplatama se ne otkazuje');

-- ═════════════════════════════ potvrđena obaveza se ne menja; razlika u problemima ═════════════════════════════
-- Nova odobrena satnica radnika Vendora (25.2.): potvrđena obaveza ostaje 768, payable_problems prijavljuje razliku.
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, approval_status) values
  ('f2800000-0000-4000-8000-0000000000f4', 'd2800000-0000-4000-8000-0000000000d2', 'b2800000-0000-4000-8000-0000000000b1', '2036-02-25', 8, 'approved');
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select is(public.generate_payables('2036-02-01', '2036-02-29'), 0, 'generisanje ne menja potvrđenu obavezu');
select is((select calculated_amount from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'), 768.00::numeric,
  'potvrđena obaveza i dalje 768');
select is((select (code, expected_amount, actual_amount)::text from public.payable_problems('2036-02-01', '2036-02-29')
           where payee_id = 'e2800000-0000-4000-8000-0000000000e1'),
  '(confirmed_changed,864.00,768.00)', 'payable_problems: potvrđena obaveza odstupa (864 prema 768) → Finance unosi korekciju');

-- preklopljen period se ne pravi kao nova obaveza
select is(public.generate_payables('2036-02-04', '2036-02-08'), 0, 'obaveza za preklopljen period se ne pravi');
select is((select count(*)::int from public.payable_problems('2036-02-04', '2036-02-08') where code = 'period_overlap'), 2,
  'payable_problems prijavljuje preklapanje za oba primaoca');

-- nacrt se briše, potvrđena ne
select lives_ok($$delete from public.payables where employee_id = 'd2800000-0000-4000-8000-0000000000d1'$$, 'nacrt obaveze se briše');
select throws_ok($$delete from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'$$,
  '23514', 'Briše se samo nacrt obaveze — potvrđenu otkažite', 'potvrđena obaveza se ne briše');
select is(public.generate_payables('2036-02-01', '2036-02-29'), 1, 'ponovno generisanje vraća obrisani nacrt radnika');
-- satnica vraćena na korekciju (K11): nacrt bez odobrenih sati i bez korekcija nestaje pri sledećem generisanju
select lives_ok($$select public.reopen_timesheet('f2800000-0000-4000-8000-0000000000f1', 'Ispravka sati za februar')$$,
  'Finance vraća odobrenu satnicu direktnog radnika na korekciju');
select is(public.generate_payables('2036-02-01', '2036-02-29'), 1, 'generisanje uklanja nacrt koji više nema odobrene sate');
select is((select count(*)::int from public.payables where employee_id = 'd2800000-0000-4000-8000-0000000000d1'), 0,
  'obaveze prema radniku bez odobrenih sati nema');

-- ═════════════════════════════ audit ═════════════════════════════
select ok(exists (select 1 from public.audit_log where table_name = 'payments' and record_id = 'e2810000-0000-4000-8000-000000000002'
                  and 'voided_at' = any (changed_fields) and actor = '92800000-0000-4000-8000-0000000000a2'),
  'audit: storno uplate je zabeležen sa korisnikom');
select ok(exists (select 1 from public.audit_log where table_name = 'payable_lines' and new_data ->> 'kind' = 'adjustment'),
  'audit: korekcija je vidljiva Finance-u u istoriji');

-- ═════════════════════════════ T26: HR i PM ne čitaju obaveze ni uplate ═════════════════════════════
do $$ begin
  perform set_config('qa28.vendor_payable', (select id::text from public.payables where vendor_id = 'e2800000-0000-4000-8000-0000000000e1'), true);
end $$;
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.payables) + (select count(*)::int from public.payable_lines)
          + (select count(*)::int from public.payments) + (select count(*)::int from public.payable_balances), 0,
  'T26 HR ne čita payables, linije, payments ni stanje');
select is((select count(*)::int from public.audit_log where table_name in ('payables', 'payable_lines', 'payments')), 0,
  'T26 HR ne vidi istoriju obaveza i uplata');
select throws_ok($$insert into public.payments (payable_id, payment_date, amount, currency)
  values (current_setting('qa28.vendor_payable')::uuid, '2036-03-20', 1, 'EUR')$$, '42501', 'Nemate pravo „payments.record"',
  'T26 HR ne evidentira uplatu ni kad zna id obaveze');
with u as (update public.payments set voided_at = now(), void_reason = 'Pokušaj storna bez prava'
  where payable_id = current_setting('qa28.vendor_payable')::uuid returning 1)
select is(count(*)::int, 0, 'T26 HR ne stornira uplatu (ne vidi je)') from u;
set local request.jwt.claims to '{"sub":"92800000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from public.payables) + (select count(*)::int from public.payments), 0,
  'T26 PM ne čita payables ni payments');

select * from finish();
rollback;
