-- Testovi za podešavanja aplikacije (migracija 20261124140000_podesavanja_aplikacije.sql).
-- Jedan red, podrazumevano en/EUR, operater čita ali ne menja, admin menja. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, instance_id, aud, role) values
  ('78111111-1111-4111-8111-111111111111', 'qa12-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('78222222-2222-4222-8222-222222222222', 'qa12-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '78111111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = '78222222-2222-4222-8222-222222222222';

select is((select count(*)::int from public.app_settings), 1, 'postoji tačno jedan red');
select is((select language || '/' || currency from public.app_settings), 'en/EUR', 'podrazumevano en i EUR');
select throws_ok($$insert into public.app_settings (id) values (false)$$, '23514', null, 'id=false je odbijen');
select throws_ok($$update public.app_settings set language = 'de'$$, '23514', null, 'nepoznat jezik je odbijen');
select throws_ok($$update public.app_settings set currency = 'RSD'$$, '23514', null, 'RSD nije dozvoljen (D2)');

-- Operater čita, ne menja.
set local role authenticated;
set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.app_settings), 1, 'operater čita podešavanja');
update public.app_settings set language = 'sk';
select is((select count(*)::int from public.app_settings where language = 'sk'), 0, 'operater ne može da menja jezik');
reset role;

-- Admin menja.
set local role authenticated;
set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.app_settings set language = 'sk';
select is((select language from public.app_settings), 'sk', 'admin menja jezik na slovački');
update public.app_settings set language = 'rs';
select is((select language from public.app_settings), 'rs', 'admin menja jezik na srpski');
reset role;

-- anon nema pristup.
set local role anon;
select throws_ok($$select * from public.app_settings$$, '42501', null, 'anon ne čita podešavanja');
reset role;
select ok(true, 'kraj');

select * from finish();
rollback;
