-- Praznik koji padne vikendom (spec §5): radni sat pripada jednoj konačnoj vrsti; dan koji je i praznik i vikend
-- dobija VEĆI od konfigurisanih koeficijenata, bez sabiranja i bez dvostrukog množenja. Menja D5/D16 („praznik
-- pobeđuje vikend"). Isto pravilo kao classifyWeek / timesheetAmountsByType u src/lib/payroll/hours.js.
--  * nova vrsta sati 'praznik_vikend' u hours_by_type (praznik u subotu ili nedelju); praznik radnim danom ostaje
--    'praznik', vikend bez praznika 'vikend'. hour_types ne dobija red — vrsta nema svoj koeficijent.
--  * iznos, posebno po strani: radnik = veća satnica od (posebna satnica praznika iz profila ili b2c × koef. praznika)
--    i (posebna satnica vikenda ili b2c × koef. vikenda); klijent = b2b × veći od koef. praznika i vikenda za klijenta.
--    Jednake → praznik. Prazan koeficijent praznika ili vikenda blokira (D5 — nema tihog izbora drugog).
--  * linija snimka za 'praznik_vikend' ima ista polja kao ostale (worker_source, worker_rate, worker_coef,
--    special_rate, client_rate, client_coef) + worker_from / client_from = vrsta čiji je koeficijent primenjen.
--  * D10: odobrene satnice se ne diraju (guard_timesheet zadržava hours_by_type, iznose i snimak odobrenog reda).
--    Snimak bez linije 'praznik_vikend' mesečni obračun deli po starom pravilu (praznik vikendom = praznik), pa
--    odobrene satnice i obračuni ostaju isti. Nacrti dobijaju novo razvrstavanje pri sledećoj izmeni (kao 20261114150000).
-- guard_timesheet se ne menja: poziva ove dve funkcije, a snimak upisuje linije iz timesheet_amounts.

-- ───────────── vrste sati jedne satnice ─────────────
create or replace function public.timesheet_hours_by_type(t public.timesheets, p_daily_threshold numeric)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'redovni', trim_scale(coalesce(sum(least(d.h, p_daily_threshold)) filter (where d.kind = 'radni'), 0)),
    'prekovremeni', trim_scale(coalesce(sum(greatest(d.h - p_daily_threshold, 0)) filter (where d.kind = 'radni'), 0)),
    'vikend', trim_scale(coalesce(sum(d.h) filter (where d.kind = 'vikend'), 0)),
    'praznik', trim_scale(coalesce(sum(d.h) filter (where d.kind = 'praznik'), 0)),
    'praznik_vikend', trim_scale(coalesce(sum(d.h) filter (where d.kind = 'praznik_vikend'), 0)))
  from (
    select v.h,
      case when exists (select 1 from public.holidays ho where ho.date = t.week_start + v.i) then
             case when v.i >= 5 then 'praznik_vikend' else 'praznik' end -- praznik u subotu/nedelju / radnim danom
           when v.i >= 5 then 'vikend'                                     -- subota, nedelja
           else 'radni' end as kind
    from (values (0, t.mon_hours), (1, t.tue_hours), (2, t.wed_hours), (3, t.thu_hours),
                 (4, t.fri_hours), (5, t.sat_hours), (6, t.sun_hours)) as v(i, h)
    where coalesce(v.h, 0) > 0
  ) d
$$;

-- ───────────── iznosi po vrsti sati ─────────────
-- Vraća { lines, worker_cost, client_revenue, missing_coefs }. worker_cost / client_revenue su null kad toj strani
-- fali tarifa ili koeficijent; missing_coefs su npr. ["vikend (radnik)", "praznik (klijent)"] — uvek konfigurisane
-- vrste (za 'praznik_vikend' to su praznik i vikend), da admin zna koji red u Koeficijenti i praznici da popuni.
create or replace function public.timesheet_amounts(t public.timesheets, p_hours jsonb)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r record;
  f record;
  v_hours numeric;
  v_special numeric;
  v_per_hour numeric;
  v_ok_worker boolean;
  v_ok_client boolean;
  -- izabrana strana radnika i klijenta za vrstu
  w_from text;
  w_special numeric;
  w_coef numeric;
  w_per_hour numeric;
  c_from text;
  c_coef numeric;
  v_cost numeric;
  v_revenue numeric;
  v_cost_sum numeric := 0;
  v_revenue_sum numeric := 0;
  v_cost_ok boolean := true;
  v_revenue_ok boolean := true;
  v_missing text[] := '{}';
  v_lines jsonb := '[]';
begin
  for r in
    select c.code, c.from_codes
    from (values (1, 'redovni', array['redovni']), (2, 'prekovremeni', array['prekovremeni']),
                 (3, 'vikend', array['vikend']), (4, 'praznik', array['praznik']),
                 (5, 'praznik_vikend', array['praznik', 'vikend'])) as c(ord, code, from_codes) -- jednake → praznik
    order by c.ord
  loop
    v_hours := coalesce((p_hours ->> r.code)::numeric, 0);
    continue when v_hours = 0; -- vrsta bez sati ne traži ni koeficijent ni tarifu

    v_ok_worker := true;
    v_ok_client := true;
    w_from := null; w_special := null; w_coef := null; w_per_hour := null;
    c_from := null; c_coef := null;

    for f in
      select x.code, x.ord, ht.worker_coef, ht.client_coef,
        case x.code when 'prekovremeni' then ep.overtime_rate
                    when 'vikend' then ep.weekend_rate
                    when 'praznik' then ep.holiday_rate end as special -- redovni nema posebnu satnicu
      from unnest(r.from_codes) with ordinality as x(code, ord)
      left join public.hour_types ht on ht.code = x.code
      left join public.employee_private ep on ep.employee_id = t.employee_id
      order by x.ord
    loop
      v_special := case when f.special > 0 then f.special end;
      -- Prazan koeficijent NIJE 1,00 (D5); posebna satnica pokriva samo stranu radnika.
      if v_special is null and f.worker_coef is null and not (f.code || ' (radnik)') = any(v_missing) then
        v_missing := v_missing || (f.code || ' (radnik)');
      end if;
      if f.client_coef is null and not (f.code || ' (klijent)') = any(v_missing) then
        v_missing := v_missing || (f.code || ' (klijent)');
      end if;

      -- Radnik: satnica po satu ove vrste; veća pobeđuje, jednaka zadržava prvu (praznik).
      v_per_hour := case when v_special is not null then v_special
                         when f.worker_coef is not null and t.b2c_rate > 0 then t.b2c_rate * f.worker_coef end;
      if v_per_hour is null then
        v_ok_worker := false;
      elsif w_per_hour is null or v_per_hour > w_per_hour then
        w_from := f.code;
        w_special := v_special;
        w_coef := case when v_special is null then f.worker_coef end;
        w_per_hour := v_per_hour;
      end if;

      -- Klijent: veći koeficijent klijenta.
      if f.client_coef is null then
        v_ok_client := false;
      elsif c_coef is null or f.client_coef > c_coef then
        c_from := f.code;
        c_coef := f.client_coef;
      end if;
    end loop;

    -- Kad fali bilo koja strana koja se poredi, iznos je prazan (nikad izbor samo od onoga što je upisano).
    v_cost := case when v_ok_worker and w_special is not null then round(v_hours * w_special, 2)
                   when v_ok_worker and w_coef is not null then round(v_hours * t.b2c_rate * w_coef, 2) end;
    v_revenue := case when v_ok_client and t.b2b_rate > 0 then round(v_hours * t.b2b_rate * c_coef, 2) end;

    v_cost_ok := v_cost_ok and v_cost is not null;
    v_revenue_ok := v_revenue_ok and v_revenue is not null;
    v_cost_sum := v_cost_sum + coalesce(v_cost, 0);
    v_revenue_sum := v_revenue_sum + coalesce(v_revenue, 0);

    v_lines := v_lines || jsonb_build_object(
      'code', r.code,
      'hours', trim_scale(v_hours),
      'worker_source', case when v_ok_worker and w_special is not null then 'special' else 'coef' end,
      'worker_rate', case when v_ok_worker then coalesce(w_special, t.b2c_rate) else t.b2c_rate end,
      'worker_coef', case when v_ok_worker then trim_scale(w_coef) end,
      'special_rate', case when v_ok_worker then w_special end,
      'worker_from', case when v_ok_worker then w_from end,
      'client_rate', t.b2b_rate,
      'client_coef', case when v_ok_client then trim_scale(c_coef) end,
      'client_from', case when v_ok_client then c_from end,
      'worker_cost', v_cost,
      'client_revenue', v_revenue);
  end loop;

  return jsonb_build_object(
    'lines', v_lines,
    'worker_cost', case when v_cost_ok then v_cost_sum end,
    'client_revenue', case when v_revenue_ok then v_revenue_sum end,
    'missing_coefs', to_jsonb(v_missing));
end $$;

revoke execute on function public.timesheet_hours_by_type(public.timesheets, numeric),
  public.timesheet_amounts(public.timesheets, jsonb) from public, anon, authenticated;

comment on column public.timesheets.hours_by_type is
  'razvrstani sati: redovni / prekovremeni / vikend / praznik / praznik_vikend (praznik u subotu ili nedelju — veći od koeficijenata praznika i vikenda); računa guard_timesheet';
