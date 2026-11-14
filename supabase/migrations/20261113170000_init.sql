-- App za radnike — šema.
-- D12: tabele i kolone prate imena polja koja postojeće stranice već koriste (Base44 entiteti),
-- da bi stranice radile bez prepravljanja. Odstupanja su samo tamo gde je bila greška:
--  * satnica i projekat se vezuju po ID-u (project_id / client_id), ime ostaje kao snimak za prikaz;
--  * osetljivi podaci radnika (JMBG, banka, tarife) su u posebnoj tabeli koju vidi samo admin (D3);
--  * odobrena satnica i zaključan mesec ne mogu da se menjaju (D10);
--  * mesečni obračun (payroll_runs/payslips) sa neto/bruto (D7).
-- Svaka tabela ima id, created_date, updated_date, created_by (kao Base44).

create extension if not exists btree_gist with schema extensions;

create function public.set_updated_date() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_date := now();
  return new;
end $$;

-- ═════════════════════════════ korisnici i uloge ═════════════════════════════
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'operater' check (role in ('admin', 'operater')),
  active boolean not null default true,
  created_date timestamptz not null default now()
);

-- Prvi korisnik postaje admin, ostali su operateri dok ih admin ne promeni (D14: javna registracija isključena).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when exists (select 1 from public.profiles where role = 'admin') then 'operater' else 'admin' end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid() and p.active), false)
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active)
$$;

create function public.guard_last_admin() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin' and p.active) then
    raise exception 'Mora da ostane bar jedan aktivan admin' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger profiles_guard_last_admin
  before update on public.profiles
  for each row execute function public.guard_last_admin();

-- ═════════════════════════════ podešavanja (šifarnici) ═════════════════════════════
create table public.department_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  translation text,
  positions jsonb not null default '[]',
  color text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.cost_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  translation text,
  subcategories jsonb not null default '[]',
  color text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('timesheet_reminder', 'payroll_notification', 'shift_schedule',
    'document_expiry', 'general_announcement', 'payment_confirmation', 'contract_reminder')),
  subject text not null,
  body text not null,
  is_active boolean not null default true,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ═════════════════════════════ podizvođači i klijenti ═════════════════════════════
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  vendor_id text,
  name text not null check (btrim(name) <> ''),
  legal_name text,
  registration_number text,
  tax_number text,
  vat_number text,
  country text,
  city text,
  postal_code text,
  address text,
  contact_name text,
  email text,
  phone text,
  default_currency text not null default 'EUR' check (default_currency in ('EUR', 'RSD', 'GBP', 'USD')),
  payment_terms text,
  payroll_cycle text check (payroll_cycle in ('weekly', 'biweekly', 'monthly')),
  contract_reference text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  contact_name text,
  email text,
  phone text,
  address text,
  vat_number text,
  default_b2b_rate numeric(10, 2),
  payment_terms text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ═════════════════════════════ radnici ═════════════════════════════
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (btrim(first_name) <> ''),
  last_name text not null check (btrim(last_name) <> ''),
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  nationality text,
  profile_photo text,
  phone text,
  email text,
  address text,
  city text,
  postal_code text,
  country text,
  employee_id text unique,           -- šifra radnika (EMP-001), ne ID iz baze
  position text,
  department text,
  employment_type text check (employment_type in ('full_time', 'part_time', 'temporary', 'contractor')),
  start_date date,
  end_date date,
  supervisor text,
  work_location text,
  status text not null default 'active' check (status in ('active', 'suspended', 'on_leave', 'terminated')),
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  emergency_contact_address text,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint employees_dates check (end_date is null or start_date is null or end_date >= start_date)
);

-- JMBG: 13 cifara + kontrolna cifra po modulu 11.
create function public.jmbg_valid(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  d int[];
  s int;
  m int;
begin
  if p is null or p = '' then return true; end if;
  if p !~ '^[0-9]{13}$' then return false; end if;
  select array_agg(substr(p, i, 1)::int order by i) into d from generate_series(1, 13) i;
  s := 7 * (d[1] + d[7]) + 6 * (d[2] + d[8]) + 5 * (d[3] + d[9])
     + 4 * (d[4] + d[10]) + 3 * (d[5] + d[11]) + 2 * (d[6] + d[12]);
  m := 11 - (s % 11);
  if m > 9 then m := 0; end if;
  return m = d[13];
end $$;

-- Osetljivi i platni podaci radnika — vidi i menja samo admin (D3).
-- Kolone nose ista imena kao polja forme za radnika; sloj podataka ih spaja sa `employees`.
create table public.employee_private (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  jmbg text check (public.jmbg_valid(jmbg)),
  id_card_number text,
  id_card_expiry date,
  passport_number text,
  passport_expiry date,
  bank_name text,
  iban text,
  swift_bic text,
  tax_number text,
  vat_number text,
  salary numeric(12, 2),
  payment_frequency text check (payment_frequency in ('monthly', 'bi_weekly', 'weekly')),
  payment_type text default 'hourly' check (payment_type in ('hourly', 'daily', 'weekly', 'monthly')),
  preferred_payment_method text,
  payroll_status text default 'active' check (payroll_status in ('active', 'on_hold', 'closed')),
  b2c_hourly_rate numeric(10, 2) check (b2c_hourly_rate >= 0),
  b2b_hourly_rate numeric(10, 2) check (b2b_hourly_rate >= 0),
  overtime_rate numeric(10, 2) check (overtime_rate >= 0),
  weekend_rate numeric(10, 2) check (weekend_rate >= 0),
  holiday_rate numeric(10, 2) check (holiday_rate >= 0),
  rate_basis text not null default 'neto' check (rate_basis in ('neto', 'bruto')),
  work_fraction numeric(4, 3) not null default 1 check (work_fraction > 0 and work_fraction <= 1),
  updated_date timestamptz not null default now()
);

-- Angažman radnika kroz vreme: direktno zaposlen ili preko podizvođača. Bez preklapanja.
create table public.employment_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  employee_name text,
  engagement_type text not null default 'direct_employee'
    check (engagement_type in ('direct_employee', 'subcontractor_worker')),
  vendor_id uuid references public.vendors (id) on delete restrict,
  vendor_name text,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'ended')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint employment_history_dates check (end_date is null or end_date >= start_date),
  constraint employment_history_vendor check ((engagement_type = 'subcontractor_worker') = (vendor_id is not null)),
  constraint employment_history_no_overlap exclude using gist (
    employee_id with =, daterange(start_date, end_date, '[]') with &&)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  category text not null check (category in ('id_card', 'passport', 'work_permit', 'contract', 'certificate',
    'diploma', 'training_certificate', 'driver_license', 'insurance', 'medical_certificate', 'safety_certificate', 'other')),
  file_url text,
  file_name text,
  expiration_date date,
  status text check (status in ('valid', 'expiring_soon', 'expired')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index documents_employee_idx on public.documents (employee_id);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  employee_name text,
  leave_type text not null check (leave_type in ('vacation', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other')),
  start_date date not null,
  end_date date not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint leave_requests_dates check (end_date >= start_date)
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  clock_in text,
  clock_out text,
  break_minutes numeric,
  total_hours numeric(5, 2),
  overtime_hours numeric(5, 2),
  status text default 'present' check (status in ('present', 'absent', 'late', 'half_day', 'holiday')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  employee_name text,
  date date not null,
  shift_start text not null,
  shift_end text not null,
  shift_type text check (shift_type in ('morning', 'afternoon', 'night', 'full_day', 'custom')),
  location text,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references public.employees (id) on delete set null,
  assigned_to_name text,
  due_date date,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text default 'todo' check (status in ('todo', 'in_progress', 'review', 'completed')),
  category text,
  attachments jsonb not null default '[]',
  comments jsonb not null default '[]',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  type text check (type in ('document_expiry', 'attendance', 'schedule_change', 'leave_request', 'contract_expiry', 'general')),
  target_user text,
  is_read boolean not null default false,
  link text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ═════════════════════════════ projekti ═════════════════════════════
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  project_number text,
  name text not null check (btrim(name) <> ''),
  client_id uuid references public.clients (id) on delete restrict,
  client_name text,                  -- snimak imena za prikaz; veza je client_id
  location text,
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  description text,
  job_roles jsonb not null default '[]',
  assigned_employees jsonb not null default '[]',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint projects_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create index projects_client_idx on public.projects (client_id);

-- Forma projekta šalje ime klijenta; baza ga pretvara u client_id. Preimenovanje klijenta osvežava snimak.
create function public.sync_project_client() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.client_name is not null
     and (tg_op = 'INSERT' or new.client_name is distinct from old.client_name or new.client_id is null) then
    select c.id into new.client_id from public.clients c where c.name = new.client_name order by c.created_date limit 1;
  end if;
  if new.client_name is null then new.client_id := null; end if;
  return new;
end $$;
create trigger projects_sync_client before insert or update on public.projects
  for each row execute function public.sync_project_client();

create function public.propagate_client_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    perform set_config('app.snapshot_sync', 'on', true);
    update public.projects set client_name = new.name where client_id = new.id;
    update public.timesheets t set client_name = new.name
      from public.projects p where p.id = t.project_id and p.client_id = new.id;
    perform set_config('app.snapshot_sync', 'off', true);
  end if;
  return new;
end $$;

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  employee_name text,
  project_id uuid not null references public.projects (id) on delete cascade,
  project_name text,
  position text,
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('planned', 'active', 'completed', 'cancelled')),
  affiliation_id uuid references public.employment_history (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  vendor_name text,
  engagement_type text check (engagement_type in ('direct_employee', 'subcontractor_worker')),
  rate_reference text,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint project_assignments_dates check (end_date is null or end_date >= start_date)
);

-- Tarife sa datumom važenja (stranica „Tarife i angažmani"). Vidi samo admin.
create table public.rates (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'project' check (scope in ('assignment', 'project', 'employee')),
  kind text not null check (kind in ('cost', 'revenue')),
  unit text not null default 'hourly' check (unit in ('hourly', 'daily', 'weekly', 'monthly')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'RSD', 'GBP', 'USD')),
  employee_id uuid references public.employees (id) on delete cascade,
  employee_name text,
  project_id uuid references public.projects (id) on delete cascade,
  project_name text,
  position text,
  assignment_id uuid references public.project_assignments (id) on delete cascade,
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint rates_dates check (effective_to is null or effective_to >= effective_from)
);

create table public.project_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  description text,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency in ('EUR', 'RSD')),
  category text,
  subcategory text,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index project_costs_project_idx on public.project_costs (project_id);

-- ═════════════════════════════ satnice ═════════════════════════════
-- Vrste sati i koeficijenti — unosi admin (D5). Redovni = 1; ostali prazni dok ih admin ne upiše.
create table public.hour_types (
  code text primary key check (code in ('redovni', 'prekovremeni', 'vikend', 'praznik')),
  name text not null,
  sort integer not null default 0,
  worker_coef numeric(6, 4) check (worker_coef > 0),
  client_coef numeric(6, 4) check (client_coef > 0)
);
insert into public.hour_types (code, name, sort, worker_coef, client_coef) values
  ('redovni', 'Redovan rad', 1, 1, 1),
  ('prekovremeni', 'Prekovremeni rad', 2, null, null),
  ('vikend', 'Rad vikendom', 3, null, null),
  ('praznik', 'Rad na praznik', 4, null, null);

-- Pravila za razvrstavanje sati iz nedeljne satnice (jedan red).
create table public.work_rules (
  id boolean primary key default true check (id),
  daily_regular_hours numeric(4, 2) not null default 8 check (daily_regular_hours > 0 and daily_regular_hours <= 24),
  updated_date timestamptz not null default now()
);
insert into public.work_rules (id) values (true);

-- Praznici — unosi admin. Sati na taj dan se računaju kao „praznik".
create table public.holidays (
  date date primary key,
  name text not null
);

-- Jedan red = radnik × nedelja (ponedeljak) × projekat, sa satima po danima (isto kao u Base44).
create table public.timesheets (
  id uuid primary key default gen_random_uuid(),
  week_ref text,
  employee_id uuid not null references public.employees (id) on delete restrict,
  employee_name text,
  client_name text,
  project text,                      -- snimak imena za prikaz i PDF; veza je project_id
  project_id uuid references public.projects (id) on delete restrict,
  week_start date not null check (extract(isodow from week_start) = 1),
  mon_hours numeric(5, 2) not null default 0 check (mon_hours between 0 and 24),
  tue_hours numeric(5, 2) not null default 0 check (tue_hours between 0 and 24),
  wed_hours numeric(5, 2) not null default 0 check (wed_hours between 0 and 24),
  thu_hours numeric(5, 2) not null default 0 check (thu_hours between 0 and 24),
  fri_hours numeric(5, 2) not null default 0 check (fri_hours between 0 and 24),
  sat_hours numeric(5, 2) not null default 0 check (sat_hours between 0 and 24),
  sun_hours numeric(5, 2) not null default 0 check (sun_hours between 0 and 24),
  total_hours numeric(6, 2),
  overtime_hours numeric(6, 2) not null default 0,
  notes text,
  attachment_url text,
  attachment_name text,
  approval_status text not null default 'draft' check (approval_status in ('draft', 'submitted', 'approved', 'rejected')),
  b2c_rate numeric(10, 2) check (b2c_rate >= 0),
  b2b_rate numeric(10, 2) check (b2b_rate >= 0),
  worker_cost numeric(12, 2),
  client_revenue numeric(12, 2),
  profit numeric(12, 2),
  hours_by_type jsonb,               -- razvrstani sati (redovni/prekovremeni/vikend/praznik)
  rate_snapshot jsonb,               -- tarife i koeficijenti u trenutku obračuna reda
  affiliation_id uuid references public.employment_history (id) on delete set null,
  vendor_id uuid references public.vendors (id) on delete set null,
  vendor_name text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index timesheets_week_idx on public.timesheets (week_start);
create index timesheets_project_idx on public.timesheets (project_id);
create unique index timesheets_one_per_week on public.timesheets (employee_id, project_id, week_start)
  where project_id is not null;

create trigger clients_propagate_rename after update on public.clients
  for each row execute function public.propagate_client_rename();

create function public.propagate_project_rename() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.name is distinct from old.name then
    perform set_config('app.snapshot_sync', 'on', true);
    update public.timesheets set project = new.name where project_id = new.id;
    update public.project_assignments set project_name = new.name where project_id = new.id;
    perform set_config('app.snapshot_sync', 'off', true);
  end if;
  return new;
end $$;
create trigger projects_propagate_rename after update on public.projects
  for each row execute function public.propagate_project_rename();

create table public.month_locks (
  month date primary key check (extract(day from month) = 1),
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz not null default now()
);

create function public.month_is_locked(p_date date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.month_locks where month = date_trunc('month', p_date)::date)
$$;

-- Sati satnice po danima (datum, sati) — osnova za mesečni obračun kad nedelja pređe u drugi mesec.
create function public.timesheet_days(t public.timesheets) returns table (work_date date, hours numeric)
language sql immutable set search_path = '' as $$
  select (t.week_start + d.i)::date, d.h
  from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
               (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) as d(i, h)
  where d.h > 0
$$;

-- Čuvar satnice: zaključan mesec, odobrene satnice, ko sme da odobri, bez odobravanja bez tarife.
create function public.guard_timesheet() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean := public.is_admin();
  v_locked date;
begin
  -- Osvežavanje samo imena za prikaz (preimenovan projekat/klijent) prolazi i kroz zaključan mesec.
  if tg_op = 'UPDATE' and coalesce(current_setting('app.snapshot_sync', true), '') = 'on'
     and (new.employee_id, new.project_id, new.week_start, new.mon_hours, new.tue_hours, new.wed_hours,
          new.thu_hours, new.fri_hours, new.sat_hours, new.sun_hours, new.b2c_rate, new.b2b_rate,
          new.worker_cost, new.client_revenue, new.hours_by_type, new.rate_snapshot, new.approval_status)
         is not distinct from
         (old.employee_id, old.project_id, old.week_start, old.mon_hours, old.tue_hours, old.wed_hours,
          old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours, old.b2c_rate, old.b2b_rate,
          old.worker_cost, old.client_revenue, old.hours_by_type, old.rate_snapshot, old.approval_status) then
    return new;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    select date_trunc('month', d.work_date)::date into v_locked
    from public.timesheet_days(old) d where public.month_is_locked(d.work_date) limit 1;
    if v_locked is not null then
      raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
    end if;
    if old.approval_status = 'approved' then
      if tg_op = 'DELETE' then
        raise exception 'Odobrena satnica ne može da se obriše; prvo je vratite u nacrt' using errcode = 'check_violation';
      end if;
      if not v_admin then
        raise exception 'Odobrenu satnicu može da menja samo admin' using errcode = '42501';
      end if;
      if new.approval_status = 'approved' and (
           (new.employee_id, new.project_id, new.week_start, new.mon_hours, new.tue_hours, new.wed_hours,
            new.thu_hours, new.fri_hours, new.sat_hours, new.sun_hours, new.b2c_rate, new.b2b_rate,
            new.worker_cost, new.client_revenue, new.hours_by_type, new.rate_snapshot)
           is distinct from
           (old.employee_id, old.project_id, old.week_start, old.mon_hours, old.tue_hours, old.wed_hours,
            old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours, old.b2c_rate, old.b2b_rate,
            old.worker_cost, old.client_revenue, old.hours_by_type, old.rate_snapshot)) then
        raise exception 'Odobrena satnica se ne menja; prvo je vratite u nacrt' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  select date_trunc('month', d.work_date)::date into v_locked
  from public.timesheet_days(new) d where public.month_is_locked(d.work_date) limit 1;
  if v_locked is not null then
    raise exception 'Mesec % je zaključan', to_char(v_locked, 'MM.YYYY') using errcode = 'check_violation';
  end if;

  -- Projekat upisan imenom dobija project_id ako je ime jednoznačno.
  if new.project_id is null and new.project is not null then
    select p.id into new.project_id from public.projects p where p.name = new.project
    and (select count(*) from public.projects p2 where p2.name = new.project) = 1;
  end if;

  new.total_hours := new.mon_hours + new.tue_hours + new.wed_hours + new.thu_hours
                   + new.fri_hours + new.sat_hours + new.sun_hours;

  if new.approval_status = 'approved' and (tg_op = 'INSERT' or old.approval_status <> 'approved') then
    if not v_admin then
      raise exception 'Satnicu može da odobri samo admin' using errcode = '42501';
    end if;
    if new.b2c_rate is null or new.b2b_rate is null then
      raise exception 'Satnica nema tarifu radnika ili klijenta i ne može da se odobri' using errcode = 'check_violation';
    end if;
    if new.project_id is null then
      raise exception 'Satnica mora biti vezana za projekat sa liste da bi se odobrila' using errcode = 'check_violation';
    end if;
    new.approved_by := auth.uid();
    new.approved_date := now();
  elsif new.approval_status <> 'approved' then
    new.approved_by := null;
    new.approved_date := null;
  end if;

  return new;
end $$;

create trigger timesheets_guard
  before insert or update or delete on public.timesheets
  for each row execute function public.guard_timesheet();

create function public.lock_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_open integer;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da zaključa mesec' using errcode = '42501';
  end if;
  select count(distinct t.id) into v_open
  from public.timesheets t, lateral public.timesheet_days(t) d
  where t.approval_status <> 'approved'
    and d.work_date >= v_month and d.work_date < (v_month + interval '1 month')::date;
  if v_open > 0 then
    raise exception 'Mesec ima % neodobrenih satnica', v_open using errcode = 'check_violation';
  end if;
  insert into public.month_locks (month, locked_by) values (v_month, auth.uid());
end $$;

create function public.unlock_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da otključa mesec' using errcode = '42501';
  end if;
  if exists (select 1 from public.payroll_runs where month = v_month) then
    raise exception 'Za ovaj mesec postoji obračun; prvo obrišite nacrt obračuna' using errcode = 'check_violation';
  end if;
  delete from public.month_locks where month = v_month;
end $$;

-- ═════════════════════════════ obračun ═════════════════════════════
-- Stari nedeljni obračun iz Base44 (stranica „Nedeljni obračun"); ostaje dok se ne zameni mesečnim.
create table public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  employee_name text,
  week_start date not null,
  week_end date,
  total_hours numeric(7, 2),
  overtime_hours numeric(7, 2) default 0,
  b2c_rate numeric(10, 2),
  total_worker_cost numeric(12, 2),
  total_client_revenue numeric(12, 2),
  total_profit numeric(12, 2),
  profit_margin numeric(8, 2),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'approved', 'paid', 'delayed', 'cancelled')),
  payment_due_date date,
  notes text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- Zakonski parametri u RSD sa datumom važenja (D7).
create table public.payroll_params (
  id uuid primary key default gen_random_uuid(),
  valid_from date not null unique,
  tax_rate numeric(6, 4) not null,
  non_taxable_rsd numeric(12, 2) not null,
  min_base_rsd numeric(12, 2) not null,
  max_base_rsd numeric(12, 2) not null,
  emp_pio numeric(6, 4) not null,
  emp_health numeric(6, 4) not null,
  emp_unemployment numeric(6, 4) not null,
  er_pio numeric(6, 4) not null,
  er_health numeric(6, 4) not null,
  source_note text,
  created_date timestamptz not null default now()
);
insert into public.payroll_params
  (valid_from, tax_rate, non_taxable_rsd, min_base_rsd, max_base_rsd,
   emp_pio, emp_health, emp_unemployment, er_pio, er_health, source_note)
values ('2026-01-01', 0.10, 34221, 51297, 732820, 0.14, 0.0515, 0.0075, 0.10, 0.0515,
        'Parametri za 2026. iz knjigovodstvenih izvora; potvrditi u Službenom glasniku.');

-- Mesečni obračun: jedan po mesecu, kurs i parametri se snimaju (D2, D10).
create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid')),
  eur_rsd_rate numeric(10, 4) not null check (eur_rsd_rate > 0),
  params jsonb not null,
  notes text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_date timestamptz,
  paid_date timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payroll_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  employee_name text,
  engagement_type text not null check (engagement_type in ('direct_employee', 'subcontractor_worker')),
  vendor_id uuid references public.vendors (id) on delete set null,
  rate_basis text not null check (rate_basis in ('neto', 'bruto')),
  work_fraction numeric(4, 3) not null,
  total_hours numeric(7, 2) not null,
  hours_by_type jsonb not null default '{}',
  basis_amount numeric(12, 2) not null,
  bruto numeric(12, 2),
  neto numeric(12, 2),
  tax numeric(12, 2),
  emp_pio numeric(12, 2),
  emp_health numeric(12, 2),
  emp_unemployment numeric(12, 2),
  er_pio numeric(12, 2),
  er_health numeric(12, 2),
  total_cost numeric(12, 2) not null,
  payout numeric(12, 2) not null,
  warnings text[] not null default '{}',
  created_date timestamptz not null default now(),
  unique (run_id, employee_id)
);

create table public.payslip_projects (
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  hours numeric(7, 2) not null,
  worker_amount numeric(12, 2) not null,
  labor_cost numeric(12, 2) not null,
  revenue numeric(12, 2) not null,
  primary key (payslip_id, project_id)
);
create index payslip_projects_project_idx on public.payslip_projects (project_id);

create function public.guard_payroll_run() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow boolean := coalesce(current_setting('app.payroll_workflow', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not public.month_is_locked(new.month) then
      raise exception 'Obračun može da se napravi samo za zaključan mesec' using errcode = 'check_violation';
    end if;
    if new.status <> 'draft' then
      raise exception 'Novi obračun mora biti nacrt' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Odobren ili isplaćen obračun ne može da se obriše' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if (old.status <> 'draft' or new.status <> old.status) and not v_workflow then
    raise exception 'Odobren obračun ne može da se menja; status se menja samo odobravanjem/isplatom'
      using errcode = 'check_violation';
  end if;
  if new.month <> old.month then
    raise exception 'Mesec obračuna ne može da se menja' using errcode = 'check_violation';
  end if;
  new.updated_date := now();
  return new;
end $$;
create trigger payroll_runs_guard before insert or update or delete on public.payroll_runs
  for each row execute function public.guard_payroll_run();

create function public.guard_payslip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_run uuid;
  v_status text;
begin
  if tg_table_name = 'payslips' then
    v_run := case when tg_op = 'DELETE' then old.run_id else new.run_id end;
  else
    select run_id into v_run from public.payslips
    where id = case when tg_op = 'DELETE' then old.payslip_id else new.payslip_id end;
  end if;
  select status into v_status from public.payroll_runs where id = v_run;
  -- Ako obračun više ne postoji, brisanje dolazi kaskadno iz brisanja nacrta — dozvoljeno.
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Platni listić odobrenog obračuna ne može da se menja' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger payslips_guard before insert or update or delete on public.payslips
  for each row execute function public.guard_payslip();
create trigger payslip_projects_guard before insert or update or delete on public.payslip_projects
  for each row execute function public.guard_payslip();

-- Odobravanje obračuna proverava da je sve sabrano tačno, pa tek onda zaključava.
create function public.approve_payroll_run(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.payroll_runs;
  v_problems text;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da odobri obračun' using errcode = '42501';
  end if;
  select * into v_run from public.payroll_runs where id = p_run for update;
  if v_run.id is null or v_run.status <> 'draft' then
    raise exception 'Obračun ne postoji ili nije nacrt' using errcode = 'check_violation';
  end if;

  with hours as (
    select t.employee_id, sum(d.hours) as hours
    from public.timesheets t, lateral public.timesheet_days(t) d
    where t.approval_status = 'approved'
      and d.work_date >= v_run.month and d.work_date < (v_run.month + interval '1 month')::date
    group by t.employee_id
  ),
  slips as (
    select ps.id, ps.employee_id, ps.total_hours, ps.total_cost,
           coalesce((select sum(pp.labor_cost) from public.payslip_projects pp where pp.payslip_id = ps.id), 0) as alloc,
           coalesce((select sum(pp.hours) from public.payslip_projects pp where pp.payslip_id = ps.id), 0) as alloc_hours
    from public.payslips ps where ps.run_id = p_run
  ),
  problems as (
    select format('%s %s: nema platnog listića', e.first_name, e.last_name) as msg
    from hours h join public.employees e on e.id = h.employee_id
    where not exists (select 1 from slips s where s.employee_id = h.employee_id)
    union all
    select format('%s %s: sati na listiću (%s) ≠ odobreni sati (%s)', e.first_name, e.last_name, s.total_hours, coalesce(h.hours, 0))
    from slips s join public.employees e on e.id = s.employee_id
    left join hours h on h.employee_id = s.employee_id
    where s.total_hours <> coalesce(h.hours, 0) or s.alloc_hours <> s.total_hours
    union all
    select format('%s %s: raspodela po projektima (%s) ≠ ukupan trošak (%s)', e.first_name, e.last_name, s.alloc, s.total_cost)
    from slips s join public.employees e on e.id = s.employee_id
    where s.alloc <> s.total_cost
  )
  select string_agg(msg, '; ') into v_problems from problems;

  if v_problems is not null then
    raise exception 'Obračun nije usklađen: %', v_problems using errcode = 'check_violation';
  end if;

  perform set_config('app.payroll_workflow', 'on', true);
  update public.payroll_runs set status = 'approved', approved_by = auth.uid(), approved_date = now() where id = p_run;
  perform set_config('app.payroll_workflow', 'off', true);
end $$;

create function public.mark_payroll_paid(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da označi isplatu' using errcode = '42501';
  end if;
  if not exists (select 1 from public.payroll_runs where id = p_run and status = 'approved') then
    raise exception 'Isplaćen može da bude samo odobren obračun' using errcode = 'check_violation';
  end if;
  perform set_config('app.payroll_workflow', 'on', true);
  update public.payroll_runs set status = 'paid', paid_date = now() where id = p_run;
  perform set_config('app.payroll_workflow', 'off', true);
end $$;

-- ═════════════════════════════ updated_date ═════════════════════════════
do $$
declare
  t text;
begin
  foreach t in array array['department_configs', 'cost_categories', 'email_templates', 'vendors', 'clients',
    'employees', 'employee_private', 'employment_history', 'documents', 'leave_requests', 'attendance_records',
    'schedules', 'tasks', 'notifications', 'projects', 'project_assignments', 'rates', 'project_costs',
    'timesheets', 'payroll_records', 'work_rules']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_date()',
                   t || '_updated', t);
  end loop;
end $$;

-- ═════════════════════════════ RLS ═════════════════════════════
-- Osoblje (admin + operater): rad sa radnicima, projektima i satnicama.
-- Samo admin: osetljivi podaci, tarife, troškovi, obračun, podešavanja (D3).
-- Napomena: snimci tarifa u `timesheets` i `projects.assigned_employees` su vidljivi i operateru kroz API;
-- stranice sa novcem su mu sakrivene (src/lib/access.js). Vidi DECISIONS.md D3.
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'department_configs', 'cost_categories', 'email_templates', 'vendors', 'clients',
    'employees', 'employee_private', 'employment_history', 'documents', 'leave_requests', 'attendance_records',
    'schedules', 'tasks', 'notifications', 'projects', 'project_assignments', 'rates', 'project_costs',
    'hour_types', 'work_rules', 'holidays', 'timesheets', 'month_locks', 'payroll_records', 'payroll_params',
    'payroll_runs', 'payslips', 'payslip_projects']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- osoblje čita i menja
  foreach t in array array['vendors', 'employees', 'employment_history', 'documents', 'leave_requests',
    'attendance_records', 'schedules', 'tasks', 'notifications', 'projects', 'project_assignments', 'timesheets']
  loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))',
                   t || '_staff', t);
  end loop;

  -- osoblje čita, admin menja
  foreach t in array array['department_configs', 'cost_categories', 'clients', 'hour_types', 'work_rules', 'holidays', 'month_locks']
  loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))', t || '_read', t);
    if t <> 'month_locks' then
      execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                     t || '_admin_write', t);
    end if;
  end loop;

  -- samo admin
  foreach t in array array['employee_private', 'rates', 'project_costs', 'email_templates', 'payroll_records',
    'payroll_params', 'payroll_runs', 'payslips', 'payslip_projects']
  loop
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
                   t || '_admin', t);
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_admin(), public.is_staff(), public.month_is_locked(date), public.jmbg_valid(text),
  public.timesheet_days(public.timesheets), public.lock_month(date), public.unlock_month(date),
  public.approve_payroll_run(uuid), public.mark_payroll_paid(uuid)
to authenticated;

-- ═════════════════════════════ fajlovi ═════════════════════════════
-- Privatni bucket: dokumenta radnika, prilozi satnica, fotografije. Linkovi se izdaju kao potpisani (sloj podataka).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy files_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'files' and (select public.is_staff()));
create policy files_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (select public.is_staff()));
create policy files_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'files' and (select public.is_staff()));
create policy files_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (select public.is_staff()));
