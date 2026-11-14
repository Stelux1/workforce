-- Testovi za kurs i EUR iznos troškova projekta (migracija 20261114220000_troskovi_kurs.sql, D2, D8).
-- Baza računa eur_amount (EUR = iznos; RSD = round(iznos / kurs, 2), pola od nule) i ne prima trošak van EUR bez kursa > 0.
-- Sopstveni podaci sa oznakom QA-6; sve se vraća (rollback).
--
-- PARITET SA costs.js: isti primeri kao blok „isti primer kao pgTAP 06" u src/lib/payroll/payroll.test.js —
-- 11.720 RSD / 117,2 = 100 €; 131,85 / 117,2 = 1,125 → 1,13 €; 131,84 / 117,2 → 1,12 €; 10.000 / 117,1234 = 85,38 €.
-- Ako se promeni jedan fajl, mora i drugi.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('96111111-1111-4111-8111-111111111111', 'qa6-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('96222222-2222-4222-8222-222222222222', 'qa6-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '96111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '96222222-2222-4222-8222-222222222222';

insert into public.projects (id, name, client_name) values
  ('b9600000-0000-4000-8000-0000000000b1', 'QA-6 projekat troškova', 'QA-6 klijent');

-- Postojeći redovi posle migracije: svaki EUR trošak ima eur_amount = iznos.
select is((select count(*)::int from public.project_costs where currency = 'EUR' and eur_amount is distinct from amount), 0,
  'migracija: svaki EUR trošak ima eur_amount = iznos');

-- Stari trošak u RSD bez kursa (kakav je mogao postojati pre migracije) — trigger se isključuje samo za ovaj upis.
alter table public.project_costs disable trigger project_costs_guard;
insert into public.project_costs (id, project_id, amount, currency, category) values
  ('e9600000-0000-4000-8000-000000000009', 'b9600000-0000-4000-8000-0000000000b1', 12000, 'RSD', 'QA-6 stari');
alter table public.project_costs enable trigger project_costs_guard;

-- ───── admin unosi troškove ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"96111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, eur_rsd_rate, eur_amount, category) values
  ('e9600000-0000-4000-8000-000000000001', 'b9600000-0000-4000-8000-0000000000b1', 250.50, 'EUR', 117.2, 999, 'QA-6')$$,
  'EUR trošak se prima');
select is((select (eur_rsd_rate, eur_amount)::text from public.project_costs where id = 'e9600000-0000-4000-8000-000000000001'),
  '(,250.50)', 'EUR: eur_amount = iznos, kurs se ne čuva (poslat eur_amount 999 se ignoriše)');

insert into public.project_costs (id, project_id, amount, currency, eur_rsd_rate, eur_amount, category) values
  ('e9600000-0000-4000-8000-000000000002', 'b9600000-0000-4000-8000-0000000000b1', 11720, 'RSD', 117.2, 1, 'QA-6'),
  ('e9600000-0000-4000-8000-000000000003', 'b9600000-0000-4000-8000-0000000000b1', 131.85, 'RSD', 117.2, null, 'QA-6'),
  ('e9600000-0000-4000-8000-000000000004', 'b9600000-0000-4000-8000-0000000000b1', 131.84, 'RSD', 117.2, null, 'QA-6'),
  ('e9600000-0000-4000-8000-000000000005', 'b9600000-0000-4000-8000-0000000000b1', 10000, 'RSD', 117.1234, null, 'QA-6');
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000002'), 100.00::numeric,
  '11.720 RSD po kursu 117,2 = 100 € (poslat eur_amount 1 se ignoriše)');
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000003'), 1.13::numeric,
  '131,85 RSD / 117,2 = tačno 1,125 € → 1,13 € (pola od nule, kao round2)');
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000004'), 1.12::numeric,
  '131,84 RSD / 117,2 → 1,12 €');
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000005'), 85.38::numeric,
  '10.000 RSD po kursu 117,1234 = 85,38 €');

select throws_ok($$insert into public.project_costs (project_id, amount, currency, category) values
  ('b9600000-0000-4000-8000-0000000000b1', 5000, 'RSD', 'QA-6')$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'trošak u RSD bez kursa se ne prima');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, eur_rsd_rate, category) values
  ('b9600000-0000-4000-8000-0000000000b1', 5000, 'RSD', 0, 'QA-6')$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'ni sa kursom 0');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, eur_rsd_rate, category) values
  ('b9600000-0000-4000-8000-0000000000b1', 5000, 'RSD', -117.2, 'QA-6')$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'ni sa negativnim kursom');

-- ───── izmene: baza uvek preračunava ─────
update public.project_costs set amount = 23440 where id = 'e9600000-0000-4000-8000-000000000002';
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000002'), 200.00::numeric,
  'promena iznosa preračunava EUR (23.440 / 117,2 = 200 €)');
update public.project_costs set eur_rsd_rate = 120 where id = 'e9600000-0000-4000-8000-000000000002';
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000002'), 195.33::numeric,
  'promena kursa preračunava EUR (23.440 / 120 = 195,33 €)');
update public.project_costs set eur_amount = 1 where id = 'e9600000-0000-4000-8000-000000000002';
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000002'), 195.33::numeric,
  'eur_amount poslat sa ekrana se ignoriše i pri izmeni');
select throws_ok($$update public.project_costs set eur_rsd_rate = null where id = 'e9600000-0000-4000-8000-000000000002'$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'kurs ne može da se obriše sa troška u RSD');
update public.project_costs set currency = 'EUR' where id = 'e9600000-0000-4000-8000-000000000004';
select is((select (eur_rsd_rate, eur_amount)::text from public.project_costs where id = 'e9600000-0000-4000-8000-000000000004'),
  '(,131.84)', 'trošak prebačen u EUR: eur_amount = iznos, kurs se briše');

-- ───── stari trošak u RSD bez kursa ─────
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000009'), null::numeric,
  'stari RSD trošak bez kursa nema EUR iznos (nije 0)');
select is((select (sum(eur_amount), count(*) filter (where eur_amount is null))::text
           from public.project_costs where project_id = 'b9600000-0000-4000-8000-0000000000b1'),
  '(664.18,1)', 'zbir u EUR projekta: 250,50 + 195,33 + 1,13 + 131,84 + 85,38 = 664,18 €; RSD bez kursa nije u zbiru, broji se posebno');
select throws_ok($$update public.project_costs set notes = 'QA-6 napomena' where id = 'e9600000-0000-4000-8000-000000000009'$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'izmena starog RSD troška traži kurs');
select lives_ok($$update public.project_costs set eur_rsd_rate = 117.2, notes = 'QA-6 kurs upisan' where id = 'e9600000-0000-4000-8000-000000000009'$$,
  'stari RSD trošak dobija kurs pri izmeni');
select is((select eur_amount from public.project_costs where id = 'e9600000-0000-4000-8000-000000000009'), 102.39::numeric,
  'i tada EUR iznos (12.000 / 117,2 = 102,39 €)');
select lives_ok($$delete from public.project_costs where id = 'e9600000-0000-4000-8000-000000000005'$$,
  'trošak u RSD može da se obriše');

-- ───── operater nema pristup troškovima (D3) ─────
set local request.jwt.claims to '{"sub":"96222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$insert into public.project_costs (project_id, amount, currency, eur_rsd_rate) values
  ('b9600000-0000-4000-8000-0000000000b1', 1000, 'RSD', 117.2)$$,
  '42501', null, 'operater ne unosi troškove ni sa kursom');

select * from finish();
rollback;
