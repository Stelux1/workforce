-- Podrazumevani šifarnici i koeficijenti u procentima (Teamora, zahtevi 8/9, 10, 11).
-- Sve je bezbedno i za produkciju: ništa se ne briše, postojeći podaci se ne prepisuju, ponovno pokretanje ne pravi duplikate.

-- ═════════════════════ 8/9. Podrazumevane kategorije troškova ═════════════════════
-- Spisak sa slika 8 i 9 (12 kategorija). Nazivi su podaci (engleski, kao na slikama), ne prevode se (zahtev 6).
-- Jedno mesto istine: migracija i dugme „Restore default categories" čitaju ovu funkciju.
create or replace function public.default_cost_categories() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_agg(c order by ord)
  from unnest(array[
    ($c${"name": "Accommodation", "subcategories": [{"name": "Apartment Rental"}, {"name": "Hotel & Guesthouse"}, {"name": "Worker Housing"}, {"name": "Utilities"}, {"name": "Cleaning Services"}, {"name": "Laundry & Linen"}, {"name": "Maintenance & Repairs"}, {"name": "Booking Fees"}, {"name": "Accommodation Taxes"}]}$c$::jsonb),
    ($c${"name": "Administrative Costs", "subcategories": [{"name": "Permits"}, {"name": "Certification"}, {"name": "Documentation"}, {"name": "Printing"}, {"name": "Phone Costs"}, {"name": "Internet Costs"}, {"name": "Office Supplies"}]}$c$::jsonb),
    ($c${"name": "Insurance & Compliance", "subcategories": [{"name": "General Liability Insurance"}, {"name": "Employer's Liability Insurance"}, {"name": "Workers' Compensation Insurance"}, {"name": "Professional Indemnity Insurance"}, {"name": "Project-Specific Insurance"}, {"name": "Compliance Audits"}, {"name": "Legal & Regulatory Services"}, {"name": "Safety Inspections"}, {"name": "Regulatory Fees & Licenses"}]}$c$::jsonb),
    ($c${"name": "Meals & Per Diems", "subcategories": [{"name": "Daily Allowance (Per Diem)"}, {"name": "Meal Allowance"}, {"name": "Breakfast Expenses"}, {"name": "Lunch Expenses"}, {"name": "Dinner Expenses"}, {"name": "Catering Services"}, {"name": "Drinking Water & Refreshments"}]}$c$::jsonb),
    ($c${"name": "Medical Expenses", "subcategories": [{"name": "Medical Examinations"}, {"name": "Fit to Work Examinations"}, {"name": "Alcohol & Drug Testing"}, {"name": "Vaccination"}, {"name": "First Aid"}, {"name": "Medical Equipment"}]}$c$::jsonb),
    ($c${"name": "Miscellaneous Costs", "subcategories": [{"name": "Unforeseen Costs"}, {"name": "Project Contingency"}, {"name": "Banking Fees"}, {"name": "Insurance"}]}$c$::jsonb),
    ($c${"name": "PPE / Safety Equipment", "subcategories": [{"name": "Workwear"}, {"name": "Safety Shoes"}, {"name": "Safety Helmets"}, {"name": "Safety Glasses"}, {"name": "Safety Gloves"}, {"name": "Ear Protection"}, {"name": "Fall Protection Equipment"}, {"name": "Respiratory Protection"}, {"name": "High Visibility Vests"}, {"name": "Rain Gear"}]}$c$::jsonb),
    ($c${"name": "Recruitment & Onboarding", "subcategories": [{"name": "Recruitment Agency Fees"}, {"name": "Job Advertising"}, {"name": "Candidate Screening"}, {"name": "Background Checks"}, {"name": "Interview Expenses"}, {"name": "Onboarding Expenses"}, {"name": "Employee Relocation"}, {"name": "Initial Worksite Induction"}]}$c$::jsonb),
    ($c${"name": "Site Facilities & Services", "subcategories": [{"name": "Site Office Rental"}, {"name": "Portable Toilets & Sanitary Facilities"}, {"name": "Site Utilities"}, {"name": "Waste Disposal"}, {"name": "Site Cleaning Services"}, {"name": "Temporary Site Facilities"}, {"name": "Site Security Services"}, {"name": "Site Access & Parking Fees"}, {"name": "Site Maintenance"}]}$c$::jsonb),
    ($c${"name": "Tools & Equipment", "subcategories": [{"name": "Hand Tools"}, {"name": "Power Tools"}, {"name": "Consumables"}, {"name": "Calibration"}, {"name": "Equipment Rental"}, {"name": "Tool Maintenance"}, {"name": "Lifting Equipment"}]}$c$::jsonb),
    ($c${"name": "Training Costs", "subcategories": [{"name": "HSE Training"}, {"name": "Working at Height Training"}, {"name": "Lifting Training"}, {"name": "Operator Training"}, {"name": "Welder Certification"}, {"name": "VCA / SCC Training"}]}$c$::jsonb),
    ($c${"name": "Transport & Logistics", "subcategories": [{"name": "Fuel"}, {"name": "Travel Expenses"}, {"name": "Flight Tickets"}, {"name": "Car Rental"}]}$c$::jsonb)
  ]) with ordinality as t(c, ord)
$$;

-- Naziv se poredi bez razlike u velikim slovima i razmacima na krajevima („site maintenance " = „Site Maintenance").
create or replace function public.cost_category_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(btrim(coalesce(p_name, '')))
$$;

-- Ubacuje podrazumevane kategorije kojih nema (po nazivu). Sa p_fill_subcategories dopunjuje i podkategorije
-- koje fale postojećoj kategoriji istog naziva (postojeće podkategorije, njihov redosled i ostala polja ostaju).
-- Vraća broj ubačenih kategorija. Interna funkcija — ekran zove restore_default_cost_categories().
create or replace function public.seed_default_cost_categories(p_fill_subcategories boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb;
  v_id uuid;
  v_subs jsonb;
  v_missing jsonb;
  v_added integer := 0;
begin
  -- Dva istovremena vraćanja ne smeju da ubace istu kategoriju dvaput.
  perform pg_advisory_xact_lock(hashtext('public.cost_categories: defaults'));
  for d in select value from jsonb_array_elements(public.default_cost_categories())
  loop
    select cc.id, cc.subcategories into v_id, v_subs
    from public.cost_categories cc
    where public.cost_category_key(cc.name) = public.cost_category_key(d ->> 'name')
    order by cc.created_date, cc.id
    limit 1;

    if v_id is null then
      insert into public.cost_categories (name, subcategories) values (d ->> 'name', d -> 'subcategories');
      v_added := v_added + 1;
    elsif p_fill_subcategories then
      v_subs := case when jsonb_typeof(v_subs) = 'array' then v_subs else '[]'::jsonb end;
      -- Podkategorija je objekat {name, …} ili (stari zapis) samo string.
      select jsonb_agg(s.value order by s.ord) into v_missing
      from jsonb_array_elements(d -> 'subcategories') with ordinality as s(value, ord)
      where not exists (
        select 1 from jsonb_array_elements(v_subs) e
        where public.cost_category_key(case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                                                                   else e.value ->> 'name' end)
            = public.cost_category_key(s.value ->> 'name'));
      if v_missing is not null then
        update public.cost_categories set subcategories = v_subs || v_missing where id = v_id;
      end if;
    end if;
  end loop;
  return v_added;
end $$;

-- Dugme „Restore default categories" (samo admin): vraća samo obrisane podrazumevane kategorije (sa njihovim
-- podkategorijama). Postojeće kategorije se ne diraju — ni podkategorije koje je korisnik namerno obrisao.
create or replace function public.restore_default_cost_categories() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Podrazumevane kategorije troškova vraća samo admin' using errcode = '42501';
  end if;
  return public.seed_default_cost_categories(false);
end $$;

revoke execute on function public.default_cost_categories(), public.cost_category_key(text),
  public.seed_default_cost_categories(boolean), public.restore_default_cost_categories() from public, anon;
revoke execute on function public.seed_default_cost_categories(boolean) from authenticated;
grant execute on function public.restore_default_cost_categories() to authenticated;

-- Seed: kategorije kojih nema + podkategorije koje fale postojećim (Filip je neke možda već uneo ručno na produkciji).
select public.seed_default_cost_categories(true);

-- ═════════════════════ 10. Koeficijenti u procentima ═════════════════════
-- Ekran od sada prikazuje i prima procente (100% / 150%), a baza i dalje čuva koeficijent (1.0 / 1.5) — spec §5.
-- Pre ove izmene polje je primalo goli koeficijent, pa je korisnik upisivao procente (slika 10: vikend klijent „150",
-- mislio je 150% = 1,5). Koeficijent ≥ 10 (1000%) nema smisla kao množilac satnice, a procenat ispod 10% nema smisla
-- kao dodatak za prekovremeni/vikend/praznik — zato je vrednost ≥ 10 sigurno upisan procenat i deli se sa 100.
-- (Kolona je numeric(6,4), pa „150" nije ni moglo da se sačuva; ovo pokriva npr. „50" ili „15".)
-- D10: odobrene satnice nose svoj snimak koeficijenata (rate_snapshot) i ovo ih ne menja; nacrti se preračunavaju
-- pri sledećoj izmeni, kao i posle svake promene koeficijenta.
update public.hour_types set worker_coef = round(worker_coef / 100, 4) where worker_coef >= 10;
update public.hour_types set client_coef = round(client_coef / 100, 4) where client_coef >= 10;

-- Od sada baza ne prima koeficijent preko 10 (1000%); > 0 je već postojeće pravilo, prazno i dalje blokira obračun (D5).
alter table public.hour_types drop constraint if exists hour_types_worker_coef_max;
alter table public.hour_types drop constraint if exists hour_types_client_coef_max;
alter table public.hour_types add constraint hour_types_worker_coef_max check (worker_coef <= 10);
alter table public.hour_types add constraint hour_types_client_coef_max check (client_coef <= 10);

-- ═════════════════════ 11. Osnovni evropski praznici 2026. i 2027. ═════════════════════
-- Isti spisak i isti datumi kao defaultEuropeanHolidays() u src/lib/europeanHolidays.js (test: europeanHolidays.test.js).
-- Pokretni praznici prate zapadni Uskrs: 5.4.2026. i 28.3.2027. (Veliki petak −2, Uskrsni ponedeljak +1,
-- Spasovdan +39, Duhovski ponedeljak +50 dana). Datum koji već postoji se ne dira (ni naziv koji je admin upisao).
-- D10: odobrene satnice imaju praznike te nedelje u snimku i ne menjaju se; nacrt se preračunava pri sledećoj izmeni.
insert into public.holidays (date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-06', 'Easter Monday'),
  ('2026-05-01', 'Labour Day'),
  ('2026-05-14', 'Ascension Day'),
  ('2026-05-25', 'Whit Monday'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-26', 'St. Stephen''s Day'),
  ('2027-01-01', 'New Year''s Day'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Easter Monday'),
  ('2027-05-01', 'Labour Day'),
  ('2027-05-06', 'Ascension Day'),
  ('2027-05-17', 'Whit Monday'),
  ('2027-12-25', 'Christmas Day'),
  ('2027-12-26', 'St. Stephen''s Day')
on conflict (date) do nothing;
