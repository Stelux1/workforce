-- Ugovori vendora i povezani radnici (migracija 20261125180000_ugovori_vendora.sql, spec §11 / 11.02, §4 Vendors).
-- vendor_contracts: prava po §4 (Admin/HR/Finance RW, PM R), bez preklapanja aktivnih perioda istog vendora,
-- provere datuma/roka/valute, audit; vendor_worker_counts: aktivni danas i ukupno; D14 ništa anon-u. Rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('93700000-0000-4000-8000-0000000000a1', 'qa37-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('93700000-0000-4000-8000-0000000000a2', 'qa37-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('93700000-0000-4000-8000-0000000000a3', 'qa37-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('93700000-0000-4000-8000-0000000000a4', 'qa37-bivsi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'hr', active = true where id = '93700000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'finance', active = true where id = '93700000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all' where id = '93700000-0000-4000-8000-0000000000a3';
update public.profiles set role = 'hr', active = false where id = '93700000-0000-4000-8000-0000000000a4';

insert into public.vendors (id, name) values
  ('e3700000-0000-4000-8000-0000000000e1', 'QA-37 Vendor d.o.o.'),
  ('e3700000-0000-4000-8000-0000000000e2', 'QA-37 Drugi vendor');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d3700000-0000-4000-8000-0000000000d1', 'QA-37', 'Aktivni', 'QA-37-001'),
  ('d3700000-0000-4000-8000-0000000000d2', 'QA-37', 'Drugi aktivni', 'QA-37-002'),
  ('d3700000-0000-4000-8000-0000000000d3', 'QA-37', 'Bivši', 'QA-37-003'),
  ('d3700000-0000-4000-8000-0000000000d4', 'QA-37', 'Budući', 'QA-37-004');
-- Dva aktivna danas, jedan završen angažman, jedan tek počinje (nije aktivan danas).
insert into public.employment_history (employee_id, engagement_type, vendor_id, start_date, end_date, status) values
  ('d3700000-0000-4000-8000-0000000000d1', 'subcontractor_worker', 'e3700000-0000-4000-8000-0000000000e1', current_date - 60, null, 'active'),
  ('d3700000-0000-4000-8000-0000000000d2', 'subcontractor_worker', 'e3700000-0000-4000-8000-0000000000e1', current_date - 10, current_date + 30, 'active'),
  ('d3700000-0000-4000-8000-0000000000d3', 'subcontractor_worker', 'e3700000-0000-4000-8000-0000000000e1', current_date - 400, current_date - 200, 'ended'),
  ('d3700000-0000-4000-8000-0000000000d4', 'subcontractor_worker', 'e3700000-0000-4000-8000-0000000000e1', current_date + 5, null, 'active');

-- ═════════════════════════════ D14: anon ═════════════════════════════
select ok(not has_table_privilege('anon', 'public.vendor_contracts', 'select'), 'D14: anon ne čita vendor_contracts');
select ok(not has_table_privilege('anon', 'public.vendor_contracts', 'insert'), 'D14: anon ne upisuje vendor_contracts');
select ok(not has_table_privilege('anon', 'public.vendor_worker_counts', 'select'), 'D14: anon ne čita vendor_worker_counts');
select ok((select relrowsecurity from pg_class where oid = 'public.vendor_contracts'::regclass), 'RLS uključen na vendor_contracts');

-- ═════════════════════════════ HR (employees.manage) upisuje ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"93700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$insert into public.vendor_contracts (id, vendor_id, reference, start_date, end_date, payment_terms_days, currency)
  values ('c3700000-0000-4000-8000-0000000000c1', 'e3700000-0000-4000-8000-0000000000e1', 'QA-37/2036-1', '2036-01-01', '2036-12-31', 30, 'EUR')$$,
  '§11: HR upisuje ugovorni period vendora');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, end_date)
  values ('e3700000-0000-4000-8000-0000000000e1', 'QA-37/2036-2', '2036-06-01', '2037-05-31')$$,
  '23P01', null, 'dva aktivna ugovora istog vendora ne smeju da se preklapaju');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date)
  values ('e3700000-0000-4000-8000-0000000000e1', 'QA-37/otvoren', '2036-03-01')$$,
  '23P01', null, 'ugovor bez kraja se preklapa sa aktivnim koji pokriva početak');
select lives_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, end_date)
  values ('e3700000-0000-4000-8000-0000000000e1', 'QA-37/2037', '2037-01-01', null)$$,
  'sledeći period odmah posle prethodnog je dozvoljen');
select lives_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, end_date, status)
  values ('e3700000-0000-4000-8000-0000000000e1', 'QA-37/stari', '2036-02-01', '2036-04-30', 'cancelled')$$,
  'otkazan ugovor ostaje u istoriji i ne blokira aktivni period');
select lives_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, end_date)
  values ('e3700000-0000-4000-8000-0000000000e2', 'QA-37/drugi', '2036-01-01', '2036-12-31')$$,
  'isti period kod drugog vendora je dozvoljen');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, end_date)
  values ('e3700000-0000-4000-8000-0000000000e2', 'QA-37/datumi', '2040-05-01', '2040-04-01')$$,
  '23514', null, 'kraj pre početka je odbijen');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, payment_terms_days)
  values ('e3700000-0000-4000-8000-0000000000e2', 'QA-37/rok', '2041-01-01', 400)$$,
  '23514', null, 'rok plaćanja van 0–365 dana je odbijen');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date, currency)
  values ('e3700000-0000-4000-8000-0000000000e2', 'QA-37/valuta', '2042-01-01', 'CHF')$$,
  '23514', null, 'nepodržana valuta je odbijena');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date)
  values ('e3700000-0000-4000-8000-0000000000e2', '   ', '2043-01-01')$$,
  '23514', null, 'referenca ugovora je obavezna');
-- Završavanje aktivnog ugovora oslobađa period (status ended se ne proverava na preklapanje).
select lives_ok($$update public.vendor_contracts set status = 'ended' where id = 'c3700000-0000-4000-8000-0000000000c1'$$,
  'HR završava ugovor');

select throws_ok($$delete from public.vendors where id = 'e3700000-0000-4000-8000-0000000000e2'$$,
  '23503', null, 'vendor sa ugovorima se ne briše (istorija ugovora ostaje; postavlja se na Neaktivan)');

-- ═════════════════════════════ Finance (engagement.manage) menja ═════════════════════════════
set local request.jwt.claims to '{"sub":"93700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$update public.vendor_contracts set notes = 'QA-37 napomena Finance' where id = 'c3700000-0000-4000-8000-0000000000c1'$$,
  '§4: Finance menja ugovor vendora');
select is((select notes from public.vendor_contracts where id = 'c3700000-0000-4000-8000-0000000000c1'), 'QA-37 napomena Finance',
  'izmena Finance je sačuvana');

-- ═════════════════════════════ PM čita, ne menja ═════════════════════════════
set local request.jwt.claims to '{"sub":"93700000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.vendor_contracts where vendor_id = 'e3700000-0000-4000-8000-0000000000e1'), 3,
  '§4: PM čita ugovore vendora');
select throws_ok($$insert into public.vendor_contracts (vendor_id, reference, start_date)
  values ('e3700000-0000-4000-8000-0000000000e2', 'QA-37/pm', '2045-01-01')$$,
  '42501', null, '§4: PM ne upisuje ugovor vendora (RLS)');
update public.vendor_contracts set notes = 'PM pokušaj' where id = 'c3700000-0000-4000-8000-0000000000c1';
select is((select notes from public.vendor_contracts where id = 'c3700000-0000-4000-8000-0000000000c1'), 'QA-37 napomena Finance',
  '§4: PM izmena ne prolazi (0 redova)');

-- ═════════════════════════════ povezani radnici ═════════════════════════════
select is((select active_workers from public.vendor_worker_counts where vendor_id = 'e3700000-0000-4000-8000-0000000000e1'), 2,
  '§11: aktivni radnici vendora = angažmani koji danas važe (završen i budući se ne broje)');
select is((select total_workers from public.vendor_worker_counts where vendor_id = 'e3700000-0000-4000-8000-0000000000e1'), 4,
  '§11: ukupno povezanih radnika vendora');

-- Neaktivan nalog ne dobija ni ugovore ni brojeve.
set local request.jwt.claims to '{"sub":"93700000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from public.vendor_contracts where vendor_id = 'e3700000-0000-4000-8000-0000000000e1')
        + (select count(*)::int from public.vendor_worker_counts where vendor_id = 'e3700000-0000-4000-8000-0000000000e1'), 0,
  'neaktivan nalog ne čita ugovore ni povezane radnike');

-- ═════════════════════════════ audit ═════════════════════════════
reset role;
set local request.jwt.claims to '{}';
select is((select count(*)::int from public.audit_log
           where table_name = 'vendor_contracts' and record_id = 'c3700000-0000-4000-8000-0000000000c1'), 3,
  'audit: upis, završavanje i izmena ugovora su zabeleženi (PM pokušaj nije)');

select * from finish();
rollback;
