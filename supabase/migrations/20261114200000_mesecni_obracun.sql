-- Faza 3: mesečni obračun (D17). Stranica „Mesečni obračun" pravi platne listiće iz odobrenih satnica preko
-- src/lib/payroll (computeWorkerMonth, payrollMonth.js); baza čuva, proverava i zaključava.
--  * Tok: mesec se zaključa (lock_month) → admin unese kurs EUR/RSD → nacrt (save_payroll_draft, može ponovo) →
--    odobren (approve_payroll_run) → isplaćen (mark_payroll_paid). Sve samo admin (RLS + provere u funkcijama).
--  * Bez kursa nema obračuna (D2): ni nacrt ni odobravanje — poruka umesto tihog podrazumevanog kursa.
--  * Parametre (porez, doprinosi, osnovice u RSD) u obračun upisuje baza iz payroll_params: važi red sa najkasnijim
--    valid_from do prvog dana meseca (isto pravilo kao paramsRowForMonth u params.js). Nacrt koji je ekran računao sa
--    drugim parametrima se odbija.
--  * Promena kursa ili parametara nacrta briše njegove listiće — listić nikad ne ostaje izračunat sa starim kursom.
--  * Odobren i isplaćen obračun, njegovi listići i raspodela po projektima su nepromenljivi (i premeštanje listića
--    u drugi obračun je zabranjeno). Mesec sa obračunom ne može da se otključa (unlock_month, postojeće pravilo).
--  * Pre odobravanja baza proverava (payroll_run_problems): kurs, zaključan mesec, odobrene satnice bez snimka tarifa
--    (odobrene pre Faze 2), listić za svakog radnika sa odobrenim satima, sate po radniku i projektu prema danima
--    satnica u tom mesecu (timesheet_days — nedelja preko granice meseca se deli po danu), zbirove listića
--    (sati, zarada, raspodela troška = bruto 2), angažman, osnovu satnice, i da su bruto/neto/porez/doprinosi
--    međusobno usklađeni. Iznose po vrsti sati i porez računa samo src/lib/payroll (D11) — baza ih ne računa ponovo.
-- Postojeći podaci se ne diraju.

-- ───────────── parametri za mesec ─────────────
create or replace function public.payroll_params_for_month(p_month date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', pp.id, 'valid_from', pp.valid_from, 'tax_rate', pp.tax_rate, 'non_taxable_rsd', pp.non_taxable_rsd,
    'min_base_rsd', pp.min_base_rsd, 'max_base_rsd', pp.max_base_rsd, 'emp_pio', pp.emp_pio, 'emp_health', pp.emp_health,
    'emp_unemployment', pp.emp_unemployment, 'er_pio', pp.er_pio, 'er_health', pp.er_health, 'source_note', pp.source_note)
  from public.payroll_params pp
  where pp.valid_from <= date_trunc('month', p_month)::date
  order by pp.valid_from desc
  limit 1
$$;

-- ───────────── obračun (payroll_runs) ─────────────
create or replace function public.guard_payroll_run() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_workflow boolean := coalesce(current_setting('app.payroll_workflow', true), '') = 'on';
  v_params jsonb;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Odobren ili isplaćen obračun ne može da se obriše' using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (old.status <> 'draft' or new.status <> old.status) then
    -- Odobren/isplaćen obračun menjaju samo approve_payroll_run i mark_payroll_paid (samo status i datume).
    if not v_workflow then
      raise exception 'Odobren obračun ne može da se menja; status se menja samo odobravanjem/isplatom'
        using errcode = 'check_violation';
    end if;
    new.updated_date := now();
    return new;
  end if;

  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Novi obračun mora biti nacrt' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.month <> old.month then
    raise exception 'Mesec obračuna ne može da se menja' using errcode = 'check_violation';
  end if;
  if not public.month_is_locked(new.month) then
    raise exception 'Obračun može da se napravi samo za zaključan mesec' using errcode = 'check_violation';
  end if;
  -- Pre provere kolone (not null / > 0), da poruka bude jasna (D2: nikakav podrazumevani kurs).
  if new.eur_rsd_rate is null or new.eur_rsd_rate <= 0 then
    raise exception 'Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec' using errcode = 'check_violation';
  end if;

  -- Parametre upisuje baza (ono što pošalje ekran se ignoriše).
  v_params := public.payroll_params_for_month(new.month);
  if v_params is null then
    raise exception 'Nema obračunskih parametara (porez i doprinosi) za mesec %', to_char(new.month, 'MM.YYYY')
      using errcode = 'check_violation';
  end if;
  new.params := v_params;

  if tg_op = 'UPDATE' and (new.eur_rsd_rate is distinct from old.eur_rsd_rate or new.params is distinct from old.params) then
    -- Listići su računati sa starim kursom ili parametrima — nacrt se prazni i pravi ponovo.
    delete from public.payslips where run_id = old.id;
  end if;
  new.updated_date := now();
  return new;
end $$;

-- ───────────── listići i raspodela (payslips, payslip_projects) ─────────────
-- Proverava i stari i novi obračun: listić odobrenog obračuna ne može ni da se prebaci u nacrt.
create or replace function public.guard_payslip() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_payslips uuid[] := '{}';
  v_runs uuid[] := '{}';
begin
  if tg_table_name = 'payslips' then
    if tg_op <> 'INSERT' then v_runs := v_runs || old.run_id; end if;
    if tg_op <> 'DELETE' then v_runs := v_runs || new.run_id; end if;
  else
    if tg_op <> 'INSERT' then v_payslips := v_payslips || old.payslip_id; end if;
    if tg_op <> 'DELETE' then v_payslips := v_payslips || new.payslip_id; end if;
    select coalesce(array_agg(ps.run_id), '{}') into v_runs from public.payslips ps where ps.id = any (v_payslips);
  end if;
  -- Ako obračun (ili listić) više ne postoji, brisanje dolazi kaskadno iz brisanja nacrta — dozvoljeno.
  if exists (select 1 from public.payroll_runs r where r.id = any (v_runs) and r.status <> 'draft') then
    raise exception 'Platni listić odobrenog obračuna ne može da se menja' using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- ───────────── provera obračuna pre odobravanja ─────────────
-- Vraća spisak problema (prazan = obračun je usklađen). Isto što proverava approve_payroll_run; ekran ga prikazuje.
create or replace function public.payroll_run_problems(p_run uuid) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_run public.payroll_runs;
  v_next date;
  v_out text[];
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da vidi obračun' using errcode = '42501';
  end if;
  select * into v_run from public.payroll_runs where id = p_run;
  if v_run.id is null then
    raise exception 'Obračun ne postoji' using errcode = 'check_violation';
  end if;
  v_next := (v_run.month + interval '1 month')::date;

  with days as (
    -- Dani odobrenih satnica koji padaju u mesec (nedelja preko granice meseca se deli po danu).
    select t.id as timesheet_id, t.employee_id, t.project_id, t.week_start, t.rate_snapshot, d.work_date, d.hours
    from public.timesheets t, lateral public.timesheet_days(t) d
    where t.approval_status = 'approved' and d.work_date >= v_run.month and d.work_date < v_next
  ),
  approved as (select employee_id, project_id, sum(hours) as hours from days group by employee_id, project_id),
  slips as (select ps.* from public.payslips ps where ps.run_id = p_run),
  alloc as (
    select pp.payslip_id, s.employee_id, pp.project_id, pp.hours, pp.worker_amount, pp.labor_cost
    from public.payslip_projects pp join slips s on s.id = pp.payslip_id
  ),
  sums as (
    select s.id, coalesce(sum(a.hours), 0) as hours, coalesce(sum(a.worker_amount), 0) as worker_amount,
           coalesce(sum(a.labor_cost), 0) as labor_cost
    from slips s left join alloc a on a.payslip_id = s.id
    group by s.id
  ),
  names as (select e.id, btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as name from public.employees e),
  problems (ord, msg) as (
    select 1, 'Obračun nema kurs EUR/RSD — bez kursa nema obračuna'
    where not coalesce(v_run.eur_rsd_rate > 0, false)
    union all
    select 2, format('Mesec %s nije zaključan', to_char(v_run.month, 'MM.YYYY'))
    where not public.month_is_locked(v_run.month)
    union all
    select 3, 'Obračun nema nijedan platni listić'
    where not exists (select 1 from slips)
    union all
    -- Satnica odobrena pre Faze 2 nema snimak tarifa i koeficijenata — ne pogađa se (D5, D10).
    select 4, format('%s, nedelja od %s: odobrena satnica nema snimak tarifa i koeficijenata — vratite je u nacrt i odobrite ponovo',
                     n.name, to_char(x.week_start, 'DD.MM.YYYY'))
    from (select distinct d.employee_id, d.week_start, d.timesheet_id from days d
          where d.rate_snapshot is null or jsonb_typeof(d.rate_snapshot -> 'lines') is distinct from 'array') x
    join names n on n.id = x.employee_id
    union all
    select 5, format('%s: nema platnog listića', n.name)
    from (select distinct employee_id from approved) h join names n on n.id = h.employee_id
    where not exists (select 1 from slips s where s.employee_id = h.employee_id)
    union all
    select 6, format('%s: platni listić bez odobrenih sati u mesecu', n.name)
    from slips s join names n on n.id = s.employee_id
    where not exists (select 1 from approved h where h.employee_id = s.employee_id)
    union all
    select 7, format('%s: sati na projektu %s (%s) ≠ odobreni sati u mesecu (%s)', n.name,
                     coalesce(p.name, x.project_id::text), trim_scale(x.slip_hours), trim_scale(x.approved_hours))
    from (
      select coalesce(a.employee_id, h.employee_id) as employee_id, coalesce(a.project_id, h.project_id) as project_id,
             coalesce(a.hours, 0) as slip_hours, coalesce(h.hours, 0) as approved_hours
      from alloc a
      full join (select ap.* from approved ap where exists (select 1 from slips s where s.employee_id = ap.employee_id)) h
        on h.employee_id = a.employee_id and h.project_id = a.project_id
    ) x
    join names n on n.id = x.employee_id
    left join public.projects p on p.id = x.project_id
    where x.slip_hours <> x.approved_hours
    union all
    select 8, format('%s: sati na listiću (%s) ≠ zbir po projektima (%s)', n.name, trim_scale(s.total_hours), trim_scale(u.hours))
    from slips s join sums u on u.id = s.id join names n on n.id = s.employee_id
    where s.total_hours <> u.hours
    union all
    select 9, format('%s: raspodela po projektima (%s) ≠ ukupan trošak (%s)', n.name, u.labor_cost, s.total_cost)
    from slips s join sums u on u.id = s.id join names n on n.id = s.employee_id
    where s.total_cost <> u.labor_cost
    union all
    select 10, format('%s: zarada po projektima (%s) ≠ osnovica listića (%s)', n.name, u.worker_amount, s.basis_amount)
    from slips s join sums u on u.id = s.id join names n on n.id = s.employee_id
    where s.basis_amount <> u.worker_amount
    union all
    -- Angažman (zaposlen / preko podizvođača) svakog dana sa satima mora biti onaj sa listića.
    select 11, format('%s: angažman na listiću ne odgovara angažmanu radnika za %s', n.name, to_char(x.work_date, 'DD.MM.YYYY'))
    from (
      select distinct on (s.id) s.id, s.employee_id, d.work_date
      from slips s
      join days d on d.employee_id = s.employee_id
      left join public.employment_history eh on eh.employee_id = d.employee_id and eh.start_date <= d.work_date
        and (eh.end_date is null or eh.end_date >= d.work_date)
      where eh.id is null or eh.engagement_type <> s.engagement_type or eh.vendor_id is distinct from s.vendor_id
      order by s.id, d.work_date
    ) x
    join names n on n.id = x.employee_id
    union all
    select 12, format('%s: osnova satnice ili udeo radnog vremena na listiću ne odgovara profilu radnika', n.name)
    from slips s join names n on n.id = s.employee_id
    left join public.employee_private ep on ep.employee_id = s.employee_id
    where s.engagement_type = 'direct_employee'
      and (s.rate_basis <> coalesce(ep.rate_basis, 'neto') or s.work_fraction <> coalesce(ep.work_fraction, 1))
    union all
    -- Zaposleni: bruto, neto, porez i doprinosi međusobno usklađeni (formulu računa src/lib/payroll).
    select 13, format('%s: nepotpun obračun zarade (bruto, neto, porez ili doprinosi fale)', n.name)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee'
      and (s.bruto is null or s.neto is null or s.tax is null or s.emp_pio is null or s.emp_health is null
           or s.emp_unemployment is null or s.er_pio is null or s.er_health is null)
    union all
    select 14, format('%s: neto (%s) ≠ bruto − doprinosi radnika − porez (%s)', n.name, s.neto,
                      s.bruto - s.emp_pio - s.emp_health - s.emp_unemployment - s.tax)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee' and s.neto <> s.bruto - s.emp_pio - s.emp_health - s.emp_unemployment - s.tax
    union all
    select 15, format('%s: bruto 2 (%s) ≠ bruto + doprinosi poslodavca (%s)', n.name, s.total_cost, s.bruto + s.er_pio + s.er_health)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee' and s.total_cost <> s.bruto + s.er_pio + s.er_health
    union all
    select 16, format('%s: isplata (%s) ≠ neto (%s)', n.name, s.payout, s.neto)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee' and s.payout <> s.neto
    union all
    select 17, format('%s: bruto (%s) ≠ zarada po bruto satnici (%s)', n.name, s.bruto, s.basis_amount)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee' and s.rate_basis = 'bruto' and s.bruto <> s.basis_amount
    union all
    select 18, format('%s: neto (%s) ≠ zarada po neto satnici (%s)', n.name, s.neto, s.basis_amount)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'direct_employee' and s.rate_basis = 'neto' and s.neto <> s.basis_amount
      and not ('neto_nije_tacan' = any (s.warnings) and abs(s.neto - s.basis_amount) <= 0.01)
    union all
    -- Podizvođač: plaćamo iznos sati, bez poreza i doprinosa sa naše strane (D8).
    select 19, format('%s: podizvođač — isplata i trošak moraju biti jednaki zaradi (%s), bez poreza i doprinosa', n.name, s.basis_amount)
    from slips s join names n on n.id = s.employee_id
    where s.engagement_type = 'subcontractor_worker'
      and (s.payout <> s.basis_amount or s.total_cost <> s.basis_amount
           or coalesce(s.bruto, s.neto, s.tax, s.emp_pio, s.emp_health, s.emp_unemployment, s.er_pio, s.er_health) is not null)
  )
  select coalesce(array_agg(p.msg order by p.ord, p.msg), '{}') into v_out from problems p;
  return v_out;
end $$;

-- ───────────── nacrt: atomski upis listića ─────────────
-- Ekran šalje kurs, parametre sa kojima je računao i listiće (src/lib/payroll/payrollMonth.js → draftPayload).
-- Postojeći listići nacrta se brišu i upisuju novi u istoj transakciji; odobren/isplaćen obračun se ne generiše ponovo.
create or replace function public.save_payroll_draft(p_month date, p_eur_rsd_rate numeric, p_params jsonb, p_payslips jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_params jsonb;
  v_run public.payroll_runs;
  v_slip jsonb;
  v_payslip uuid;
  c text;
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da pravi obračun' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Nedostaje mesec obračuna' using errcode = 'check_violation';
  end if;
  if not public.month_is_locked(v_month) then
    raise exception 'Obračun može da se napravi samo za zaključan mesec' using errcode = 'check_violation';
  end if;
  if p_eur_rsd_rate is null or p_eur_rsd_rate <= 0 then
    raise exception 'Bez kursa EUR/RSD nema obračuna — unesite kurs za mesec' using errcode = 'check_violation';
  end if;
  v_params := public.payroll_params_for_month(v_month);
  if v_params is null then
    raise exception 'Nema obračunskih parametara (porez i doprinosi) za mesec %', to_char(v_month, 'MM.YYYY')
      using errcode = 'check_violation';
  end if;
  -- Ekran je računao sa parametrima koje je pročitao; moraju biti baš oni koji važe za mesec.
  if p_params is null or (p_params ->> 'valid_from')::date is distinct from (v_params ->> 'valid_from')::date then
    raise exception 'Obračunski parametri za mesec su se promenili — osvežite stranicu i generišite ponovo' using errcode = 'check_violation';
  end if;
  foreach c in array array['tax_rate', 'non_taxable_rsd', 'min_base_rsd', 'max_base_rsd', 'emp_pio', 'emp_health',
                           'emp_unemployment', 'er_pio', 'er_health'] loop
    if (p_params ->> c)::numeric is distinct from (v_params ->> c)::numeric then
      raise exception 'Obračunski parametri za mesec su se promenili — osvežite stranicu i generišite ponovo' using errcode = 'check_violation';
    end if;
  end loop;

  select * into v_run from public.payroll_runs where month = v_month for update;
  if v_run.id is null then
    insert into public.payroll_runs (month, eur_rsd_rate, params) values (v_month, p_eur_rsd_rate, v_params) returning * into v_run;
  elsif v_run.status <> 'draft' then
    raise exception 'Odobren obračun ne može ponovo da se generiše' using errcode = 'check_violation';
  else
    update public.payroll_runs set eur_rsd_rate = p_eur_rsd_rate where id = v_run.id;
  end if;

  delete from public.payslips where run_id = v_run.id;
  for v_slip in select s.value from jsonb_array_elements(coalesce(p_payslips, '[]'::jsonb)) as s(value) loop
    insert into public.payslips (run_id, employee_id, employee_name, engagement_type, vendor_id, rate_basis, work_fraction,
      total_hours, hours_by_type, basis_amount, bruto, neto, tax, emp_pio, emp_health, emp_unemployment, er_pio, er_health,
      total_cost, payout, warnings)
    values (v_run.id, (v_slip ->> 'employee_id')::uuid, v_slip ->> 'employee_name', v_slip ->> 'engagement_type',
      nullif(v_slip ->> 'vendor_id', '')::uuid, v_slip ->> 'rate_basis', (v_slip ->> 'work_fraction')::numeric,
      (v_slip ->> 'total_hours')::numeric, coalesce(v_slip -> 'hours_by_type', '{}'::jsonb), (v_slip ->> 'basis_amount')::numeric,
      (v_slip ->> 'bruto')::numeric, (v_slip ->> 'neto')::numeric, (v_slip ->> 'tax')::numeric,
      (v_slip ->> 'emp_pio')::numeric, (v_slip ->> 'emp_health')::numeric, (v_slip ->> 'emp_unemployment')::numeric,
      (v_slip ->> 'er_pio')::numeric, (v_slip ->> 'er_health')::numeric,
      (v_slip ->> 'total_cost')::numeric, (v_slip ->> 'payout')::numeric,
      array(select w.value from jsonb_array_elements_text(coalesce(v_slip -> 'warnings', '[]'::jsonb)) as w(value)))
    returning id into v_payslip;

    insert into public.payslip_projects (payslip_id, project_id, hours, worker_amount, labor_cost, revenue)
    select v_payslip, (p.value ->> 'project_id')::uuid, (p.value ->> 'hours')::numeric, (p.value ->> 'worker_amount')::numeric,
           (p.value ->> 'labor_cost')::numeric, (p.value ->> 'revenue')::numeric
    from jsonb_array_elements(coalesce(v_slip -> 'projects', '[]'::jsonb)) as p(value);
  end loop;

  return v_run.id;
end $$;

-- ───────────── odobravanje ─────────────
create or replace function public.approve_payroll_run(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.payroll_runs;
  v_problems text[];
begin
  if not public.is_admin() then
    raise exception 'Samo admin može da odobri obračun' using errcode = '42501';
  end if;
  select * into v_run from public.payroll_runs where id = p_run for update;
  if v_run.id is null or v_run.status <> 'draft' then
    raise exception 'Obračun ne postoji ili nije nacrt' using errcode = 'check_violation';
  end if;

  v_problems := public.payroll_run_problems(p_run);
  if cardinality(v_problems) > 0 then
    raise exception 'Obračun nije usklađen: %', array_to_string(v_problems, '; ') using errcode = 'check_violation';
  end if;

  perform set_config('app.payroll_workflow', 'on', true);
  update public.payroll_runs set status = 'approved', approved_by = auth.uid(), approved_date = now() where id = p_run;
  perform set_config('app.payroll_workflow', 'off', true);
end $$;

-- ───────────── prava ─────────────
revoke execute on function public.payroll_params_for_month(date) from public, anon, authenticated;
revoke execute on function public.payroll_run_problems(uuid), public.save_payroll_draft(date, numeric, jsonb, jsonb)
  from public, anon;
grant execute on function public.payroll_run_problems(uuid), public.save_payroll_draft(date, numeric, jsonb, jsonb)
  to authenticated;
