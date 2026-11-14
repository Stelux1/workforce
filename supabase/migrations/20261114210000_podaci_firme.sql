-- Podaci firme (za zaglavlje PDF-a platnog lista i satnice). Jedan red, kao work_rules.
-- Polja počinju PRAZNA: nikakvi izmišljeni podaci firme; Luka ih upisuje u Podešavanja → Podaci firme.
-- Admin menja, svaki prijavljeni korisnik čita (operater štampa PDF satnice).
create table public.company_settings (
  id boolean primary key default true check (id),
  name text,
  pib text check (pib is null or pib ~ '^[0-9]{9}$'),
  registration_number text check (registration_number is null or registration_number ~ '^[0-9]{8}$'),
  address text,
  city text,
  bank_account text,
  logo_url text,
  updated_date timestamptz not null default now()
);
insert into public.company_settings (id) values (true);

create trigger company_settings_updated before update on public.company_settings
  for each row execute function public.set_updated_date();

alter table public.company_settings enable row level security;
create policy company_settings_read on public.company_settings for select to authenticated using (true);
create policy company_settings_admin_write on public.company_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.company_settings from anon;
