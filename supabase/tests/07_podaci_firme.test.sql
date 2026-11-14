-- Testovi za Podatke firme (migracija 20261114210000_podaci_firme.sql).
-- Jedan red, PIB 9 cifara, matični broj 8 cifara, operater samo čita. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, instance_id, aud, role) values
  ('77111111-1111-4111-8111-111111111111', 'qa7-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('77222222-2222-4222-8222-222222222222', 'qa7-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '77111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '77222222-2222-4222-8222-222222222222';

-- Početno stanje: tačno jedan red i svi podaci prazni (nikakvi izmišljeni podaci firme).
select is((select count(*)::int from public.company_settings), 1, 'postoji tačno jedan red');
select ok((select name is null and pib is null and registration_number is null and address is null
                  and city is null and bank_account is null and logo_url is null from public.company_settings),
          'podaci firme počinju prazni');

-- Samo jedan red.
select throws_ok($$insert into public.company_settings (id) values (false)$$, '23514', null, 'id=false je odbijen (check)');
select throws_ok($$insert into public.company_settings (id) values (true)$$, '23505', null, 'drugi red sa id=true je odbijen (primarni ključ)');

-- Provera PIB-a i matičnog broja (kao postgres).
select throws_ok($$update public.company_settings set pib = '12345678'$$, '23514', null, 'PIB sa 8 cifara je odbijen');
select throws_ok($$update public.company_settings set pib = '12345678a'$$, '23514', null, 'PIB sa slovom je odbijen');
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
update public.company_settings set name = 'QA-7 firma', pib = '123456789', registration_number = '12345678';
select is((select name from public.company_settings), 'QA-7 firma', 'admin menja naziv');
select is((select pib || '/' || registration_number from public.company_settings), '123456789/12345678', 'ispravni PIB i matični broj prolaze');
reset role;
-- anon nema pristup tabeli
set local role anon;
select throws_ok($$select * from public.company_settings$$, '42501', null, 'anon ne čita podatke firme');
reset role;

select * from finish();
rollback;
