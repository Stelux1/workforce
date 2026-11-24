-- Client Billing Overview (migracija 20261125090000_billing.sql, W2-F, spec §9, docs/TEAMORA-DATA-MODEL.md §2.9):
-- nema izdavanja ni numeracije faktura (T29), ručni status uz ko/kada, zamrzavanje obračuna, preklapanje perioda,
-- billable troškovi odvojeno i bez duplog brojanja (T15), eksterni račun + delimične uplate → Outstanding (T16),
-- prava (HR/PM ne vide billing ni tarifu klijenta).
-- Sopstveni podaci sa oznakom QA-29, novembar 2034. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(60);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('29a00000-0000-4000-8000-000000000001', 'qa29-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('29a00000-0000-4000-8000-000000000002', 'qa29-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('29a00000-0000-4000-8000-000000000003', 'qa29-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('29a00000-0000-4000-8000-000000000004', 'qa29-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '29a00000-0000-4000-8000-000000000001';
update public.profiles set role = 'finance', active = true where id = '29a00000-0000-4000-8000-000000000002';
update public.profiles set role = 'hr', active = true where id = '29a00000-0000-4000-8000-000000000003';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all' where id = '29a00000-0000-4000-8000-000000000004';

update public.work_rules set daily_regular_hours = 8, max_daily_hours = 24;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name, default_b2b_rate) values
  ('29c00000-0000-4000-8000-0000000000c1', 'QA-29 klijent', 50),
  ('29c00000-0000-4000-8000-0000000000c2', 'QA-29 drugi klijent', null);
insert into public.projects (id, name, client_name) values
  ('29b00000-0000-4000-8000-0000000000b1', 'QA-29 projekat 1', 'QA-29 klijent'),
  ('29b00000-0000-4000-8000-0000000000b2', 'QA-29 projekat 2', 'QA-29 klijent'),
  ('29b00000-0000-4000-8000-0000000000b3', 'QA-29 projekat drugog', 'QA-29 drugi klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('29d00000-0000-4000-8000-0000000000d1', 'QA-29', 'Radnik', 'QA-29-001');
insert into public.project_assignments (id, employee_id, project_id, start_date, status) values
  ('29e00000-0000-4000-8000-0000000000e1', '29d00000-0000-4000-8000-0000000000d1', '29b00000-0000-4000-8000-0000000000b1', '2034-01-01', 'active');
insert into public.rates (scope, kind, amount, unit, currency, assignment_id, effective_from) values
  ('assignment', 'cost', 45, 'hourly', 'EUR', '29e00000-0000-4000-8000-0000000000e1', '2034-01-01'),
  ('assignment', 'revenue', 50, 'hourly', 'EUR', '29e00000-0000-4000-8000-0000000000e1', '2034-01-01');
insert into public.cost_categories (id, name, subcategories, payroll_linked) values
  ('29f00000-0000-4000-8000-0000000000f1', 'QA-29 smeštaj', '[]', false);

-- Odobrena nedelja: 5 × 8 h × 50 € × 1.0 = 2000 € prihoda (spec §5 primer, T27 pravilo zaokruživanja).
set local role authenticated;
set local request.jwt.claims to '{"sub":"29a00000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, wed_hours, thu_hours, fri_hours, approval_status)
  values ('29100000-0000-4000-8000-000000000001', '29d00000-0000-4000-8000-0000000000d1', '29b00000-0000-4000-8000-0000000000b1',
          '2034-11-06', 8, 8, 8, 8, 8, 'approved');
-- Troškovi: billable i ne-billable na projektu 1 (u periodu), billable drugog klijenta.
insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id, billable, description) values
  ('29200000-0000-4000-8000-000000000001', '29b00000-0000-4000-8000-0000000000b1', 300, 'EUR', '2034-11-08', '29f00000-0000-4000-8000-0000000000f1', true, 'QA-29 smeštaj billable'),
  ('29200000-0000-4000-8000-000000000002', '29b00000-0000-4000-8000-0000000000b1', 80, 'EUR', '2034-11-09', '29f00000-0000-4000-8000-0000000000f1', false, 'QA-29 nije billable'),
  ('29200000-0000-4000-8000-000000000003', '29b00000-0000-4000-8000-0000000000b3', 90, 'EUR', '2034-11-09', '29f00000-0000-4000-8000-0000000000f1', true, 'QA-29 drugi klijent');
reset role;

-- ═════════════ T29: nema izdavanja ni numeracije faktura ═════════════
select is((select count(*)::int from information_schema.columns
           where table_schema = 'public' and column_name ~* '(invoice_number|invoice_no|next_invoice|invoice_seq)'), 0,
  'T29 nijedna tabela nema kolonu za broj fakture koji generiše sistem');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname ~* '(invoice_number|next_invoice|create_invoice|issue_invoice|send_invoice)'), 0,
  'T29 nema funkcije za izradu, slanje ni numeraciju faktura');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S' and c.relname ~* 'invoice'), 0,
  'T29 nema sekvence za brojeve faktura');
select has_column('public', 'billing_summaries', 'ext_invoice_reference', 'T29 eksterni račun je samo ručna referenca iz drugog programa');

-- ═════════════ prava: HR i PM ne vide billing ni tarifu klijenta ═════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"29a00000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$insert into public.billing_summaries (client_id, period_start, period_end) values
  ('29c00000-0000-4000-8000-0000000000c1', '2034-11-01', '2034-11-30')$$, '42501', null, 'HR ne pravi obračun (billing.manage)');
select throws_ok($$select default_b2b_rate from public.clients where id = '29c00000-0000-4000-8000-0000000000c1'$$,
  '42501', null, 'HR ne čita clients.default_b2b_rate (column grant)');
select is((select name from public.clients where id = '29c00000-0000-4000-8000-0000000000c1'), 'QA-29 klijent',
  'HR i dalje čita klijenta bez tarife');
select is((select default_b2b_rate from public.client_money where client_id = '29c00000-0000-4000-8000-0000000000c1'), null::numeric,
  'HR: client_money vraća tarifu kao null (bez rates.view_b2b)');
select throws_ok($$select public.set_billing_status('29300000-0000-4000-8000-000000000001', 'ready_for_accounting')$$,
  '42501', null, 'HR ne menja status obračuna');

-- ═════════════ Finance: obračun, preklapanje, status ═════════════
set local request.jwt.claims to '{"sub":"29a00000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select default_b2b_rate from public.client_money where client_id = '29c00000-0000-4000-8000-0000000000c1'), 50.00::numeric,
  'Finance čita tarifu klijenta kroz client_money');
select lives_ok($$update public.clients set default_b2b_rate = 55 where id = '29c00000-0000-4000-8000-0000000000c1'$$,
  'Finance menja tarifu klijenta (billing.manage)');

select lives_ok($$insert into public.billing_summaries (id, client_id, project_id, period_start, period_end, currency) values
  ('29300000-0000-4000-8000-000000000001', '29c00000-0000-4000-8000-0000000000c1', '29b00000-0000-4000-8000-0000000000b1',
   '2034-11-01', '2034-11-30', 'EUR')$$, 'Finance pravi obračun klijent/projekat/period');
select is((select (status, calculated_amount is null)::text from public.billing_summaries where id = '29300000-0000-4000-8000-000000000001'),
  '(in_preparation,t)', 'novi obračun je In Preparation, iznos još nije zamrznut');
select throws_ok($$insert into public.billing_summaries (client_id, period_start, period_end, currency) values
  ('29c00000-0000-4000-8000-0000000000c1', '2034-11-15', '2034-12-15', 'EUR')$$,
  '23P01', null, 'T29 preklopljen period: ceo klijent naspram projekta tog klijenta se odbija');
select throws_ok($$insert into public.billing_summaries (client_id, project_id, period_start, period_end, currency) values
  ('29c00000-0000-4000-8000-0000000000c1', '29b00000-0000-4000-8000-0000000000b1', '2034-11-30', '2034-12-31', 'EUR')$$,
  '23P01', null, 'T29 preklopljen period istog projekta (jedan dan) se odbija');
select lives_ok($$insert into public.billing_summaries (id, client_id, project_id, period_start, period_end, currency) values
  ('29300000-0000-4000-8000-000000000002', '29c00000-0000-4000-8000-0000000000c1', '29b00000-0000-4000-8000-0000000000b2',
   '2034-11-01', '2034-11-30', 'EUR')$$, 'drugi projekat istog klijenta u istom periodu je dozvoljen');
select lives_ok($$insert into public.billing_summaries (id, client_id, project_id, period_start, period_end, currency) values
  ('29300000-0000-4000-8000-000000000003', '29c00000-0000-4000-8000-0000000000c1', '29b00000-0000-4000-8000-0000000000b1',
   '2034-11-01', '2034-11-30', 'RSD')$$, 'ista stavka u drugoj valuti je poseban obračun (valute se ne mešaju)');
select throws_ok($$insert into public.billing_summaries (client_id, project_id, period_start, period_end) values
  ('29c00000-0000-4000-8000-0000000000c2', '29b00000-0000-4000-8000-0000000000b1', '2034-11-01', '2034-11-30')$$,
  '23514', 'Projekat ne pripada izabranom klijentu', 'projekat mora pripadati klijentu obračuna');
select throws_ok($$insert into public.billing_summaries (client_id, period_start, period_end, status) values
  ('29c00000-0000-4000-8000-0000000000c2', '2034-11-01', '2034-11-30', 'invoiced_externally')$$,
  '23514', null, 'obračun ne može nastati odmah kao Invoiced Externally');
select throws_ok($$update public.billing_summaries set status = 'ready_for_accounting' where id = '29300000-0000-4000-8000-000000000001'$$,
  '42501', null, 'T29 direktan update statusa se odbija (samo set_billing_status)');
select throws_ok($$update public.billing_summaries set calculated_amount = 1 where id = '29300000-0000-4000-8000-000000000001'$$,
  '42501', null, 'zamrznut iznos se ne upisuje ručno');
select throws_ok($$update public.billing_summaries set ext_invoice_reference = 'RN-1', ext_invoice_amount = 1000 where id = '29300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'eksterni račun se ne evidentira dok je obračun u pripremi');

-- ═════════════ T15: billable trošak je kandidat, ne prihod ═════════════
select throws_ok($$insert into public.billing_summary_costs (summary_id, project_cost_id) values
  ('29300000-0000-4000-8000-000000000001', '29200000-0000-4000-8000-000000000002')$$,
  '23514', 'Trošak nije označen kao naplativ (Billable to Client)', 'T15 trošak bez oznake billable se ne dodaje');
select throws_ok($$insert into public.billing_summary_costs (summary_id, project_cost_id) values
  ('29300000-0000-4000-8000-000000000001', '29200000-0000-4000-8000-000000000003')$$,
  '23514', 'Trošak ne pripada klijentu ili projektu ovog obračuna', 'T15 trošak drugog klijenta se ne dodaje');
select lives_ok($$insert into public.billing_summary_costs (summary_id, project_cost_id) values
  ('29300000-0000-4000-8000-000000000001', '29200000-0000-4000-8000-000000000001')$$,
  'T15 billable trošak se dodaje u obračun kao zasebna stavka');
select throws_ok($$insert into public.billing_summary_costs (summary_id, project_cost_id) values
  ('29300000-0000-4000-8000-000000000003', '29200000-0000-4000-8000-000000000001')$$,
  '23505', null, 'T15 isti trošak u drugom obračunu se odbija (nema duplog brojanja)');
select throws_ok($$update public.project_costs set billable = false where id = '29200000-0000-4000-8000-000000000001'$$,
  '23514', null, 'T15 trošak u obračunu ne gubi oznaku billable dok je u obračunu');

-- izlazak iz pripreme: zamrzavanje iz labor_day_lines
select is(public.set_billing_status('29300000-0000-4000-8000-000000000001', 'ready_for_accounting', null), 'ready_for_accounting',
  'Finance predaje obračun (In Preparation → Ready for Accounting)');
select is((select (calculated_hours, calculated_amount)::text from public.billing_summaries where id = '29300000-0000-4000-8000-000000000001'),
  '(40.00,2000.00)', 'T15 calculated = 40 h × 50 € × 1.0 = 2000; billable trošak od 300 € NE uvećava B2B prihod');
select is((select (count(*), sum(hours), sum(amount), min(hour_type), min(currency))::text from public.billing_summary_lines
           where summary_id = '29300000-0000-4000-8000-000000000001'),
  '(1,40.00,2000.00,redovni,EUR)', 'linije su grupe pravila zaokruživanja (projekat, radnik, vrsta sati, tarifa, koef.)');
select is((select (status_changed_by, status_changed_at is not null)::text from public.billing_summaries where id = '29300000-0000-4000-8000-000000000001'),
  '(29a00000-0000-4000-8000-000000000002,t)', 'T29 status beleži ko i kada ga je promenio');
select is((select (from_status, to_status, changed_by)::text from public.billing_status_history where summary_id = '29300000-0000-4000-8000-000000000001'),
  '(in_preparation,ready_for_accounting,29a00000-0000-4000-8000-000000000002)', 'T29 istorija statusa ima prelaz i korisnika');
select throws_ok($$delete from public.billing_summary_costs where project_cost_id = '29200000-0000-4000-8000-000000000001'$$,
  '23514', null, 'T15 posle predaje se troškovi obračuna ne menjaju');
select throws_ok($$update public.project_costs set amount = 999 where id = '29200000-0000-4000-8000-000000000001'$$,
  '23514', null, 'trošak u predatom obračunu ne menja iznos');
delete from public.billing_summary_lines where summary_id = '29300000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.billing_summary_lines where summary_id = '29300000-0000-4000-8000-000000000001'), 1,
  'zamrznute linije se ne brišu ručno (nema politike za upis; piše ih samo set_billing_status)');
select throws_ok($$update public.billing_summaries set period_end = '2034-11-29' where id = '29300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'obračun van pripreme ne menja period');
select throws_ok($$select public.set_billing_status('29300000-0000-4000-8000-000000000001', 'invoiced_externally')$$,
  '23514', null, 'preskok statusa (dva koraka) se odbija');
select throws_ok($$select public.set_billing_status('29300000-0000-4000-8000-000000000001', 'in_preparation', '')$$,
  '23514', null, 'vraćanje u pripremu traži razlog');
select is(public.set_billing_status('29300000-0000-4000-8000-000000000001', 'in_preparation', 'Ispravka satnice radnika'), 'in_preparation',
  'Ready for Accounting → In Preparation uz razlog (pre eksternog računa)');
select is((select (calculated_amount is null, (select count(*) from public.billing_summary_lines where summary_id = '29300000-0000-4000-8000-000000000001'))::text
           from public.billing_summaries where id = '29300000-0000-4000-8000-000000000001'),
  '(t,0)', 'u pripremi se zamrznut obračun briše i ponovo računa pri predaji');
select is(public.set_billing_status('29300000-0000-4000-8000-000000000001', 'ready_for_accounting'), 'ready_for_accounting', 'ponovna predaja');
select is(public.set_billing_status('29300000-0000-4000-8000-000000000001', 'sent_to_accounting'), 'sent_to_accounting',
  'Ready → Sent to Accounting (ručna oznaka, bez slanja računa)');

-- ═════════════ T16: eksterni račun 1000 + uplate 400 i 300 → Outstanding 300, Partially Paid ═════════════
select lives_ok($$update public.billing_summaries set ext_invoice_reference = ' 2034-INV-0457 ', ext_invoice_date = '2034-12-02',
  ext_invoice_amount = 1000, ext_due_date = '2034-12-31' where id = '29300000-0000-4000-8000-000000000001'$$,
  'T16 ručni unos reference i iznosa računa iz drugog programa');
select is((select (ext_invoice_reference, ext_invoice_currency)::text from public.billing_summaries where id = '29300000-0000-4000-8000-000000000001'),
  '(2034-INV-0457,EUR)', 'T16 referenca se čuva kako je upisana, valuta računa = valuta obračuna');
select throws_ok($$select public.set_billing_status('29300000-0000-4000-8000-000000000001', 'ready_for_accounting', 'Pokušaj vraćanja')$$,
  '23514', null, 'sa eksternim računom obračun se ne vraća unazad');
select is((select (estimated_unpaid, outstanding, payment_status)::text from public.billing_balances where summary_id = '29300000-0000-4000-8000-000000000001'),
  '(,1000.00,unpaid)', 'T16 bez uplata: Outstanding = 1000, Unpaid (Estimated Unpaid se ne prikazuje uz eksterni iznos)');
select lives_ok($$insert into public.client_payments (id, client_id, billing_summary_id, payment_date, amount, currency, reference) values
  ('29400000-0000-4000-8000-000000000001', '29c00000-0000-4000-8000-0000000000c1', '29300000-0000-4000-8000-000000000001', '2034-12-10', 400, 'EUR', 'Izvod 101')$$,
  'T16 prva delimična uplata 400');
select lives_ok($$insert into public.client_payments (id, billing_summary_id, payment_date, amount, reference) values
  ('29400000-0000-4000-8000-000000000002', '29300000-0000-4000-8000-000000000001', '2034-12-20', 300, 'Izvod 117')$$,
  'T16 druga delimična uplata 300 (klijent, projekat, period i valuta iz obračuna)');
select is((select (invoiced_amount, received_amount, outstanding, payment_status)::text from public.billing_balances where summary_id = '29300000-0000-4000-8000-000000000001'),
  '(1000.00,700.00,300.00,partially_paid)', 'T16 Outstanding = 1000 − 400 − 300 = 300, Partially Paid');
select is((select (project_id, period_start, ext_invoice_reference)::text from public.client_payments where id = '29400000-0000-4000-8000-000000000002'),
  '(29b00000-0000-4000-8000-0000000000b1,2034-11-01,2034-INV-0457)', 'uplata nosi projekat, period i eksternu referencu obračuna');
select throws_ok($$insert into public.client_payments (billing_summary_id, payment_date, amount) values
  ('29300000-0000-4000-8000-000000000001', '2034-12-21', 300.01)$$, '23514', null, 'T16 uplata preko iznosa eksternog računa se odbija');
select throws_ok($$insert into public.client_payments (billing_summary_id, payment_date, amount, currency) values
  ('29300000-0000-4000-8000-000000000001', '2034-12-21', 10, 'RSD')$$, '23514', null, 'uplata u drugoj valuti od računa se odbija');
select throws_ok($$update public.client_payments set amount = 350 where id = '29400000-0000-4000-8000-000000000002'$$,
  '23514', null, 'uplata se ne menja (samo storno)');
select throws_ok($$update public.client_payments set voided_at = now(), void_reason = 'x' where id = '29400000-0000-4000-8000-000000000002'$$,
  '23514', null, 'storno bez razloga se odbija');
select throws_ok($$delete from public.client_payments where id = '29400000-0000-4000-8000-000000000002'$$,
  '23514', 'Uplata se ne briše — stornirajte je uz razlog', 'brisanje uplate se odbija');
select lives_ok($$update public.client_payments set voided_at = now(), void_reason = 'Pogrešan iznos na izvodu' where id = '29400000-0000-4000-8000-000000000002'$$,
  'korekcija = storno uz razlog');
select is((select (received_amount, outstanding, payment_status)::text from public.billing_balances where summary_id = '29300000-0000-4000-8000-000000000001'),
  '(400.00,600.00,partially_paid)', 'stornirana uplata više ne smanjuje Outstanding');
select throws_ok($$update public.billing_summaries set ext_invoice_amount = 350 where id = '29300000-0000-4000-8000-000000000001'$$,
  '23514', null, 'eksterni iznos ne može biti manji od primljenih uplata');

-- ═════════════ audit i prava čitanja ═════════════
reset role;
select ok((select count(*) from public.audit_log where table_name = 'client_payments' and record_id = '29400000-0000-4000-8000-000000000002') >= 2,
  'audit: uplata i njen storno su zabeleženi');
set local role authenticated;
set local request.jwt.claims to '{"sub":"29a00000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.billing_summaries where client_id = '29c00000-0000-4000-8000-0000000000c1')
          + (select count(*)::int from public.client_payments where client_id = '29c00000-0000-4000-8000-0000000000c1'), 0,
  'PM ne vidi obračune ni uplate klijenta');
reset role;

select * from finish();
rollback;
