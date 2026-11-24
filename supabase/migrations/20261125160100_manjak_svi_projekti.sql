-- Manjak zbog odsustva na SVIM projektima radnika (spec §14.1: „proveriti sve relevantne projekte").
-- Do sada je `leave_shortage` zvao `workforce_coverage`, koji vraća samo projekte koje pozivalac vidi
-- (can_see_project): PM sa ograničenim pristupom nije video manjak na drugim projektima radnika, a odluka i snimak
-- (`shortage_snapshot`) su ga izostavljali.
-- • `workforce_coverage_all` = isti izračun bez filtera pristupa; INTERNA funkcija (nije RPC; ne izvršava je ni
--   authenticated). `workforce_coverage` postaje omot nad njom sa can_see_project — isto ponašanje kao pre.
-- • `leave_shortage` (security definer) koristi `workforce_coverage_all` i vraća SAMO brojeve i nazive za prikaz:
--   projekat, Job Role, smena, dan, potrebno / planirano / odsutno / dostupno / deficit — bez tarifa, bez imena i
--   ličnih podataka radnika. Poziva ga samo `leave.approve` (pre je bilo bilo koje osoblje).
-- • `decide_leave_request` se ne menja: već zove `leave_shortage`, pa sada proverava i pamti sve projekte.
-- Idempotentno; ne menja podatke.

create or replace function public.workforce_coverage_all(
  p_from date, p_to date, p_project uuid default null, p_simulate_leave uuid default null)
returns table (project_id uuid, project_role_id uuid, shift_id uuid, work_date date,
               required integer, planned integer, absent integer, available integer, deficit integer, surplus integer)
language sql stable security definer set search_path = '' as $$
  with req as (
    select r.project_id, r.project_role_id, r.shift_id, d.d::date as work_date, r.required_count
      from public.workforce_requirements r
     cross join lateral generate_series(greatest(r.date_from, p_from)::timestamp, least(r.date_to, p_to)::timestamp, interval '1 day') as d(d)
     where (p_project is null or r.project_id = p_project)
  ),
  pl as (
    select q.project_id, q.project_role_id, q.shift_id, q.work_date, s.employee_id
      from req q
      join public.schedules s
        on s.project_id = q.project_id and s.shift_id = q.shift_id and s.date = q.work_date and s.status in ('assigned', 'replacement')
      join public.project_assignments a
        on a.id = s.assignment_id and a.project_role_id = q.project_role_id and a.status <> 'cancelled'
    union
    select q.project_id, q.project_role_id, q.shift_id, q.work_date, a.employee_id
      from req q
      join public.project_assignments a
        on a.project_id = q.project_id and a.project_role_id = q.project_role_id and a.default_shift_id = q.shift_id
       and a.status <> 'cancelled' and a.start_date <= q.work_date and (a.end_date is null or a.end_date >= q.work_date)
     where not exists (select 1 from public.schedules s2 where s2.employee_id = a.employee_id and s2.date = q.work_date)
  ),
  agg as (
    select pl.project_id, pl.project_role_id, pl.shift_id, pl.work_date,
           count(*)::integer as planned,
           (count(*) filter (where exists (
              select 1 from public.leave_requests l
               where l.employee_id = pl.employee_id and pl.work_date between l.start_date and l.end_date
                 and (l.status = 'approved' or l.id = p_simulate_leave))))::integer as absent
      from pl
     group by pl.project_id, pl.project_role_id, pl.shift_id, pl.work_date
  )
  select q.project_id, q.project_role_id, q.shift_id, q.work_date,
         q.required_count,
         coalesce(g.planned, 0),
         coalesce(g.absent, 0),
         coalesce(g.planned, 0) - coalesce(g.absent, 0),
         greatest(q.required_count - (coalesce(g.planned, 0) - coalesce(g.absent, 0)), 0),
         greatest((coalesce(g.planned, 0) - coalesce(g.absent, 0)) - q.required_count, 0)
    from req q
    left join agg g
      on g.project_id = q.project_id and g.project_role_id = q.project_role_id and g.shift_id = q.shift_id and g.work_date = q.work_date
   order by q.work_date, q.project_id, q.project_role_id, q.shift_id
$$;

create or replace function public.workforce_coverage(
  p_from date, p_to date, p_project uuid default null, p_simulate_leave uuid default null)
returns table (project_id uuid, project_role_id uuid, shift_id uuid, work_date date,
               required integer, planned integer, absent integer, available integer, deficit integer, surplus integer)
language sql stable security definer set search_path = '' as $$
  select c.* from public.workforce_coverage_all(p_from, p_to, p_project, p_simulate_leave) c
   where public.can_see_project(c.project_id)
$$;

create or replace function public.leave_shortage(p_leave uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_l public.leave_requests;
  v jsonb;
begin
  if not (select public.has_permission('leave.approve')) then
    raise exception 'Nemate pravo „leave.approve"' using errcode = '42501';
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
    select c.* from prj cross join lateral public.workforce_coverage_all(v_l.start_date, v_l.end_date, prj.project_id, null) c
  ),
  sim as (
    select c.* from prj cross join lateral public.workforce_coverage_all(v_l.start_date, v_l.end_date, prj.project_id, v_l.id) c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'project_id', s.project_id, 'project_role_id', s.project_role_id, 'shift_id', s.shift_id, 'date', s.work_date,
           'required', s.required, 'planned', s.planned, 'absent', s.absent, 'available', s.available,
           'deficit', s.deficit, 'deficit_before', coalesce(b.deficit, 0),
           'project_name', p.name, 'role_title', r.title,
           'shift_name', coalesce(sh.name, sh.code) || ' ' || to_char(sh.start_time, 'HH24:MI') || '–' || to_char(sh.end_time, 'HH24:MI'))
           order by s.work_date, s.project_id, s.project_role_id, s.shift_id), '[]'::jsonb)
    into v
    from sim s
    left join base b
      on b.project_id = s.project_id and b.project_role_id = s.project_role_id and b.shift_id = s.shift_id and b.work_date = s.work_date
    left join public.projects p on p.id = s.project_id
    left join public.project_roles r on r.id = s.project_role_id
    left join public.shifts sh on sh.id = s.shift_id
   where s.deficit > 0 and s.absent > coalesce(b.absent, 0);
  return v;
end $$;

revoke execute on function public.workforce_coverage_all(date, date, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.workforce_coverage(date, date, uuid, uuid) from public, anon;
grant execute on function public.workforce_coverage(date, date, uuid, uuid) to authenticated;
revoke execute on function public.leave_shortage(uuid) from public, anon;
grant execute on function public.leave_shortage(uuid) to authenticated;
