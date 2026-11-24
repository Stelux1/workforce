-- Testovi za Podatke firme (migracije 20261114210000_podaci_firme.sql i 20261124120000_adrese_firme_projekta.sql).
-- Jedan red, Tax ID slobodnog formata (bez srpske provere PIB-a), ZIP, matični broj 8 cifara, operater samo čita;
-- projekat ima adresu u tri polja. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, instance_id, aud, role) values
  ('77111111-1111-4111-8111-111111111111', 'qa7-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('77222222-2222-4222-8222-222222222222', 'qa7-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '77111111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = '77222222-2222-4222-8222-222222222222';

-- Početno stanje: tačno jedan red i svi podaci prazni (nikakvi izmišljeni podaci firme).
select is((select count(*)::int from public.company_settings), 1, 'postoji tačno jedan red');
select ok((select name is null and tax_id is null and registration_number is null and address is null
                  and zip is null and city is null and bank_account is null and logo_url is null from public.company_settings),
          'podaci firme počinju prazni');

-- Samo jedan red.
select throws_ok($$insert into public.company_settings (id) values (false)$$, '23514', null, 'id=false je odbijen (check)');
select throws_ok($$insert into public.company_settings (id) values (true)$$, '23505', null, 'drugi red sa id=true je odbijen (primarni ključ)');

-- PIB je postao Tax ID (kolona preimenovana, vrednost se ne gubi); slobodan format, razumna dužina (kao postgres).
select hasnt_column('public', 'company_settings', 'pib', 'kolona pib više ne postoji');
select has_column('public', 'company_settings', 'tax_id', 'kolona tax_id postoji');
select lives_ok($$update public.company_settings set tax_id = 'SK2020123456'$$, 'slovački Tax ID (slova i cifre) prolazi');
select lives_ok($$update public.company_settings set tax_id = '12345678'$$, 'Tax ID sa 8 cifara prolazi (nema više provere 9 cifara)');
select throws_ok($$update public.company_settings set tax_id = repeat('1', 31)$$, '23514', null, 'Tax ID duži od 30 znakova je odbijen');
select lives_ok($$update public.company_settings set zip = '821 06'$$, 'ZIP sa razmakom prolazi');
select throws_ok($$update public.company_settings set zip = repeat('1', 13)$$, '23514', null, 'ZIP duži od 12 znakova je odbijen');
select throws_ok($$update public.company_settings set registration_number = '123456789'$$, '23514', null, 'matični broj sa 9 cifara je odbijen');

-- Operater čita, ne menja.
set local role authenticated;
set local request.jwt.claims to '{"sub":"77222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.company_settings), 1, 'operater čita podatke firme');
update public.company_settings set name = 'QA-7 operater';
select is((select count(*)::int from public.company_settings where name = 'QA-7 operater'), 0, 'operater ne može da menja (RLS ne menja nijedan red)');
reset role;

-- Admin menja; ispravni brojevi prolaze.
set local role authenticated;
set local request.jwt.claims to '{"sub":"77111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.company_settings set name = 'QA-7 firma', tax_id = 'SK2020123456', registration_number = '12345678', zip = '821 06';
select is((select name from public.company_settings), 'QA-7 firma', 'admin menja naziv');
select is((select tax_id || '/' || registration_number || '/' || zip from public.company_settings), 'SK2020123456/12345678/821 06',
          'admin upisuje Tax ID, matični broj i ZIP');
reset role;
-- anon nema pristup tabeli
set local role anon;
select throws_ok($$select * from public.company_settings$$, '42501', null, 'anon ne čita podatke firme');
reset role;

-- Projekat: adresa u tri polja (Address, ZIP, City).
select ok((select count(*) = 3 from information_schema.columns
            where table_schema = 'public' and table_name = 'projects' and column_name in ('address', 'zip', 'city')),
          'projekat ima kolone address, zip i city');

select * from finish();
rollback;
