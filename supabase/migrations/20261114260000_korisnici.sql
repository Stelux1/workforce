-- Podešavanja → „Korisnici" (Faza 5): admin vidi naloge, aktivira ih i deaktivira i menja ulogu (admin/operater).
-- Stranica radi preko postojećih pravila — ova migracija samo učvršćuje zaštitu poslednjeg aktivnog admina:
--  * profile i dalje menja samo admin (RLS `profiles_update`, init); korisnik ne može sam sebe da aktivira ni da
--    promeni svoju ulogu, a operater ne menja nijedan nalog. Pravljenje naloga i lozinke ostaju van aplikacije (D14).
--  * Dve istovremene izmene (npr. dva admina jedan drugome skidaju ulogu ili ga deaktiviraju) ranije su mogle obe da
--    prođu, jer je svaka videla drugog admina još aktivnog — i sistem bi ostao bez ijednog admina. Sada provera čeka
--    da se prethodna izmena nekog admina završi i tek onda broji preostale aktivne admine.
--  * Provera broji aktivne admine bez obzira na to šta pozivalac sme da vidi (security definer), pa radi isto i kad
--    nalog briše Supabase Auth (brisanje korisnika kaskadno briše profil).
-- Poruka greške ostaje ista („Mora da ostane bar jedan aktivan admin", EN prevod u src/api/errors.js).
-- Postojeći podaci se ne diraju.

create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    -- Izmene koje oduzimaju aktivnog admina idu jedna za drugom; posle čekanja upit vidi stanje posle prethodne.
    perform pg_advisory_xact_lock(hashtext('public.profiles: poslednji aktivan admin'));
    if not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin' and p.active) then
      raise exception 'Mora da ostane bar jedan aktivan admin' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create or replace function public.guard_last_admin_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and old.active then
    perform pg_advisory_xact_lock(hashtext('public.profiles: poslednji aktivan admin'));
    if not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin' and p.active) then
      raise exception 'Mora da ostane bar jedan aktivan admin' using errcode = 'check_violation';
    end if;
  end if;
  return old;
end $$;

-- Trigger funkcije se ne pozivaju direktno; prava ostaju kao do sada.
revoke execute on function public.guard_last_admin(), public.guard_last_admin_delete() from public, anon;
