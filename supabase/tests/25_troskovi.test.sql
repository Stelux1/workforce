-- Testovi za Project Costs C1 + C2 (migracija 20261125050000_troskovi_c1.sql, spec §8, T13, T14, T15, T28, rizik R9).
-- Pravila u bazi: obavezna polja, kategorija i podkategorija, valute i datum kursa, kategorija trošak-rada,
-- radnik ILI dobavljač, preimenovanje kategorije, prava (HR nema pristup, PM samo svoje projekte), audit.
-- Sopstveni podaci sa oznakom QA-25; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('25a00000-0000-4000-8000-000000000001', 'qa25-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('25a00000-0000-4000-8000-000000000002', 'qa25-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('25a00000-0000-4000-8000-000000000003', 'qa25-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('25a00000-0000-4000-8000-000000000004', 'qa25-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '25a00000-0000-4000-8000-000000000001';
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned' where id = '25a00000-0000-4000-8000-000000000002';
update public.profiles set role = 'hr', active = true where id = '25a00000-0000-4000-8000-000000000003';
update public.profiles set role = 'finance', active = true where id = '25a00000-0000-4000-8000-000000000004';

insert into public.projects (id, name, client_name) values
  ('25b00000-0000-4000-8000-0000000000b1', 'QA-25 projekat 1', 'QA-25 klijent'),
  ('25b00000-0000-4000-8000-0000000000b2', 'QA-25 projekat 2', 'QA-25 klijent');
insert into public.user_project_access (user_id, project_id) values
  ('25a00000-0000-4000-8000-000000000002', '25b00000-0000-4000-8000-0000000000b1');

insert into public.cost_categories (id, name, subcategories, payroll_linked) values
  ('25c00000-0000-4000-8000-0000000000c1', 'QA-25 smeštaj', '[{"name": "Apartment Rental"}, {"name": "Utilities"}, "Stari zapis"]', false),
  ('25c00000-0000-4000-8000-0000000000c2', 'QA-25 razno', '[]', false),
  ('25c00000-0000-4000-8000-0000000000c3', 'QA-25 trošak rada', '[]', true);
insert into public.employees (id, first_name, last_name) values
  ('25d00000-0000-4000-8000-0000000000d1', 'QA-25', 'Radnik');
insert into public.vendors (id, name) values
  ('25e00000-0000-4000-8000-0000000000e1', 'QA-25 dobavljač');

-- Stari trošak (pre migracije): bez kategorije, RSD sa kursom, ali bez datuma kursa. Trigeri se isključuju samo za ovaj upis.
alter table public.project_costs disable trigger user;
insert into public.project_costs (id, project_id, amount, currency, eur_rsd_rate, eur_amount, category, cost_date) values
  ('25f00000-0000-4000-8000-000000000099', '25b00000-0000-4000-8000-0000000000b1', 11720, 'RSD', 117.2, 100, 'materials', '2026-10-01');
alter table public.project_costs enable trigger user;

-- ───── admin: pravila baze ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"25a00000-0000-4000-8000-000000000001","role":"authenticated"}';

-- obavezna polja
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '25c00000-0000-4000-8000-0000000000c2')$$,
  '23514', 'Datum troška je obavezan', 'T-C: trošak bez cost_date se odbija');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '2026-11-10')$$,
  '23514', 'Kategorija troška je obavezna', 'T-C: trošak bez kategorije se odbija');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', null, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2')$$,
  '23514', 'Iznos troška je obavezan', 'T-C: trošak bez iznosa se odbija');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', -5, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2')$$,
  '23514', null, 'T-C: negativan iznos se odbija');

-- potkategorija
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c1')$$,
  '23514', 'Podkategorija je obavezna za kategoriju QA-25 smeštaj', 'T-C: podkategorija je obavezna kad je kategorija ima');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id, subcategory) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c1', 'Nepostojeća')$$,
  '23514', 'Podkategorija „Nepostojeća" ne postoji u kategoriji QA-25 smeštaj', 'T-C: podkategorija mora postojati u kategoriji');
select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id, subcategory, description) values
  ('25f00000-0000-4000-8000-000000000001', '25b00000-0000-4000-8000-0000000000b1', 250.50, 'EUR', '2026-11-10',
   '25c00000-0000-4000-8000-0000000000c1', ' utilities ', 'Struja novembar')$$,
  'T-C: ispravan trošak sa potkategorijom se prima (naziv se poredi bez razlike u velikim slovima)');
select is((select (category, subcategory)::text from public.project_costs where id = '25f00000-0000-4000-8000-000000000001'),
  '("QA-25 smeštaj",Utilities)', 'T-C: category je snimak naziva kategorije, a podkategorija ima naziv iz kategorije');
select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id, subcategory) values
  ('25f00000-0000-4000-8000-000000000002', '25b00000-0000-4000-8000-0000000000b1', 40, 'EUR', '2026-11-11',
   '25c00000-0000-4000-8000-0000000000c1', 'Stari zapis')$$,
  'T-C: podkategorija zapisana kao običan tekst (stari zapis) takođe važi');
select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id, subcategory) values
  ('25f00000-0000-4000-8000-000000000003', '25b00000-0000-4000-8000-0000000000b1', 12.30, 'EUR', '2026-11-12',
   '25c00000-0000-4000-8000-0000000000c2', 'ignoriše se')$$,
  'T-C: kategorija bez podkategorija ne traži podkategoriju');
select is((select subcategory from public.project_costs where id = '25f00000-0000-4000-8000-000000000003'), null::text,
  'T-C: kategorija bez podkategorija ne čuva podkategoriju');

-- trošak rada ide kroz Timesheets/Payroll
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c3')$$,
  '23514', 'Trošak rada ide kroz Timesheets/Payroll', 'T-C: kategorija payroll_linked se odbija pri unosu');
select throws_ok($$update public.project_costs set cost_category_id = '25c00000-0000-4000-8000-0000000000c3'
  where id = '25f00000-0000-4000-8000-000000000003'$$,
  '23514', 'Trošak rada ide kroz Timesheets/Payroll', 'T-C: ni pri prebacivanju postojećeg troška u kategoriju payroll_linked');

-- valute, kurs i datum kursa (K3)
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id, eur_rsd_rate) values
  ('25b00000-0000-4000-8000-0000000000b1', 5000, 'RSD', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', 117.2)$$,
  '23514', 'Trošak u RSD mora imati datum kursa', 'T-C: RSD bez fx_rate_date se odbija');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id, fx_rate_date) values
  ('25b00000-0000-4000-8000-0000000000b1', 5000, 'RSD', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', '2026-11-01')$$,
  '23514', 'Trošak u RSD mora imati kurs veći od 0 (koliko RSD vredi 1 EUR)', 'T-C: RSD bez kursa se odbija');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id, eur_rsd_rate, fx_rate_date) values
  ('25b00000-0000-4000-8000-0000000000b1', 100, 'CHF', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', 0.95, '2026-11-01')$$,
  '23514', null, 'T-C: valuta van EUR/RSD/GBP/USD se odbija');
insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id, eur_rsd_rate, fx_rate_date) values
  ('25f00000-0000-4000-8000-000000000004', '25b00000-0000-4000-8000-0000000000b1', 11720, 'RSD', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', 117.2, '2026-11-01'),
  ('25f00000-0000-4000-8000-000000000005', '25b00000-0000-4000-8000-0000000000b1', 50, 'GBP', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', 0.86, '2026-11-02'),
  ('25f00000-0000-4000-8000-000000000006', '25b00000-0000-4000-8000-0000000000b1', 60, 'USD', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2', 1.08, '2026-11-02');
select is((select (eur_amount, fx_rate_date)::text from public.project_costs where id = '25f00000-0000-4000-8000-000000000004'),
  '(100.00,2026-11-01)', 'T-C: RSD sa kursom i datumom kursa — baza računa EUR iznos (11.720 / 117,2 = 100 €)');
select is((select eur_amount from public.project_costs where id = '25f00000-0000-4000-8000-000000000005'), 58.14::numeric,
  'T28: GBP se preračunava po svom kursu (50 / 0,86 = 58,14 €)');
select is((select eur_amount from public.project_costs where id = '25f00000-0000-4000-8000-000000000006'), 55.56::numeric,
  'T28: USD se preračunava po svom kursu (60 / 1,08 = 55,56 €)');
update public.project_costs set fx_rate_date = '2026-11-05', eur_rsd_rate = 120 where id = '25f00000-0000-4000-8000-000000000004';
select is((select (eur_amount, fx_rate_date)::text from public.project_costs where id = '25f00000-0000-4000-8000-000000000004'),
  '(97.67,2026-11-05)', 'T-C: izmena kursa i datuma kursa preračunava EUR iznos (11.720 / 120 = 97,67 €)');
select throws_ok($$update public.project_costs set fx_rate_date = null where id = '25f00000-0000-4000-8000-000000000004'$$,
  '23514', 'Trošak u RSD mora imati datum kursa', 'T-C: datum kursa ne može da se obriše sa troška van EUR');
update public.project_costs set currency = 'EUR' where id = '25f00000-0000-4000-8000-000000000006';
select is((select (eur_amount, eur_rsd_rate, fx_rate_date)::text from public.project_costs where id = '25f00000-0000-4000-8000-000000000006'),
  '(60.00,,)', 'T-C: trošak prebačen u EUR: eur_amount = iznos, kurs i datum kursa se brišu');

-- R9: stari trošak ostaje, ali se pri izmeni traži kategorija; datum kursa tek kad se menja kurs/iznos/valuta
select is((select eur_amount from public.project_costs where id = '25f00000-0000-4000-8000-000000000099'), 100.00::numeric,
  'R9: stari RSD trošak bez datuma kursa ostaje kakav je');
select throws_ok($$update public.project_costs set notes = 'napomena' where id = '25f00000-0000-4000-8000-000000000099'$$,
  '23514', 'Kategorija troška je obavezna', 'R9: izmena starog troška bez kategorije traži kategoriju');
select lives_ok($$update public.project_costs set notes = 'napomena', cost_category_id = '25c00000-0000-4000-8000-0000000000c2'
  where id = '25f00000-0000-4000-8000-000000000099'$$,
  'R9: sa kategorijom izmena prolazi (kurs i iznos se ne diraju, datum kursa još nije obavezan)');
select throws_ok($$update public.project_costs set amount = 12000 where id = '25f00000-0000-4000-8000-000000000099'$$,
  '23514', 'Trošak u RSD mora imati datum kursa', 'R9: izmena iznosa starog RSD troška traži datum kursa');
select is((select category from public.project_costs where id = '25f00000-0000-4000-8000-000000000099'), 'QA-25 razno',
  'R9: kategorija stare vrste („materials") je zamenjena snimkom izabrane kategorije');

-- radnik ILI dobavljač
select lives_ok($$update public.project_costs set employee_id = '25d00000-0000-4000-8000-0000000000d1', billable = true
  where id = '25f00000-0000-4000-8000-000000000001'$$,
  'T14: trošak se vezuje za radnika, uz oznaku billable');
select throws_ok($$update public.project_costs set vendor_id = '25e00000-0000-4000-8000-0000000000e1'
  where id = '25f00000-0000-4000-8000-000000000001'$$,
  '23514', null, 'T-C: trošak ne može imati i radnika i dobavljača');
select lives_ok($$update public.project_costs set employee_id = null, vendor_id = '25e00000-0000-4000-8000-0000000000e1'
  where id = '25f00000-0000-4000-8000-000000000001'$$,
  'T-C: trošak se vezuje za dobavljača umesto radnika');

-- T13: isti trošak je jedan red za oba pogleda
select is((select count(*)::int from public.project_costs where id = '25f00000-0000-4000-8000-000000000001'), 1,
  'T13: trošak dodat u projektu postoji jednom (jedna tabela za Project → Costs i Project Costs)');
select is((select count(*)::int from public.project_costs where project_id = '25b00000-0000-4000-8000-0000000000b1'
            and id = '25f00000-0000-4000-8000-000000000001'),
  (select count(*)::int from public.project_costs where id = '25f00000-0000-4000-8000-000000000001'),
  'T13: pogled po projektu i centralni pogled vide isti red');

-- T15: billable je samo oznaka — iznosi i zbir se ne menjaju
select is((select (amount, eur_amount, currency, billable)::text from public.project_costs where id = '25f00000-0000-4000-8000-000000000001'),
  '(250.50,250.50,EUR,t)', 'T15: billable ne menja iznos ni EUR iznos (nema stavke računa ni prihoda)');

-- preimenovanje kategorije
select is((select (count(*), sum(amount))::text from public.project_costs where cost_category_id = '25c00000-0000-4000-8000-0000000000c1'),
  '(2,290.50)', 'preimenovanje: zbir po cost_category_id pre izmene (250,50 + 40)');
update public.cost_categories set name = 'QA-25 smeštaj i boravak' where id = '25c00000-0000-4000-8000-0000000000c1';
select is((select (count(*), sum(amount))::text from public.project_costs where cost_category_id = '25c00000-0000-4000-8000-0000000000c1'),
  '(2,290.50)', 'T-C: preimenovanje kategorije ne menja zbir po cost_category_id');
select is((select count(*)::int from public.project_costs where cost_category_id = '25c00000-0000-4000-8000-0000000000c1'
            and category = 'QA-25 smeštaj i boravak'), 2, 'T-C: snimak naziva kategorije u troškovima je osvežen');

-- kategorija u upotrebi se ne briše
select throws_ok($$delete from public.cost_categories where id = '25c00000-0000-4000-8000-0000000000c2'$$,
  '23503', null, 'T-C: kategorija sa troškovima ne može da se obriše');

-- audit (01): izmene troška se beleže
reset role;
select ok((select count(*) from public.audit_log where table_name = 'project_costs'
            and record_id = '25f00000-0000-4000-8000-000000000001' and action = 'update') >= 2,
  'T-C: izmene troška su u audit_log (History kartica)');
select is((select count(*)::int from public.audit_log where table_name = 'project_costs'
            and record_id = '25f00000-0000-4000-8000-000000000001' and action = 'insert'), 1,
  'T-C: unos troška je u audit_log jednom');

-- ───── prava ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"25a00000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.project_costs), 0, 'T-C: HR ne vidi nijedan trošak');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b1', 10, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2')$$,
  '42501', null, 'T-C: HR ne unosi trošak');

set local request.jwt.claims to '{"sub":"25a00000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(distinct project_id)::int from public.project_costs), 1,
  'T-C: Project Manager vidi troškove samo svojih projekata');
select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id) values
  ('25f00000-0000-4000-8000-000000000007', '25b00000-0000-4000-8000-0000000000b1', 15, 'EUR', '2026-11-13', '25c00000-0000-4000-8000-0000000000c2')$$,
  'T-C: Project Manager unosi trošak na svom projektu');
select throws_ok($$insert into public.project_costs (project_id, amount, currency, cost_date, cost_category_id) values
  ('25b00000-0000-4000-8000-0000000000b2', 10, 'EUR', '2026-11-10', '25c00000-0000-4000-8000-0000000000c2')$$,
  '42501', null, 'T-C: Project Manager ne unosi trošak na tuđem projektu');

set local request.jwt.claims to '{"sub":"25a00000-0000-4000-8000-000000000004","role":"authenticated"}';
select ok((select count(*) from public.project_costs) >= 7, 'T-C: Finance vidi troškove svih projekata');
select lives_ok($$insert into public.project_costs (id, project_id, amount, currency, cost_date, cost_category_id) values
  ('25f00000-0000-4000-8000-000000000008', '25b00000-0000-4000-8000-0000000000b2', 22, 'EUR', '2026-11-14', '25c00000-0000-4000-8000-0000000000c2')$$,
  'T-C: Finance unosi trošak na svakom projektu');
select lives_ok($$delete from public.project_costs where id = '25f00000-0000-4000-8000-000000000008'$$,
  'T-C: Finance briše trošak');

-- anon nema pristup (D14)
set local role anon;
select throws_ok($$select count(*) from public.project_costs$$, '42501', null, 'D14: anon ne čita troškove');

select * from finish();
rollback;
