-- Obaveštenja (migracija 20261125110000_obavestenja.sql, spec §15.01; traka W2-H).
-- Datumi su vezani za današnji dan (obaveštenja su „danas..+30"), a sopstveni podaci nose oznaku QA-31.
-- Pokrivenost: bez duplikata, resolved_at, publika po pravu (HR ne vidi payable_due), „pročitano" po korisniku.
-- Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('73100000-0000-4000-8000-0000000000a1', 'qa31-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73100000-0000-4000-8000-0000000000a2', 'qa31-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73100000-0000-4000-8000-0000000000a3', 'qa31-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73100000-0000-4000-8000-0000000000a4', 'qa31-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '73100000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'hr', active = true where id = '73100000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'finance', active = true where id = '73100000-0000-4000-8000-0000000000a3';
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned' where id = '73100000-0000-4000-8000-0000000000a4';

insert into public.projects (id, name, client_name) values
  ('73100000-0000-4000-8000-0000000000b1', 'QA-31 projekat', 'QA-31 klijent'),
  ('73100000-0000-4000-8000-0000000000b2', 'QA-31 drugi projekat', 'QA-31 klijent');
insert into public.user_project_access (user_id, project_id) values
  ('73100000-0000-4000-8000-0000000000a4', '73100000-0000-4000-8000-0000000000b2');
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('73100000-0000-4000-8000-0000000000c1', '73100000-0000-4000-8000-0000000000b1', 'QA-31 Zavarivač');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('73100000-0000-4000-8000-0000000000d1', null, 'QA31-J', 'Jutro', '06:00', '14:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73100000-0000-4000-8000-0000000000e1', 'QA-31', 'Jedan', 'QA-31-001'),
  ('73100000-0000-4000-8000-0000000000e2', 'QA-31', 'Dva', 'QA-31-002');
-- e1: angažman koji ističe za 10 dana; potrebna su 2 radnika na toj ulozi i smeni, a ima samo jednog
insert into public.project_assignments (id, employee_id, project_id, position, project_role_id, default_shift_id, start_date, end_date, status) values
  ('73100000-0000-4000-8000-0000000000f1', '73100000-0000-4000-8000-0000000000e1', '73100000-0000-4000-8000-0000000000b1',
   'QA-31 Zavarivač', '73100000-0000-4000-8000-0000000000c1', '73100000-0000-4000-8000-0000000000d1', current_date - 10, current_date + 10, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count) values
  ('73100000-0000-4000-8000-0000000000b1', '73100000-0000-4000-8000-0000000000c1', '73100000-0000-4000-8000-0000000000d1', current_date + 1, current_date + 3, 2);
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, status) values
  ('73100000-0000-4000-8000-0000000000a9', '73100000-0000-4000-8000-0000000000e1', 'vacation', current_date + 20, current_date + 21, 'pending');
-- dokument koji ističe za 10 dana; obavezan pasoš koji radnik nema
insert into public.documents (id, employee_id, title, category, expiration_date) values
  ('73100000-0000-4000-8000-0000000000aa', '73100000-0000-4000-8000-0000000000e1', 'QA-31 dozvola', 'work_permit', current_date + 10);
insert into public.required_documents (project_id, project_role_id, document_type, mandatory) values
  ('73100000-0000-4000-8000-0000000000b1', null, 'passport', true);
-- obaveza i potraživanje sa prošlim rokom
insert into public.vendors (id, name) values ('73100000-0000-4000-8000-0000000000ab', 'QA-31 vendor');
insert into public.clients (id, name) values ('73100000-0000-4000-8000-0000000000ac', 'QA-31 klijent');
-- (trigger guard_payable dozvoljava insert samo kroz generisanje; za pripremu testa se isključuje)
alter table public.payables disable trigger payables_guard;
insert into public.payables (id, period_start, period_end, payee_type, vendor_id, currency, status, due_date, calculated_amount) values
  ('73100000-0000-4000-8000-0000000000ad', current_date - 40, current_date - 30, 'vendor', '73100000-0000-4000-8000-0000000000ab', 'EUR', 'confirmed', current_date - 3, 1000);
alter table public.payables enable trigger payables_guard;
-- (trigeri guard i overlap su pravila za status i period; za pripremu testa se isključuju)
alter table public.billing_summaries disable trigger billing_summaries_guard;
alter table public.billing_summaries disable trigger billing_summaries_overlap;
insert into public.billing_summaries (id, client_id, period_start, period_end, currency, status, ext_invoice_reference, ext_invoice_amount, ext_invoice_currency, ext_due_date) values
  ('73100000-0000-4000-8000-0000000000ae', '73100000-0000-4000-8000-0000000000ac', current_date - 40, current_date - 30, 'EUR', 'invoiced_externally', 'QA31-INV', 500, 'EUR', current_date - 2);
alter table public.billing_summaries enable trigger billing_summaries_guard;
alter table public.billing_summaries enable trigger billing_summaries_overlap;
-- stari red iz Base44 vremena: bez publike, već pročitan (ostaje vidljiv osoblju i ne broji se kao nepročitan)
insert into public.notifications (id, title, message, type, is_read) values
  ('73100000-0000-4000-8000-0000000000b9', 'QA-31 stari', 'stari red', 'general', true);

-- ───── admin: osvežavanje ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a1","role":"authenticated"}';

-- satnica na odobrenju (admin je predaje)
select lives_ok($$insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours)
  values ('73100000-0000-4000-8000-0000000000af', '73100000-0000-4000-8000-0000000000e1', '73100000-0000-4000-8000-0000000000b1',
          date_trunc('week', current_date)::date, 8)$$, 'priprema: nacrt satnice');
select lives_ok($$update public.timesheets set approval_status = 'submitted' where id = '73100000-0000-4000-8000-0000000000af'$$,
  'priprema: satnica predata na odobrenje');

select cmp_ok(public.refresh_notifications(), '>=', 8, 'prvi poziv upisuje obaveštenja za svih 8 događaja');
select is((select count(*)::int from public.notifications where event_key like '%73100000-0000-4000-8000-0000000000%'), 10,
  'QA-31 podaci daju tačno ta obaveštenja (3 dana manjka + 7 drugih događaja = 10)');

-- 1) bez duplikata
select is(public.refresh_notifications(), 0, 'drugi poziv ne upisuje ništa novo');
select is((select count(*)::int - count(distinct event_key)::int from public.notifications where event_key is not null), 0,
  'nijedan event_key se ne ponavlja');
select is((select count(*)::int from public.notifications where event_key like '%73100000-0000-4000-8000-0000000000%'), 10,
  'broj QA-31 obaveštenja je isti posle drugog poziva');

-- 2) svaka vrsta događaja
select is((select count(*)::int from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9' and type = 'leave_request' and audience_permission = 'leave.approve'),
  1, 'odmor na čekanju → leave.approve');
select is((select count(*)::int from public.notifications where event_key like 'shortage:73100000-0000-4000-8000-0000000000b1:%' and type = 'workforce_shortage' and audience_permission = 'workforce.manage' and (payload ->> 'deficit')::int = 1),
  3, 'manjak: po jedno obaveštenje za svaki dan sa deficitom 1');
select is((select count(*)::int from public.notifications where event_key = 'doc_expiry:73100000-0000-4000-8000-0000000000aa:' || (current_date + 10) and type = 'document_expiry' and audience_permission = 'documents.manage'),
  1, 'dokument koji ističe → documents.manage');
select is((select count(*)::int from public.notifications where event_key like 'doc_missing:73100000-0000-4000-8000-0000000000f1:%' and type = 'document_missing' and audience_permission = 'onboarding.manage'),
  1, 'obavezan dokument koji fali → onboarding.manage');
select is((select count(*)::int from public.notifications where event_key = 'assignment_ending:73100000-0000-4000-8000-0000000000f1:' || (current_date + 10) and type = 'assignment_expiry' and audience_permission = 'assignments.manage'),
  1, 'angažman koji ističe → assignments.manage');
select is((select count(*)::int from public.notifications where event_key = 'timesheet_pending:73100000-0000-4000-8000-0000000000af' and type = 'timesheet_pending' and audience_permission = 'timesheets.approve'),
  1, 'satnica na odobrenju → timesheets.approve');
select is((select count(*)::int from public.notifications where event_key = 'payable_due:73100000-0000-4000-8000-0000000000ad:' || (current_date - 3) and type = 'payable_due' and audience_permission = 'payroll.view' and severity = 'critical'),
  1, 'dospela obaveza → payroll.view');
select is((select count(*)::int from public.notifications where event_key = 'receivable_due:73100000-0000-4000-8000-0000000000ae:' || (current_date - 2) and type = 'receivable_due' and audience_permission = 'billing.view'),
  1, 'dospelo potraživanje → billing.view');
select is((select payload ->> 'remaining' from public.notifications where event_key like 'payable_due:73100000-0000-4000-8000-0000000000ad:%'), '1000.00',
  'obaveza nosi preostali iznos i valutu u payload-u');
select is((select payload ->> 'currency' from public.notifications where event_key like 'payable_due:73100000-0000-4000-8000-0000000000ad:%'), 'EUR', 'valuta uz iznos');

-- ───── HR ─────
set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select is((select count(*)::int from public.notifications where type = 'payable_due' and event_key like '%73100000-0000-4000-8000-0000000000ad%'), 0,
  'HR ne vidi payable_due');
select is((select count(*)::int from public.notifications where type = 'receivable_due' and event_key like '%73100000-0000-4000-8000-0000000000ae%'), 0,
  'HR ne vidi receivable_due');
select is((select count(*)::int from public.notifications where type = 'timesheet_pending' and event_key like '%73100000-0000-4000-8000-0000000000af%'), 0,
  'HR ne vidi satnice na odobrenju (nema timesheets.approve)');
select is((select count(*)::int from public.notifications where event_key in (
    'leave_pending:73100000-0000-4000-8000-0000000000a9',
    'doc_expiry:73100000-0000-4000-8000-0000000000aa:' || (current_date + 10),
    'assignment_ending:73100000-0000-4000-8000-0000000000f1:' || (current_date + 10))), 3,
  'HR vidi odmor, dokument i angažman');
select is((select count(*)::int from public.notifications where id = '73100000-0000-4000-8000-0000000000b9'), 1, 'stari red bez publike ostaje vidljiv osoblju');
select throws_ok($$insert into public.notifications (title, message, type) values ('x', 'y', 'general')$$, '42501', null,
  'HR ne upisuje obaveštenja direktno');
select is((select public.refresh_notifications()), 0, 'HR može da osveži (staff), ništa novo');

-- ───── „pročitano" po korisniku ─────
select set_config('qa31.hr_before', public.unread_notification_count()::text, true);
select cmp_ok(current_setting('qa31.hr_before')::int, '>=', 5, 'HR ima nepročitana (stari pročitani red se ne broji)');
select is(public.mark_notifications_read(array[(select id from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9')]), 1,
  'HR označava odmor kao pročitan');
select is(public.unread_notification_count(), (current_setting('qa31.hr_before')::int - 1), 'HR-u je nepročitanih jedno manje');
select throws_ok($$insert into public.notification_reads (notification_id, user_id)
  select id, '73100000-0000-4000-8000-0000000000a1' from public.notifications limit 1$$, '42501', null,
  'HR ne označava obaveštenja u ime drugog korisnika');

set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select is((select count(*)::int from public.notification_reads where notification_id = (select id from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9')), 0,
  'admin istu stavku i dalje vidi kao nepročitanu (pročitano je po korisniku)');

-- ───── finansije ─────
set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select is((select count(*)::int from public.notifications where event_key in (
    'payable_due:73100000-0000-4000-8000-0000000000ad:' || (current_date - 3),
    'receivable_due:73100000-0000-4000-8000-0000000000ae:' || (current_date - 2),
    'timesheet_pending:73100000-0000-4000-8000-0000000000af')), 3,
  'Finance vidi dospelu obavezu, potraživanje i satnicu na odobrenju');
select is((select count(*)::int from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9'), 0, 'Finance ne vidi odmore (nema leave.approve)');

-- ───── PM sa pristupom samo projektu b2 ─────
set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select is((select count(*)::int from public.notifications where event_key like 'shortage:73100000-0000-4000-8000-0000000000b1:%'
   or event_key like 'assignment_ending:73100000-0000-4000-8000-0000000000f1:%'), 0,
  'PM sa pristupom samo drugom projektu ne vidi obaveštenja projekta b1');

-- ───── uslov prestaje → resolved_at; vraća se → ponovo otvoreno ─────
set local request.jwt.claims to '{"sub":"73100000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select set_config('app.leave_decision', 'on', true);
update public.leave_requests set status = 'rejected' where id = '73100000-0000-4000-8000-0000000000a9';
update public.payables set due_date = current_date + 5 where id = '73100000-0000-4000-8000-0000000000ad';
select public.refresh_notifications();
select isnt((select resolved_at from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9'), null,
  'odbijen zahtev: obaveštenje dobija resolved_at');
select isnt((select resolved_at from public.notifications where event_key = 'payable_due:73100000-0000-4000-8000-0000000000ad:' || (current_date - 3)), null,
  'obaveza kojoj je rok pomeren: obaveštenje dobija resolved_at');
select is((select resolved_at from public.notifications where event_key like 'doc_expiry:73100000-0000-4000-8000-0000000000aa:%'), null,
  'dokument i dalje ističe: obaveštenje ostaje otvoreno');
select is((select count(*)::int from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9'), 1,
  'rešeno obaveštenje se ne briše i ne duplira');
update public.leave_requests set status = 'pending' where id = '73100000-0000-4000-8000-0000000000a9';
select public.refresh_notifications();
select is((select resolved_at from public.notifications where event_key = 'leave_pending:73100000-0000-4000-8000-0000000000a9'), null,
  'uslov se vratio: obaveštenje je ponovo otvoreno');

-- ───── anon ─────
set local role anon;
select throws_ok($$select public.refresh_notifications()$$, '42501', null, 'anon ne poziva refresh_notifications');

select * from finish();
rollback;
