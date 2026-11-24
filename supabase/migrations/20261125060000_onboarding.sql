-- Phase 7 / T-D — Project Onboarding, Required Documents, ZIP paketi, pristup fajlovima (spec §11 Documents, §12;
-- model docs/TEAMORA-DATA-MODEL.md §2.10; rizici R11, R12; spec testovi T18, T19).
--
-- * document_types: vrste dokumenata (12 postojećih kategorija) sa oznakom osetljivosti; documents.category → FK.
-- * documents: + issue_date, + restricted (osetljiv bez obzira na vrstu).
-- * required_documents: zahtevi po projektu i (opciono) Job Role-u.
-- * onboarding_manifest / prepare_onboarding_package / start_onboarding_download: server sastavlja sadržaj paketa,
--   proverava prava i vodi audit pripreme i preuzimanja. Pregledač samo potpisuje linkove i pakuje ZIP.
-- * storage.objects: fajl osetljivog dokumenta čita samo ko ima documents.view_sensitive (T19 i direktnim pozivom).
--   Fajl koji nije vezan za dokument (prilog satnice, fotografija, logo) ostaje dostupan osoblju kao do sada (R11).
--
-- Zavisi od 01 (prava, audit, project_roles, time_zone) i 03 (project_assignments.project_role_id).
-- Idempotentno; ne briše podatke. D14: ništa anon-u.

-- ═════════════════════════════ 1. vrste dokumenata ═════════════════════════════
create table if not exists public.document_types (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  name text not null check (btrim(name) <> ''),
  sensitive boolean not null default true,
  sort integer not null default 0,
  active boolean not null default true
);

insert into public.document_types (code, name, sensitive, sort) values
  ('id_card',              'ID Card',              true,  10),
  ('passport',             'Passport',             true,  20),
  ('work_permit',          'Work Permit',          true,  30),
  ('contract',             'Contract',             true,  40),
  ('certificate',          'Certificate',          false, 50),
  ('diploma',              'Diploma',              false, 60),
  ('training_certificate', 'Training Certificate', false, 70),
  ('driver_license',       'Driver''s License',    false, 80),
  ('insurance',            'Insurance',            true,  90),
  ('medical_certificate',  'Medical Certificate',  true,  100),
  ('safety_certificate',   'Safety Certificate',   false, 110),
  ('other',                'Other',                false, 120)
on conflict (code) do nothing;

-- Kategorija koja nije u spisku (stari check to nije dozvoljavao, ali za svaki slučaj) postaje osetljiva vrsta + report.
do $$
declare
  r record;
begin
  for r in select distinct d.category from public.documents d
            where d.category is not null and not exists (select 1 from public.document_types t where t.code = d.category)
  loop
    insert into public.document_types (code, name, sensitive, sort) values (r.category, r.category, true, 900)
    on conflict (code) do nothing;
    perform public.migration_note('20261125060000_onboarding', 'documents', null, 'unknown_document_category',
                                  jsonb_build_object('category', r.category));
  end loop;
end $$;

alter table public.document_types enable row level security;
drop policy if exists document_types_read on public.document_types;
create policy document_types_read on public.document_types for select to authenticated
  using ((select public.is_staff()));
drop policy if exists document_types_write on public.document_types;
create policy document_types_write on public.document_types for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));
revoke all on public.document_types from anon;

-- ═════════════════════════════ 2. documents dopune ═════════════════════════════
alter table public.documents add column if not exists issue_date date;
alter table public.documents add column if not exists restricted boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_issue_before_expiry'
                   and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_issue_before_expiry
      check (issue_date is null or expiration_date is null or issue_date <= expiration_date);
  end if;
end $$;

-- Fiksan spisak kategorija zamenjuje FK na document_types (nove vrste dodaje settings.manage).
alter table public.documents drop constraint if exists documents_category_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_category_fkey'
                   and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_category_fkey
      foreign key (category) references public.document_types (code) on update cascade;
  end if;
end $$;

create index if not exists documents_file_url_idx on public.documents (file_url) where file_url is not null;
create index if not exists documents_employee_category_idx on public.documents (employee_id, category);

-- ═════════════════════════════ 3. required_documents ═════════════════════════════
create table if not exists public.required_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  project_role_id uuid references public.project_roles (id) on delete cascade,
  document_type text not null references public.document_types (code) on update cascade,
  mandatory boolean not null default true,
  validity_rule text not null default 'assignment_period'
    check (validity_rule in ('assignment_period', 'assignment_start', 'none')),
  expiring_soon_days integer not null default 30 check (expiring_soon_days >= 0),
  exportable boolean not null default true,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index if not exists required_documents_key on public.required_documents
  (project_id, coalesce(project_role_id, '00000000-0000-0000-0000-000000000000'::uuid), document_type);
create index if not exists required_documents_role_idx on public.required_documents (project_role_id);

-- Job Role mora pripadati istom projektu; nova vrsta mora biti aktivna.
create or replace function public.guard_required_document() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.project_role_id is not null and not exists (
       select 1 from public.project_roles r where r.id = new.project_role_id and r.project_id = new.project_id) then
    raise exception 'Job Role ne pripada ovom projektu' using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.document_type is distinct from old.document_type) and not exists (
       select 1 from public.document_types t where t.code = new.document_type and t.active) then
    raise exception 'Vrsta dokumenta „%" nije aktivna', new.document_type using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.guard_required_document() from public, anon, authenticated;
drop trigger if exists required_documents_guard on public.required_documents;
create trigger required_documents_guard before insert or update on public.required_documents
  for each row execute function public.guard_required_document();

drop trigger if exists required_documents_updated on public.required_documents;
create trigger required_documents_updated before update on public.required_documents
  for each row execute function public.set_updated_date();
drop trigger if exists required_documents_audit on public.required_documents;
create trigger required_documents_audit after insert or update or delete on public.required_documents
  for each row execute function public.audit_row();

alter table public.required_documents enable row level security;
drop policy if exists required_documents_read on public.required_documents;
create policy required_documents_read on public.required_documents for select to authenticated
  using (public.can_see_project(project_id));
drop policy if exists required_documents_write on public.required_documents;
create policy required_documents_write on public.required_documents for all to authenticated
  using ((select public.has_permission('onboarding.manage')) and public.can_see_project(project_id))
  with check ((select public.has_permission('onboarding.manage')) and public.can_see_project(project_id));
revoke all on public.required_documents from anon;

-- ═════════════════════════════ 4. paketi i preuzimanja ═════════════════════════════
create table if not exists public.onboarding_packages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  employee_ids uuid[] not null check (cardinality(employee_ids) > 0),
  status text not null default 'incomplete' check (status in ('incomplete', 'ready')),
  manifest jsonb not null,
  prepared_by uuid default auth.uid() references auth.users (id) on delete set null,
  prepared_at timestamptz not null default now(),
  notes text
);
create index if not exists onboarding_packages_project_idx on public.onboarding_packages (project_id, prepared_at desc);

create table if not exists public.onboarding_package_downloads (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.onboarding_packages (id) on delete restrict,
  downloaded_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  downloaded_at timestamptz not null default now(),
  document_ids uuid[] not null,
  file_count integer not null check (file_count >= 0)
);
create index if not exists onboarding_package_downloads_package_idx
  on public.onboarding_package_downloads (package_id, downloaded_at desc);

-- ═════════════════════════════ 5. status zahteva (isti algoritam kao src/lib/onboarding.js) ═════════════════════════════
-- Interna: bez provere prava (poziva je trigger i RPC-ovi). p_view_sensitive = da li pozivalac sme da izveze
-- osetljive dokumente; readiness radnika od toga ne zavisi (not_permitted ne znači da dokument fali).
create or replace function public.onboarding_manifest_internal(p_project uuid, p_employee_ids uuid[],
  p_view_sensitive boolean, p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_project public.projects;
  v_today date;
  v_emp uuid;
  v_a public.project_assignments;
  v_emp_name text;
  v_role_title text;
  q record;
  d record;
  v_found boolean;
  v_from date;
  v_to date;
  v_status text;
  v_sensitive boolean;
  v_items jsonb;
  v_reasons jsonb;
  v_workers jsonb := '[]'::jsonb;
  v_incomplete boolean := false;
begin
  select * into v_project from public.projects where id = p_project;
  if not found then
    raise exception 'Projekat ne postoji' using errcode = 'P0002';
  end if;
  v_today := coalesce(p_today, (now() at time zone coalesce(nullif(v_project.time_zone, ''),
               (select s.time_zone from public.app_settings s limit 1), 'Europe/Bratislava'))::date);

  for v_emp, v_emp_name in
    select e.id, btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
      from public.employees e
     where e.id = any (coalesce(p_employee_ids, '{}'::uuid[]))
     order by 2, 1
  loop
    -- Tekuća ili sledeća dodela (najraniji početak među nezavršenim), inače poslednja završena.
    select a.* into v_a
      from public.project_assignments a
     where a.employee_id = v_emp and a.project_id = p_project and a.status <> 'cancelled'
     order by (coalesce(a.end_date, 'infinity'::date) >= v_today) desc,
              case when coalesce(a.end_date, 'infinity'::date) >= v_today then a.start_date end asc nulls last,
              case when coalesce(a.end_date, 'infinity'::date) >= v_today then a.id end asc,
              a.end_date desc, a.id desc
     limit 1;
    if not found then
      raise exception 'Radnik % nije angažovan na ovom projektu', v_emp_name using errcode = '22023';
    end if;
    select r.title into v_role_title from public.project_roles r where r.id = v_a.project_role_id;

    v_items := '[]'::jsonb;
    v_reasons := '[]'::jsonb;
    for q in
      select r.*, t.name as type_name
        from public.required_documents r join public.document_types t on t.code = r.document_type
       where r.project_id = p_project and (r.project_role_id is null or r.project_role_id = v_a.project_role_id)
       order by r.document_type, r.project_role_id nulls first
    loop
      select doc.id, doc.title, doc.file_name, doc.file_url, doc.expiration_date,
             (coalesce(t.sensitive, true) or doc.restricted) as is_sensitive
        into d
        from public.documents doc left join public.document_types t on t.code = doc.category
       where doc.employee_id = v_emp and doc.category = q.document_type
       order by doc.expiration_date desc nulls first, doc.created_date desc, doc.id desc
       limit 1;
      v_found := found;

      if q.validity_rule = 'none' then
        v_from := v_today; v_to := v_today;
      else
        v_from := greatest(v_today, v_a.start_date);
        v_to := case when q.validity_rule = 'assignment_start' then v_from else coalesce(v_a.end_date, v_from) end;
      end if;

      v_sensitive := v_found and d.is_sensitive;
      v_status := case
        when not v_found then 'missing'
        when d.expiration_date is not null and d.expiration_date < v_to then 'expired'
        when not q.exportable or (v_sensitive and not coalesce(p_view_sensitive, false)) then 'not_permitted'
        when d.expiration_date is not null and d.expiration_date <= v_today + q.expiring_soon_days then 'expiring_soon'
        else 'available' end;

      v_items := v_items || jsonb_build_object(
        'requirement_id', q.id, 'document_type', q.document_type, 'document_type_name', q.type_name,
        'project_role_id', q.project_role_id, 'mandatory', q.mandatory, 'exportable', q.exportable,
        'validity_rule', q.validity_rule, 'valid_from', v_from, 'valid_to', v_to, 'status', v_status,
        'document_id', case when v_found then d.id end,
        'document_title', case when v_found then d.title end,
        'file_name', case when v_found then d.file_name end,
        'has_file', v_found and coalesce(d.file_url, '') <> '',
        'expiration_date', case when v_found then d.expiration_date end,
        'sensitive', v_sensitive);
      if q.mandatory and v_status not in ('available', 'expiring_soon', 'not_permitted') then
        v_reasons := v_reasons || jsonb_build_object('document_type', q.document_type, 'status', v_status,
          'expiration_date', case when v_found then d.expiration_date end);
      end if;
    end loop;

    if jsonb_array_length(v_reasons) > 0 then
      v_incomplete := true;
    end if;
    v_workers := v_workers || jsonb_build_object(
      'employee_id', v_emp, 'employee_name', v_emp_name, 'assignment_id', v_a.id,
      'project_role_id', v_a.project_role_id, 'role_title', coalesce(v_role_title, v_a.position),
      'start_date', v_a.start_date, 'end_date', v_a.end_date,
      'status', case when jsonb_array_length(v_reasons) > 0 then 'action_required' else 'ready' end,
      'items', v_items, 'reasons', v_reasons);
  end loop;

  if jsonb_array_length(v_workers) < cardinality(array(select distinct x from unnest(coalesce(p_employee_ids, '{}'::uuid[])) x)) then
    raise exception 'Neki od izabranih radnika ne postoje' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'project_id', v_project.id, 'project_name', v_project.name, 'client_name', v_project.client_name,
    'today', v_today, 'generated_at', now(),
    'status', case when v_incomplete then 'incomplete' else 'ready' end,
    'workers', v_workers);
end $$;
revoke execute on function public.onboarding_manifest_internal(uuid, uuid[], boolean, date) from public, anon, authenticated;

-- Preview paketa za pozivaoca (prava i vidljivost projekta proverava server).
create or replace function public.onboarding_manifest(p_project uuid, p_employee_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_permission('onboarding.manage') or public.has_permission('onboarding.export'))
     or not public.can_see_project(p_project) then
    raise exception 'Nemate pravo na onboarding ovog projekta' using errcode = '42501';
  end if;
  return public.onboarding_manifest_internal(p_project, p_employee_ids, public.has_permission('documents.view_sensitive'));
end $$;
revoke execute on function public.onboarding_manifest(uuid, uuid[]) from public, anon;
grant execute on function public.onboarding_manifest(uuid, uuid[]) to authenticated;

-- Paket sa nedostatkom ne može u 'ready'; snimak (projekat, radnici, manifest, ko/kada) se ne menja.
create or replace function public.guard_onboarding_package() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.project_id is distinct from old.project_id or new.employee_ids is distinct from old.employee_ids
       or new.manifest is distinct from old.manifest or new.prepared_by is distinct from old.prepared_by
       or new.prepared_at is distinct from old.prepared_at) then
    raise exception 'Pripremljen paket se ne menja — pripremite novi' using errcode = '42501';
  end if;
  if new.status = 'ready' and (tg_op = 'INSERT' or old.status is distinct from 'ready')
     and public.onboarding_manifest_internal(new.project_id, new.employee_ids, true) ->> 'status' <> 'ready' then
    raise exception 'Paket ima nedostatke (obavezan dokument fali ili nije važeći) i ne može biti označen kao Ready'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function public.guard_onboarding_package() from public, anon, authenticated;
drop trigger if exists onboarding_packages_guard on public.onboarding_packages;
create trigger onboarding_packages_guard before insert or update on public.onboarding_packages
  for each row execute function public.guard_onboarding_package();
drop trigger if exists onboarding_packages_audit on public.onboarding_packages;
create trigger onboarding_packages_audit after insert or update or delete on public.onboarding_packages
  for each row execute function public.audit_row();

-- Zapis preuzimanja je trajan (audit).
create or replace function public.onboarding_download_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Zapis preuzimanja paketa se ne menja i ne briše' using errcode = '42501';
end $$;
revoke execute on function public.onboarding_download_immutable() from public, anon, authenticated;
drop trigger if exists onboarding_package_downloads_immutable on public.onboarding_package_downloads;
create trigger onboarding_package_downloads_immutable before update or delete on public.onboarding_package_downloads
  for each row execute function public.onboarding_download_immutable();

alter table public.onboarding_packages enable row level security;
drop policy if exists onboarding_packages_read on public.onboarding_packages;
create policy onboarding_packages_read on public.onboarding_packages for select to authenticated
  using (((select public.has_permission('onboarding.manage')) or (select public.has_permission('onboarding.export')))
         and public.can_see_project(project_id));
alter table public.onboarding_package_downloads enable row level security;
drop policy if exists onboarding_package_downloads_read on public.onboarding_package_downloads;
create policy onboarding_package_downloads_read on public.onboarding_package_downloads for select to authenticated
  using (((select public.has_permission('onboarding.manage')) or (select public.has_permission('onboarding.export')))
         and exists (select 1 from public.onboarding_packages p
                      where p.id = package_id and public.can_see_project(p.project_id)));
-- Upis samo preko RPC-a (nema insert/update/delete politika).
revoke all on public.onboarding_packages, public.onboarding_package_downloads from anon;

-- ═════════════════════════════ 6. RPC: priprema i preuzimanje ═════════════════════════════
create or replace function public.prepare_onboarding_package(p_project uuid, p_employee_ids uuid[], p_ready boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_manifest jsonb;
  v_id uuid;
begin
  if not public.has_permission('onboarding.manage') or not public.can_see_project(p_project) then
    raise exception 'Nemate pravo da pripremite onboarding paket za ovaj projekat' using errcode = '42501';
  end if;
  v_ids := array(select distinct x from unnest(coalesce(p_employee_ids, '{}'::uuid[])) x where x is not null order by 1);
  if cardinality(v_ids) = 0 then
    raise exception 'Izaberite bar jednog radnika' using errcode = '22023';
  end if;
  v_manifest := public.onboarding_manifest_internal(p_project, v_ids, public.has_permission('documents.view_sensitive'));
  if coalesce(p_ready, false) and v_manifest ->> 'status' <> 'ready' then
    raise exception 'Paket ima nedostatke (obavezan dokument fali ili nije važeći) i ne može biti označen kao Ready'
      using errcode = '23514';
  end if;
  insert into public.onboarding_packages (project_id, employee_ids, status, manifest)
  values (p_project, v_ids, case when coalesce(p_ready, false) then 'ready' else 'incomplete' end, v_manifest)
  returning id into v_id;
  perform public.audit_event('onboarding_packages', v_id::text, 'prepare',
    jsonb_build_object('project_id', p_project, 'package_id', v_id, 'employee_ids', to_jsonb(v_ids),
                       'status', v_manifest ->> 'status', 'manifest', v_manifest));
  return v_id;
end $$;
revoke execute on function public.prepare_onboarding_package(uuid, uuid[], boolean) from public, anon;
grant execute on function public.prepare_onboarding_package(uuid, uuid[], boolean) to authenticated;

-- Vraća samo zahtevane, postojeće, važeće i za pozivaoca dozvoljene dokumente (prava se gledaju za OSOBU koja
-- preuzima, ne za onoga ko je paket pripremio). Upisuje preuzimanje i audit.
create or replace function public.start_onboarding_download(p_package uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pkg public.onboarding_packages;
  v_manifest jsonb;
  v_files jsonb;
  v_doc_ids uuid[];
  v_download uuid;
begin
  select * into v_pkg from public.onboarding_packages where id = p_package;
  if not found or not public.has_permission('onboarding.export') or not public.can_see_project(v_pkg.project_id) then
    raise exception 'Nemate pravo da preuzmete ovaj onboarding paket' using errcode = '42501';
  end if;
  v_manifest := public.onboarding_manifest_internal(v_pkg.project_id, v_pkg.employee_ids,
                                                    public.has_permission('documents.view_sensitive'));
  select coalesce(jsonb_agg(f order by f ->> 'employee_name', f ->> 'document_type'), '[]'::jsonb) into v_files
    from (
      select distinct on (doc.id) jsonb_build_object(
               'document_id', doc.id, 'employee_id', doc.employee_id, 'employee_name', w ->> 'employee_name',
               'file_path', substr(doc.file_url, length('storage://files/') + 1),
               'file_name', doc.file_name, 'title', doc.title, 'document_type', doc.category,
               'expiration_date', doc.expiration_date) as f
        from jsonb_array_elements(v_manifest -> 'workers') w
        cross join lateral jsonb_array_elements(w -> 'items') i
        join public.documents doc on doc.id = (i ->> 'document_id')::uuid
       where i ->> 'status' in ('available', 'expiring_soon')
         and (i ->> 'exportable')::boolean
         and doc.file_url like 'storage://files/%'
         and public.can_read_storage_object(substr(doc.file_url, length('storage://files/') + 1))
       order by doc.id
    ) s;
  v_doc_ids := array(select (e ->> 'document_id')::uuid from jsonb_array_elements(v_files) e);
  if cardinality(v_doc_ids) = 0 then
    raise exception 'Paket nema nijedan dokument koji smete da preuzmete' using errcode = 'P0001';
  end if;
  insert into public.onboarding_package_downloads (package_id, document_ids, file_count)
  values (p_package, v_doc_ids, cardinality(v_doc_ids))
  returning id into v_download;
  perform public.audit_event('onboarding_packages', p_package::text, 'download',
    jsonb_build_object('project_id', v_pkg.project_id, 'package_id', p_package, 'download_id', v_download,
                       'employee_ids', to_jsonb(v_pkg.employee_ids), 'document_ids', to_jsonb(v_doc_ids),
                       'file_count', cardinality(v_doc_ids)));
  return v_files;
end $$;
revoke execute on function public.start_onboarding_download(uuid) from public, anon;
grant execute on function public.start_onboarding_download(uuid) to authenticated;

-- ═════════════════════════════ 7. Storage (T19, R11) ═════════════════════════════
-- Fajl osetljivog dokumenta (vrsta je osetljiva ili je dokument restricted) traži documents.view_sensitive;
-- svaki drugi fajl u bucketu (prilog satnice, fotografija, logo, upload pre čuvanja dokumenta) — osoblje kao do sada.
create or replace function public.can_read_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.documents d left join public.document_types t on t.code = d.category
                  where d.file_url = 'storage://files/' || p_name and (coalesce(t.sensitive, true) or d.restricted))
      then public.has_permission('documents.view_sensitive')
    else public.is_staff()
  end
$$;
revoke execute on function public.can_read_storage_object(text) from public, anon;
grant execute on function public.can_read_storage_object(text) to authenticated;

-- Izmena/brisanje fajla dokumenta traži i documents.manage.
create or replace function public.can_modify_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.can_read_storage_object(p_name)
     and (not exists (select 1 from public.documents d where d.file_url = 'storage://files/' || p_name)
          or public.has_permission('documents.manage'))
$$;
revoke execute on function public.can_modify_storage_object(text) from public, anon;
grant execute on function public.can_modify_storage_object(text) to authenticated;

drop policy if exists files_staff_read on storage.objects;
create policy files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and public.can_read_storage_object(name));
drop policy if exists files_staff_update on storage.objects;
create policy files_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and public.can_modify_storage_object(name))
  with check (bucket_id = 'files' and public.can_modify_storage_object(name));
drop policy if exists files_staff_delete on storage.objects;
create policy files_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and public.can_modify_storage_object(name));
-- files_staff_insert ostaje (osoblje otprema; dokument se vezuje tek pri čuvanju reda).
