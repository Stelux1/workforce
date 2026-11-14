-- P0 iz pregleda 14.11.2026 (veče): operater ne sme da određuje tarifu koju baza bira pri odobravanju (D3, D4, D16).
-- resolve_timesheet_rate (migracija 20261114180000) čita, osim Tarifa (samo admin), i podatke koje osoblje menja:
--   * projects.assigned_employees — b2c_rate / b2b_rate radnika na projektu (2. nivo) i pozicija radnika;
--   * projects.job_roles          — b2b_rate zanimanja (nivo „zanimanje na projektu", samo za klijenta);
--   * project_assignments         — koja dodela važi za radnika (tarifa angažmana, 1. nivo) i pozicija (tarifa pozicije).
-- Do sada je operater preko ekrana projekta upisao satnicu 99 €/h koju je baza pri odobravanju prihvatila kao važeću,
-- a preko API-ja prebacio adminovu dodelu sa tarifom na drugog radnika ili obrisao dodelu (FK kaskada je obrisala
-- adminovu tarifu). Sada, za prijavljenog korisnika koji nije admin:
--   1. projekat: zanimanje sa tarifom (b2b_rate ili b2c_rate > 0) ne dodaje, ne menja (naziv, tarifa, redosled) i ne briše;
--      radnika na projektu sa tarifom (b2c_rate / b2b_rate > 0) ili sa pozicijom koja ima tarifu u Tarifama ne menja
--      (pozicija, tarife, ID radnika) i ne uklanja; nov unos radnika ne nosi tarifu i nije na poziciji koja ima tarifu.
--      Radnika bez tarife operater i dalje dodaje, uklanja i menja mu poziciju (raspoređuje ljude po projektima).
--   2. dodela (project_assignments): ako je radnik na tom projektu „pod tarifom" — ima dodelu na koju se poziva red u
--      Tarifama, dodelu na poziciji koja ima tarifu u Tarifama, ili tarifu/poziciju sa tarifom na spisku projekta —
--      njegove dodele na tom projektu ne pravi, ne menja (radnik, projekat, pozicija, datumi, status) i ne briše.
--      Važi i za staru i za novu stranu izmene, pa ne može ni da prebaci tuđu dodelu sa tarifom na sebe, ni da
--      novom dodelom „prekrije" poziciju sa tarifom. Nova dodela ne sme biti na poziciji koja ima tarifu.
--      Ostale dodele (bez tarife) operater i dalje vodi; imena, napomene i dobavljač se menjaju slobodno.
--   3. rates.assignment_id i rates.project_id: on delete restrict umesto cascade — brisanje dodele ili projekta više ne
--      briše adminove tarife (FK kaskada ne prolazi kroz RLS); prvo se brišu tarife (samo admin).
-- Admin radi sve kao i do sada. Bez prijavljenog korisnika (SQL, migracije, seed — van API-ja) provere ne važe.
-- Postojeći podaci se ne menjaju. Ekran: polja i iznosi tarifa na stranici projekta samo za admina
-- (ProjectEmployees.jsx, ProjectRoles.jsx).

-- ───────────── šta izbor tarife čita iz JSON polja projekta (isto kao resolve_timesheet_rate) ─────────────
-- Zanimanja sa tarifom, redom: [naziv, b2b, b2c]. Zanimanje bez tarife izbor ne koristi.
create or replace function public.project_role_rate_terms(p_roles jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(public.rate_trim(j.value ->> 'title'),
                                              public.rate_value(j.value -> 'b2b_rate'),
                                              public.rate_value(j.value -> 'b2c_rate')) order by j.ord), '[]')
  from jsonb_array_elements(case when jsonb_typeof(p_roles) = 'array' then p_roles else '[]' end)
       with ordinality j(value, ord)
  where public.rate_value(j.value -> 'b2b_rate') is not null or public.rate_value(j.value -> 'b2c_rate') is not null
$$;

-- Po radniku na spisku projekta: prva neprazna pozicija, prva b2c i prva b2b tarifa > 0 (redom iz niza).
create or replace function public.project_employee_rate_terms(p_assigned jsonb)
returns table (ek text, pos text, b2c numeric, b2b numeric)
language sql immutable set search_path = '' as $$
  with e as (
    select x.value ->> 'employee_id' as k, x.ord,
           nullif(public.rate_trim(x.value ->> 'position'), '') as p,
           public.rate_value(x.value -> 'b2c_rate') as c,
           public.rate_value(x.value -> 'b2b_rate') as b
    from jsonb_array_elements(case when jsonb_typeof(p_assigned) = 'array' then p_assigned else '[]' end)
         with ordinality x(value, ord)
  )
  select keys.k,
    (select e.p from e where e.k = keys.k and e.p is not null order by e.ord limit 1),
    (select e.c from e where e.k = keys.k and e.c is not null order by e.ord limit 1),
    (select e.b from e where e.k = keys.k and e.b is not null order by e.ord limit 1)
  from (select distinct e.k from e where e.k is not null) keys
$$;

-- Pozicije koje na projektu imaju tarifu u Tarifama (tarifa projekta za poziciju, bilo koji status i period).
create or replace function public.project_rate_positions(p_project uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct public.rate_trim(r.position)), '{}')
  from public.rates r
  where r.project_id = p_project and r.scope = 'project' and public.rate_trim(r.position) <> ''
$$;

-- Radnik je na projektu „pod tarifom" koju je odredio admin: dodela sa redom u Tarifama, dodela na poziciji sa tarifom,
-- ili na spisku projekta tarifa / pozicija sa tarifom.
create or replace function public.rate_pair_locked(p_employee uuid, p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with priced as (select public.project_rate_positions(p_project) as positions)
  select exists (
      select 1 from public.project_assignments a, priced
      where a.employee_id = p_employee and a.project_id = p_project
        and (exists (select 1 from public.rates r where r.assignment_id = a.id)
             or public.rate_trim(a.position) = any (priced.positions)))
    or exists (
      select 1 from public.projects p, priced, public.project_employee_rate_terms(p.assigned_employees) t
      where p.id = p_project and t.ek = p_employee::text
        and (t.b2c is not null or t.b2b is not null or t.pos = any (priced.positions)))
$$;

-- ───────────── projekat: zanimanja i radnici sa tarifom menja samo admin ─────────────
create or replace function public.guard_project_rates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_priced text[];
  v_changed jsonb;
  v_position text;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.job_roles is not distinct from old.job_roles
     and new.assigned_employees is not distinct from old.assigned_employees then
    return new;
  end if;

  if public.project_role_rate_terms(new.job_roles) is distinct from
     public.project_role_rate_terms(case when tg_op = 'UPDATE' then old.job_roles end) then
    raise exception 'Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin' using errcode = '42501';
  end if;

  -- Radnici kojima se menja ono što izbor tarife čita (pozicija, b2c, b2b) — dodati, uklonjeni ili izmenjeni.
  v_priced := case when tg_op = 'UPDATE' then public.project_rate_positions(old.id) else '{}' end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'old_rated', o.b2c is not null or o.b2b is not null or coalesce(o.pos = any (v_priced), false),
           'new_rated', n.b2c is not null or n.b2b is not null,
           'new_priced_pos', case when n.pos = any (v_priced) then n.pos end)), '[]')
    into v_changed
  from public.project_employee_rate_terms(case when tg_op = 'UPDATE' then old.assigned_employees end) o
  full join public.project_employee_rate_terms(new.assigned_employees) n on n.ek = o.ek
  where (o.pos, o.b2c, o.b2b) is distinct from (n.pos, n.b2c, n.b2b);

  -- Redosled poruka ne zavisi od redosleda radnika: prvo radnik pod adminovom tarifom, pa nova tarifa, pa pozicija.
  if jsonb_path_exists(v_changed, '$[*] ? (@.old_rated == true)') then
    raise exception 'Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin' using errcode = '42501';
  end if;
  if jsonb_path_exists(v_changed, '$[*] ? (@.new_rated == true)') then
    raise exception 'Satnicu radnika na projektu (B2C/B2B tarifu) upisuje samo admin' using errcode = '42501';
  end if;
  select min(c ->> 'new_priced_pos') into v_position from jsonb_array_elements(v_changed) c;
  if v_position is not null then
    raise exception 'Pozicija „%" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin', v_position
      using errcode = '42501';
  end if;

  return new;
end $$;

create trigger projects_guard_rates before insert or update on public.projects
  for each row execute function public.guard_project_rates();

-- ───────────── dodele: radnika pod tarifom raspoređuje samo admin ─────────────
create or replace function public.guard_assignment_rates() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_position text;
begin
  if auth.uid() is null or public.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Imena za prikaz (i osvežavanje posle preimenovanja projekta), napomene, dobavljač — izbor tarife ih ne čita.
  if tg_op = 'UPDATE'
     and (new.id, new.employee_id, new.project_id, new.position, new.start_date, new.end_date, new.status)
         is not distinct from
         (old.id, old.employee_id, old.project_id, old.position, old.start_date, old.end_date, old.status) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and public.rate_pair_locked(old.employee_id, old.project_id) then
    raise exception 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if public.rate_pair_locked(new.employee_id, new.project_id) then
    raise exception 'Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin'
      using errcode = '42501';
  end if;
  v_position := public.rate_trim(new.position);
  if v_position = any (public.project_rate_positions(new.project_id)) then
    raise exception 'Pozicija „%" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin', v_position
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger project_assignments_guard_rates before insert or update or delete on public.project_assignments
  for each row execute function public.guard_assignment_rates();

-- Pomoćne funkcije čitaju Tarife (vidi samo admin, D3) — pozivaju se samo iz triggera.
revoke execute on function public.project_role_rate_terms(jsonb), public.project_employee_rate_terms(jsonb),
  public.project_rate_positions(uuid), public.rate_pair_locked(uuid, uuid),
  public.guard_project_rates(), public.guard_assignment_rates() from public, anon, authenticated;

-- ───────────── tarife se ne brišu kaskadno ─────────────
-- Brisanje dodele ili projekta koji imaju tarife se odbija (23503); admin prvo briše tarife u Tarife i dodele.
alter table public.rates
  drop constraint rates_assignment_id_fkey,
  add constraint rates_assignment_id_fkey foreign key (assignment_id)
    references public.project_assignments (id) on delete restrict,
  drop constraint rates_project_id_fkey,
  add constraint rates_project_id_fkey foreign key (project_id)
    references public.projects (id) on delete restrict;
