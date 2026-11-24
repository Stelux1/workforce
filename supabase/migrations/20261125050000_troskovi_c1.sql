-- Project Costs C1 + C2 (Teamora spec v1.4 §8, T-C; docs/TEAMORA-DATA-MODEL.md §2.7, rizik R9).
-- Ovo je jedan trošak i jedan entitet za oba pogleda (Project → Costs i Projects → Project Costs): T13.
--
-- Šta se menja:
--  * project_costs dobija: cost_date, cost_category_id (veza sa Settings → Cost Categories), employee_id / vendor_id
--    (najviše jedno), billable (samo oznaka, T15), receipt_url / receipt_name (privatni bucket), fx_rate_date (K3);
--  * valuta troška: EUR, RSD, GBP, USD (kao tarife); kurs je i dalje „jedinica valute za 1 EUR" (eur_rsd_rate), sada uz datum kursa;
--  * cost_categories.payroll_linked — kategorija koja predstavlja trošak rada ide kroz Timesheets/Payroll, ne kroz Project Costs (§8.1.6);
--  * guard_project_cost v2 — pravila u bazi (ne samo na ekranu); propagate_cost_category_rename — snimak naziva kategorije.
--
-- Bezbedno za produkciju (R9):
--  * ništa se ne briše; stari redovi ostaju, backfill je idempotentan (radi samo nad redovima kojima fali vrednost);
--  * cost_date = created_date::date; kategorija se povezuje po nazivu (cost_category_key). Nepovezan trošak i ne-EUR trošak
--    bez datuma kursa ostaju takvi kakvi jesu, idu u migration_report i na ekranu nose oznaku; obavezno je tek pri sledećoj izmeni;
--  * backfill ne prolazi kroz audit ni guard (nije radnja korisnika) — trigeri se isključuju samo za njega, u istoj transakciji.
-- Audit trigger nad project_costs kači migracija 01 (T-B); prava (RLS) menja T-B u migraciji 02.

-- ═════════════════════ kolone ═════════════════════
alter table public.cost_categories
  add column if not exists payroll_linked boolean not null default false;

alter table public.project_costs
  add column if not exists cost_date date,
  add column if not exists cost_category_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists vendor_id uuid,
  add column if not exists billable boolean not null default false,
  add column if not exists receipt_url text,
  add column if not exists receipt_name text,
  add column if not exists fx_rate_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_costs_cost_category_id_fkey') then
    alter table public.project_costs add constraint project_costs_cost_category_id_fkey
      foreign key (cost_category_id) references public.cost_categories (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_costs_employee_id_fkey') then
    alter table public.project_costs add constraint project_costs_employee_id_fkey
      foreign key (employee_id) references public.employees (id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_costs_vendor_id_fkey') then
    alter table public.project_costs add constraint project_costs_vendor_id_fkey
      foreign key (vendor_id) references public.vendors (id) on delete restrict;
  end if;
  -- Trošak se vezuje za radnika ILI za dobavljača, nikad za oba.
  if not exists (select 1 from pg_constraint where conname = 'project_costs_one_party') then
    alter table public.project_costs add constraint project_costs_one_party
      check (num_nonnulls(employee_id, vendor_id) <= 1);
  end if;
  -- Valute kao u tarifama (K3). Stara ograničenja nad kolonom valute (EUR, RSD) se zamenjuju.
  if not exists (select 1 from pg_constraint where conname = 'project_costs_currency_4') then
    declare c record;
    begin
      for c in select conname from pg_constraint
               where conrelid = 'public.project_costs'::regclass and contype = 'c'
                 and pg_get_constraintdef(oid) like '%currency%' loop
        execute format('alter table public.project_costs drop constraint %I', c.conname);
      end loop;
    end;
    alter table public.project_costs add constraint project_costs_currency_4
      check (currency in ('EUR', 'RSD', 'GBP', 'USD'));
  end if;
end $$;

create index if not exists project_costs_date_idx on public.project_costs (cost_date);
create index if not exists project_costs_category_idx on public.project_costs (cost_category_id);
create index if not exists project_costs_employee_idx on public.project_costs (employee_id) where employee_id is not null;
create index if not exists project_costs_vendor_idx on public.project_costs (vendor_id) where vendor_id is not null;

-- ═════════════════════ backfill (bez trigera: nije radnja korisnika) ═════════════════════
alter table public.project_costs disable trigger user;

update public.project_costs set cost_date = created_date::date where cost_date is null;

update public.project_costs pc
   set cost_category_id = (
         select cc.id from public.cost_categories cc
          where public.cost_category_key(cc.name) = public.cost_category_key(pc.category)
          order by cc.created_date, cc.id limit 1)
 where pc.cost_category_id is null and btrim(coalesce(pc.category, '')) <> '';

alter table public.project_costs enable trigger user;

alter table public.project_costs alter column cost_date set not null;

-- R9: šta ostaje nepovezano ide u izveštaj (jednom po redu i vrsti problema).
insert into public.migration_report (migration, entity, entity_id, issue, details)
select '20261125050000_troskovi_c1', 'project_costs', pc.id::text,
       'Trošak nema povezanu kategoriju iz Settings → Cost Categories — pri sledećoj izmeni mora dobiti kategoriju',
       jsonb_build_object('project_id', pc.project_id, 'category', pc.category, 'subcategory', pc.subcategory,
                          'amount', pc.amount, 'currency', pc.currency, 'cost_date', pc.cost_date)
  from public.project_costs pc
 where pc.cost_category_id is null
   and not exists (select 1 from public.migration_report r
                    where r.migration = '20261125050000_troskovi_c1' and r.entity = 'project_costs'
                      and r.entity_id = pc.id::text and r.issue like 'Trošak nema povezanu kategoriju%');

insert into public.migration_report (migration, entity, entity_id, issue, details)
select '20261125050000_troskovi_c1', 'project_costs', pc.id::text,
       'Trošak van EUR nema datum kursa — u EUR zbir ne ulazi dok se datum kursa ne upiše',
       jsonb_build_object('project_id', pc.project_id, 'amount', pc.amount, 'currency', pc.currency,
                          'eur_rsd_rate', pc.eur_rsd_rate, 'cost_date', pc.cost_date)
  from public.project_costs pc
 where pc.currency <> 'EUR' and pc.fx_rate_date is null
   and not exists (select 1 from public.migration_report r
                    where r.migration = '20261125050000_troskovi_c1' and r.entity = 'project_costs'
                      and r.entity_id = pc.id::text and r.issue like 'Trošak van EUR nema datum kursa%');

-- ═════════════════════ guard_project_cost v2 ═════════════════════
-- Pravila (§8.1, K3, R9):
--  * cost_date, amount, currency i kategorija su obavezni; stari red bez kategorije ostaje, ali pri izmeni mora da je dobije;
--  * kategorija sa podkategorijama traži podkategoriju iz njenog spiska; kategorija bez podkategorija je ne prima;
--  * category / subcategory tekst je snimak iz kategorije (za prikaz); veza je cost_category_id;
--  * kategorija payroll_linked se odbija (trošak rada ide kroz Timesheets/Payroll);
--  * trošak van EUR traži kurs > 0 I datum kursa — pri unosu i pri izmeni iznosa, valute, kursa ili datuma kursa;
--    stari red bez datuma kursa ostaje (ekran ga označava) dok se ne menja ništa od toga;
--  * eur_amount računa baza (EUR = iznos; ostalo = round(iznos / kurs, 2), pola od nule); poslata vrednost se ignoriše;
--  * billable ne utiče ni na šta (T15): nijedan račun, stavka ni prihod se ne prave.
create or replace function public.guard_project_cost() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_cat public.cost_categories%rowtype;
  v_subs jsonb;
  v_sub text;
  v_cat_changed boolean;
  v_fx_changed boolean;
begin
  if new.cost_date is null then
    raise exception 'Datum troška je obavezan' using errcode = 'check_violation';
  end if;
  if new.amount is null then
    raise exception 'Iznos troška je obavezan' using errcode = 'check_violation';
  end if;
  if new.currency is null then
    raise exception 'Valuta troška je obavezna' using errcode = 'check_violation';
  end if;
  if new.cost_category_id is null then
    raise exception 'Kategorija troška je obavezna' using errcode = 'check_violation';
  end if;

  -- ───── kategorija i podkategorija ─────
  v_cat_changed := tg_op = 'INSERT' or new.cost_category_id is distinct from old.cost_category_id;
  select * into v_cat from public.cost_categories where id = new.cost_category_id;
  if not found then
    raise exception 'Kategorija troška ne postoji' using errcode = 'check_violation';
  end if;
  if v_cat_changed and v_cat.payroll_linked then
    raise exception 'Trošak rada ide kroz Timesheets/Payroll' using errcode = 'check_violation';
  end if;

  v_subs := case when jsonb_typeof(v_cat.subcategories) = 'array' then v_cat.subcategories else '[]'::jsonb end;
  if v_cat_changed or new.subcategory is distinct from old.subcategory then
    if jsonb_array_length(v_subs) > 0 then
      if btrim(coalesce(new.subcategory, '')) = '' then
        raise exception 'Podkategorija je obavezna za kategoriju %', v_cat.name using errcode = 'check_violation';
      end if;
      -- Podkategorija je objekat {name, …} ili (stari zapis) string; poredi se kao naziv kategorije (cost_category_key).
      select case jsonb_typeof(e.value) when 'string' then e.value #>> '{}' else e.value ->> 'name' end
        into v_sub
        from jsonb_array_elements(v_subs) e
       where public.cost_category_key(case jsonb_typeof(e.value) when 'string' then e.value #>> '{}' else e.value ->> 'name' end)
           = public.cost_category_key(new.subcategory)
       limit 1;
      if v_sub is null then
        raise exception 'Podkategorija „%" ne postoji u kategoriji %', new.subcategory, v_cat.name
          using errcode = 'check_violation';
      end if;
      new.subcategory := v_sub;
    else
      new.subcategory := null;
    end if;
  end if;
  new.category := v_cat.name;

  -- ───── valuta, kurs i datum kursa ─────
  v_fx_changed := tg_op = 'INSERT'
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.eur_rsd_rate is distinct from old.eur_rsd_rate
    or new.fx_rate_date is distinct from old.fx_rate_date;

  if new.currency = 'EUR' then
    new.eur_rsd_rate := null;
    new.fx_rate_date := null;
    new.eur_amount := new.amount;
    return new;
  end if;

  if new.eur_rsd_rate is null or new.eur_rsd_rate <= 0 then
    if v_fx_changed then
      raise exception 'Trošak u % mora imati kurs veći od 0 (koliko % vredi 1 EUR)', new.currency, new.currency
        using errcode = 'check_violation';
    end if;
    new.eur_amount := old.eur_amount;      -- stari red bez kursa: i dalje nema EUR iznos
    return new;
  end if;
  if new.fx_rate_date is null and v_fx_changed then
    raise exception 'Trošak u % mora imati datum kursa', new.currency using errcode = 'check_violation';
  end if;
  new.eur_amount := round(new.amount / new.eur_rsd_rate, 2);
  return new;
end $$;

drop trigger if exists project_costs_guard on public.project_costs;
create trigger project_costs_guard before insert or update on public.project_costs
  for each row execute function public.guard_project_cost();

revoke execute on function public.guard_project_cost() from public, anon, authenticated;

-- ═════════════════════ preimenovanje kategorije ═════════════════════
-- Snimak naziva u troškovima prati kategoriju (veza je cost_category_id, pa zbirovi po kategoriji ostaju isti).
create or replace function public.propagate_cost_category_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    update public.project_costs set category = new.name where cost_category_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists cost_categories_rename on public.cost_categories;
create trigger cost_categories_rename after update of name on public.cost_categories
  for each row execute function public.propagate_cost_category_rename();

revoke execute on function public.propagate_cost_category_rename() from public, anon, authenticated;
