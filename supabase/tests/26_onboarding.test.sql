-- Testovi za Project Onboarding (migracija 20261125060000_onboarding.sql; model §2.10; spec §12, T18, T19).
-- Isti primer kao src/lib/onboarding.test.js: projekat sa Welder i Fitter ulogom; pasoš i BZR za sve uloge,
-- sertifikat samo za Welder. Welder nema sertifikat. Sopstveni podaci (QA-26, 2035), sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('26111111-1111-4111-8111-111111111111', 'qa26-hr@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('26222222-2222-4222-8222-222222222222', 'qa26-pm@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('26333333-3333-4333-8333-333333333333', 'qa26-pm-tudji@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('26444444-4444-4444-8444-444444444444', 'qa26-fin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'hr', active = true, project_scope = 'all' where id = '26111111-1111-4111-8111-111111111111';
update public.profiles set role = 'project_manager', active = true, project_scope = 'all' where id = '26222222-2222-4222-8222-222222222222';
update public.profiles set role = 'project_manager', active = true, project_scope = 'assigned' where id = '26333333-3333-4333-8333-333333333333';
update public.profiles set role = 'finance', active = true, project_scope = 'all' where id = '26444444-4444-4444-8444-444444444444';

insert into public.projects (id, name, client_name) values
  ('b2600000-0000-4000-8000-0000000000b1', 'QA-26 projekat', 'QA-26 klijent'),
  ('b2600000-0000-4000-8000-0000000000b2', 'QA-26 drugi projekat', 'QA-26 klijent');
insert into public.project_roles (id, project_id, title) values
  ('f2600000-0000-4000-8000-0000000000f1', 'b2600000-0000-4000-8000-0000000000b1', 'QA-26 Welder'),
  ('f2600000-0000-4000-8000-0000000000f2', 'b2600000-0000-4000-8000-0000000000b1', 'QA-26 Fitter'),
  ('f2600000-0000-4000-8000-0000000000f3', 'b2600000-0000-4000-8000-0000000000b2', 'QA-26 Welder');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d2600000-0000-4000-8000-0000000000d1', 'QA-26', 'Welder', 'QA-26-001'),
  ('d2600000-0000-4000-8000-0000000000d2', 'QA-26', 'Fitter', 'QA-26-002'),
  ('d2600000-0000-4000-8000-0000000000d3', 'QA-26', 'Bez dodele', 'QA-26-003');
insert into public.project_assignments (id, employee_id, project_id, project_role_id, position, start_date, end_date) values
  ('a2600000-0000-4000-8000-0000000000a1', 'd2600000-0000-4000-8000-0000000000d1', 'b2600000-0000-4000-8000-0000000000b1',
   'f2600000-0000-4000-8000-0000000000f1', 'QA-26 Welder', '2035-03-10', '2035-06-30'),
  ('a2600000-0000-4000-8000-0000000000a2', 'd2600000-0000-4000-8000-0000000000d2', 'b2600000-0000-4000-8000-0000000000b1',
   'f2600000-0000-4000-8000-0000000000f2', 'QA-26 Fitter', '2035-03-10', '2035-06-30');
insert into public.required_documents (id, project_id, project_role_id, document_type, mandatory, validity_rule) values
  ('e2600000-0000-4000-8000-000000000001', 'b2600000-0000-4000-8000-0000000000b1', null, 'passport', true, 'assignment_period'),
  ('e2600000-0000-4000-8000-000000000002', 'b2600000-0000-4000-8000-0000000000b1', null, 'safety_certificate', true, 'assignment_start'),
  ('e2600000-0000-4000-8000-000000000003', 'b2600000-0000-4000-8000-0000000000b1', 'f2600000-0000-4000-8000-0000000000f1', 'certificate', true, 'assignment_period');
insert into public.documents (id, employee_id, title, category, file_url, file_name, expiration_date) values
  ('c2600000-0000-4000-8000-000000000001', 'd2600000-0000-4000-8000-0000000000d1', 'Pasoš', 'passport', 'storage://files/qa26/w-pasos.pdf', 'w-pasos.pdf', '2040-01-01'),
  ('c2600000-0000-4000-8000-000000000002', 'd2600000-0000-4000-8000-0000000000d1', 'BZR', 'safety_certificate', 'storage://files/qa26/w-bzr.pdf', 'w-bzr.pdf', '2036-01-01'),
  ('c2600000-0000-4000-8000-000000000003', 'd2600000-0000-4000-8000-0000000000d2', 'Pasoš', 'passport', 'storage://files/qa26/f-pasos.pdf', 'f-pasos.pdf', '2040-01-01'),
  ('c2600000-0000-4000-8000-000000000004', 'd2600000-0000-4000-8000-0000000000d2', 'BZR', 'safety_certificate', 'storage://files/qa26/f-bzr.pdf', 'f-bzr.pdf', '2036-01-01');
insert into storage.objects (bucket_id, name) values
  ('files', 'qa26/w-pasos.pdf'), ('files', 'qa26/w-bzr.pdf'), ('files', 'qa26/f-pasos.pdf'), ('files', 'qa26/f-bzr.pdf'),
  ('files', 'qa26/prilog-satnice.pdf'), ('files', 'qa26/racun.pdf');
-- Račun troška (migracija 20261125060100): pravila troška se ovde ne testiraju, pa se triggeri preskaču (kao u 25).
alter table public.project_costs disable trigger user;
insert into public.project_costs (project_id, amount, currency, eur_amount, category, cost_date, receipt_url) values
  ('b2600000-0000-4000-8000-0000000000b1', 100, 'EUR', 100, 'materials', '2035-03-01', 'storage://files/qa26/racun.pdf');
alter table public.project_costs enable trigger user;

-- ═════ šema ═════
select is((select string_agg(code, ',' order by code) from public.document_types where sensitive),
  'contract,id_card,insurance,medical_certificate,passport,work_permit', 'osetljive vrste dokumenata (seed)');
select is((select count(*)::int from public.document_types), 12, '12 vrsta dokumenata (postojeće kategorije)');
select throws_ok($$insert into public.documents (employee_id, title, category) values
  ('d2600000-0000-4000-8000-0000000000d1', 'x', 'nepostojeca_vrsta')$$, '23503', null,
  'dokument nepostojeće vrste je odbijen (FK na document_types)');
select throws_ok($$insert into public.documents (employee_id, title, category, issue_date, expiration_date) values
  ('d2600000-0000-4000-8000-0000000000d1', 'x', 'other', '2035-05-01', '2035-04-01')$$, '23514', null,
  'datum izdavanja posle isteka je odbijen');
select throws_ok($$insert into public.required_documents (project_id, project_role_id, document_type) values
  ('b2600000-0000-4000-8000-0000000000b1', 'f2600000-0000-4000-8000-0000000000f3', 'diploma')$$, '23514', null,
  'zahtev sa Job Role-om drugog projekta je odbijen');
select throws_ok($$insert into public.required_documents (project_id, project_role_id, document_type) values
  ('b2600000-0000-4000-8000-0000000000b1', null, 'passport')$$, '23505', null,
  'isti zahtev (projekat, uloga, vrsta) dva puta je odbijen');

-- ═════ T18 ═════
set local role authenticated;
set local request.jwt.claims to '{"sub":"26111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table m18 on commit drop as
  select public.onboarding_manifest('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d1', 'd2600000-0000-4000-8000-0000000000d2']::uuid[]) as m;
select is((select w ->> 'status' from m18, jsonb_array_elements(m -> 'workers') w where w ->> 'employee_name' = 'QA-26 Welder'),
  'action_required', 'T18 Welder bez sertifikata je action_required');
select is((select i ->> 'status' from m18, jsonb_array_elements(m -> 'workers') w, jsonb_array_elements(w -> 'items') i
            where w ->> 'employee_name' = 'QA-26 Welder' and i ->> 'document_type' = 'certificate'),
  'missing', 'T18 Welderov sertifikat je missing');
select is((select (w -> 'reasons')::text from m18, jsonb_array_elements(m -> 'workers') w where w ->> 'employee_name' = 'QA-26 Welder'),
  '[{"status": "missing", "document_type": "certificate", "expiration_date": null}]', 'T18 razlog je precizan: samo sertifikat fali');
select is((select w ->> 'status' from m18, jsonb_array_elements(m -> 'workers') w where w ->> 'employee_name' = 'QA-26 Fitter'),
  'ready', 'T18 Fitter na istom projektu je ready');
select is((select count(*)::int from m18, jsonb_array_elements(m -> 'workers') w, jsonb_array_elements(w -> 'items') i
            where w ->> 'employee_name' = 'QA-26 Fitter' and i ->> 'document_type' = 'certificate'),
  0, 'T18 Fitter nema zahtev za sertifikat');
select is((select m ->> 'status' from m18), 'incomplete', 'paket sa Welderom je incomplete');
select is((select i ->> 'status' from m18, jsonb_array_elements(m -> 'workers') w, jsonb_array_elements(w -> 'items') i
            where w ->> 'employee_name' = 'QA-26 Fitter' and i ->> 'document_type' = 'passport'),
  'available', 'HR (documents.view_sensitive) vidi pasoš kao available');
select throws_ok($$select public.onboarding_manifest('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d3']::uuid[])$$, '22023', null, 'radnik bez dodele na projektu ne ulazi u paket');

-- ═════ T19: pristup fajlu ═════
select ok(public.can_read_storage_object('qa26/f-pasos.pdf'), 'T19 HR sme da čita fajl pasoša');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name like 'qa26/%'), 5, 'HR vidi sve fajlove osim računa troška');
select ok(not public.can_read_storage_object('qa26/racun.pdf'), 'HR (bez costs.view) ne čita račun troška');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name = 'qa26/racun.pdf'), 0,
  'storage select računa troška kao HR vraća 0 redova');

set local request.jwt.claims to '{"sub":"26222222-2222-4222-8222-222222222222","role":"authenticated"}';
select ok(not public.can_read_storage_object('qa26/f-pasos.pdf'), 'T19 PM bez documents.view_sensitive: can_read_storage_object(pasoš) = false');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name = 'qa26/f-pasos.pdf'), 0,
  'T19 storage select fajla pasoša kao PM vraća 0 redova');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name = 'qa26/f-bzr.pdf'), 1, 'PM čita neosetljiv dokument');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name = 'qa26/prilog-satnice.pdf'), 1,
  'R11 fajl koji nije dokument (prilog) ostaje dostupan osoblju');
-- Storage API briše preko ove postavke (direktan delete je inače zabranjen triggerom storage.protect_delete).
set local storage.allow_delete_query = 'true';
with x as (delete from storage.objects where name = 'qa26/f-bzr.pdf' returning 1)
select is(count(*)::int, 0, 'PM (bez documents.manage) ne briše fajl dokumenta') from x;
select is((select i ->> 'status' from public.onboarding_manifest('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d2']::uuid[]) m, jsonb_array_elements(m -> 'workers') w, jsonb_array_elements(w -> 'items') i
    where i ->> 'document_type' = 'passport'), 'not_permitted', 'T19 preview: pasoš je za PM-a Not Permitted to Export');

-- ═════ paket: Ready samo bez nedostataka ═════
select throws_ok($$select public.prepare_onboarding_package('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d1', 'd2600000-0000-4000-8000-0000000000d2']::uuid[], true)$$, '23514', null,
  'T19 paket sa nedostatkom ne može u ready');
select lives_ok($$select public.prepare_onboarding_package('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d1', 'd2600000-0000-4000-8000-0000000000d2']::uuid[], false)$$,
  'paket sa nedostatkom se priprema kao incomplete');
select lives_ok($$select public.prepare_onboarding_package('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d2']::uuid[], true)$$, 'paket samo sa Fitterom je ready');
select throws_ok($$insert into public.onboarding_packages (project_id, employee_ids, status, manifest) values
  ('b2600000-0000-4000-8000-0000000000b1', array['d2600000-0000-4000-8000-0000000000d2']::uuid[], 'ready', '{}')$$, '42501', null,
  'direktan upis paketa (mimo RPC-a) je odbijen');

create temp table pkg on commit drop as
  select id, status from public.onboarding_packages where project_id = 'b2600000-0000-4000-8000-0000000000b1';
select is((select string_agg(status, ',' order by status) from pkg), 'incomplete,ready', 'PM vidi oba pripremljena paketa');

-- ═════ T19: sadržaj ZIP-a po osobi koja preuzima ═════
create temp table dl_pm on commit drop as
  select public.start_onboarding_download((select p.id from pkg p where p.status = 'incomplete')) as f;
select is((select string_agg(e ->> 'file_name', ',' order by e ->> 'file_name') from dl_pm, jsonb_array_elements(f) e),
  'f-bzr.pdf,w-bzr.pdf', 'T19 start_onboarding_download kao PM ne vraća pasoše, vraća samo dozvoljene dokumente');
select is((select count(*)::int from public.onboarding_package_downloads d
            where d.package_id = (select p.id from pkg p where p.status = 'incomplete')), 1,
  'T19 posle preuzimanja postoji onboarding_package_downloads');
select is((select file_count from public.onboarding_package_downloads d
            where d.package_id = (select p.id from pkg p where p.status = 'incomplete')), 2, 'zapis preuzimanja ima broj fajlova');

set local request.jwt.claims to '{"sub":"26111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select jsonb_array_length(public.start_onboarding_download((select p.id from pkg p where p.status = 'ready')))), 2,
  'HR dobija i pasoš (2 fajla za Fittera)');
select is((select count(*)::int from (select 1 from public.onboarding_package_downloads) x), 2, 'HR vidi oba preuzimanja');

-- Finance nema onboarding prava; PM sa project_scope='assigned' ne vidi tuđi projekat.
set local request.jwt.claims to '{"sub":"26444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok(format('select public.start_onboarding_download(%L)', (select p.id from pkg p where p.status = 'ready')),
  '42501', null, 'Finance ne preuzima paket (ni direktnim pozivom)');
select is((select count(*)::int from public.onboarding_packages where project_id = 'b2600000-0000-4000-8000-0000000000b1'), 0,
  'Finance ne vidi pakete');
select is((select count(*)::int from storage.objects where bucket_id = 'files' and name = 'qa26/racun.pdf'), 1,
  'Finance (costs.view) čita račun troška');
select throws_ok($$insert into public.required_documents (project_id, document_type) values
  ('b2600000-0000-4000-8000-0000000000b1', 'diploma')$$, '42501', null, 'Finance ne menja Required Documents');

set local request.jwt.claims to '{"sub":"26333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$select public.prepare_onboarding_package('b2600000-0000-4000-8000-0000000000b1',
    array['d2600000-0000-4000-8000-0000000000d2']::uuid[], false)$$, '42501', null, 'PM bez pristupa projektu ne priprema paket');
select throws_ok(format('select public.start_onboarding_download(%L)', (select p.id from pkg p where p.status = 'ready')),
  '42501', null, 'PM bez pristupa projektu ne preuzima paket');

set local request.jwt.claims to '{"sub":"26222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$insert into public.required_documents (project_id, project_role_id, document_type) values
  ('b2600000-0000-4000-8000-0000000000b1', 'f2600000-0000-4000-8000-0000000000f1', 'training_certificate')$$,
  'PM (onboarding.manage) dodaje zahtev za ulogu');
select throws_ok($$insert into public.document_types (code, name) values ('qa26_vrsta', 'QA-26')$$, '42501', null,
  'PM ne menja vrste dokumenata (settings.manage)');

-- ═════ audit ═════
reset role;
-- Ni postgres (mimo RLS) ne menja zapis preuzimanja.
select throws_ok($$update public.onboarding_package_downloads set file_count = 0$$, '42501', null, 'zapis preuzimanja se ne menja');
select is((select count(*)::int from public.audit_log where table_name = 'onboarding_packages' and action = 'prepare'
            and project_id = 'b2600000-0000-4000-8000-0000000000b1'), 2, 'audit: svaka priprema paketa (ko, kada, projekat)');
select is((select count(*)::int from public.audit_log where table_name = 'onboarding_packages' and action = 'download'
            and project_id = 'b2600000-0000-4000-8000-0000000000b1' and new_data ? 'document_ids' and actor is not null), 2,
  'T19 audit: svako preuzimanje sa spiskom dokumenata i korisnikom');
select is((select count(*)::int from public.audit_log where table_name = 'required_documents'
            and project_id = 'b2600000-0000-4000-8000-0000000000b1' and actor = '26222222-2222-4222-8222-222222222222'), 1,
  'audit: izmena Required Documents');

select * from finish();
rollback;
