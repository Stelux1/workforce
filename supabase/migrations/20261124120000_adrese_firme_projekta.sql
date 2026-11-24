-- Podaci firme i adresa projekta (zahtevi 12 i 15, 24.11.2026).
-- Firma je u Slovačkoj: srpski PIB (tačno 9 cifara) se ukida, ostaje jedno polje „Tax ID" slobodnog formata.
-- Postojeća vrednost se ne gubi — kolona `pib` se preimenuje u `tax_id`. Dodaje se poštanski broj (ZIP) firme.
-- Projekat dobija adresu radilišta u tri polja (Address, ZIP, City); stari tekst `location` ostaje i prelazi u
-- `city`, a ekran posle čuvanja upisuje u `location` sastavljenu adresu („Address, ZIP City") za stari kod/izveštaje.
-- Migracija je bezbedna za ponovno pokretanje i ne briše podatke.

-- ── company_settings ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'company_settings' and column_name = 'pib')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'company_settings' and column_name = 'tax_id') then
    alter table public.company_settings rename column pib to tax_id;
  end if;
end $$;

-- Ukida se provera 9 cifara (D18): Tax ID je slobodnog formata (npr. SK2020123456), samo razumne dužine.
alter table public.company_settings drop constraint if exists company_settings_pib_check;
alter table public.company_settings drop constraint if exists company_settings_tax_id_check;
alter table public.company_settings
  add constraint company_settings_tax_id_check check (tax_id is null or char_length(tax_id) between 1 and 30);

alter table public.company_settings add column if not exists zip text;
alter table public.company_settings drop constraint if exists company_settings_zip_check;
alter table public.company_settings
  add constraint company_settings_zip_check check (zip is null or char_length(zip) between 1 and 12);

-- ── projects ─────────────────────────────────────────────────────
alter table public.projects add column if not exists address text;
alter table public.projects add column if not exists zip text;
alter table public.projects add column if not exists city text;

-- Stari tekst lokacije (npr. „Antwerp, BE") postaje grad, da se ništa ne izgubi; `location` ostaje netaknut.
update public.projects
   set city = btrim(location)
 where city is null and address is null and zip is null
   and location is not null and btrim(location) <> '';
