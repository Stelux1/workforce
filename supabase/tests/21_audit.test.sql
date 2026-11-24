-- Audit log (T-B; migracija 20261125010000_temelj_uloge_audit.sql; docs/TEAMORA-DATA-MODEL.md §2.2; spec §15.04).
-- Accept: insert/update/delete na 6 tabela (project_assignments, rates, timesheets, leave_requests, documents,
-- project_costs) pravi audit red sa `actor`; update/delete audit_log odbijeno; HR ne čita `rates` audit.
-- Dodatno: UPDATE samo updated_date se ne beleži; changed_fields; app.audit_action/app.audit_reason; audit_event;
-- migration_note bez duplikata; project_roles backfill i preimenovanje (T25).
-- Sopstveni podaci sa oznakom QA-21; sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ═════════════════════════════ priprema (kao postgres) ═════════════════════════════
insert into auth.users (id, email, instance_id, aud, role) values
  ('b2111111-1111-4111-8111-111111111111', 'qa21-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2133333-3333-4333-8333-333333333333', 'qa21-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2144444-4444-4444-8444-444444444444', 'qa21-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin', active = true where id = 'b2111111-1111-4111-8111-111111111111';
update public.profiles set role = 'hr', active = true where id = 'b2133333-3333-4333-8333-333333333333';
update public.profiles set role = 'finance', active = true where id = 'b2144444-4444-4444-8444-444444444444';

insert into public.projects (id, name) values ('b21a0000-0000-4000-8000-00000000000a', 'QA-21 Projekat');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('b21e0000-0000-4000-8000-0000000000e1', 'QA21', 'Radnik', 'QA-21-001');
insert into public.cost_categories (id, name) values ('b21d0000-0000-4000-8000-0000000000c1', 'QA-21 Kategorija');

-- ═════════════════════════════ 6 tabela: insert / update / delete kao admin ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.project_assignments (id, employee_id, project_id, start_date, position)
  values ('b2120000-0000-4000-8000-000000000001', 'b21e0000-0000-4000-8000-0000000000e1', 'b21a0000-0000-4000-8000-00000000000a', '2030-01-01', 'QA-21 Welder');
update public.project_assignments set notes = 'QA-21' where id = 'b2120000-0000-4000-8000-000000000001';
insert into public.rates (id, scope, kind, amount, project_id, effective_from)
  values ('b2130000-0000-4000-8000-000000000001', 'project', 'cost', 15, 'b21a0000-0000-4000-8000-00000000000a', '2030-01-01');
update public.rates set notes = 'QA-21' where id = 'b2130000-0000-4000-8000-000000000001';
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours)
  values ('b2140000-0000-4000-8000-000000000001', 'b21e0000-0000-4000-8000-0000000000e1', 'b21a0000-0000-4000-8000-00000000000a', '2030-01-07', 8);
update public.timesheets set notes = 'QA-21' where id = 'b2140000-0000-4000-8000-000000000001';
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date)
  values ('b2150000-0000-4000-8000-000000000001', 'b21e0000-0000-4000-8000-0000000000e1', 'vacation', '2030-03-02', '2030-03-03');
update public.leave_requests set reason = 'QA-21' where id = 'b2150000-0000-4000-8000-000000000001';
insert into public.documents (id, employee_id, title, category)
  values ('b2160000-0000-4000-8000-000000000001', 'b21e0000-0000-4000-8000-0000000000e1', 'QA-21 ugovor', 'contract');
update public.documents set notes = 'QA-21' where id = 'b2160000-0000-4000-8000-000000000001';
insert into public.project_costs (id, project_id, description, amount, currency, cost_date, cost_category_id)
  values ('b2170000-0000-4000-8000-000000000001', 'b21a0000-0000-4000-8000-00000000000a', 'QA-21 trošak', 50, 'EUR', '2030-01-10', 'b21d0000-0000-4000-8000-0000000000c1');
update public.project_costs set description = 'QA-21 trošak (izmena)' where id = 'b2170000-0000-4000-8000-000000000001';

delete from public.timesheets where id = 'b2140000-0000-4000-8000-000000000001';
delete from public.rates where id = 'b2130000-0000-4000-8000-000000000001';
delete from public.project_assignments where id = 'b2120000-0000-4000-8000-000000000001';
delete from public.leave_requests where id = 'b2150000-0000-4000-8000-000000000001';
delete from public.documents where id = 'b2160000-0000-4000-8000-000000000001';
delete from public.project_costs where id = 'b2170000-0000-4000-8000-000000000001';
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

select is(
  (select array_agg(t || ':' || a order by t, a) from (
     select distinct table_name as t, action as a from public.audit_log
      where record_id in ('b2120000-0000-4000-8000-000000000001', 'b2130000-0000-4000-8000-000000000001',
        'b2140000-0000-4000-8000-000000000001', 'b2150000-0000-4000-8000-000000000001',
        'b2160000-0000-4000-8000-000000000001', 'b2170000-0000-4000-8000-000000000001')) x),
  array['documents:delete', 'documents:insert', 'documents:update',
        'leave_requests:delete', 'leave_requests:insert', 'leave_requests:update',
        'project_assignments:delete', 'project_assignments:insert', 'project_assignments:update',
        'project_costs:delete', 'project_costs:insert', 'project_costs:update',
        'rates:delete', 'rates:insert', 'rates:update',
        'timesheets:delete', 'timesheets:insert', 'timesheets:update'],
  'Accept: insert/update/delete na 6 tabela pravi audit red');
select is(
  (select count(*)::int from public.audit_log
    where record_id like 'b21_0000-0000-4000-8000-000000000001'
      and (actor is distinct from 'b2111111-1111-4111-8111-111111111111' or actor_role is distinct from 'admin')),
  0, 'Accept: svaki audit red nosi actor i actor_role');
select is((select project_id from public.audit_log where table_name = 'rates' and action = 'insert'
            and record_id = 'b2130000-0000-4000-8000-000000000001'),
  'b21a0000-0000-4000-8000-00000000000a'::uuid, 'project_id se uzima iz reda');
select is((select project_id from public.audit_log where table_name = 'documents' and action = 'insert'
            and record_id = 'b2160000-0000-4000-8000-000000000001'), null::uuid,
  'tabela bez project_id → project_id null');
select is((select changed_fields from public.audit_log where table_name = 'rates' and action = 'update'
            and record_id = 'b2130000-0000-4000-8000-000000000001'), array['notes'],
  'changed_fields: samo izmenjena polja (bez updated_date)');
select ok((select old_data ->> 'notes' is null and new_data ->> 'notes' = 'QA-21' from public.audit_log
            where table_name = 'rates' and action = 'update' and record_id = 'b2130000-0000-4000-8000-000000000001'),
  'old_data i new_data čuvaju stanje pre i posle');
select ok((select new_data is null and old_data ->> 'id' = 'b2170000-0000-4000-8000-000000000001' from public.audit_log
            where table_name = 'project_costs' and action = 'delete' and record_id = 'b2170000-0000-4000-8000-000000000001'),
  'delete čuva ceo red u old_data');

-- UPDATE koji menja samo updated_date se ne beleži; izmena bez promene vrednosti takođe ne.
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date)
  values ('b2150000-0000-4000-8000-000000000002', 'b21e0000-0000-4000-8000-0000000000e1', 'vacation', '2030-04-02', '2030-04-03');
update public.leave_requests set reason = reason where id = 'b2150000-0000-4000-8000-000000000002';
update public.leave_requests set updated_date = now() + interval '1 minute' where id = 'b2150000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.audit_log where record_id = 'b2150000-0000-4000-8000-000000000002'), 1,
  'UPDATE samo updated_date (ili bez promene) se ne beleži');
select is((select actor from public.audit_log where record_id = 'b2150000-0000-4000-8000-000000000002'), null::uuid,
  'izmena bez prijavljenog korisnika (migracija, postgres) → actor null');

-- RPC može da upiše action (status/correction) i razlog.
select set_config('app.audit_action', 'status', true), set_config('app.audit_reason', 'QA-21 razlog', true);
update public.leave_requests set status = 'approved' where id = 'b2150000-0000-4000-8000-000000000002';
select set_config('app.audit_action', '', true), set_config('app.audit_reason', '', true);
select is((select action || '|' || reason from public.audit_log where record_id = 'b2150000-0000-4000-8000-000000000002'
            and changed_fields @> array['status']), 'status|QA-21 razlog', 'app.audit_action i app.audit_reason');
select ok((select bool_and(table_name in ('leave_requests')) from public.audit_log
            where record_id = 'b2150000-0000-4000-8000-000000000002'), 'audit red pripada pravoj tabeli');

-- audit_event: događaj bez promene reda (download/prepare), samo iz security definer RPC-a.
select ok(public.audit_event('payables', 'qa21-paket', 'download',
  '{"project_id":"b21a0000-0000-4000-8000-00000000000a","files":2}', 'QA-21 preuzimanje') > 0, 'audit_event upisuje događaj');
select is((select action || '|' || project_id::text || '|' || reason from public.audit_log where record_id = 'qa21-paket'),
  'download|b21a0000-0000-4000-8000-00000000000a|QA-21 preuzimanje', 'audit_event: akcija, projekat i razlog');
select throws_ok($$select public.audit_event('x', 'y', 'nepoznato', null, null)$$, '23514', null,
  'audit_event prima samo dozvoljene akcije');

-- ═════════════════════════════ nepromenljivost ═════════════════════════════
select throws_ok($$update public.audit_log set reason = 'izmena' where record_id = 'qa21-paket'$$, '42501',
  'Audit log se ne menja i ne briše', 'update audit_log je odbijen (i za postgres)');
select throws_ok($$delete from public.audit_log where record_id = 'qa21-paket'$$, '42501',
  'Audit log se ne menja i ne briše', 'delete audit_log je odbijen (i za postgres)');
select ok(not has_table_privilege('authenticated', 'public.audit_log', 'insert')
      and not has_table_privilege('authenticated', 'public.audit_log', 'update')
      and not has_table_privilege('authenticated', 'public.audit_log', 'delete')
      and not has_table_privilege('authenticated', 'public.audit_log', 'truncate')
      and has_table_privilege('authenticated', 'public.audit_log', 'select')
      and not has_table_privilege('anon', 'public.audit_log', 'select'),
  'authenticated samo čita audit_log; anon ništa');

set local role authenticated;
set local request.jwt.claims to '{"sub":"b2111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$insert into public.audit_log (table_name, record_id, action) values ('x', 'y', 'insert')$$, '42501', null,
  'admin ne upisuje audit ručno');
select throws_ok($$update public.audit_log set reason = 'x' where record_id = 'qa21-paket'$$, '42501', null,
  'Accept: update audit_log odbijeno (admin)');
select throws_ok($$delete from public.audit_log where record_id = 'qa21-paket'$$, '42501', null,
  'Accept: delete audit_log odbijeno (admin)');
select ok((select count(*)::int from public.audit_log where record_id like 'b21%') >= 18, 'admin čita pun audit (audit.view)');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

-- ═════════════════════════════ ko čita audit (po resursu) ═════════════════════════════
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2133333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.audit_log where table_name = 'rates' and record_id = 'b2130000-0000-4000-8000-000000000001'), 0,
  'Accept: HR ne čita rates audit');
select is((select count(*)::int from public.audit_log where table_name = 'project_costs' and record_id = 'b2170000-0000-4000-8000-000000000001'), 0,
  'HR ne čita audit troškova');
select is((select count(*)::int from public.audit_log where table_name = 'documents' and record_id = 'b2160000-0000-4000-8000-000000000001'), 3,
  'HR čita audit dokumenata (documents.manage)');
select is((select count(*)::int from public.audit_log where table_name = 'leave_requests' and record_id = 'b2150000-0000-4000-8000-000000000001'), 3,
  'HR čita audit odsustva (leave.approve)');
select is((select count(*)::int from public.audit_log where table_name = 'project_assignments' and record_id = 'b2120000-0000-4000-8000-000000000001'), 3,
  'HR čita audit dodela na vidljivom projektu');
select is((select count(*)::int from public.audit_log where table_name = 'timesheets' and record_id = 'b2140000-0000-4000-8000-000000000001'), 0,
  'HR ne čita audit satnica (timesheets.approve)');
select is((select count(*)::int from public.audit_log where record_id = 'qa21-paket'), 0, 'HR ne čita događaj bez prava za tabelu');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

set local role authenticated;
set local request.jwt.claims to '{"sub":"b2144444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.audit_log where table_name = 'rates' and record_id = 'b2130000-0000-4000-8000-000000000001'), 3,
  'Finance čita B2C rates audit (rates.view_b2c)');
select is((select count(*)::int from public.audit_log where table_name = 'timesheets' and record_id = 'b2140000-0000-4000-8000-000000000001'), 3,
  'Finance čita audit satnica (timesheets.approve)');
select is((select count(*)::int from public.audit_log where table_name = 'documents' and record_id = 'b2160000-0000-4000-8000-000000000001'), 0,
  'Finance ne čita audit dokumenata');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

-- PM sa B2B, bez B2C: B2C rates audit ne vidi.
update public.profiles set role = 'project_manager' where id = 'b2144444-4444-4444-8444-444444444444';
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2144444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.audit_log where table_name = 'rates' and record_id = 'b2130000-0000-4000-8000-000000000001'), 0,
  'T26: PM ne čita audit B2C tarife');
select is((select count(*)::int from public.audit_log where table_name = 'project_costs' and record_id = 'b2170000-0000-4000-8000-000000000001'), 3,
  'PM čita audit troškova svog projekta (costs.view)');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

-- ═════════════════════════════ migration_report ═════════════════════════════
select ok(public.migration_note('qa21', 'projects', 'p1', 'qa21_issue', '{"a":1}') =
          public.migration_note('qa21', 'projects', 'p1', 'qa21_issue', '{"a":1}'), 'migration_note: ista beleška se ne duplira');
select is((select count(*)::int from public.migration_report where migration = 'qa21'), 1, 'migration_report ima jedan red');
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2133333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.migration_report where migration = 'qa21'), 0, 'HR ne čita migration_report');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika
set local role authenticated;
set local request.jwt.claims to '{"sub":"b2111111-1111-4111-8111-111111111111","role":"authenticated"}';
with u as (update public.migration_report set resolved_at = now(), resolved_by = auth.uid() where migration = 'qa21' returning 1)
select is((select count(*)::int from u), 1, 'admin označava belešku rešenom');
select throws_ok($$delete from public.migration_report where migration = 'qa21'$$, '42501', null, 'migration_report se ne briše preko API-ja');
reset role;
set local request.jwt.claims to '{}'; -- dalje kao postgres, bez prijavljenog korisnika

-- ═════════════════════════════ Job Roles: backfill i preimenovanje (T25) ═════════════════════════════
select is((select count(*)::int from public.projects p
            cross join lateral jsonb_array_elements(case when jsonb_typeof(p.job_roles) = 'array' then p.job_roles else '[]' end) j(e)
            where btrim(coalesce(j.e ->> 'title', '')) <> ''
              and not exists (select 1 from public.project_roles r where r.project_id = p.id and r.title_key = lower(btrim(j.e ->> 'title')))),
  0, 'backfill: svaki projects.job_roles[*].title ima project_roles red');
insert into public.project_roles (id, project_id, title) values ('b2180000-0000-4000-8000-000000000001', 'b21a0000-0000-4000-8000-00000000000a', 'QA-21 Welder');
insert into public.project_assignments (id, employee_id, project_id, start_date, position)
  values ('b2120000-0000-4000-8000-000000000002', 'b21e0000-0000-4000-8000-0000000000e1', 'b21a0000-0000-4000-8000-00000000000a', '2030-06-01', ' qa-21 welder ');
update public.project_roles set title = 'QA-21 Senior Welder' where id = 'b2180000-0000-4000-8000-000000000001';
select is((select position from public.project_assignments where id = 'b2120000-0000-4000-8000-000000000002'), 'QA-21 Senior Welder',
  'T25: preimenovanje Job Role osvežava snimak naziva u dodeli');
select throws_ok($$insert into public.project_roles (project_id, title) values ('b21a0000-0000-4000-8000-00000000000a', ' qa-21 senior welder')$$,
  '23505', null, 'Job Role je jedinstven po projektu (title_key)');

select * from finish();
rollback;
