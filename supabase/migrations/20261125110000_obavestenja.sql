-- Obaveštenja (spec v1.4 §15.01, docs/TEAMORA-DATA-MODEL.md §2.13; traka W2-H).
-- Nove vrste obaveštenja (odmor na čekanju, manjak radnika, kandidat za zamenu, dokument koji ističe ili fali, angažman
-- koji ističe, satnica na odobrenju, dospela obaveza, dospelo potraživanje), publika po pravu, „pročitano" po korisniku
-- i funkcija refresh_notifications() koja ih idempotentno upisuje i zatvara kad uslov prestane da važi.
--
-- Zavisi od: 20261125010000 (permissions, has_permission, can_see_project, project_roles, shifts)
--            20261125060000 (required_documents, onboarding_manifest_internal)
--            20261125070000 (workforce_coverage)
--            20261125080000 (payables, payable_balances)       -- W2-E
--            20261125090000 (billing_summaries, billing_balances) -- W2-F
--            20261125100000 (leave_requests proširenje; W2-L upisuje 'replacement:*' obaveštenja) -- W2-L
-- Bezbedno za produkciju: samo dodaje kolone i tabelu; postojeći redovi ostaju vidljivi osoblju (bez audience_permission)
-- i zadržavaju svoje is_read stanje (važi kao pročitano za sve).

-- ═════════════════════════════ 1. kolone ═════════════════════════════
alter table public.notifications
  add column if not exists recipient_user_id uuid references public.profiles (id) on delete cascade,
  add column if not exists audience_permission text references public.permissions (code) on update cascade on delete set null,
  add column if not exists event_key text,
  add column if not exists entity_table text,
  add column if not exists entity_id text,
  add column if not exists project_id uuid references public.projects (id) on delete cascade,
  add column if not exists severity text not null default 'info',
  add column if not exists due_date date,
  add column if not exists resolved_at timestamptz,
  -- Strukturirani podaci događaja (imena, datumi, brojevi): ekran ih prikazuje na jeziku korisnika,
  -- title/message su engleski rezervni tekst za stare čitaoce i izvoze.
  add column if not exists payload jsonb not null default '{}';

alter table public.notifications drop constraint if exists notifications_severity_check;
alter table public.notifications add constraint notifications_severity_check
  check (severity in ('info', 'warning', 'critical'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('document_expiry', 'attendance', 'schedule_change', 'leave_request', 'contract_expiry', 'general',
    'workforce_shortage', 'replacement_candidate', 'assignment_expiry', 'timesheet_pending', 'payable_due',
    'receivable_due', 'document_missing'));

create unique index if not exists notifications_event_key on public.notifications (event_key) where event_key is not null;
create index if not exists notifications_open_idx on public.notifications (created_date desc) where resolved_at is null;
create index if not exists notifications_project_idx on public.notifications (project_id) where project_id is not null;

-- ═════════════════════════════ 2. „pročitano" po korisniku ═════════════════════════════
create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
create index if not exists notification_reads_user_idx on public.notification_reads (user_id);

-- ═════════════════════════════ 3. RLS ═════════════════════════════
alter table public.notifications enable row level security;
drop policy if exists notifications_staff on public.notifications;
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_write on public.notifications;

-- Vidi: lično obaveštenje, ili opšte (bez primaoca) za publiku sa pravom i projektom koji korisnik vidi.
-- Stari redovi bez audience_permission ostaju vidljivi osoblju.
create policy notifications_select on public.notifications for select to authenticated
  using (
    (select public.is_staff()) and (
      recipient_user_id = (select auth.uid())
      or (recipient_user_id is null
          and (audience_permission is null or (select public.has_permission(audience_permission)))
          and (project_id is null or public.can_see_project(project_id)))));
-- Upis ide kroz refresh_notifications() i RPC-ove traka (security definer); direktan upis samo za admina.
create policy notifications_write on public.notifications for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.notifications from anon;

alter table public.notification_reads enable row level security;
drop policy if exists notification_reads_select on public.notification_reads;
drop policy if exists notification_reads_insert on public.notification_reads;
drop policy if exists notification_reads_delete on public.notification_reads;
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = (select auth.uid()));
-- Može da označi samo obaveštenje koje i sam vidi (select politika iznad važi i u ovom podupitu).
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_staff())
              and exists (select 1 from public.notifications n where n.id = notification_id));
create policy notification_reads_delete on public.notification_reads for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.notification_reads from anon;
grant select, insert, delete on public.notification_reads to authenticated;

-- ═════════════════════════════ 4. nepročitano / označi ═════════════════════════════
-- Invoker: RLS vraća samo obaveštenja koja korisnik vidi. Stari redovi sa is_read = true važe kao pročitani.
create or replace function public.unread_notification_count() returns integer
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer
    from public.notifications n
   where n.resolved_at is null
     and not n.is_read
     and not exists (select 1 from public.notification_reads r
                      where r.notification_id = n.id and r.user_id = auth.uid())
$$;
revoke execute on function public.unread_notification_count() from public, anon;
grant execute on function public.unread_notification_count() to authenticated;

-- p_ids null = sva trenutno vidljiva otvorena obaveštenja. Vraća broj novooznačenih.
create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'Prijava je obavezna' using errcode = '42501';
  end if;
  insert into public.notification_reads (notification_id, user_id)
  select n.id, auth.uid()
    from public.notifications n
   where (p_ids is null and n.resolved_at is null and not n.is_read) or n.id = any (coalesce(p_ids, '{}'::uuid[]))
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.mark_notifications_unread(p_ids uuid[]) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_n integer;
begin
  delete from public.notification_reads r
   where r.user_id = auth.uid() and r.notification_id = any (coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.mark_notifications_unread(uuid[]) from public, anon;
grant execute on function public.mark_notifications_unread(uuid[]) to authenticated;

-- ═════════════════════════════ 5. dokument koji fali ═════════════════════════════
-- Obavezan dokument bez ijednog dokumenta te vrste za radnika sa tekućim ili uskoro započetim angažmanom
-- (isti algoritam kao onboarding_manifest_internal, status 'missing'). Interna: bez provere prava.
create or replace function public.notif_doc_missing(p_today date)
returns table (assignment_id uuid, requirement_id uuid, project_id uuid, employee_id uuid, employee_name text,
               project_name text, role_title text, document_type text, document_type_name text,
               start_date date, end_date date)
language plpgsql stable security definer set search_path = '' as $$
declare
  p record;
  m jsonb;
  w jsonb;
  i jsonb;
begin
  for p in
    select a.project_id as pid, array_agg(distinct a.employee_id) as emps
      from public.project_assignments a
      join public.employees e on e.id = a.employee_id and e.status = 'active'
     where a.status <> 'cancelled'
       and a.start_date <= p_today + 30
       and (a.end_date is null or a.end_date >= p_today)
       and exists (select 1 from public.required_documents r where r.project_id = a.project_id and r.mandatory)
     group by a.project_id
  loop
    if not public.can_see_project(p.pid) then
      continue;
    end if;
    m := public.onboarding_manifest_internal(p.pid, p.emps, true, p_today);
    for w in select * from jsonb_array_elements(m -> 'workers') loop
      for i in select * from jsonb_array_elements(w -> 'items') loop
        if (i ->> 'mandatory')::boolean and i ->> 'status' = 'missing' then
          assignment_id := (w ->> 'assignment_id')::uuid;
          requirement_id := (i ->> 'requirement_id')::uuid;
          project_id := p.pid;
          employee_id := (w ->> 'employee_id')::uuid;
          employee_name := w ->> 'employee_name';
          project_name := m ->> 'project_name';
          role_title := w ->> 'role_title';
          document_type := i ->> 'document_type';
          document_type_name := i ->> 'document_type_name';
          start_date := (w ->> 'start_date')::date;
          end_date := (w ->> 'end_date')::date;
          return next;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
revoke execute on function public.notif_doc_missing(date) from public, anon, authenticated;

-- ═════════════════════════════ 6. refresh_notifications ═════════════════════════════
-- Idempotentno: svaki događaj ima event_key; postojeći se ne duplira (on conflict do nothing), događaj čiji uslov
-- više ne važi dobija resolved_at, a onaj čiji se uslov vrati ponovo se otvara (i postaje nepročitan za sve).
-- Poziva ga svako osoblje; vidi i zatvara samo ono što sme da vidi (projekti van opsega se ne dotiču).
-- Vraća broj novih obaveštenja. Prozor „uskoro": 30 dana (isti kao Ending Soon i Required Workforce pregled).
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

-- audit: samo događaji nad obaveštenjima nisu poslovni podatak (bez audit triggera, kao ranije).
