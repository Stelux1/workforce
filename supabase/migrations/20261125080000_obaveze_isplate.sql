-- Payroll obaveze i stvarne isplate (Teamora spec v1.4 §7; docs/TEAMORA-DATA-MODEL.md §2.8, traka W2-E; T11, T12, T26).
--
-- Obračunata obaveza (payables + payable_lines) i stvarni odliv novca (payments) su odvojeni zapisi:
--   * obaveza nastaje SAMO generisanjem iz odobrenih satnica (labor_day_lines, T-A2): po primaocu (radnik ili Vendor,
--     T12) i valuti, sa linijama po (radnik, projekat, angažman) — razrada po radniku i kad je primalac Vendor;
--   * iznos = Σ grupa round2(Σ sati × B2C × koeficijent radnika), grupa iz §3.2 (+ angažman) — isto kao laborLines.js;
--   * posle potvrde (confirmed) iznos, valuta, period i primalac se ne menjaju; razlika ide kao korekcija
--     (adjustment) sa razlogom;
--   * jedna obaveza ima više uplata; Remaining = ukupno − Σ ne-storniranih uplata; preplata, druga valuta, izmena
--     i brisanje uplate se odbijaju (storno uz razlog umesto toga) — T11.
-- Prava (T26): čitanje payroll.view, obaveze payroll.manage, uplate payments.record. HR i PM ne vide ništa od ovoga.
-- JS dvojnik stanja: src/lib/finance/payables.js (payableBalance / canRecordPayment — ista pravila).
--
-- Zavisi od: 20261125010000 (has_permission, audit_row, can_read_audit), 20261125020000 (require_permission,
--            payroll.* u postojećim funkcijama obračuna), 20261125040000 (labor_day_lines, labor_day_problems).
-- Bezbedno za produkciju: samo dodaje (kolona, tabele, view, funkcije); payroll_runs/payslips se ne diraju (R10).
-- Idempotentno; D14: ništa anon-u.

create extension if not exists btree_gist with schema extensions;

-- ═════════════════════════════ 1. Vendor: rok plaćanja u danima ═════════════════════════════
-- Due date obaveze prema Vendoru = kraj perioda + rok. Bez roka nema ni datuma dospeća (ne izmišlja se).
alter table public.vendors add column if not exists payment_terms_days integer;
alter table public.vendors drop constraint if exists vendors_payment_terms_days_check;
alter table public.vendors add constraint vendors_payment_terms_days_check
  check (payment_terms_days is null or payment_terms_days between 0 and 365);
comment on column public.vendors.payment_terms_days is 'rok plaćanja u danima (due date obaveze = kraj perioda + rok)';

-- ═════════════════════════════ 2. tabele ═════════════════════════════
create table if not exists public.payables (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  payee_type text not null check (payee_type in ('employee', 'vendor')),
  employee_id uuid references public.employees (id) on delete restrict,
  vendor_id uuid references public.vendors (id) on delete restrict,
  currency text not null check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  calculated_amount numeric(12, 2) not null default 0,
  adjustments_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) generated always as (calculated_amount + adjustments_amount) stored,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  due_date date,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  payroll_run_id uuid references public.payroll_runs (id) on delete set null,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint payables_period_check check (period_end >= period_start),
  constraint payables_payee_check check (
    (payee_type = 'employee' and employee_id is not null and vendor_id is null)
    or (payee_type = 'vendor' and vendor_id is not null and employee_id is null))
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payables_no_overlap' and conrelid = 'public.payables'::regclass) then
    alter table public.payables add constraint payables_no_overlap exclude using gist (
      payee_type with =, (coalesce(employee_id, vendor_id)) with =, currency with =,
      daterange(period_start, period_end, '[]') with &&) where (status <> 'cancelled');
  end if;
end $$;

create index if not exists payables_period_idx on public.payables (period_start, period_end);
create index if not exists payables_employee_idx on public.payables (employee_id);
create index if not exists payables_vendor_idx on public.payables (vendor_id);

create table if not exists public.payable_lines (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.payables (id) on delete cascade,
  kind text not null check (kind in ('labor', 'adjustment')),
  employee_id uuid references public.employees (id) on delete restrict,
  project_id uuid references public.projects (id) on delete restrict,
  assignment_id uuid references public.project_assignments (id) on delete restrict,
  hours numeric(10, 2),
  amount numeric(12, 2) not null,
  currency text not null check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  reason text,
  created_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  -- coalesce: bez njega bi korekcija bez razloga (null) prošla proveru.
  constraint payable_lines_reason_check check (kind <> 'adjustment' or length(btrim(coalesce(reason, ''))) >= 5)
);
create index if not exists payable_lines_payable_idx on public.payable_lines (payable_id);
create index if not exists payable_lines_employee_idx on public.payable_lines (employee_id);
create index if not exists payable_lines_project_idx on public.payable_lines (project_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payable_id uuid not null references public.payables (id) on delete restrict,
  payment_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  reference text,
  description text,
  recorded_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  constraint payments_void_reason_check check (voided_at is null or length(btrim(coalesce(void_reason, ''))) >= 5)
);
create index if not exists payments_payable_idx on public.payments (payable_id);
create index if not exists payments_date_idx on public.payments (payment_date);

comment on table public.payables is 'obračunata obaveza prema radniku ili Vendoru za period (§7); nastaje iz generate_payables';
comment on table public.payable_lines is 'linije obaveze: labor (po radniku, projektu, angažmanu) i adjustment (korekcija sa razlogom)';
comment on table public.payments is 'stvarna isplata vezana za jednu obavezu; ne menja se i ne briše — storno uz razlog';

-- ═════════════════════════════ 3. stanje obaveze (view) ═════════════════════════════
-- Isto kao payableBalance() u src/lib/finance/payables.js. security_invoker: važi RLS tabela (payroll.view).
create or replace view public.payable_balances with (security_invoker = true) as
select p.id as payable_id, p.total_amount,
       coalesce(x.paid, 0)::numeric(12, 2) as paid_amount,
       (p.total_amount - coalesce(x.paid, 0))::numeric(12, 2) as remaining_amount,
       case when coalesce(x.paid, 0) <= 0 then 'unpaid'
            when coalesce(x.paid, 0) >= p.total_amount then 'paid'
            else 'partially_paid' end as payment_status,
       (p.due_date is not null and p.due_date < current_date and p.total_amount - coalesce(x.paid, 0) > 0) as overdue
from public.payables p
left join lateral (select sum(m.amount) as paid from public.payments m
                   where m.payable_id = p.id and m.voided_at is null) x on true;
comment on view public.payable_balances is 'Calculated / Paid / Remaining / status isplate po obavezi (§7, T11)';

-- ═════════════════════════════ 4. očekivane linije iz odobrenih satnica ═════════════════════════════
-- Linije po (primalac, valuta, radnik, projekat, angažman). Iznos linije = Σ grupa round2(Σ sati × tarifa × koef),
-- grupa = (projekat, radnik, angažman, vrsta sati, tarifa, koeficijent, valuta) — pravilo §3.2.
create or replace function public.payable_expected_lines(p_from date, p_to date)
returns table (payee_type text, payee_id uuid, currency text, employee_id uuid, project_id uuid, assignment_id uuid,
               hours numeric, amount numeric)
language sql stable security definer set search_path = '' as $$
  with g as (
    select l.payee_type, l.payee_id, coalesce(l.worker_currency, 'EUR') as currency, l.employee_id, l.project_id,
           l.assignment_id, l.hour_type, l.worker_rate, l.worker_coef, sum(l.hours) as h
    from public.labor_day_lines(p_from, p_to) l
    group by 1, 2, 3, 4, 5, 6, 7, 8, 9
  )
  select g.payee_type, g.payee_id, g.currency, g.employee_id, g.project_id, g.assignment_id,
         round(sum(g.h), 2), round(sum(round(g.h * g.worker_rate * g.worker_coef, 2)), 2)
  from g
  group by 1, 2, 3, 4, 5, 6
$$;

-- Primalac satnice (isto pravilo kao labor_day_lines, na početak nedelje) — za satnice sa problemom.
create or replace function public.timesheet_payee(p_timesheet uuid)
returns table (payee_type text, payee_id uuid)
language sql stable security definer set search_path = '' as $$
  select case when py.vendor_id is not null then 'vendor' else 'employee' end, coalesce(py.vendor_id, t.employee_id)
  from public.timesheets t
  left join public.project_assignments a on a.id = t.assignment_id
  left join lateral (
    select h.engagement_type, h.vendor_id from public.employment_history h
    where h.employee_id = t.employee_id and h.start_date <= t.week_start and (h.end_date is null or h.end_date >= t.week_start)
    order by h.start_date desc limit 1
  ) eh on true
  cross join lateral (select case
      when a.id is not null then case when a.engagement_type = 'subcontractor_worker' then a.vendor_id end
      when t.vendor_id is not null then t.vendor_id
      when eh.engagement_type = 'subcontractor_worker' then eh.vendor_id end as vendor_id) py
  where t.id = p_timesheet
$$;

-- ═════════════════════════════ 5. problemi obaveza za period ═════════════════════════════
-- labor_problem      odobrena satnica primaoca ima problem (bez snimka, tarifa…) — blokira generisanje za primaoca
-- period_overlap     postoji obaveza primaoca sa drugim, preklopljenim periodom — nova se ne pravi
-- confirmed_changed  potvrđena obaveza se razlikuje od odobrenih satnica (npr. posle korekcije) → adjustment
-- draft_outdated     nacrt se razlikuje od odobrenih satnica → ponovo generisati
create or replace function public.payable_problems_internal(p_from date, p_to date)
returns table (code text, payee_type text, payee_id uuid, currency text, payable_id uuid, employee_id uuid,
               timesheet_id uuid, week_start date, expected_amount numeric, actual_amount numeric, detail text)
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_exp numeric;
begin
  -- satnice sa problemom
  for r in
    select pr.*, py.payee_type as pt, py.payee_id as pid
    from public.labor_day_problems(p_from, p_to) pr
    cross join lateral public.timesheet_payee(pr.timesheet_id) py
  loop
    code := 'labor_problem'; payee_type := r.pt; payee_id := r.pid; currency := null; payable_id := null;
    employee_id := r.employee_id; timesheet_id := r.timesheet_id; week_start := r.week_start;
    expected_amount := null; actual_amount := null; detail := r.code || coalesce(': ' || r.detail, '');
    return next;
  end loop;

  -- preklopljen period: primalac ima linije u periodu, a postoji obaveza sa drugim periodom koji se preklapa
  for r in
    select distinct e.payee_type as pt, e.payee_id as pid, e.currency as cur, p.id as pay_id, p.period_start, p.period_end
    from (select distinct x.payee_type, x.payee_id, x.currency from public.payable_expected_lines(p_from, p_to) x) e
    join public.payables p on p.payee_type = e.payee_type and coalesce(p.employee_id, p.vendor_id) = e.payee_id
      and p.currency = e.currency and p.status <> 'cancelled'
      and daterange(p.period_start, p.period_end, '[]') && daterange(p_from, p_to, '[]')
      and (p.period_start, p.period_end) <> (p_from, p_to)
  loop
    code := 'period_overlap'; payee_type := r.pt; payee_id := r.pid; currency := r.cur; payable_id := r.pay_id;
    employee_id := null; timesheet_id := null; week_start := null; expected_amount := null; actual_amount := null;
    detail := to_char(r.period_start, 'DD.MM.YYYY') || ' – ' || to_char(r.period_end, 'DD.MM.YYYY');
    return next;
  end loop;

  -- obaveze u periodu koje se razlikuju od odobrenih satnica (svaka se poredi za svoj period)
  for r in
    select p.* from public.payables p
    where p.status <> 'cancelled' and daterange(p.period_start, p.period_end, '[]') && daterange(p_from, p_to, '[]')
  loop
    select coalesce(sum(x.amount), 0) into v_exp
    from public.payable_expected_lines(r.period_start, r.period_end) x
    where x.payee_type = r.payee_type and x.payee_id = coalesce(r.employee_id, r.vendor_id) and x.currency = r.currency;
    if v_exp <> r.calculated_amount or public.payable_lines_outdated(r.id) then
      code := case when r.status = 'confirmed' then 'confirmed_changed' else 'draft_outdated' end;
      payee_type := r.payee_type; payee_id := coalesce(r.employee_id, r.vendor_id); currency := r.currency;
      payable_id := r.id; employee_id := null; timesheet_id := null; week_start := null;
      expected_amount := v_exp; actual_amount := r.calculated_amount; detail := null;
      return next;
    end if;
  end loop;
end $$;

-- Da li se labor linije obaveze razlikuju od očekivanih (isti iznos može da krije drugačiju raspodelu).
create or replace function public.payable_lines_outdated(p_payable uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with p as (select * from public.payables where id = p_payable),
  have as (
    select l.employee_id, l.project_id, l.assignment_id, round(sum(l.hours), 2) as hours, round(sum(l.amount), 2) as amount
    from public.payable_lines l where l.payable_id = p_payable and l.kind = 'labor'
    group by 1, 2, 3),
  want as (
    select x.employee_id, x.project_id, x.assignment_id, x.hours, x.amount
    from p, public.payable_expected_lines(p.period_start, p.period_end) x
    where x.payee_type = p.payee_type and x.payee_id = coalesce(p.employee_id, p.vendor_id) and x.currency = p.currency)
  select exists ((select * from have except select * from want) union all (select * from want except select * from have))
$$;

create or replace function public.payable_problems(p_from date, p_to date)
returns table (code text, payee_type text, payee_id uuid, currency text, payable_id uuid, employee_id uuid,
               timesheet_id uuid, week_start date, expected_amount numeric, actual_amount numeric, detail text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_permission('payroll.view');
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Period nije ispravan' using errcode = '22023';
  end if;
  return query select * from public.payable_problems_internal(p_from, p_to);
end $$;

-- ═════════════════════════════ 6. generisanje obaveza ═════════════════════════════
-- Za svakog primaoca i valutu sa odobrenim satima u periodu pravi ili osvežava NACRT obaveze za tačno taj period.
-- Potvrđenu obavezu ne menja (razliku vidi payable_problems). Primalac sa problematičnom satnicom se preskače.
-- Nacrt istog perioda koji više nema sati (npr. satnica vraćena na korekciju) gubi labor linije; bez korekcija
-- se briše. Vraća broj napravljenih, izmenjenih ili uklonjenih obaveza.
create or replace function public.generate_payables(p_from date, p_to date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  g record;
  v_id uuid;
  v_status text;
  v_count integer := 0;
  v_terms integer;
  v_run uuid;
begin
  perform public.require_permission('payroll.manage');
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Period nije ispravan' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Period obaveza može biti najviše godinu dana' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('payables:generate'));
  perform set_config('app.payable_generate', 'on', true);

  drop table if exists pg_temp.payable_expected;
  create temp table payable_expected on commit drop as
    select * from public.payable_expected_lines(p_from, p_to);
  drop table if exists pg_temp.payable_blocked;
  create temp table payable_blocked on commit drop as
    select distinct py.payee_type, py.payee_id
    from public.labor_day_problems(p_from, p_to) pr cross join lateral public.timesheet_payee(pr.timesheet_id) py;

  -- osnovni srpski obračun istog meseca (samo informativno; period = ceo kalendarski mesec)
  if date_trunc('month', p_from)::date = p_from and (date_trunc('month', p_from) + interval '1 month - 1 day')::date = p_to then
    select r.id into v_run from public.payroll_runs r where r.month = p_from;
  end if;

  for g in
    select e.payee_type, e.payee_id, e.currency from pg_temp.payable_expected e
    where not exists (select 1 from pg_temp.payable_blocked b where b.payee_type = e.payee_type and b.payee_id = e.payee_id)
    group by 1, 2, 3
    order by 1, 2, 3
  loop
    v_id := null; v_status := null;
    select p.id, p.status into v_id, v_status from public.payables p
     where p.payee_type = g.payee_type and coalesce(p.employee_id, p.vendor_id) = g.payee_id and p.currency = g.currency
       and p.status <> 'cancelled' and p.period_start = p_from and p.period_end = p_to;

    if v_id is null then
      -- preklapanje sa drugim periodom: ne pravi se nova (payable_problems → period_overlap)
      continue when exists (
        select 1 from public.payables p
         where p.payee_type = g.payee_type and coalesce(p.employee_id, p.vendor_id) = g.payee_id and p.currency = g.currency
           and p.status <> 'cancelled' and daterange(p.period_start, p.period_end, '[]') && daterange(p_from, p_to, '[]'));
      v_terms := case when g.payee_type = 'vendor' then (select v.payment_terms_days from public.vendors v where v.id = g.payee_id) end;
      insert into public.payables (period_start, period_end, payee_type, employee_id, vendor_id, currency, due_date, payroll_run_id)
      values (p_from, p_to, g.payee_type,
              case when g.payee_type = 'employee' then g.payee_id end,
              case when g.payee_type = 'vendor' then g.payee_id end,
              g.currency, p_to + v_terms, v_run)
      returning id into v_id;
      v_status := 'draft';
    elsif v_status <> 'draft' or not public.payable_lines_outdated(v_id) then
      continue;
    else
      delete from public.payable_lines l where l.payable_id = v_id and l.kind = 'labor';
    end if;

    insert into public.payable_lines (payable_id, kind, employee_id, project_id, assignment_id, hours, amount, currency)
    select v_id, 'labor', e.employee_id, e.project_id, e.assignment_id, e.hours, e.amount, e.currency
    from pg_temp.payable_expected e
    where e.payee_type = g.payee_type and e.payee_id = g.payee_id and e.currency = g.currency
    order by e.employee_id, e.project_id, e.assignment_id;
    v_count := v_count + 1;
  end loop;

  -- nacrti tačno ovog perioda koji više nemaju odobrene sate
  for g in
    select p.id, p.payee_type, coalesce(p.employee_id, p.vendor_id) as payee_id
    from public.payables p
    where p.status = 'draft' and p.period_start = p_from and p.period_end = p_to
      and not exists (select 1 from pg_temp.payable_expected e
                       where e.payee_type = p.payee_type and e.payee_id = coalesce(p.employee_id, p.vendor_id)
                         and e.currency = p.currency)
      and not exists (select 1 from pg_temp.payable_blocked b
                       where b.payee_type = p.payee_type and b.payee_id = coalesce(p.employee_id, p.vendor_id))
  loop
    if exists (select 1 from public.payable_lines l where l.payable_id = g.id and l.kind = 'adjustment') then
      continue when not exists (select 1 from public.payable_lines l where l.payable_id = g.id and l.kind = 'labor');
      delete from public.payable_lines l where l.payable_id = g.id and l.kind = 'labor';
    else
      delete from public.payables p where p.id = g.id;
    end if;
    v_count := v_count + 1;
  end loop;

  perform set_config('app.payable_generate', 'off', true);
  return v_count;
end $$;

-- ═════════════════════════════ 7. pravila: obaveza ═════════════════════════════
create or replace function public.guard_payable() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gen boolean := coalesce(current_setting('app.payable_generate', true), '') = 'on';
  v_sync boolean := coalesce(current_setting('app.payable_sync', true), '') = 'on';
begin
  -- pravo pre ikakve poruke o sadržaju (trigger vidi i redove koje RLS krije); bez korisnika = sistem/migracija
  if auth.uid() is not null then perform public.require_permission('payroll.manage'); end if;
  if tg_op = 'INSERT' then
    if not v_gen then
      raise exception 'Obaveze nastaju generisanjem iz odobrenih satnica (Generiši obaveze)' using errcode = '23514';
    end if;
    new.status := 'draft'; new.calculated_amount := 0; new.adjustments_amount := 0;
    new.confirmed_by := null; new.confirmed_at := null;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Briše se samo nacrt obaveze — potvrđenu otkažite' using errcode = '23514';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'cancelled' then
    raise exception 'Otkazana obaveza se ne menja' using errcode = '23514';
  end if;
  if (new.period_start, new.period_end, new.payee_type, new.employee_id, new.vendor_id, new.currency)
     is distinct from (old.period_start, old.period_end, old.payee_type, old.employee_id, old.vendor_id, old.currency) then
    raise exception 'Period, primalac i valuta obaveze se ne menjaju' using errcode = '23514';
  end if;
  if not v_sync and (new.calculated_amount, new.adjustments_amount) is distinct from (old.calculated_amount, old.adjustments_amount) then
    raise exception 'Iznos obaveze se računa iz satnica — razliku unesite kao korekciju sa razlogom' using errcode = '23514';
  end if;
  if new.payroll_run_id is distinct from old.payroll_run_id and old.status <> 'draft' then
    new.payroll_run_id := old.payroll_run_id;
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'confirmed' then
      -- total_amount (generisana kolona) se u BEFORE triggeru još ne računa
      if (new.calculated_amount + new.adjustments_amount) <= 0 then
        raise exception 'Obaveza bez iznosa se ne potvrđuje' using errcode = '23514';
      end if;
      if exists (select 1 from public.labor_day_problems(old.period_start, old.period_end) pr
                 cross join lateral public.timesheet_payee(pr.timesheet_id) py
                 where py.payee_type = old.payee_type and py.payee_id = coalesce(old.employee_id, old.vendor_id)) then
        raise exception 'Primalac ima odobrenu satnicu sa problemom u periodu — rešite je pre potvrde' using errcode = '23514';
      end if;
      if public.payable_lines_outdated(old.id) then
        raise exception 'Obaveza nije usklađena sa odobrenim satnicama — ponovo pokrenite generisanje' using errcode = '23514';
      end if;
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    elsif new.status = 'cancelled' then
      if exists (select 1 from public.payments m where m.payable_id = old.id and m.voided_at is null) then
        raise exception 'Obaveza sa uplatama se ne otkazuje — prvo stornirajte uplate' using errcode = '23514';
      end if;
    else
      raise exception 'Potvrđena obaveza se ne vraća u nacrt — razliku unesite kao korekciju sa razlogom' using errcode = '23514';
    end if;
  else
    new.confirmed_by := old.confirmed_by;
    new.confirmed_at := old.confirmed_at;
  end if;
  return new;
end $$;

drop trigger if exists payables_guard on public.payables;
create trigger payables_guard before insert or update or delete on public.payables
  for each row execute function public.guard_payable();
drop trigger if exists payables_updated on public.payables;
create trigger payables_updated before update on public.payables
  for each row execute function public.set_updated_date();

-- ═════════════════════════════ 8. pravila: linije obaveze ═════════════════════════════
create or replace function public.guard_payable_line() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_gen boolean := coalesce(current_setting('app.payable_generate', true), '') = 'on';
  p public.payables;
begin
  if auth.uid() is not null then perform public.require_permission('payroll.manage'); end if;
  if tg_op = 'UPDATE' then
    raise exception 'Linija obaveze se ne menja — unesite novu korekciju sa razlogom' using errcode = '23514';
  end if;

  select * into p from public.payables where id = case when tg_op = 'DELETE' then old.payable_id else new.payable_id end;
  if tg_op = 'DELETE' then
    if p.id is null then return old; end if;          -- brisanje nacrta (cascade)
    if old.kind = 'labor' and not v_gen then
      raise exception 'Linije rada menja samo generisanje obaveza' using errcode = '23514';
    end if;
    if p.status <> 'draft' then
      raise exception 'Linija potvrđene obaveze se ne briše — unesite novu korekciju sa razlogom' using errcode = '23514';
    end if;
    return old;
  end if;

  -- INSERT
  if p.id is null then
    raise exception 'Obaveza ne postoji' using errcode = '23503';
  end if;
  if new.kind = 'labor' then
    if not v_gen or p.status <> 'draft' then
      raise exception 'Linije rada menja samo generisanje obaveza' using errcode = '23514';
    end if;
  else
    if p.status = 'cancelled' then
      raise exception 'Otkazana obaveza se ne menja' using errcode = '23514';
    end if;
    if length(btrim(coalesce(new.reason, ''))) < 5 then
      raise exception 'Razlog korekcije je obavezan (najmanje 5 znakova)' using errcode = '23514';
    end if;
    if new.amount is null or new.amount = 0 then
      raise exception 'Iznos korekcije ne može biti 0' using errcode = '23514';
    end if;
    if new.currency is null then
      new.currency := p.currency;
    elsif new.currency <> p.currency then
      raise exception 'Valuta korekcije (%) mora biti valuta obaveze (%)', new.currency, p.currency using errcode = '23514';
    end if;
    if p.payee_type = 'employee' and new.employee_id is not null and new.employee_id <> p.employee_id then
      raise exception 'Korekcija obaveze prema radniku može se odnositi samo na tog radnika' using errcode = '23514';
    end if;
    new.hours := null;
    new.reason := btrim(new.reason);
    new.created_by := coalesce(auth.uid(), new.created_by);
  end if;
  return new;
end $$;

drop trigger if exists payable_lines_guard on public.payable_lines;
create trigger payable_lines_guard before insert or update or delete on public.payable_lines
  for each row execute function public.guard_payable_line();

-- Zbirovi obaveze se uvek računaju iz linija; korekcija ne sme spustiti obavezu ispod nule ni ispod isplaćenog.
create or replace function public.sync_payable_totals() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.payable_id else new.payable_id end;
  v_total numeric;
  v_paid numeric;
begin
  if not exists (select 1 from public.payables where id = v_id) then return null; end if;
  perform set_config('app.payable_sync', 'on', true);
  update public.payables p
     set calculated_amount = coalesce((select sum(l.amount) from public.payable_lines l where l.payable_id = v_id and l.kind = 'labor'), 0),
         adjustments_amount = coalesce((select sum(l.amount) from public.payable_lines l where l.payable_id = v_id and l.kind = 'adjustment'), 0)
   where p.id = v_id
  returning p.total_amount into v_total;
  perform set_config('app.payable_sync', 'off', true);
  if tg_op = 'INSERT' and new.kind = 'adjustment' then
    select coalesce(sum(m.amount), 0) into v_paid from public.payments m where m.payable_id = v_id and m.voided_at is null;
    if v_total < 0 then
      raise exception 'Korekcija bi obavezu spustila ispod nule' using errcode = '23514';
    end if;
    if v_total < v_paid then
      raise exception 'Korekcija bi obavezu spustila ispod već isplaćenog iznosa (%)', v_paid using errcode = '23514';
    end if;
  end if;
  return null;
end $$;

drop trigger if exists payable_lines_totals on public.payable_lines;
create trigger payable_lines_totals after insert or delete on public.payable_lines
  for each row execute function public.sync_payable_totals();

-- ═════════════════════════════ 9. pravila: uplate (T11) ═════════════════════════════
create or replace function public.guard_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.payables;
  v_paid numeric;
begin
  if auth.uid() is not null then perform public.require_permission('payments.record'); end if;
  if tg_op = 'DELETE' then
    raise exception 'Uplata se ne briše — stornirajte je uz razlog' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    -- zaključava obavezu: dve istovremene uplate ne mogu zajedno da pređu iznos
    select * into p from public.payables where id = new.payable_id for update;
    if p.id is null then
      raise exception 'Obaveza ne postoji' using errcode = '23503';
    end if;
    if p.status <> 'confirmed' then
      raise exception 'Uplata se evidentira samo za potvrđenu obavezu' using errcode = '23514';
    end if;
    if new.currency is null then
      new.currency := p.currency;
    elsif new.currency <> p.currency then
      raise exception 'Valuta uplate (%) mora biti valuta obaveze (%)', new.currency, p.currency using errcode = '23514';
    end if;
    select coalesce(sum(m.amount), 0) into v_paid from public.payments m where m.payable_id = p.id and m.voided_at is null;
    if v_paid + new.amount > p.total_amount then
      raise exception 'Preplata — evidentirajte korekciju (adjustment) sa razlogom' using errcode = '23514';
    end if;
    new.recorded_by := coalesce(auth.uid(), new.recorded_by);
    new.recorded_at := now();
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
    new.reference := nullif(btrim(new.reference), '');
    new.description := nullif(btrim(new.description), '');
    return new;
  end if;

  -- UPDATE: samo storno (jednom)
  if (new.payable_id, new.payment_date, new.amount, new.currency, new.reference, new.description, new.recorded_by, new.recorded_at)
     is distinct from (old.payable_id, old.payment_date, old.amount, old.currency, old.reference, old.description, old.recorded_by, old.recorded_at) then
    raise exception 'Uplata se ne menja — stornirajte je uz razlog i unesite novu' using errcode = '23514';
  end if;
  if old.voided_at is not null then
    raise exception 'Uplata je već stornirana' using errcode = '23514';
  end if;
  if new.voided_at is null then
    return old;   -- nema izmene
  end if;
  if length(btrim(coalesce(new.void_reason, ''))) < 5 then
    raise exception 'Razlog storna je obavezan (najmanje 5 znakova)' using errcode = '23514';
  end if;
  new.void_reason := btrim(new.void_reason);
  new.voided_by := auth.uid();
  new.voided_at := now();
  return new;
end $$;

drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before insert or update or delete on public.payments
  for each row execute function public.guard_payment();

-- ═════════════════════════════ 10. prava (T26) i audit ═════════════════════════════
revoke all on public.payables, public.payable_lines, public.payments, public.payable_balances from anon;
grant select, insert, update, delete on public.payables, public.payable_lines, public.payments to authenticated;
grant select on public.payable_balances to authenticated;

alter table public.payables enable row level security;
alter table public.payable_lines enable row level security;
alter table public.payments enable row level security;
select public.apply_table_policies('payables', '(select public.has_permission(''payroll.view''))',
  '(select public.has_permission(''payroll.manage''))');
select public.apply_table_policies('payable_lines', '(select public.has_permission(''payroll.view''))',
  '(select public.has_permission(''payroll.manage''))');
select public.apply_table_policies('payments', '(select public.has_permission(''payroll.view''))',
  '(select public.has_permission(''payments.record''))');

drop trigger if exists payables_audit on public.payables;
create trigger payables_audit after insert or update or delete on public.payables
  for each row execute function public.audit_row();
drop trigger if exists payable_lines_audit on public.payable_lines;
create trigger payable_lines_audit after insert or update or delete on public.payable_lines
  for each row execute function public.audit_row();
drop trigger if exists payments_audit on public.payments;
create trigger payments_audit after insert or update or delete on public.payments
  for each row execute function public.audit_row();

-- Istorija linija obaveze vidljiva je istima kao obaveza (can_read_audit iz 01 zna za payables i payments).
-- Dopisuje se samo grana za payable_lines, ostatak funkcije ostaje kakav jeste; ponovno pokretanje ne menja ništa.
do $$
declare
  v_def text := pg_get_functiondef('public.can_read_audit(text, uuid, jsonb, jsonb)'::regprocedure);
  v_anchor constant text := 'when ''payments'' then public.has_permission(''payroll.view'')';
begin
  if position('''payable_lines''' in v_def) = 0 then
    if position(v_anchor in v_def) = 0 then
      raise exception 'obaveze_isplate: can_read_audit nema očekivanu granu za payments — proveriti ručno';
    end if;
    execute replace(v_def, v_anchor, v_anchor || E'\n    when ''payable_lines'' then public.has_permission(''payroll.view'')');
  end if;
end $$;

-- ═════════════════════════════ 11. funkcije: izvršavanje (D14) ═════════════════════════════
revoke execute on function public.payable_expected_lines(date, date), public.timesheet_payee(uuid),
  public.payable_problems_internal(date, date), public.payable_lines_outdated(uuid),
  public.guard_payable(), public.guard_payable_line(), public.sync_payable_totals(), public.guard_payment()
  from public, anon, authenticated;
revoke execute on function public.generate_payables(date, date), public.payable_problems(date, date) from public, anon;
grant execute on function public.generate_payables(date, date), public.payable_problems(date, date) to authenticated;
