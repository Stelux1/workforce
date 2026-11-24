-- Imenik osoblja (migracija 20261125160000_imenik_osoblja.sql; spec §6/§7/§9/§14 „ko i kada").
-- PM bez users.manage ne čita `profiles` tuđih naloga, ali kroz staff_directory() dobija ime i ulogu (bez mejla).
-- Neaktivan nalog i anon ne dobijaju ništa. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email, instance_id, aud, role) values
  ('73200000-0000-4000-8000-0000000000a1', 'qa32-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73200000-0000-4000-8000-0000000000a2', 'qa32-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73200000-0000-4000-8000-0000000000a3', 'qa32-bivsi@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true, full_name = 'QA-32 Admin' where id = '73200000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned', full_name = 'QA-32 Menadžer' where id = '73200000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'hr', active = false, full_name = '' where id = '73200000-0000-4000-8000-0000000000a3';

select is(pg_get_function_result('public.staff_directory()'::regprocedure), 'TABLE(id uuid, full_name text, role text)',
  'staff_directory vraća samo id, ime i ulogu (bez mejla i ostalih ličnih podataka)');
select ok(not has_function_privilege('anon', 'public.staff_directory()', 'execute'), 'D14: anon ne izvršava staff_directory');

set local role authenticated;
set local request.jwt.claims to '{"sub":"73200000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select is((select count(*)::int from public.profiles where id = '73200000-0000-4000-8000-0000000000a1'), 0,
  'PM bez users.manage ne čita tuđi profil direktno (RLS ostaje)');
select is((select full_name from public.staff_directory() where id = '73200000-0000-4000-8000-0000000000a1'), 'QA-32 Admin',
  'T-§6: PM vidi ime osobe koja je odobrila (staff_directory)');
select is((select role from public.staff_directory() where id = '73200000-0000-4000-8000-0000000000a1'), 'admin',
  'staff_directory vraća ulogu');
select is((select full_name from public.staff_directory() where id = '73200000-0000-4000-8000-0000000000a3'), 'qa32-bivsi',
  'deaktiviran nalog ostaje u istoriji; bez imena — deo mejla pre @, ne ceo mejl');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set active = false where id = '73200000-0000-4000-8000-0000000000a2';
set local role authenticated;
set local request.jwt.claims to '{"sub":"73200000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from public.staff_directory()), 0, 'neaktivan korisnik ne dobija imenik');

set local request.jwt.claims to '{"role":"authenticated"}';
select is((select count(*)::int from public.staff_directory()), 0, 'bez prijave (auth.uid() null) imenik je prazan');

select * from finish();
rollback;
