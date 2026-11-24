-- Tarife menja samo korisnik sa pravom rates.manage (Teamora §4, migracija 20261125030000; ranije „samo admin",
-- 20261114240000). HR i PM vode dodele i Job Roles, ali ne tarife; PM vidi B2B, ne B2C. Keš projekta se ne piše
-- direktno, pa tarife više ne mogu da uđu kroz spisak radnika projekta (D3). Sopstveni podaci (QA-8, 2033), rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (id, email, instance_id, aud, role) values
  ('78111111-1111-4111-8111-111111111111', 'qa8-finance@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('78222222-2222-4222-8222-222222222222', 'qa8-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('78333333-3333-4333-8333-333333333333', 'qa8-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'finance', active = true where id = '78111111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = '78222222-2222-4222-8222-222222222222';
update public.profiles set role = 'project_manager', active = true where id = '78333333-3333-4333-8333-333333333333';

insert into public.clients (id, name) values ('c7800000-0000-4000-8000-0000000000c1', 'QA-8 klijent');
insert into public.projects (id, name, client_name) values ('b7800000-0000-4000-8000-0000000000b1', 'QA-8 projekat', 'QA-8 klijent');
insert into public.project_roles (id, project_id, title) values
  ('a7810000-0000-4000-8000-0000000000e1', 'b7800000-0000-4000-8000-0000000000b1', 'QA-8 Zavarivač');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d7800000-0000-4000-8000-0000000000d1', 'QA-8', 'Radnik', 'QA-8-001');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, start_date) values
  ('a7800000-0000-4000-8000-0000000000a1', 'd7800000-0000-4000-8000-0000000000d1', 'b7800000-0000-4000-8000-0000000000b1',
   'a7810000-0000-4000-8000-0000000000e1', '2033-01-01');
insert into public.rates (id, scope, kind, amount, assignment_id, effective_from) values
  ('e7800000-0000-4000-8000-000000000001', 'assignment', 'cost', 15, 'a7800000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('e7800000-0000-4000-8000-000000000002', 'assignment', 'revenue', 30, 'a7800000-0000-4000-8000-0000000000a1', '2033-01-01');

-- ───── HR ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"78222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.rates where project_id = 'b7800000-0000-4000-8000-0000000000b1'), 0, 'HR ne vidi tarife');
select throws_ok($$insert into public.rates (scope, kind, amount, employee_id, effective_from)
    values ('employee', 'cost', 99, 'd7800000-0000-4000-8000-0000000000d1', '2033-01-01')$$, '42501', null, 'HR ne upisuje tarifu (RLS)');
select throws_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d7800000-0000-4000-8000-0000000000d1",
    "amount": 99, "effective_from": "2033-01-01"}')$$, '42501', null, 'HR ne upisuje tarifu ni kroz RPC');
select throws_ok($$select public.change_rate('e7800000-0000-4000-8000-000000000001', '2033-06-01', 99, 'EUR', 'pokušaj HR-a')$$,
  '42501', null, 'HR ne menja tarifu');
select throws_ok($$update public.projects set assigned_employees =
    '[{"employee_id": "d7800000-0000-4000-8000-0000000000d1", "b2c_rate": 99, "b2b_rate": 99}]'
    where id = 'b7800000-0000-4000-8000-0000000000b1'$$, '42501', 'Radnici i Job Roles se menjaju kroz angažmane i Job Roles',
  'satnica kroz spisak radnika projekta je odbijena');
select throws_ok($$update public.project_assignments set end_date = '2033-02-01' where id = 'a7800000-0000-4000-8000-0000000000a1'$$,
  '42501', 'Dodela ima tarifu angažmana — period, status i Job Role menjajte kroz Edit / End Assignment',
  'HR ne menja direktno period dodele sa tarifom angažmana');
select lives_ok($$update public.project_assignments set notes = 'QA-8 napomena HR' where id = 'a7800000-0000-4000-8000-0000000000a1'$$,
  'HR menja napomenu dodele');
select lives_ok($$select public.end_assignment('a7800000-0000-4000-8000-0000000000a1', '2033-06-30', 'kraj angažmana na projektu')$$,
  'HR završava dodelu kroz End (assignments.manage)');
reset role;
select is((select string_agg(effective_to::text, ',') from public.rates where assignment_id = 'a7800000-0000-4000-8000-0000000000a1'),
  '2033-06-30,2033-06-30', 'End zatvara tarife angažmana na dan kraja');

-- ───── PM ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"78333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select string_agg(kind, ',') from public.rates where project_id = 'b7800000-0000-4000-8000-0000000000b1'), 'revenue',
  'PM vidi B2B (prihod), ne B2C');
delete from public.rates where id = 'e7800000-0000-4000-8000-000000000002';
reset role;
select is((select count(*)::int from public.rates where id = 'e7800000-0000-4000-8000-000000000002'), 1, 'PM ne briše tarifu (RLS)');
set local role authenticated;
select lives_ok($$insert into public.project_roles (project_id, title) values ('b7800000-0000-4000-8000-0000000000b1', 'QA-8 Monter')$$,
  'PM dodaje Job Role (projects.manage)');

-- ───── Finance ─────
set local request.jwt.claims to '{"sub":"78111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.rates where project_id = 'b7800000-0000-4000-8000-0000000000b1'), 2, 'Finance vidi B2B i B2C');
select lives_ok($$select public.set_rate('{"scope": "project", "kind": "revenue", "project_id": "b7800000-0000-4000-8000-0000000000b1",
    "project_role_id": "a7810000-0000-4000-8000-0000000000e1", "amount": 48, "currency": "GBP", "effective_from": "2033-01-01"}')$$,
  'Finance upisuje B2B tarifu Job Role, i u GBP (K3)');
select is((select (position, currency)::text from public.rates where project_role_id = 'a7810000-0000-4000-8000-0000000000e1'),
  '("QA-8 Zavarivač",GBP)', 'tarifa Job Role nosi snimak naziva uloge i valutu');
select throws_ok($$select public.set_rate('{"scope": "project", "kind": "cost", "project_id": "b7800000-0000-4000-8000-0000000000b1",
    "position": "Nepostojeća pozicija", "amount": 10, "effective_from": "2033-01-01"}')$$,
  '23514', 'Pozicija „Nepostojeća pozicija" nije Job Role ovog projekta — prvo dodajte Job Role',
  'tarifa za poziciju mimo Job Role je odbijena');
select throws_ok($$select public.set_rate('{"scope": "employee", "kind": "cost", "employee_id": "d7800000-0000-4000-8000-0000000000d1",
    "amount": 0, "effective_from": "2033-01-01"}')$$, '23514', 'Iznos tarife mora biti veći od 0', 'tarifa 0 nije tarifa');

select * from finish();
rollback;
