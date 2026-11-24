-- Testovi za izričite dozvole nad tabelama (migracija 20261122120000_dozvole_tabela.sql):
--  * prijavljen korisnik (authenticated) ima select/insert/update/delete na svakoj tabeli u public — bez toga
--    server vraća 403 i pre nego što RLS dođe na red (produkcija 22.11.2026: prijava je „vraćala na početak");
--  * neprijavljen (anon) nema nijednu dozvolu ni na jednoj tabeli;
--  * tabela iz neke buduće migracije dobija iste dozvole sama (podrazumevane dozvole za postgres);
--  * izuzeci namerno: audit_log (nepromenljiv, upisuje ga samo audit_row/audit_event) i migration_report (upisuju
--    ga samo migracije; korisnik sa pravom samo označava rešeno) — migracija 20261125010000; timesheets (select samo
--    nad kolonama bez iznosa, iznosi kroz view timesheet_money — T-A2, migracija 20261125040000, R6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and c.relname not in ('audit_log', 'migration_report', 'timesheets', 'employee_private') -- T26: column grant (20261125040000)
      and c.relname <> 'clients' -- default_b2b_rate: column grant, tarifa kroz view client_money (W2-F, 20261125090000)
      and not (has_table_privilege('authenticated', c.oid, 'select')
           and has_table_privilege('authenticated', c.oid, 'insert')
           and has_table_privilege('authenticated', c.oid, 'update')
           and has_table_privilege('authenticated', c.oid, 'delete'))),
  null,
  'authenticated ima select/insert/update/delete na svakoj tabeli u public'
);

select is(
  (select array_agg(c.relname order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (has_table_privilege('anon', c.oid, 'select')
        or has_table_privilege('anon', c.oid, 'insert')
        or has_table_privilege('anon', c.oid, 'update')
        or has_table_privilege('anon', c.oid, 'delete'))),
  null,
  'anon nema nijednu dozvolu ni na jednoj tabeli u public'
);

-- Buduća tabela: pravi je postgres, kao što to rade migracije.
set local role postgres;
create table public.qa11_buduca_tabela (id int primary key);
reset role;

select ok(
  has_table_privilege('authenticated', 'public.qa11_buduca_tabela', 'select, insert, update, delete'),
  'nova tabela iz migracije odmah ima dozvole za authenticated'
);

select ok(
  not has_table_privilege('anon', 'public.qa11_buduca_tabela', 'select'),
  'nova tabela iz migracije nije dostupna za anon'
);

select * from finish();
rollback;
