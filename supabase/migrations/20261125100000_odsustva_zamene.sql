-- Leave kapacitet i Smart Replacement (Teamora spec v1.4 §14; docs/TEAMORA-DATA-MODEL.md §2.12, traka W2-L).
--
-- §14.1 Odluka o odsustvu ide samo kroz decide_leave_request: simulira pokrivenost (workforce_coverage sa
--       p_simulate_leave), pamti tačan manjak (shortage_snapshot), a odobrenje uprkos manjku traži pravo
--       leave.approve_shortage i razlog (T24). Sistem nikad ne odbija automatski zbog manjka.
-- §14.2 assign_replacement pravi privremenu dodelu (assignment_type = 'replacement') i raspored po danu/smeni tek
--       posle potvrde ovlašćenog korisnika; ako odlazak radnika pravi manjak na izvornom projektu, bez izričite potvrde
--       (p_ack_source_shortage) se odbija (T23). Postojeće dodele se ne završavaju — istorija ostaje.
-- JS dvojnik: src/lib/replacements.js (isti primeri u replacements.test.js i supabase/tests/30_odsustva_zamene.test.sql).
--
-- Zavisi od: 20261125010000 (has_permission, can_see_project, audit_row, audit_event), 20261125020000 (require_permission),
--            20261125030000 (project_assignments.assignment_type/leave_request_id/default_shift_id),
--            20261125070000 (workforce_coverage, schedules.status/shift_id, guard_schedule_overlap).
-- Bezbedno za produkciju: samo dodaje kolone (bez backfill-a; postojeći zahtevi ostaju kakvi jesu) i funkcije.
-- Već odobreni/odbijeni zahtevi ne gube status; od sada se status menja samo kroz decide_leave_request.

-- ═════════════════════════════ leave_requests: ko, kada, zašto ═════════════════════════════
alter table public.leave_requests
  add column if not exists requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists decided_by uuid references auth.users (id) on delete set null,
  add column if not exists decided_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists shortage_override boolean not null default false,
  add column if not exists shortage_snapshot jsonb;

create index if not exists leave_requests_employee_dates_idx on public.leave_requests (employee_id, start_date, end_date);

-- Status (i podaci o odluci) se menjaju samo kroz decide_leave_request (app.leave_decision = 'on'). Bez prijavljenog
-- korisnika (migracija, seed, postgres) pravilo ne važi. Odlučen zahtev se ne menja (radnik, vrsta, datumi), a briše ga
-- samo ko ima leave.approve. Odobren zahtev ne sme da preklapa drugi odobren zahtev istog radnika; ni nov zahtev.
create or replace function public.guard_leave_decision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('app.leave_decision', true), '') = 'on';
  v_api boolean := auth.uid() is not null;
  v_other public.leave_requests;
begin
  if tg_op = 'DELETE' then
    if v_api and not v_rpc and old.status <> 'pending' and not public.has_permission('leave.approve') then
      raise exception 'Nemate pravo „leave.approve"' using errcode = '42501';
    end if;
    return old;
  end if;

  if v_api and not v_rpc then
    if tg_op = 'INSERT' then
      if new.status <> 'pending' or new.decided_by is not null or new.decided_at is not null or new.shortage_override
         or new.shortage_snapshot is not null or new.decision_reason is not null then
        raise exception 'Zahtev za odsustvo se odobrava ili odbija kroz odluku (Approve / Reject)' using errcode = '42501';
      end if;
      new.requested_by := auth.uid();
    else
      if (new.status, new.decided_by, new.decided_at, new.decision_reason, new.shortage_override, new.shortage_snapshot, new.requested_by)
         is distinct from (old.status, old.decided_by, old.decided_at, old.decision_reason, old.shortage_override, old.shortage_snapshot, old.requested_by) then
        raise exception 'Zahtev za odsustvo se odobrava ili odbija kroz odluku (Approve / Reject)' using errcode = '42501';
      end if;
      if old.status <> 'pending'
         and (new.employee_id, new.leave_type, new.start_date, new.end_date) is distinct from (old.employee_id, old.leave_type, old.start_date, old.end_date) then
        raise exception 'Odlučen zahtev za odsustvo se ne menja — napravite novi zahtev' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.decided_by is not null and (tg_op = 'INSERT' or new.decided_by is distinct from old.decided_by) then
    select coalesce(nullif(btrim(p.full_name), ''), p.email) into new.reviewed_by from public.profiles p where p.id = new.decided_by;
  end if;

  -- preklapanje sa odobrenim odsustvom istog radnika (nov zahtev, nove dateume ili odobrenje)
  if new.status <> 'rejected'
     and (tg_op = 'INSERT' or (new.employee_id, new.start_date, new.end_date, new.status) is distinct from (old.employee_id, old.start_date, old.end_date, old.status)) then
    perform pg_advisory_xact_lock(hashtext('leave:' || new.employee_id::text));
    select * into v_other from public.leave_requests l
     where l.employee_id = new.employee_id and l.id <> new.id and l.status = 'approved'
       and daterange(l.start_date, l.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
     order by l.start_date limit 1;
    if v_other.id is not null then
      raise exception 'Radnik već ima odobreno odsustvo od % do % koje se preklapa sa ovim zahtevom',
        to_char(v_other.start_date, 'DD.MM.YYYY'), to_char(v_other.end_date, 'DD.MM.YYYY') using errcode = '23P01';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists leave_requests_guard_decision on public.leave_requests;
create trigger leave_requests_guard_decision before insert or update or delete on public.leave_requests
  for each row execute function public.guard_leave_decision();

-- ═════════════════════════════ manjak zbog odsustva (§14.1, T21) ═════════════════════════════
-- Redovi pokrivenosti koje ovo odsustvo obara: u simulaciji (zahtev kao odobren) ima više odsutnih nego bez nje —
-- radnik je tu planiran — i deficit ostaje > 0. Gleda sve projekte na kojima radnik ima dodelu u periodu odsustva,
-- sve dane, smene i Job Roles. Isto pravilo kao leaveShortage() u src/lib/replacements.js.
-- Napomena: workforce_coverage vraća samo projekte koje pozivalac vidi (can_see_project).
create or replace function public.leave_shortage(p_leave uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_l public.leave_requests;
  v jsonb;
begin
  if not (select public.is_staff()) then
    raise exception 'Samo osoblje može da proverava kapacitet' using errcode = '42501';
  end if;
  select * into v_l from public.leave_requests where id = p_leave;
  if v_l.id is null then
    raise exception 'Zahtev za odsustvo ne postoji' using errcode = 'check_violation';
  end if;

  with prj as (
    select distinct a.project_id
      from public.project_assignments a
     where a.employee_id = v_l.employee_id and a.status <> 'cancelled'
       and daterange(a.start_date, a.end_date, '[]') && daterange(v_l.start_date, v_l.end_date, '[]')
  ),
  base as (
    select c.* from prj cross join lateral public.workforce_coverage(v_l.start_date, v_l.end_date, prj.project_id, null) c
  ),
  sim as (
    select c.* from prj cross join lateral public.workforce_coverage(v_l.start_date, v_l.end_date, prj.project_id, v_l.id) c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', s.project_id, 'project_role_id', s.project_role_id, 'shift_id', s.shift_id, 'date', s.work_date,
           'required', s.required, 'planned', s.planned, 'absent', s.absent, 'available', s.available,
           'deficit', s.deficit, 'deficit_before', coalesce(b.deficit, 0))
           order by s.work_date, s.project_id, s.project_role_id, s.shift_id), '[]'::jsonb)
    into v
    from sim s
    left join base b
      on b.project_id = s.project_id and b.project_role_id = s.project_role_id and b.shift_id = s.shift_id and b.work_date = s.work_date
   where s.deficit > 0 and s.absent > coalesce(b.absent, 0);
  return v;
end $$;

-- ═════════════════════════════ decide_leave_request (§14.1, T24) ═════════════════════════════
-- Approve / Reject. Uz manjak odobrenje traži leave.approve_shortage i razlog (najmanje 5 znakova). Pamti snimak manjka,
-- ko je i kada odlučio i zašto; audit red dobija action = 'status' i razlog. Nikad ne odbija automatski zbog manjka.
create or replace function public.decide_leave_request(p_id uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.leave_requests;
  v_reason text := nullif(btrim(p_reason), '');
  v_shortage jsonb;
  v_override boolean := false;
begin
  perform public.require_permission('leave.approve');
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Odluka mora biti „approved" ili „rejected"' using errcode = 'check_violation';
  end if;
  select * into v_l from public.leave_requests where id = p_id for update;
  if v_l.id is null then
    raise exception 'Zahtev za odsustvo ne postoji' using errcode = 'check_violation';
  end if;
  if v_l.status <> 'pending' then
    raise exception 'O zahtevu je već odlučeno' using errcode = 'check_violation';
  end if;

  v_shortage := public.leave_shortage(p_id);
  if p_decision = 'approved' and jsonb_array_length(v_shortage) > 0 then
    if not public.has_permission('leave.approve_shortage') then
      raise exception 'Nemate pravo „leave.approve_shortage"' using errcode = '42501';
    end if;
    if v_reason is null or length(v_reason) < 5 then
      raise exception 'Odobrenje uprkos manjku traži razlog (najmanje 5 znakova)' using errcode = 'check_violation';
    end if;
    v_override := true;
  end if;

  perform set_config('app.leave_decision', 'on', true);
  perform set_config('app.audit_action', 'status', true);
  perform set_config('app.audit_reason',
    coalesce(v_reason, case p_decision when 'approved' then 'Odsustvo odobreno' else 'Odsustvo odbijeno' end), true);
  update public.leave_requests
     set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_reason = v_reason,
         shortage_override = v_override, shortage_snapshot = v_shortage
   where id = p_id;
  perform set_config('app.leave_decision', '', true);
  perform set_config('app.audit_action', '', true);
  perform set_config('app.audit_reason', '', true);

  return jsonb_build_object('id', p_id, 'status', p_decision, 'shortage_override', v_override, 'shortage', v_shortage);
end $$;

-- ═════════════════════════════ assign_replacement (§14.2, T23) ═════════════════════════════
-- Raspored jednog dana posle zamene (isto kao simulateReplacement u JS-u):
--  1) dan bez ijednog reda rasporeda: podrazumevane smene radnikovih dodela postaju eksplicitni redovi — 'released'
--     ako se preklapaju sa smenom zamene, inače 'assigned' (tako raspored zamene ne briše planiranu smenu na drugom
--     projektu); za susedni dan samo kad se njegova podrazumevana smena preklapa (smena preko ponoći);
--  2) radnikovi redovi koji se preklapaju sa smenom zamene (assigned/replacement/standby) postaju 'released';
--  3) novi red 'replacement' na ciljnom projektu.
drop function if exists public.replacement_materialize_day(uuid, date, tsrange, text);
-- p_skip: upravo napravljena privremena dodela (njena smena je sama zamena, ne „stari plan").
create or replace function public.replacement_materialize_day(p_employee uuid, p_day date, p_window tsrange, p_note text, p_skip uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.schedules s where s.employee_id = p_employee and s.date = p_day) then return; end if;
  -- prvo oslobođeni (ne zauzimaju vreme), pa planirani
  insert into public.schedules (employee_id, employee_name, date, shift_start, shift_end, project_id, assignment_id, shift_id, status, notes)
  select a.employee_id, a.employee_name, p_day, to_char(sh.start_time, 'HH24:MI'), to_char(sh.end_time, 'HH24:MI'),
         a.project_id, a.id, sh.id, x.status, p_note
    from public.project_assignments a
    join public.shifts sh on sh.id = a.default_shift_id
   cross join lateral (select case when tsrange(p_day + sh.start_time,
                                               p_day + sh.end_time + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end,
                                               '[)') && p_window then 'released' else 'assigned' end as status) x
   where a.employee_id = p_employee and a.status <> 'cancelled' and a.id is distinct from p_skip
     and a.start_date <= p_day and (a.end_date is null or a.end_date >= p_day)
   order by (x.status = 'assigned'), a.start_date, a.id;
end $$;

create or replace function public.assign_replacement(
  p_leave uuid, p_employee uuid, p_project uuid, p_role uuid, p_shift uuid, p_from date, p_to date,
  p_source_assignment uuid default null, p_ack_source_shortage boolean default false)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.leave_requests;
  v_emp public.employees;
  v_absent_name text;
  v_role public.project_roles;
  v_shift public.shifts;
  v_project public.projects;
  v_src public.project_assignments;
  v_existing public.project_assignments;
  v_assignment uuid;
  v_projects uuid[];
  v_before jsonb;
  v_increase jsonb;
  v_missing integer;
  v_hidden uuid;
  v_day date;
  v_g date;
  w tsrange;
  v_name text;
  v_note text;
  v_reason text;
  v_leave_day date;
  v_new uuid;
begin
  perform public.require_permission('workforce.manage');
  select * into v_project from public.projects where id = p_project;
  if v_project.id is null then
    raise exception 'Projekat ne postoji' using errcode = 'check_violation';
  end if;
  if not public.can_see_project(p_project) then
    raise exception 'Nemate pristup ovom projektu' using errcode = '42501';
  end if;

  select * into v_l from public.leave_requests where id = p_leave;
  if v_l.id is null then
    raise exception 'Zahtev za odsustvo ne postoji' using errcode = 'check_violation';
  end if;
  if v_l.status = 'rejected' then
    raise exception 'Odsustvo je odbijeno — zamena nije potrebna' using errcode = 'check_violation';
  end if;
  if p_employee = v_l.employee_id then
    raise exception 'Radnik ne može da zameni sam sebe' using errcode = 'check_violation';
  end if;
  select * into v_emp from public.employees where id = p_employee;
  if v_emp.id is null then
    raise exception 'Radnik ne postoji' using errcode = 'check_violation';
  end if;
  if v_emp.status in ('terminated', 'suspended') then
    raise exception 'Radnik nije aktivan' using errcode = 'check_violation';
  end if;
  select * into v_role from public.project_roles where id = p_role;
  if v_role.id is null or v_role.project_id <> p_project then
    raise exception 'Job Role ne pripada projektu dodele' using errcode = 'check_violation';
  end if;
  select * into v_shift from public.shifts where id = p_shift;
  if v_shift.id is null then
    raise exception 'Smena ne postoji' using errcode = 'check_violation';
  end if;
  if v_shift.project_id is not null and v_shift.project_id <> p_project then
    raise exception 'Smena pripada drugom projektu' using errcode = 'check_violation';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Period zamene nije ispravan' using errcode = 'check_violation';
  end if;
  if p_from < v_l.start_date or p_to > v_l.end_date then
    raise exception 'Zamena mora biti u periodu odsustva (% – %)', to_char(v_l.start_date, 'DD.MM.YYYY'), to_char(v_l.end_date, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;
  select greatest(l.start_date, p_from) into v_leave_day from public.leave_requests l
   where l.employee_id = p_employee and l.status = 'approved'
     and daterange(l.start_date, l.end_date, '[]') && daterange(p_from, p_to, '[]')
   order by l.start_date limit 1;
  if v_leave_day is not null then
    raise exception 'Radnik je na odsustvu % — izaberite period kad je dostupan', to_char(v_leave_day, 'DD.MM.YYYY')
      using errcode = 'check_violation';
  end if;
  if p_source_assignment is not null then
    select * into v_src from public.project_assignments where id = p_source_assignment;
    if v_src.id is null or v_src.employee_id <> p_employee or v_src.status = 'cancelled' then
      raise exception 'Izvorna dodela ne pripada tom radniku' using errcode = 'check_violation';
    end if;
    if not public.can_see_project(v_src.project_id) then
      raise exception 'Nemate pristup izvornom projektu' using errcode = '42501';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('sch:' || p_employee::text));
  select btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) into v_absent_name from public.employees e where e.id = v_l.employee_id;
  v_name := btrim(coalesce(v_emp.last_name, '') || ' ' || coalesce(v_emp.first_name, ''));
  v_note := 'Zamena za ' || coalesce(v_absent_name, 'radnika') || ' (odsustvo ' || to_char(v_l.start_date, 'DD.MM.') || '–' || to_char(v_l.end_date, 'DD.MM.YYYY') || ')';
  v_reason := v_note || case when p_ack_source_shortage then ' — potvrđen manjak na izvornom projektu' else '' end;

  -- pokrivenost pre zamene na svim projektima radnika (izvor) i na ciljnom
  select array_agg(distinct x.project_id) into v_projects from (
    select a.project_id from public.project_assignments a
     where a.employee_id = p_employee and a.status <> 'cancelled'
       and daterange(a.start_date, a.end_date, '[]') && daterange(p_from - 1, p_to + 1, '[]')
    union select s.project_id from public.schedules s
     where s.employee_id = p_employee and s.project_id is not null and s.date between p_from - 1 and p_to + 1
    union select p_project) x;
  select coalesce(jsonb_object_agg(c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date, c.deficit), '{}'::jsonb)
    into v_before
    from unnest(v_projects) p(id) cross join lateral public.workforce_coverage(p_from - 1, p_to + 1, p.id, null) c;

  perform set_config('app.audit_reason', v_reason, true);

  -- privremena dodela (ili postojeća dodela radnika na istoj ulozi ovog projekta koja pokriva ceo period)
  select * into v_existing from public.project_assignments a
   where a.employee_id = p_employee and a.project_id = p_project and a.status <> 'cancelled'
     and daterange(a.start_date, a.end_date, '[]') && daterange(p_from, p_to, '[]')
   order by a.start_date desc limit 1;
  if v_existing.id is not null then
    if v_existing.project_role_id is distinct from p_role or v_existing.start_date > p_from
       or (v_existing.end_date is not null and v_existing.end_date < p_to) then
      raise exception 'Radnik već ima dodelu na ovom projektu (%, % – %) — zamena na drugoj ulozi ili delu perioda nije moguća',
        coalesce(v_existing.position, '—'), to_char(v_existing.start_date, 'DD.MM.YYYY'), coalesce(to_char(v_existing.end_date, 'DD.MM.YYYY'), '…')
        using errcode = 'check_violation';
    end if;
    v_assignment := v_existing.id;
  else
    perform set_config('app.assignment_rpc', 'on', true);
    insert into public.project_assignments (employee_id, employee_name, project_id, project_name, project_role_id, start_date, end_date,
                                            default_shift_id, notes, assignment_type, source_assignment_id, leave_request_id, status)
    values (p_employee, v_name, p_project, v_project.name, p_role, p_from, p_to, p_shift, v_note, 'replacement',
            p_source_assignment, p_leave, 'active')
    returning id into v_assignment;
    v_new := v_assignment;
    perform set_config('app.assignment_rpc', 'off', true);
  end if;

  for v_day in select g::date from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g loop
    w := tsrange(v_day + v_shift.start_time,
                 v_day + v_shift.end_time + case when v_shift.end_time <= v_shift.start_time then interval '1 day' else interval '0' end, '[)');
    foreach v_g in array array[v_day - 1, v_day, v_day + 1] loop
      if v_g = v_day or exists (
           select 1 from public.project_assignments a join public.shifts sh on sh.id = a.default_shift_id
            where a.employee_id = p_employee and a.status <> 'cancelled' and a.id is distinct from v_new
              and a.start_date <= v_g and (a.end_date is null or a.end_date >= v_g)
              and tsrange(v_g + sh.start_time,
                          v_g + sh.end_time + case when sh.end_time <= sh.start_time then interval '1 day' else interval '0' end, '[)') && w) then
        perform public.replacement_materialize_day(p_employee, v_g, w, v_note, v_new);
      end if;
    end loop;

    update public.schedules s set status = 'released'
     where s.employee_id = p_employee and s.date between v_day - 1 and v_day + 1
       and s.status in ('assigned', 'replacement', 'standby')
       and tsrange(s.start_at, s.end_at, '[)') && w;

    insert into public.schedules (employee_id, employee_name, date, shift_start, shift_end, project_id, assignment_id, shift_id, status, notes)
    values (p_employee, v_name, v_day, to_char(v_shift.start_time, 'HH24:MI'), to_char(v_shift.end_time, 'HH24:MI'),
            p_project, v_assignment, p_shift, 'replacement', v_note);
  end loop;

  -- oslobođeni redovi na projektu koji korisnik ne vidi: ne sme da premešta odatle
  select s.project_id into v_hidden from public.schedules s
   where s.employee_id = p_employee and s.status = 'released' and s.project_id is not null
     and s.date between p_from - 1 and p_to + 1 and not public.can_see_project(s.project_id)
   limit 1;
  if v_hidden is not null then
    raise exception 'Radnik je raspoređen na projektu kome nemate pristup — premeštaj tamo odobrava ovlašćeni korisnik tog projekta'
      using errcode = '42501';
  end if;

  -- posledica po izvorne projekte (T23): redovi gde deficit raste
  select coalesce(jsonb_agg(jsonb_build_object('project_id', c.project_id, 'project_role_id', c.project_role_id, 'shift_id', c.shift_id,
                                               'date', c.work_date, 'required', c.required, 'available', c.available,
                                               'deficit_before', coalesce((v_before ->> (c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date))::int, 0),
                                               'deficit', c.deficit) order by c.work_date, c.project_id), '[]'::jsonb),
         coalesce(sum(c.deficit - coalesce((v_before ->> (c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date))::int, 0)), 0)::int
    into v_increase, v_missing
    from unnest(v_projects) p(id) cross join lateral public.workforce_coverage(p_from - 1, p_to + 1, p.id, null) c
   where c.deficit > coalesce((v_before ->> (c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date))::int, 0);

  if v_missing > 0 then
    if not p_ack_source_shortage then
      raise exception 'Premeštaj pravi manjak na izvornom projektu: nedostaje još % (radnik × smena) — potvrdite transfer', v_missing
        using errcode = 'check_violation', detail = v_increase::text;
    end if;
    perform public.audit_event('project_assignments', v_assignment::text, 'status',
      jsonb_build_object('leave_request_id', p_leave, 'project_id', p_project, 'employee_id', p_employee,
                         'source_assignment_id', p_source_assignment, 'source_shortage', v_increase, 'source_missing', v_missing),
      v_reason);
  end if;

  perform set_config('app.audit_reason', '', true);
  return v_assignment;
end $$;

-- ═════════════════════════════ obaveštenje „kandidat za zamenu" (W2-H, model §2.13) ═════════════════════════════
-- Ekran posle odobrenja uprkos manjku šalje najbolje kandidate (rankCandidates); upisuje se po jedan događaj
-- 'replacement:<leave>:<employee>' (idempotentno). refresh_notifications ga zatvara kad je zahtev odbijen ili prošao.
-- Ako tabela obaveštenja još nema kolone iz 20261125110000, ne upisuje ništa (vraća 0).
create or replace function public.notify_replacement_candidates(p_leave uuid, p_candidates jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.leave_requests;
  v_n integer := 0;
begin
  if not (public.has_permission('workforce.manage') or public.has_permission('leave.approve')) then
    raise exception 'Nemate pravo „workforce.manage"' using errcode = '42501';
  end if;
  select * into v_l from public.leave_requests where id = p_leave;
  if v_l.id is null or v_l.status = 'rejected' or jsonb_typeof(p_candidates) is distinct from 'array' then
    return 0;
  end if;
  begin
    insert into public.notifications (title, message, type, severity, audience_permission, entity_table, entity_id, project_id,
                                      due_date, event_key, payload, created_by)
    select 'Replacement candidate',
           btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) || ' → ' || pr.name || ' (' || v_l.start_date || ' – ' || v_l.end_date || ')',
           'replacement_candidate', 'warning', 'workforce.manage', 'leave_requests', v_l.id::text, pr.id, v_l.start_date,
           'replacement:' || v_l.id || ':' || e.id,
           jsonb_build_object('employee_id', e.id, 'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
                              'leave_request_id', v_l.id, 'absent_employee_id', v_l.employee_id, 'absent_employee_name', v_l.employee_name,
                              'project_name', pr.name, 'category', c ->> 'category', 'start_date', v_l.start_date, 'end_date', v_l.end_date),
           auth.uid()
      from jsonb_array_elements(p_candidates) c
      join public.employees e on e.id = (c ->> 'employee_id')::uuid
      join public.projects pr on pr.id = (c ->> 'project_id')::uuid
     where e.id <> v_l.employee_id and public.can_see_project(pr.id)
    on conflict (event_key) where event_key is not null do nothing;
    get diagnostics v_n = row_count;
  exception when undefined_column or invalid_column_reference or check_violation then
    return 0;
  end;
  return v_n;
end $$;

-- ═════════════════════════════ dozvole (D14) ═════════════════════════════
revoke execute on function public.guard_leave_decision() from public, anon, authenticated;
revoke execute on function public.replacement_materialize_day(uuid, date, tsrange, text, uuid) from public, anon, authenticated;
revoke execute on function public.leave_shortage(uuid) from public, anon;
revoke execute on function public.decide_leave_request(uuid, text, text) from public, anon;
revoke execute on function public.assign_replacement(uuid, uuid, uuid, uuid, uuid, date, date, uuid, boolean) from public, anon;
revoke execute on function public.notify_replacement_candidates(uuid, jsonb) from public, anon;
grant execute on function public.leave_shortage(uuid) to authenticated;
grant execute on function public.decide_leave_request(uuid, text, text) to authenticated;
grant execute on function public.assign_replacement(uuid, uuid, uuid, uuid, uuid, date, date, uuid, boolean) to authenticated;
grant execute on function public.notify_replacement_candidates(uuid, jsonb) to authenticated;
