-- Vendor ID dodeljuje baza (zahtev 4, Teamora): VEN-001, VEN-002, … pri unosu dobavljača.
--  * Novi dobavljač uvek dobija sledeći broj iza NAJVEĆEG postojećeg VEN-NNN (vrednost koju pošalje klijent se
--    ignoriše). Posle VEN-999 sledi VEN-1000 (broj se ne skraćuje).
--  * Dva istovremena unosa ne mogu da dobiju isti broj: dodela se serijalizuje advisory zaključavanjem, a vendor_id
--    je i jedinstven (parcijalni unique indeks, više dobavljača bez ID-a ne smeta).
--  * Postojeći ID se ne menja izmenom (ni sa ekrana ni preko API-ja) — izmena vendor_id kolone se tiho ignoriše.
--    Dobavljač koji ID još nema (stari podaci) ga dobija pri prvoj izmeni, a ovde se odmah dodeljuje svima.
--  * Postojeći ručno uneti ID-jevi ostaju; dobavljači bez ID-a dobijaju ga po redosledu kreiranja. Ako su dva
--    dobavljača imala isti ručni ID, prvi (po datumu kreiranja) ga zadržava a ostali dobijaju novi broj.

create or replace function public.next_vendor_id() returns text
language plpgsql security definer set search_path = '' as $$
declare
  n bigint;
begin
  -- Računanje najvećeg broja i upis moraju da idu jedno za drugim.
  perform pg_advisory_xact_lock(hashtext('public.vendors: vendor_id'));
  select coalesce(max(substring(v.vendor_id from '^VEN-(\d{1,9})$')::bigint), 0) + 1 into n from public.vendors v;
  return 'VEN-' || case when n < 1000 then lpad(n::text, 3, '0') else n::text end;
end $$;

create or replace function public.vendors_assign_id() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.vendor_id := public.next_vendor_id();
  elsif old.vendor_id is not null then
    new.vendor_id := old.vendor_id;
  elsif new.vendor_id is null or btrim(new.vendor_id) = '' then
    new.vendor_id := public.next_vendor_id();
  end if;
  return new;
end $$;

revoke all on function public.next_vendor_id() from public, anon, authenticated;
revoke all on function public.vendors_assign_id() from public, anon, authenticated;

-- Dodela starim podacima: duplikati ručnih ID-jeva (zadržava prvi) i prazni ID-jevi se postavljaju na NULL pa se numerišu.
update public.vendors v set vendor_id = null
 where btrim(coalesce(v.vendor_id, '')) = ''
    or exists (select 1 from public.vendors o
                where o.vendor_id = v.vendor_id
                  and (o.created_date, o.id) < (v.created_date, v.id));

do $$
declare
  r record;
begin
  for r in select id from public.vendors where vendor_id is null order by created_date, id loop
    update public.vendors set vendor_id = public.next_vendor_id() where id = r.id;
  end loop;
end $$;

drop trigger if exists vendors_assign_id on public.vendors;
create trigger vendors_assign_id
  before insert or update of vendor_id on public.vendors
  for each row execute function public.vendors_assign_id();

create unique index if not exists vendors_vendor_id_key on public.vendors (vendor_id) where vendor_id is not null;
