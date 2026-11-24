-- Vendors (spec §11, 11.02; P7-N4): ugovorni periodi podizvođača i broj povezanih radnika.
--
-- 1. vendor_contracts: ugovor sa podizvođačem za period (od/do), rok plaćanja i valuta. Dva AKTIVNA ugovora istog
--    vendora ne smeju da se preklapaju (exclusion constraint); završen/otkazan ugovor ostaje u istoriji.
--    Čita ko čita vendore (osoblje), menja ko menja vendore (employees.manage ili engagement.manage — isto kao
--    politika tabele vendors, §4: Vendors RW za Admin, HR, Finance; PM samo čita). Ništa anon-u (D14). Audit trigger.
-- 2. vendor_worker_counts (view, security_invoker): povezani radnici po vendoru iz employment_history
--    (engagement_type = subcontractor_worker): koliko ih je aktivno danas i koliko ukupno. Kolona „Active Workers"
--    na stranici Vendors je zato stvaran broj iz baze, bez ograničenja broja učitanih redova.
--
-- Obaveze plaćanja vendoru se ne kopiraju: stranica ih čita iz payables (vendor_id) uz payroll.view (RLS payables).
-- Bezbedno za produkciju: nova tabela i view, postojeći podaci se ne menjaju. Idempotentno.
-- Backfill se namerno ne radi: vendors.contract_reference nema datume, a period ugovora se ne izmišlja.

create extension if not exists btree_gist with schema extensions;

-- ═════════════════════════════ 1. vendor_contracts ═════════════════════════════
create table if not exists public.vendor_contracts (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  reference text not null,
  start_date date not null,
  end_date date,
  payment_terms_days integer,
  currency text not null default 'EUR',
  notes text,
  status text not null default 'active',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint vendor_contracts_reference_check check (btrim(reference) <> ''),
  constraint vendor_contracts_dates check (end_date is null or end_date >= start_date),
  constraint vendor_contracts_payment_terms_days_check check (payment_terms_days is null or payment_terms_days between 0 and 365),
  constraint vendor_contracts_currency_check check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  constraint vendor_contracts_status_check check (status in ('active', 'ended', 'cancelled'))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendor_contracts_no_overlap'
                   and conrelid = 'public.vendor_contracts'::regclass) then
    alter table public.vendor_contracts add constraint vendor_contracts_no_overlap exclude using gist (
      vendor_id with =, daterange(start_date, end_date, '[]') with &&) where (status = 'active');
  end if;
end $$;

-- Vendor sa ugovorima se ne briše (istorija ugovora ostaje) — kao kod angažmana, postavlja se na Neaktivan.
alter table public.vendor_contracts drop constraint if exists vendor_contracts_vendor_id_fkey,
  add constraint vendor_contracts_vendor_id_fkey foreign key (vendor_id) references public.vendors (id) on delete restrict;

create index if not exists vendor_contracts_vendor_idx on public.vendor_contracts (vendor_id, start_date desc);

comment on table public.vendor_contracts is 'ugovorni periodi podizvođača (§11): referenca, od/do, rok plaćanja, valuta; aktivni periodi istog vendora se ne preklapaju';
comment on column public.vendor_contracts.payment_terms_days is 'rok plaćanja u danima po ovom ugovoru (informativno; due date obaveze i dalje računa vendors.payment_terms_days)';

drop trigger if exists vendor_contracts_updated on public.vendor_contracts;
create trigger vendor_contracts_updated before update on public.vendor_contracts
  for each row execute function public.set_updated_date();
drop trigger if exists vendor_contracts_audit on public.vendor_contracts;
create trigger vendor_contracts_audit after insert or update or delete on public.vendor_contracts
  for each row execute function public.audit_row();

select public.apply_table_policies('vendor_contracts', '(select public.is_staff())',
  '((select public.has_permission(''employees.manage'')) or (select public.has_permission(''engagement.manage'')))');

revoke all on public.vendor_contracts from anon;
grant select, insert, update, delete on public.vendor_contracts to authenticated;
grant all on public.vendor_contracts to service_role;

-- ═════════════════════════════ 2. povezani radnici po vendoru ═════════════════════════════
-- Aktivan danas: angažman preko vendora sa status 'active' koji pokriva current_date.
-- security_invoker: važi RLS employment_history (osoblje čita), neaktivan nalog/anon ne dobijaju ništa.
create or replace view public.vendor_worker_counts with (security_invoker = true) as
select h.vendor_id,
       count(distinct h.employee_id) filter (
         where h.status = 'active' and h.start_date <= current_date
           and (h.end_date is null or h.end_date >= current_date))::int as active_workers,
       count(distinct h.employee_id)::int as total_workers
from public.employment_history h
where h.vendor_id is not null
group by h.vendor_id;
comment on view public.vendor_worker_counts is 'povezani radnici po vendoru (§11): aktivni danas i ukupno, iz employment_history';

revoke all on public.vendor_worker_counts from anon;
grant select on public.vendor_worker_counts to authenticated;
grant select on public.vendor_worker_counts to service_role;
