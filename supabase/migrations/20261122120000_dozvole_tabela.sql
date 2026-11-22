-- Dozvole nad tabelama pišemo izričito (otkriveno 22.11.2026 na produkciji).
--
-- Lokalni Supabase CLI daje ulogama anon/authenticated/service_role sve dozvole nad tabelama u šemi public,
-- pa su sve migracije i testovi radili. Novi Supabase projekti na serveru to više ne rade: posle prijave je
-- /rest/v1/profiles vraćao 403 (permission denied), aplikacija nije dobila profil i vraćala je na prijavu.
--
-- Ko šta vidi i menja i dalje određuje RLS (uključen na svakoj tabeli, politike su „to authenticated");
-- ovde samo dajemo prijavljenima pravo da uopšte pristupe tabelama, kao lokalno. Funkcije se ne diraju:
-- svaka koju aplikacija poziva već ima svoj „grant execute … to authenticated", a pomoćne su namerno zatvorene.
-- anon (neprijavljen) ne dobija ništa — isto pravilo kao u init migraciji, sada i za kasnije tabele.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Tabele iz budućih migracija (vlasnik postgres) dobijaju iste dozvole i lokalno i na serveru.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
