-- P1 iz pregleda novčane logike (QA-FINDINGS.md, 14.11.2026 veče): angažman, isplata ispod nule / ispod najniže
-- osnovice i novi nalozi.
--  1. Angažman radnika (employment_history: zaposlen ↔ preko podizvođača, dobavljač, datumi) određuje porez,
--     doprinose i kome se plaća (D8, D17) — to je novčana odluka, pa ga upisuje, menja i briše samo admin.
--     Operater ga i dalje vidi (profil radnika). Menjaju se samo pravila (RLS), tabela i podaci ostaju.
--  2. Pre odobravanja obračuna (payroll_run_problems) baza odbija i:
--      * listić sa isplatom manjom od nule;
--      * zaposlenog sa bruto satnicom čiji je bruto ispod najniže osnovice (srazmerno udelu radnog vremena):
--        doprinosi na punu najnižu osnovicu daju premalu ili negativnu isplatu, a pravilo za deo meseca
--        (srazmerna osnovica) mora da potvrdi knjigovođa — do tada nema isplate (D7, D17).
--     Najnižu osnovicu baza računa iz parametara i kursa obračuna (isto kao paramsInEur + fromGross u
--     src/lib/payroll), ne iz upozorenja koja pošalje ekran. Isti primeri: src/lib/payroll/payrollProblems.test.js i
--     supabase/tests/09_angazman_isplata_nalozi.test.sql. Ostale provere su iste kao u 20261114200000.
--  3. Nov nalog je neaktivan operater dok ga admin ne aktivira; samo prvi nalog u sistemu (nema nijednog profila)
--     postaje aktivan admin, kao i do sada. Postojeći profili se ne diraju (bez UPDATE — uloga i status ostaju).
-- Postojeći podaci se ne diraju.

-- ═════════════════════════════ 1. angažman: čita osoblje, menja samo admin ═════════════════════════════
drop policy if exists employment_history_staff on public.employment_history;
drop policy if exists employment_history_read on public.employment_history;
drop policy if exists employment_history_admin_write on public.employment_history;
create policy employment_history_read on public.employment_history for select to authenticated
  using ((select public.is_staff()));
create policy employment_history_admin_write on public.employment_history for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ═════════════════════════════ 2. obračun: isplata < 0 i bruto ispod najniže osnovice ═════════════════════════════

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
    union all
    -- Isplata manja od nule se nikad ne odobrava (QA 14.11.2026, P1).
    select 20, format('%s: isplata (%s) je negativna — iznos manji od nule se ne isplaćuje', n.name, s.payout)
    from slips s join names n on n.id = s.employee_id
    where s.payout < 0
    union all
    -- Bruto satnica ispod najniže osnovice (srazmerno udelu radnog vremena, kao fromGross): doprinosi na punu
    -- najnižu osnovicu daju premalu ili negativnu isplatu. Pravilo za deo meseca potvrđuje knjigovođa (D7, D17).
    select 21, format('%s: zarada po bruto satnici (%s) je ispod najniže osnovice (%s) — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate',
                      n.name, s.bruto, round(x.min_base, 2))
    from slips s join names n on n.id = s.employee_id
    cross join lateral (
      select (v_run.params ->> 'min_base_rsd')::numeric / v_run.eur_rsd_rate * s.work_fraction as min_base
    ) x
    where s.engagement_type = 'direct_employee' and s.rate_basis = 'bruto' and s.bruto > 0 and s.bruto < x.min_base
  )
  select coalesce(array_agg(p.msg order by p.ord, p.msg), '{}') into v_out from problems p;
  return v_out;
end $$;

revoke execute on function public.payroll_run_problems(uuid) from public, anon;
grant execute on function public.payroll_run_problems(uuid) to authenticated;

-- ═════════════════════════════ 3. novi nalog: neaktivan, osim prvog admina ═════════════════════════════
-- Pre: svaki nov nalog je odmah bio aktivan operater (čita radnike, dokumenta i satnice), a nalog na praznoj bazi
-- admin. Nov Supabase projekat ima registraciju uključenu podrazumevano — ko god se registruje, čeka admina.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_first boolean;
begin
  -- Dva istovremena prva naloga ne smeju oba da postanu admin: provera i upis idu jedan za drugim.
  perform pg_advisory_xact_lock(hashtext('public.handle_new_user'));
  v_first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    case when v_first then 'admin' else 'operater' end,
    v_first);
  return new;
end $$;

-- Profil upisan mimo handle_new_user je takođe neaktivan dok ga admin ne aktivira. Menja se samo podrazumevana
-- vrednost za nove redove; postojeći profili zadržavaju ulogu i status.
alter table public.profiles alter column active set default false;
