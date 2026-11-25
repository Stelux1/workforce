-- Kreiranje korisnika iz aplikacije i sekcije view.* (D31, migracija 20261125190000_kreiranje_korisnika_sekcije.sql).
-- Accept: samo aktivan admin pravi nalog; nalog je odmah aktivan sa ulogom, opsegom, projektima i sakrivenim
-- sekcijama; lozinka radi (bcrypt); duplikat, kratka lozinka, nepoznata uloga/pravo se odbijaju; sve uloge podrazumevano
-- vide sve sekcije. Sopstveni podaci sa oznakom QA-38; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, instance_id, aud, role) values
  ('b3811111-1111-4111-8111-111111111111', 'qa38-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b3822222-2222-4222-8222-222222222222', 'qa38-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = 'b3811111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = 'b3822222-2222-4222-8222-222222222222';
-- users.manage ne daje pravo da se otvori nalog (samo admin).
insert into public.user_permission_overrides (user_id, permission, granted)
  values ('b3822222-2222-4222-8222-222222222222', 'users.manage', true);
insert into public.projects (id, name) values ('b38a0000-0000-4000-8000-00000000000a', 'QA-38 Projekat');

-- ═════════════════════════════ katalog ═════════════════════════════
select is((select count(*)::int from public.permissions where code like 'view.%'), 13, '13 sekcija view.*');
select is((select count(*)::int from public.role_permissions where permission like 'view.%'), 39,
  'sve tri uloge podrazumevano vide sve sekcije (ništa se ne menja za postojeće naloge)');
select ok(not has_function_privilege('anon', 'public.admin_create_user(text, text, text, text, text, uuid[], text[])', 'execute'),
  'anon ne može da pozove admin_create_user');

-- ═════════════════════════════ ne-admin ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b3822222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$select public.admin_create_user('qa38-x@radnici.local', 'lozinka12345', 'X', 'hr')$$, '42501', null,
  'HR (i sa users.manage) ne otvara nalog');
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$select public.admin_create_user('qa38-x@radnici.local', 'lozinka12345', 'X', 'hr')$$, '42501', null,
  'anon ne otvara nalog');
reset role;

-- ═════════════════════════════ admin ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b3811111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok($$select public.admin_create_user('qa38-a@radnici.local', 'kratka', 'A', 'hr')$$, '22023',
  'Lozinka mora da ima bar 10 znakova', 'kratka lozinka se odbija');
select throws_ok($$select public.admin_create_user('nije-email', 'lozinka12345', 'A', 'hr')$$, '22023',
  'Email adresa nije ispravna', 'neispravan email se odbija');
select throws_ok($$select public.admin_create_user('qa38-a@radnici.local', 'lozinka12345', 'A', 'operater')$$, '22023',
  null, 'nepoznata uloga se odbija');
select throws_ok($$select public.admin_create_user('qa38-a@radnici.local', 'lozinka12345', 'A', 'hr', 'all', '{}', '{view.nepostoji}')$$,
  '22023', null, 'nepoznato pravo se odbija');
select throws_ok($$select public.admin_create_user('qa38-a@radnici.local', 'lozinka12345', 'A', 'admin', 'all', '{}', '{view.tasks}')$$,
  '22023', null, 'adminu se prava ne oduzimaju');
select throws_ok($$select public.admin_create_user('QA38-ADMIN@radnici.local', 'lozinka12345', 'A', 'hr')$$, '23505',
  null, 'postojeći email (bez obzira na velika slova) se odbija');

select lives_ok($$select public.admin_create_user(' QA38-Novi@Radnici.local ', 'lozinka12345', 'QA38 Novi', 'project_manager',
  'assigned', array['b38a0000-0000-4000-8000-00000000000a']::uuid[], array['view.tasks', 'view.clients', 'timesheets.approve'])$$,
  'admin otvara nalog PM-a sa projektom i sakrivenim sekcijama');
reset role;

select is((select (role, active, project_scope, full_name)::text from public.profiles where email = 'qa38-novi@radnici.local'),
  '(project_manager,t,assigned,"QA38 Novi")', 'profil: uloga, aktivan, opseg i ime');
select is((select count(*)::int from auth.users where email = 'qa38-novi@radnici.local' and email_confirmed_at is not null), 1,
  'email je potvrđen (prijava bez mejla)');
select ok((select encrypted_password = extensions.crypt('lozinka12345', encrypted_password) from auth.users
  where email = 'qa38-novi@radnici.local'), 'lozinka je sačuvana kao bcrypt i proverava se');
select is((select count(*)::int from auth.identities i join auth.users u on u.id = i.user_id
  where u.email = 'qa38-novi@radnici.local' and i.provider = 'email' and i.provider_id = u.id::text), 1, 'email identitet postoji');
select is((select count(*)::int from auth.users where email = 'qa38-novi@radnici.local'
  and confirmation_token = '' and recovery_token = '' and email_change = ''), 1, 'tokeni nisu NULL (GoTrue ih čita kao tekst)');
select is((select array_agg(project_id) from public.user_project_access a join public.profiles p on p.id = a.user_id
  where p.email = 'qa38-novi@radnici.local'), array['b38a0000-0000-4000-8000-00000000000a']::uuid[], 'dodeljen projekat');
select is((select array_agg(permission order by permission) from public.user_permission_overrides o join public.profiles p on p.id = o.user_id
  where p.email = 'qa38-novi@radnici.local' and not o.granted), array['timesheets.approve', 'view.clients', 'view.tasks'],
  'sakrivene sekcije i oduzeto pravo su override granted=false');

-- Novi korisnik: my_permissions bez sakrivenih sekcija.
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from public.profiles where email = 'qa38-novi@radnici.local'), 'role', 'authenticated')::text, true);
select ok(not ('view.tasks' = any (public.my_permissions())) and not ('view.clients' = any (public.my_permissions())),
  'novi korisnik ne vidi sakrivene sekcije');
select ok('view.projects' = any (public.my_permissions()) and 'view.timesheets' = any (public.my_permissions()),
  'ostale sekcije vidi');
select ok(not public.has_permission('timesheets.approve') and public.has_permission('timesheets.edit'),
  'oduzeto pravo nema, ostala prava uloge ima');
select is((select count(*)::int from public.projects where id = 'b38a0000-0000-4000-8000-00000000000a'), 1,
  'vidi dodeljen projekat');
reset role;

-- Admin bez opsega „assigned" ne dodeljuje projekte.
set local role authenticated;
set local request.jwt.claims to '{"sub":"b3811111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.admin_create_user('qa38-svi@radnici.local', 'lozinka12345', '', 'finance', 'all',
  array['b38a0000-0000-4000-8000-00000000000a']::uuid[])$$, 'finance sa svim projektima, bez imena');
reset role;

select * from finish();
rollback;
