-- Testovi za Podešavanja → „Korisnici" (migracije 20261114260000_korisnici.sql i 20261125020000_prava_rls.sql, D3, D14, D30 K1):
--  * profile (uloga, aktivan) menja ko ima users.manage (podrazumevano samo admin); HR (bivši operater) ne menja
--    nijedan nalog, korisnik ne aktivira sam sebe;
--  * admin aktivira i deaktivira druge naloge i menja im ulogu;
--  * poslednji aktivan admin ne može da se deaktivira, da izgubi ulogu ni da se obriše.
-- Sopstveni nalozi sa oznakom QA-10; postojeći nalozi se menjaju samo u ovoj transakciji i sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- ═════════════════════════════ priprema (kao postgres) ═════════════════════════════
-- Nov nalog je neaktivan operater (handle_new_user, migracija 20261114250000); test aktivira one koji treba.
insert into auth.users (id, email, instance_id, aud, role, raw_user_meta_data) values
  ('a1011111-1111-4111-8111-111111111111', 'qa10-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-10 Admin"}'),
  ('a1022222-2222-4222-8222-222222222222', 'qa10-admin2@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-10 Drugi admin"}'),
  ('a1033333-3333-4333-8333-333333333333', 'qa10-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-10 Operater"}'),
  ('a1044444-4444-4444-8444-444444444444', 'qa10-novi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{"full_name": "QA-10 Novi"}');
update public.profiles set role = 'admin', active = true
  where id in ('a1011111-1111-4111-8111-111111111111', 'a1022222-2222-4222-8222-222222222222');
update public.profiles set active = true where id = 'a1033333-3333-4333-8333-333333333333';

select policies_are('public', 'profiles', array['profiles_select', 'profiles_update'],
  'profili nemaju pravilo za upis ni brisanje preko API-ja (profil pravi samo handle_new_user kad se otvori nalog)');
select is((select cmd from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update'),
  'UPDATE', 'profiles_update je samo za izmenu');
select ok((select qual like '%users.manage%' and with_check like '%users.manage%' from pg_policies
           where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update'),
  'profil menja samo users.manage (i pre i posle izmene)');

-- ═════════════════════════════ operater ne menja naloge ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1033333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(public.is_admin(), false, 'operater nije admin');
select is((select count(*)::int from public.profiles), 1, 'operater vidi samo svoj nalog');
update public.profiles set active = true where id = 'a1044444-4444-4444-8444-444444444444';
update public.profiles set role = 'admin' where id = 'a1033333-3333-4333-8333-333333333333';
update public.profiles set active = false where id = 'a1011111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr' where id = 'a1022222-2222-4222-8222-222222222222';
update public.profiles set full_name = 'Promenio operater' where id = 'a1011111-1111-4111-8111-111111111111';
delete from public.profiles where id = 'a1044444-4444-4444-8444-444444444444';
select throws_ok($$insert into public.profiles (id, email, role, active)
  values ('a1033333-3333-4333-8333-333333333333', 'lazni@radnici.local', 'admin', true)$$,
  '42501', null, 'operater ne upisuje profil');
reset role;
select is((select (role, active)::text from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), '(hr,f)', 'Accept: operater ne aktivira tuđi nalog');
select is((select (role, active)::text from public.profiles where id = 'a1033333-3333-4333-8333-333333333333'), '(hr,t)', 'Accept: operater ne daje sebi ulogu admin');
select is((select (role, active)::text from public.profiles where id = 'a1011111-1111-4111-8111-111111111111'), '(admin,t)', 'Accept: operater ne deaktivira admina');
select is((select (role, active)::text from public.profiles where id = 'a1022222-2222-4222-8222-222222222222'), '(admin,t)', 'Accept: operater ne skida ulogu adminu');
select is((select full_name from public.profiles where id = 'a1011111-1111-4111-8111-111111111111'), 'QA-10 Admin',
  'operater ne menja ni ime na tuđem nalogu');
select is((select count(*)::int from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), 1,
  'operater ne briše nalog');

-- ═════════════════════════════ neaktivan korisnik ne aktivira sam sebe ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1044444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(public.is_staff(), false, 'neaktivan nalog nije osoblje');
update public.profiles set active = true where id = auth.uid();
update public.profiles set role = 'admin', active = true where id = auth.uid();
reset role;
select is((select (role, active)::text from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), '(hr,f)',
  'korisnik ne može sam sebe da aktivira ni da postane admin');

-- ═════════════════════════════ admin menja druge naloge ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1011111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.profiles where email like 'qa10-%'), 4, 'admin vidi sve naloge');
update public.profiles set active = true where id = 'a1044444-4444-4444-8444-444444444444';
select is((select (role, active)::text from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), '(hr,t)', 'admin aktivira nov nalog');
update public.profiles set role = 'admin' where id = 'a1044444-4444-4444-8444-444444444444';
select is((select (role, active)::text from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), '(admin,t)', 'admin daje ulogu admin');
update public.profiles set role = 'hr' where id = 'a1044444-4444-4444-8444-444444444444';
select is((select (role, active)::text from public.profiles where id = 'a1044444-4444-4444-8444-444444444444'), '(hr,t)', 'admin vraća ulogu hr');
update public.profiles set active = false where id = 'a1033333-3333-4333-8333-333333333333';
select is((select (role, active)::text from public.profiles where id = 'a1033333-3333-4333-8333-333333333333'), '(hr,f)', 'admin deaktivira operatera');
update public.profiles set active = true where id = 'a1033333-3333-4333-8333-333333333333';
select is((select (role, active)::text from public.profiles where id = 'a1033333-3333-4333-8333-333333333333'), '(hr,t)', 'admin ponovo aktivira operatera');
-- Drugi admin se deaktivira dok ostaje bar jedan aktivan admin.
update public.profiles set active = false where id = 'a1022222-2222-4222-8222-222222222222';
select is((select (role, active)::text from public.profiles where id = 'a1022222-2222-4222-8222-222222222222'), '(admin,f)', 'admin deaktivira drugog admina dok ostaje aktivan admin');
reset role;

-- Deaktiviran admin više nije admin i ne vraća sebi pristup.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1022222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(public.is_admin(), false, 'deaktiviran admin nije admin');
update public.profiles set active = true where id = auth.uid();
update public.profiles set active = false where id = 'a1011111-1111-4111-8111-111111111111';
reset role;
select is((select (role, active)::text from public.profiles where id = 'a1022222-2222-4222-8222-222222222222'), '(admin,f)', 'deaktiviran admin ne aktivira sam sebe');
select is((select (role, active)::text from public.profiles where id = 'a1011111-1111-4111-8111-111111111111'), '(admin,t)', 'deaktiviran admin ne menja druge naloge');

-- ═════════════════════════════ poslednji aktivan admin ═════════════════════════════
-- Ostali aktivni admini (i postojeći lokalni) se deaktiviraju samo u ovoj transakciji; QA-10 Admin ostaje jedini.
-- Priprema kao postgres bez prijavljenog korisnika (guard_profile_change preskače samo poziv bez auth.uid()).
set local request.jwt.claims to '{}';
update public.profiles set active = false where role = 'admin' and active and id <> 'a1011111-1111-4111-8111-111111111111';
select is((select count(*)::int from public.profiles where role = 'admin' and active), 1, 'priprema: jedan aktivan admin');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1011111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$update public.profiles set active = false where id = 'a1011111-1111-4111-8111-111111111111'$$,
  '23514', 'Mora da ostane bar jedan aktivan admin', 'Accept: deaktivacija poslednjeg aktivnog admina je odbijena');
select throws_ok($$update public.profiles set role = 'hr' where id = 'a1011111-1111-4111-8111-111111111111'$$,
  '23514', 'Mora da ostane bar jedan aktivan admin', 'poslednji aktivan admin ne može sebi da skine ulogu');
select throws_ok($$update public.profiles set role = 'hr', active = false where id = 'a1011111-1111-4111-8111-111111111111'$$,
  '23514', 'Mora da ostane bar jedan aktivan admin', 'ni uloga i status zajedno');
reset role;
select is((select (role, active)::text from public.profiles where id = 'a1011111-1111-4111-8111-111111111111'), '(admin,t)', 'poslednji aktivan admin je i dalje aktivan admin');

-- Kad postoji drugi aktivan admin, admin sme i sebi da skine ulogu; tada je drugi poslednji i on je zaštićen.
set local role authenticated;
set local request.jwt.claims to '{"sub":"a1011111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.profiles set active = true where id = 'a1022222-2222-4222-8222-222222222222';
select is((select (role, active)::text from public.profiles where id = 'a1022222-2222-4222-8222-222222222222'), '(admin,t)', 'admin ponovo aktivira drugog admina');
select lives_ok($$update public.profiles set role = 'hr' where id = 'a1011111-1111-4111-8111-111111111111'$$,
  'admin sebi skida ulogu dok ostaje drugi aktivan admin');
reset role;
select is((select (role, active)::text from public.profiles where id = 'a1011111-1111-4111-8111-111111111111'), '(hr,t)', 'bivši admin je hr');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a1022222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$update public.profiles set active = false where id = 'a1022222-2222-4222-8222-222222222222'$$,
  '23514', 'Mora da ostane bar jedan aktivan admin', 'novi poslednji aktivan admin je zaštićen');
reset role;
select throws_ok($$delete from public.profiles where id = 'a1022222-2222-4222-8222-222222222222'$$,
  '23514', 'Mora da ostane bar jedan aktivan admin', 'poslednji aktivan admin ne može ni da se obriše');

-- ═════════════════════════════ istovremene izmene ═════════════════════════════
-- Dva admina koji istovremeno jedan drugome skidaju ulogu ne smeju oba da uspeju: provera čeka zaključavanje i
-- broji admine bez obzira na prava pozivaoca. (Istovremenost ne može da se izvede u jednoj sesiji — proverava se
-- da obe zaštite to rade.)
select ok((select bool_and(prosecdef) from pg_proc
           where pronamespace = 'public'::regnamespace and proname in ('guard_last_admin', 'guard_last_admin_delete')),
  'zaštita poslednjeg admina broji sve profile (security definer)');
select ok((select bool_and(pg_get_functiondef(oid) like '%pg_advisory_xact_lock%') from pg_proc
           where pronamespace = 'public'::regnamespace and proname in ('guard_last_admin', 'guard_last_admin_delete')),
  'zaštita poslednjeg admina čeka istovremenu izmenu drugog admina');

select * from finish();
rollback;
