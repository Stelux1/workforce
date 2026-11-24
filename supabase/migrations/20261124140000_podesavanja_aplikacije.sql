-- Podešavanja cele aplikacije: jezik i valuta (zahtev 7, Teamora). Jedan red, kao company_settings.
-- Svi prijavljeni čitaju (jezik se primenjuje svima), menja samo admin. Podrazumevano: engleski i EUR.
-- Jezici: en (English), sk (Slovenčina), rs (Srpski). Valuta: samo EUR (D2 — nema kursa, pa nema RSD prikaza).
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  language text not null default 'en' check (language in ('en', 'sk', 'rs')),
  currency text not null default 'EUR' check (currency in ('EUR')),
  updated_date timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists app_settings_updated on public.app_settings;
create trigger app_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_date();

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
drop policy if exists app_settings_admin_write on public.app_settings;
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
revoke all on public.app_settings from anon;
