-- Korisnici: admin pravi nalog iz aplikacije i bira koje sekcije korisnik vidi (Luka 25.11.2026, kao u Blitzkriegu).
-- D31. Matrica prava po korisniku (oblast × vidi / menja / odobrava / dodatno):
--   1. Prava „view.*" — po jedno za svaku sekciju menija koja nema svoje pravo. Sve uloge ih podrazumevano imaju
--      (ništa se ne menja za postojeće naloge); admin ih isključuje po korisniku kroz user_permission_overrides.
--   2. Prava za izmenu oblasti koje su do sada menjali svi (attendance/tasks/leave.manage) i dobavljači
--      (vendors.manage, ranije employees.manage) — sprovodi RLS. Podrazumevano ih imaju iste uloge kao i do sada.
--   3. admin_create_user(...) — samo aktivan admin otvara nalog (ime, email, početna lozinka), odmah aktivan, sa
--      ulogom, opsegom projekata, projektima i celom matricom prava (dodata/oduzeta prava) u jednoj transakciji.
--   4. set_user_permissions(...) — cela matrica jednog korisnika se snima odjednom (presetovi „samo pregled" itd.).

-- ═════════════════════════════ 1. prava za sekcije ═════════════════════════════
insert into public.permissions (code, description, sensitive) values
  ('view.employees',   'Sekcija: Zaposleni', false),
  ('view.vendors',     'Sekcija: Dobavljači', false),
  ('view.documents',   'Sekcija: Dokumenti', false),
  ('view.attendance',  'Sekcija: Prisustvo', false),
  ('view.schedule',    'Sekcija: Raspored', false),
  ('view.tasks',       'Sekcija: Zadaci', false),
  ('view.leave',       'Sekcija: Odsustva', false),
  ('view.reports',     'Sekcija: Izveštaji', false),
  ('view.projects',    'Sekcija: Pregled projekata', false),
  ('view.assignments', 'Sekcija: Angažmani na projektima', false),
  ('view.workforce',   'Sekcija: Planiranje radne snage', false),
  ('view.timesheets',  'Sekcija: Radni sati', false),
  ('view.clients',     'Sekcija: Klijenti / Billing Overview', false),
  ('attendance.manage', 'Prisustvo: unos, izmena i brisanje', false),
  ('tasks.manage',      'Zadaci: unos, izmena i brisanje', false),
  ('leave.manage',      'Odsustva: unos i izmena zahteva (odluka traži leave.approve)', false),
  ('vendors.manage',    'Dobavljači i ugovori dobavljača: unos, izmena i brisanje', false)
on conflict (code) do nothing;

-- Sekcije i izmena prisustva/zadataka/odsustava: sve uloge, kao do sada (is_staff). Dobavljači: ko je imao employees.manage.
insert into public.role_permissions (role, permission)
select r.code, p.code
  from public.roles r cross join public.permissions p
 where r.code <> 'admin' and (p.code like 'view.%' or p.code in ('attendance.manage', 'tasks.manage', 'leave.manage'))
on conflict do nothing;
insert into public.role_permissions (role, permission)
select rp.role, 'vendors.manage' from public.role_permissions rp where rp.permission = 'employees.manage'
on conflict do nothing;
insert into public.user_permission_overrides (user_id, permission, granted, created_by)
select o.user_id, 'vendors.manage', o.granted, o.created_by from public.user_permission_overrides o
 where o.permission = 'employees.manage'
on conflict (user_id, permission) do nothing;

do $$
declare
  staff constant text := '(select public.is_staff())';
begin
  perform public.apply_table_policies('attendance_records', staff, '(select public.has_permission(''attendance.manage''))');
  perform public.apply_table_policies('tasks', staff, '(select public.has_permission(''tasks.manage''))');
  perform public.apply_table_policies('leave_requests', staff, '(select public.has_permission(''leave.manage''))');
  perform public.apply_table_policies('vendors', staff,
    '((select public.has_permission(''vendors.manage'')) or (select public.has_permission(''engagement.manage'')))');
  perform public.apply_table_policies('vendor_contracts', staff,
    '((select public.has_permission(''vendors.manage'')) or (select public.has_permission(''engagement.manage'')))');
end $$;

-- ═════════════════════════════ 2. admin_create_user ═════════════════════════════
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_project_scope text default 'all',
  p_project_ids uuid[] default '{}',
  p_denied text[] default '{}',
  p_granted text[] default '{}'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_bad text;
begin
  if coalesce(public.current_app_role(), '') <> 'admin' then
    raise exception 'Samo admin može da otvori nov nalog' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email adresa nije ispravna' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 10 then
    raise exception 'Lozinka mora da ima bar 10 znakova' using errcode = '22023';
  end if;
  if p_role is null or not exists (select 1 from public.roles r where r.code = p_role) then
    raise exception 'Nepoznata uloga: %', coalesce(p_role, '—') using errcode = '22023';
  end if;
  if coalesce(p_project_scope, '') not in ('all', 'assigned') then
    raise exception 'Opseg projekata mora biti „all" ili „assigned"' using errcode = '22023';
  end if;
  select d into v_bad from unnest(coalesce(p_denied, '{}') || coalesce(p_granted, '{}')) d
   where not exists (select 1 from public.permissions p where p.code = d) limit 1;
  if v_bad is not null then
    raise exception 'Nepoznato pravo: %', v_bad using errcode = '22023';
  end if;
  if p_role = 'admin' and cardinality(coalesce(p_denied, '{}') || coalesce(p_granted, '{}')) > 0 then
    raise exception 'Admin ima sva prava; ne mogu mu se oduzeti' using errcode = '22023';
  end if;
  select pid::text into v_bad from unnest(coalesce(p_project_ids, '{}')) pid
   where not exists (select 1 from public.projects pr where pr.id = pid) limit 1;
  if v_bad is not null then
    raise exception 'Nepoznat projekat: %', v_bad using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_create_user:' || v_email));
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Nalog sa adresom % već postoji', v_email using errcode = '23505';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf', 10)), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('full_name', coalesce(v_name, v_email)), now(), now(),
    '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (v_id::text, v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', null, now(), now());

  -- handle_new_user je napravio profil (neaktivan HR); admin ga ovde odmah podešava.
  update public.profiles
     set role = p_role, active = true, project_scope = p_project_scope, full_name = coalesce(v_name, v_email)
   where id = v_id;

  if p_project_scope = 'assigned' then
    insert into public.user_project_access (user_id, project_id)
    select v_id, pid from unnest(coalesce(p_project_ids, '{}')) pid
    on conflict do nothing;
  end if;

  if p_role <> 'admin' then
    insert into public.user_permission_overrides (user_id, permission, granted)
    select v_id, d, false from (select distinct unnest(coalesce(p_denied, '{}')) d) x
     where exists (select 1 from public.role_permissions rp where rp.role = p_role and rp.permission = x.d)
    on conflict (user_id, permission) do update set granted = false;
    insert into public.user_permission_overrides (user_id, permission, granted)
    select v_id, g, true from (select distinct unnest(coalesce(p_granted, '{}')) g) x
     where not exists (select 1 from public.role_permissions rp where rp.role = p_role and rp.permission = x.g)
       and not (x.g = any (coalesce(p_denied, '{}')))
    on conflict (user_id, permission) do nothing;
  end if;

  return v_id;
end $$;

revoke execute on function public.admin_create_user(text, text, text, text, text, uuid[], text[], text[]) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text, uuid[], text[], text[]) to authenticated;

-- ═════════════════════════════ 3. set_user_permissions ═════════════════════════════
-- Konačna prava korisnika (p_codes) → override-i u odnosu na ulogu, sve odjednom. Ko sme: users.manage (RLS i
-- trigeri nad user_permission_overrides i dalje važe: ne nad adminom, ne nad sobom osim admina).
create or replace function public.set_user_permissions(p_user uuid, p_codes text[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_role text;
  v_bad text;
begin
  if not public.has_permission('users.manage') then
    raise exception 'Nemate pravo „users.manage"' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_user;
  if v_role is null then
    raise exception 'Korisnik ne postoji' using errcode = '22023';
  end if;
  if v_role = 'admin' then
    raise exception 'Admin ima sva prava; pojedinačna prava mu se ne menjaju' using errcode = '42501';
  end if;
  select c into v_bad from unnest(coalesce(p_codes, '{}')) c
   where not exists (select 1 from public.permissions p where p.code = c) limit 1;
  if v_bad is not null then
    raise exception 'Nepoznato pravo: %', v_bad using errcode = '22023';
  end if;

  delete from public.user_permission_overrides where user_id = p_user;
  insert into public.user_permission_overrides (user_id, permission, granted)
  select p_user, p.code, p.code = any (coalesce(p_codes, '{}'))
    from public.permissions p
   where (p.code = any (coalesce(p_codes, '{}')))
         is distinct from exists (select 1 from public.role_permissions rp where rp.role = v_role and rp.permission = p.code);
end $$;
revoke execute on function public.set_user_permissions(uuid, text[]) from public, anon;
grant execute on function public.set_user_permissions(uuid, text[]) to authenticated;
