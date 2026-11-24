-- Teamora: prava nad postojećim tabelama po matrici §4 (docs/TEAMORA-DATA-MODEL.md, spec §15.02/§15.03, D30 K1/K2).
-- Do sada: „osoblje" (admin + operater) čita i menja operativne tabele, novac i podešavanja samo admin (D3).
-- Sada: svaka tabela proverava pravo iz kataloga (has_permission) i vidljivost projekta (can_see_project).
--
-- Bezbedno za produkciju: menjaju se samo politike i provere prava u RPC-ovima; podaci se ne diraju.
-- R7: HR (bivši operater) i dalje čita i menja radnike, dokumenta, projekte, dodele, satnice, odsustva, dobavljače,
-- kao i pre; i dalje ne vidi tarife, troškove ni obračun. Novo za HR po spec-u: lični podaci radnika (employee_private).
-- Politike tabela drugih traka ovde se ne diraju: schedules (T-G), notifications (W2-H), storage.objects (T-D);
-- leave_requests ostaje „osoblje" (guard odobravanja je W2-L); kolone satnice (iznosi) maskira T-A2.

-- ═════════════════════════════ pomoćno: provera prava sa jasnom porukom ═════════════════════════════
-- Poruka nosi kod prava („Nemate pravo „payroll.manage""), src/api/errors.js je prevodi po pravu.
create or replace function public.require_permission(p_code text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_permission(p_code) then
    raise exception 'Nemate pravo „%"', p_code using errcode = '42501';
  end if;
end $$;
revoke execute on function public.require_permission(text) from public, anon, authenticated;

-- Politike tabele se brišu i prave iznova (idempotentno i bez ostataka starih „_staff"/„_admin" politika).
create or replace function public.reset_table_policies(p_table text) returns void
language plpgsql set search_path = '' as $$
declare
  r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy %I on public.%I', r.policyname, p_table);
  end loop;
end $$;
revoke execute on function public.reset_table_policies(text) from public, anon, authenticated;

-- read: ko čita; write: ko upisuje/menja/briše (null = niko preko API-ja).
create or replace function public.apply_table_policies(p_table text, p_read text, p_write text) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.reset_table_policies(p_table);
  execute format('alter table public.%I enable row level security', p_table);
  if p_read is not null then
    execute format('create policy %I on public.%I for select to authenticated using (%s)', p_table || '_read', p_table, p_read);
  end if;
  if p_write is not null then
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', p_table || '_insert', p_table, p_write);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   p_table || '_update', p_table, p_write, p_write);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', p_table || '_delete', p_table, p_write);
  end if;
end $$;
revoke execute on function public.apply_table_policies(text, text, text) from public, anon, authenticated;

-- ═════════════════════════════ politike po §4 ═════════════════════════════
do $$
declare
  staff constant text := '(select public.is_staff())';
  t text;
begin
  -- Radnici: svi čitaju, menja HR (employees.manage).
  perform public.apply_table_policies('employees', staff, '(select public.has_permission(''employees.manage''))');
  -- Lični podaci (JMBG, ID, banka): HR čita i menja, Finance čita, PM ne vidi.
  perform public.apply_table_policies('employee_private',
    '(select public.has_permission(''employees.private.view''))',
    '(select public.has_permission(''employees.private.edit''))');
  -- Angažovanje (payee): svi čitaju, menja Finance (engagement.manage).
  perform public.apply_table_policies('employment_history', staff, '(select public.has_permission(''engagement.manage''))');
  -- Dobavljači: svi čitaju; HR (employees.manage) i Finance (engagement.manage) menjaju.
  perform public.apply_table_policies('vendors', staff,
    '((select public.has_permission(''employees.manage'')) or (select public.has_permission(''engagement.manage'')))');
  -- Klijenti: svi čitaju, menja Finance (billing.manage). Kolonu default_b2b_rate maskira W2-F.
  perform public.apply_table_policies('clients', staff, '(select public.has_permission(''billing.manage''))');
  -- Dokumenta (metapodaci): svi čitaju, menja HR (documents.manage). Fajlove štiti storage (T-D).
  perform public.apply_table_policies('documents', staff, '(select public.has_permission(''documents.manage''))');
  -- Odsustva, prisustvo, zadaci: osoblje kao do sada (odobravanje proverava W2-L).
  perform public.apply_table_policies('leave_requests', staff, staff);
  perform public.apply_table_policies('attendance_records', staff, staff);
  perform public.apply_table_policies('tasks', staff, staff);

  -- Projekti: vidljivi projekti; menja projects.manage (PM samo svoje).
  perform public.apply_table_policies('projects', 'public.can_see_project(id)',
    '(select public.has_permission(''projects.manage'')) and public.can_see_project(id)');
  -- Dodele: vidljivi projekti; menja assignments.manage.
  perform public.apply_table_policies('project_assignments', staff || ' and public.can_see_project(project_id)',
    '(select public.has_permission(''assignments.manage'')) and public.can_see_project(project_id)');
  -- Tarife: B2B (revenue) uz rates.view_b2b, B2C (cost) uz rates.view_b2c; menja rates.manage.
  perform public.apply_table_policies('rates',
    '(project_id is null or public.can_see_project(project_id)) and case kind '
      || 'when ''revenue'' then (select public.has_permission(''rates.view_b2b'')) '
      || 'when ''cost'' then (select public.has_permission(''rates.view_b2c'')) else false end',
    '(select public.has_permission(''rates.manage'')) and (project_id is null or public.can_see_project(project_id))');
  -- Troškovi projekta: costs.view / costs.manage na vidljivim projektima.
  perform public.apply_table_policies('project_costs',
    '(select public.has_permission(''costs.view'')) and public.can_see_project(project_id)',
    '(select public.has_permission(''costs.manage'')) and public.can_see_project(project_id)');
  -- Satnice (redovi): vidljivi projekti; upis uz timesheets.edit/approve/correct (prelaze statusa proverava guard).
  perform public.apply_table_policies('timesheets', staff || ' and public.can_see_project(project_id)',
    '((select public.has_permission(''timesheets.edit'')) or (select public.has_permission(''timesheets.approve''))'
      || ' or (select public.has_permission(''timesheets.correct''))) and public.can_see_project(project_id)');

  -- Podešavanja: svi čitaju (ekrani ih koriste), menja settings.manage.
  foreach t in array array['hour_types', 'work_rules', 'holidays', 'department_configs', 'cost_categories'] loop
    perform public.apply_table_policies(t, staff, '(select public.has_permission(''settings.manage''))');
  end loop;
  -- Podaci firme i jezik/valuta: čita svaki prijavljen (i pre aktivacije, za prikaz), menja settings.manage.
  foreach t in array array['company_settings', 'app_settings'] loop
    perform public.apply_table_policies(t, 'true', '(select public.has_permission(''settings.manage''))');
  end loop;
  perform public.apply_table_policies('email_templates', '(select public.has_permission(''settings.manage''))',
    '(select public.has_permission(''settings.manage''))');

  -- Zaključani meseci: svi čitaju; upis samo kroz lock_month/unlock_month.
  perform public.apply_table_policies('month_locks', staff, null);
  -- Srpski mesečni obračun (K4, R10): payroll.view / payroll.manage.
  foreach t in array array['payroll_records', 'payroll_params', 'payroll_runs', 'payslips', 'payslip_projects'] loop
    perform public.apply_table_policies(t, '(select public.has_permission(''payroll.view''))',
      '(select public.has_permission(''payroll.manage''))');
  end loop;
end $$;

-- ═════════════════════════════ profili (Users) ═════════════════════════════
select public.reset_table_policies('profiles');
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_permission('users.manage')));
create policy profiles_update on public.profiles for update to authenticated
  using ((select public.has_permission('users.manage'))) with check ((select public.has_permission('users.manage')));

-- Ulogu admin daje i oduzima samo admin; nalog admina menja samo admin; korisnik bez admin uloge ne menja sebi
-- ulogu, status ni opseg projekata (users.manage dodeljen override-om nije prečica do admina).
create or replace function public.guard_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if (new.role, new.active, new.project_scope) is not distinct from (old.role, old.active, old.project_scope) then
    return new;
  end if;
  if old.role = 'admin' or new.role = 'admin' then
    raise exception 'Ulogu admin i nalog admina menja samo admin' using errcode = '42501';
  end if;
  if new.id = auth.uid() then
    raise exception 'Svoju ulogu, status i opseg projekata ne možete da menjate' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_profile_change() from public, anon, authenticated;
drop trigger if exists profiles_guard_change on public.profiles;
create trigger profiles_guard_change before update on public.profiles
  for each row execute function public.guard_profile_change();

-- Dodela projekata i prava: ne nad sopstvenim nalogom (osim admina).
create or replace function public.guard_self_access_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if auth.uid() is not null and v_user = auth.uid() and not public.is_admin() then
    raise exception 'Svoja prava i projekte ne možete da menjate' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.guard_self_access_change() from public, anon, authenticated;
drop trigger if exists user_permission_overrides_guard_self on public.user_permission_overrides;
create trigger user_permission_overrides_guard_self before insert or update or delete on public.user_permission_overrides
  for each row execute function public.guard_self_access_change();
drop trigger if exists user_project_access_guard_self on public.user_project_access;
create trigger user_project_access_guard_self before insert or update or delete on public.user_project_access
  for each row execute function public.guard_self_access_change();

-- ═════════════════════════════ RPC-ovi: admin → pravo ═════════════════════════════
-- Srpski obračun i zaključavanje meseca prelaze sa „samo admin" na payroll.* (R10), vraćanje podrazumevanih
-- kategorija troškova na settings.manage. Telo funkcije se ne prepisuje ručno: menja se samo provera na početku
-- (isti tekst u svim verzijama), pa ostatak logike ostaje tačno kakav je bio. Ponovno pokretanje ne menja ništa.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, x.old_check, x.new_check
      from (values
        ('lock_month', 'if not public.is_admin() then
    raise exception ''Samo admin može da zaključa mesec'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.manage'') then
    raise exception ''Nemate pravo „payroll.manage"'' using errcode = ''42501'';'),
        ('unlock_month', 'if not public.is_admin() then
    raise exception ''Samo admin može da otključa mesec'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.manage'') then
    raise exception ''Nemate pravo „payroll.manage"'' using errcode = ''42501'';'),
        ('save_payroll_draft', 'if not public.is_admin() then
    raise exception ''Samo admin može da pravi obračun'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.manage'') then
    raise exception ''Nemate pravo „payroll.manage"'' using errcode = ''42501'';'),
        ('approve_payroll_run', 'if not public.is_admin() then
    raise exception ''Samo admin može da odobri obračun'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.manage'') then
    raise exception ''Nemate pravo „payroll.manage"'' using errcode = ''42501'';'),
        ('mark_payroll_paid', 'if not public.is_admin() then
    raise exception ''Samo admin može da označi isplatu'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.manage'') then
    raise exception ''Nemate pravo „payroll.manage"'' using errcode = ''42501'';'),
        ('payroll_run_problems', 'if not public.is_admin() then
    raise exception ''Samo admin može da vidi obračun'' using errcode = ''42501'';',
         'if not public.has_permission(''payroll.view'') then
    raise exception ''Nemate pravo „payroll.view"'' using errcode = ''42501'';'),
        ('restore_default_cost_categories', 'if not public.is_admin() then
    raise exception ''Podrazumevane kategorije troškova vraća samo admin'' using errcode = ''42501'';',
         'if not public.has_permission(''settings.manage'') then
    raise exception ''Nemate pravo „settings.manage"'' using errcode = ''42501'';')
      ) as x(fn, old_check, new_check)
      join pg_proc p on p.proname = x.fn and p.pronamespace = 'public'::regnamespace
  loop
    v_def := pg_get_functiondef(r.oid);
    if position(r.old_check in v_def) > 0 then
      v_new := replace(v_def, r.old_check, r.new_check);
      execute v_new;
    elsif position(r.new_check in v_def) = 0 then
      raise exception 'prava_rls: funkcija % nema očekivanu proveru prava — proveriti ručno', r.oid::regprocedure;
    end if;
  end loop;
end $$;
