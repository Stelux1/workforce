-- Jedan izbor tarife u bazi (resolve_rate, migracija 20261125030000; ranije 20261114180000) — redosled nivoa.
-- PARITET SA rates.js: isti nivoi, iznosi i oznake kao „izbor tarife v2" u src/lib/payroll/rateHistory.test.js —
-- angažman 15/30, Job Role 13/22, ceo projekat 12/27, radnik 16/29. Ako se promeni jedan fajl, mora i drugi.
-- Tarifu po danu pri odobravanju upisuje guard_timesheet (T-A2, test 24). Sopstveni podaci (QA-4, 2033), rollback.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.clients (id, name) values ('c7000000-0000-4000-8000-0000000000c1', 'QA-4 klijent');
insert into public.projects (id, name, client_name) values ('b7000000-0000-4000-8000-0000000000b1', 'QA-4 projekat', 'QA-4 klijent');
insert into public.project_roles (id, project_id, title) values
  ('a7100000-0000-4000-8000-0000000000e1', 'b7000000-0000-4000-8000-0000000000b1', 'QA-4 Zavarivač'),
  ('a7100000-0000-4000-8000-0000000000e2', 'b7000000-0000-4000-8000-0000000000b1', 'QA-4 Monter');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d7000000-0000-4000-8000-0000000000d1', 'QA-4', 'Radnik', 'QA-4-001');
-- Profil i spisak projekta više nisu izvor tarife (K5): ovo ne sme da utiče na izbor.
insert into public.employee_private (employee_id, b2c_hourly_rate, b2b_hourly_rate) values ('d7000000-0000-4000-8000-0000000000d1', 14, 20);
insert into public.project_assignments (id, employee_id, project_id, project_role_id, start_date) values
  ('a7000000-0000-4000-8000-0000000000a1', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1',
   'a7100000-0000-4000-8000-0000000000e1', '2033-01-01');
insert into public.rates (id, scope, kind, amount, project_id, project_role_id, employee_id, assignment_id, effective_from) values
  ('e7000000-0000-4000-8000-000000000001', 'assignment', 'cost', 15, null, null, null, 'a7000000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000002', 'assignment', 'revenue', 30, null, null, null, 'a7000000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000003', 'project', 'cost', 13, 'b7000000-0000-4000-8000-0000000000b1', 'a7100000-0000-4000-8000-0000000000e1', null, null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000004', 'project', 'revenue', 22, 'b7000000-0000-4000-8000-0000000000b1', 'a7100000-0000-4000-8000-0000000000e1', null, null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000005', 'project', 'cost', 12, 'b7000000-0000-4000-8000-0000000000b1', null, null, null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000006', 'project', 'revenue', 27, 'b7000000-0000-4000-8000-0000000000b1', null, null, null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000007', 'employee', 'cost', 16, null, null, 'd7000000-0000-4000-8000-0000000000d1', null, '2033-01-01'),
  ('e7000000-0000-4000-8000-000000000008', 'employee', 'revenue', 29, null, null, 'd7000000-0000-4000-8000-0000000000d1', null, '2033-01-01');

create function pg_temp.r(p_side text) returns jsonb language sql as $$
  select public.resolve_rate(p_side, 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07')
           - 'assignment_id' - 'project_role_id'
$$;

select is(pg_temp.r('worker'), '{"rate": 15.00, "currency": "EUR", "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000001"}'::jsonb,
  'radnik: tarifa angažmana je prva');
select is(pg_temp.r('client'), '{"rate": 30.00, "currency": "EUR", "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000002"}'::jsonb,
  'klijent: tarifa angažmana je prva');
select is(public.resolve_timesheet_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"rate": 15.00, "source": "assignment_rate", "ref": "e7000000-0000-4000-8000-000000000001"}'::jsonb,
  'resolve_timesheet_rate je omotač oko resolve_rate (stari oblik)');

update public.rates set status = 'inactive' where scope = 'assignment' and assignment_id = 'a7000000-0000-4000-8000-0000000000a1';
select is(pg_temp.r('worker') ->> 'source', 'role_rate', 'radnik: tarifa Job Role pobeđuje projekat i radnika');
select is(pg_temp.r('client') ->> 'rate', '22.00', 'klijent: tarifa Job Role (B2B) 22');

-- Uloga dodele se menja → tarifa druge uloge ne postoji → tarifa za ceo projekat.
update public.project_assignments set project_role_id = 'a7100000-0000-4000-8000-0000000000e2' where id = 'a7000000-0000-4000-8000-0000000000a1';
select is(pg_temp.r('worker') ->> 'ref', 'e7000000-0000-4000-8000-000000000005', 'tuđa uloga se ne koristi → tarifa za ceo projekat');
select is(pg_temp.r('client') ->> 'rate', '27.00', 'klijent: tarifa za ceo projekat 27');

update public.rates set effective_to = '2033-03-07' where id in ('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000006');
select is(pg_temp.r('worker') ->> 'rate', '12.00', 'kraj važenja je uključen');
update public.rates set status = 'inactive' where id in ('e7000000-0000-4000-8000-000000000005', 'e7000000-0000-4000-8000-000000000006');
select is(pg_temp.r('worker') ->> 'source', 'employee_rate', 'radnik: tarifa radnika je poslednji nivo');
select is(pg_temp.r('client') ->> 'rate', '29.00', 'klijent: tarifa radnika 29');

-- Otkazana dodela: nema angažmana ni Job Role.
update public.rates set status = 'inactive' where scope = 'employee' and employee_id = 'd7000000-0000-4000-8000-0000000000d1';
select is(pg_temp.r('worker'), '{"error": "missing"}'::jsonb, 'ništa ne važi → nema tarife (nikad 0, profil se ne koristi)');
select is(public.resolve_timesheet_rate('client', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-07'),
  '{"error": "missing"}'::jsonb, 'omotač: nema tarife');

-- Buduća tarifa ne važi; pobednik po danu → greška jedinice bez prelaska na sledeći nivo.
insert into public.rates (id, scope, kind, unit, amount, employee_id, effective_from) values
  ('e7000000-0000-4000-8000-000000000009', 'employee', 'cost', 'daily', 120, 'd7000000-0000-4000-8000-0000000000d1', '2033-03-01'),
  ('e7000000-0000-4000-8000-000000000010', 'employee', 'revenue', 'hourly', 31, 'd7000000-0000-4000-8000-0000000000d1', '2033-03-08');
select is(pg_temp.r('worker') ->> 'error', 'unit', 'pobednik po danu → greška jedinice');
select is(pg_temp.r('client') ->> 'error', 'missing', 'tarifa koja tek počinje se ne koristi');

-- Dodela koja ne pokriva datum ne daje tarifu angažmana.
update public.rates set status = 'active' where id = 'e7000000-0000-4000-8000-000000000001';
update public.project_assignments set start_date = '2033-03-08' where id = 'a7000000-0000-4000-8000-0000000000a1';
select is(pg_temp.r('worker') ->> 'error', 'unit', 'dodela počinje posle datuma → tarifa angažmana ne važi');
select is(public.resolve_rate('worker', 'd7000000-0000-4000-8000-0000000000d1', 'b7000000-0000-4000-8000-0000000000b1', '2033-03-08') ->> 'rate',
  '15.00', 'od početka dodele važi tarifa angažmana');

select * from finish();
rollback;
