-- Imenik osoblja za „ko i kada" (spec §6 approved by, §7 ko je evidentirao, §9 ko je promenio status, §14 ko je odlučio).
-- RLS na `profiles` daje red samo vlasniku i uz `users.manage`, pa ostalo osoblje vidi samo datum bez imena.
-- `staff_directory()` vraća SAMO id, ime za prikaz i ulogu (bez mejla, statusa, opsega projekata, prava), i to samo
-- aktivnom osoblju (`is_staff()`); neaktivni ili neprijavljeni pozivalac dobija prazan skup. Ništa anon-u (D14).
-- Vraćaju se i deaktivirani nalozi: njihova imena ostaju u istoriji odluka (odobrio/odlučio pre deaktivacije).
-- Idempotentno; ne menja podatke.

create or replace function public.staff_directory()
returns table (id uuid, full_name text, role text)
language sql stable security definer set search_path = '' as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), split_part(p.email, '@', 1)) as full_name,
         p.role
    from public.profiles p
   where public.is_staff()
   order by 2;
$$;

comment on function public.staff_directory() is
  'Imena osoblja za prikaz „ko je odobrio/evidentirao/odlučio" (id, ime, uloga); samo za aktivno osoblje, bez ličnih podataka.';

revoke execute on function public.staff_directory() from public, anon;
grant execute on function public.staff_directory() to authenticated;
