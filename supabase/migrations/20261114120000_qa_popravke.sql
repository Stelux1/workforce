-- Popravke posle QA prolaza 14.11.2026 (QA-FINDINGS.md). Ne menja postojeće odluke (DECISIONS.md),
-- samo ih sprovodi u bazi tamo gde je ekran mogao da ih zaobiđe.
--  * iznosi satnice (trošak, prihod, zarada) računa baza iz sati i tarifa — klijent više ne može da upiše
--    proizvoljan iznos (D10/D11: odobreno nosi tačan snimak);
--  * odobravanje traži tarifu veću od 0 (D4/D11: „nikad 0");
--  * odbijanje satnice, kao i odobravanje, sme samo admin;
--  * ručno upisan projekat (bez project_id) takođe sme samo jednom po radniku i nedelji;
--  * isti naziv projekta za istog klijenta samo jednom (izveštaji i satnice se inače mešaju);
--  * ponovno zaključavanje meseca daje jasnu poruku;
--  * zadatak obrisanog radnika gubi i ime radnika;
--  * poslednji aktivan admin ne može ni da se obriše.

-- ───────────── satnica ─────────────
create or replace function public.guard_timesheet() returns trigger
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
            new.hours_by_type, new.rate_snapshot)
           is distinct from
           (old.employee_id, old.project_id, old.week_start, old.mon_hours, old.tue_hours, old.wed_hours,
            old.thu_hours, old.fri_hours, old.sat_hours, old.sun_hours, old.b2c_rate, old.b2b_rate,
            old.hours_by_type, old.rate_snapshot)) then
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

  -- Iznose računa baza (dok satnica nema razvrstane sati po vrstama — Faza 2): sati × tarifa.
  -- Isto pravilo kao src/lib/payroll/timesheet.js; klijentske vrednosti se ignorišu.
  if new.hours_by_type is null then
    new.overtime_hours := greatest(new.total_hours - 40, 0);
    new.worker_cost := case when new.b2c_rate is null then null else round(new.total_hours * new.b2c_rate, 2) end;
    new.client_revenue := case when new.b2b_rate is null then null else round(new.total_hours * new.b2b_rate, 2) end;
    new.profit := case when new.worker_cost is null or new.client_revenue is null then null
                       else new.client_revenue - new.worker_cost end;
  end if;

  if new.approval_status = 'rejected' and (tg_op = 'INSERT' or old.approval_status <> 'rejected') and not v_admin then
    raise exception 'Satnicu može da odbije samo admin' using errcode = '42501';
  end if;

  if new.approval_status = 'approved' and (tg_op = 'INSERT' or old.approval_status <> 'approved') then
    if not v_admin then
      raise exception 'Satnicu može da odobri samo admin' using errcode = '42501';
    end if;
    if coalesce(new.b2c_rate, 0) <= 0 or coalesce(new.b2b_rate, 0) <= 0 then
      raise exception 'Satnica nema tarifu radnika ili klijenta (ili je 0) i ne može da se odobri' using errcode = 'check_violation';
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

-- Ručno upisan projekat (bez veze) — i dalje jedan red po radniku, nazivu i nedelji.
create unique index if not exists timesheets_one_per_week_manual
  on public.timesheets (employee_id, lower(btrim(project)), week_start)
  where project_id is null and project is not null;

-- ───────────── projekti ─────────────
-- Isti naziv kod istog klijenta (ili bez klijenta) samo jednom; različiti klijenti smeju isti naziv.
create unique index if not exists projects_name_client_key
  on public.projects (lower(btrim(name)), coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ───────────── zaključavanje meseca ─────────────
create or replace function public.lock_month(p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_open integer;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da zaključa mesec' using errcode = '42501';
  end if;
  if exists (select 1 from public.month_locks where month = v_month) then
    raise exception 'Mesec % je već zaključan', to_char(v_month, 'MM.YYYY') using errcode = 'check_violation';
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

-- ───────────── zadaci ─────────────
-- Kad se radnik obriše, baza skida dodelu (on delete set null); ime za prikaz mora da ode zajedno sa njom.
create or replace function public.tasks_clear_assignee_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.assigned_to is null then
    new.assigned_to_name := null;
  end if;
  return new;
end $$;

create trigger tasks_clear_assignee_name
  before insert or update of assigned_to, assigned_to_name on public.tasks
  for each row execute function public.tasks_clear_assignee_name();

update public.tasks set assigned_to_name = null where assigned_to is null and assigned_to_name is not null;

-- ───────────── poslednji admin ─────────────
-- Brisanje naloga (npr. u Studiju) briše i profil; poslednji aktivan admin ne sme da nestane ni tako.
create or replace function public.guard_last_admin_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.role = 'admin' and old.active
     and not exists (select 1 from public.profiles p where p.id <> old.id and p.role = 'admin' and p.active) then
    raise exception 'Mora da ostane bar jedan aktivan admin' using errcode = 'check_violation';
  end if;
  return old;
end $$;

create trigger profiles_guard_last_admin_delete
  before delete on public.profiles
  for each row execute function public.guard_last_admin_delete();

revoke execute on function public.tasks_clear_assignee_name(), public.guard_last_admin_delete() from public, anon;
