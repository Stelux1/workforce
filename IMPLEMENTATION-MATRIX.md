# IMPLEMENTATION MATRIX — Teamora spec v1.4 (23.11.2026)

Spec §16 korak 0 i §18. Stanje utvrđeno čitanjem koda 24.11.2026 (grana `claude/teamora-ui-ux-changes-b7f723`, posle commita `3037ae5`), ne nagađanjem.
Plan rada po ovoj matrici: `BACKLOG.md` → „Phase 7 — Teamora spec v1.4".

**Statusi:**
- **Implemented** — postoji i radi po pravilu spec-a (dokaz: kod / migracija / test).
- **In Progress (ovaj krug)** — upravo menjaju paralelni agenti po klijentovim slikama 1–17 (necommitovano u radnom stablu).
- **Needs Correction** — postoji, ali odstupa od spec-a (ili od spec-a odstupa obavezujuća odluka iz `DECISIONS.md` — tada vidi „Konflikti").
- **Not Started** — nema ni tabele ni ekrana.

Skraćenice za dokaz: `init` = `supabase/migrations/20261113170000_init.sql`, `pgTAP NN` = `supabase/tests/NN_*.test.sql`, `payroll.test` = `src/lib/payroll/payroll.test.js`.

## Sažetak

| Status | Zahtevi §1–§15 | Testovi T01–T29 | Ukupno |
|---|---|---|---|
| Implemented | 37 | 3 | 40 |
| In Progress (ovaj krug) | 0 | 0 | 0 |
| Needs Correction | 56 | 6 | 62 |
| Not Started | 67 | 20 | 87 |
| **Ukupno** | **160** | **29** | **189** |

Od 29 test scenarija (§17): 3 prolaze danas (T08, T09, T25), 6 delimično (Needs Correction), 20 nema ni funkcionalnosti (Not Started).

---

## §1 Poslovni cilj i potvrđene odluke (01–10)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 1.01 | Direktni radnici i radnici preko vendora; razlikovati primaoca plaćanja | Needs Correction | `employment_history.engagement_type`/`vendor_id` (init:233), bez preklapanja (init:249); `project_assignments.vendor_id` (init:395); bankovni spisak deli podizvođače na poseban list (D21, `src/lib/payroll/payslipExport.js:309`) | Nema eksplicitnog „payee" (radnik ili Vendor) na obavezi; nema Payable entiteta (vidi §7) |
| 1.02 | B2B naplata po satu iz odobrenih Timesheets | Implemented | D9; `guard_timesheet` računa `client_revenue` (init:568, `20261114150000_satnice_vrste_sati.sql`); `src/pages/payroll/Clients.jsx:41` čita samo `approved` | — |
| 1.03 | Payroll: obaveza + stvarne isplate, delimične isplate, datumi, preostalo | Not Started | `payroll_runs.status` samo `draft/approved/paid` (init:736), `mark_payroll_paid` označava ceo obračun (init:897) | Nema Payment tabele, delimičnih isplata ni Remaining Balance |
| 1.04 | Isti radnik na više projekata po danu/smeni/satu bez preklapanja | Needs Correction | Satnica je radnik×nedelja×projekat, jedinstveno (init:538 `timesheets_one_per_week`); dan 0–24 h po redu | Nema provere zbira sati istog dana preko projekata ni vremena početka/kraja |
| 1.05 | Onboarding ZIP sa pravima | Not Started | — | Nema Required Documents, ZIP ni prava po dokumentu |
| 1.06 | Odmori: manjak, zamene, odobrenje uz obrazloženje | Not Started | `leave_requests` bez provere kapaciteta (init:270); `LeaveRequests.jsx:123` samo menja status | — |
| 1.07 | B2B/B2C izmena važi od datuma; zaključeni obračuni isti | Needs Correction | `rates.effective_from/to` (init:418); snimak pri odobravanju (D10/D16, pgTAP 04); | Tarifa se bira po `week_start`, ne po datumu rada (D16) — promena 15. u nedelji ne deli nedelju |
| 1.08 | Samo Approved sati u konačnom Payroll i prihodu | Implemented | D17 (`lock_month`, samo odobrene); `src/lib/payroll/projectReport.js:246` posebno broji neodobrene; pgTAP 05 | — |
| 1.09 | Potrebe po projektu/Job Role/datumu/smeni | Not Started | — | Nema Workforce Requirement entiteta |
| 1.10 | Interni B2B obračun, ručno praćenje uplata, bez faktura | Not Started | `Clients.jsx` prikazuje samo zbir sati/prihoda po klijentu | Nema Billing Summary ni Client Payment |

## §2 Navigacija, ekran projekta, jedan izvor istine

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 2.1.1 | Dashboard (Main Dashboard) u meniju | Implemented | `src/components/layout/navConfig.js` `DASHBOARD_ITEM` | Sadržaj vidi §3 |
| 2.1.2 | Staff Management: Employees, Vendors, Documents, Attendance, Schedule, Tasks, Leave, Notifications, Reports | Implemented | `navConfig.js` sekcija `section_employees`; rute `src/App.jsx:81-91` | Izgled sidebara menja paralelni agent (slika5) |
| 2.1.3 | Projects: Project Overview, Project Costs, **Project Assignments**, **Workforce Planning** | Needs Correction | `navConfig.js`: „Rates & Assignments" (`/rates`) umesto Project Assignments; Workforce Planning ne postoji | Preimenovanje + nova stranica (§4, §13) |
| 2.1.4 | Payroll: Dashboard, Timesheets, Timesheet Overview, Monthly Payroll, Clients/Billing Overview, Payroll Reports | Needs Correction | Sve stavke postoje u `navConfig.js` sekcija `section_payroll` | „Clients" nije Billing Overview (§9) |
| 2.1.5 | Reports: centralni, kontrolisani izveštaji i export | Needs Correction | `src/pages/Reports.jsx` (radnici/prisustvo/dokumenti, bez izvoza); `PayrollReports.jsx` | Nema centralnih finansijskih izveštaja sa izvozom i pravima |
| 2.1.6 | Settings: Email, Departments & Positions, Cost Categories, Coefficients & Holidays, Company Details, Users/Permissions | Implemented | `navConfig.js` sekcija `section_settings`; rute `App.jsx:102-110` | Users ima samo admin/operater (vidi 15.02) |
| 2.2.1 | Projekat — kartice Overview \| Workers \| Onboarding \| Costs \| Workforce Plan \| Financial Report | Needs Correction | `src/pages/projects/ProjectDetail.jsx:176-178` — samo Overview i Financial Report | Workers je deo Overview; Onboarding, Costs, Workforce Plan ne postoje |
| 2.2.2 | Overview: osnovni podaci, klijent, lokacija, period, status, Job Roles i B2B tarife | Implemented | `ProjectDetail.jsx`, `src/components/projects/ProjectRoles.jsx` | Lokacija Address/ZIP/City — In Progress (vidi 2.2.8) |
| 2.2.3 | Workers: radnici, uloga, B2C, B2B, datumi, status | Needs Correction | `src/components/projects/ProjectEmployees.jsx:38` čita `projects.assigned_employees` (JSON) | Drugi izvor dodela pored `project_assignments` (vidi 2.3.2) |
| 2.2.4 | Onboarding kartica | Not Started | — | §12 |
| 2.2.5 | Costs kartica sa automatski izabranim projektom | Not Started | `src/components/projects/ProjectCosts.jsx` postoji (Add/Delete, `project_id` automatski), ali se **nigde ne uvozi** | Uključiti i dopuniti, ne praviti novu (§8) |
| 2.2.6 | Workforce Plan kartica | Not Started | — | §13 |
| 2.2.7 | Financial Report kartica | Needs Correction | `src/components/projects/ProjectFinancialReport.jsx`, `src/lib/payroll/projectReport.js:125` (prihod, trošak, troškovi, ostaje nama) | Nema internih obračuna, uplata ni otvorenih potraživanja (§10) |
| 2.2.8 | Lokacija projekta: Address, ZIP, City | Implemented | `supabase/migrations/20261124120000_adrese_firme_projekta.sql` (`address`, `zip`, `city`), `ProjectFormModal.jsx`, `projectSite.js` `projectAddress()`; D26 | Paralelni agent (slika15) |
| 2.3.1 | Project i Client stabilni ID; relacije ne po nazivu | Implemented | `projects.client_id`, `timesheets.project_id` (init:348-), `propagate_client_rename`/`propagate_project_rename`; `payroll.test:1163` | Ostatak: `sync_project_client` traži klijenta po imenu iz forme (init:368) — radi, ali dva klijenta istog imena biraju najstariji |
| 2.3.2 | Jedinstvena evidencija za Assignment, Rate History, Timesheet, Project Cost, Document, Leave, Workforce Requirement, Billing Summary, Client Payment, Payable, Payment | Needs Correction | Assignment postoji dvaput: `project_assignments` (init:395) i `projects.assigned_employees` JSON (init:362); tarife na 4 mesta (D4/D12) | Workforce Requirement, Billing Summary, Client Payment, Payable, Payment ne postoje |
| 2.3.3 | Centralne stranice i kartice projekta menjaju iste zapise | Needs Correction | Troškovi: isti `project_costs` u oba pogleda; dodele: `/rates` piše `project_assignments`, kartica projekta piše `assigned_employees` | Posledica 2.3.2 |
| 2.3.4 | Audit trail za izmene i potvrđene finansijske podatke | Not Started | Samo `created_by`/`updated_date`, `approved_by`/`approved_date` na satnici | Nema audit tabele ni istorije izmena |

## §3 Main Dashboard

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 3.0 | Novi izgled dashboarda (svetla tema, ljubičasti akcenti) | Implemented | `Dashboard.jsx`, `src/components/dashboard/*` (KpiCard, RevenueChart, ProfitDonut, TopTable, AtAGlance), `src/lib/payroll/dashboard.js`; D23 | Paralelni agent (slika2); KPI definicije ispod proveriti posle spajanja |
| 3.1.1 | Filteri: period (podrazumevano tekući mesec), Project, Client, Status | Needs Correction | `dashboard.js` `PERIODS`; `Dashboard.jsx` ima samo filter perioda | Fali Project/Client/Status filter |
| 3.1.2 | Klik na KPI/upozorenje vodi na filtriranu izvornu listu | Not Started | `src/components/dashboard/StatCard.jsx` bez linka | Liste moraju da primaju filter iz URL-a |
| 3.1.3 | Prikaz samo dozvoljenih projekata/radnika/iznosa; HR/Operations bez stopa i finansija | Needs Correction | RLS: operater ne čita `rates`, `project_costs`, obračune (init:960-966); D3 | Postoje samo 2 uloge; nema ograničenja po projektu |
| 3.2.1 | KPI Active Workers (jedinstveni radnici sa aktivnim Assignment) | Needs Correction | `Dashboard.jsx` broji `employees.status = active`, ne dodele | T01 |
| 3.2.2 | KPI Active Projects | Not Started | — | — |
| 3.2.3 | KPI Approved Hours | Implemented | `dashboard.js` `periodKpis` (samo odobrene satnice); `Dashboard.jsx` | — |
| 3.2.4 | KPI Calculated B2B Revenue | Implemented | `dashboard.js` sabira `client_revenue` odobrenih (računa baza, D16) | — |
| 3.2.5 | KPI Payroll Cost (B2C × worker coef, ne plaćeno) | Implemented | `dashboard.js` sabira `worker_cost` (D23); razlika od bruto 2 — K4 | Razlikuje se od D8 bruto 2 za zaposlene — vidi Konflikt K4 |
| 3.2.6 | KPI Additional Project Costs (po valuti ili uz kurs) | Not Started | `sumCostsEur` postoji (`src/lib/payroll/costs.js:54`) | Nije na dashboardu |
| 3.2.7 | KPI Project Profit | Needs Correction | `dashboard.js`: Gross Profit bez dodatnih troškova | Spec: prihod − trošak rada − dodatni troškovi |
| 3.2.8 | Client Unpaid / Payables kao odvojene kartice | Not Started | — | Zavisi od §7 i §9 |
| 3.3.1 | Financial Overview grafik po mesecima/projektima | Implemented | `RevenueChart.jsx` + `amountsByDay`/`cumulativeSeries` u `dashboard.js` (po danu), `TopTable.jsx` (po projektu/klijentu/radniku) | — |
| 3.3.2 | Workforce Overview (aktivni, raspoloživi, po projektima/pozicijama) | Not Started | — | — |
| 3.3.3 | Action Center (odmori, shortages, istek dodela, dokumenti, pending timesheets, obaveze, dospela potraživanja) | Needs Correction | `Dashboard.jsx`: dokumenti koji ističu, odmori na čekanju | Ostalo ne postoji |
| 3.3.4 | Quick Links po pravima | Not Started | — | — |
| 3.3.5 | Loading/empty/error; KPI bez podataka = 0 | Implemented | `Dashboard.jsx` skeleton; COMMON-BRIEF pravilo | Proveriti novi dashboard |

## §4 Project Assignments (A1 → A2)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 4.0 | Preimenovanje Rates & Assignments → Project Assignments | Not Started | `navConfig.js` „Rates & Assignments"; `src/pages/rates/RatesPage.jsx:22` | Tarife ostaju dostupne (Rate History, §5) |
| 4.1.1 | Centralna tabela: red = jedan Assignment | Needs Correction | `src/components/rates/AssignmentTable.jsx` nad `project_assignments` | Dodele sa kartice projekta (`assigned_employees`) se ne vide — 2.3.2 |
| 4.1.2 | Kolone Employee, Project, Client, Job Role, B2C, B2B, Start, End, Status, Actions (+ ID, valuta) | Needs Correction | `AssignmentTable.jsx:25-31`: Employee, Project, Role, Vendor, Period, Status | Nema Client, B2C, B2B, ID |
| 4.1.3 | Pretraga + filteri Project/Client/Role/Status/Date Range, sort, paginacija | Needs Correction | `RatesPage.jsx` jedna pretraga | — |
| 4.1.4 | Brzi režimi Active / All Assignments | Not Started | — | — |
| 4.1.5 | View detalji; u A1 bez lažnih Add/Edit | Needs Correction | `RatesPage.jsx` ima pravi Add/Edit/Delete dodele (`AssignmentDialog.jsx`) | Ne „lažno obećava", ali A1/A2 redosled spec-a treba uskladiti (T06) |
| 4.1.6 | Export CSV/Excel i PDF po filterima, ceo skup, po pravima | Not Started | `xlsx`, `jspdf` već u `package.json` | — |
| 4.2.1 | Kartica Total Assignments | Not Started | — | — |
| 4.2.2 | Kartica Active Workers (jedinstveni) | Not Started | — | T01 |
| 4.2.3 | Kartica Active Projects | Not Started | — | — |
| 4.2.4 | Kartica Expiring This Month | Not Started | — | — |
| 4.3.1 | Donut Assignments by Status, klik filtrira | Not Started | `recharts` u `package.json` | T03 |
| 4.3.2 | Bar Assignments by Project, klik otvara projekat | Not Started | — | T04 |
| 4.3.3 | Workers Available for Reassignment (slobodna smena) | Not Started | — | T05, zavisi od §13 |
| 4.3.4 | Assignments Ending Soon (30 dana) | Not Started | — | — |
| 4.3.5 | Workforce Shortages kartica | Not Started | — | Zavisi od §13 |
| 4.3.6 | Sve kartice/grafici/tabela isti filteri, datum, prava | Not Started | — | T02 |
| 4.4.1 | Statusi Completed/Upcoming/Ending Soon/Active izvedeni iz datuma, isključivi | Needs Correction | `project_assignments.status` ručni `planned/active/completed/cancelled` (init:402) | Izvedeni status kao čista funkcija |
| 4.4.2 | Status po datumu i vremenskoj zoni projekta; oznaka perioda | Not Started | `projects` nema vremensku zonu | — |
| 4.5.1 | A2 Add Assignment (Employee, Project, Role, datumi, B2C, posebna B2B) | Needs Correction | `AssignmentDialog.jsx` (bez tarifa; tarife posebno u `RateDialog.jsx`) | — |
| 4.5.2 | Reassign: Transfer i Additional, bez gubitka sati | Not Started | — | T23 |
| 4.5.3 | Edit: uloga, datumi, buduće tarife sa efektivnim datumom i tragom | Needs Correction | Edit postoji; tarife sa datumom u `rates`; nema audit traga | — |
| 4.5.4 | End Assignment od datuma, istorija ostaje | Needs Correction | Ručno `end_date`/`status=completed`; brisanje dodele sa tarifom zabranjeno (D22, `rates` FK restrict) | Nema akcije „End" |
| 4.5.5 | Izmena se odražava u Overview/Workers/Workforce/izveštajima; bez konflikta intervala | Needs Correction | — | 2.3.2; nema provere preklapanja dodela istog radnika |

## §5 Satnice, istorija, koeficijenti

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 5.01 | B2B naplata, B2C trošak; Job Role tarifa, izuzetak po dodeli nadjačava | Implemented | `src/lib/payroll/rates.js:31` `RATE_ORDER` (dodela → … → job_role); pgTAP 04, `payroll.test` | Redosled ima 5–6 nivoa (D4) — šire od spec-a, ali ne protivreči |
| 5.02 | Effective From/To, iznos, valuta, istorija izmena | Needs Correction | `rates` (init:418) ima from/to/iznos/valutu | Nema istorije izmena (izmena reda prepisuje) |
| 5.03 | Jednoznačna tarifa; preklapajući zapisi odbijeni; nedostajuća = vidljiva greška | Needs Correction | `rates.js` baca konflikt samo za isti `effective_from` (rates.js ~84); `MissingRateError` (D11) | Baza ne odbija preklapanje intervala (nema exclusion constraint kao `employment_history_no_overlap`) |
| 5.04 | Coefficients & Holidays: Regular/OT/Weekend/Holiday, worker i client | Implemented | `hour_types.worker_coef/client_coef` (init:458); `src/pages/CoefficientsSettings.jsx` | — |
| 5.05 | UI u % (100/150/200), interno 1.0/1.5/2.0 | Implemented | `src/lib/coefficientInput.js` + `coefficientInput.test.js`; D27 (migracija deli vrednosti ≥ 10 sa 100) | Paralelni agent (slika10) |
| 5.06 | Osnovni evropski praznici podrazumevano, uz izmenu | Implemented | `src/lib/europeanHolidays.js` + test; `20261124130000_podrazumevani_sifarnici.sql` (2026–2027), `CoefficientsSettings.jsx`; pgTAP 13; D25 | Paralelni agent (slika11) |
| 5.07 | Jedna kategorija po satu; više kategorija → najviši multiplikator, bez sabiranja | Implemented | `20261124150000_praznik_vikendom.sql` (`praznik_vikend`), `hours.js`, `payroll.test.js`, pgTAP 14; D29 | Veći koeficijent, bez sabiranja; K6 rešen D29 |
| 5.08 | Primer 8 × 45 × 1.0 = 360; 8 × 50 × 1.0 = 400 | Needs Correction | `timesheetAmountsByType` (`hours.js:147`) i baza daju 360/400 za satnicu | Za zaposlene mesečni trošak je bruto 2 (D8), ne 360 — K4 |
| 5.09 | B2C > B2B → upozorenje na negativnu maržu, bez auto-izmene | Implemented | `src/lib/projectSite.js` `negativeLabourMargin` + `projectSite.test.js`; `NegativeMarginNote.jsx` u `ProjectEmployees.jsx` i `Timesheets.jsx`; tarife se ne menjaju (D26) | Paralelni agent |
| 5.10 | Odobren obračun čuva tarife, multiplikatore, valutu, rezultat | Implemented | `rate_snapshot` (D10/D16, `20261114180000_tarifa_pri_odobravanju.sql`); pgTAP 03/04 | — |
| 5.11 | Uklanjanje satnica/Rate Basis/Work Fraction iz forme zaposlenog | Implemented | `EmployeeFormFields.jsx` bez satnica/Rate Basis/Work Fraction, `LegacyPayrollNotice.jsx`; D26 | Paralelni agent (slika3); kolone `rate_basis`/`work_fraction` koristi D17 — K5 |

## §6 Timesheets

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 6.01 | Zapis: Employee, Project, Assignment, datum, smena/vreme od-do, sati, vrsta, status, odobrio | Needs Correction | `timesheets` (init:486): nedeljni red, sati po danu, `approved_by` | Nema `assignment_id` (ima `affiliation_id`), smene ni vremena od-do |
| 6.02 | Draft → Submitted → Approved/Rejected; odobrava ovlašćeni | Implemented | `approval_status` check (init:515); samo admin odobrava/odbija (D16, pgTAP 02) | — |
| 6.03 | Bez preklapanja intervala i neprihvatljivog zbira; validacija i na serveru | Not Started | Samo 0–24 h po danu u jednom redu (init:494-500) | T10 |
| 6.04 | Samo Approved u konačnom; Submitted kao procena | Implemented | D17; `projectReport.js:246` `pending` | — |
| 6.05 | Odobren zaključan; korekcija uz razlog, ovlašćenje, trag, ponovni obračun | Needs Correction | D10 trigger zaključava; vraćanje u nacrt sme admin | Nema razloga ni audit traga korekcije |
| 6.06 | Overview, Monthly Payroll i izveštaji iz istih odobrenih sati | Implemented | `src/lib/payroll/payrollMonth.js`, `timesheetReport.js`, `reports.js` nad istim redovima (D11) | — |
| 6.07 | Bug: Add Timesheet Row ne nudi radnika dodeljenog projektu | Implemented | `projectSite.js` `employeesForProject` + test; `Timesheets.jsx`; D26 (osvežavanje `["project", id]`) | Paralelni agent (slika16/17) — uzrok je dvostruki izvor dodela (2.3.2) |

## §7 Payroll — obaveze i isplate

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 7.01 | Obaveza prema radniku ili prema Vendoru, razrada po radniku | Needs Correction | `payslips` po radniku; engagement iz `employment_history`; bankovni spisak list „Podizvođači" (D21) | Nema obaveze na nivou Vendora (T12) |
| 7.02 | Po periodu: Calculated/Payable, Paid, Remaining, Due Date, status Unpaid/Partially Paid/Paid | Not Started | `payroll_runs.status` (init:736) | — |
| 7.03 | Više Payment zapisa po obavezi (datum, iznos, valuta, referenca, opis, korisnik) | Not Started | — | T11 |
| 7.04 | Remaining = obaveza − uplate; bez duplog povezivanja i preplate | Not Started | — | T11 |
| 7.05 | Obračunati trošak odvojen od stvarnog odliva | Needs Correction | „Payroll Due" = odobreni a neisplaćeni obračuni (D20) | Binarno, bez stvarnih isplata |
| 7.06 | Filter/izvoz po periodu, projektu, radniku, vendoru, statusu, dospelosti; samo ovlašćeni | Needs Correction | `PayrollReports.jsx`, `MonthlyPayroll.jsx` (PDF/Excel, D21), samo admin (RLS) | Nema filtera po statusu isplate/dospelosti |
| 7.07 | Obračun neto/bruto po srpskim propisima (postojeće) | Needs Correction | D7, D17, `src/lib/payroll/serbianPayroll.js`, `monthly.js` | Spec ne pominje porez; definiše Payroll Cost = sati × B2C × coef — K4 |

## §8 Project Costs (C1 → C2)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 8.1.1 | Costs kartica: total, tabela, Add/Edit/Delete, filteri, izvoz; projekat automatski | Not Started | `ProjectCosts.jsx` (Add/Delete) nije uključen u `ProjectDetail.jsx` | Uključiti postojeću komponentu |
| 8.1.2 | Obavezno Project, **Cost Date**, Amount, Currency, Category; Subcategory ako postoji | Needs Correction | `project_costs` (init:441) nema `cost_date`; category nije obavezna u bazi | Dodati `cost_date`; obaveznost potkategorije proveriti u bazi |
| 8.1.3 | Opciono Worker/Vendor, Billable, Receipt/Invoice fajl, Notes | Not Started | `project_costs` ima samo `description`, `notes` | — |
| 8.1.4 | Category/Subcategory iz Settings → Cost Categories | Needs Correction | `ProjectCostsPage.jsx:341-361` bira iz `cost_categories`; čuva se **naziv** (tekst), ne ID | Preimenovanje kategorije prekida vezu |
| 8.1.5 | Podrazumevane kategorije troškova (seed), dodavanje/brisanje | Implemented | `20261124130000_podrazumevani_sifarnici.sql` (`default_cost_categories()`, 12/86), `CostCategoriesSettings.jsx` „Restore default categories"; pgTAP 13; D25 | Paralelni agent (slika8/9) |
| 8.1.6 | Trošak odmah u Financial Report; Payroll trošak ne sme ponovo kao dodatni | Needs Correction | `projectReport.js` oduzima `sumCostsEur` (D19/D20) | Nema zaštite od duplog unosa troška rada |
| 8.2.1 | Centralna tabela Date, Project, Category, Subcategory, Description, Amount, Currency, Actions | Needs Correction | `ProjectCostsPage.jsx:233` lista kartica, bez Date kolone i Edit | — |
| 8.2.2 | Pretraga + filteri Project/Client/Category/Subcategory/Date, sort, izvoz Excel/CSV/PDF | Needs Correction | `ProjectCostsPage.jsx:98` — pretraga + projekat | Nema izvoza |
| 8.2.3 | Zbir po filterima i analitika po kategorijama; valute ne mešati bez kursa | Implemented | `sumCostsEur` + „nedostaje kurs" (D19, `ProjectCostsPage.jsx:106-115`, pgTAP 06) | Kurs je EUR/RSD; datum konverzije nije zabeležen (vidi 10.04) |
| 8.2.4 | Billable je samo oznaka; ne pravi prihod ni fakturu | Not Started | — | T15 |
| 8.2.5 | Istorija izmena; trošak se ne pojavljuje dvaput | Needs Correction | Jedan `project_costs` za oba pogleda ✔ | Nema istorije izmena |

## §9 Client Billing Overview (bez faktura)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 9.01 | B2B obračun = Approved × B2B × client coef, po klijentu/projektu/periodu, po radniku/ulozi, izvoz CSV/Excel/PDF | Needs Correction | `Clients.jsx` + `totalsByClient` (`src/lib/payroll/reports.js:77`) | Bez perioda, radnika/uloge i izvoza |
| 9.02 | Status obračuna In Preparation/Ready/Sent/Invoiced Externally sa ko/kada | Not Started | — | T29 |
| 9.03 | Ručna evidencija eksternog računa (referenca, datum, iznos, valuta, dospeće) | Not Started | — | T16 |
| 9.04 | Client Payment: datum, iznos, valuta, referenca, veza; više delimičnih, korekcija sa tragom | Not Started | — | T16 |
| 9.05 | Outstanding / Unpaid / Partially Paid / Paid; Estimated Unpaid bez eksternog iznosa | Not Started | — | T16, T17 |
| 9.06 | Billable Project Costs odvojeno, bez uvećanja prihoda | Not Started | — | T15 |
| 9.07 | Van obuhvata: izdavanje/slanje/numeracija faktura, PDV, knjiženja | Implemented | Ništa od toga ne postoji u kodu | Čuvati pri razvoju (T29) |

## §10 Financial Reports

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 10.01 | Labor Revenue, Payroll Cost, Labor Margin, Net Project Profit, Profit Margin po formulama | Needs Correction | `projectReport.js:125`, `monthly.js:115` `projectMargin` | Payroll Cost = bruto 2 za zatvorene mesece (D20) — K4; nema Profit Margin % |
| 10.02 | Interni obračun odvojeno od eksterno fakturisanog, uplata i stvarnih isplata | Not Started | — | Zavisi od §7, §9 |
| 10.03 | Filteri Project/Client/period/Employee/Role/Cost Category; izvoz PDF i CSV | Needs Correction | `PayrollReports.jsx` (period, klijent); izvoz Excel/PDF samo za Timesheet Overview | — |
| 10.04 | Više valuta po valuti ili uz kurs i datum; originalni iznosi | Needs Correction | Original + `eur_amount` čuvaju se za troškove (D19) | Satnice samo EUR (D2); nema datuma konverzije — K3 |
| 10.05 | Izveštaji i Dashboard isti obračunski servis; korekcije auditovane | Needs Correction | `src/lib/payroll` jedini izvor (D11) ✔ | Novi `dashboard.js` računa Profit bez troškova; nema audit korekcija |

## §11 Staff Management i operativni moduli

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 11.01 | Jedinstven profil, kvalifikacije, direktno/vendor sa datumima i istorijom | Needs Correction | `employees` + `employment_history` (`EmploymentHistoryCard.jsx`, `AffiliationDialog.jsx`) | Nema strukturisanih kvalifikacija (potrebne za §12, §14) |
| 11.02 | Vendors: firme, radnici, ugovorni periodi, obaveze | Needs Correction | `vendors` (init:106), `Vendors.jsx` | Samo `contract_reference`; nema perioda ugovora ni obaveza |
| 11.03 | Vendor ikonica handshake, ne kamion | Implemented | `navConfig.js:61`, `Vendors.jsx` — ikonica `Handshake` (Truck uklonjen) | Paralelni agent (slika5) |
| 11.04 | Vendor ID automatski VEN-001… | Implemented | `supabase/migrations/20261124110000_vendor_id_automatski.sql`, `supabase/tests/12_vendor_id.test.sql` | Paralelni agent (slika4) |
| 11.05 | CSV uvoz zaposlenih i vendora | Implemented | `csvImport.js`, `csvEmployees.js`, `vendorImport.js` + testovi, `ImportEmployeesDialog.jsx`, `ImportVendorsDialog.jsx`; D25 | Rezime uvoza vendora ne broji preskočene redove (Nalazi N6) |
| 11.06 | Documents: radnik, tip, izdavanje/istek, fajl, status, prava pristupa | Needs Correction | `documents` (init:253): kategorija, istek, fajl, status | Nema datuma izdavanja ni prava pristupa (RLS: svo osoblje, init:945) |
| 11.07 | Attendance/Schedule/Tasks/Leave/Notifications/Reports zadržati i povezati sa Workforce Plan | Needs Correction | Stranice postoje (`Attendance.jsx`, `SchedulePage.jsx`, …) | `schedules` nema `project_id`; nije povezano sa planom |
| 11.08 | Settings kao izvor: Positions, Cost Categories, multiplikatori, prava | Needs Correction | Positions u `department_configs.positions` JSON; kategorije po imenu | Pozicije/kategorije bez stabilnog ID-a |
| 11.09 | Ukloniti polja „Translation (Serbian)" | Implemented | `DepartmentsSettings.jsx` bez unosa prevoda (kolona `translation` ostaje u bazi, D24) | Paralelni agent (slika6) |
| 11.10 | Jezik (EN/SK/RS) i valuta samo u Settings, samo admin | Implemented | `supabase/migrations/20261124140000_podesavanja_aplikacije.sql` (`app_settings`), `LanguageContext.jsx`, `AppSettingsContext.jsx` | Paralelni agent (slika7) |
| 11.11 | Company Details: ZIP, samo Tax ID | Implemented | `20261124120000_adrese_firme_projekta.sql` (`pib` → `tax_id`, `zip`), `companyDetails.js` + test, pgTAP 07; D26 | Paralelni agent (slika12) — menja D18 (PIB 9 cifara) |
| 11.12 | Logo i ime Teamora | Implemented | `public/teamora-logo.png`, `teamora-mark.png`, `favicon.png`, `BrandLogo.jsx`, `index.html`; D23 | Paralelni agent (slika1) |

## §12 Project Onboarding i ZIP

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 12.1.1 | Required Documents po projektu i po Job Role | Not Started | — | T18 |
| 12.1.2 | Tip, obaveznost, period važenja, uloga/projekat, dozvola izvoza; bez ponovnog upload-a | Not Started | — | Reference na `documents` |
| 12.1.3 | Provera postojanja, tipa i važenja za planirani period; ponovo posle izmene | Not Started | `src/lib/documentStatus.js` (samo istek u odnosu na danas) | Proširiti na period |
| 12.1.4 | Statusi Available/Missing/Expired/Expiring Soon/Not Permitted; Ready/Action Required | Not Started | — | — |
| 12.2.1 | Izbor radnika → automatski ZIP samo zahtevanih, postojećih, dozvoljenih | Not Started | Nema ZIP biblioteke ni Edge funkcije | — |
| 12.2.2 | Preview pre preuzimanja | Not Started | — | T19 |
| 12.2.3 | Incomplete paket ne može Ready | Not Started | — | — |
| 12.2.4 | Prava po ulozi i osobi, server-side kontrola download-a i sadržaja | Not Started | Storage: svo osoblje čita bucket `files` (init:~985) | T19 |
| 12.2.5 | Audit pripreme/preuzimanja paketa | Not Started | — | — |

## §13 Workforce Planning

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 13.01 | Centralni pregled i kartica projekta nad istim Assignment/Schedule/Leave | Not Started | — | — |
| 13.02 | Gantt po projektu i Job Role; dan/nedelja/mesec; statusi Assigned…Replacement | Not Started | — | — |
| 13.03 | Required Workforce po projektu/ulozi/datumu/smeni, promenljiv | Not Started | — | T20 |
| 13.04 | Coverage = dostupni kvalifikovani − potrebni po datumu i smeni | Not Started | — | T20, T21 |
| 13.05 | Više projekata/smena bez preklapanja; konflikt vremena/odsustva/lokacije | Not Started | — | T10 |
| 13.06 | Klik na dan/smenu/deficit: ko pokriva, ko fali, zamene | Not Started | — | — |

## §14 Leave Requests i Smart Replacement

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 14.1.1 | Simulacija kapaciteta pri zahtevu za odmor | Not Started | `LeaveRequests.jsx` | T21 |
| 14.1.2 | Prikaz manjka: projekat, pozicija, dan/smena, potrebno, dostupno, deficit | Not Started | — | T21 |
| 14.1.3 | Bez auto-odbijanja; menadžer odobrava uz razlog; ko/kada/zašto | Needs Correction | Odobravanje postoji (`LeaveRequests.jsx:123`), `reviewed_by` tekst; svo osoblje sme (RLS init:945) | Nema razloga, prava ni audita — T24 |
| 14.2.1 | Pretraga slobodnih i Standby, pa kvalifikovanih za premeštaj | Not Started | — | T22 |
| 14.2.2 | Kriterijumi i redosled (uloga, raspoloživost, sertifikati, onboarding, lokacija, B2C) | Not Started | — | — |
| 14.2.3 | Full Match / Partial / Transfer Required / Not Eligible uz objašnjenje | Not Started | — | T22 |
| 14.2.4 | Upozorenje o manjku na izvornom projektu pri transferu | Not Started | — | T23 |
| 14.2.5 | Assign Replacement = privremena dodela tek posle potvrde | Not Started | — | — |
| 14.2.6 | Osvežavanje Gantt/Coverage/Onboarding/kalkulacija; istorija ostaje | Not Started | — | — |

## §15 Obaveštenja, pristup, kvalitet

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 15.01 | Notifications za odmor, deficit, zamenu, dokumente, istek dodele, timesheet, dospeće | Needs Correction | `notifications` (init:334) i `Notifications.jsx` — ručni zapisi, nema generisanja | Mejl blokiran (BLOCKERS.md) |
| 15.02 | Uloge najmanje Admin, Project Manager, HR, Finance; ograničenja po korisniku/projektu | Needs Correction | `profiles.role in ('admin','operater')` (init:24), `is_admin()`/`is_staff()`; `src/lib/access.js` | K2 |
| 15.03 | B2C, isplate, lični dokumenti, ZIP — kontrola na serveru i u eksportu | Needs Correction | RLS za `employee_private`, `rates`, obračune (init:960) ✔; ali `timesheets.b2c_rate`/`worker_cost` vidljivi operateru (D3 svesno ograničenje); `documents` svima | T26 |
| 15.04 | Audit trail (Assignment, Rate, Timesheet, Leave, Document, Billing, Client Payment, Payroll Payment, Cost, preuzimanja) | Not Started | — | — |
| 15.05 | Uvoz iz Base44 bez gubitka veza; duplikati pre migracije | Needs Correction | D13: Luka je odlučio bez prenosa iz Base44 | K7; CSV uvoz (11.05) mora da prepozna duplikate |
| 15.06 | Serverska validacija polja, iznosa, valuta, preklapanja, prava, statusa, integriteta | Needs Correction | Trigeri `guard_timesheet`, `guard_project_cost`, D22, FK-ovi, pgTAP 01–11 | Nema provere preklapanja vremena i tarifa |
| 15.07 | Dosledni empty/loading/error/permission-denied; svetla tema sa ljubičastim akcentima | Implemented | `EmptyState.jsx`, `ErrorBoundary.jsx`, `src/api/errors.js`; tema kroz tokene u `src/index.css` (D23) | — |

## §17 Test scenariji T01–T29

| ID | Test | Status | Dokaz / šta fali |
|---|---|---|---|
| T01 | Dva Assignment reda, Active Workers jednom | Not Started | Nema KPI-ja nad dodelama (3.2.1, 4.2.2) |
| T02 | Isti obuhvat filtera za tabelu, KPI, grafike, CSV, PDF | Not Started | §4.1, §4.3 |
| T03 | Donut = 100%, klik filtrira | Not Started | 4.3.1 |
| T04 | Assignments by Project i Quick Insights vode na filtrirane liste | Not Started | 4.3.2 |
| T05 | Workers Available po slobodnoj smeni | Not Started | 4.3.3, §13 |
| T06 | A1 bez obmanjujućih akcija; A2 Add/Edit/Reassign | Needs Correction | Add/Edit postoje (`AssignmentDialog.jsx`), Reassign ne |
| T07 | Tarifa od 15.: sati pre/posle po svojoj tarifi; zaključen obračun isti | Needs Correction | Snimak ✔ (pgTAP 04); tarifa po `week_start`, ne po danu (D16) |
| T08 | R/OT/W/H sa worker/client koeficijentima — dva tačna iznosa | Implemented | `payroll.test.js` (praznik vikendom), pgTAP 14, pgTAP 03; D29 — K4 ostaje otvoren za trošak zaposlenog |
| T09 | Rejected/Submitted ne ulaze, Approved ulazi | Implemented | pgTAP 05 (`lock_month` traži odobrene), `projectReport.test.js` (pending odvojeno) |
| T10 | Dva projekta isti dan bez preklapanja; preklapanje odbijeno | Not Started | 6.03 |
| T11 | Delimične isplate smanjuju Remaining | Not Started | 7.03–7.04 |
| T12 | Vendor radnik: pojedinačan obračun, primalac Vendor | Needs Correction | Listić po radniku ✔, podizvođači odvojeni u spisku (D21); nema obaveze prema Vendoru |
| T13 | Trošak iz Project → Costs postoji jednom u centralnom pregledu | Not Started | Kartica Costs nije uključena (8.1.1); tabela je jedna ✔ |
| T14 | Cost sa kategorijom i radnikom ulazi jednom u profit | Needs Correction | Jednom ulazi ✔ (`projectReport.test.js`); nema veze sa radnikom (8.1.3) |
| T15 | Billable Cost kao kandidat, bez fakture/prihoda | Not Started | 8.2.4 |
| T16 | Eksterni račun + dve delimične uplate → Outstanding, Partially Paid | Not Started | §9 |
| T17 | Dashboard ne meša obračun/fakturisano/uplaćeno, trošak/isplaćeno, profit/novac | Not Started | 3.2.8, §7, §9 |
| T18 | Welder mora sertifikat koji Fitter ne mora | Not Started | §12 |
| T19 | ZIP preview; bez prava nema preuzimanja ni direktnim pozivom | Not Started | §12 |
| T20 | Required Workforce po datumu/smeni; Gantt i deficit prate | Not Started | §13 |
| T21 | Odsustvo pokazuje tačan manjak po ulozi/smeni | Not Started | §14 |
| T22 | Predlog slobodnog kvalifikovanog; Partial Match | Not Started | §14 |
| T23 | Transfer pokazuje posledicu po izvorni projekat | Not Started | §14 |
| T24 | Odmor uprkos deficitu samo menadžer sa pravom, uz razlog i audit | Not Started | 14.1.3, 15.02 |
| T25 | Preimenovanje projekta/klijenta ne prekida relacije | Implemented | `propagate_*_rename` (init), `payroll.test:1163`, BACKLOG Phase 4 Accept |
| T26 | Bez finansijskog prava nema B2C isplata ni u CSV/PDF | Needs Correction | RLS za obračune ✔; `timesheets.b2c_rate`/`worker_cost` čitljivi operateru (D3) |
| T27 | Dashboard metrike = izvorni moduli za isti period | Not Started | 3.x u izradi; test ne postoji |
| T28 | Nijedan agregat ne sabira EUR i drugu valutu bez kursa i datuma | Needs Correction | Troškovi ✔ (D19, pgTAP 06); kurs bez datuma konverzije; satnice samo EUR |
| T29 | Billing bez kreiranja/PDF/slanja/numeracije faktura; izvoz, status, uplate rade | Not Started | Prvi deo trivijalno ✔ (nema faktura), izvoz/status/uplate ne postoje |

---

## Konflikti sa postojećim odlukama — treba odluka Luke

Spec v1.4 kaže „ne otvarati poslovne odluke", ali sledeće obavezujuće odluke iz `DECISIONS.md` mu direktno protivreče. Do Lukine odluke Phase 7 zadaci koji ih diraju su NEEDS-USER.

| # | Odluka | Šta kaže DECISIONS.md | Šta traži spec v1.4 | Predlog |
|---|---|---|---|---|
| K1 | **D3 + D16 — ko odobrava** | Satnice odobrava/odbija samo `admin` (baza) | Odobravaju „ovlašćeni korisnici" (PM/Finance) | Uvesti pravo `approve_timesheets` umesto `is_admin()` u `guard_timesheet` (posle K2) |
| K2 | **D3 + D14 — uloge** | Samo `admin` i `operater`; operater ne vidi novac | Najmanje Admin, Project Manager, HR, Finance + ograničenja po korisniku/projektu | Nova tablica uloga/prava; `operater` → HR/Operations; RLS preraditi po pravima. Najveći zahvat u bazi |
| K3 | **D2 — sve u EUR** (+ nova `app_settings.currency in ('EUR')`) | Svi iznosi u EUR; bez kursa nema obračuna | Tarife sa valutom; „po valuti ili uz kurs i datum konverzije"; ne sabirati valute | Zadržati EUR kao jedinu valutu tarifa (rates.js već odbija ne-EUR) i formalno potvrditi; za troškove dodati datum kursa. Ili otvoriti multi-valutu (veliko) |
| K4 | **D7 + D8 + D17 + D20 — Payroll po srpskim propisima** | Trošak zaposlenog = bruto 2 (porez, doprinosi), raspodela po projektima | Payroll Cost = Approved × B2C × worker coef; Profit = Revenue − Payroll Cost − Costs | Prikazati oba: „Payroll Cost (B2C)" kao spec KPI, a bruto 2 kao „Employer cost" za zaposlene; ili ukinuti bruto 2 kao trošak projekta. Menja D8/D20 |
| K5 | **D4 + D17 — satnica iz profila, rate_basis, work_fraction** | Profil radnika je poslednji nivo tarife; `rate_basis` i `work_fraction` ulaze u obračun i provere (`payroll_run_problems`) | Forma zaposlenog bez satnica (slika3); B2C vezan za radnika/angažman i projekat | Ako se polja izbace iz forme: ukloniti nivo `profile` iz `rates.js` + `resolve_timesheet_rate`, a `rate_basis`/`work_fraction` dobijaju podrazumevane vrednosti ili se sele u angažman. Paralelni agent upravo skida polja — proveriti da obračun ne pukne |
| K6 | **REŠENO — D29 (24.11.2026)** — D5 + D16 vrsta sata po prioritetu | Praznik → vikend → prekovremeno (fiksan prioritet) | Najviši konfigurisani multiplikator među kategorijama koje važe | Promeniti `classifyWeek` + trigger na „najviši koeficijent" (posebno za radnika i za klijenta?) — treba pravilo kad se worker i client koeficijenti razlikuju |
| K7 | **D13 — bez prenosa iz Base44** | Kreće se od prazne baze | „Uvoz/migracija iz Base44 bez gubitka veza i istorije" (§15, §18 plan migracije) | Potvrditi D13; plan migracije = CSV uvoz (11.05) sa proverom duplikata |
| K8 | **D9 — samo po satu** | Prihod samo po satu (paušal kasnije) | Isto (B2B po satu) | Nema konflikta — potvrda |
| K9 | **REŠENO — D23 (24.11.2026)** — D12 isti ekrani, isti dizajn | Nijedan ekran se ne pravi iznova | Novi dashboard, tema, sidebar, preimenovanje Rates & Assignments, nove kartice projekta | Lukin nalog za Teamora redizajn već de facto menja D12 — upisati izmenu |
| K10 | **REŠENO — D26 (24.11.2026)** — D18 PIB 9 cifara | Podaci firme: PIB (9 cifara), matični broj | Samo Tax ID + ZIP (slika12) | Paralelni agent menja; upisati izmenu D18 |
| K11 | **D10 — vraćanje u nacrt** | Admin vraća odobrenu satnicu u nacrt bez razloga | Korekcija uz razlog, ovlašćenje, audit i ponovni obračun perioda | Dopuna D10: obavezan razlog + audit zapis |
| K12 | **D16 — tarifa po nedelji** | Tarifa se bira za `week_start` reda | Tarifa koja važi na datum rada (T07: promena 15.) | Birati tarifu po danu u `guard_timesheet`/`resolve_timesheet_rate` i `rates.js`, ili zabraniti `effective_from` koji nije ponedeljak |

## Plan migracije i relacija (§18)

- **Base44 podaci:** po D13 nema prenosa — produkcija kreće prazna; podaci se unose ručno ili CSV uvozom (11.05). Ako Luka promeni D13 (K7), plan: izvoz Base44 entiteta u CSV → mapiranje imena na ID (`project_id`/`client_id`, kao `sync_project_client`) → prijava duplikata pre upisa (isto ime + datum rođenja / e-mail) → upis kroz `base44Client.js` (D15) da važe svi trigeri.
- **Interna migracija modela (Phase 7 korak 1):** `projects.assigned_employees` JSON → redovi u `project_assignments` (jedan red po radniku×projektu, tarife iz JSON-a → `rates` sa `scope='assignment'` i `effective_from` = početak dodele), uz pgTAP da odobrene satnice i obračuni ostaju bajt-identični (D10). JSON kolona ostaje samo za čitanje dok se ekrani ne prebace, pa se uklanja.
- **Kategorije troškova / pozicije:** tekstualni nazivi → ID reference (`cost_category_id`), stari tekst ostaje kao snimak za prikaz.
