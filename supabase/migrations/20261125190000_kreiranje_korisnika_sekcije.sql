-- Korisnici: admin pravi nalog iz aplikacije i bira koje sekcije korisnik vidi (Luka 25.11.2026, kao u Blitzkriegu).
-- D31. Dve stvari:
--   1. Prava „view.*" — po jedno za svaku sekciju menija koja nema svoje pravo. Sve uloge ih podrazumevano imaju
--      (ništa se ne menja za postojeće naloge); admin ih isključuje po korisniku kroz user_permission_overrides.
--   2. admin_create_user(...) — samo aktivan admin otvara nalog (email + početna lozinka), odmah aktivan, sa ulogom,
--      opsegom projekata, dodeljenim projektima i sakrivenim sekcijama/pravima u jednoj transakciji.

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
  ('view.clients',     'Sekcija: Klijenti / Billing Overview', false)
on conflict (code) do nothing;

insert into public.role_permissions (role, permission)
select r.code, p.code
  from public.roles r cross join public.permissions p
 where r.code <> 'admin' and p.code like 'view.%'
on conflict do nothing;

-- ═════════════════════════════ 2. admin_create_user ═════════════════════════════
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_role text,
  p_project_scope text default 'all',
  p_project_ids uuid[] default '{}',
  p_denied text[] default '{}'
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
  select d into v_bad from unnest(coalesce(p_denied, '{}')) d
   where not exists (select 1 from public.permissions p where p.code = d) limit 1;
  if v_bad is not null then
    raise exception 'Nepoznato pravo: %', v_bad using errcode = '22023';
  end if;
  if p_role = 'admin' and cardinality(coalesce(p_denied, '{}')) > 0 then
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
  end if;

  return v_id;
end $$;

revoke execute on function public.admin_create_user(text, text, text, text, text, uuid[], text[]) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text, text, uuid[], text[]) to authenticated;
