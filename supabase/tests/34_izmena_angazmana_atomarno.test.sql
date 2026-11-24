-- Edit Assignment atomarno (migracija 20261125160200_izmena_angazmana_atomarno.sql; spec §4.5, §5, T07).
-- Jedan RPC menja dodelu i tarife; greška u tarifi vraća i izmenu dodele. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, instance_id, aud, role) values
  ('73400000-0000-4000-8000-0000000000a1', 'qa34-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73400000-0000-4000-8000-0000000000a2', 'qa34-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '73400000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'hr', active = true where id = '73400000-0000-4000-8000-0000000000a2';

insert into public.projects (id, name, client_name) values ('73400000-0000-4000-8000-0000000000b1', 'QA-34 projekat', 'QA-34 klijent');
insert into public.project_roles (id, project_id, title) values
  ('73400000-0000-4000-8000-0000000000c1', '73400000-0000-4000-8000-0000000000b1', 'QA-34 Zavarivač'),
  ('73400000-0000-4000-8000-0000000000c2', '73400000-0000-4000-8000-0000000000b1', 'QA-34 Bravar');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73400000-0000-4000-8000-0000000000e1', 'QA-34', 'Radnik', 'QA-34-001');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, start_date, end_date) values
  ('73400000-0000-4000-8000-0000000000f1', '73400000-0000-4000-8000-0000000000e1', '73400000-0000-4000-8000-0000000000b1',
   '73400000-0000-4000-8000-0000000000c1', '2034-03-01', '2034-06-30');
insert into public.rates (id, scope, kind, amount, assignment_id, effective_from) values
  ('73400000-0000-4000-8000-000000000901', 'assignment', 'cost', 40, '73400000-0000-4000-8000-0000000000f1', '2034-03-01');

select ok(not has_function_privilege('anon', 'public.update_assignment_with_rates(uuid,jsonb,jsonb,date,text)', 'execute'),
  'D14: anon ne zove update_assignment_with_rates');

set local role authenticated;
set local request.jwt.claims to '{"sub":"73400000-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- ───── uspeh: uloga + kraj + B2C promena (postojeći red) + B2B nova (nema reda) u jednom pozivu ─────
select lives_ok($$select public.update_assignment_with_rates('73400000-0000-4000-8000-0000000000f1',
    '{"project_role_id":"73400000-0000-4000-8000-0000000000c2","end_date":"2034-07-31"}'::jsonb,
    '[{"kind":"cost","amount":45,"currency":"EUR"},{"kind":"revenue","amount":60,"currency":"EUR"}]'::jsonb,
    '2034-04-01', 'QA-34 nova uloga i tarife')$$, 'T07: izmena dodele i obe tarife u jednom RPC-u');
select results_eq($$select project_role_id, end_date from public.project_assignments where id = '73400000-0000-4000-8000-0000000000f1'$$,
  $$values ('73400000-0000-4000-8000-0000000000c2'::uuid, '2034-07-31'::date)$$, 'dodela izmenjena');
select results_eq($$select amount::numeric, effective_from, effective_to, status from public.rates
                     where assignment_id = '73400000-0000-4000-8000-0000000000f1' and kind = 'cost' order by effective_from$$,
  $$values (40::numeric, '2034-03-01'::date, '2034-03-31'::date, 'active'::text), (45::numeric, '2034-04-01'::date, null::date, 'active'::text)$$,
  'T07: B2C — stari red zatvoren dan pre, nov od datuma promene');
select results_eq($$select amount::numeric, effective_from, effective_to from public.rates
                     where assignment_id = '73400000-0000-4000-8000-0000000000f1' and kind = 'revenue'$$,
  $$values (60::numeric, '2034-04-01'::date, '2034-07-31'::date)$$, 'B2B izuzetak nastaje od datuma do (novog) kraja dodele');

-- ───── greška u tarifi vraća i izmenu dodele ─────
select throws_ok($$select public.update_assignment_with_rates('73400000-0000-4000-8000-0000000000f1',
    '{"notes":"QA-34 ne sme da ostane"}'::jsonb, '[{"kind":"cost","amount":50,"currency":"EUR"}]'::jsonb,
    '2034-09-01', 'QA-34 datum van dodele')$$, '23514', null, 'datum tarife van dodele je odbijen');
select is((select notes from public.project_assignments where id = '73400000-0000-4000-8000-0000000000f1'), null::text,
  'atomarno: posle greške u tarifi ni napomena dodele nije upisana');
select throws_ok($$select public.update_assignment_with_rates('73400000-0000-4000-8000-0000000000f1',
    '{"notes":"QA-34 ne sme da ostane"}'::jsonb, '[{"kind":"cost","amount":50,"currency":"EUR"}]'::jsonb,
    '2034-05-01', 'x')$$, '23514', null, 'kratak razlog za tarifu je odbijen (rate_reason)');
select is((select notes from public.project_assignments where id = '73400000-0000-4000-8000-0000000000f1'), null::text,
  'atomarno: odbijen razlog tarife ne ostavlja izmenu dodele');
select is((select count(*)::int from public.rates where assignment_id = '73400000-0000-4000-8000-0000000000f1' and kind = 'cost'), 2,
  'odbijeni pozivi nisu dodali redove tarife');

-- ───── HR: dodela da, tarife ne ─────
set local request.jwt.claims to '{"sub":"73400000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select lives_ok($$select public.update_assignment_with_rates('73400000-0000-4000-8000-0000000000f1',
    '{"notes":"QA-34 HR napomena"}'::jsonb, '[]'::jsonb, null, 'QA-34 HR izmena')$$, 'HR menja dodelu bez tarifa (rates.manage ne treba)');
select throws_ok($$select public.update_assignment_with_rates('73400000-0000-4000-8000-0000000000f1',
    '{}'::jsonb, '[{"kind":"cost","amount":55,"currency":"EUR"}]'::jsonb, '2034-05-01', 'QA-34 HR tarifa')$$,
  '42501', null, 'HR bez rates.manage ne menja tarifu');

select * from finish();
rollback;
