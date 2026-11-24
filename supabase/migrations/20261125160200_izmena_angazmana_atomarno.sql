-- Edit Assignment u jednoj transakciji (spec §4.5, §5): izmena dodele + promena B2C/B2B tarife od datuma.
-- Do sada je dijalog slao 2–3 RPC-a redom (update_assignment, pa change_rate/set_rate po strani); greška u drugom
-- pozivu ostavljala je dodelu izmenjenu, a tarifu staru. `update_assignment_with_rates` radi sve u jednom pozivu —
-- svaka greška vraća celu izmenu. Logika je ista kao pre: postojeći RPC-ovi se pozivaju iznutra (prava, audit razlog,
-- pravila datuma i D10 ostaju njihova).
--   p        — polja dodele kao kod update_assignment (prazan objekat = bez izmene dodele)
--   p_rates  — [{kind: 'cost'|'revenue', amount, currency}] (prazan niz = bez izmene tarife; tada rates.manage ne treba)
--   p_rate_from — datum od kog važi nova tarifa (u okviru dodele posle izmene)
-- Idempotentno; ne menja podatke.

create or replace function public.update_assignment_with_rates(
  p_id uuid, p jsonb, p_rates jsonb, p_rate_from date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.project_assignments;
  v_rate jsonb;
  v_kind text;
  v_current uuid;
  v_rates jsonb := coalesce(p_rates, '[]'::jsonb);
begin
  select * into v_a from public.project_assignments where id = p_id for update;
  if v_a.id is null then
    raise exception 'Dodela ne postoji' using errcode = 'check_violation';
  end if;
  perform public.assignment_access(v_a.project_id);
  if jsonb_typeof(v_rates) <> 'array' then
    raise exception 'Tarife se šalju kao niz' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(v_rates) > 0 then
    perform public.require_permission('rates.manage');
  end if;

  if p is not null and p <> '{}'::jsonb then
    perform public.update_assignment(p_id, p, p_reason);
    select * into v_a from public.project_assignments where id = p_id;
  end if;

  if jsonb_array_length(v_rates) = 0 then
    return p_id;
  end if;
  if p_rate_from is null or p_rate_from < v_a.start_date or (v_a.end_date is not null and p_rate_from > v_a.end_date) then
    raise exception 'Datum promene tarife mora biti u okviru angažmana (od % do %)', to_char(v_a.start_date, 'DD.MM.YYYY'),
      coalesce(to_char(v_a.end_date, 'DD.MM.YYYY'), 'neodređeno') using errcode = 'check_violation';
  end if;

  for v_rate in select * from jsonb_array_elements(v_rates) loop
    v_kind := v_rate ->> 'kind';
    if v_kind is null or v_kind not in ('cost', 'revenue') then
      raise exception 'Vrsta tarife mora biti „cost" (B2C) ili „revenue" (B2B)' using errcode = 'check_violation';
    end if;
    if (select count(*) from jsonb_array_elements(v_rates) x where x ->> 'kind' = v_kind) > 1 then
      raise exception 'Ista vrsta tarife je poslata dva puta' using errcode = 'check_violation';
    end if;
    select r.id into v_current
      from public.rates r
     where r.scope = 'assignment' and r.assignment_id = p_id and r.kind = v_kind and r.status = 'active'
       and r.effective_from <= p_rate_from and (r.effective_to is null or r.effective_to >= p_rate_from)
     order by r.effective_from desc
     limit 1;
    if v_current is not null then
      perform public.change_rate(v_current, p_rate_from, (v_rate ->> 'amount')::numeric, v_rate ->> 'currency', p_reason);
    else
      perform public.set_rate(jsonb_build_object(
        'scope', 'assignment', 'kind', v_kind, 'unit', 'hourly', 'assignment_id', p_id,
        'amount', (v_rate ->> 'amount')::numeric, 'currency', v_rate ->> 'currency',
        'effective_from', p_rate_from, 'effective_to', v_a.end_date, 'reason', p_reason));
    end if;
  end loop;
  return p_id;
end $$;

comment on function public.update_assignment_with_rates(uuid, jsonb, jsonb, date, text) is
  'Edit Assignment atomarno: update_assignment + change_rate/set_rate po strani u jednoj transakciji.';

revoke execute on function public.update_assignment_with_rates(uuid, jsonb, jsonb, date, text) from public, anon;
grant execute on function public.update_assignment_with_rates(uuid, jsonb, jsonb, date, text) to authenticated;
