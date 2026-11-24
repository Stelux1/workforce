-- Naziv modula u poruci baze (spec §4: „Rates & Assignments → Project Assignments"). Telo `timesheet_rate_problem`
-- je isto kao u 20261125030000; menja se samo naziv ekrana na kom se tarifa ispravlja („Angažmani na projektima").
-- Prevod poruke na en/sk je u src/api/errors.js. Idempotentno; ne menja podatke.

create or replace function public.timesheet_rate_problem(p_b2c numeric, p_b2b numeric, p_worker jsonb, p_client jsonb,
                                                        p_date date)
returns text
language plpgsql stable set search_path = '' as $$
declare
  s record;
  v_missing text[] := '{}';
  v_source_label constant jsonb := '{"assignment_rate": "tarifa angažmana", "role_rate": "tarifa Job Role",
    "project_rate": "tarifa projekta/pozicije", "employee_rate": "tarifa radnika",
    "project_employee": "satnica radnika na projektu", "job_role": "zanimanje na projektu", "profile": "profil radnika"}';
  v_unit_label constant jsonb := '{"hourly": "po satu", "daily": "po danu", "weekly": "nedeljno", "monthly": "mesečno"}';
begin
  for s in
    select v.label, v.res, v.rate
    from (values (1, 'radnika', p_worker, p_b2c), (2, 'klijenta', p_client, p_b2b)) as v(ord, label, res, rate)
    order by v.ord
  loop
    if s.res ->> 'error' = 'unit' then
      return format('Važeća tarifa %s (izvor: %s) je %s %s %s — odobravanje prima samo EUR po satu; ispravite tu tarifu u Angažmani na projektima',
        s.label, coalesce(v_source_label ->> (s.res ->> 'source'), s.res ->> 'source'),
        replace(to_char((s.res ->> 'amount')::numeric, 'FM9999999990.00'), '.', ','), s.res ->> 'currency',
        coalesce(v_unit_label ->> (s.res ->> 'unit'), s.res ->> 'unit'));
    end if;
    if s.res ->> 'error' = 'missing' or s.res ->> 'rate' is null then
      v_missing := v_missing || s.label;
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    return format('Nema važeće tarife %s za nedelju od %s — satnica ne može da se odobri',
      array_to_string(v_missing, ' ni '), to_char(p_date, 'DD.MM.YYYY'));
  end if;

  for s in
    select v.label, v.res, v.rate
    from (values (1, 'radnika', p_worker, p_b2c), (2, 'klijenta', p_client, p_b2b)) as v(ord, label, res, rate)
    order by v.ord
  loop
    if s.rate is distinct from (s.res ->> 'rate')::numeric then
      return format('Tarifa %s (%s) ne odgovara važećoj tarifi (%s, izvor: %s) — osvežite stranicu i odobrite ponovo',
        s.label, coalesce(replace(to_char(s.rate, 'FM9999999990.00'), '.', ','), 'prazno'),
        replace(to_char((s.res ->> 'rate')::numeric, 'FM9999999990.00'), '.', ','),
        coalesce(v_source_label ->> (s.res ->> 'source'), s.res ->> 'source'));
    end if;
  end loop;

  return null;
end $$;


