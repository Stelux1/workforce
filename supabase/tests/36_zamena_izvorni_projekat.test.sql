-- Zamena sa projekta koji PM ne vidi (migracija 20261125170000_zamena_izvorni_projekat.sql; spec §14.2, T23; model §2.12).
-- Isti primer kao src/lib/replacements.test.js („T23: projekat koji korisnik ne vidi").
-- P1 (PM vidi) traži 2 zavarivača ujutru: e1 (odmor 15.–16.) i e2. P2 (PM NE vidi) traži 1 ujutru: e4.
-- PM premešta e4 sa P2 na P1: bez potvrde odbijanje sa brojem koji nedostaje (2), uz potvrdu prolazi i ostaje audit.
-- e8 radi na P2 na ulozi bez zahteva: premeštaj ne pravi manjak, ali menja raspored skrivenog projekta → potvrda + audit.
-- Sopstveni podaci sa oznakom QA-36 i 2036. godina. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('73600000-0000-4000-8000-0000000000a1', 'qa36-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned', full_name = 'QA-36 Menadžer'
 where id = '73600000-0000-4000-8000-0000000000a1';

insert into public.projects (id, name, client_name) values
  ('73600000-0000-4000-8000-0000000000b1', 'QA-36 Rafinerija', 'QA-36 klijent'),
  ('73600000-0000-4000-8000-0000000000b2', 'QA-36 Most', 'QA-36 klijent');
insert into public.user_project_access (user_id, project_id) values
  ('73600000-0000-4000-8000-0000000000a1', '73600000-0000-4000-8000-0000000000b1');
alter table public.project_roles disable trigger project_roles_sync_cache;
alter table public.project_assignments disable trigger project_assignments_sync_cache;
insert into public.project_roles (id, project_id, title) values
  ('73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000b1', 'QA-36 Zavarivač'),
  ('73600000-0000-4000-8000-0000000000c2', '73600000-0000-4000-8000-0000000000b2', 'QA-36 Zavarivač'),
  ('73600000-0000-4000-8000-0000000000c3', '73600000-0000-4000-8000-0000000000b2', 'QA-36 Pomoćnik');
insert into public.shifts (id, project_id, code, name, start_time, end_time) values
  ('73600000-0000-4000-8000-0000000000d1', null, 'QA36-J', 'Jutro', '06:00', '14:00');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('73600000-0000-4000-8000-0000000000e1', 'QA-36', 'Odmor', 'QA-36-001'),
  ('73600000-0000-4000-8000-0000000000e2', 'QA-36', 'Jutro', 'QA-36-002'),
  ('73600000-0000-4000-8000-0000000000e4', 'QA-36', 'Most', 'QA-36-004'),
  ('73600000-0000-4000-8000-0000000000e8', 'QA-36', 'Pomoćnik', 'QA-36-008');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, default_shift_id, start_date, end_date, status) values
  ('73600000-0000-4000-8000-0000000000f1', '73600000-0000-4000-8000-0000000000e1', '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', null, 'active'),
  ('73600000-0000-4000-8000-0000000000f2', '73600000-0000-4000-8000-0000000000e2', '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', null, 'active'),
  ('73600000-0000-4000-8000-0000000000f4', '73600000-0000-4000-8000-0000000000e4', '73600000-0000-4000-8000-0000000000b2', '73600000-0000-4000-8000-0000000000c2', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', null, 'active'),
  ('73600000-0000-4000-8000-0000000000f8', '73600000-0000-4000-8000-0000000000e8', '73600000-0000-4000-8000-0000000000b2', '73600000-0000-4000-8000-0000000000c3', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', null, 'active');
alter table public.project_roles enable trigger project_roles_sync_cache;
alter table public.project_assignments enable trigger project_assignments_sync_cache;
insert into public.workforce_requirements (project_id, project_role_id, shift_id, date_from, date_to, required_count) values
  ('73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', '2036-03-31', 2),
  ('73600000-0000-4000-8000-0000000000b2', '73600000-0000-4000-8000-0000000000c2', '73600000-0000-4000-8000-0000000000d1', '2036-03-01', '2036-03-31', 1);
-- kao postgres (seed) status sme da se upiše direktno
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, status) values
  ('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e1', 'vacation', '2036-03-15', '2036-03-16', 'approved');

-- odbijanje assign_replacement → {message, hint, detail} (pgTAP ne čita HINT/DETAIL)
create function pg_temp.try_assign(p_employee uuid, p_from date, p_to date, p_source uuid, p_ack boolean) returns jsonb
language plpgsql as $$
declare v_msg text; v_detail text; v_hint text;
begin
  perform public.assign_replacement('73600000-0000-4000-8000-000000000101', p_employee, '73600000-0000-4000-8000-0000000000b1',
    '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1', p_from, p_to, p_source, p_ack);
  return jsonb_build_object('ok', true);
exception when others then
  get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  return jsonb_build_object('ok', false, 'message', v_msg, 'hint', v_hint, 'detail', case when v_detail like '{%' then v_detail::jsonb end);
end $$;

select ok(has_function_privilege('authenticated', 'public.replacement_source_impact(uuid,uuid,uuid,uuid,uuid,date,date,uuid)', 'execute')
          and not has_function_privilege('anon', 'public.replacement_source_impact(uuid,uuid,uuid,uuid,uuid,date,date,uuid)', 'execute'),
  'D14: replacement_source_impact zove authenticated, anon ne');

-- ───── PM sa pristupom samo P1 ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"73600000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select is((select count(*)::int from public.workforce_coverage('2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000b2')), 0,
  'PM ne vidi pokrivenost izvornog projekta kroz workforce_coverage');

-- pregled pre potvrde: svi projekti radnika, bez upisa
select is((public.replacement_source_impact('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e4',
            '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
            '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4') ->> 'missing')::int, 2,
  'T23: pregled pre potvrde vidi manjak 2 na izvornom projektu koji PM ne vidi');
select results_eq($$select r ->> 'project_name', r ->> 'role_title', r ->> 'date', (r ->> 'required')::int, (r ->> 'available')::int,
                           (r ->> 'deficit')::int, (r ->> 'visible')::boolean
                      from jsonb_array_elements(public.replacement_source_impact('73600000-0000-4000-8000-000000000101',
                             '73600000-0000-4000-8000-0000000000e4', '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1',
                             '73600000-0000-4000-8000-0000000000d1', '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4') -> 'rows') r$$,
  $$values ('QA-36 Most'::text, 'QA-36 Zavarivač'::text, '2036-03-15'::text, 1, 0, 1, false),
           ('QA-36 Most'::text, 'QA-36 Zavarivač'::text, '2036-03-16'::text, 1, 0, 1, false)$$,
  'T23: izvorni projekat po nazivu iz baze, po Job Role i danu: potrebno / dostupno / deficit');
select is((select count(*)::int from public.project_assignments where employee_id = '73600000-0000-4000-8000-0000000000e4' and assignment_type = 'replacement')
          + (select count(*)::int from public.schedules where employee_id = '73600000-0000-4000-8000-0000000000e4'), 0,
  'pregled ništa ne upisuje');

-- bez potvrde: odbijanje sa brojem i redovima (samo brojevi i nazivi)
select throws_like($$select public.assign_replacement('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e4',
    '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
    '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4', false)$$,
  'Premeštaj pravi manjak na izvornom projektu: nedostaje još 2 %',
  'T23: PM bez pristupa izvornom projektu — bez potvrde odbijanje sa brojem koji nedostaje');
select is((select r ->> 'hint' || '|' || (r -> 'detail' ->> 'missing') || '|' || (r -> 'detail' -> 'hidden_projects' -> 0 ->> 'project_name')
             from pg_temp.try_assign('73600000-0000-4000-8000-0000000000e4', '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4', false) r),
  'source_shortage|2|QA-36 Most', 'odbijanje nosi HINT source_shortage i DETAIL sa brojem i nazivom izvornog projekta');
select is((select count(*)::int
             from pg_temp.try_assign('73600000-0000-4000-8000-0000000000e4', '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4', false) t
            cross join lateral jsonb_array_elements(t -> 'detail' -> 'rows') r
            cross join lateral jsonb_object_keys(r) k
            where k not in ('project_id', 'project_role_id', 'shift_id', 'date', 'required', 'available_before', 'available',
                            'deficit_before', 'deficit', 'project_name', 'role_title', 'shift_name', 'visible')), 0,
  'DETAIL bez tarifa i ličnih podataka (samo brojevi i nazivi)');
select is((select count(*)::int from public.project_assignments where employee_id = '73600000-0000-4000-8000-0000000000e4' and assignment_type = 'replacement'), 0,
  'T23: bez potvrde nema dodele');
select is((select count(*)::int from public.schedules where employee_id = '73600000-0000-4000-8000-0000000000e4'), 0,
  'T23: bez potvrde raspored izvornog projekta se ne menja');

-- uz potvrdu prolazi
select lives_ok($$select public.assign_replacement('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e4',
    '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
    '2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000f4', true)$$,
  'T23: uz potvrdu transfer sa skrivenog projekta prolazi');
select results_eq($$select deficit from public.workforce_coverage('2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000b1')$$,
  $$values (0), (0)$$, 'posle potvrde deficit ciljnog projekta je 0');

-- e8: skriveni projekat bez manjka (uloga bez zahteva) — i dalje potvrda, jer se menja njegov raspored
select throws_like($$select public.assign_replacement('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e8',
    '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
    '2036-03-15', '2036-03-15', null, false)$$,
  'Premeštaj oslobađa raspored radnika na projektu kome nemate pristup (QA-36 Most) — potvrdite transfer',
  'premeštaj sa skrivenog projekta bez manjka traži potvrdu');
select is((public.replacement_source_impact('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e8',
            '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
            '2036-03-15', '2036-03-15', null) -> 'hidden_projects' -> 0 ->> 'project_name'), 'QA-36 Most',
  'pregled navodi skriveni projekat po nazivu i kad nema manjka');
select lives_ok($$select public.assign_replacement('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e8',
    '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
    '2036-03-15', '2036-03-15', null, true)$$, 'uz potvrdu prolazi');
-- ostale greške pregled prosleđuje nepromenjene
select throws_like($$select public.replacement_source_impact('73600000-0000-4000-8000-000000000101', '73600000-0000-4000-8000-0000000000e2',
    '73600000-0000-4000-8000-0000000000b1', '73600000-0000-4000-8000-0000000000c1', '73600000-0000-4000-8000-0000000000d1',
    '2036-03-10', '2036-03-15', null)$$, 'Zamena mora biti u periodu odsustva%', 'pregled prosleđuje grešku validacije');

-- ───── provera kao postgres ─────
reset role;
set local request.jwt.claims to '{}';
select results_eq($$select deficit from public.workforce_coverage_all('2036-03-15', '2036-03-16', '73600000-0000-4000-8000-0000000000b2')
                     where project_role_id = '73600000-0000-4000-8000-0000000000c2'$$,
  $$values (1), (1)$$, 'T23: izvorni projekat ostaje bez radnika (deficit 1 oba dana)');
select is((select count(*)::int from public.audit_log a
            join public.project_assignments pa on pa.id::text = a.record_id
            where a.table_name = 'project_assignments' and a.action = 'status'
              and pa.employee_id = '73600000-0000-4000-8000-0000000000e4'
              and a.new_data ->> 'source_missing' = '2'
              and a.new_data -> 'hidden_projects' @> '[{"project_name":"QA-36 Most"}]'
              and a.actor = '73600000-0000-4000-8000-0000000000a1'
              and a.reason like '%potvrđen manjak na izvornom projektu'), 1,
  'T23: audit potvrđenog premeštaja — ko, broj koji nedostaje, skriveni projekat, razlog');
select is((select count(*)::int from public.audit_log a
            join public.project_assignments pa on pa.id::text = a.record_id
            where a.table_name = 'project_assignments' and a.action = 'status'
              and pa.employee_id = '73600000-0000-4000-8000-0000000000e8'
              and a.new_data ->> 'source_missing' = '0'
              and a.new_data -> 'hidden_projects' @> '[{"project_name":"QA-36 Most"}]'), 1,
  'audit i za premeštaj sa skrivenog projekta bez manjka');

select * from finish();
rollback;
