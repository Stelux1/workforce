-- Obaveštenja prate trenutno stanje (spec §15.01): `refresh_notifications` je upisivao događaj samo prvi put
-- (`on conflict do nothing`), pa je npr. manjak ostajao „nedostaje 5" i kad je posle izmene rasporeda nedostajalo 2.
-- Sada se postojeće obaveštenje istog događaja osvežava (poruka, payload, ozbiljnost, rok); pročitanost ostaje.
-- Telo je inače isto kao u 20261125110000. Idempotentno; ne briše podatke.

create or replace function public.refresh_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
  v_new integer;
begin
  if not public.is_staff() then
    raise exception 'Nemate pravo na obaveštenja' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('refresh_notifications'));
  v_today := (now() at time zone coalesce((select s.time_zone from public.app_settings s limit 1), 'Europe/Bratislava'))::date;

  if to_regclass('pg_temp.notif_events') is null then
    create temporary table pg_temp.notif_events (
    event_key text not null, type text not null, title text not null, message text not null,
    severity text not null, audience_permission text, entity_table text, entity_id text,
    project_id uuid, due_date date, payload jsonb not null
  ) on commit drop;
  end if;
  truncate pg_temp.notif_events;

  -- odmor na čekanju
  insert into pg_temp.notif_events
  select 'leave_pending:' || l.id, 'leave_request',
         'Leave request pending', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) || ': ' || l.leave_type || ' ' || l.start_date || ' – ' || l.end_date,
         case when l.start_date <= v_today + 7 then 'warning' else 'info' end,
         'leave.approve', 'leave_requests', l.id::text, null, l.start_date,
         jsonb_build_object('employee_id', e.id, 'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
                            'leave_type', l.leave_type, 'start_date', l.start_date, 'end_date', l.end_date)
    from public.leave_requests l join public.employees e on e.id = l.employee_id
   where l.status = 'pending' and l.end_date >= v_today;

  -- manjak radnika (danas..+30)
  insert into pg_temp.notif_events
  select 'shortage:' || c.project_id || ':' || c.project_role_id || ':' || c.shift_id || ':' || c.work_date,
         'workforce_shortage', 'Workforce shortage',
         p.name || ' – ' || coalesce(r.title, '') || ' (' || coalesce(s.name, '') || ') ' || c.work_date || ': missing ' || c.deficit,
         case when c.work_date <= v_today + 7 then 'critical' else 'warning' end,
         'workforce.manage', 'workforce_requirements', c.project_id::text, c.project_id, c.work_date,
         jsonb_build_object('project_name', p.name, 'role_title', r.title, 'shift_name', s.name, 'shift_code', s.code,
                            'date', c.work_date, 'required', c.required, 'available', c.available, 'deficit', c.deficit,
                            'project_role_id', c.project_role_id, 'shift_id', c.shift_id)
    from public.workforce_coverage(v_today, v_today + 30) c
    join public.projects p on p.id = c.project_id
    left join public.project_roles r on r.id = c.project_role_id
    left join public.shifts s on s.id = c.shift_id
   where c.deficit > 0;

  -- dokument ističe ≤ 30 dana ili je istekao
  insert into pg_temp.notif_events
  select 'doc_expiry:' || d.id || ':' || d.expiration_date, 'document_expiry',
         case when d.expiration_date < v_today then 'Document expired' else 'Document expiring' end,
         btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) || ': ' || d.title || ' – ' || d.expiration_date,
         case when d.expiration_date < v_today then 'critical' else 'warning' end,
         'documents.manage', 'documents', d.id::text, null, d.expiration_date,
         jsonb_build_object('employee_id', e.id, 'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
                            'title', d.title, 'category', d.category, 'expiration_date', d.expiration_date,
                            'expired', d.expiration_date < v_today)
    from public.documents d join public.employees e on e.id = d.employee_id
   where d.expiration_date is not null and d.expiration_date <= v_today + 30 and e.status = 'active';

  -- obavezan dokument fali
  insert into pg_temp.notif_events
  select 'doc_missing:' || m.assignment_id || ':' || m.requirement_id, 'document_missing',
         'Required document missing', m.employee_name || ' – ' || m.project_name || ': ' || m.document_type_name,
         case when m.start_date <= v_today then 'warning' else 'info' end,
         'onboarding.manage', 'project_assignments', m.assignment_id::text, m.project_id, m.start_date,
         jsonb_build_object('employee_id', m.employee_id, 'employee_name', m.employee_name, 'project_name', m.project_name,
                            'role_title', m.role_title, 'document_type', m.document_type,
                            'document_type_name', m.document_type_name, 'start_date', m.start_date, 'end_date', m.end_date)
    from public.notif_doc_missing(v_today) m;

  -- angažman ističe ≤ 30 dana
  insert into pg_temp.notif_events
  select 'assignment_ending:' || a.id || ':' || a.end_date, 'assignment_expiry',
         'Assignment ending', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) || ' – ' || p.name || ' ends ' || a.end_date,
         case when a.end_date <= v_today + 7 then 'warning' else 'info' end,
         'assignments.manage', 'project_assignments', a.id::text, a.project_id, a.end_date,
         jsonb_build_object('employee_id', e.id, 'employee_name', btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')),
                            'project_name', p.name, 'role_title', a.position, 'end_date', a.end_date)
    from public.project_assignments a
    join public.employees e on e.id = a.employee_id
    join public.projects p on p.id = a.project_id
   where a.status <> 'cancelled' and a.end_date between v_today and v_today + 30
     and public.can_see_project(a.project_id);

  -- satnica na odobrenju
  insert into pg_temp.notif_events
  select 'timesheet_pending:' || t.id, 'timesheet_pending',
         'Timesheet awaiting approval',
         coalesce(t.employee_name, btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))) || ' – ' || coalesce(p.name, t.project, '') || ', week of ' || t.week_start,
         'info', 'timesheets.approve', 'timesheets', t.id::text, t.project_id, t.week_start + 6,
         jsonb_build_object('employee_id', t.employee_id,
                            'employee_name', coalesce(t.employee_name, btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))),
                            'project_name', coalesce(p.name, t.project), 'week_start', t.week_start)
    from public.timesheets t
    join public.employees e on e.id = t.employee_id
    left join public.projects p on p.id = t.project_id
   where t.approval_status = 'submitted' and (t.project_id is null or public.can_see_project(t.project_id));

  -- dospela obaveza (potvrđena, rok prošao, ostatak > 0)
  insert into pg_temp.notif_events
  select 'payable_due:' || pb.payable_id || ':' || y.due_date, 'payable_due',
         'Payable overdue',
         coalesce(nullif(btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''), v.name, '') || ': ' || pb.remaining_amount || ' ' || y.currency || ', due ' || y.due_date,
         'critical', 'payroll.view', 'payables', pb.payable_id::text, null, y.due_date,
         jsonb_build_object('payee_type', y.payee_type, 'payee_name', coalesce(nullif(btrim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''), v.name),
                            'remaining', pb.remaining_amount, 'currency', y.currency, 'due_date', y.due_date,
                            'period_start', y.period_start, 'period_end', y.period_end)
    from public.payable_balances pb
    join public.payables y on y.id = pb.payable_id
    left join public.employees e on e.id = y.employee_id
    left join public.vendors v on v.id = y.vendor_id
   where y.status = 'confirmed' and y.due_date is not null and y.due_date < v_today and pb.remaining_amount > 0;

  -- dospelo potraživanje (eksterni račun sa rokom koji je prošao i otvorenim iznosom)
  insert into pg_temp.notif_events
  select 'receivable_due:' || s.id || ':' || s.ext_due_date, 'receivable_due',
         'Receivable overdue',
         coalesce(c.name, '') || ': ' || bb.outstanding || ' ' || coalesce(s.ext_invoice_currency, s.currency) || ', due ' || s.ext_due_date,
         'warning', 'billing.view', 'billing_summaries', s.id::text, s.project_id, s.ext_due_date,
         jsonb_build_object('client_name', c.name, 'outstanding', bb.outstanding,
                            'currency', coalesce(s.ext_invoice_currency, s.currency), 'due_date', s.ext_due_date,
                            'invoice_reference', s.ext_invoice_reference, 'period_start', s.period_start, 'period_end', s.period_end)
    from public.billing_balances bb
    join public.billing_summaries s on s.id = bb.summary_id
    join public.clients c on c.id = s.client_id
   where s.ext_due_date is not null and s.ext_due_date < v_today and bb.outstanding is not null and bb.outstanding > 0
     and (s.project_id is null or public.can_see_project(s.project_id));

  -- upis novih
  insert into public.notifications (title, message, type, severity, audience_permission, entity_table, entity_id,
                                    project_id, due_date, event_key, payload, created_by)
  select distinct on (ev.event_key) ev.title, ev.message, ev.type, ev.severity, ev.audience_permission, ev.entity_table,
         ev.entity_id, ev.project_id, ev.due_date, ev.event_key, ev.payload, null
    from pg_temp.notif_events ev
   order by ev.event_key
  on conflict (event_key) where event_key is not null do nothing;
  get diagnostics v_new = row_count;

  -- uslov i dalje važi, ali su se brojevi promenili (npr. manjak 5 → 2): osveži tekst, podatke, ozbiljnost i rok.
  -- Pročitanost se ne dira (isti događaj); tako obaveštenje nikad ne prikazuje zastarele brojeve.
  update public.notifications n
     set message = ev.message, payload = ev.payload, severity = ev.severity, due_date = ev.due_date, title = ev.title
    from (select distinct on (e.event_key) e.* from pg_temp.notif_events e order by e.event_key) ev
   where n.event_key = ev.event_key
     and (n.message, n.payload, n.severity, n.due_date, n.title) is distinct from (ev.message, ev.payload, ev.severity, ev.due_date, ev.title);

  -- uslov se vratio: ponovo otvori i vrati kao nepročitano
  with reopened as (
    update public.notifications n set resolved_at = null
     where n.resolved_at is not null and n.event_key in (select ev.event_key from pg_temp.notif_events ev)
    returning n.id)
  delete from public.notification_reads r where r.notification_id in (select id from reopened);

  -- uslov više ne važi: zatvori (samo ono što pozivalac vidi; 'replacement:*' vodi W2-L)
  update public.notifications n set resolved_at = now()
   where n.resolved_at is null and n.event_key is not null
     and n.event_key ~ '^(leave_pending|shortage|doc_expiry|doc_missing|assignment_ending|timesheet_pending|payable_due|receivable_due):'
     and not exists (select 1 from pg_temp.notif_events ev where ev.event_key = n.event_key)
     and (n.project_id is null or public.can_see_project(n.project_id))
     and (n.audience_permission is null or public.has_permission(n.audience_permission));

  -- kandidat za zamenu: važi dok je zahtev otvoren; kad je odbijen ili je odsustvo završeno, zatvara se
  update public.notifications n set resolved_at = now()
   where n.resolved_at is null and n.event_key ~ '^replacement:[0-9a-f-]{36}:'
     and exists (select 1 from public.leave_requests l
                  where l.id = split_part(n.event_key, ':', 2)::uuid
                    and (l.status = 'rejected' or l.end_date < v_today))
     and (n.project_id is null or public.can_see_project(n.project_id));

  return v_new;
end $$;
revoke execute on function public.refresh_notifications() from public, anon;
grant execute on function public.refresh_notifications() to authenticated;
