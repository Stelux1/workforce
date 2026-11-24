# TEAMORA — Model podataka, obračunski servis, prava i podela posla

Važi za spec v1.4 (D30). Pre Phase 7 rada ovaj dokument je obavezan. Ako nešto ovde ne radi, javi u izveštaju; ne pravi paralelni model. Imena tabela, kolona, funkcija i fajlova su **ugovor** između traka i ne menjaju se bez izmene ovog dokumenta.

Oznake: `PK` primarni ključ, `FK→x (r|c|n)` strani ključ sa `on delete restrict | cascade | set null`. „Staff" = aktivan profil (`is_staff()`). `zero` = `'00000000-0000-0000-0000-000000000000'::uuid`.

---

## 0. Kratak ugovor (spisak imena)

**Nove tabele:** `roles`, `permissions`, `role_permissions`, `user_permission_overrides`, `user_project_access`, `audit_log`, `migration_report`, `project_roles`, `shifts`, `exchange_rates`, `timesheet_entries`, `document_types`, `required_documents`, `onboarding_packages`, `onboarding_package_downloads`, `workforce_requirements`, `payables`, `payable_lines`, `payments`, `billing_summaries`, `billing_summary_lines`, `billing_summary_costs`, `billing_status_history`, `client_payments`, `notification_reads`.

**Nove view-ovi:** `timesheet_money`, `payable_balances`, `billing_balances`.

**SQL helperi (01, T-B):** `has_permission(text)`, `can_see_project(uuid)`, `my_permissions()`, `current_app_role()`, `audit_row()`, `audit_event(text,text,text,jsonb,text)`, `migration_note(text,text,text,text,jsonb)`.

**SQL domena:**
- `resolve_rate(text,uuid,uuid,date,uuid)` (03)
- `labor_day_lines(date,date,uuid)` (04)
- `timesheet_day_lines(public.timesheets)` (04)
- `reopen_timesheet(uuid,text)` (04)
- `onboarding_manifest(uuid,uuid[])` (06)
- `can_read_storage_object(text)` (06)
- `workforce_coverage(date,date,uuid,uuid)` (07)
- `generate_payables(date,date)` (08)
- `set_billing_status(uuid,text,text)` (09)
- `decide_leave_request(uuid,text,text)` (10)
- `assign_replacement(...)` (10)
- `refresh_notifications()` (11)

**JS moduli:**
- `src/lib/permissions.js` (T-B)
- `src/lib/payroll/rates.js` v2 (T-A1)
- `src/lib/payroll/timesheetDays.js` (T-A2)
- `src/lib/finance/{currency,laborLines,kpis,payables,billing,summary}.js` (T-E)
- `src/lib/projectCosts.js` (T-C)
- `src/lib/onboarding.js` (T-D)
- `src/lib/workforce.js` (T-G)
- `src/lib/assignments.js` (W2-K)
- `src/lib/replacements.js` (W2-L)
- `src/lib/notifications.js` (W2-H)

**Migracije (redosled primene = redosled imena):**

| Fajl | Traka | Talas |
|---|---|---|
| `20261125010000_temelj_uloge_audit.sql` | T-B | 1 (prvo isporučiti) |
| `20261125020000_prava_rls.sql` | T-B | 1 |
| `20261125030000_angazmani_tarife.sql` | T-A1 | 1 |
| `20261125040000_satnice_po_danu.sql` | T-A2 | 1 |
| `20261125050000_troskovi_c1.sql` | T-C | 1 |
| `20261125060000_onboarding.sql` | T-D | 1 |
| `20261125070000_workforce_model.sql` | T-G | 1 |
| `20261125080000_obaveze_isplate.sql` | W2-E | 2 |
| `20261125090000_billing.sql` | W2-F | 2 |
| `20261125100000_odsustva_zamene.sql` | W2-L | 2 |
| `20261125110000_obavestenja.sql` | W2-H | 2 |
| `20261125120000_finansijski_izvestaji.sql` | W2-J (samo ako zatreba) | 2 |
| `20261125130000_dashboard.sql` | W2-I (samo ako zatreba) | 2 |
| `20261125140000_assignments_a2.sql` | W2-K (samo ako zatreba) | 2 |
| `20261125150000_workforce_ui.sql` | W2-G (samo ako zatreba) | 2 |
| `20261125200000_zavrsni_qa.sql` | W3 | 3 |

**pgTAP fajlovi:**

| Fajl | Traka |
|---|---|
| `20_uloge_prava.test.sql` | T-B |
| `21_audit.test.sql` | T-B |
| `22_angazmani.test.sql` | T-A1 |
| `23_tarife_istorija.test.sql` | T-A1 |
| `24_satnice_po_danu.test.sql` | T-A2 |
| `25_troskovi.test.sql` | T-C |
| `26_onboarding.test.sql` | T-D |
| `27_workforce.test.sql` | T-G |
| `28_obaveze_isplate.test.sql` | W2-E |
| `29_billing.test.sql` | W2-F |
| `30_odsustva_zamene.test.sql` | W2-L |
| `31_obavestenja.test.sql` | W2-H |

Svaki test slučaj nosi `-- Txx` gde pokriva spec test.

---

## 1. Opšta pravila za sve migracije

1. **Idempotentno.** Koristi `create table if not exists`, `add column if not exists`, `drop policy if exists` + `create policy`, `create or replace function`, `drop trigger if exists` + `create trigger`. Backfill se piše tako da drugo pokretanje ne pravi duplikate (proveri `not exists`).
2. **Bez brisanja podataka.** Nijedan `delete`/`drop column` nad poslovnim podacima. Stare kolone ostaju kao snimak. Problematični redovi se ne „popravljaju tiho", nego idu u `migration_report`.
3. **Odobrene satnice i odobreni/isplaćeni obračuni se ne menjaju (D10).**
   - Jedini dozvoljeni backfill nad odobrenom satnicom je upis `assignment_id` (null → vrednost).
   - On prolazi samo uz `set_config('app.migration_backfill','on',true)` i samo kad je `auth.uid() is null`. `guard_timesheet` (04) tada preskače proveru zaključanog meseca i proveru odobrenog reda, isključivo ako se menja samo `assignment_id`.
4. **D14:** ništa `anon`-u. Svaka nova funkcija dobija `revoke execute ... from public, anon` i, ako je RPC, `grant execute ... to authenticated`. Trigger i pomoćne funkcije se zatvaraju i za `authenticated`.
5. **Prava se proveravaju u bazi** (`has_permission`, `can_see_project`) u RLS-u, triggerima i RPC-ovima. UI samo sakriva.
6. **RLS politike:**
   - Nova tabela dobija RLS i politike u migraciji trake koja je pravi.
   - Politike **postojećih** tabela menja samo T-B (02). Izuzeci su navedeni po traci: `schedules` (T-G 07), `leave_requests` guard (W2-L 10), `notifications` (W2-H 11), `storage.objects` (T-D 06).
7. **Audit:** svaka tabela iz §15.04 dobija `create trigger <t>_audit after insert or update or delete on public.<t> for each row execute function public.audit_row();`.
8. **Posle svake migracije:** `npx supabase migration up --include-all`, pa `npm run gen:schema`. Nova tabela se dodaje u `ENTITY_TABLES` (`base44Client.js`) malim Edit-om.
9. **Valuta (K3):** svaka nova kolona iznosa ima kolonu valute uz sebe. Dozvoljene valute su svuda `('EUR','RSD','GBP','USD')` (isto kao `rates`). Kurs je uvek „jedinica valute za 1 EUR" uz **datum kursa**.

---

## 2. Ciljni model podataka

### 2.1 Uloge i prava (T-B, migracija 01)

```text
roles(code text PK check in ('admin','project_manager','hr','finance'), name text not null)
permissions(code text PK, description text not null, sensitive boolean not null default false)
role_permissions(role text FK→roles(code) c, permission text FK→permissions(code) c, PK(role, permission))
user_permission_overrides(user_id uuid FK→profiles(id) c, permission text FK→permissions(code) c,
  granted boolean not null, created_by uuid default auth.uid(), created_date timestamptz default now(),
  PK(user_id, permission))
user_project_access(user_id uuid FK→profiles(id) c, project_id uuid FK→projects(id) c,
  created_by uuid default auth.uid(), created_date timestamptz default now(), PK(user_id, project_id))
profiles: + project_scope text not null default 'all' check in ('all','assigned')
          role check → ('admin','project_manager','hr','finance')
```

**Mapiranje postojećih naloga (D30 K1/K2):** u istoj transakciji redom:
1. `drop constraint profiles_role_check`;
2. `update profiles set role='hr' where role='operater'`;
3. novi check.

`handle_new_user` se redefiniše: nov nalog je `'hr'` i neaktivan, osim prvog naloga (aktivan admin). Postojeći aktivni/neaktivni status se ne dira.

**Katalog prava (seed u `permissions`, tačno ovi kodovi):**

| Kod | Značenje |
|---|---|
| `projects.manage` | projekti, Job Roles (bez tarifa), klijent na projektu |
| `assignments.manage` | Add/Edit/End/Transfer angažmana (bez tarifa) |
| `rates.view_b2b` | čitanje B2B tarifa i prihoda |
| `rates.view_b2c` | čitanje B2C tarifa, troška rada, isplata radniku (osetljivo) |
| `rates.manage` | unos/izmena tarifa (Rate History) |
| `timesheets.edit` | unos, izmena nacrta, Submit |
| `timesheets.approve` | Approve / Reject |
| `timesheets.correct` | vraćanje odobrene satnice uz razlog (K11) |
| `payroll.view` | Monthly Payroll, Payables, Payments (čitanje) |
| `payroll.manage` | zaključavanje meseca, obračun, generisanje i potvrda obaveza |
| `payments.record` | unos/storno isplata |
| `costs.view` / `costs.manage` | Project Costs |
| `billing.view` / `billing.manage` | Billing Overview, status, eksterni račun, Client Payments, klijenti |
| `reports.financial` | Financial Reports, finansijski KPI na Dashboardu, finansijski izvoz |
| `employees.manage` | profil radnika (operativni podaci), vendori |
| `employees.private.view` / `employees.private.edit` | `employee_private` (JMBG, lična karta, pasoš, banka) |
| `engagement.manage` | `employment_history` (direktno ili preko vendora, payee) |
| `documents.manage` | dokumenti radnika (upload, izmena) |
| `documents.view_sensitive` | fajlovi osetljivih dokumenata |
| `onboarding.manage` | Required Documents, priprema paketa |
| `onboarding.export` | preuzimanje ZIP-a |
| `workforce.manage` | smene, Required Workforce, raspored, zamene |
| `leave.approve` | odobravanje/odbijanje odsustva |
| `leave.approve_shortage` | odobrenje uprkos deficitu (uz razlog) |
| `users.manage` | Settings → Users / Permissions |
| `settings.manage` | ostala podešavanja (koeficijenti, kategorije, firma, jezik, vrste dokumenata, kursevi) |
| `audit.view` | pun audit log |

**Podrazumevana prava po ulozi (`role_permissions` seed).** Admin ima sve implicitno, u funkciji, i override ne može da mu oduzme pravo.

| Pravo | PM | HR | Finance |
|---|---|---|---|
| projects.manage | ✔ | ✔ | — |
| assignments.manage | ✔ | ✔ | — |
| rates.view_b2b | ✔ | — | ✔ |
| rates.view_b2c | — | — | ✔ |
| rates.manage | — | — | ✔ |
| timesheets.edit | ✔ | ✔ | ✔ |
| timesheets.approve | ✔ | — | ✔ |
| timesheets.correct | — | — | ✔ |
| payroll.view / payroll.manage / payments.record | — | — | ✔ |
| costs.view | ✔ | — | ✔ |
| costs.manage | ✔ | — | ✔ |
| billing.view / billing.manage | — | — | ✔ |
| reports.financial | — | — | ✔ |
| employees.manage | — | ✔ | — |
| employees.private.view | — | ✔ | ✔ |
| employees.private.edit | — | ✔ | — |
| engagement.manage | — | — | ✔ |
| documents.manage / documents.view_sensitive | — | ✔ | — |
| onboarding.manage | ✔ | ✔ | — |
| onboarding.export | ✔ | ✔ | — |
| workforce.manage | ✔ | ✔ | — |
| leave.approve | ✔ | ✔ | — |
| leave.approve_shortage | ✔ | — | — |
| users.manage / settings.manage / audit.view | — | — | — |

HR (bivši operater) zadržava sve što je operater imao (radnici, projekti, dodele bez tarife, unos sati), bez novca (D30 K1).

**Helperi (01, `security definer`, `set search_path = ''`, `stable`, grant `authenticated`):**

```sql
create or replace function public.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when not pr.active then false
      when pr.role = 'admin' then true
      else coalesce(
        (select o.granted from public.user_permission_overrides o
          where o.user_id = pr.id and o.permission = p_code),
        exists (select 1 from public.role_permissions rp
                 where rp.role = pr.role and rp.permission = p_code))
    end
    from public.profiles pr where pr.id = auth.uid()), false)
$$;

create or replace function public.can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select pr.active and (pr.role = 'admin' or pr.project_scope = 'all'
      or (p_project is not null and exists (
            select 1 from public.user_project_access a
             where a.user_id = pr.id and a.project_id = p_project)))
    from public.profiles pr where pr.id = auth.uid()), false)
$$;

-- current_app_role() → text (uloga ili null);
-- my_permissions() → text[] (svi kodovi koje korisnik ima; admin = svi iz permissions)
```

`is_admin()` i `is_staff()` ostaju nepromenjeni (koriste ih postojeće funkcije dok ih vlasnik trake ne prebaci).

**RLS novih tabela:**
- `roles`, `permissions`, `role_permissions`: select staff, write `users.manage`.
- `user_permission_overrides`, `user_project_access`: select `users.manage` ili `user_id = auth.uid()`; write `users.manage`.
- Override nad nalogom admina se odbija triggerom.

### 2.2 Audit log (T-B, 01)

```text
audit_log(
  id bigint generated always as identity PK,
  table_name text not null, record_id text not null,
  action text not null check in ('insert','update','delete','status','correction','download','prepare'),
  old_data jsonb, new_data jsonb, changed_fields text[],
  reason text,                       -- current_setting('app.audit_reason', true)
  project_id uuid,                   -- iz reda (project_id) ako postoji
  actor uuid default auth.uid(), actor_role text,
  occurred_at timestamptz not null default now())
index (table_name, record_id), (occurred_at desc), (project_id)
```

**`audit_row()`** je trigger funkcija (`security definer`):
- Za `UPDATE` beleži samo kada se razlikuje nešto osim `updated_date`.
- `changed_fields` je lista ključeva gde se `old ->> k` razlikuje od `new ->> k`.
- `action = coalesce(current_setting('app.audit_action', true), lower(tg_op))`, pa RPC može da upiše `status` ili `correction`.

**`audit_event(p_table, p_record, p_action, p_data, p_reason)`** služi za događaje bez promene reda (`download`, `prepare`). Interna je; poziva se iz RPC-ova.

**Nepromenljivost:**
- `revoke insert, update, delete, truncate on audit_log from authenticated`;
- trigger `audit_log_immutable` (before update or delete) uvek baca grešku.

**RLS select:** `has_permission('audit.view')` ili funkcija `can_read_audit(table_name, project_id, new_data, old_data)`:
- `project_costs`: `costs.view` + `can_see_project`
- `project_assignments`: `can_see_project`
- `rates`: po `kind` iz reda, uz `rates.view_b2b` / `rates.view_b2c`
- `timesheets`: `timesheets.approve` + `can_see_project`
- `billing_summaries` i `client_payments`: `billing.view`
- `payables` i `payments`: `payroll.view`
- `leave_requests`: `leave.approve`
- `documents`: `documents.manage`

Ovo je izvor za kartice „History" na ekranima (§8.2.5, §4.5.3).

**Audit triggeri koje 01 kači na postojeće tabele:** `project_assignments`, `rates`, `timesheets`, `leave_requests`, `documents`, `project_costs`. Nove tabele kače vlasnici (vidi §2.x).

**`migration_report`** (01):

```text
migration_report(id bigint identity PK, migration text not null, entity text not null, entity_id text,
  issue text not null, details jsonb, created_date timestamptz default now(), resolved_at timestamptz,
  resolved_by uuid)
```

RLS: select/update `users.manage` ili `settings.manage`. Funkcija `migration_note(...)` je interna i služi za upis.

### 2.3 Job Role, smene, kursevi (T-B, 01 — temelj koji koriste sve trake)

```text
project_roles(
  id uuid PK default gen_random_uuid(),
  project_id uuid not null FK→projects c,
  title text not null check (btrim(title) <> ''),
  title_key text generated always as (lower(btrim(title))) stored,   -- poređenje među projektima (§14 zamene)
  department_position text,          -- naziv pozicije iz Settings → Departments & Positions (opciono)
  description text, status text not null default 'active' check in ('active','inactive'),
  sort integer not null default 0,
  created_date, updated_date, created_by,
  unique (project_id, title_key))
```

**Backfill:** za svaki projekat, redom (bez duplikata po `title_key`):
1. `projects.job_roles[*].title` (sort = redni broj u JSON-u);
2. distinct `project_assignments.position`;
3. distinct `projects.assigned_employees[*].position`;
4. distinct `rates.position` gde je `scope='project'`.

**Preimenovanje:** trigger `propagate_project_role_rename` (after update of title) osvežava snimke `project_assignments.position` i `rates.position` uz `app.snapshot_sync='on'` (T25).

**RLS:** select `can_see_project(project_id)`; write `projects.manage` + `can_see_project`.

```text
shifts(
  id uuid PK, project_id uuid FK→projects c null,       -- null = globalna smena
  code text not null, name text not null,
  start_time time not null, end_time time not null,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  sort integer not null default 0, active boolean not null default true,
  created_date, updated_date, created_by)
unique index shifts_code_key on (coalesce(project_id, zero), lower(code))
```

Bez seeda; smene unosi korisnik sa `workforce.manage`. RLS: select staff (`project_id` null ili `can_see_project`); write `workforce.manage`.

```text
exchange_rates(
  id uuid PK, rate_date date not null,
  currency text not null check in ('RSD','GBP','USD'),
  units_per_eur numeric(14,6) not null check (> 0),
  source text, created_by default auth.uid(), created_date,
  unique (rate_date, currency))
```

RLS: select staff; write `settings.manage`. Koristi ga samo eksplicitna konverzija u izveštajima (§3.1).

`app_settings`: dodaje se `time_zone text not null default 'Europe/Bratislava'` (firma u Slovačkoj, D26; admin menja). `projects`: dodaje se `time_zone text` (null = iz `app_settings`).

### 2.4 Assignment — jedna evidencija (T-A1, migracija 03)

**Odluka:** `project_assignments` je jedina evidencija angažmana. Čitaju je Project Overview/Workers, Project Assignments, Timesheets, Workforce Planning, Onboarding, Payables i Billing.

`projects.assigned_employees` i `projects.job_roles` postaju **izvedeni keš bez tarifa**. Održava ih trigger, a direktan upis preko API-ja se odbija za sve, i za admina.

**Kolone koje se dodaju u `project_assignments`:**

```text
project_role_id   uuid FK→project_roles r null       -- Job Role; position ostaje snimak naziva
assignment_type   text not null default 'standard' check in ('standard','transfer','additional','replacement')
source_assignment_id uuid FK→project_assignments r null  -- transfer/additional/replacement: odakle
leave_request_id  uuid FK→leave_requests n null     -- zamena zbog odsustva
default_shift_id  uuid FK→shifts n null             -- planirana smena (Workforce)
ended_at timestamptz, ended_by uuid FK→auth.users n, end_reason text
legacy_source     text check in ('assigned_employees_json','timesheets')  -- samo backfill
constraint project_assignments_vendor_payee check (engagement_type is distinct from 'subcontractor_worker'
  or vendor_id is not null) NOT VALID           -- postojeći redovi se ne proveravaju, novi da
```

**`status` kolona** zadržava vrednosti `planned|active|completed|cancelled`. Jedino `cancelled` ima poslovno značenje („poništeno, nikad ne važi"). Prikazni status se **izvodi iz datuma**:
- SQL: `assignment_display_status(a project_assignments, p_today date) returns text`
- JS: `assignmentStatus(a, today)` u `src/lib/assignments.js`

Pravilo (međusobno isključivo, §4.4, `today` u vremenskoj zoni projekta):

| Uslov | Status |
|---|---|
| `status='cancelled'` | `cancelled` (izvan 4 statusa i KPI-ja) |
| `end_date < today` | `completed` |
| `start_date > today` | `upcoming` |
| `end_date` između `today` i `today+30` (uključivo) | `ending_soon` |
| ostalo | `active` |

**Payee (§7, T12):** `engagement_type`/`vendor_id` na dodeli. Ako su prazni pri insertu, trigger `fill_assignment_engagement` ih popunjava iz `employment_history` koji pokriva `start_date` (i `affiliation_id`).

**Preklapanje (§4.5.5):** isti radnik, isti projekat, ne-`cancelled`, preklopljen `daterange(start_date, end_date, '[]')` se odbija. To radi trigger `guard_assignment_overlap` uz `pg_advisory_xact_lock(hashtext('pa:'||employee_id))`. Trigger se koristi namesto exclusion ograničenja jer postojeći podaci možda već imaju preklapanja: ona se upisuju u `migration_report` i ne blokiraju migraciju. Različiti projekti istog dana su dozvoljeni; stvarni konflikt vremena proveravaju satnice i raspored (§2.6, §2.10).

**Nepromenljivo posle prvog rada:**
- `employee_id` i `project_id` dodele na koju se poziva bilo koja satnica se ne menjaju.
- Datumi se ne smeju suziti tako da neki ne-odbijeni dan satnice te dodele ispadne iz opsega.
- Brisanje dodele sa satnicom ili tarifom se odbija (FK restrict). Umesto brisanja: End ili Cancel (samo ako nema rada).

**Backfill (redom, idempotentno, `legacy_source`):**
1. Za svaki projekat `p` i element `e` u `p.assigned_employees` (validan uuid, postoji u `employees`):
   - Ako postoji ne-`cancelled` dodela (`e.employee_id`, `p.id`): samo dopuni `position`/`project_role_id` ako su null.
   - Inače insert:
     - `start_date = least(min(timesheets.week_start za radnika i projekat), p.start_date, p.created_date::date)`;
     - `end_date = null`, osim kad je `p.status='completed'` i `p.end_date` nije null: tada `greatest(p.end_date, poslednji dan sa satima)`;
     - `position = e.position`, `project_role_id` po `title_key`, `status='active'`, `legacy_source='assigned_employees_json'`.
   - Neispravan element ide u `migration_report`.
2. Za svaki par (radnik, projekat) koji ima satnice, a nema dodelu: insert sa `start_date` = prvi dan sa satima, `end_date` = poslednji dan sa satima, `legacy_source='timesheets'`. Radnik je skinut sa spiska, pa je dodela završena.
3. `project_role_id` za sve postojeće dodele se postavlja po `title_key(position)`.
4. Pre backfill-a se kopira ceo JSON u `migration_report` (`issue='assigned_employees_backup'`, `details` = JSON projekta). Tarife iz JSON-a time ostaju sačuvane i u reportu.

**Sinhronizacija keša:**
- Trigger `sync_project_assignment_cache` (after insert/update/delete na `project_assignments` i `project_roles`) prepisuje:
  - `projects.assigned_employees = jsonb_agg({employee_id, employee_name, position, project_role_id, assignment_id})` za ne-`cancelled` dodele (distinct po radniku, najnoviji start);
  - `projects.job_roles = jsonb_agg({id, title})` iz `project_roles` (`active`).
- Radi uz `app.assignment_sync='on'`.
- `guard_project_rates` (D22) se zamenjuje funkcijom `guard_project_cache`: promena `assigned_employees`/`job_roles` bez `app.assignment_sync='on'` → `42501` „Radnici i Job Roles se menjaju kroz angažmane i Job Roles".

**Stari čitaoci JSON-a (obavezno prebaciti u traci T-A1/T-A2):**

| Čitalac | Šta radi posle |
|---|---|
| `src/components/projects/ProjectEmployees.jsx` | čita/piše `ProjectAssignment` + RPC (T-A1) |
| `src/components/projects/ProjectRoles.jsx` | `ProjectRole` + `Rate` scope role (T-A1) |
| `src/lib/projectSite.js` `employeesForProject` | prima `assignments` (dodele koje pokrivaju nedelju), ne JSON (T-A2) |
| `src/lib/payroll/rates.js` | bez nivoa `project_employee`, `job_role`, `profile` (T-A1) |
| `resolve_timesheet_rate` | wrapper oko `resolve_rate` (T-A1) |
| `src/pages/projects/Projects.jsx` (broj radnika) | radi i dalje nad kešom; W2-K ga prebacuje na dodele |

**RPC-ovi za A2 (u 03; UI ih koristi u W2-K).** Svi su `security definer`, proveravaju `assignments.manage` + `can_see_project`, a za tarife i `rates.manage`. Postavljaju `app.audit_reason` i vraćaju `uuid`.

| Funkcija | Ponašanje |
|---|---|
| `create_assignment(p jsonb)` | Polja: `employee_id, project_id, project_role_id, start_date, end_date, default_shift_id, notes, assignment_type, source_assignment_id, b2c jsonb{amount,currency}, b2b jsonb{amount,currency}`. Tarife iz `b2c`/`b2b` se upisuju kao `rates` scope `assignment` od `start_date`. |
| `update_assignment(p_id uuid, p jsonb, p_reason text)` | Uloga, datumi, smena, napomena (ne radnik/projekat). |
| `end_assignment(p_id uuid, p_end_date date, p_reason text)` | `end_date ≥` poslednji dan rada. Zatvara otvorene `assignment` tarife na `p_end_date`. Postavlja `ended_*`. |
| `transfer_assignment(p_id uuid, p_date date, p_project uuid, p_role uuid, p_rates jsonb, p_reason text)` | Stari se završava na `p_date-1`. Novi ima `assignment_type='transfer'` i `source_assignment_id`. Sati ostaju na staroj dodeli. |
| `additional_assignment(p_id uuid, p jsonb, p_reason text)` | `create_assignment` sa `assignment_type='additional'`, `source_assignment_id=p_id`. |
| `cancel_assignment(p_id uuid, p_reason text)` | Samo ako nema satnica ni tarifa sa rednim snimkom. |

### 2.5 Rate History (T-A1, migracija 03)

**Ciljni smisao `rates`** (tabela ostaje, kolone se dodaju):

| Nivo (redosled izbora, ista za B2B i B2C) | Red u `rates` | Smisao (§5) |
|---|---|---|
| 1. `assignment_rate` | `scope='assignment'`, `assignment_id` | izuzetak po angažmanu (B2C angažmana; B2B izuzetak) |
| 2. `role_rate` | `scope='project'`, `project_role_id` not null | projektna tarifa Job Role (B2B po pravilu; B2C podrazumevani za ulogu) |
| 3. `project_rate` | `scope='project'`, `project_role_id` null, `position` prazan | tarifa za ceo projekat (legacy) |
| 4. `employee_rate` | `scope='employee'` | legacy; UI više ne nudi novi unos |

`kind='revenue'` je B2B, `kind='cost'` je B2C. Nijedan nivo → `{error:'missing'}` / `MissingRateError` (vidljiva greška, D11). Pobednik koji nije `unit='hourly'` → greška `unit`. **Valuta je dozvoljena** (K3): iznos nosi `currency`, nema više odbijanja ne-EUR.

**Kolone koje se dodaju:**

```text
project_role_id uuid FK→project_roles r null
superseded_by uuid FK→rates n null          -- red koji ga je zamenio („promena od datuma")
change_reason text
rate_key text generated always as (
  scope || '|' || kind || '|' || coalesce(assignment_id::text,'') || '|' || coalesce(project_id::text,'')
  || '|' || coalesce(project_role_id::text,'') || '|' || public.rate_trim(position)
  || '|' || coalesce(employee_id::text,'')) stored
constraint rates_no_overlap exclude using gist (rate_key with =,
  daterange(effective_from, effective_to, '[]') with &&) where (status = 'active')
```

**Pravila izmene (trigger `guard_rate_history`, uz `rates.manage`):**
- Posle inserta se ne menjaju `amount`, `currency`, `unit`, `kind`, `scope`, `assignment_id`, `project_id`, `project_role_id`, `employee_id`, `effective_from`. Menjaju se samo `effective_to`, `status`, `notes`, `change_reason`, `superseded_by`.
- Promena iznosa ide isključivo preko RPC `change_rate(p_rate uuid, p_effective_from date, p_amount numeric, p_currency text, p_reason text)`: stari red dobija `effective_to = p_effective_from - 1` i `superseded_by`, a pravi se novi red. Ako je `p_effective_from = effective_from` starog reda, stari ide u `status='inactive'`.
- `set_rate(p jsonb)` pravi novi red (scope, kind, ključ, from, to, amount, currency, reason).
- **Brisanje** je dozvoljeno samo ako se nijedna satnica ne poziva na `id` (`rate_snapshot` v1 `worker.ref`/`client.ref`, v2 `days[*].worker.ref`/`client.ref`). Inače `status='inactive'`.
- Preklapanje istog `rate_key` u aktivnom statusu odbija `rates_no_overlap` (`23P01`, poruka u `src/api/errors.js`).

**Normalizacija postojećih redova pre ograničenja** (čuva rezultat izbora za svaki dan, jer izbor uvek uzima najnoviji `effective_from`). Po `rate_key`, redom po `effective_from`:
- Isti `effective_from` više puta: pobednik je kao u `pickLatest` (najnoviji `created_date`, pa `id`); ostali → `status='inactive'` + `migration_report`.
- Red A koji preklapa kasniji B:
  - ako se A završava pre kraja B ili je kraj isti: `A.effective_to = B.effective_from - 1`;
  - ako A traje posle kraja B: A se seče na deo pre B, a insertuje se kopija A od `B.effective_to + 1` do starog `A.effective_to` (nov `id`, `change_reason='split: migracija 03'`).
- Svaka izmena ide u `migration_report`.

**Prenos starih izvora u `rates`** (posle backfill-a dodela, idempotentno, `change_reason='migracija 03: <izvor>'`):
1. `assigned_employees[*].b2c_rate|b2b_rate > 0` → `assignment_rate` (`kind` po polju) na dodeli tog radnika i projekta. Opseg `[start_date, end_date]` dodele, ali samo za podintervale koje nijedan postojeći `assignment` red istog `kind` ne pokriva (popunjavanje rupa). Postojeći red je ranije pobeđivao, pa rezultat ostaje isti.
2. `job_roles[*].b2b_rate > 0` → `role_rate` revenue. Upisuje se samo ako za projekat ne postoji aktivan `project` revenue red (ni za tu poziciju ni za ceo projekat) koji bi ranije pobedio. Inače red ide u `migration_report` (`issue='job_role_rate_shadowed'`) i rešava ga Finance. `effective_from = least(p.start_date, prvi dan satnica projekta, p.created_date::date)`. `job_roles[*].b2c_rate` nikad nije bio nivo izbora: ide samo u report.
3. Postojeći `rates` `scope='project'` sa `position` dobija `project_role_id` po `title_key`.
4. `employee_private.b2c_hourly_rate|b2b_hourly_rate > 0` (D30 K5: profil više nije izvor) → `employee_rate` za podintervale `[least(e.start_date, prvi dan satnica, e.created_date::date), ∞)` koje postojeći `employee` redovi ne pokrivaju. Kolone u `employee_private` ostaju (D26), ali se više ne čitaju.
5. **Posebne satnice iz profila** (`overtime_rate`, `weekend_rate`, `holiday_rate`) više nisu izvor (spec §5 zna samo za koeficijente). Svaki radnik koji ih ima ide u `migration_report` (`issue='profile_special_rate_dropped'`). Važi za nacrte; odobreno ostaje isto.

**Provera rezultata:** stara funkcija se čuva kao `resolve_timesheet_rate_v1` (samo do W3). Migracija za svaku ne-odobrenu satnicu i svaki dan sa satima poredi `v1` sa novom `resolve_rate`. Razlika ide u `migration_report` (`issue='rate_resolution_changed'`, `details={timesheet_id, date, side, old, new}`).

**Izbor u bazi:**

```text
resolve_rate(p_side text /*'worker'|'client'*/, p_employee uuid, p_project uuid, p_date date,
             p_assignment uuid default null) returns jsonb
```

- Vraća `{rate, currency, source, ref, assignment_id, project_role_id}` ili `{error:'missing'|'unit', ...}`.
- Dodela: `p_assignment` ako pokriva datum, inače ne-`cancelled` dodele koje pokrivaju datum, najnoviji `start_date`, pa `id`.
- Uloga: `project_role_id` te dodele.
- Unutar nivoa pobeđuje najnoviji `effective_from`. Uz `rates_no_overlap` takav je uvek jedan.
- `resolve_timesheet_rate(side, emp, proj, date)` ostaje kao wrapper.

**JS (`src/lib/payroll/rates.js` v2):**
- `RATE_SOURCES = {ASSIGNMENT_RATE:'assignment_rate', ROLE_RATE:'role_rate', PROJECT_RATE:'project_rate', EMPLOYEE_RATE:'employee_rate'}`
- `RATE_ORDER.worker = RATE_ORDER.client = [assignment_rate, role_rate, project_rate, employee_rate]`
- `resolveRates({date, employeeId, projectId, assignmentId?, assignments, rates})` → `{worker:{rate,currency,source,ref}, client:{...}}`
- Uklanja se `RateUnitError` za valutu; ostaje za jedinicu.
- Primer u `src/lib/payroll/rateHistory.test.js` „T07 …" i isti u pgTAP 23.

### 2.6 Timesheets (T-A2, migracija 04)

**Odluka:** nedeljni red (`timesheets`: radnik × projekat × nedelja, sati po danu) ostaje osnovni zapis i jedinica odobravanja (D12, postojeći ekran). Dopunjuje se:
- `assignment_id` (obavezan za Submit/Approve);
- opcionim intervalima rada po danu (`timesheet_entries`);
- izborom tarife **po datumu rada** (K12, T07);
- korekcijom uz razlog (K11);
- valutom iznosa (K3).

**Kolone koje se dodaju u `timesheets`:**

```text
assignment_id uuid FK→project_assignments r null
worker_currency text not null default 'EUR' check in (...), client_currency text not null default 'EUR' check in (...)
submitted_by uuid FK→auth.users n, submitted_at timestamptz
rejected_by uuid FK→auth.users n, rejected_at timestamptz, rejection_reason text
calc_problems jsonb          -- null = ok; inače [{code, date?, side?, detail}] (bez iznosa, vidljivo svima)
estimate_days jsonb         -- samo za ne-odobren red: dnevne linije po važećim pravilima (procena)
correction_count integer not null default 0, last_correction_reason text
```

`b2c_rate`/`b2b_rate` postaju **izvedeni**: tarifa ako je ista za sve dane nedelje, inače null + `rate_snapshot.mixed=true`. Vrednosti koje pošalje ekran se ignorišu; tarife bira baza.

**Unique:** `timesheets_one_per_week` se zamenjuje sa `unique index timesheets_one_per_assignment_week on (employee_id, project_id, assignment_id, week_start) nulls not distinct where project_id is not null`. Transfer usred nedelje na istom projektu tako dobija dva reda.

**Intervali (§6, T10):**

```text
timesheet_entries(
  id uuid PK, timesheet_id uuid not null FK→timesheets c,
  employee_id uuid not null, project_id uuid, assignment_id uuid,    -- denormalizovano triggerom iz reda
  work_date date not null,             -- mora biti u nedelji reda
  shift_id uuid FK→shifts n null,
  start_time time, end_time time, break_minutes integer not null default 0 check (>= 0),
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  work_interval tsrange generated always as (case when start_time is not null and end_time is not null then
    tsrange(work_date + start_time, work_date + end_time
      + case when end_time <= start_time then interval '1 day' else interval '0' end, '[)') end) stored,
  counts boolean not null default true,  -- false kad je red 'rejected' (trigger sa reda)
  notes text, created_date, updated_date, created_by,
  constraint timesheet_entries_no_overlap exclude using gist
    (employee_id with =, work_interval with &&) where (counts and work_interval is not null))
```

- Ako dan ima unose, kolona dana u redu je zbir `hours` unosa. Trigger `sync_timesheet_day_from_entries` piše uz `app.entries_sync='on'`. Ručna izmena kolone dana koji ima unose se odbija.
- Dan bez unosa ostaje ručni unos sati (stari način).
- Ako je zadat `shift_id` bez vremena, vreme se uzima iz smene.
- RLS kao `timesheets`; audit trigger da.

**Dnevni zbir (§6):** `work_rules.max_daily_hours numeric(4,2) not null default 24 check (> 0 and <= 24)`, admin ga menja u Coefficients & Holidays. `guard_timesheet` uz `pg_advisory_xact_lock(hashtext('ts:'||employee_id))` odbija dan gde je zbir sati svih ne-odbijenih satnica radnika za taj datum (svi projekti) veći od `max_daily_hours`. Poruka sadrži datum i projekte.

**Tok statusa i prava (`guard_timesheet` v4):**

| Prelaz | Pravo | Dodatno |
|---|---|---|
| insert/izmena nacrta | `timesheets.edit` + `can_see_project` | računa `hours_by_type`, `estimate_days`, `calc_problems` |
| `draft → submitted` | `timesheets.edit` | `assignment_id` not null; svaki dan sa satima u opsegu dodele; `submitted_by/at` |
| `submitted → approved` | `timesheets.approve` + `can_see_project` | bez `calc_problems`; per-day tarife; snimak v2; `approved_by/at` |
| `submitted → rejected` | `timesheets.approve` | `rejected_by/at`, `rejection_reason` |
| `rejected → draft` | `timesheets.edit` | — |
| `approved → draft` | samo RPC `reopen_timesheet` | direktan update se odbija |

**`assignment_id`:** ako je null pri upisu, trigger postavlja jedinu ne-`cancelled` dodelu koja pokriva sve dane sa satima. Više od jedne → `calc_problems` `assignment_ambiguous`. Nijedna → `assignment_missing`. Nacrt se tada čuva, ali Submit ne prolazi.

**Tarifa po datumu (K12) i snimak v2.** Funkcija `timesheet_day_lines(t timesheets) returns jsonb` vraća niz:

```text
{date, code /* redovni|prekovremeni|vikend|praznik|praznik_vikend */, hours,
 worker:{rate, currency, source, ref, coef, from? /* za praznik_vikend */},
 client:{rate, currency, source, ref, coef, from?},
 worker_cost, client_revenue}
```

- Dan se razvrstava kao `timesheet_hours_by_type` (D29) za jedan dan.
- Tarifa dana: `resolve_rate(side, employee, project, date, assignment_id)`.
- Koeficijent: `hour_types`.
- Iznos je zaokružen na cent po liniji.
- Posebne satnice iz profila se više ne koriste (K5).

`rate_snapshot` v2 (samo za odobren red, upisuje baza):

```text
{version: 2, daily_regular_hours, max_daily_hours, holidays: [...], days: [timesheet_day_lines],
 lines: [zbir po (code, worker.rate, worker.coef, worker.currency, client.rate, client.coef, client.currency)],
 worker: {rate|null, mixed: bool}, client: {rate|null, mixed: bool}, approved_at}
```

- `worker_cost`/`client_revenue` reda = zbir `days[*]` iznosa (već zaokruženih).
- `profit` = razlika samo kad su `worker_currency = client_currency`, inače null.
- Valuta reda je valuta tarife. Dve različite valute iste strane u istoj nedelji su `calc_problems` `mixed_currency` (odobravanje odbijeno).
- **v1 snimci (odobreni ranije) ostaju kakvi jesu.** Svi čitaoci rade sa oba (`version` nedostaje = v1).

**Korekcija (K11, §6.05).** `reopen_timesheet(p_id uuid, p_reason text) returns void`:
- Traži `timesheets.correct` + `can_see_project`. Razlog `btrim` mora imati najmanje 5 znakova.
- Ako je mesec bilo kog dana zaključan, a za mesec **ne postoji** `payroll_runs` u statusu `approved|paid`: briše nacrt obračuna tog meseca, otključava mesec (`month_locks`), a audit dobija `action='correction'` za oba.
- Ako postoji odobren/isplaćen obračun: odbija sa porukom „Period je zaključen odobrenim obračunom — korekcija ide kao Payable adjustment (Payroll)". Vidi §2.8 (`payable_lines.kind='adjustment'`).
- Postavlja `approval_status='draft'`, `correction_count+1`, `last_correction_reason`, `app.audit_reason`, `app.audit_action='correction'`.

**Dnevne linije za ceo sistem (jedan izvor).** U 04 se dodaje:

```text
labor_day_lines(p_from date, p_to date, p_project uuid default null) returns table(
  timesheet_id uuid, employee_id uuid, project_id uuid, client_id uuid, assignment_id uuid, project_role_id uuid,
  payee_type text, payee_id uuid, work_date date, hour_type text, hours numeric,
  worker_rate numeric, worker_coef numeric, worker_currency text, worker_source text,
  client_rate numeric, client_coef numeric, client_currency text, client_source text,
  snapshot_version int)
```

- Samo `approval_status='approved'`.
- v2: direktno iz `days`.
- v1: dan se razvrstava po pragu i praznicima iz snimka, a tarife i koeficijenti se uzimaju iz `lines` po `code`. To je port `timesheetMonthLines`, sa istim problemima (`NO_SNAPSHOT`, `SNAPSHOT_MISMATCH`), koji idu u `labor_day_problems(p_from, p_to)`.
- `payee`: dodela `subcontractor_worker` + `vendor_id` → `('vendor', vendor_id)`, inače `('employee', employee_id)`. Bez dodele važi `timesheets.vendor_id` snimak, pa `employment_history` na datum.
- Interna je (revoke `authenticated`); koriste je `generate_payables`, `set_billing_status` i testovi.

**Vidljivost novca u satnici (T26, §15).**
- `revoke select on public.timesheets from authenticated;`
- `grant select (<sve kolone osim osetljivih>) on public.timesheets to authenticated;`
- Osetljive kolone: `b2c_rate, b2b_rate, worker_cost, client_revenue, profit, rate_snapshot, estimate_days`.
- `insert/update` ostaju na nivou tabele (iznose ionako računa trigger).
- Svaka buduća nova kolona `timesheets` mora dobiti `grant select (kolona)` u istoj migraciji.

View sa maskom po pravu:

```text
create view public.timesheet_money with (security_barrier) as
select t.id as timesheet_id,
  case when has_permission('rates.view_b2b') then t.b2b_rate end as b2b_rate,
  case when has_permission('rates.view_b2b') then t.client_revenue end as client_revenue,
  case when has_permission('rates.view_b2c') then t.b2c_rate end as b2c_rate,
  case when has_permission('rates.view_b2c') then t.worker_cost end as worker_cost,
  case when has_permission('rates.view_b2b') and has_permission('rates.view_b2c') then t.profit end as profit,
  public.mask_rate_snapshot(t.rate_snapshot) as rate_snapshot,
  public.mask_rate_snapshot(t.estimate_days) as estimate_days
from public.timesheets t
where public.can_see_project(t.project_id) or (t.project_id is null and public.can_see_project(null));
```

- Vlasnik view-a je postgres, pa RLS nad tabelom ne važi i filter je u view-u.
- `mask_rate_snapshot(jsonb)` nulira `worker.*` bez `rates.view_b2c` i `client.*` bez `rates.view_b2b`, u `days`, `lines` i vrhu.

**`base44Client.js` (T-A2, mala Edit umetanja):**
- `SENSITIVE_COLUMNS = { timesheets: [...] }`;
- `Timesheet` čita eksplicitnu listu kolona (`TABLE_COLUMNS.timesheets` minus osetljive), umesto `*`;
- posle čitanja, ako `my_permissions()` sadrži `rates.view_b2b` ili `rates.view_b2c`, učitava `timesheet_money` po `id` (u delovima od 500) i spaja u red (kao `employee_private`);
- insert/update vraćaju istu eksplicitnu listu.
- Postojeće stranice i dalje čitaju `ts.worker_cost`; bez prava je `undefined`, prikaz „—".

**JS (T-A2):**
- `src/lib/payroll/timesheetDays.js`:
  - `timesheetDayLines(row)` → `{ lines:[{date, projectId, employeeId, assignmentId, hourType, hours, workerRate, workerCoef, workerCurrency, clientRate, clientCoef, clientCurrency, timesheetId, weekStart}], problems }` (v1 i v2; zamenjuje unutrašnjost `timesheetMonthLines`);
  - `dayInterval(entry)`, `overlaps(a,b)`, `dailyTotals(rows)`.
- `payrollMonth.timesheetMonthLines(row, month)` = `timesheetDayLines` filtrirano na mesec (isti izlaz kao do sada za v1).
- Problem `rate_not_eur`: srpski mesečni obračun prima samo EUR tarife (D7).

### 2.7 Project Costs dopune (T-C, migracija 05)

`project_costs` dodaje:

```text
cost_date date            -- backfill created_date::date, pa alter ... set not null
cost_category_id uuid FK→cost_categories r null   -- backfill po cost_category_key(category)
employee_id uuid FK→employees r null, vendor_id uuid FK→vendors r null,
  check (num_nonnulls(employee_id, vendor_id) <= 1)
billable boolean not null default false
receipt_url text, receipt_name text      -- privatni bucket, FILE_FIELDS.project_costs = ['receipt_url']
fx_rate_date date                        -- datum kursa (K3); eur_rsd_rate = „jedinica valute za 1 EUR"
currency check → ('EUR','RSD','GBP','USD')
cost_categories: + payroll_linked boolean not null default false
```

`guard_project_cost` v2:
- `cost_date`, `amount`, `currency` i `cost_category_id` su obavezni za insert. Stari redovi bez kategorije ostaju, ali pri izmeni moraju dobiti kategoriju.
- Ako kategorija ima podkategorije (`jsonb_array_length(subcategories) > 0`), `subcategory` je obavezna i mora postojati u JSON-u (po `cost_category_key`).
- `category`/`subcategory` tekst se snima iz kategorije (snimak za prikaz). Preimenovanje kategorije osvežava snimak triggerom `propagate_cost_category_rename`.
- Ne-EUR zahteva `eur_rsd_rate > 0` **i** `fx_rate_date`, i to za insert i za izmenu iznosa, valute ili kursa. Stari ne-EUR red bez datuma ostaje, a UI ga prikazuje kao „datum kursa nije evidentiran".
- Kategorija sa `payroll_linked = true` se odbija: „Trošak rada ide kroz Timesheets/Payroll" (§8.1.6).
- `billable` ne utiče ni na šta osim prikaza (§8.2.4, T15).

Audit je već prikačen (01); RLS radi T-B 02. Nepovezane kategorije pri backfill-u idu u `migration_report`. JS `src/lib/projectCosts.js`:
- `filterCosts(costs, {projectId, clientId, categoryId, subcategory, from, to, search})`;
- `costTotalsByCurrency(costs)` (preko `sumByCurrency`);
- `costsByCategory(costs)`;
- `costExportRows(costs, perms)`;
- `possibleDuplicate(cost, costs)` (isti projekat, datum, iznos, valuta → samo upozorenje).

### 2.8 Payables + Payments (W2-E, migracija 08)

```text
payables(
  id uuid PK, period_start date not null, period_end date not null check (period_end >= period_start),
  payee_type text not null check in ('employee','vendor'),
  employee_id uuid FK→employees r null, vendor_id uuid FK→vendors r null,
  check ((payee_type='employee' and employee_id is not null and vendor_id is null)
      or (payee_type='vendor' and vendor_id is not null and employee_id is null)),
  currency text not null check in (...),
  calculated_amount numeric(12,2) not null default 0,     -- zbir 'labor' linija (B2C × worker coef)
  adjustments_amount numeric(12,2) not null default 0,    -- zbir 'adjustment' linija (trigger)
  total_amount numeric(12,2) generated always as (calculated_amount + adjustments_amount) stored,
  status text not null default 'draft' check in ('draft','confirmed','cancelled'),
  due_date date, confirmed_by uuid, confirmed_at timestamptz,
  payroll_run_id uuid FK→payroll_runs n null,   -- informativna veza sa srpskim obračunom
  notes text, created_date, updated_date, created_by)
exclude using gist (payee_type with =, coalesce(employee_id, vendor_id) with =, currency with =,
  daterange(period_start, period_end, '[]') with &&) where (status <> 'cancelled')

payable_lines(
  id uuid PK, payable_id uuid not null FK→payables c,
  kind text not null check in ('labor','adjustment'),
  employee_id uuid FK→employees r, project_id uuid FK→projects r, assignment_id uuid FK→project_assignments r,
  hours numeric(10,2), amount numeric(12,2) not null, currency text not null,
  reason text, check (kind <> 'adjustment' or length(btrim(reason)) >= 5),
  created_date, created_by)

payments(
  id uuid PK, payable_id uuid not null FK→payables r,     -- jedan payment = jedna obaveza (nema duplog vezivanja)
  payment_date date not null, amount numeric(12,2) not null check (amount > 0),
  currency text not null, reference text, description text,
  recorded_by uuid not null default auth.uid(), recorded_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  check (voided_at is null or length(btrim(void_reason)) >= 5))
```

**`guard_payment`:**
- `currency` mora biti jednaka valuti obaveze; obaveza mora biti `confirmed`.
- Zbir ne-storniranih uplata + nova uplata ≤ `total_amount`. Inače: „Preplata — evidentirajte korekciju (adjustment) sa razlogom".
- Update je dozvoljen samo za storno (`voided_*`); `delete` se odbija.
- `payment.payable_id` se ne menja.

**`guard_payable`:** posle `confirmed` se ne menjaju `calculated_amount`, valuta, period ni payee. Dodaju se samo `adjustment` linije. Prelaz u `cancelled` je dozvoljen samo bez uplata.

**`generate_payables(p_from date, p_to date) returns int`** (`payroll.manage`):
- Iz `labor_day_lines` grupiše po `(payee_type, payee_id, worker_currency)`. Za svaku grupu pravi ili osvežava `draft` obavezu.
- Linije su `labor` po `(employee, project, assignment)`. Iznos = `round(sum(hours × worker_rate × worker_coef))` po grupi iz §3.2.
- `confirmed` obavezu ne menja. Razliku prijavljuje `payable_problems(p_from, p_to)` (Finance dodaje korekciju).
- `due_date` se ne izmišlja: prazno, ili `period_end + vendors.payment_terms_days`. To je nova kolona `vendors.payment_terms_days int null`.
- Problemi iz `labor_day_problems` blokiraju generisanje za tog payee-ja (poruka po radniku i nedelji).

**Pravilo za direktne radnike:** obaveza je obračunata po B2C (spec §7, §10). Neto iz srpskog obračuna (`payslips.neto`, D17/D21) prikazuje se pored obaveze radi poređenja, a razliku Finance unosi kao `adjustment` sa razlogom.

**View `payable_balances`:** `payable_id, total_amount, paid_amount, remaining_amount, payment_status ('unpaid'|'partially_paid'|'paid'), overdue boolean (due_date < current_date and remaining > 0)`.

**RLS:** select `payroll.view`; write `payroll.manage` (`payables`, `payable_lines`), `payments.record` (`payments`). Audit trigger: `payables`, `payable_lines`, `payments`.

**Prava u starim funkcijama (W2-E):** `lock_month`, `unlock_month`, `save_payroll_draft`, `approve_payroll_run`, `mark_payroll_paid`, `payroll_run_problems` se redefinišu sa `has_permission('payroll.manage')` (čitanje problema: `payroll.view`). Telo funkcija se inače ne menja.

### 2.9 Billing Summary + Client Payment (W2-F, migracija 09)

```text
billing_summaries(
  id uuid PK, client_id uuid not null FK→clients r, project_id uuid FK→projects r null,  -- null = svi projekti klijenta
  period_start date not null, period_end date not null, currency text not null,
  status text not null default 'in_preparation'
    check in ('in_preparation','ready_for_accounting','sent_to_accounting','invoiced_externally'),
  status_changed_by uuid, status_changed_at timestamptz,
  calculated_hours numeric(10,2), calculated_amount numeric(12,2), calculated_at timestamptz,  -- zamrznuto van in_preparation
  ext_invoice_reference text, ext_invoice_date date, ext_invoice_amount numeric(12,2) check (> 0),
  ext_invoice_currency text, ext_due_date date,
  notes text, created_date, updated_date, created_by)
billing_summary_lines(summary_id uuid FK→billing_summaries c, project_id, employee_id, project_role_id,
  hour_type, hours numeric(10,2), client_rate numeric, client_coef numeric, amount numeric(12,2), currency text)
billing_summary_costs(summary_id uuid FK c, project_cost_id uuid FK→project_costs r unique)  -- billable trošak u jednom pregledu
billing_status_history(id bigint identity, summary_id uuid FK c, from_status text, to_status text,
  changed_by uuid default auth.uid(), changed_at timestamptz default now(), note text)
client_payments(
  id uuid PK, client_id uuid not null FK→clients r, project_id uuid FK→projects r null,
  billing_summary_id uuid FK→billing_summaries r null, period_start date, period_end date,
  payment_date date not null, amount numeric(12,2) not null check (> 0), currency text not null,
  reference text, ext_invoice_reference text, notes text,
  recorded_by uuid not null default auth.uid(), recorded_at timestamptz default now(),
  voided_at timestamptz, voided_by uuid, void_reason text)
```

**Ograničenja:**
- Isti klijent, ista valuta i preklopljen period se ne mogu obračunati dvaput. Trigger `guard_billing_overlap` proverava i par „ceo klijent" naspram „projekat tog klijenta".
- U tabelama **nema** kolone ni sekvence za broj fakture koju bi generisao sistem (T29).

**`set_billing_status(p_id, p_status, p_note)`** (`billing.manage`):
- Dozvoljeno je samo jedan korak napred, ili `ready_for_accounting → in_preparation` dok nema `ext_invoice_*`.
- Pri izlasku iz `in_preparation` baza računa i zamrzava `billing_summary_lines` iz `labor_day_lines` (prihodna strana, grupisanje iz §3.2) i `calculated_*`.
- Upisuje `billing_status_history` i `status_changed_*`.
- Direktan update `status` se odbija.

**Client payment:**
- Valuta = `ext_invoice_currency` ako postoji, inače `currency` pregleda.
- Kada je `ext_invoice_amount` upisan, zbir ne-storniranih uplata ne sme preći taj iznos (korekcija = storno uz razlog).
- Delete se odbija.

**View `billing_balances`:** `summary_id, calculated_amount, invoiced_amount (= ext_invoice_amount), received_amount, outstanding (invoiced − received, samo kad invoiced nije null), estimated_unpaid (calculated − received, samo kad invoiced je null), payment_status ('unpaid'|'partially_paid'|'paid'), overdue (ext_due_date < current_date and outstanding > 0)`.

**`clients.default_b2b_rate`** je tarifa i HR je ne sme čitati: `revoke select (default_b2b_rate) on clients from authenticated` + view `client_money(client_id, default_b2b_rate)` uz `rates.view_b2b`. `base44Client` `SENSITIVE_COLUMNS.clients` (W2-F).

**RLS:** select `billing.view`; write `billing.manage`. Audit: `billing_summaries`, `client_payments`, `billing_summary_costs`.

### 2.10 Required Documents, Onboarding, audit preuzimanja (T-D, migracija 06)

```text
document_types(code text PK, name text not null, sensitive boolean not null default true,
  sort integer not null default 0, active boolean not null default true)
  seed = 12 postojećih documents.category vrednosti; sensitive = true za id_card, passport, work_permit,
  contract, medical_certificate, insurance; false za certificate, diploma, training_certificate,
  driver_license, safety_certificate, other (podrazumevano; menja settings.manage)
documents: + issue_date date, + restricted boolean not null default false,
  check (issue_date is null or expiration_date is null or issue_date <= expiration_date),
  FK documents.category → document_types(code) on update cascade
required_documents(
  id uuid PK, project_id uuid not null FK→projects c, project_role_id uuid FK→project_roles c null,  -- null = sve uloge
  document_type text not null FK→document_types(code),
  mandatory boolean not null default true,
  validity_rule text not null default 'assignment_period' check in ('assignment_period','assignment_start','none'),
  expiring_soon_days integer not null default 30 check (>= 0),
  exportable boolean not null default true, notes text, created_date, updated_date, created_by)
unique index on (project_id, coalesce(project_role_id, zero), document_type)
onboarding_packages(
  id uuid PK, project_id uuid not null FK→projects r, employee_ids uuid[] not null,
  status text not null default 'incomplete' check in ('incomplete','ready'),
  manifest jsonb not null,          -- preview u trenutku pripreme (radnici, stavke, statusi, istek)
  prepared_by uuid default auth.uid(), prepared_at timestamptz default now(), notes text)
onboarding_package_downloads(
  id uuid PK, package_id uuid not null FK→onboarding_packages r,
  downloaded_by uuid not null default auth.uid(), downloaded_at timestamptz not null default now(),
  document_ids uuid[] not null, file_count integer not null)
```

**Status zahteva** (isti algoritam u `src/lib/onboarding.js` i u SQL `onboarding_manifest`). Za radnika W i dodelu A (uloga R, start S, kraj E), zahtevi su Q = `required_documents` projekta gde je `project_role_id` null ili = R.
- `R0 = max(today, S)`; `R1 = E ?? R0`. Za `assignment_start`: `R1 = R0`; za `none`: `R0 = R1 = today`.
- Kandidati: dokumenti radnika sa `category = q.document_type`. Najbolji je onaj sa najkasnijim `expiration_date` (null = bez isteka).

| Status | Uslov |
|---|---|
| `missing` | nema kandidata |
| `expired` | `expiration_date < R1` (ne važi za ceo planirani period) |
| `expiring_soon` | važi do R1, ali `expiration_date ≤ today + expiring_soon_days` |
| `available` | ostalo |
| `not_permitted` | u paketu: dokument postoji i važi, ali `q.exportable = false`, ili je osetljiv (`type.sensitive or doc.restricted`), a korisnik nema `documents.view_sensitive` |

- **Radnik:** `ready` ako je svaki `mandatory` zahtev `available | expiring_soon | not_permitted`. Inače `action_required` sa listom `{document_type, status, expiration_date}`.
- **Paket:** `incomplete` ako je bilo koji izabrani radnik `action_required`. `ready` se odbija za takav paket (trigger poziva `onboarding_manifest`).
- Provera se ponavlja na svakom čitanju; status se ne kešira, osim u `manifest` snimku paketa.

**RPC-ovi:**
- `prepare_onboarding_package(p_project uuid, p_employee_ids uuid[], p_ready boolean) returns uuid` traži `onboarding.manage` + `can_see_project` i upisuje `audit_event('onboarding_packages', id, 'prepare', manifest)`.
- `start_onboarding_download(p_package uuid) returns jsonb` traži `onboarding.export` + `can_see_project`. Vraća samo dozvoljene i postojeće dokumente (`[{document_id, employee_id, file_path, file_name, document_type}]`), upisuje `onboarding_package_downloads` i `audit_event(..., 'download', ...)`.
- Pregledač potpisuje linkove (storage RLS proverava svaki fajl) i pakuje ZIP (`jszip`, nova zavisnost; dodaje je samo T-D).

**Storage (T19).** `can_read_storage_object(p_name text) returns boolean`: ako postoji `documents` red sa `file_url = 'storage://files/' || p_name` i taj dokument je osetljiv, traži se `documents.view_sensitive`; inače `is_staff()`. Politike `files_staff_read` i `files_staff_update/delete` se zamenjuju sa `bucket_id='files' and public.can_read_storage_object(name)`. Za update/delete dokumenta još i `documents.manage`.

**RLS:**
- `document_types`: select staff; write `settings.manage`.
- `required_documents`: select `can_see_project`; write `onboarding.manage`.
- `onboarding_*`: select `onboarding.manage` ili `onboarding.export`, uz `can_see_project`; insert samo preko RPC-a.
- Audit: `required_documents`, `onboarding_packages`.

### 2.11 Workforce Requirements, smene, Schedule (T-G, migracija 07)

```text
workforce_requirements(
  id uuid PK, project_id uuid not null FK→projects c,
  project_role_id uuid not null FK→project_roles r, shift_id uuid not null FK→shifts r,
  date_from date not null, date_to date not null check (date_to >= date_from),
  required_count integer not null check (required_count >= 0), notes text,
  created_date, updated_date, created_by,
  constraint workforce_requirements_no_overlap exclude using gist (project_role_id with =, shift_id with =,
    daterange(date_from, date_to, '[]') with &&))
schedules: + project_id uuid FK→projects n, + assignment_id uuid FK→project_assignments n,
           + shift_id uuid FK→shifts n,
           + status text not null default 'assigned' check in ('assigned','standby','replacement','released'),
           + start_at timestamp, + end_at timestamp    -- trigger: iz shift_id ili date + shift_start/shift_end ('HH:MM')
```

- Trigger proverava da `project_role_id` pripada `project_id`.
- `set_workforce_requirement(p_role uuid, p_shift uuid, p_from date, p_to date, p_count int, p_note text)` traži `workforce.manage`. Preklopljene postojeće opsege seče kao Rate History, pa se broj menja od datuma (T20).
- `guard_schedule_overlap`: isti radnik, status ≠ `released`, preklopljen `[start_at, end_at)` se odbija (novi/izmenjeni redovi; postojeći preklopi idu u `migration_report`).
- `assignment_id` mora pripadati istom radniku i projektu.

**Jedinstvena definicija dostupnosti** (SQL `workforce_coverage` i JS `coverage` moraju dati isto).
- **Planiran na (projekat P, uloga R, datum D, smena H):**
  - postoji `schedules` red radnika za P, D, H sa statusom `assigned` ili `replacement`, i njegova dodela ima ulogu R; **ili**
  - radnik tog dana nema nijedan `schedules` red, a ima ne-`cancelled` dodelu na P koja pokriva D, sa `project_role_id = R` i `default_shift_id = H`.
- **Odsutan:** odobren `leave_requests` koji pokriva D. U simulaciji je odsutan i zahtev `p_simulate_leave`.
- `available = planned − odsutni`; `deficit = max(required − available, 0)`; `surplus = max(available − required, 0)`.
- **Slobodan za zamenu (T05):** radnik nije planiran ni u jednoj smeni čiji se interval preklapa sa intervalom H na D, nije odsutan, nije `released`. Kvalifikovan je ako ima dodelu ili istoriju na ulozi sa istim `project_roles.title_key` (ili istim `department_position`). Radnik sa aktivnim angažmanom, ali slobodnom smenom, **je** dostupan.

**SQL:**
- `workforce_coverage(p_from date, p_to date, p_project uuid default null, p_simulate_leave uuid default null) returns table(project_id, project_role_id, shift_id, work_date, required int, planned int, absent int, available int, deficit int, surplus int)` je `security definer`, poštuje `can_see_project` i ima grant `authenticated`.
- `worker_is_free(p_employee uuid, p_date date, p_shift uuid) returns boolean`.

**JS `src/lib/workforce.js`** (T-G):
- `shiftInterval(shift, date)`, `intervalsOverlap(a,b)`, `plannedOn(...)`;
- `coverage({requirements, assignments, schedules, leaves, shifts, from, to, simulateLeaveId})` → `[{projectId, projectRoleId, shiftId, date, required, planned, absent, available, deficit, surplus, coveringEmployeeIds, missing}]`;
- `availableWorkers({date, shiftId, roleKey, employees, assignments, schedules, leaves, shifts, projectRoles})`;
- `shortageProjects(coverage)` (broj projekata sa deficitom; za Quick Insights i Dashboard);
- `ganttCell(...)` → `'assigned'|'available'|'standby'|'leave'|'sick_leave'|'other_absence'|'replacement'`;
- `absenceKind(leave_type)`: `vacation|personal|unpaid → leave`, `sick → sick_leave`, `maternity|paternity|other → other_absence`. Isto u SQL `absence_kind(text)`.

**RLS:**
- `workforce_requirements`: select `can_see_project`; write `workforce.manage`.
- `schedules` (T-G menja politike): select staff gde je `project_id` null ili `can_see_project`; write `workforce.manage`.
- Audit: `workforce_requirements`, `schedules`.

### 2.12 Leave kapacitet, odobrenje uprkos manjku, zamene (W2-L, migracija 10)

`leave_requests` dodaje: `requested_by uuid default auth.uid()`, `decided_by uuid`, `decided_at timestamptz`, `decision_reason text`, `shortage_override boolean not null default false`, `shortage_snapshot jsonb`.
- `reviewed_by` (tekst) ostaje i trigger ga puni imenom.
- Trigger `guard_leave_decision`: promena `status` van `app.leave_decision='on'` se odbija. Zahtev koji preklapa drugi odobren zahtev istog radnika se odbija.

**`decide_leave_request(p_id uuid, p_decision text /*'approved'|'rejected'*/, p_reason text)`:**
- Traži `leave.approve`.
- Računa `workforce_coverage(start, end, null, p_id)` za projekte gde radnik ima dodele. Ako je neki `deficit > 0` i odluka je `approved`, traži `leave.approve_shortage` i razlog od najmanje 5 znakova (T24).
- Upisuje `shortage_snapshot = [{project_id, project_role_id, shift_id, date, required, available, deficit}]`, `shortage_override`, `decided_*` i audit `action='status'` sa razlogom.
- Nikad ne odbija automatski zbog manjka (§14.1).

**`assign_replacement(p_leave uuid, p_employee uuid, p_project uuid, p_role uuid, p_shift uuid, p_from date, p_to date, p_source_assignment uuid default null, p_ack_source_shortage boolean default false) returns uuid`:**
- Traži `workforce.manage` + `can_see_project`.
- Kod transfera (`p_source_assignment`) računa coverage izvornog projekta bez radnika. Deficit bez `p_ack_source_shortage = true` → greška sa brojem (T23).
- Pravi `project_assignments` (`assignment_type='replacement'`, `leave_request_id`, `source_assignment_id`, `default_shift_id`, `start/end`).
- Pravi `schedules` (`status='replacement'`) za svaki dan. Izvorni `schedules` u istim danima i smeni postaju `released`.
- Postojeće dodele se ne završavaju; istorija ostaje.

**JS `src/lib/replacements.js`:**
- `rankCandidates({need:{projectId, projectRoleId, roleKey, shiftId, from, to}, employees, assignments, schedules, leaves, shifts, documents, requiredDocuments, projects, rates?})` → `[{employeeId, category, score, reasons[], missingDocuments[], sourceImpact?}]`.
- `category ∈ full_match | partial_availability | transfer_required | not_eligible`.
- Redosled kriterijuma (§14.2): uloga → puna raspoloživost → sertifikati (`required_documents` za ulogu) → onboarding readiness → lokacija (`employees.city`/`work_location` naspram `projects.city`, kad je poznato) → B2C (samo uz `rates.view_b2c`).
- Prvo slobodni i standby, pa ostali kvalifikovani (`transfer_required`).

### 2.13 Notifications (W2-H, migracija 11)

`notifications` dodaje:

```text
recipient_user_id uuid FK→profiles c null, audience_permission text FK→permissions(code) null,
event_key text, entity_table text, entity_id text, project_id uuid FK→projects c null,
severity text not null default 'info' check in ('info','warning','critical'), due_date date, resolved_at timestamptz
unique index notifications_event_key on (event_key) where event_key is not null
type check → postojeće + ('workforce_shortage','replacement_candidate','assignment_expiry',
  'timesheet_pending','payable_due','receivable_due','document_missing')
notification_reads(notification_id uuid FK c, user_id uuid FK→profiles c, read_at timestamptz default now(),
  PK(notification_id, user_id))
```

**`refresh_notifications() returns int`** (`security definer`, staff, idempotentno, `on conflict (event_key) do nothing`; uslov koji više ne važi dobija `resolved_at`):

| Događaj | event_key | audience_permission |
|---|---|---|
| odmor na čekanju | `leave_pending:<id>` | `leave.approve` |
| deficit (danas..+30) | `shortage:<project>:<role>:<shift>:<date>` | `workforce.manage` |
| kandidat za zamenu (upisuje W2-L) | `replacement:<leave>:<employee>` | `workforce.manage` |
| dokument ističe ≤30 dana / istekao | `doc_expiry:<doc>:<expiration_date>` | `documents.manage` |
| obavezan dokument fali | `doc_missing:<assignment>:<requirement>` | `onboarding.manage` |
| angažman ističe ≤30 dana | `assignment_ending:<id>:<end_date>` | `assignments.manage` |
| satnica na odobrenju | `timesheet_pending:<id>` | `timesheets.approve` |
| dospela obaveza | `payable_due:<id>:<due_date>` | `payroll.view` |
| dospelo potraživanje | `receivable_due:<summary>:<ext_due_date>` | `billing.view` |

**RLS select:** `recipient_user_id = auth.uid()`, ili (`recipient_user_id` null i (`audience_permission` null ili `has_permission(audience_permission)`) i (`project_id` null ili `can_see_project(project_id)`)). Stari redovi bez `audience_permission` ostaju vidljivi osoblju. „Pročitano" je po korisniku (`notification_reads`). Mejl ostaje van obuhvata (BLOCKERS).

---

## 3. Jedan obračunski servis (§10, D30 K3/K4)

### 3.1 Valute (K3, T28) — `src/lib/finance/currency.js` (T-E)

- `money(amount, currency)`; `sumByCurrency(items, {amountOf, currencyOf})` → `{EUR: 123.45, RSD: 1000}`. Nikad jedan broj iz više valuta.
- `convertTotals(byCurrency, exchangeRates, {to:'EUR', date})` → `{total, used:[{currency, unitsPerEur, rateDate, source}], missing:[currency]}`. Koristi se samo kad korisnik izabere „Prikaži u EUR". Kurs i datum se uvek prikazuju. Valuta bez kursa ide u `missing` i nije u `total`.
- Troškovi: `eur_amount` (D19) je dozvoljen u EUR zbiru samo kada red ima `fx_rate_date` ili je EUR. Stari RSD red sa kursom bez datuma se prikazuje odvojeno („kurs bez datuma").

### 3.2 Dnevne linije i zaokruživanje — `src/lib/finance/laborLines.js` (T-E)

- `laborDayLines(timesheets, {from, to, filters})`: odobrene satnice → `timesheetDayLines` (T-A2) → linije sa `date ∈ [from, to]`. Filteri su `projectId`, `clientId` (preko projekta), `employeeId`, `projectRoleId`.
- `estimateDayLines(timesheets, range)`: `submitted` iz `estimate_days`. Uvek odvojeno, sa oznakom „procena", nikad u konačnim KPI-jevima (§6.04, T09).
- **Pravilo zaokruživanja (isto u SQL-u, §2.6):** za period se sati sabiraju po grupi `(project_id, employee_id, hour_type, rate, coef, currency)`, posebno za trošak i za prihod. Iznos grupe = `round2(Σhours × rate × coef)`, a iznos perioda = zbir grupa. Dashboard, Financial Report, Billing i Payables za isti period i filter zato daju isti broj (T27). Zbir dva perioda može odstupiti od zbira redova satnica za cent (kao D17).
- `aggregateLabor(lines, groupBy)` → `[{key, hours, revenue:{CUR:x}, cost:{CUR:y}}]`.

### 3.3 KPI formule — `src/lib/finance/kpis.js` i `summary.js` (T-E)

`financialSummary({timesheets, costs, range, filters, exchangeRates?})` vraća po valuti:

| Polje | Formula (spec) |
|---|---|
| `approvedHours` | Σ sati odobrenih linija u periodu |
| `laborRevenue` | Σ grupa(Approved × B2B × client coef) |
| `payrollCost` | Σ grupa(Approved × B2C × worker coef). **Nije** isplaćeno, **nije** bruto 2 |
| `laborMargin` | `laborRevenue − payrollCost` (samo ista valuta) |
| `additionalCosts` | Σ `project_costs` (`cost_date` u periodu), po valuti; billable se ne izdvaja iz troška |
| `netProfit` | `laborRevenue − payrollCost − additionalCosts` |
| `profitMargin` | `netProfit / laborRevenue × 100` kad je `laborRevenue > 0`, inače `null` |
| `pendingEstimate` | iz `estimateDayLines`, odvojeno |

Novčani tokovi su odvojene funkcije i **ne mešaju se** sa obračunom (T17):
- `src/lib/finance/payables.js`:
  - `payableBalance(payable, payments)` → `{total, paid, remaining, status}`, gde je status `unpaid` (paid = 0), `partially_paid` (0 < paid < total) ili `paid` (paid ≥ total);
  - `payablesTotals(list)` po valuti;
  - `canRecordPayment(balance, amount)`.
- `src/lib/finance/billing.js`:
  - `billingBalance(summary, clientPayments)` → `{calculated, invoiced, received, outstanding|null, estimatedUnpaid|null, status}`;
  - `unbilledRevenue(laborLines, summaries)` = prihod odobrenih sati koji nije u nijednom pregledu.

Primer iz spec-a je test u `kpis.test.js` („§5 primer"): 8 × 45 × 1.0 = 360 trošak; 8 × 50 × 1.0 = 400 prihod.

### 3.4 Ko šta zove

| Potrošač | Funkcije | Vlasnik |
|---|---|---|
| Main Dashboard (`src/pages/Dashboard.jsx`, `src/lib/payroll/dashboard.js` prerađen) | `financialSummary`, `payablesTotals`, `billingBalance`, `unbilledRevenue`, `assignmentKpis` (W2-K lib), `shortageProjects` | W2-I |
| Financial Report projekta + centralni (`ProjectFinancialReport.jsx`, `src/lib/payroll/projectReport.js` → wrapper oko `financialSummary`) | `financialSummary`, `aggregateLabor`, `billingBalance`, `payablesTotals` | W2-J |
| Billing Overview (`Clients.jsx`) | `aggregateLabor` (klijent/projekat/radnik/uloga), `billingBalance`, billable troškovi iz `projectCosts.js` | W2-F |
| Payroll / Payables | `payableBalance`, `payablesTotals`; iznos obaveze računa baza (`generate_payables`) | W2-E |
| Monthly Payroll (srpski neto/bruto) | `payrollMonth.js` (postojeći, preko `timesheetDayLines`) | T-A2 / W2-E |
| Timesheet Overview / Payroll Reports | `laborDayLines` (umesto zbira redova gde je u pitanju period) | W2-J |

**K4:** bruto 2 iz srpskog obračuna (`payslip_projects.labor_cost`) više nije trošak projekta. `projectReport.js` prestaje da ga koristi (W2-J) i prikazuje se samo na Monthly Payroll.

---

## 4. Matrica prava (uloga × resurs)

Oznake: **R** čitanje, **W** izmena, **A** odobravanje/status, **E** izvoz; „—" nema; „proj" = samo vidljivi projekti (`can_see_project`; PM obično `project_scope='assigned'`). Sve važi u bazi (RLS, view maske, RPC), a izvoz koristi iste podatke koje je server vratio.

| Resurs | Admin | Project Manager | HR | Finance |
|---|---|---|---|---|
| Employees (osnovno) | RWE | R | RWE | R |
| employee_private (JMBG, ID, banka) | RW | — | RW | R |
| employment_history (payee) | RW | R | R | RW |
| Vendors | RWE | R | RW | RW |
| Clients (bez tarife) | RW | R | R | RW |
| clients.default_b2b_rate | RW | R | — | RW |
| Projects, Job Roles | RW | RW proj | RW | R |
| Assignments | RWE | RWE proj | RWE | RE |
| Rates B2B | RW | R proj | — | RW |
| Rates B2C | RW | — | — | RW |
| Timesheets (sati) | RWAE | RWAE proj | RWE | RWAE |
| Satnica — B2B iznosi | R | R proj | — | R |
| Satnica — B2C iznosi (T26) | R | — | — | R |
| Korekcija odobrene satnice | A | — | — | A |
| Monthly Payroll (srpski) | RWAE | — | — | RWAE |
| Payables / Payments | RWAE | — | — | RWAE |
| Project Costs | RWE | RWE proj | — | RWE |
| Billing Summary / Client Payment | RWAE | — | — | RWAE |
| Financial Reports, fin. KPI | RE | — | — | RE |
| Dashboard operativni deo | R | R proj | R | R |
| Documents (metapodaci) | RW | R | RW | R |
| Osetljivi fajlovi dokumenata | RW | — | RW | — |
| Required Documents | RW | RW proj | RW | R |
| Onboarding paket (priprema) | W | W proj | W | — |
| Onboarding ZIP (T19) | E sve | E bez osetljivih | E sve | — |
| Workforce plan, smene, raspored | RW | RW proj | RW | R |
| Leave (zahtev) | RW | RW | RW | RW |
| Leave odobrenje | A | A | A | — |
| Leave uprkos deficitu (T24) | A | A | — | — |
| Zamene (Assign Replacement) | W | W proj | W | — |
| Notifications | R (po pravu) | R | R | R |
| Settings (osim Users) | RW | — | — | — |
| Users / Permissions | RW | — | — | — |
| Audit log (pun) | R | po resursu | po resursu | po resursu |

Izvoz CSV/Excel/PDF (T26): funkcije izvoza primaju `perms` i izbacuju kolone za koje korisnik nema pravo. To je druga linija odbrane, jer server te vrednosti ionako ne vraća.

---

## 5. Podela posla

**Zajednička pravila iz BRIEF-P7 važe uvek.** Svaka traka:
- menja samo svoje fajlove;
- deljene fajlove (`translations.js`, `App.jsx`, `navConfig.js`, `base44Client.js`, `access.js`, `schema.generated.js`, `ProjectDetail.jsx`, `src/api/errors.js`, `package.json`) menja malim Edit umetanjima;
- testove piše u **nove** fajlove (nema dopisivanja u `payroll.test.js`, osim T-A1/T-A2 kad stari test mora da se uskladi);
- na kraju pokreće `npm run build && npm test && npm run test:db && npm run lint`.

**Deljeni fajlovi, ko sme da ih menja:**

| Fajl | Pravilo |
|---|---|
| `base44Client.js` | `ENTITY_TABLES` dodaje svaka traka (po jedan red). Logiku za `SENSITIVE_COLUMNS`/`timesheet_money` piše T-A2; `clients` dodaje W2-F. |
| `access.js` | T-B prepisuje u talasu 1 (`ROUTE_PERMISSIONS`); drugi dodaju po jedan unos. |
| `ProjectDetail.jsx` | T-A1 uvodi niz `PROJECT_TABS` (Overview \| Workers \| Onboarding \| Costs \| Workforce Plan \| Financial Report). Kartica se prikazuje samo kad njen modul postoji. T-C, T-D i W2-G dodaju po jedan red. |
| `package.json` | samo T-D (`jszip`). |

### Talas 1 (paralelno; T-B isporučuje 01 prvi)

#### T-B — Temelj, uloge/prava, audit *(opus)*
- **Cilj:** §15.02, §15.03 (baza), §15.04 (infrastruktura), §2.3.4; K1/K2.
- **Spec testovi:** T26 (osnova), T24 i T19 (pravna osnova).
- **Migracije:**
  - `20261125010000_temelj_uloge_audit.sql`: §2.1, §2.2, §2.3 (sve tabele, helperi, seed prava, mapiranje operater → hr, `handle_new_user`, `project_roles` backfill, `shifts`, `exchange_rates`, `app_settings.time_zone`, `projects.time_zone`, audit triggeri na 6 postojećih tabela, `migration_report`). **Isporučiti prvo, u prvom satu.** Ostali do tada pišu kod, a migracije primenjuju posle.
  - `20261125020000_prava_rls.sql`: politike postojećih tabela po §4 (`profiles`, `employees`, `employee_private`, `employment_history`, `vendors`, `clients`, `documents` (metapodaci), `leave_requests` (staff), `attendance_records`, `tasks`, `projects`, `project_assignments`, `rates` (po `kind`), `project_costs`, `timesheets` (redovi; kolone radi T-A2), `hour_types`, `work_rules`, `holidays`, `department_configs`, `cost_categories`, `company_settings`, `app_settings`, `email_templates`, `month_locks`, `payroll_*`, `payslips`, `payslip_projects`).
- **Fajlovi:** `src/lib/permissions.js` (novo: kodovi, `can(perms, code)`, `ROLE_LABELS`), `src/lib/permissions.test.js` (novo), `src/lib/access.js` + `access.test.js` (`ROUTE_PERMISSIONS`, `canAccessPath(path, perms)`, `visibleNavItems(items, perms)`), `src/lib/AuthContext.jsx` (`permissions` iz `my_permissions()`, `can()`; `isAdmin` ostaje), `src/components/ProtectedRoute.jsx`, `src/components/layout/Sidebar.jsx` + `MobileNav.jsx` (samo poziv `visibleNavItems`), `src/pages/UsersSettings.jsx` (4 uloge, `project_scope`, projekti, override prava), `src/lib/userAccounts.js` + test, `src/api/errors.js` (poruke za 42501 po pravu), `supabase/tests/20_uloge_prava.test.sql`, `supabase/tests/21_audit.test.sql`, usklađivanje `supabase/tests/10_korisnici.test.sql` i `11_dozvole_tabela.test.sql`, `supabase/seed.sql` (operater → hr; dodati lokalne naloge pm/finance sa istim obrascem komentara).
- **Zavisi od:** ničega.
- **Accept:**
  - pgTAP 20: za svaku ulogu i svaki resurs iz §4 bar jedan `R` i jedan `W` (dozvoljeno/odbijeno); PM sa `project_scope='assigned'` ne čita tuđi projekat; override `granted=false` oduzima pravo; admin ne može da izgubi pravo.
  - pgTAP 21: insert/update/delete na 6 tabela pravi audit red sa `actor`; `update/delete audit_log` odbijeno; HR ne čita `rates` audit.
  - Operater posle migracije ima `role='hr'` i isti pristup kao pre (regresija pgTAP 01, 08).
  - Meni u pregledaču odgovara pravima za lokalni admin, hr, pm i finance nalog.

#### T-A1 — Angažman (jedna evidencija) + Rate History *(opus)*
- **Cilj:** §2.3.2, §2.3.3, §4.5 (DB i RPC), §5.01–5.03, §5.02 istorija; K5.
- **Spec testovi:** T07 (tarifa), T25 (uloga), T06 (DB deo), T01 (podaci).
- **Migracija:** `20261125030000_angazmani_tarife.sql` — §2.4 i §2.5 u celosti (kolone, backfill, keš i guard, `guard_assignment_overlap`, RPC-ovi A2, normalizacija i exclusion `rates`, prenos JSON-a i profila u `rates`, `resolve_rate`, `resolve_timesheet_rate` wrapper, `_v1` za diff, `migration_report`, `guard_assignment_rates` v2 sa `has_permission('rates.manage')`).
- **Fajlovi:** `src/lib/payroll/rates.js` (v2), `src/lib/payroll/rateHistory.test.js` (novo), usklađivanje `src/lib/payroll/payroll.test.js` (samo testovi redosleda tarife), `src/components/projects/ProjectEmployees.jsx` (Workers: lista dodela, Add/Edit/End preko RPC-ova, tarife samo uz pravo), `src/components/projects/ProjectRoles.jsx` (ProjectRole + role tarife uz `rates.view_b2b` / `rates.manage`), `src/pages/projects/ProjectDetail.jsx` (`PROJECT_TABS`), `src/components/rates/RateDialog.jsx` (scope assignment/role/project; „Promeni od datuma" → `change_rate`), `src/components/rates/RateTable.jsx`, `src/components/rates/AssignmentDialog.jsx` (Job Role, smena), `src/components/rates/RateResolver.jsx`, `src/pages/rates/RatesPage.jsx` (samo da radi nad novim modelom; redizajn je W2-K), `src/lib/projectSite.js` (`negativeLabourMargin` ostaje), `supabase/tests/22_angazmani.test.sql`, `supabase/tests/23_tarife_istorija.test.sql`, usklađivanje `supabase/tests/04_tarifa_pri_odobravanju.test.sql` i `08_tarife_samo_admin.test.sql`; u `base44Client.js` dodati `ProjectRole`, `Shift`, `ExchangeRate`, `MigrationReport` u `ENTITY_TABLES`.
- **Zavisi od:** T-B 01.
- **Accept:**
  - pgTAP 22: posle migracije svaki element starog JSON-a ima dodelu; dodela dodata na kartici projekta se vidi u `/rates` i obrnuto (§2.3.3); preklopljena dodela istog radnika na istom projektu je odbijena; Transfer zatvara staru (sati ostaju na njoj, broj i iznos satnica stare dodele isti); End pre poslednjeg dana rada je odbijen; direktan upis `projects.assigned_employees` je odbijen (42501).
  - pgTAP 23 „T07": tarifa od 15. preko `change_rate` → dan 14. stara, dan 15. nova; preklapajuća tarifa odbijena (`23P01`), susedna prima; odobrena satnica pre promene ima isti `rate_snapshot`.
  - `migration_report` sadrži svaku razliku izbora tarife za nacrte.
  - `rateHistory.test.js` „T07".

#### T-A2 — Satnice po danu, intervali, korekcija, vidljivost novca *(opus)*
- **Cilj:** §6.01–6.06, §5.10, K11, K12, K3 (u satnici), §15.03 (satnica).
- **Spec testovi:** T07, T08 (regresija), T09, T10, T26 (satnica), T28 (red).
- **Migracija:** `20261125040000_satnice_po_danu.sql` — §2.6 u celosti (kolone, unique, `timesheet_entries`, `max_daily_hours`, `guard_timesheet` v4 sa pravima, `timesheet_day_lines`, snimak v2, `reopen_timesheet`, `labor_day_lines`, `labor_day_problems`, backfill `assignment_id` uz `app.migration_backfill`, column grant i view `timesheet_money`, `mask_rate_snapshot`).
- **Fajlovi:** `src/lib/payroll/timesheetDays.js` (novo) + `timesheetDays.test.js` (novo), `src/lib/payroll/payrollMonth.js` (preko `timesheetDayLines`, `rate_not_eur`), `src/lib/payroll/hours.js` (bez posebnih satnica iz profila za v2), `src/lib/payroll/timesheetRow.js` (ekran više ne šalje tarife; prikaz iz `estimate_days`/`calc_problems`), `src/lib/timesheetInputs.js`, `src/lib/projectSite.js` (`employeesForProject(project, employees, {assignments, weekStart})`) + `projectSite.test.js`, `src/pages/payroll/Timesheets.jsx` (izbor dodele, intervali po danu, Submit/Approve/Reject po pravu, Reopen sa razlogom), `src/components/timesheets/TimesheetPreviewModal.jsx`, `src/components/layout/usePendingTimesheets.js` (bez promene logike; proveriti da radi sa column grantom), `src/api/base44Client.js` (`SENSITIVE_COLUMNS`, merge `timesheet_money`, entitet `TimesheetEntry`), `src/pages/CoefficientsSettings.jsx` (polje `max_daily_hours`), `supabase/tests/24_satnice_po_danu.test.sql`, usklađivanje pgTAP 02, 03, 05, 09 i 14 (čitanje iznosa kao postgres ili preko view-a), usklađivanje `payroll.test.js` i `payrollProblems.test.js` samo gde se menja pravilo.
- **Zavisi od:** T-B 01, T-A1 03 (`resolve_rate`). Može da piše JS po ugovoru pre nego što 03 postoji.
- **Accept:**
  - pgTAP 24 „T10": dva projekta istog dana 4 h + 4 h prolaze; preklopljeni intervali (08–12 i 11–15) odbijeni; zbir 14 + 12 h odbijen.
  - „T07": nedelja sa promenom tarife u sredu ima dve tarife u `days`, `mixed=true`, iznos = zbir po danu.
  - „T09": submitted i rejected nisu u `labor_day_lines`.
  - K11: `reopen_timesheet` bez razloga odbijen; sa razlogom pravi audit `correction`; sa odobrenim obračunom meseca odbijen.
  - „T26": HR (`set local role` + JWT) dobija grešku za `select worker_cost from timesheets`, a `timesheet_money.worker_cost` mu je null; PM vidi `client_revenue`, ne vidi `worker_cost`.
  - v1 odobrene satnice i obračuni daju iste iznose kao pre (pgTAP 05 zelen).
  - `timesheetDays.test.js` ima isti primer kao pgTAP 24 („isti primer kao pgTAP 24").

#### T-C — Project Costs C1 + C2
- **Cilj:** §8.1, §8.2.
- **Spec testovi:** T13, T14, T15 (oznaka), T28 (troškovi).
- **Migracija:** `20261125050000_troskovi_c1.sql` — §2.7.
- **Fajlovi:** `src/lib/projectCosts.js` (novo) + `projectCosts.test.js` (novo), `src/lib/payroll/costs.js` (`fx_rate_date`, `sumCostsEur` ne prima kurs bez datuma) + usklađivanje primera, `src/components/projects/ProjectCosts.jsx` (kartica: total, tabela sa Date, Add/Edit/Delete, filteri kategorija/potkategorija/datum, CSV/Excel, History iz `audit_log`), `src/pages/projects/ProjectCostsPage.jsx` (C2: kolone, filteri Project/Client/Category/Subcategory/Date, sort, izvoz Excel/CSV/PDF, analitika po kategoriji, zbir po valuti), `src/pages/CostCategoriesSettings.jsx` (`payroll_linked`), red u `PROJECT_TABS` (Costs), `supabase/tests/25_troskovi.test.sql`, usklađivanje `06_troskovi_kurs.test.sql`.
- **Zavisi od:** T-B 01 (audit, `can_see_project`). Kartica u `ProjectDetail` posle T-A1 `PROJECT_TABS`; do tada se komponenta razvija samostalno.
- **Accept:**
  - pgTAP 25: trošak bez `cost_date` ili kategorije odbijen; potkategorija obavezna kad je kategorija ima; RSD bez `fx_rate_date` odbijen; kategorija `payroll_linked` odbijena; preimenovanje kategorije ne menja zbir po `cost_category_id`; HR nema pristup.
  - „T13": trošak dodat u projektu postoji jednom u `/project-costs` (test nad istim entitetom, plus provera u pregledaču).
  - „T14" u `projectCosts.test.js`; „T28": RSD bez kursa nije u EUR zbiru.

#### T-D — Onboarding, Required Documents, ZIP
- **Cilj:** §12, §11 Documents.
- **Spec testovi:** T18, T19.
- **Migracija:** `20261125060000_onboarding.sql` — §2.10 (uključujući storage politike).
- **Fajlovi:** `src/lib/onboarding.js` (novo) + `onboarding.test.js` (novo), `src/lib/documentStatus.js` (ostaje za listu dokumenata), `src/components/projects/ProjectOnboarding.jsx` (novo: zahtevi po projektu i ulozi, status po radniku sa razlozima, preview paketa, Prepare, Download ZIP), `src/components/projects/RequiredDocumentDialog.jsx` (novo), `src/lib/onboardingZip.js` (novo: jszip + potpisani linkovi + `start_onboarding_download`), `src/pages/Documents.jsx` (`issue_date`, `restricted`, dijalog „Document types" uz `settings.manage`), `src/components/documents/DocumentPreviewModal.jsx`, `src/lib/documentCategories.js` (iz `document_types`), red u `PROJECT_TABS` (Onboarding), `package.json` / `package-lock.json` (`jszip`), `supabase/tests/26_onboarding.test.sql`.
- **Zavisi od:** T-B 01 (`project_roles`, prava, audit), T-A1 03 (`project_assignments.project_role_id`); SQL deo primeniti posle 03.
- **Accept:**
  - „T18" (test + pgTAP): Welder bez sertifikata je `missing` i `action_required`; Fitter na istom projektu je `ready`.
  - „T19" pgTAP: korisnik bez `documents.view_sensitive` dobija `false` iz `can_read_storage_object` za fajl pasoša; `start_onboarding_download` ga ne vraća; storage select tog objekta kao taj korisnik vraća 0 redova. Paket sa nedostatkom ne može u `ready`. Posle preuzimanja postoje `onboarding_package_downloads` i audit red.

#### T-E — Finansijsko jezgro (čiste funkcije)
- **Cilj:** §10, §3.2 definicije, K3/K4, §7.04 i §9 formule.
- **Spec testovi:** T11, T16, T17 i T28 (lib), osnova za T27.
- **Migracija:** nema.
- **Fajlovi (svi novi):** `src/lib/finance/currency.js`, `laborLines.js`, `kpis.js`, `summary.js`, `payables.js`, `billing.js`, `index.js`, i testovi `currency.test.js`, `laborLines.test.js`, `kpis.test.js`, `payables.test.js`, `billing.test.js`.
- **Zavisi od:** ugovor `timesheetDayLines` (T-A2); do isporuke koristi fixture u testu istog oblika.
- **Accept:**
  - „T11": 1000 − 300 − 200 → remaining 500, `partially_paid`.
  - „T16": invoiced 1000, uplate 400 + 300 → outstanding 300, `partially_paid`; bez invoiced → `estimatedUnpaid`, outstanding null.
  - „T17": `financialSummary` ne sadrži polja uplata ili isplata; `payablesTotals` i `billingBalance` daju četiri različite vrednosti na primeru.
  - „T28": EUR + RSD bez kursa → dva zbira; sa kursom → total uz `used[{rateDate}]`.
  - §5 primer 360/400; Profit Margin null kad je prihod 0.

#### T-G — Workforce model (baza + lib)
- **Cilj:** §13.03–13.05, §14.1 (izračun), Workers Available (4.3.3).
- **Spec testovi:** T05, T20, T21 (izračun).
- **Migracija:** `20261125070000_workforce_model.sql` — §2.11.
- **Fajlovi:** `src/lib/workforce.js` (novo) + `workforce.test.js` (novo), `src/pages/SchedulePage.jsx` (izbor projekta, dodele i smene, status; postojeći izgled ostaje), `supabase/tests/27_workforce.test.sql`; u `base44Client.js` dodati `WorkforceRequirement` u `ENTITY_TABLES`.
- **Zavisi od:** T-B 01 (`shifts`, `project_roles`), T-A1 03 (`default_shift_id`, `project_role_id`).
- **Accept:**
  - pgTAP 27: dva zahteva za isti role/shift/datum odbijena; `set_workforce_requirement` od 10. menja broj samo od 10.; „T20": `workforce_coverage` posle promene pokazuje novi deficit; „T21": simulirani odmor jednog od dva potrebna daje deficit 1 za tu ulogu i smenu.
  - `workforce.test.js` isti primeri (paritet); „T05": radnik sa aktivnom dodelom, ali u drugoj smeni, je dostupan.

### Talas 2 (paralelno; kreće kad su sve migracije talasa 1 primenjene i build zelen)

#### W2-K — Project Assignments A1 + A2 (UI)
- **Cilj:** §4.0–4.5, §2.2 Workers.
- **Spec testovi:** T01, T02, T03, T04, T06, T26 (izvoz).
- **Migracija:** `20261125140000` samo ako zatreba view za izvoz.
- **Fajlovi:** `src/lib/assignments.js` (novo: `assignmentStatus`, `filterAssignments`, `sortAssignments`, `assignmentKpis` → `{total, activeWorkers, activeProjects, expiringThisMonth}`, `statusBreakdown` (4 isključiva statusa, zbir 100%), `byProject`, `endingSoon(30)`, `exportRows(list, perms)`) + `assignments.test.js`, `src/pages/assignments/ProjectAssignmentsPage.jsx` (novo; ruta `/assignments`, `/rates` → redirect `/assignments?tab=rates`), `src/components/assignments/*` (novo: `AssignmentsTable`, `AssignmentKpis`, `QuickInsights` (donut, bar, Workers Available preko `availableWorkers`, Ending Soon, Workforce Shortages preko `coverage`), `AssignmentFilters`, `AssignmentDetailDrawer` (History iz `audit_log`), `AddAssignmentDialog`, `EditAssignmentDialog`, `ReassignDialog` (Transfer/Additional), `EndAssignmentDialog`, `AssignmentExport` (CSV/XLSX/PDF celog filtriranog skupa)), `src/pages/rates/RatesPage.jsx` (postaje kartica „Rate History" ili se briše uz redirect), `src/components/projects/ProjectEmployees.jsx` (dorada Workers kartice istim komponentama), `src/pages/projects/Projects.jsx` (broj radnika iz dodela), `navConfig.js` (`Rates & Assignments` → `Project Assignments`, `/assignments`), `App.jsx` (ruta), `access.js` (unos).
- **Zavisi od:** T-A1, T-G (lib), T-B.
- **Accept:**
  - Test „T01": dva reda, 1 Active Worker.
  - „T02": tabela, KPI, grafici i `exportRows` za isti filter imaju isti skup.
  - „T03": procenti daju zbir 100.
  - Granice statusa: start = danas, end = danas, end za 30 i 31 dan, bez end.
  - U pregledaču: klik na segment filtrira („T04"), A2 akcije rade („T06"); HR ne vidi B2C kolonu ni u izvozu („T26").

#### W2-E — Payroll obaveze i isplate *(opus)*
- **Cilj:** §7.
- **Spec testovi:** T11, T12, T26.
- **Migracija:** `20261125080000_obaveze_isplate.sql` — §2.8, plus permisije u postojećim payroll funkcijama i `vendors.payment_terms_days`.
- **Fajlovi:** `src/pages/payroll/Payables.jsx` (novo; ruta `/payroll/payables`: Calculated, Paid, Remaining, Due, status; filteri period/projekat/radnik/vendor/status/dospelost; Excel/CSV), `src/components/payroll/*` (novo: `PayableDetail` sa linijama i razradom po radniku, `PaymentDialog`, `VoidPaymentDialog`, `AdjustmentDialog`), `src/pages/payroll/MonthlyPayroll.jsx` (link na obaveze meseca, poređenje neto/payable), `src/pages/payroll/PayrollDashboard.jsx` (Payroll Due = Σ remaining), `src/lib/payroll/reports.js` (`payrollDue` → payables), `navConfig.js` i `App.jsx` (stavka), `supabase/tests/28_obaveze_isplate.test.sql`, usklađivanje pgTAP 05 i 09 (prava).
- **Zavisi od:** T-A2 (`labor_day_lines`), T-E (`payables.js`), T-B.
- **Accept:**
  - pgTAP 28 „T11": dve delimične isplate smanjuju remaining tačno; preplata odbijena; storno bez razloga odbijen; `delete` odbijen.
  - „T12": dva radnika istog vendora → jedna obaveza vendoru sa dve `labor` linije; listić radnika i dalje postoji.
  - „T26": HR ne čita `payables`/`payments`.
  - U pregledaču dve isplate menjaju Remaining.

#### W2-F — Client Billing Overview (bez faktura) *(opus)*
- **Cilj:** §9.
- **Spec testovi:** T15, T16, T29.
- **Migracija:** `20261125090000_billing.sql` — §2.9.
- **Fajlovi:** `src/pages/payroll/Clients.jsx` (postaje Billing Overview: obračun po klijentu/projektu/periodu, razrada po radniku/ulozi, status, eksterni račun, uplate, billable troškovi odvojeno, izvoz CSV/Excel/PDF obračuna), `src/components/billing/*` (novo: `BillingSummaryDialog`, `BillingStatusControl`, `ExternalInvoiceForm`, `ClientPaymentDialog`, `BillingExport`), `src/components/clients/ClientDialog.jsx` (`default_b2b_rate` uz pravo), `base44Client.js` (`SENSITIVE_COLUMNS.clients`, entiteti), `navConfig.js` (labela „Clients / Billing Overview"), `supabase/tests/29_billing.test.sql`.
- **Zavisi od:** T-A2, T-E, T-C (`billable`), T-B.
- **Accept:**
  - pgTAP 29 „T29": nema kolone ili funkcije za generisan broj fakture (upit u `information_schema`/`pg_proc` za `invoice_number|next_invoice`); status beleži ko i kada; preklopljen period odbijen.
  - „T16": eksterni 1000 + uplate 400 + 300 → outstanding 300, `partially_paid`.
  - „T15": billable trošak se pojavljuje u listi kandidata, ne menja `calculated_amount`; isti trošak u dva pregleda odbijen.
  - Zbir ekrana = zbir izvoza.

#### W2-J — Financial Reports
- **Cilj:** §10, §2.2 Financial Report.
- **Spec testovi:** T14, T17, T25, T28.
- **Migracija:** `20261125120000` samo ako zatreba.
- **Fajlovi:** `src/lib/payroll/projectReport.js` (wrapper oko `financialSummary`; bez bruto 2) + `projectReport.test.js`, `src/components/projects/ProjectFinancialReport.jsx` (prihod, payroll cost, dodatni troškovi, rezultat, interni obračuni, uplate, otvorena potraživanja; po valuti; izvoz PDF/CSV), `src/pages/payroll/PayrollReports.jsx` (Financial Reports: filteri Project/Client/period/Employee/Job Role/Cost Category, izvoz PDF/CSV), `src/lib/payroll/payrollReports.js`, `src/lib/payroll/reports.js`, `src/pages/timesheets/TimesheetDashboard.jsx` + `src/components/timesheets/dashboard/*` (iznosi iz maske), `src/lib/timesheetReport.js` + test, `src/lib/timesheetExport.js` (kolone po pravu), `src/pages/Reports.jsx` (centralni izveštaji: veze na izvoze po pravu).
- **Zavisi od:** T-E, T-A2, T-C; W2-E i W2-F za prikaz uplata (do tada sekcija pokazuje stanje „nema podataka").
- **Accept:**
  - `projectReport.test.js`: 8 × 45 = 360 / 8 × 50 = 400, Profit Margin null kad je prihod 0; „T14"; „T25": preimenovanje ne menja brojeve.
  - „T17": izveštaj odvaja obračun od fakturisanog, uplaćenog i isplaćenog.
  - Izvoz bez B2C za korisnika bez prava.

#### W2-G — Workforce Planning + Gantt (UI)
- **Cilj:** §13, §2.2 Workforce Plan.
- **Spec testovi:** T20 (UI), T05 (UI).
- **Migracija:** `20261125150000` samo ako zatreba.
- **Fajlovi:** `src/pages/workforce/WorkforcePlanningPage.jsx` (novo; ruta `/workforce`), `src/components/workforce/*` (novo: `GanttView` dan/nedelja/mesec, grupisano po projektu i ulozi, statusi iz `ganttCell`; `RequirementsTable`; `RequirementDialog` (`set_workforce_requirement`); `CoverageTable` deficit/višak; `CoverageDetail` (ko pokriva, ko fali, zamene preko `rankCandidates` kad postoji W2-L lib); `ShiftsDialog`), red u `PROJECT_TABS` (Workforce Plan), `navConfig.js` i `App.jsx` (stavka „Workforce Planning"), `access.js`.
- **Zavisi od:** T-G, T-A1; W2-L lib za predloge (opciono do isporuke).
- **Accept:** u pregledaču izmena zahteva odmah menja deficit u tabeli i na Gantt-u („T20"); klik na deficit prikazuje radnike i nedostajuće; prazna, učitavanje, greška i zabranjen pristup su jasni.

#### W2-L — Leave kapacitet i Smart Replacement *(opus)*
- **Cilj:** §14.
- **Spec testovi:** T21, T22, T23, T24.
- **Migracija:** `20261125100000_odsustva_zamene.sql` — §2.12.
- **Fajlovi:** `src/lib/replacements.js` (novo) + `replacements.test.js`, `src/pages/LeaveRequests.jsx` (simulacija pre odluke: projekat, pozicija, dan/smena, potrebno, dostupno, deficit; Approve/Reject preko RPC-a; razlog obavezan uz deficit; prikaz ko/kada/zašto), `src/components/leave/*` (novo: `CapacityImpact`, `DecisionDialog`, `ReplacementSuggestions`, `AssignReplacementDialog` sa upozorenjem o izvornom projektu), `supabase/tests/30_odsustva_zamene.test.sql`.
- **Zavisi od:** T-G, T-A1, T-D (`onboarding.js` za readiness), T-B.
- **Accept:**
  - pgTAP 30 „T24": odobrenje uz deficit bez `leave.approve_shortage` odbijeno; bez razloga odbijeno; sa oba prolazi i audit ima razlog; direktan update statusa odbijen.
  - „T21": `shortage_snapshot` tačan.
  - Testovi „T22" (delimično dostupan = `partial_availability`) i „T23" (transfer pokazuje deficit izvora).
  - U pregledaču Assign Replacement posle potvrde daje deficit 0; bez potvrde nema dodele.

#### W2-I — Main Dashboard §3 dopune
- **Cilj:** §3.1–3.3.
- **Spec testovi:** T17, T27, T01.
- **Migracija:** `20261125130000` samo ako zatreba.
- **Fajlovi:** `src/pages/Dashboard.jsx`, `src/lib/payroll/dashboard.js` (preko `financialSummary`, `assignmentKpis`, `shortageProjects`, `payablesTotals`, `billingBalance`) + `dashboard.test.js` (novo), `src/components/dashboard/*` (filteri period/Project/Client/Status; KPI kartice kao linkovi na filtrirane liste preko URL parametara; Client Unpaid i Payables odvojeno, Unbilled odvojeno; Workforce Overview; Action Center; Quick Links po pravima).
- **Zavisi od:** T-E, W2-K lib, T-G; W2-E i W2-F za Payables i Unpaid (do tada KPI „nema podataka", ne 0 kao izmišljena vrednost).
- **Accept:** test „T27" (KPI = izvorna funkcija modula za isti period i filter); „T17" (profit, fakturisano, uplaćeno i isplaćeno su različite vrednosti na primeru); HR ne vidi finansijske KPI; svaki KPI vodi na filtriranu listu.

#### W2-H — Notifications
- **Cilj:** §15.01, Action Center izvor.
- **Migracija:** `20261125110000_obavestenja.sql` — §2.13.
- **Fajlovi:** `src/lib/notifications.js` (novo: tipovi, labele, link po `entity_table`) + test, `src/pages/Notifications.jsx`, `src/components/layout/TopBar.jsx` (broj nepročitanih po korisniku), `supabase/tests/31_obavestenja.test.sql`.
- **Zavisi od:** svih migracija talasa 1; W2-E, W2-F, W2-L za `payable_due`, `receivable_due` i `replacement` (redosled 08–10 < 11 to pokriva).
- **Accept:** pgTAP 31: dva poziva `refresh_notifications()` ne prave duplikat; uslov koji prestane dobija `resolved_at`; HR ne vidi `payable_due`; „pročitano" je po korisniku.

### Talas 3 — završni QA i uputstva

#### W3-QA — Završni QA *(review, opus)*
- **Migracija:** `20261125200000_zavrsni_qa.sql` — samo popravke nalaza i uklanjanje `resolve_timesheet_rate_v1` posle potvrde da je `migration_report` pregledan.
- **Fajlovi:** `QA-FINDINGS.md` (sekcija za T01–T29), `IMPLEMENTATION-MATRIX.md` (status i dokaz), `BACKLOG.md` (štikliranje).
- **Accept:**
  - Svaki T01–T29 ima status i dokaz: `grep -rn "T07" src supabase/tests` ili koraci u pregledaču.
  - Regresija Phase 0–6 i pgTAP 01–14 zeleni.
  - Prava provereni sa 4 lokalna naloga.
  - Nema otvorenih P0.

#### W3-DOC — Korisnička uputstva *(content)*
- **Fajl:** `OPIS-APLIKACIJE.md` — po jedan odeljak (§18): Assignments, Timesheet Approval, Payroll Payment, Billing Overview / Client Payments, Onboarding ZIP, Leave & Replacement, Dashboard; stvarni nazivi ekrana na EN/RS/SK.
- **Accept:** svaki odeljak ima korake koji rade u aplikaciji.

---

## 6. Rizici za produkciju (postojeći podaci) i kako ih migracije rešavaju

| # | Rizik | Rešenje |
|---|---|---|
| R1 | Dve evidencije dodela (JSON i `project_assignments`), JSON bez datuma | Backfill §2.4 sa pravilom datuma iz satnica i projekta; pun JSON se pre izmene kopira u `migration_report`; neispravni elementi idu u report, ne brišu se; keš ostaje za stare čitaoce, a direktan upis se odbija tek kad su ekrani prebačeni (u istoj traci T-A1). |
| R2 | Tarife iz JSON-a i profila (vidljive HR-u kroz API, D3) | Prenos u `rates` (popunjavanje rupa, čuva rezultat); keš bez tarifa; profilne kolone se više ne čitaju; `job_roles` tarife koje bi promenile rezultat idu u report umesto upisa. |
| R3 | Postojeće preklapajuće tarife ruše exclusion ograničenje | Normalizacija pre ograničenja (zatvaranje, sečenje, `inactive` za duplikate) koja čuva izbor za svaki dan; svaka izmena u reportu. |
| R4 | Novi redosled tarifa menja nacrte | Diff `resolve_timesheet_rate_v1` naspram `resolve_rate` za sve ne-odobrene satnice u `migration_report`; odobrene (snimak) nisu pogođene (D10). Posebne satnice iz profila prestaju da važe za nacrte (spec §5) — report po radniku, Finance proverava pre sledećeg odobravanja. |
| R5 | Backfill `assignment_id` nad odobrenim i zaključanim satnicama | Jedina izuzetna izmena (`assignment_id` null → vrednost) uz `app.migration_backfill` i `auth.uid() is null`; ništa drugo u redu se ne menja; nejednoznačni redovi ostaju null + report (Submit ih traži samo za nove prelaze). |
| R6 | Column grant na `timesheets` ruši `select *` (klijent, testovi) | `base44Client` čita eksplicitnu listu i spaja `timesheet_money`; pgTAP testovi koji čitaju iznose kao `authenticated` se usklađuju u T-A2; `usePendingTimesheets` čita samo `id`/`count`; nova kolona mora dobiti `grant select`. |
| R7 | Operater → HR menja pristup | Podrazumevana prava HR-a pokrivaju sve što je operater imao (pgTAP 01 i 08 regresija); nalog i aktivnost se ne menjaju; prvi admin ostaje zaštićen (`guard_last_admin`). |
| R8 | Preklapanja dodela i rasporeda u postojećim podacima | Trigger proverava samo nove i izmenjene redove; postojeća preklapanja idu u `migration_report`, migracija ne pada. |
| R9 | Trošak bez kategorije ili datuma kursa | `cost_date` iz `created_date`; nepovezana kategorija i RSD bez datuma kursa ostaju, uz jasnu oznaku na ekranu i report; obavezno pri sledećoj izmeni. |
| R10 | `payroll_records` i `payroll_runs` | Ne diraju se; Payables su nova tabela; srpski obračun ostaje (K4), samo prava prelaze na `payroll.*`. |
| R11 | Storage politika za osetljiva dokumenta | Fajl koji nije vezan za dokument (prilog satnice, fotografija, logo) ostaje dostupan osoblju kao do sada; osetljiv dokument traži pravo. Upload bez reda u `documents` nije pogođen. |
| R12 | ZIP u pregledaču (Edge runtime je isključen u `config.toml`) | Server kontroliše sadržaj (`start_onboarding_download`) i pristup fajlu (storage RLS) — T19 važi i za direktan poziv; audit pripreme i preuzimanja ide kroz RPC. Ograničenje: ko ima pravo da vidi dokument može ga preuzeti i pojedinačno, bez paket-audita (audit se vodi za paket). Ako se zatraži jači audit: Edge funkcija `onboarding-zip` (uključiti `edge_runtime`, deploy funkcija). |
| R13 | Deploy na `main` primenjuje sve migracije odjednom | Redosled imena je redosled zavisnosti (01 → 11); svaka migracija mora proći i na bazi sa produkcionim oblikom podataka. Pre push-a: `npx supabase migration up --include-all` nad kopijom produkcione šeme, pa pregled `select * from migration_report` sa Lukom. |
| R14 | Mešanje valuta posle uvođenja valute u tarife | Profit reda samo za istu valutu; agregati uvek po valuti (`sumByCurrency`); srpski mesečni obračun prima samo EUR tarife (problem `rate_not_eur`, D7). |

### Critical Files for Implementation
- /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/supabase/migrations/20261114180000_tarifa_pri_odobravanju.sql (`guard_timesheet` / `resolve_timesheet_rate`, koje redefinišu 03 i 04)
- /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/supabase/migrations/20261113170000_init.sql (šema i RLS koje prepisuje 02)
- /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/src/api/base44Client.js (`ENTITY_TABLES`, `SENSITIVE_COLUMNS`, merge `timesheet_money`)
- /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/src/lib/payroll/rates.js i /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/src/lib/payroll/payrollMonth.js (izbor tarife v2, dnevne linije)
- /Users/luka/Desktop/app za radnike/.claude/worktrees/teamora-ui-ux-changes-b7f723/src/components/projects/ProjectEmployees.jsx (glavni čitalac/pisac `assigned_employees` JSON-a)

## 7. Dodatak — isporučeni API-ji talasa 1 (za trake talasa 2)

### `src/lib/finance` (T-E; `import … from "@/lib/finance"`)
- **currency.js:** `CURRENCIES`, `BASE_CURRENCY='EUR'`, `normalizeCurrency`, `money`, `sumByCurrency(items,{amountOf,currencyOf})`, `addByCurrency`, `subtractByCurrency`, `sortCurrencies`, `rateFor(currency, exchangeRates, date)`, `convertTotals(byCurrency, exchangeRates, {to,date})` → `{to,date,total,used[],missing[]}`, `costEurAmount(cost)` (ne-EUR samo uz `fx_rate_date`).
- **laborLines.js:** `laborDayLines(timesheets,{from,to,filters:{projectId,clientId,employeeId,projectRoleId},projects,assignments})` → `{lines,problems}` (samo odobrene; linija = `timesheetDayLines` + `clientId`,`projectRoleId`), `estimateDayLines(...)` (submitted, `estimate:true`), `sideAmount(lines, SIDES.COST|SIDES.REVENUE)`, `aggregateLabor(lines, groupBy)` (`'project'|'client'|'employee'|'role'|'hourType'|'assignment'|'date'`|niz|fn) → `[{key,hours,revenue{CUR},cost{CUR},missingRevenueRate,missingCostRate}]`, `sumHours`, `matchesFilters`.
- **kpis.js:** `kpisByCurrency({revenue,cost,additional})`, `laborMargin`, `netProfit`, `profitMargin` (null kad prihod ≤ 0).
- **summary.js:** `financialSummary({timesheets,costs,range,filters,projects,assignments,exchangeRates?,convertTo,rateDate?})` → `{approvedHours,currencies,byCurrency{CUR:{laborRevenue,payrollCost,laborMargin,additionalCosts,netProfit,profitMargin}},pendingEstimate,converted|null,problems,missingRevenueRate,missingCostRate,costsNotAttributable}`; `filterAdditionalCosts`, `costDate`. Bez polja uplata/isplata (T17).
- **payables.js:** `payableBalance(payable,payments,{today})`, `payablesTotals(payables,payments,{today})` → po valuti `{count,draftCount,calculated,confirmed,paid,remaining,overdue}`, `canRecordPayment(balance, amount,{currency,payableStatus})` → `{ok,reason,maxAmount}`, `paymentStatus`, `PAYABLE_STATUS`, `PAYMENT_STATUS`.
- **billing.js:** `billingBalance(summary,clientPayments,{calculatedAmount,today})` → `{calculated,invoiced,received,outstanding|null,estimatedUnpaid|null,status,overdue}`, `unbilledRevenue(laborLines,summaries)`, `billingTotals`, `BILLING_STATUS`, `BILLING_STATUS_ORDER`.

### `src/lib/workforce.js` (T-G)
`coverage({requirements,assignments,schedules,leaves,shifts,from,to,simulateLeaveId,projectId})` → `[{projectId,projectRoleId,shiftId,date,required,planned,absent,available,deficit,surplus,coveringEmployeeIds,missing}]`; `shortageProjects(rows)`; `workerIsFree({...})`; `availableWorkers({date,shiftId,roleKey,...})` → `[{employeeId,standby}]`; `ganttCell({...})` → `assigned|available|standby|leave|sick_leave|other_absence|replacement`; `GANTT_STATUSES`, `eachDay`, `shiftInterval`, `absenceKind`. SQL: `workforce_coverage`, `worker_is_free`, `set_workforce_requirement`. Napomena: `guard_schedule_overlap` odbija preklop i za `standby` — zamena mora prvo da postavi standby red na `released`.
