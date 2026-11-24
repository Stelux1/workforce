-- Leave kapacitet i Smart Replacement (migracija 20261125100000_odsustva_zamene.sql; spec §14; model §2.12; traka W2-L).
-- Isti primer kao src/lib/replacements.test.js (paritet JS/SQL): T21, T23, T24.
-- P1 traži 2 zavarivača ujutru (e1, e2 po podrazumevanoj smeni); e1 traži odmor 15.–16.3.2033.
-- P2 traži 1 zavarivača ujutru (e4) i 1 popodne (e3, e5). e5 je na bolovanju 16.
-- Sopstveni podaci sa oznakom QA-30 i 2033. godina. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('73000000-0000-4000-8000-0000000000a1', 'qa30-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73000000-0000-4000-8000-0000000000a2', 'qa30-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73000000-0000-4000-8000-0000000000a3', 'qa30-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73000000-0000-4000-8000-0000000000a4', 'qa30-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = '73000000-0000-4000-8000-0000000000a1';
update public.profiles set role = 'hr', active = true where id = '73000000-0000-4000-8000-0000000000a2';
update public.profiles set role = 'finance', active = true where id = '73000000-0000-4000-8000-0000000000a3';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all', full_name = 'QA-30 Menadžer'
 where id = '73000000-0000-4000-8000-0000000000a4';

insert into public.projects (id, name, client_name, city) values
  ('73000000-0000-4000-8000-0000000000b1', 'QA-30 Rafinerija', 'QA-30 klijent', 'Bratislava'),
  ('73000000-0000-4000-8000-0000000000b2', 'QA-30 Most', 'QA-30 klijent', 'Košice');
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000b1', 'QA-30 Zavarivač'),
  ('73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000b2', 'QA-30 Zavarivač');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('73000000-0000-4000-8000-0000000000d1', null, 'QA30-J', 'Jutro', '06:00', '14:00'),
  ('73000000-0000-4000-8000-0000000000d2', null, 'QA30-P', 'Popodne', '14:00', '22:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73000000-0000-4000-8000-0000000000e1', 'QA-30', 'Odmor', 'QA-30-001'),
  ('73000000-0000-4000-8000-0000000000e2', 'QA-30', 'Jutro', 'QA-30-002'),
  ('73000000-0000-4000-8000-0000000000e3', 'QA-30', 'Popodne', 'QA-30-003'),
  ('73000000-0000-4000-8000-0000000000e4', 'QA-30', 'Most', 'QA-30-004'),
  ('73000000-0000-4000-8000-0000000000e5', 'QA-30', 'Delimično', 'QA-30-005'),
  ('73000000-0000-4000-8000-0000000000e6', 'QA-30', 'Bez plana', 'QA-30-006'),
  ('73000000-0000-4000-8000-0000000000e7', 'QA-30', 'Rezerva', 'QA-30-007');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, default_shift_id, start_date, end_date, status) values
  ('73000000-0000-4000-8000-0000000000f1', '73000000-0000-4000-8000-0000000000e1', '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1', '2033-03-01', null, 'active'),
  ('73000000-0000-4000-8000-0000000000f2', '73000000-0000-4000-8000-0000000000e2', '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1', '2033-03-01', null, 'active'),
  ('73000000-0000-4000-8000-0000000000f3', '73000000-0000-4000-8000-0000000000e3', '73000000-0000-4000-8000-0000000000b2', '73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000d2', '2033-03-01', null, 'active'),
  ('73000000-0000-4000-8000-0000000000f4', '73000000-0000-4000-8000-0000000000e4', '73000000-0000-4000-8000-0000000000b2', '73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000d1', '2033-03-01', null, 'active'),
  ('73000000-0000-4000-8000-0000000000f5', '73000000-0000-4000-8000-0000000000e5', '73000000-0000-4000-8000-0000000000b2', '73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000d2', '2033-03-01', null, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count) values
  ('73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1', '2033-03-01', '2033-03-31', 2),
  ('73000000-0000-4000-8000-0000000000b2', '73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000d1', '2033-03-01', '2033-03-31', 1),
  ('73000000-0000-4000-8000-0000000000b2', '73000000-0000-4000-8000-0000000000c2', '73000000-0000-4000-8000-0000000000d2', '2033-03-01', '2033-03-31', 1);
insert into public.schedules (id, employee_id, date, shift_id, project_id, status, shift_start, shift_end) values
  ('73000000-0000-4000-8000-0000000000aa', '73000000-0000-4000-8000-0000000000e7', '2033-03-15', '73000000-0000-4000-8000-0000000000d1', '73000000-0000-4000-8000-0000000000b1', 'standby', 'x', 'x');
-- kao postgres (migracija/seed) status sme da se upiše direktno
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, status) values
  ('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e1', 'vacation', '2033-03-15', '2033-03-16', 'pending'),
  ('73000000-0000-4000-8000-000000000105', '73000000-0000-4000-8000-0000000000e5', 'sick', '2033-03-16', '2033-03-16', 'approved'),
  ('73000000-0000-4000-8000-000000000106', '73000000-0000-4000-8000-0000000000e6', 'personal', '2033-03-20', '2033-03-21', 'pending');

-- ───── HR: direktne izmene statusa su odbijene ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"73000000-0000-4000-8000-0000000000a2","role":"authenticated"}';

select throws_ok($$update public.leave_requests set status = 'approved' where id = '73000000-0000-4000-8000-000000000101'$$,
  '42501', null, 'T24: direktan update statusa je odbijen');
select throws_ok($$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, status)
  values ('73000000-0000-4000-8000-0000000000e2', 'vacation', '2033-04-01', '2033-04-02', 'approved')$$,
  '42501', null, 'T24: nov zahtev ne može odmah da bude odobren');
select lives_ok($$update public.leave_requests set reason = 'QA-30 more' where id = '73000000-0000-4000-8000-000000000101'$$,
  'zahtev na čekanju sme da se dopuni');
select is((select requested_by from public.leave_requests where reason is null and employee_id = '73000000-0000-4000-8000-0000000000e6'), null::uuid,
  'stari zahtev (bez prijave) nema requested_by');

-- ───── T21: manjak zbog odsustva ─────
select is(jsonb_array_length(public.leave_shortage('73000000-0000-4000-8000-000000000101')), 2, 'T21: odsustvo obara 2 reda (15. i 16.)');
select results_eq($$select (r ->> 'date')::date, (r ->> 'required')::int, (r ->> 'available')::int, (r ->> 'deficit')::int, (r ->> 'deficit_before')::int
                      from jsonb_array_elements(public.leave_shortage('73000000-0000-4000-8000-000000000101')) r$$,
  $$values ('2033-03-15'::date, 2, 1, 1, 0), ('2033-03-16'::date, 2, 1, 1, 0)$$, 'T21: tačan broj nedostajućih po danu (P1, Zavarivač, jutro)');
select ok((select bool_and(r ->> 'project_id' = '73000000-0000-4000-8000-0000000000b1' and r ->> 'project_role_id' = '73000000-0000-4000-8000-0000000000c1'
                           and r ->> 'shift_id' = '73000000-0000-4000-8000-0000000000d1')
             from jsonb_array_elements(public.leave_shortage('73000000-0000-4000-8000-000000000101')) r),
  'T21: manjak je po projektu, ulozi i smeni na kojoj je radnik planiran');
select is(jsonb_array_length(public.leave_shortage('73000000-0000-4000-8000-000000000106')), 0, 'radnik bez plana: odsustvo ne pravi manjak');

-- ───── T24: odobrenje uprkos manjku ─────
select throws_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'approved', 'Hitan porodični razlog')$$,
  '42501', 'Nemate pravo „leave.approve_shortage"', 'T24: HR (bez leave.approve_shortage) ne odobrava uz manjak');
select lives_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000106', 'approved', null)$$,
  'HR odobrava odsustvo bez manjka (bez razloga)');
select results_eq($$select status, shortage_override, jsonb_array_length(shortage_snapshot), decided_by from public.leave_requests where id = '73000000-0000-4000-8000-000000000106'$$,
  $$values ('approved'::text, false, 0, '73000000-0000-4000-8000-0000000000a2'::uuid)$$, 'odluka bez manjka: ko, bez override-a');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"73000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'rejected', null)$$,
  '42501', 'Nemate pravo „leave.approve"', 'Finance nema leave.approve');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"73000000-0000-4000-8000-0000000000a4","role":"authenticated"}';
select throws_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'approved', null)$$,
  '23514', 'Odobrenje uprkos manjku traži razlog (najmanje 5 znakova)', 'T24: bez razloga odbijeno');
select throws_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'approved', ' ok ')$$,
  '23514', 'Odobrenje uprkos manjku traži razlog (najmanje 5 znakova)', 'T24: prekratak razlog odbijen');
select is((select status from public.leave_requests where id = '73000000-0000-4000-8000-000000000101'), 'pending', 'T24: posle odbijenih pokušaja zahtev je i dalje na čekanju');
select lives_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'approved', 'Hitan porodični razlog')$$,
  'T24: PM sa pravom i razlogom odobrava');
select results_eq($$select status, shortage_override, decision_reason, decided_by, reviewed_by from public.leave_requests where id = '73000000-0000-4000-8000-000000000101'$$,
  $$values ('approved'::text, true, 'Hitan porodični razlog'::text, '73000000-0000-4000-8000-0000000000a4'::uuid, 'QA-30 Menadžer'::text)$$,
  'T24: ko, zašto i override su zapisani');
select ok((select decided_at is not null from public.leave_requests where id = '73000000-0000-4000-8000-000000000101'), 'T24: kada je zapisano');
select results_eq($$select (r ->> 'date')::date, (r ->> 'deficit')::int from public.leave_requests l, jsonb_array_elements(l.shortage_snapshot) r
                     where l.id = '73000000-0000-4000-8000-000000000101'$$,
  $$values ('2033-03-15'::date, 1), ('2033-03-16'::date, 1)$$, 'T21: shortage_snapshot je tačan');
select throws_ok($$select public.decide_leave_request('73000000-0000-4000-8000-000000000101', 'rejected', null)$$,
  '23514', 'O zahtevu je već odlučeno', 'odluka se ne ponavlja');
select throws_ok($$update public.leave_requests set end_date = '2033-03-20' where id = '73000000-0000-4000-8000-000000000101'$$,
  '42501', 'Odlučen zahtev za odsustvo se ne menja — napravite novi zahtev', 'odobren zahtev se ne menja');
select throws_ok($$insert into public.leave_requests (employee_id, leave_type, start_date, end_date)
  values ('73000000-0000-4000-8000-0000000000e1', 'personal', '2033-03-16', '2033-03-18')$$,
  '23P01', null, 'zahtev koji preklapa odobren zahtev istog radnika je odbijen');
select is((select count(*)::int from public.workforce_coverage('2033-03-15', '2033-03-16', '73000000-0000-4000-8000-0000000000b1') where deficit = 1), 2,
  'posle odobrenja coverage pokazuje deficit 1 u oba dana');

-- ───── T23: zamena i transfer ─────
select throws_like($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e4',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-16', '73000000-0000-4000-8000-0000000000f4', false)$$,
  '%nedostaje još 2%', 'T23: transfer bez potvrde je odbijen i navodi manjak izvornog projekta');
select is((select count(*)::int from public.project_assignments where employee_id = '73000000-0000-4000-8000-0000000000e4' and assignment_type = 'replacement'), 0,
  'T23: bez potvrde nema dodele');
select is((select count(*)::int from public.schedules where employee_id = '73000000-0000-4000-8000-0000000000e4'), 0, 'T23: bez potvrde raspored se ne menja');
select lives_ok($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e4',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-16', '73000000-0000-4000-8000-0000000000f4', true)$$,
  'T23: transfer uz potvrdu prolazi');
select results_eq($$select assignment_type, leave_request_id, source_assignment_id, default_shift_id, start_date, end_date from public.project_assignments
                     where employee_id = '73000000-0000-4000-8000-0000000000e4' and project_id = '73000000-0000-4000-8000-0000000000b1'$$,
  $$values ('replacement'::text, '73000000-0000-4000-8000-000000000101'::uuid, '73000000-0000-4000-8000-0000000000f4'::uuid,
            '73000000-0000-4000-8000-0000000000d1'::uuid, '2033-03-15'::date, '2033-03-16'::date)$$, 'privremena dodela: zamena po datumu i smeni');
select results_eq($$select deficit from public.workforce_coverage('2033-03-15', '2033-03-16', '73000000-0000-4000-8000-0000000000b1')$$,
  $$values (0), (0)$$, 'posle potvrde deficit ciljnog projekta je 0');
select results_eq($$select deficit from public.workforce_coverage('2033-03-15', '2033-03-16', '73000000-0000-4000-8000-0000000000b2')
                     where shift_id = '73000000-0000-4000-8000-0000000000d1'$$,
  $$values (1), (1)$$, 'T23: izvorni projekat ostaje bez radnika (deficit 1)');
select results_eq($$select date, status from public.schedules where employee_id = '73000000-0000-4000-8000-0000000000e4' order by date, status$$,
  $$values ('2033-03-15'::date, 'released'::text), ('2033-03-15'::date, 'replacement'::text), ('2033-03-16'::date, 'released'::text), ('2033-03-16'::date, 'replacement'::text)$$,
  'izvorni raspored je oslobođen (released), istorija ostaje');
select is((select end_date from public.project_assignments where id = '73000000-0000-4000-8000-0000000000f4'), null::date, 'postojeća dodela se ne završava');

-- slobodan radnik iz druge smene: njegov projekat ne gubi smenu
select lives_ok($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e3',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-15', null, false)$$,
  'slobodan radnik (popodne na P2) zamenjuje ujutru bez potvrde');
select is((select deficit from public.workforce_coverage('2033-03-15', '2033-03-15', '73000000-0000-4000-8000-0000000000b2')
            where shift_id = '73000000-0000-4000-8000-0000000000d2'), 0, 'popodnevna smena P2 i dalje pokrivena');
select is((select status from public.schedules where employee_id = '73000000-0000-4000-8000-0000000000e3' and shift_id = '73000000-0000-4000-8000-0000000000d2'),
  'assigned', 'podrazumevana smena je zapisana kao assigned');

-- standby se oslobađa
select lives_ok($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e7',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-15', null, false)$$, 'standby radnik postaje zamena');
select is((select status from public.schedules where id = '73000000-0000-4000-8000-0000000000aa'), 'released', 'standby red je released');

-- odbijeni slučajevi
select throws_like($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e5',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-16', null, true)$$, 'Radnik je na odsustvu 16.03.2033%', 'radnik na odsustvu ne može da bude zamena tog dana');
select throws_ok($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e1',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-15', null, false)$$, '23514', 'Radnik ne može da zameni sam sebe', 'radnik ne menja sam sebe');
select throws_like($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e6',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-14', '2033-03-15', null, false)$$, 'Zamena mora biti u periodu odsustva%', 'zamena van perioda odsustva je odbijena');

-- obaveštenje „kandidat za zamenu" (W2-H): idempotentno
select is(public.notify_replacement_candidates('73000000-0000-4000-8000-000000000101',
  '[{"employee_id":"73000000-0000-4000-8000-0000000000e6","project_id":"73000000-0000-4000-8000-0000000000b1","category":"full_match"}]'), 1,
  'kandidat za zamenu: obaveštenje upisano');
select is(public.notify_replacement_candidates('73000000-0000-4000-8000-000000000101',
  '[{"employee_id":"73000000-0000-4000-8000-0000000000e6","project_id":"73000000-0000-4000-8000-0000000000b1","category":"full_match"}]'), 0,
  'kandidat za zamenu: drugi poziv ne pravi duplikat');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"73000000-0000-4000-8000-0000000000a3","role":"authenticated"}';
select throws_ok($$select public.assign_replacement('73000000-0000-4000-8000-000000000101', '73000000-0000-4000-8000-0000000000e6',
    '73000000-0000-4000-8000-0000000000b1', '73000000-0000-4000-8000-0000000000c1', '73000000-0000-4000-8000-0000000000d1',
    '2033-03-15', '2033-03-15', null, false)$$, '42501', 'Nemate pravo „workforce.manage"', 'Finance ne dodeljuje zamenu');

-- ───── audit (kao postgres) ─────
reset role;
set local request.jwt.claims to '{}';
select results_eq($$select action, reason, actor from public.audit_log
                     where table_name = 'leave_requests' and record_id = '73000000-0000-4000-8000-000000000101' and changed_fields @> array['status']$$,
  $$values ('status'::text, 'Hitan porodični razlog'::text, '73000000-0000-4000-8000-0000000000a4'::uuid)$$, 'T24: audit odluke ima razlog i aktera');
select is((select count(*)::int from public.audit_log where table_name = 'project_assignments' and action = 'status'
            and new_data ->> 'source_missing' = '2' and reason like '%potvrđen manjak na izvornom projektu'), 1,
  'T23: audit potvrđenog manjka izvornog projekta');
select is(has_function_privilege('anon', 'public.decide_leave_request(uuid, text, text)', 'execute')
          or has_function_privilege('anon', 'public.assign_replacement(uuid, uuid, uuid, uuid, uuid, date, date, uuid, boolean)', 'execute'), false,
  'anon ne sme decide_leave_request ni assign_replacement');

select * from finish();
rollback;
