-- Troškovi projekta u RSD dobijaju kurs i EUR iznos (D2: sve u EUR, D8: „ostaje nama" oduzima ostale troškove u EUR).
--  * eur_rsd_rate — kurs koji admin unese uz trošak: koliko RSD vredi 1 EUR (isto značenje kao payroll_runs.eur_rsd_rate);
--  * eur_amount — iznos troška u EUR. Računa ga baza (trigger guard_project_cost); vrednost koju pošalje ekran se ignoriše:
--      EUR trošak            → eur_amount = amount, kurs nije potreban (briše se);
--      trošak u drugoj valuti → eur_amount = round(amount / eur_rsd_rate, 2) — pola od nule, isto kao round2
--                               (src/lib/payroll/costs.js → rsdToEur; isti primeri u payroll.test.js
--                               „isti primer kao pgTAP 06" i u supabase/tests/06_troskovi_kurs.test.sql);
--  * trošak koji nije u EUR bez kursa > 0 se ne prima — nikakav podrazumevani kurs (D2), ni pri izmeni.
--  * Postojeći redovi: EUR dobija eur_amount = amount. Trošak u RSD bez kursa zadržava eur_amount = null i ekran ga
--    prikazuje kao „nedostaje kurs" (nikad 0, nikad RSD sabran kao EUR); kurs mu se upisuje pri sledećoj izmeni.

alter table public.project_costs
  add column eur_rsd_rate numeric(10, 4) check (eur_rsd_rate is null or eur_rsd_rate > 0),
  add column eur_amount numeric(12, 2);

update public.project_costs set eur_amount = amount where currency = 'EUR';

create or replace function public.guard_project_cost() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.currency = 'EUR' then
    new.eur_rsd_rate := null;
    new.eur_amount := new.amount;
    return new;
  end if;
  -- Pre provere kolone (> 0), da poruka bude jasna.
  if new.eur_rsd_rate is null or new.eur_rsd_rate <= 0 then
    raise exception 'Trošak u % mora imati kurs veći od 0 (koliko % vredi 1 EUR)', new.currency, new.currency
      using errcode = 'check_violation';
  end if;
  new.eur_amount := round(new.amount / new.eur_rsd_rate, 2);
  return new;
end $$;

create trigger project_costs_guard before insert or update on public.project_costs
  for each row execute function public.guard_project_cost();

revoke execute on function public.guard_project_cost() from public, anon;
