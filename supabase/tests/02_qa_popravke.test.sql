-- Testovi za popravke posle QA prolaza 14.11.2026 (migracija 20261114120000_qa_popravke.sql).
-- Sopstveni podaci i 2031. godina; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('31111111-1111-4111-8111-111111111111', 'qa2-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('32222222-2222-4222-8222-222222222222', 'qa2-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '31111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '32222222-2222-4222-8222-222222222222';
-- Pravila razvrstavanja kao u šemi (prag 8h, redovni = 1), nezavisno od onoga što je admin upisao u lokalnu bazu.
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';

insert into public.clients (id, name) values
  ('c3000000-0000-4000-8000-0000000000c1', 'QA2 klijent A'),
  ('c3000000-0000-4000-8000-0000000000c2', 'QA2 klijent B');
insert into public.projects (id, name, client_name) values ('b3000000-0000-4000-8000-0000000000b1', 'QA2 projekat', 'QA2 klijent A');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d3000000-0000-4000-8000-0000000000d1', 'QA2', 'Radnik', 'QA2-001'),
  ('d3000000-0000-4000-8000-0000000000d2', 'QA2', 'Drugi', 'QA2-002');

-- ───── operater ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"32222222-2222-4222-8222-222222222222","role":"authenticated"}';

insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate,
  worker_cost, client_revenue, profit, overtime_hours, approval_status)
values ('f3000000-0000-4000-8000-0000000000f1', 'd3000000-0000-4000-8000-0000000000d1', 'b3000000-0000-4000-8000-0000000000b1',
  '2031-11-03', 8, 12, 25, 1, 9999, 9998, 77, 'submitted');

select is((select (worker_cost, client_revenue, profit, overtime_hours)::text from public.timesheets where id = 'f3000000-0000-4000-8000-0000000000f1'),
  '(96.00,200.00,104.00,0.00)', 'iznose satnice računa baza (sati × tarifa × koeficijent), upisani iznosi se ignorišu');

select throws_ok($$update public.timesheets set approval_status = 'rejected' where id = 'f3000000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'operater ne može da odbije satnicu');

-- 8h pon + 2h uto = 10h redovno (prekovremeni je od Faze 2 preko dnevnog praga, ne preko 40h nedeljno).
update public.timesheets set tue_hours = 2 where id = 'f3000000-0000-4000-8000-0000000000f1';
select is((select worker_cost from public.timesheets where id = 'f3000000-0000-4000-8000-0000000000f1'), 120.00::numeric,
  'izmena sati preračunava trošak');

insert into public.timesheets (employee_id, project, week_start, mon_hours) values ('d3000000-0000-4000-8000-0000000000d1', 'QA2 ručni', '2031-11-03', 2);
select throws_ok($$insert into public.timesheets (employee_id, project, week_start, tue_hours)
  values ('d3000000-0000-4000-8000-0000000000d1', 'qa2 ručni ', '2031-11-03', 3)$$,
  '23505', null, 'ručno upisan projekat samo jednom po radniku i nedelji');

select throws_ok($$insert into public.projects (name, client_name) values ('qa2 projekat', 'QA2 klijent A')$$,
  '23505', null, 'isti naziv projekta za istog klijenta je odbijen');
select lives_ok($$insert into public.projects (name, client_name) values ('QA2 projekat', 'QA2 klijent B')$$,
  'isti naziv za drugog klijenta je dozvoljen');

-- ───── admin ─────
set local request.jwt.claims to '{"sub":"31111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.timesheets (id, employee_id, project_id, week_start, wed_hours, b2c_rate, b2b_rate, approval_status)
values ('f3000000-0000-4000-8000-0000000000f2', 'd3000000-0000-4000-8000-0000000000d2', 'b3000000-0000-4000-8000-0000000000b1',
  '2031-11-03', 8, 0, 20, 'submitted');
select throws_like($$update public.timesheets set approval_status = 'approved' where id = 'f3000000-0000-4000-8000-0000000000f2'$$,
  '%nema tarifu%', 'satnica sa tarifom 0 ne može da se odobri');
select lives_ok($$update public.timesheets set approval_status = 'rejected' where id = 'f3000000-0000-4000-8000-0000000000f2'$$,
  'admin može da odbije satnicu');
select lives_ok($$update public.timesheets set approval_status = 'approved' where id = 'f3000000-0000-4000-8000-0000000000f1'$$,
  'admin odobrava satnicu sa tarifom');
update public.timesheets set worker_cost = 1 where id = 'f3000000-0000-4000-8000-0000000000f1';
select is((select worker_cost from public.timesheets where id = 'f3000000-0000-4000-8000-0000000000f1'), 120.00::numeric,
  'ni admin ne može da upiše iznos odobrene satnice mimo sati × tarifa × koeficijent');

select lives_ok($$select public.lock_month('2031-12-01')$$, 'decembar 2031 se zaključava');
select throws_like($$select public.lock_month('2031-12-15')$$, '%već zaključan%', 'ponovno zaključavanje daje jasnu poruku');

-- ───── zadaci obrisanog radnika ─────
reset role;
insert into public.tasks (id, title, assigned_to, assigned_to_name)
  values ('e3000000-0000-4000-8000-0000000000e1', 'QA2 zadatak', 'd3000000-0000-4000-8000-0000000000d2', 'QA2 Drugi');
delete from public.timesheets where employee_id = 'd3000000-0000-4000-8000-0000000000d2';
delete from public.employees where id = 'd3000000-0000-4000-8000-0000000000d2';
select is((select (assigned_to, assigned_to_name)::text from public.tasks where id = 'e3000000-0000-4000-8000-0000000000e1'),
  '(,)', 'zadatak obrisanog radnika nema ni dodelu ni ime');

-- ───── poslednji admin ne može da se obriše ─────
update public.profiles set active = false where role = 'admin' and id <> '31111111-1111-4111-8111-111111111111';
select throws_ok($$delete from public.profiles where id = '31111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'poslednji aktivan admin ne može da se obriše');

select * from finish();
rollback;
