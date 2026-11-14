-- Testovi za razvrstavanje sati i iznose po vrsti sati (migracija 20261114150000_satnice_vrste_sati.sql, D5, D10, D16).
-- Sopstveni podaci sa oznakom QA-3 i 2032. godina; koeficijenti, prag i praznici se postavljaju ovde. Sve se vraća (rollback).
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- ───── priprema (kao postgres) ─────
insert into auth.users (id, email, instance_id, aud, role) values
  ('61111111-1111-4111-8111-111111111111', 'qa3-admin@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('62222222-2222-4222-8222-222222222222', 'qa3-operater@radnici.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
update public.profiles set role = 'admin' where id = '61111111-1111-4111-8111-111111111111';
update public.profiles set role = 'operater' where id = '62222222-2222-4222-8222-222222222222';

-- Pravila kao u šemi: prag 8h, redovni = 1, ostali koeficijenti prazni (D5: admin ih još nije upisao).
update public.work_rules set daily_regular_hours = 8;
update public.hour_types set worker_coef = 1, client_coef = 1 where code = 'redovni';
update public.hour_types set worker_coef = null, client_coef = null where code <> 'redovni';
-- 2032-03-06 je subota (nedelja od 01.03.); nedelja od 08.03. nema praznik.
insert into public.holidays (date, name) values ('2032-03-06', 'QA-3 praznik') on conflict (date) do nothing;

insert into public.clients (id, name) values ('c6000000-0000-4000-8000-0000000000c1', 'QA-3 klijent');
insert into public.projects (id, name, client_name) values ('b6000000-0000-4000-8000-0000000000b1', 'QA-3 projekat', 'QA-3 klijent');
insert into public.employees (id, first_name, last_name, employee_id) values
  ('d6000000-0000-4000-8000-0000000000d1', 'QA-3', 'Radnik', 'QA-3-001'),
  ('d6000000-0000-4000-8000-0000000000d2', 'QA-3', 'Posebni', 'QA-3-002');
-- Drugi radnik ima posebnu satnicu za prekovremeni rad u profilu.
insert into public.employee_private (employee_id, overtime_rate) values ('d6000000-0000-4000-8000-0000000000d2', 15);

-- ───── operater ─────
set local role authenticated;
set local request.jwt.claims to '{"sub":"62222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- Ekran šalje i lažne hours_by_type, prekovremeno, iznose i snimak — baza sve to ignoriše.
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, sat_hours, b2c_rate, b2b_rate,
  hours_by_type, overtime_hours, worker_cost, client_revenue, profit, rate_snapshot, approval_status)
values ('f6000000-0000-4000-8000-0000000000f1', 'd6000000-0000-4000-8000-0000000000d1', 'b6000000-0000-4000-8000-0000000000b1',
  '2032-03-08', 10, 8, 12, 20, '{"redovni": 99, "prekovremeni": 0, "vikend": 0, "praznik": 0}', 77, 1, 9999, 9998,
  '{"lines": "lažno"}', 'submitted');

select is((select hours_by_type from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '{"redovni": 8, "prekovremeni": 2, "vikend": 8, "praznik": 0}'::jsonb,
  'pon 10h + sub 8h uz prag 8h = 8 redovno + 2 prekovremeno + 8 vikend (hours_by_type sa ekrana se ignoriše)');
select is((select overtime_hours from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'), 2.00::numeric,
  'prekovremeno = sati preko dnevnog praga, ne preko 40h nedeljno');
select is((select (worker_cost, client_revenue, profit)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '(,,)', 'koeficijent koji fali: iznos je prazan (ne 0 i ne broj sa ekrana), a nacrt se ipak čuva');
select is((select rate_snapshot from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'), null::jsonb,
  'neodobrena satnica nema snimak tarifa (snimak sa ekrana se ignoriše)');

insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, sat_hours, sun_hours, b2c_rate, b2b_rate)
values ('f6000000-0000-4000-8000-0000000000f2', 'd6000000-0000-4000-8000-0000000000d1', 'b6000000-0000-4000-8000-0000000000b1',
  '2032-03-01', 8, 8, 4, 12, 20);
select is((select hours_by_type from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f2'),
  '{"redovni": 8, "prekovremeni": 0, "vikend": 4, "praznik": 8}'::jsonb, 'praznik u subotu je praznik, ne vikend');

-- Samo redovni sati (koeficijent 1): 15,5 × 12,35 = 191,425 → 191,43; 15,5 × 19,99 = 309,845 → 309,85.
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, tue_hours, b2c_rate, b2b_rate,
  worker_cost, client_revenue)
values ('f6000000-0000-4000-8000-0000000000f3', 'd6000000-0000-4000-8000-0000000000d1', 'b6000000-0000-4000-8000-0000000000b1',
  '2032-03-15', 8, 7.5, 12.35, 19.99, 1, 1);
select is((select (worker_cost, client_revenue, profit)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f3'),
  '(191.43,309.85,118.42)', 'iznos = sati × tarifa × koeficijent, na cent (pola od nule, kao round2); upisan iznos se ignoriše');

select throws_ok($$update public.timesheets set approval_status = 'approved' where id = 'f6000000-0000-4000-8000-0000000000f1'$$,
  '42501', null, 'operater ne može da odobri satnicu');

-- ───── admin ─────
set local request.jwt.claims to '{"sub":"61111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_like($$update public.timesheets set approval_status = 'approved' where id = 'f6000000-0000-4000-8000-0000000000f1'$$,
  'Nedostaje koeficijent za vrstu sati: prekovremeni (radnik), prekovremeni (klijent), vikend (radnik), vikend (klijent) — admin ga upisuje u Koeficijenti i praznici',
  'odobravanje bez koeficijenta za vrstu sa satima je odbijeno i kaže šta tačno fali');

-- Admin upisuje koeficijente (Podešavanja → Koeficijenti i praznici).
update public.hour_types set worker_coef = 1.5, client_coef = 1.6 where code = 'prekovremeni';
update public.hour_types set worker_coef = 1.3, client_coef = 1.4 where code = 'vikend';
update public.hour_types set worker_coef = 2, client_coef = 2.2 where code = 'praznik';

select lives_ok($$update public.timesheets set approval_status = 'approved',
    rate_snapshot = '{"worker": {"rate": 99, "source": "project_employee", "ref": "QA-3-ref-w"},
                      "client": {"rate": 99, "source": "job_role", "ref": "QA-3-ref-c"},
                      "lines": "lažno", "daily_regular_hours": 1}'
  where id = 'f6000000-0000-4000-8000-0000000000f1'$$, 'admin odobrava kad postoje tarife i koeficijenti');
select is((select (worker_cost, client_revenue, profit, overtime_hours)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '(256.80,448.00,191.20,2.00)', 'odobren iznos: 8×12 + 2×12×1,5 + 8×12×1,3 = 256,80; 8×20 + 2×20×1,6 + 8×20×1,4 = 448');
select is((select rate_snapshot -> 'worker' || jsonb_build_object('client', rate_snapshot -> 'client')
           from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '{"rate": 12, "source": "project_employee", "ref": "QA-3-ref-w",
    "client": {"rate": 20, "source": "job_role", "ref": "QA-3-ref-c"}}'::jsonb,
  'snimak: tarifa je ona iz reda (ne broj sa ekrana), izvor i oznaka iz izbora tarife');
select is((select rate_snapshot - 'worker' - 'client' - 'approved_at' from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '{"daily_regular_hours": 8, "holidays": [], "lines": [
     {"code": "redovni", "hours": 8, "worker_source": "coef", "worker_rate": 12, "worker_coef": 1, "special_rate": null,
      "client_rate": 20, "client_coef": 1, "worker_cost": 96, "client_revenue": 160},
     {"code": "prekovremeni", "hours": 2, "worker_source": "coef", "worker_rate": 12, "worker_coef": 1.5, "special_rate": null,
      "client_rate": 20, "client_coef": 1.6, "worker_cost": 36, "client_revenue": 64},
     {"code": "vikend", "hours": 8, "worker_source": "coef", "worker_rate": 12, "worker_coef": 1.3, "special_rate": null,
      "client_rate": 20, "client_coef": 1.4, "worker_cost": 124.8, "client_revenue": 224}]}'::jsonb,
  'snimak: koeficijenti po vrsti, dnevni prag i praznici nedelje upisuje baza');

-- Posebna satnica iz profila (prekovremeni 15 €/h) ima prednost nad koeficijentom radnika; klijent ostaje × koeficijent.
insert into public.timesheets (id, employee_id, project_id, week_start, mon_hours, b2c_rate, b2b_rate, approval_status)
values ('f6000000-0000-4000-8000-0000000000f4', 'd6000000-0000-4000-8000-0000000000d2', 'b6000000-0000-4000-8000-0000000000b1',
  '2032-03-08', 10, 12, 20, 'approved');
select is((select (worker_cost, client_revenue, profit)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f4'),
  '(126.00,224.00,98.00)', 'posebna satnica: 8×12 + 2×15 = 126 (ne 2×12×1,5); klijent 8×20 + 2×20×1,6 = 224');
select is((select l ->> 'worker_source' || ' ' || (l ->> 'special_rate')
           from public.timesheets t, jsonb_array_elements(t.rate_snapshot -> 'lines') l
           where t.id = 'f6000000-0000-4000-8000-0000000000f4' and l ->> 'code' = 'prekovremeni'),
  'special 15.00', 'snimak beleži da je korišćena posebna satnica');

-- ───── posle odobravanja se menjaju tarife, koeficijenti, posebna satnica, prag i praznici ─────
insert into public.rates (scope, kind, amount, project_id, effective_from)
  values ('project', 'cost', 50, 'b6000000-0000-4000-8000-0000000000b1', '2032-01-01');
update public.hour_types set worker_coef = 3, client_coef = 3 where code in ('prekovremeni', 'vikend');
update public.employee_private set overtime_rate = 99 where employee_id = 'd6000000-0000-4000-8000-0000000000d2';
update public.work_rules set daily_regular_hours = 6;
insert into public.holidays (date, name) values ('2032-03-08', 'QA-3 praznik 2') on conflict (date) do nothing;
-- Admin menja samo napomenu odobrenih redova — trigger se izvršava, ali odobreno se ne preračunava.
update public.timesheets set notes = 'QA-3 napomena posle odobravanja'
  where id in ('f6000000-0000-4000-8000-0000000000f1', 'f6000000-0000-4000-8000-0000000000f4');

select is((select (worker_cost, client_revenue, profit, overtime_hours)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '(256.80,448.00,191.20,2.00)', 'promena tarife i koeficijenta posle odobravanja ne menja iznose odobrene satnice');
select is((select hours_by_type from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '{"redovni": 8, "prekovremeni": 2, "vikend": 8, "praznik": 0}'::jsonb,
  'ni razvrstane sate (novi praznik i prag 6h ne važe za odobreno)');
select is((select (rate_snapshot -> 'lines' -> 1 ->> 'worker_coef')::numeric from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  1.5, 'snimak i dalje nosi koeficijent iz trenutka odobravanja');
select is((select worker_cost from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f4'), 126.00::numeric,
  'promena posebne satnice posle odobravanja ne menja odobrenu satnicu');
select throws_ok($$update public.timesheets set b2c_rate = 50 where id = 'f6000000-0000-4000-8000-0000000000f1'$$,
  '23514', null, 'tarifa odobrene satnice ne može da se promeni');

-- Nacrt se pri izmeni računa po važećim pravilima: prag 6h → pon 8 = 6 + 2, uto 7,5 = 6 + 1,5.
update public.timesheets set notes = 'QA-3 izmena nacrta' where id = 'f6000000-0000-4000-8000-0000000000f3';
select is((select hours_by_type from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f3'),
  '{"redovni": 12, "prekovremeni": 3.5, "vikend": 0, "praznik": 0}'::jsonb, 'nacrt se pri izmeni razvrstava po važećem pragu');
-- radnik: 12×12,35 = 148,20 + 3,5×12,35×3 = 129,675 → 129,68; klijent: 12×19,99 = 239,88 + 3,5×19,99×3 = 209,895 → 209,90
select is((select (worker_cost, client_revenue)::text from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f3'),
  '(277.88,449.78)', 'nacrt se pri izmeni računa po važećim koeficijentima');

-- Vraćena u nacrt, satnica gubi snimak i računa se po važećim pravilima (ponedeljak je sada praznik, prag 6h).
select lives_ok($$update public.timesheets set approval_status = 'draft' where id = 'f6000000-0000-4000-8000-0000000000f1'$$,
  'admin vraća odobrenu satnicu u nacrt');
select is((select (rate_snapshot is null, hours_by_type = '{"redovni": 0, "prekovremeni": 0, "vikend": 8, "praznik": 10}'::jsonb)::text
           from public.timesheets where id = 'f6000000-0000-4000-8000-0000000000f1'),
  '(t,t)', 'nacrt nema snimak i razvrstava se po važećim praznicima');

select * from finish();
rollback;
