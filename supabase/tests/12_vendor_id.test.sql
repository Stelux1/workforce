-- Testovi za automatski Vendor ID (migracija 20261124110000_vendor_id_automatski.sql):
--  * dva nova dobavljača dobijaju VEN-001 i VEN-002; ID koji pošalje klijent se ignoriše;
--  * ID se izmenom ne menja; ručni ID koji ostane iz starih podataka se ne dira, a sledeći broj ide iza najvećeg;
--  * posle VEN-999 sledi VEN-1000; dva dobavljača ne mogu da dele isti ID.
-- Sve se radi u jednoj transakciji i vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- Prazno stanje: postojećim dobavljačima (ako ih lokalna baza ima) se, bez okidača, uklanja ID — samo u ovoj transakciji.
set local session_replication_role = replica;
update public.vendors set vendor_id = null;
set local session_replication_role = origin;

insert into public.vendors (name, vendor_id) values ('QA-12 Prvi', 'RUCNO-1');
insert into public.vendors (name) values ('QA-12 Drugi');
select is((select vendor_id from public.vendors where name = 'QA-12 Prvi'), 'VEN-001', 'prvi novi dobavljač dobija VEN-001 (ID iz upita se ignoriše)');
select is((select vendor_id from public.vendors where name = 'QA-12 Drugi'), 'VEN-002', 'drugi novi dobavljač dobija VEN-002');

update public.vendors set vendor_id = 'MOJ-ID', name = 'QA-12 Prvi (izmenjen)' where name = 'QA-12 Prvi';
select is((select vendor_id from public.vendors where name = 'QA-12 Prvi (izmenjen)'), 'VEN-001', 'izmena ne menja već dodeljen ID');
update public.vendors set vendor_id = null where name = 'QA-12 Drugi';
select is((select vendor_id from public.vendors where name = 'QA-12 Drugi'), 'VEN-002', 'ID se ne može obrisati izmenom');

-- Stari ručno uneti ID (zaobilazi okidač kao stari podaci) ostaje, a sledeći broj ide iza najvećeg VEN-NNN.
set local session_replication_role = replica;
insert into public.vendors (name, vendor_id) values ('QA-12 Stari ručni', 'VEN-040'), ('QA-12 Bez ID-a', null), ('QA-12 Tuđi format', 'ABC-7');
set local session_replication_role = origin;
select is((select vendor_id from public.vendors where name = 'QA-12 Stari ručni'), 'VEN-040', 'postojeći ručni ID se ne menja');
select is((select vendor_id from public.vendors where name = 'QA-12 Tuđi format'), 'ABC-7', 'ID drugog formata se ne menja');
insert into public.vendors (name) values ('QA-12 Posle ručnog');
select is((select vendor_id from public.vendors where name = 'QA-12 Posle ručnog'), 'VEN-041', 'sledeći broj ide iza najvećeg postojećeg VEN-NNN');

update public.vendors set name = 'QA-12 Bez ID-a (izmenjen)' , vendor_id = '' where name = 'QA-12 Bez ID-a';
select is((select vendor_id from public.vendors where name = 'QA-12 Bez ID-a (izmenjen)'), 'VEN-042', 'dobavljač bez ID-a ga dobija pri prvoj izmeni ID-a');

-- Posle 999 → 1000 (bez skraćivanja).
set local session_replication_role = replica;
insert into public.vendors (name, vendor_id) values ('QA-12 Devetsto devedeset deveti', 'VEN-999');
set local session_replication_role = origin;
insert into public.vendors (name) values ('QA-12 Hiljaditi');
select is((select vendor_id from public.vendors where name = 'QA-12 Hiljaditi'), 'VEN-1000', 'posle VEN-999 sledi VEN-1000');

-- Jedinstvenost.
select throws_ok(
  $$ set local session_replication_role = replica;
     insert into public.vendors (name, vendor_id) values ('QA-12 Duplikat', 'VEN-001') $$,
  '23505', null, 'dva dobavljača ne mogu da imaju isti ID');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'vendors' and indexname = 'vendors_vendor_id_key'),
  1, 'postoji unique indeks nad vendor_id');

select * from finish();
rollback;
