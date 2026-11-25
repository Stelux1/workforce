-- Strani lični broj radnika (zahtev Luke, 25.11.2026): za strance i naše ljude sa stranim papirima — OIB (HR),
-- rodné číslo (SK/CZ) i slični brojevi iz drugih zemalja. Slobodan tekst bez provere formata (formati se razlikuju
-- po zemlji); JMBG ostaje posebno polje sa kontrolnom cifrom.
-- Kolona ide u employee_private (lični podaci: čita employees.private.view, menja employees.private.edit — RLS
-- tabele važi i za nju). SELECT na employee_private je po kolonama (T26, 20261125040000), pa nova kolona mora
-- dobiti grant — inače bi čitanje radnika palo za sve.
-- Bezbedno za produkciju: nova nullable kolona, postojeći podaci se ne menjaju. Idempotentno.

alter table public.employee_private add column if not exists foreign_personal_number text;
comment on column public.employee_private.foreign_personal_number is
  'strani lični broj (OIB, rodné číslo, …) za radnike sa stranim dokumentima; slobodan tekst';
grant select (foreign_personal_number) on public.employee_private to authenticated;
