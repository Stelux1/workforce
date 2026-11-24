-- Praznik vikendom (migracija 20261124150000_praznik_vikendom.sql, spec §5): jedna konačna vrsta sati, veći od
-- koeficijenata praznika i vikenda posebno za radnika i klijenta, bez sabiranja ili dvostrukog množenja.
-- Isti primeri kao u payroll.test.js („praznik vikendom: veći od koeficijenata praznika i vikenda").
-- Sopstveni podaci sa oznakom QA-14 i 2033. godina (subote 10.9., 17.9., 24.9., 1.10., 8.10., 15.10. su praznici). Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('71414141-1414-4141-8141-141414141414', 'qa14-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '71414141-1414-4141-8141-141414141414';

update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';
update public.hour_types set worker_coef = 1.26, client_coef = 1.5 where code = 'prekovremeni';
insert into public.holidays (date, name) values
  ('2033-09-10', 'QA-14 subota 1'), ('2033-09-17', 'QA-14 subota 2'), ('2033-09-24', 'QA-14 subota 3'),
  ('2033-10-01', 'QA-14 subota 4'), ('2033-10-08', 'QA-14 subota 5'), ('2033-10-15', 'QA-14 subota 6'),
  ('2033-10-19', 'QA-14 sreda')
on conflict (date) do nothing;

insert into public.clients (id, name) values ('c1400000-0000-4000-8000-0000000000c1', 'QA-14 klijent');
insert into public.projects (id, name, client_name) values ('b1400000-0000-4000-8000-0000000000b1', 'QA-14 projekat', 'QA-14 klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d1400000-0000-4000-8000-0000000000d1', 'QA-14', 'Radnik', 'QA-14-001'),
  ('d1400000-0000-4000-8000-0000000000d2', 'QA-14', 'Posebni', 'QA-14-002');
-- Phase 7: radnik na projektu = dodela; tarife 10 / 20 su u public.rates po dodeli (B2C = cost, B2B = revenue).
-- b2c_rate/b2b_rate u insertima satnica ispod baza ignoriše.
insert into public.project_assignments (id, employee_id, project_id, start_date, status) values
  ('a1400000-0000-4000-8000-0000000000a1', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1', '2033-01-01', 'active'),
  ('a1400000-0000-4000-8000-0000000000a2', 'd1400000-0000-4000-8000-0000000000d2', 'b1400000-0000-4000-8000-0000000000b1', '2033-01-01', 'active');
insert into public.rates (scope, kind, amount, unit, currency, assignment_id, effective_from) values
  ('assignment', 'cost', 10, 'hourly', 'EUR', 'a1400000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('assignment', 'revenue', 20, 'hourly', 'EUR', 'a1400000-0000-4000-8000-0000000000a1', '2033-01-01'),
  ('assignment', 'cost', 10, 'hourly', 'EUR', 'a1400000-0000-4000-8000-0000000000a2', '2033-01-01'),
  ('assignment', 'revenue', 20, 'hourly', 'EUR', 'a1400000-0000-4000-8000-0000000000a2', '2033-01-01');
insert into public.employee_private (employee_id, weekend_rate) values ('d1400000-0000-4000-8000-0000000000d2', 25);

-- ───── admin ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"71414141-1414-4141-8141-141414141414","role":"authenticated"}';
-- T26: iznosi i snimak se ne čitaju iz timesheets (permission denied i za admina) — čitaju se kroz view
-- public.timesheet_money (admin ima rates.view_b2c/b2b, pa vidi sve).

-- 1) praznik 150 %, vikend 200 % → 2,0 (vikend) za obe strane: 8 × 10 × 2 = 160; 8 × 20 × 2 = 320.
update public.hour_types set worker_coef = 1.5, client_coef = 1.5 where code = 'praznik';
update public.hour_types set worker_coef = 2, client_coef = 2 where code = 'vikend';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate, approval_status)
values ('f1400000-0000-4000-8000-0000000000f1', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-09-05', 8, 10, 20, 'approved');
select is((select hours_by_type from public.timesheets where id = 'f1400000-0000-4000-8000-0000000000f1'),
  '{"redovni": 0, "prekovremeni": 0, "vikend": 0, "praznik": 0, "praznik_vikend": 8}'::jsonb,
  'praznik u subotu je jedna konačna vrsta: praznik_vikend (ni praznik ni vikend)');
select is((select (worker_cost, client_revenue, profit)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f1'),
  '(160.00,320.00,160.00)', 'praznik 150 %, vikend 200 % → primenjen 2,0 (vikend), ne zbir ni proizvod');
-- Snimak v2: izvor koeficijenta („from") je u dnevnoj liniji (days[*].worker/client), ne u zbirnoj liniji.
select is((select jsonb_build_object('w', l -> 'worker' -> 'coef', 'wf', l -> 'worker' -> 'from', 'c', l -> 'client' -> 'coef', 'cf', l -> 'client' -> 'from')
           from public.timesheet_money t, jsonb_array_elements(t.rate_snapshot -> 'days') l
           where t.timesheet_id = 'f1400000-0000-4000-8000-0000000000f1' and l ->> 'code' = 'praznik_vikend'),
  '{"w": 2, "wf": "vikend", "c": 2, "cf": "vikend"}'::jsonb, 'snimak beleži izabrani koeficijent i izvor po strani');

-- 2) obrnuto: praznik 200 %, vikend 150 % → 2,0 (praznik).
update public.hour_types set worker_coef = 2, client_coef = 2 where code = 'praznik';
update public.hour_types set worker_coef = 1.5, client_coef = 1.5 where code = 'vikend';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate, approval_status)
values ('f1400000-0000-4000-8000-0000000000f2', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-09-12', 8, 10, 20, 'approved');
select is((select (worker_cost, client_revenue)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f2'),
  '(160.00,320.00)', 'praznik 200 %, vikend 150 % → primenjen 2,0 (praznik)');
select is((select l -> 'worker' ->> 'from' || '/' || (l -> 'client' ->> 'from')
           from public.timesheet_money t, jsonb_array_elements(t.rate_snapshot -> 'days') l
           where t.timesheet_id = 'f1400000-0000-4000-8000-0000000000f2' and l ->> 'code' = 'praznik_vikend'),
  'praznik/praznik', 'izvor je praznik za obe strane');

-- 3) strane se biraju posebno: radniku veći praznik (2,1 > 1,3), klijentu veći vikend (2,4 > 1,8).
update public.hour_types set worker_coef = 2.1, client_coef = 1.8 where code = 'praznik';
update public.hour_types set worker_coef = 1.3, client_coef = 2.4 where code = 'vikend';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate)
values ('f1400000-0000-4000-8000-0000000000f3', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-09-19', 8, 10, 20);
select is((select (worker_cost, client_revenue)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f3'),
  '(168.00,384.00)', 'radnik 8 × 10 × 2,1 = 168 (praznik), klijent 8 × 20 × 2,4 = 384 (vikend)');

-- 4) jednaki koeficijenti → praznik.
update public.hour_types set worker_coef = 1.5, client_coef = 1.5 where code in ('praznik', 'vikend');
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate, approval_status)
values ('f1400000-0000-4000-8000-0000000000f4', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-09-26', 8, 10, 20, 'approved');
select is((select l -> 'worker' ->> 'from' || '/' || (l -> 'client' ->> 'from') || ' ' || (l ->> 'worker_cost')
           from public.timesheet_money t, jsonb_array_elements(t.rate_snapshot -> 'days') l
           where t.timesheet_id = 'f1400000-0000-4000-8000-0000000000f4' and l ->> 'code' = 'praznik_vikend'),
  'praznik/praznik 120.00', 'jednaki koeficijenti → praznik, 8 × 10 × 1,5 = 120');

-- 5) Pravilo namerno promenjeno (Phase 7, K5): posebna satnica vikenda iz profila (25 €/h) se više ne primenjuje —
--    i radnik ide tarifa × veći koeficijent (praznik 2): 8 × 10 × 2 = 160 (ranije 8 × 25 = 200).
update public.hour_types set worker_coef = 2, client_coef = 2 where code = 'praznik';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate, approval_status)
values ('f1400000-0000-4000-8000-0000000000f5', 'd1400000-0000-4000-8000-0000000000d2', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-03', 8, 10, 20, 'approved');
select is((select jsonb_build_object('src', l -> 'worker_source', 'rate', l -> 'worker_rate', 'coef', l -> 'worker_coef',
             'from', (select d -> 'worker' -> 'from' from jsonb_array_elements(t.rate_snapshot -> 'days') d
                      where d ->> 'code' = 'praznik_vikend'), 'cost', l -> 'worker_cost')
           from public.timesheet_money t, jsonb_array_elements(t.rate_snapshot -> 'lines') l
           where t.timesheet_id = 'f1400000-0000-4000-8000-0000000000f5' and l ->> 'code' = 'praznik_vikend'),
  '{"src": "coef", "rate": 10, "coef": 2, "from": "praznik", "cost": 160}'::jsonb,
  'posebna satnica vikenda iz profila se ne primenjuje: 8 × 10 × 2 (praznik) = 160');
-- posebna satnica 18 €/h (i ona se ignoriše) → praznik: 8 × 10 × 2 = 160.
update public.employee_private set weekend_rate = 18 where employee_id = 'd1400000-0000-4000-8000-0000000000d2';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate)
values ('f1400000-0000-4000-8000-0000000000f6', 'd1400000-0000-4000-8000-0000000000d2', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-10', 8, 10, 20);
select is((select worker_cost from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f6'), 160.00::numeric,
  'posebna satnica vikenda 18 €/h ne menja obračun → 8 × 10 × 2 = 160');

-- 6) cela nedelja: pon 8 redovno, sub 8 praznik vikendom, ned 4 vikend; praznik radnim danom (sreda) ostaje praznik.
update public.hour_types set worker_coef = 2.1, client_coef = 2 where code = 'praznik';
update public.hour_types set worker_coef = 1.3, client_coef = 1.4 where code = 'vikend';
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, sat_hours, sun_hours, b2c_rate, b2b_rate)
values ('f1400000-0000-4000-8000-0000000000f7', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-10', 8, 8, 4, 10, 20);
select is((select (worker_cost, client_revenue)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f7'),
  '(300.00,592.00)', 'radnik 80 + 4×10×1,3 + 8×10×2,1 = 300; klijent 160 + 4×20×1,4 + 8×20×2 = 592 (kao payroll.test.js)');
insert into public.timesheets (id, employee_id, project_id, week_start, wed_hours, b2c_rate, b2b_rate)
values ('f1400000-0000-4000-8000-0000000000f8', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-17', 10, 10, 20);
select is((select hours_by_type from public.timesheets where id = 'f1400000-0000-4000-8000-0000000000f8'),
  '{"redovni": 0, "prekovremeni": 0, "vikend": 0, "praznik": 10, "praznik_vikend": 0}'::jsonb,
  'praznik radnim danom ostaje praznik (ceo dan, bez prekovremenog)');
select is((select worker_cost from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f8'), 210.00::numeric,
  'praznik radnim danom: samo koeficijent praznika (10 × 10 × 2,1)');

-- 7) prazan koeficijent jedne strane blokira i kad je druga upisana (nema tihog izbora).
update public.hour_types set client_coef = null where code = 'praznik';
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, b2c_rate, b2b_rate)
values ('f1400000-0000-4000-8000-0000000000f9', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-03', 8, 10, 20);
select is((select (worker_cost, client_revenue)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f9'),
  '(168.00,)', 'koeficijent praznika za klijenta fali → prihod je prazan (ne vikend 1,4), trošak radnika postoji');
select throws_like($$update public.timesheets set approval_status = 'approved' where id = 'f1400000-0000-4000-8000-0000000000f9'$$,
  'Satnica ne može da se odobri: nedostaje koeficijent praznik (klijent)%', 'odobravanje kaže koji konfigurisani koeficijent fali');
update public.hour_types set client_coef = 2 where code = 'praznik';

-- 8) D10: odobreno se ne preračunava — ni posle promene koeficijenata.
update public.hour_types set worker_coef = 3, client_coef = 3 where code in ('praznik', 'vikend');
update public.timesheets set notes = 'QA-14 napomena' where id = 'f1400000-0000-4000-8000-0000000000f1';
select is((select (worker_cost, client_revenue)::text from public.timesheet_money where timesheet_id = 'f1400000-0000-4000-8000-0000000000f1'),
  '(160.00,320.00)', 'odobrena satnica zadržava izabrani koeficijent iz snimka');

-- 9) D10: satnica odobrena po starom pravilu (praznik vikendom = praznik, hours_by_type bez praznik_vikend) se ne menja.
reset role;
set local session_replication_role = replica; -- red kakav je upisao stari guard_timesheet (pre 20261124150000)
insert into public.timesheets (id, employee_id, project_id, week_start, sat_hours, total_hours, b2c_rate, b2b_rate,
  hours_by_type, worker_cost, client_revenue, profit, approval_status, rate_snapshot)
values ('f1400000-0000-4000-8000-0000000000fa', 'd1400000-0000-4000-8000-0000000000d1', 'b1400000-0000-4000-8000-0000000000b1',
  '2033-10-24', 8, 8, 10, 20, '{"redovni": 0, "prekovremeni": 0, "vikend": 0, "praznik": 8}', 120, 240, 120, 'approved',
  '{"daily_regular_hours": 8, "holidays": ["2033-10-29"], "lines": [{"code": "praznik", "hours": 8, "worker_source": "coef",
    "worker_rate": 10, "worker_coef": 1.5, "special_rate": null, "client_rate": 20, "client_coef": 1.5, "worker_cost": 120, "client_revenue": 240}]}');
set local session_replication_role = origin;
insert into public.holidays (date, name) values ('2033-10-29', 'QA-14 subota 7') on conflict (date) do nothing;
set local role authenticated;
update public.timesheets set notes = 'QA-14 stari snimak' where id = 'f1400000-0000-4000-8000-0000000000fa';
select is((select (t.hours_by_type, m.worker_cost, m.client_revenue)::text from public.timesheets t
             join public.timesheet_money m on m.timesheet_id = t.id where t.id = 'f1400000-0000-4000-8000-0000000000fa'),
  '("{""vikend"": 0, ""praznik"": 8, ""redovni"": 0, ""prekovremeni"": 0}",120.00,240.00)',
  'stara odobrena satnica zadržava razvrstavanje i iznose (novo pravilo važi tek za ponovno odobravanje)');
select is((select hours_by_type ->> 'praznik_vikend' from public.timesheets where id = 'f1400000-0000-4000-8000-0000000000f7'), '8',
  'nacrt dobija novu vrstu');

select * from finish();
rollback;
