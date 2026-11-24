-- Zamena: manjak na izvornom projektu meri se na SVIM projektima radnika (spec §14.2, T23; model §2.12).
-- Do sada je `assign_replacement` merio izvorni manjak preko `workforce_coverage`, koji filtrira po can_see_project:
-- kad PM nije video izvorni projekat radnika koji se premešta, upozorenje o manjku je izostajalo i potvrda se nije
-- tražila (ili je premeštaj padao na proveri pristupa bez broja koji nedostaje).
-- • `assign_replacement` meri pokrivenost pre i posle preko interne `workforce_coverage_all` (20261125160100) za sve
--   projekte radnika. Manjak na bilo kom od njih (i onom koji pozivalac ne vidi) bez `p_ack_source_shortage` → greška
--   sa brojem koji nedostaje; DETAIL nosi JSON {missing, rows, hidden_projects} sa SAMO brojevima i nazivima
--   projekta / Job Role / smene (bez tarifa i ličnih podataka), HINT = 'source_shortage'.
-- • Premeštaj sa projekta koji pozivalac ne vidi više se ne odbija bezuslovno: traži izričitu potvrdu i uvek ostavlja
--   audit (i kad tamo ne nastaje manjak — raspored tog projekta se menja).
-- • `replacement_source_impact(...)` = isti izračun bez upisa (sve se vraća): ekran Assign Replacement prikazuje
--   upozorenje PRE potvrde i za projekat koji korisnik ne vidi. Isto pravo kao assign_replacement.
-- JS dvojnik: src/lib/replacements.js (`replacementImpact` uz `serverSource`, `normalizeSourceImpact`).
-- Idempotentno (create or replace); ne menja podatke.

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
  v_hidden jsonb;
  v_hidden_names text;
  v_impact jsonb;
  v_day date;
  v_g date;
  w tsrange;
  v_name text;
  v_note text;
  v_reason text;
  v_leave_day date;
  v_new uuid;
  v_prev_released uuid[];
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
  -- Izvorna dodela mora biti radnikova; pristup izvornom projektu se više ne traži — posledicu po njega meri
  -- ova funkcija (bez filtera pristupa) i traži izričitu potvrdu uz audit (T23).
  if p_source_assignment is not null then
    select * into v_src from public.project_assignments where id = p_source_assignment;
    if v_src.id is null or v_src.employee_id <> p_employee or v_src.status = 'cancelled' then
      raise exception 'Izvorna dodela ne pripada tom radniku' using errcode = 'check_violation';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('sch:' || p_employee::text));
  select btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) into v_absent_name from public.employees e where e.id = v_l.employee_id;
  v_name := btrim(coalesce(v_emp.last_name, '') || ' ' || coalesce(v_emp.first_name, ''));
  v_note := 'Zamena za ' || coalesce(v_absent_name, 'radnika') || ' (odsustvo ' || to_char(v_l.start_date, 'DD.MM.') || '–' || to_char(v_l.end_date, 'DD.MM.YYYY') || ')';
  v_reason := v_note || case when p_ack_source_shortage then ' — potvrđen manjak na izvornom projektu' else '' end;

  -- pokrivenost pre zamene na SVIM projektima radnika (izvor, i oni koje pozivalac ne vidi) i na ciljnom
  select array_agg(distinct x.project_id) into v_projects from (
    select a.project_id from public.project_assignments a
     where a.employee_id = p_employee and a.status <> 'cancelled'
       and daterange(a.start_date, a.end_date, '[]') && daterange(p_from - 1, p_to + 1, '[]')
    union select s.project_id from public.schedules s
     where s.employee_id = p_employee and s.project_id is not null and s.date between p_from - 1 and p_to + 1
    union select p_project) x;
  select coalesce(jsonb_object_agg(c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date,
                                   jsonb_build_object('deficit', c.deficit, 'available', c.available)), '{}'::jsonb)
    into v_before
    from unnest(v_projects) p(id) cross join lateral public.workforce_coverage_all(p_from - 1, p_to + 1, p.id, null) c;

  -- redovi koji su već bili oslobođeni pre ovog poziva (ne računaju se kao „premeštaj sa skrivenog projekta")
  select coalesce(array_agg(s.id), '{}') into v_prev_released from public.schedules s
   where s.employee_id = p_employee and s.status = 'released' and s.date between p_from - 1 and p_to + 1;

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

  -- posledica po izvorne projekte (T23), na svim projektima radnika: redovi gde deficit raste.
  -- Samo brojevi i nazivi za prikaz; `visible` kaže da li pozivalac taj projekat vidi.
  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', c.project_id, 'project_role_id', c.project_role_id, 'shift_id', c.shift_id, 'date', c.work_date,
           'required', c.required,
           'available_before', coalesce((v_before -> k.key ->> 'available')::int, 0), 'available', c.available,
           'deficit_before', coalesce((v_before -> k.key ->> 'deficit')::int, 0), 'deficit', c.deficit,
           'project_name', pr.name, 'role_title', r.title,
           'shift_name', coalesce(sh.name, sh.code) || ' ' || to_char(sh.start_time, 'HH24:MI') || '–' || to_char(sh.end_time, 'HH24:MI'),
           'visible', public.can_see_project(c.project_id))
           order by c.work_date, pr.name, r.title, c.shift_id), '[]'::jsonb),
         coalesce(sum(c.deficit - coalesce((v_before -> k.key ->> 'deficit')::int, 0)), 0)::int
    into v_increase, v_missing
    from unnest(v_projects) p(id)
   cross join lateral public.workforce_coverage_all(p_from - 1, p_to + 1, p.id, null) c
   cross join lateral (select c.project_id || '|' || c.project_role_id || '|' || c.shift_id || '|' || c.work_date as key) k
    left join public.projects pr on pr.id = c.project_id
    left join public.project_roles r on r.id = c.project_role_id
    left join public.shifts sh on sh.id = c.shift_id
   where c.deficit > coalesce((v_before -> k.key ->> 'deficit')::int, 0);

  -- projekti koje pozivalac ne vidi, a na kojima se radniku oslobađa raspored
  select coalesce(jsonb_agg(jsonb_build_object('project_id', h.project_id, 'project_name', h.name) order by h.name), '[]'::jsonb),
         string_agg(h.name, ', ' order by h.name)
    into v_hidden, v_hidden_names
    from (select distinct s.project_id, pr.name
            from public.schedules s
            join public.projects pr on pr.id = s.project_id
           where s.employee_id = p_employee and s.status = 'released' and s.id <> all (v_prev_released)
             and s.date between p_from - 1 and p_to + 1 and not public.can_see_project(s.project_id)) h;

  if v_missing > 0 or jsonb_array_length(v_hidden) > 0 then
    if not p_ack_source_shortage then
      v_impact := jsonb_build_object('missing', v_missing, 'rows', v_increase, 'hidden_projects', v_hidden);
      if v_missing > 0 then
        raise exception 'Premeštaj pravi manjak na izvornom projektu: nedostaje još % (radnik × smena) — potvrdite transfer', v_missing
          using errcode = 'check_violation', detail = v_impact::text, hint = 'source_shortage';
      end if;
      raise exception 'Premeštaj oslobađa raspored radnika na projektu kome nemate pristup (%) — potvrdite transfer', v_hidden_names
        using errcode = 'check_violation', detail = v_impact::text, hint = 'source_shortage';
    end if;
    perform public.audit_event('project_assignments', v_assignment::text, 'status',
      jsonb_build_object('leave_request_id', p_leave, 'project_id', p_project, 'employee_id', p_employee,
                         'source_assignment_id', p_source_assignment, 'source_shortage', v_increase, 'source_missing', v_missing,
                         'hidden_projects', v_hidden),
      v_reason);
  end if;

  perform set_config('app.audit_reason', '', true);
  return v_assignment;
end $$;

-- Pregled posledice premeštaja bez upisa (T23 „upozorenje pre potvrde"): poziva assign_replacement bez potvrde u
-- podtransakciji koja se uvek poništava. Isti izračun kao pri potvrdi — nema drugog modela.
-- Vraća {missing, rows, hidden_projects}; ostale greške (pravo, period, odsustvo…) prosleđuje nepromenjene.
create or replace function public.replacement_source_impact(
  p_leave uuid, p_employee uuid, p_project uuid, p_role uuid, p_shift uuid, p_from date, p_to date,
  p_source_assignment uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state text;
  v_msg text;
  v_detail text;
  v_hint text;
begin
  begin
    perform public.assign_replacement(p_leave, p_employee, p_project, p_role, p_shift, p_from, p_to, p_source_assignment, false);
    raise exception using errcode = 'P0001', message = 'replacement preview', hint = 'replacement_preview_ok';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail, v_hint = pg_exception_hint;
  end;
  if v_hint = 'replacement_preview_ok' then
    return jsonb_build_object('missing', 0, 'rows', '[]'::jsonb, 'hidden_projects', '[]'::jsonb);
  elsif v_hint = 'source_shortage' then
    return v_detail::jsonb;
  end if;
  raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''), hint = coalesce(v_hint, '');
end $$;

revoke execute on function public.assign_replacement(uuid, uuid, uuid, uuid, uuid, date, date, uuid, boolean) from public, anon;
grant execute on function public.assign_replacement(uuid, uuid, uuid, uuid, uuid, date, date, uuid, boolean) to authenticated;
revoke execute on function public.replacement_source_impact(uuid, uuid, uuid, uuid, uuid, date, date, uuid) from public, anon;
grant execute on function public.replacement_source_impact(uuid, uuid, uuid, uuid, uuid, date, date, uuid) to authenticated;
