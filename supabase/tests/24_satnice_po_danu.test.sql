-- Satnice po danu (migracija 20261125040000_satnice_po_danu.sql, T-A2, docs/TEAMORA-DATA-MODEL.md §2.6):
-- tarifa po datumu rada (T07), intervali i dnevni zbir (T10), samo odobreno u dnevnim linijama (T09), korekcija uz
-- razlog (K11) i vidljivost novca po pravu (T26). Isti primer kao src/lib/payroll/timesheetDays.test.js.
-- Sopstveni podaci sa oznakom QA-24, mart 2034. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('92400000-0000-4000-8000-0000000000a1', 'qa24-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('92400000-0000-4000-8000-0000000000a2', 'qa24-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('92400000-0000-4000-8000-0000000000a3', 'qa24-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '92400000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'hr', active = true where id = '92400000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all' where id = '92400000-0000-4000-8000-0000000000a3';

update public.work_rules set daily_regular_hours = 8, max_daily_hours = 24;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';
insert into public.payroll_params (valid_from, tax_rate, non_taxable_rsd, min_base_rsd, max_base_rsd,
  emp_pio, emp_health, emp_unemployment, er_pio, er_health, source_note)
values ('2034-03-01', 0.10, 34221, 51297, 732820, 0.14, 0.0515, 0.0075, 0.10, 0.0515, 'QA-24 parametri')
on conflict do nothing;

insert into public.clients (id, name) values ('c2400000-0000-4000-8000-0000000000c1', 'QA-24 klijent');
insert into public.projects (id, name, client_name) values
  ('b2400000-0000-4000-8000-0000000000b1', 'QA-24 projekat 1', 'QA-24 klijent'),
  ('b2400000-0000-4000-8000-0000000000b2', 'QA-24 projekat 2', 'QA-24 klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d2400000-0000-4000-8000-0000000000d1', 'QA-24', 'Radnik', 'QA-24-001');
insert into public.employee_private (employee_id, jmbg, salary, b2c_hourly_rate, b2b_hourly_rate)
  values ('d2400000-0000-4000-8000-0000000000d1', null, 1500, 11, 21);
insert into public.project_assignments (id, employee_id, project_id, start_date, status) values
  ('a2400000-0000-4000-8000-0000000000a1', 'd2400000-0000-4000-8000-0000000000d1', 'b2400000-0000-4000-8000-0000000000b1', '2034-01-01', 'active'),
  ('a2400000-0000-4000-8000-0000000000a2', 'd2400000-0000-4000-8000-0000000000d1', 'b2400000-0000-4000-8000-0000000000b2', '2034-01-01', 'active');
-- Tarifa radnika na projektu 1: 10 € do utorka 7.3., 12 € od srede 8.3. (T07); klijent 20 €.
insert into public.rates (scope, kind, amount, unit, currency, assignment_id, effective_from, effective_to) values
  ('assignment', 'cost', 10, 'hourly', 'EUR', 'a2400000-0000-4000-8000-0000000000a1', '2034-01-01', '2034-03-07'),
  ('assignment', 'cost', 12, 'hourly', 'EUR', 'a2400000-0000-4000-8000-0000000000a1', '2034-03-08', null),
  ('assignment', 'revenue', 20, 'hourly', 'EUR', 'a2400000-0000-4000-8000-0000000000a1', '2034-01-01', null),
  ('assignment', 'cost', 10, 'hourly', 'EUR', 'a2400000-0000-4000-8000-0000000000a2', '2034-01-01', null),
  ('assignment', 'revenue', 20, 'hourly', 'EUR', 'a2400000-0000-4000-8000-0000000000a2', '2034-01-01', null);

-- ───── T07: tarifa po datumu rada ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, wed_hours,
    thu_hours, fri_hours, b2c_rate, b2b_rate, approval_status)
  values ('f2400000-0000-4000-8000-0000000000f1', 'd2400000-0000-4000-8000-0000000000d1', 'b2400000-0000-4000-8000-0000000000b1',
    '2034-03-06', 8, 8, 8, 8, 8, 99, 99, 'approved')$$, 'T07 admin odobrava nedelju sa promenom tarife u sredu');
select is((select assignment_id from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f1'),
  'a2400000-0000-4000-8000-0000000000a1'::uuid, 'dodela se popunjava sama (jedina koja pokriva sve dane)');
reset role;
select is((select (worker_cost, client_revenue, b2c_rate, b2b_rate)::text from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f1'),
  '(448.00,800.00,,20.00)', 'T07 iznos = zbir po danu: 2 × 8 × 10 + 3 × 8 × 12 = 448; tarifa sa ekrana (99) se ignoriše; b2c_rate null (mešovita)');
select is((select jsonb_agg((d -> 'worker' ->> 'rate')::numeric order by d ->> 'date')
           from public.timesheets t, jsonb_array_elements(t.rate_snapshot -> 'days') d where t.id = 'f2400000-0000-4000-8000-0000000000f1'),
  '[10, 10, 12, 12, 12]'::jsonb, 'T07 snimak v2 ima dve tarife po danu');
select is((select (rate_snapshot ->> 'version') || '/' || (rate_snapshot -> 'worker' ->> 'mixed') || '/' || (rate_snapshot -> 'client' ->> 'mixed')
           from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f1'),
  '2/true/false', 'T07 snimak v2: radnik mixed = true, klijent jedna tarifa');

-- ───── T10: dva projekta istog dana, intervali, dnevni zbir ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
insert into public.timesheets (id, employee_id, project_id, week_start) values
  ('f2400000-0000-4000-8000-0000000000f2', 'd2400000-0000-4000-8000-0000000000d1', 'b2400000-0000-4000-8000-0000000000b1', '2034-03-13'),
  ('f2400000-0000-4000-8000-0000000000f3', 'd2400000-0000-4000-8000-0000000000d1', 'b2400000-0000-4000-8000-0000000000b2', '2034-03-13');
select lives_ok($$insert into public.timesheet_entries (timesheet_id, work_date, start_time, end_time, hours) values
  ('f2400000-0000-4000-8000-0000000000f2', '2034-03-13', '08:00', '12:00', 1),
  ('f2400000-0000-4000-8000-0000000000f3', '2034-03-13', '12:00', '16:00', 1)$$,
  'T10 dva projekta istog dana 4 h + 4 h bez preklapanja prolaze');
select is((select array_agg(mon_hours order by project) from public.timesheets where id in
  ('f2400000-0000-4000-8000-0000000000f2', 'f2400000-0000-4000-8000-0000000000f3')),
  array[4.00, 4.00]::numeric[], 'dan sa intervalima = zbir intervala (sati iz vremena, ne iz unosa)');
select throws_ok($$update public.timesheets set mon_hours = 6 where id = 'f2400000-0000-4000-8000-0000000000f2'$$,
  '23514', null, 'ručna izmena dana koji ima intervale se odbija');
insert into public.timesheet_entries (timesheet_id, work_date, start_time, end_time, hours)
  values ('f2400000-0000-4000-8000-0000000000f2', '2034-03-14', '08:00', '12:00', 1);
select throws_ok($$insert into public.timesheet_entries (timesheet_id, work_date, start_time, end_time, hours)
  values ('f2400000-0000-4000-8000-0000000000f3', '2034-03-14', '11:00', '15:00', 1)$$,
  '23P01', null, 'T10 preklopljeni intervali 08–12 i 11–15 (različiti projekti) su odbijeni');
update public.timesheets set wed_hours = 14 where id = 'f2400000-0000-4000-8000-0000000000f2';
select throws_like($$update public.timesheets set wed_hours = 12 where id = 'f2400000-0000-4000-8000-0000000000f3'$$,
  '%15.03.2034 bi bio 26 h%', 'T10 zbir 14 + 12 h u danu je odbijen (najviše 24 h)');

-- ───── T09: poslato i odbijeno nisu u dnevnim linijama ─────
update public.timesheets set approval_status = 'submitted' where id in
  ('f2400000-0000-4000-8000-0000000000f2', 'f2400000-0000-4000-8000-0000000000f3');
update public.timesheets set approval_status = 'rejected', rejection_reason = 'QA-24 pogrešni sati'
  where id = 'f2400000-0000-4000-8000-0000000000f3';
select is((select (rejected_by, rejection_reason)::text from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f3'),
  '(92400000-0000-4000-8000-0000000000a1,"QA-24 pogrešni sati")', 'odbijanje beleži ko i zašto');
reset role;
select is((select count(*) from public.labor_day_lines('2034-03-13', '2034-03-19') l
           where l.employee_id = 'd2400000-0000-4000-8000-0000000000d1')::int, 0,
  'T09 poslata i odbijena satnica nisu u labor_day_lines');
select is((select (count(*), sum(round(l.hours * l.worker_rate * l.worker_coef, 2)), sum(round(l.hours * l.client_rate * l.client_coef, 2)))::text
           from public.labor_day_lines('2034-03-06', '2034-03-12') l where l.employee_id = 'd2400000-0000-4000-8000-0000000000d1'),
  '(5,448.00,800.00)', 'T09 odobrena satnica jeste u labor_day_lines (5 dana, 448 / 800)');
select is((select count(*) from public.timesheet_entries where timesheet_id = 'f2400000-0000-4000-8000-0000000000f3' and counts)::int, 0,
  'intervali odbijene satnice se ne broje u proveri preklapanja');

-- ───── K11: korekcija odobrene satnice ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_ok($$update public.timesheets set approval_status = 'draft' where id = 'f2400000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'K11 direktno vraćanje odobrene satnice u nacrt se odbija');
select throws_like($$select public.reopen_timesheet('f2400000-0000-4000-8000-0000000000f1', '  ')$$,
  '%Razlog korekcije je obavezan%', 'K11 korekcija bez razloga je odbijena');
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select public.reopen_timesheet('f2400000-0000-4000-8000-0000000000f1', 'QA-24 pogrešan dan')$$,
  '42501', null, 'K11 HR nema pravo na korekciju (timesheets.correct)');
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select lives_ok($$select public.reopen_timesheet('f2400000-0000-4000-8000-0000000000f1', 'QA-24 pogrešan dan')$$,
  'K11 korekcija sa razlogom prolazi');
reset role;
select is((select (t.approval_status, t.correction_count, t.last_correction_reason, t.rate_snapshot is null)::text
           from public.timesheets t where t.id = 'f2400000-0000-4000-8000-0000000000f1'),
  '(draft,1,"QA-24 pogrešan dan",t)', 'K11 satnica je nacrt, broj i razlog korekcije upisani, snimak uklonjen');
select ok(exists (select 1 from public.audit_log a where a.table_name = 'timesheets'
                  and a.record_id = 'f2400000-0000-4000-8000-0000000000f1' and a.action = 'correction'
                  and a.reason = 'QA-24 pogrešan dan'), 'K11 audit beleži korekciju sa razlogom');

-- Odobren obračun meseca → korekcija ide kao Payable adjustment.
set local role authenticated;
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
update public.timesheets set approval_status = 'approved' where id = 'f2400000-0000-4000-8000-0000000000f1';
reset role;
insert into public.month_locks (month) values ('2034-03-01');
insert into public.payroll_runs (id, month, eur_rsd_rate, params) values ('a2499999-0000-4000-8000-000000000001', '2034-03-01', 117.2, '{}');
select set_config('app.payroll_workflow', 'on', true);
update public.payroll_runs set status = 'approved' where id = 'a2499999-0000-4000-8000-000000000001';
select set_config('app.payroll_workflow', 'off', true);
set local role authenticated;
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select throws_like($$select public.reopen_timesheet('f2400000-0000-4000-8000-0000000000f1', 'QA-24 posle obračuna')$$,
  '%Payable adjustment%', 'K11 sa odobrenim obračunom meseca korekcija je odbijena');

-- ───── T26: vidljivost novca po pravu ─────
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select worker_cost from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'T26 HR ne može da čita worker_cost iz timesheets');
select is((select (m.worker_cost, m.client_revenue, m.rate_snapshot -> 'days' -> 0 -> 'worker')::text
           from public.timesheet_money m where m.timesheet_id = 'f2400000-0000-4000-8000-0000000000f1'),
  '(,,null)', 'T26 HR u timesheet_money dobija null iznose i maskiran snimak');
select is((select total_hours from public.timesheets where id = 'f2400000-0000-4000-8000-0000000000f1'), 40.00::numeric,
  'T26 HR i dalje čita sate');
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is((select (m.client_revenue, m.worker_cost, m.rate_snapshot -> 'days' -> 0 -> 'client' ->> 'rate')::text
           from public.timesheet_money m where m.timesheet_id = 'f2400000-0000-4000-8000-0000000000f1'),
  '(800.00,,20.00)', 'T26 PM vidi client_revenue i B2B tarifu, ne vidi worker_cost');


-- T26 i za profil radnika: HR čita lične podatke, ali ne zaradu ni satnice iz profila.
set local request.jwt.claims to '{"sub":"92400000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select throws_ok($$select salary from public.employee_private where employee_id = 'd2400000-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'T26 HR ne može da čita salary iz employee_private');
select lives_ok($$select jmbg, iban, rate_basis from public.employee_private where employee_id = 'd2400000-0000-4000-8000-0000000000d1'$$,
  'T26 HR i dalje čita lične podatke');
select is((select (m.salary, m.b2c_hourly_rate, m.b2b_hourly_rate)::text from public.employee_private_money m
           where m.employee_id = 'd2400000-0000-4000-8000-0000000000d1'), '(,,)', 'T26 HR u employee_private_money dobija null');
update public.employee_private set salary = null, b2c_hourly_rate = 99, iban = 'QA24' where employee_id = 'd2400000-0000-4000-8000-0000000000d1';
reset role;
select is((select (salary, b2c_hourly_rate, iban)::text from public.employee_private where employee_id = 'd2400000-0000-4000-8000-0000000000d1'),
  '(1500.00,11.00,QA24)', 'T26 HR izmenom profila ne briše ni ne menja zaradu i satnice (menja samo lične podatke)');

select * from finish();
rollback;
