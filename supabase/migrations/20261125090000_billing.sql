-- Teamora W2-F: Client Billing Overview — interni obračun za eksterno fakturisanje i praćenje uplata
-- (spec v1.4 §9, docs/TEAMORA-DATA-MODEL.md §2.9, testovi T15, T16, T29).
--
-- GRANICA MODULA (T29): Teamora NE izdaje fakture. Nema kolone, sekvence ni funkcije za broj fakture koji bi
-- generisao sistem; ext_invoice_* su samo ručna evidencija računa izdatog u drugom programu.
--
-- Bezbedno za produkciju: nove tabele, view-ovi i funkcije; postojeći podaci se ne menjaju. Jedina izmena nad
-- postojećom tabelom je maska kolone clients.default_b2b_rate (column grant, kao timesheets u 20261125040000) i
-- trigger koji čuva trošak vezan za predat obračun (project_costs_billing_lock). Sve je idempotentno.
--
--  * billing_summaries — obračun po klijentu (+ opcioni projekat), periodu i valuti; status se menja samo kroz
--    set_billing_status (ko i kada → status_changed_*, billing_status_history).
--  * billing_summary_lines — zamrznut obračun (Approved Hours × B2B × Client Coef) iz labor_day_lines, grupisan po
--    pravilu zaokruživanja §3.2 (project, employee, hour_type, rate, coef, currency) — isto kao laborLines.js.
--  * billing_summary_costs — billable trošak u NAJVIŠE jednom obračunu (unique), ne menja calculated_amount (T15).
--  * client_payments — uplate klijenta (više delimičnih, storno uz razlog, bez brisanja) (T16).
--  * billing_balances — Calculated / Invoiced / Received / Outstanding / Estimated Unpaid (T16, T17).
--  * client_money — clients.default_b2b_rate samo uz rates.view_b2b (HR ne čita tarifu klijenta, §4).

-- ═════════════════════════════ 1. tabele ═════════════════════════════
create table if not exists public.billing_summaries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete restrict,   -- null = svi projekti klijenta
  period_start date not null,
  period_end date not null,
  currency text not null default 'EUR' check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  status text not null default 'in_preparation'
    check (status in ('in_preparation', 'ready_for_accounting', 'sent_to_accounting', 'invoiced_externally')),
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  -- zamrznuto pri izlasku iz in_preparation (set_billing_status); u pripremi je null, ekran računa živo
  calculated_hours numeric(10, 2),
  calculated_amount numeric(12, 2),
  calculated_at timestamptz,
  -- ručna evidencija eksterno izdatog računa (samo za praćenje, nije faktura)
  ext_invoice_reference text,
  ext_invoice_date date,
  ext_invoice_amount numeric(12, 2) check (ext_invoice_amount > 0),
  ext_invoice_currency text check (ext_invoice_currency in ('EUR', 'RSD', 'GBP', 'USD')),
  ext_due_date date,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint billing_summaries_period check (period_end >= period_start),
  constraint billing_summaries_due_after_invoice check (ext_due_date is null or ext_invoice_date is null or ext_due_date >= ext_invoice_date)
);
create index if not exists billing_summaries_client_idx on public.billing_summaries (client_id, currency, period_start);
create index if not exists billing_summaries_project_idx on public.billing_summaries (project_id);

create table if not exists public.billing_summary_lines (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.billing_summaries (id) on delete cascade,
  project_id uuid references public.projects (id) on delete restrict,
  employee_id uuid references public.employees (id) on delete restrict,
  project_role_id uuid references public.project_roles (id) on delete set null,
  hour_type text,
  hours numeric(10, 2) not null,
  client_rate numeric,
  client_coef numeric,
  amount numeric(12, 2) not null,
  currency text not null check (currency in ('EUR', 'RSD', 'GBP', 'USD'))
);
create index if not exists billing_summary_lines_summary_idx on public.billing_summary_lines (summary_id);

create table if not exists public.billing_summary_costs (
  id uuid primary key default gen_random_uuid(),
  summary_id uuid not null references public.billing_summaries (id) on delete cascade,
  project_cost_id uuid not null references public.project_costs (id) on delete restrict,
  created_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint billing_summary_costs_once unique (project_cost_id)   -- isti trošak u jednom pregledu (T15)
);
create index if not exists billing_summary_costs_summary_idx on public.billing_summary_costs (summary_id);

create table if not exists public.billing_status_history (
  id bigint generated always as identity primary key,
  summary_id uuid not null references public.billing_summaries (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid default auth.uid() references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists billing_status_history_summary_idx on public.billing_status_history (summary_id, changed_at);

create table if not exists public.client_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  project_id uuid references public.projects (id) on delete restrict,
  billing_summary_id uuid references public.billing_summaries (id) on delete restrict,
  period_start date,
  period_end date,
  payment_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  reference text,
  ext_invoice_reference text,
  notes text,
  recorded_by uuid not null default auth.uid() references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text,
  constraint client_payments_period check (period_end is null or period_start is null or period_end >= period_start),
  constraint client_payments_void_reason check (voided_at is null or length(btrim(coalesce(void_reason, ''))) >= 5)
);
create index if not exists client_payments_summary_idx on public.client_payments (billing_summary_id);
create index if not exists client_payments_client_idx on public.client_payments (client_id, payment_date);

drop trigger if exists billing_summaries_updated on public.billing_summaries;
create trigger billing_summaries_updated before update on public.billing_summaries
  for each row execute function public.set_updated_date();

-- ═════════════════════════════ 2. pravila: Billing Summary ═════════════════════════════
-- Status i zamrznut obračun menja samo set_billing_status (app.billing_status = on). Van pripreme se klijent,
-- projekat, period i valuta ne menjaju. Eksterni račun se evidentira tek posle pripreme i ne sme biti manji od
-- već evidentiranih uplata.
create or replace function public.guard_billing_summary() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('app.billing_status', true), '') = 'on';
  v_client uuid;
  v_paid numeric;
  v_pay_currency text;
  v_currency text;
begin
  new.ext_invoice_reference := nullif(btrim(coalesce(new.ext_invoice_reference, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');
  if new.ext_invoice_amount is not null then
    new.ext_invoice_currency := coalesce(new.ext_invoice_currency, new.currency);
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'in_preparation' then
      raise exception 'Novi obračun počinje u statusu In Preparation' using errcode = '23514';
    end if;
    new.status_changed_by := null;
    new.status_changed_at := null;
    new.calculated_hours := null;
    new.calculated_amount := null;
    new.calculated_at := null;
  else
    if not v_rpc and (new.status, new.status_changed_by, new.status_changed_at, new.calculated_hours,
                      new.calculated_amount, new.calculated_at)
        is distinct from (old.status, old.status_changed_by, old.status_changed_at, old.calculated_hours,
                          old.calculated_amount, old.calculated_at) then
      raise exception 'Status obračuna se menja samo kroz set_billing_status (ko i kada se beleži)' using errcode = '42501';
    end if;
    if old.status <> 'in_preparation'
       and (new.client_id, new.project_id, new.period_start, new.period_end, new.currency)
           is distinct from (old.client_id, old.project_id, old.period_start, old.period_end, old.currency) then
      raise exception 'Obračun van pripreme je zaključan: klijent, projekat, period i valuta se ne menjaju (vratite ga u In Preparation)'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' or (new.client_id, new.project_id) is distinct from (old.client_id, old.project_id) then
    if new.project_id is not null then
      select p.client_id into v_client from public.projects p where p.id = new.project_id;
      if v_client is distinct from new.client_id then
        raise exception 'Projekat ne pripada izabranom klijentu' using errcode = '23514';
      end if;
    end if;
  end if;

  if new.status = 'in_preparation'
     and num_nonnulls(new.ext_invoice_reference, new.ext_invoice_date, new.ext_invoice_amount, new.ext_due_date) > 0 then
    raise exception 'Eksterni račun se evidentira tek kad obračun izađe iz pripreme (Ready for Accounting ili dalje)'
      using errcode = '23514';
  end if;

  -- Uplate vezane za obračun: valuta mora ostati ista, a eksterni iznos ne sme biti manji od primljenog.
  if tg_op = 'UPDATE' then
    select coalesce(sum(cp.amount), 0), min(cp.currency) into v_paid, v_pay_currency
    from public.client_payments cp where cp.billing_summary_id = new.id and cp.voided_at is null;
    v_currency := coalesce(new.ext_invoice_currency, new.currency);
    if v_pay_currency is not null and v_pay_currency <> v_currency then
      raise exception 'Uplate ovog obračuna su u valuti %; valuta računa mora ostati %', v_pay_currency, v_pay_currency
        using errcode = '23514';
    end if;
    if new.ext_invoice_amount is not null and v_paid > new.ext_invoice_amount then
      raise exception 'Evidentirane uplate (%) prelaze iznos eksternog računa (%). Korekcija = storno uplate uz razlog',
        v_paid, new.ext_invoice_amount using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists billing_summaries_guard on public.billing_summaries;
create trigger billing_summaries_guard before insert or update on public.billing_summaries
  for each row execute function public.guard_billing_summary();

-- Isti klijent, ista valuta i preklopljen period se ne obračunavaju dvaput — i za par „ceo klijent" naspram
-- „projekat tog klijenta". Brava po klijentu sprečava da dva istovremena upisa oba prođu.
create or replace function public.guard_billing_overlap() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o public.billing_summaries;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing_summaries:' || new.client_id::text, 0));
  select s.* into o
  from public.billing_summaries s
  where s.id <> new.id and s.client_id = new.client_id and s.currency = new.currency
    and daterange(s.period_start, s.period_end, '[]') && daterange(new.period_start, new.period_end, '[]')
    and (s.project_id is null or new.project_id is null or s.project_id = new.project_id)
  order by s.period_start
  limit 1;
  if found then
    raise exception 'Period se preklapa sa postojećim obračunom istog klijenta i valute (% – %, %)',
      to_char(o.period_start, 'DD.MM.YYYY.'), to_char(o.period_end, 'DD.MM.YYYY.'),
      coalesce((select p.name from public.projects p where p.id = o.project_id), 'svi projekti')
      using errcode = '23P01';
  end if;
  return new;
end $$;

drop trigger if exists billing_summaries_overlap on public.billing_summaries;
create trigger billing_summaries_overlap before insert or update of client_id, project_id, period_start, period_end, currency
  on public.billing_summaries for each row execute function public.guard_billing_overlap();

-- Briše se samo obračun u pripremi (uplate ga drže preko FK restrict); audit čuva obrisan red.
create or replace function public.guard_billing_summary_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'in_preparation' then
    raise exception 'Obračun van pripreme se ne briše' using errcode = '23514';
  end if;
  if exists (select 1 from public.client_payments cp where cp.billing_summary_id = old.id) then
    raise exception 'Obračun sa evidentiranim uplatama se ne briše' using errcode = '23514';
  end if;
  return old;
end $$;

drop trigger if exists billing_summaries_guard_delete on public.billing_summaries;
create trigger billing_summaries_guard_delete before delete on public.billing_summaries
  for each row execute function public.guard_billing_summary_delete();

-- ═════════════════════════════ 3. set_billing_status ═════════════════════════════
-- Ručna oznaka korisnika, NE izdavanje računa. Dozvoljen je samo jedan korak napred, ili
-- Ready for Accounting → In Preparation (uz razlog) dok nema eksternog računa. Pri izlasku iz pripreme baza
-- računa i zamrzava linije iz labor_day_lines (prihodna strana, grupe §3.2) i calculated_*.
create or replace function public.set_billing_status(p_id uuid, p_status text, p_note text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_order constant text[] := array['in_preparation', 'ready_for_accounting', 'sent_to_accounting', 'invoiced_externally'];
  s public.billing_summaries;
  v_from int;
  v_to int;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_problems text;
  v_hours numeric;
  v_amount numeric;
begin
  perform public.require_permission('billing.manage');
  select * into s from public.billing_summaries where id = p_id for update;
  if not found then
    raise exception 'Obračun nije pronađen' using errcode = 'P0002';
  end if;
  v_from := array_position(v_order, s.status);
  v_to := array_position(v_order, p_status);
  if v_to is null then
    raise exception 'Nepoznat status obračuna: %', p_status using errcode = '22023';
  end if;
  if v_to = v_from then
    raise exception 'Obračun je već u tom statusu' using errcode = '23514';
  end if;
  if v_to = v_from - 1 and v_from = 2 then
    if num_nonnulls(s.ext_invoice_reference, s.ext_invoice_date, s.ext_invoice_amount, s.ext_due_date) > 0 then
      raise exception 'Obračun sa evidentiranim eksternim računom se ne vraća u pripremu' using errcode = '23514';
    end if;
    if v_note is null or length(v_note) < 5 then
      raise exception 'Za vraćanje u pripremu upišite razlog (najmanje 5 znakova)' using errcode = '23514';
    end if;
  elsif v_to <> v_from + 1 then
    raise exception 'Dozvoljen je samo jedan korak napred (ili Ready for Accounting → In Preparation)' using errcode = '23514';
  end if;

  perform set_config('app.billing_status', 'on', true);
  perform set_config('app.audit_action', 'status', true);
  perform set_config('app.audit_reason', coalesce(v_note, ''), true);

  if v_from = 1 then
    -- Satnica sa problemom (bez snimka, tarife ili koeficijenta) nema linija; obračun bi tiho bio manji.
    select string_agg(distinct coalesce(e.first_name || ' ' || e.last_name, pr.employee_id::text)
                      || ' (' || to_char(pr.week_start, 'DD.MM.YYYY.') || ', ' || pr.code || ')', '; ')
      into v_problems
    from public.labor_day_problems(s.period_start, s.period_end) pr
    join public.projects p on p.id = pr.project_id
    left join public.employees e on e.id = pr.employee_id
    where p.client_id = s.client_id and (s.project_id is null or pr.project_id = s.project_id);
    if v_problems is not null then
      raise exception 'Satnice sa problemom u periodu — rešite ih pre predaje obračuna: %', v_problems using errcode = '23514';
    end if;

    delete from public.billing_summary_lines where summary_id = s.id;
    insert into public.billing_summary_lines (summary_id, project_id, employee_id, project_role_id, hour_type, hours,
                                              client_rate, client_coef, amount, currency)
    select s.id, l.project_id, l.employee_id,
           case when count(distinct l.project_role_id) = 1 and bool_and(l.project_role_id is not null)
                then (array_agg(l.project_role_id))[1] end,
           l.hour_type, sum(l.hours), l.client_rate, l.client_coef,
           round(sum(l.hours) * l.client_rate * l.client_coef, 2), s.currency
    from public.labor_day_lines(s.period_start, s.period_end, s.project_id) l
    where l.client_id = s.client_id and coalesce(l.client_currency, 'EUR') = s.currency and l.hours <> 0
    group by l.project_id, l.employee_id, l.hour_type, l.client_rate, l.client_coef;

    select coalesce(sum(bl.hours), 0), coalesce(sum(bl.amount), 0) into v_hours, v_amount
    from public.billing_summary_lines bl where bl.summary_id = s.id;
    if v_hours = 0 and not exists (select 1 from public.billing_summary_costs c where c.summary_id = s.id) then
      raise exception 'Nema odobrenih sati ni naplativih troškova za ovaj obračun u izabranom periodu' using errcode = '23514';
    end if;

    update public.billing_summaries
       set status = p_status, status_changed_by = auth.uid(), status_changed_at = now(),
           calculated_hours = v_hours, calculated_amount = v_amount, calculated_at = now()
     where id = s.id;
  elsif v_to = 1 then
    delete from public.billing_summary_lines where summary_id = s.id;   -- izvedeni podaci, računaju se ponovo
    update public.billing_summaries
       set status = p_status, status_changed_by = auth.uid(), status_changed_at = now(),
           calculated_hours = null, calculated_amount = null, calculated_at = null
     where id = s.id;
  else
    update public.billing_summaries
       set status = p_status, status_changed_by = auth.uid(), status_changed_at = now()
     where id = s.id;
  end if;

  insert into public.billing_status_history (summary_id, from_status, to_status, changed_by, note)
  values (s.id, s.status, p_status, auth.uid(), v_note);

  perform set_config('app.billing_status', 'off', true);
  perform set_config('app.audit_action', '', true);
  perform set_config('app.audit_reason', '', true);
  return p_status;
end $$;

-- ═════════════════════════════ 4. billable troškovi u obračunu (T15) ═════════════════════════════
-- Trošak mora biti billable, pripadati klijentu (i projektu) obračuna i imati datum u periodu; menja se samo dok je
-- obračun u pripremi. Isti trošak ne može biti u dva obračuna (unique + jasna poruka).
create or replace function public.guard_billing_summary_cost() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.billing_summaries;
  c record;
  v_other uuid;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Veza troška sa obračunom se ne menja; uklonite je i dodajte ponovo' using errcode = '23514';
  end if;
  select * into s from public.billing_summaries where id = case when tg_op = 'DELETE' then old.summary_id else new.summary_id end;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;   -- kaskadno brisanje obračuna u pripremi
  end if;
  if s.status <> 'in_preparation' then
    raise exception 'Naplativi troškovi se menjaju samo dok je obračun u pripremi' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  select pc.id, pc.billable, pc.project_id, pc.cost_date, p.client_id into c
  from public.project_costs pc left join public.projects p on p.id = pc.project_id
  where pc.id = new.project_cost_id;
  if not found then
    raise exception 'Trošak nije pronađen' using errcode = '23503';
  end if;
  if not c.billable then
    raise exception 'Trošak nije označen kao naplativ (Billable to Client)' using errcode = '23514';
  end if;
  if c.client_id is distinct from s.client_id or (s.project_id is not null and c.project_id <> s.project_id) then
    raise exception 'Trošak ne pripada klijentu ili projektu ovog obračuna' using errcode = '23514';
  end if;
  if c.cost_date is null or c.cost_date < s.period_start or c.cost_date > s.period_end then
    raise exception 'Datum troška nije u periodu obračuna' using errcode = '23514';
  end if;
  select bc.summary_id into v_other from public.billing_summary_costs bc where bc.project_cost_id = new.project_cost_id;
  if found then
    raise exception 'Trošak je već u drugom obračunu — isti trošak se ne broji dvaput' using errcode = '23505';
  end if;
  return new;
end $$;

drop trigger if exists billing_summary_costs_guard on public.billing_summary_costs;
create trigger billing_summary_costs_guard before insert or update or delete on public.billing_summary_costs
  for each row execute function public.guard_billing_summary_cost();

-- Trošak vezan za obračun ne gubi oznaku billable i ne menja iznos, valutu, projekat ni datum dok je obračun
-- predat (van pripreme). Brisanje vezanog troška drži FK restrict; ovde samo jasnija poruka.
create or replace function public.project_cost_billing_lock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
begin
  select s.status into v_status
  from public.billing_summary_costs bc join public.billing_summaries s on s.id = bc.summary_id
  where bc.project_cost_id = old.id;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Trošak je uključen u obračun klijenta; prvo ga uklonite iz obračuna' using errcode = '23503';
  end if;
  if not new.billable then
    raise exception 'Trošak je uključen u obračun klijenta; prvo ga uklonite iz obračuna pa skinite oznaku billable'
      using errcode = '23514';
  end if;
  if v_status <> 'in_preparation'
     and (new.amount, new.currency, new.project_id, new.cost_date, new.eur_rsd_rate)
         is distinct from (old.amount, old.currency, old.project_id, old.cost_date, old.eur_rsd_rate) then
    raise exception 'Trošak je u obračunu predatom knjigovodstvu; iznos, valuta, projekat i datum se ne menjaju'
      using errcode = '23514';
  end if;
  if (new.project_id, new.cost_date) is distinct from (old.project_id, old.cost_date) then
    raise exception 'Trošak je uključen u obračun klijenta; projekat i datum menjajte tek kad ga uklonite iz obračuna'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists project_costs_billing_lock on public.project_costs;
create trigger project_costs_billing_lock before update or delete on public.project_costs
  for each row execute function public.project_cost_billing_lock();

-- ═════════════════════════════ 5. uplate klijenta (T16) ═════════════════════════════
-- Valuta = valuta eksternog računa, inače valuta obračuna. Kad je eksterni iznos upisan, zbir ne-storniranih uplata
-- ga ne prelazi. Izmena = samo storno uz razlog; brisanje se odbija.
create or replace function public.guard_client_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.billing_summaries;
  v_client uuid;
  v_currency text;
  v_paid numeric;
begin
  if tg_op = 'DELETE' then
    raise exception 'Uplata se ne briše — stornirajte je uz razlog' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.voided_at is not null then
      raise exception 'Stornirana uplata se ne menja' using errcode = '23514';
    end if;
    if (new.client_id, new.project_id, new.billing_summary_id, new.period_start, new.period_end, new.payment_date,
        new.amount, new.currency, new.reference, new.ext_invoice_reference, new.notes, new.recorded_by, new.recorded_at)
       is distinct from
       (old.client_id, old.project_id, old.billing_summary_id, old.period_start, old.period_end, old.payment_date,
        old.amount, old.currency, old.reference, old.ext_invoice_reference, old.notes, old.recorded_by, old.recorded_at) then
      raise exception 'Uplata se ne menja; stornirajte je uz razlog i evidentirajte ispravnu' using errcode = '23514';
    end if;
    if new.voided_at is null then
      return new;
    end if;
    new.void_reason := btrim(coalesce(new.void_reason, ''));
    if length(new.void_reason) < 5 then
      raise exception 'Razlog storna je obavezan (najmanje 5 znakova)' using errcode = '23514';
    end if;
    new.voided_at := now();
    new.voided_by := auth.uid();
    return new;
  end if;

  -- INSERT
  new.recorded_at := now();
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  new.voided_at := null;
  new.voided_by := null;
  new.void_reason := null;
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  new.ext_invoice_reference := nullif(btrim(coalesce(new.ext_invoice_reference, '')), '');
  new.notes := nullif(btrim(coalesce(new.notes, '')), '');

  if new.billing_summary_id is not null then
    select * into s from public.billing_summaries where id = new.billing_summary_id for update;   -- zbir uplata po redu
    if not found then
      raise exception 'Obračun nije pronađen' using errcode = '23503';
    end if;
    new.client_id := coalesce(new.client_id, s.client_id);
    if new.client_id <> s.client_id then
      raise exception 'Uplata i obračun moraju biti za istog klijenta' using errcode = '23514';
    end if;
    if s.project_id is not null then
      if new.project_id is not null and new.project_id <> s.project_id then
        raise exception 'Uplata i obračun moraju biti za isti projekat' using errcode = '23514';
      end if;
      new.project_id := s.project_id;
    end if;
    new.period_start := coalesce(new.period_start, s.period_start);
    new.period_end := coalesce(new.period_end, s.period_end);
    v_currency := coalesce(s.ext_invoice_currency, s.currency);
    new.currency := coalesce(new.currency, v_currency);
    if new.currency <> v_currency then
      raise exception 'Valuta uplate mora biti % (valuta računa, odnosno obračuna)', v_currency using errcode = '23514';
    end if;
    new.ext_invoice_reference := coalesce(new.ext_invoice_reference, s.ext_invoice_reference);
    if s.ext_invoice_amount is not null then
      select coalesce(sum(cp.amount), 0) into v_paid
      from public.client_payments cp where cp.billing_summary_id = s.id and cp.voided_at is null;
      if v_paid + new.amount > s.ext_invoice_amount then
        raise exception 'Uplata prelazi iznos eksternog računa (preostalo % %). Korekcija = storno uplate uz razlog',
          s.ext_invoice_amount - v_paid, v_currency using errcode = '23514';
      end if;
    end if;
  end if;

  if new.project_id is not null then
    select p.client_id into v_client from public.projects p where p.id = new.project_id;
    if v_client is distinct from new.client_id then
      raise exception 'Projekat ne pripada klijentu uplate' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists client_payments_guard on public.client_payments;
create trigger client_payments_guard before insert or update or delete on public.client_payments
  for each row execute function public.guard_client_payment();

-- ═════════════════════════════ 6. stanje obračuna (view) ═════════════════════════════
-- security_invoker: važe RLS politike tabela (billing.view). Iste formule kao billingBalance u src/lib/finance/billing.js.
create or replace view public.billing_balances with (security_invoker = true) as
select s.id as summary_id, s.client_id, s.project_id, s.status,
       coalesce(s.ext_invoice_currency, s.currency) as currency,
       s.calculated_amount,
       s.ext_invoice_amount as invoiced_amount,
       coalesce(p.received, 0)::numeric(12, 2) as received_amount,
       case when s.ext_invoice_amount is not null then s.ext_invoice_amount - coalesce(p.received, 0) end as outstanding,
       case when s.ext_invoice_amount is null and s.calculated_amount is not null
            then s.calculated_amount - coalesce(p.received, 0) end as estimated_unpaid,
       case when coalesce(p.received, 0) <= 0 then 'unpaid'
            when coalesce(p.received, 0) >= coalesce(s.ext_invoice_amount, s.calculated_amount, 0) then 'paid'
            else 'partially_paid' end as payment_status,
       coalesce(s.ext_due_date < current_date and s.ext_invoice_amount - coalesce(p.received, 0) > 0, false) as overdue
from public.billing_summaries s
left join lateral (
  select sum(cp.amount) as received from public.client_payments cp
  where cp.billing_summary_id = s.id and cp.voided_at is null
) p on true;
comment on view public.billing_balances is
  'Calculated (interni B2B) / Invoiced (ručno, eksterni račun) / Received / Outstanding (samo uz eksterni iznos) / Estimated Unpaid (bez eksternog iznosa) — T16, T17';

-- ═════════════════════════════ 7. tarifa klijenta: samo uz rates.view_b2b (§4) ═════════════════════════════
-- HR čita klijente, ali ne i default_b2b_rate. Kolona nije u column grant-u; čita se kroz client_money.
-- Svaka buduća nova kolona clients mora dobiti grant select (kolona) u istoj migraciji.
revoke select on public.clients from authenticated;
revoke all on public.clients from anon;
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position) into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'clients' and c.column_name <> 'default_b2b_rate';
  execute format('grant select (%s) on public.clients to authenticated', v_cols);
end $$;
grant insert, update, delete on public.clients to authenticated;

create or replace view public.client_money with (security_barrier) as
select c.id as client_id,
       case when public.has_permission('rates.view_b2b') then c.default_b2b_rate end as default_b2b_rate
from public.clients c
where public.is_staff();
comment on view public.client_money is 'clients.default_b2b_rate po pravu rates.view_b2b (HR ne vidi tarifu klijenta, T26)';
revoke all on public.client_money from public, anon;
grant select on public.client_money to authenticated;

-- ═════════════════════════════ 8. prava (RLS), audit, izvršavanje ═════════════════════════════
select public.apply_table_policies('billing_summaries',
  '(select public.has_permission(''billing.view''))', '(select public.has_permission(''billing.manage''))');
select public.apply_table_policies('billing_summary_costs',
  '(select public.has_permission(''billing.view''))', '(select public.has_permission(''billing.manage''))');
select public.apply_table_policies('client_payments',
  '(select public.has_permission(''billing.view''))', '(select public.has_permission(''billing.manage''))');
-- Linije i istoriju piše samo set_billing_status.
select public.apply_table_policies('billing_summary_lines', '(select public.has_permission(''billing.view''))', null);
select public.apply_table_policies('billing_status_history', '(select public.has_permission(''billing.view''))', null);

revoke all on public.billing_summaries, public.billing_summary_lines, public.billing_summary_costs,
  public.billing_status_history, public.client_payments, public.billing_balances from anon;
-- Dozvole nad tabelama kao i svuda (20261122120000); ko sme da piše određuju RLS i trigeri: linije i istorija
-- nemaju politiku za upis (piše ih samo set_billing_status), brisanje uplate odbija guard_client_payment.
grant select, insert, update, delete on public.billing_summaries, public.billing_summary_lines, public.billing_summary_costs,
  public.billing_status_history, public.client_payments to authenticated;
grant select on public.billing_balances to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['billing_summaries', 'client_payments', 'billing_summary_costs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit', t);
    execute format('create trigger %I after insert or update or delete on public.%I '
                   'for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
end $$;

revoke execute on function public.guard_billing_summary(), public.guard_billing_overlap(),
  public.guard_billing_summary_delete(), public.guard_billing_summary_cost(), public.project_cost_billing_lock(),
  public.guard_client_payment()
  from public, anon, authenticated;
revoke execute on function public.set_billing_status(uuid, text, text) from public, anon;
grant execute on function public.set_billing_status(uuid, text, text) to authenticated;
