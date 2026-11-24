# IMPLEMENTATION MATRIX — Teamora spec v1.4 (23.11.2026)

Spec §16 korak 0 i §18.1. Stanje utvrđeno 25.11.2026 čitanjem koda, migracija i testova na grani `claude/teamora-ui-ux-changes-b7f723` (commit `b4d3410` + izmene T23: migracija `20261125170000_zamena_izvorni_projekat.sql`, pgTAP 36). Prethodna verzija (24.11.2026, posle `3037ae5`) imala je 41 Implemented / 63 Needs Correction / 88 Not Started.
Plan rada: `BACKLOG.md` → „Phase 7 — Teamora spec v1.4". Redovi su proveravani po `PHASE7-CHECKLIST.md` (stroga provera P7-2: kod + imenovani testovi + pregledač + SQL kao uloga); migracija postojećih podataka: `docs/PLAN-MIGRACIJE.md`; korisnička uputstva: `docs/UPUTSTVA.md`.

**Statusi:**
- **Implemented** — postoji i radi po pravilu spec-a (dokaz: kod / migracija / test).
- **In Progress** — upravo se radi (necommitovano u radnom stablu).
- **Needs Correction** — postoji, ali odstupa od spec-a ili nedostaje deo (vidi napomenu).
- **Not Started** — nema ni tabele ni ekrana.

Skraćenice za dokaz: `init` = `supabase/migrations/20261113170000_init.sql`; `migr. NN` = `supabase/migrations/202611250NN0000_*.sql` (01 temelj/uloge/audit, 02 prava RLS, 03 angažmani/tarife, 04 satnice po danu, 05 troškovi, 06 onboarding, 07 workforce, 08 obaveze/isplate, 09 billing, 10 odsustva/zamene, 11 obaveštenja; `1601xx`–`17` integracija); `pgTAP NN` = `supabase/tests/NN_*.test.sql`; `payroll.test` = `src/lib/payroll/payroll.test.js`.

## Sažetak

| Status | Zahtevi §1–§15 | Testovi T01–T29 | Ukupno |
|---|---|---|---|
| Implemented | 160 | 29 | 189 |
| In Progress | 0 | 0 | 0 |
| Needs Correction | 0 | 0 | 0 |
| Not Started | 0 | 0 | 0 |
| **Ukupno** | **160** | **29** | **189** |

Verify (poslednji potpun prolaz, 24.11.2026): `npm run build` exit 0 · `npm test` 44 fajla / 617 testova · `npm run test:db` 32 fajla / 944 testa · `npm run lint` 0. Posle toga dodat je pgTAP 36 (T23) i izmene `replacements.*`; ponovo pokrenuti pre commita.
Isporuke §18 (nisu redovi matrice): 18.1 ova matrica, 18.2 `docs/PLAN-MIGRACIJE.md`, 18.3 `BACKLOG.md` Phase 7 (fazni plan sa dokazima), 18.4 pgTAP 20/26/28/29, 18.5 uputstva `docs/UPUTSTVA.md`.

---

## §1 Poslovni cilj i potvrđene odluke (01–10)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 1.01 | Direktni radnici i radnici preko vendora; razlikovati primaoca plaćanja | Implemented | project_assignments.payee/vendor iz angažmana (fill_assignment_engagement, migr. 03); pgTAP 28 T12 i payablesList.test.js T12. | — |
| 1.02 | B2B naplata po satu iz odobrenih Timesheets | Implemented | `guard_timesheet` računa `client_revenue` (migr. `20261125040000_satnice_po_danu.sql`, `20261114150000`); izvor za Billing je `labor_day_lines` (samo odobrene); `src/lib/billingOverview.js`, pgTAP 24, 29 | D9 |
| 1.03 | Payroll: obaveza + stvarne isplate, delimične isplate, datumi, preostalo | Implemented | tabele payables/payable_lines/payments (migr. 08); pgTAP 28 T11; ekran Payables & Payments. | — |
| 1.04 | Isti radnik na više projekata po danu/smeni/satu bez preklapanja | Implemented | timesheet_entries + guard preklapanja (migr. 04); pgTAP 24 T10, timesheetDays.test.js T10. | — |
| 1.05 | Onboarding ZIP sa pravima | Implemented | migr. 06 onboarding + onboardingZip.js; pgTAP 26 T18/T19. | — |
| 1.06 | Odmori: manjak, zamene, odobrenje uz obrazloženje | Implemented | decide_leave_request + assign_replacement (migr. 10, 160100, 170000); pgTAP 30/33/36 T21–T24. | — |
| 1.07 | B2B/B2C izmena važi od datuma; zaključeni obračuni isti | Implemented | change_rate/guard_rate_history (migr. 03), tarifa po danu (04); pgTAP 23/24 T07. | — |
| 1.08 | Samo Approved sati u konačnom Payroll i prihodu | Implemented | D17 (`lock_month`, samo odobrene); `src/lib/finance/laborLines.js` (samo `approved`, `submitted` kao procena odvojeno); `laborLines.test.js` i `projectReport.test.js` T09; pgTAP 05, 24 | — |
| 1.09 | Potrebe po projektu/Job Role/datumu/smeni | Implemented | workforce_requirements (migr. 07); pgTAP 27 T20; ekran Workforce Planning → Requirements. | — |
| 1.10 | Interni B2B obračun, ručno praćenje uplata, bez faktura | Implemented | billing_summaries/client_payments (migr. 09); pgTAP 29 T16/T29; ekran Clients / Billing Overview. | — |

## §2 Navigacija, ekran projekta, jedan izvor istine

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 2.1.1 | Dashboard (Main Dashboard) u meniju | Implemented | `src/components/layout/navConfig.js` `DASHBOARD_ITEM` | — |
| 2.1.2 | Staff Management: Employees, Vendors, Documents, Attendance, Schedule, Tasks, Leave, Notifications, Reports | Implemented | `navConfig.js` sekcija `section_employees`; rute u `src/App.jsx` | — |
| 2.1.3 | Projects: Project Overview, Project Costs, **Project Assignments**, **Workforce Planning** | Implemented | Meni Projects: Project Overview, Project Costs, Project Assignments (/assignments), Workforce Planning (/workforce) — videno u pregledaču. | — |
| 2.1.4 | Payroll: Dashboard, Timesheets, Timesheet Overview, Monthly Payroll, Clients/Billing Overview, Payroll Reports | Implemented | Meni Payroll: Payroll Dashboard, Timesheets, Timesheet Overview, Monthly Payroll, Payables & Payments, Clients / Billing Overview, Payroll Reports. | — |
| 2.1.5 | Reports: centralni, kontrolisani izveštaji i export | Implemented | Reports stranica: „Reports & exports“ sa Payroll Reports, Project Costs, Billing, Payables, Timesheet Overview, Project Assignments (izvozi CSV/XLSX/PDF); HR bez prava: canAccessPath + PermissionDenied (App.jsx:54). | — |
| 2.1.6 | Settings: Email, Departments & Positions, Cost Categories, Coefficients & Holidays, Company Details, Users/Permissions | Implemented | `navConfig.js` sekcija `section_settings`; rute u `App.jsx`; Users/Permissions sa 4 uloge (15.02) | — |
| 2.2.1 | Projekat — kartice Overview \| Workers \| Onboarding \| Costs \| Workforce Plan \| Financial Report | Implemented | ProjectDetail: Overview / Workers / Onboarding / Costs / Workforce Plan / Financial Report — svih 6 kartica otvoreno u pregledaču. | — |
| 2.2.2 | Overview: osnovni podaci, klijent, lokacija, period, status, Job Roles i B2B tarife | Implemented | `ProjectDetail.jsx`, `src/components/projects/ProjectRoles.jsx` (Job Roles = `project_roles`) | — |
| 2.2.3 | Workers: radnici, uloga, B2C, B2B, datumi, status | Implemented | Workers kartica: radnici, Job Role, period, B2C/B2B, status (QA-Radnik-1…4); izvor project_assignments (JSON je izvedeni keš, guard_project_cache odbija direktan upis). | — |
| 2.2.4 | Onboarding kartica | Implemented | Onboarding kartica: zahtevi, Worker readiness, Prepare package (pregledač). | — |
| 2.2.5 | Costs kartica sa automatski izabranim projektom | Implemented | Costs kartica sa troškom projekta (QA-trosak-100EUR), projekat automatski; pgTAP 25 T13. | — |
| 2.2.6 | Workforce Plan kartica | Implemented | Workforce Plan kartica: Gantt filtriran na projekat, isti brojevi kao centralni (−2 · 3/5). | — |
| 2.2.7 | Financial Report kartica | Implemented | Financial Report kartica: Labor Revenue 2,040, Payroll Cost 1,224, Additional Costs 100, Net Profit 716, margin 35.10%, „Timesheets not included“ lista. | — |
| 2.2.8 | Lokacija projekta: Address, ZIP, City | Implemented | `20261124120000_adrese_firme_projekta.sql` (`address`, `zip`, `city`), `ProjectFormModal.jsx`, `projectSite.js` `projectAddress()`; D26 | — |
| 2.3.1 | Project i Client stabilni ID; relacije ne po nazivu | Implemented | `projects.client_id`, `timesheets.project_id`, `project_assignments.project_id`, `propagate_client_rename`/`propagate_project_rename` (init); T25 u `projectReport.test.js` i pgTAP 21/22 | Veze su po ID-u; naziv je samo snimak za prikaz |
| 2.3.2 | Jedinstvena evidencija za Assignment, Rate History, Timesheet, Project Cost, Document, Leave, Workforce Requirement, Billing Summary, Client Payment, Payable, Payment | Implemented | docs/TEAMORA-DATA-MODEL.md §2.4–2.13 po jedna tabela; proba migracija: JSON dodele prebačene u project_assignments (legacy_source), backup JSON-a u migration_report, keš bez tarifa. | K2/§2.3: jedan izvor dodela; JSON je keš |
| 2.3.3 | Centralne stranice i kartice projekta menjaju iste zapise | Implemented | UI piše kroz RPC nad project_assignments; „The assignment appears at once on the project's Workers tab, in Project Assignments and in planning“; pgTAP 22. | — |
| 2.3.4 | Audit trail za izmene i potvrđene finansijske podatke | Implemented | Vidi 15.04 — audit_log sa triggerima na 18 tabela. | — |

## §3 Main Dashboard

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 3.0 | Novi izgled dashboarda (svetla tema, ljubičasti akcenti) | Implemented | `src/pages/Dashboard.jsx`, `src/components/dashboard/*` (KpiCard, RevenueChart, ProfitDonut, TopTable, AtAGlance, ActionCenter, QuickLinks, WorkforceOverview), `src/lib/payroll/dashboard.js`; D23 | — |
| 3.1.1 | Filteri: period (podrazumevano tekući mesec), Project, Client, Status | Implemented | Dashboard: period, All clients, All projects, All statuses (Dashboard.jsx:278); filterTimesheets test. | — |
| 3.1.2 | Klik na KPI/upozorenje vodi na filtriranu izvornu listu | Implemented | KpiCard `to` = finLink/listUrl sa parametrima perioda i filtera (Dashboard.jsx:404–415). | — |
| 3.1.3 | Prikaz samo dozvoljenih projekata/radnika/iznosa; HR/Operations bez stopa i finansija | Implemented | SQL kao hr@radnici.local: rates 0, payables 0, payments 0, project_costs 0, timesheet_money.worker_cost 0 ne-null; pm: b2c 0; pgTAP 20 T26. | — |
| 3.2.1 | KPI Active Workers (jedinstveni radnici sa aktivnim Assignment) | Implemented | Dashboard „Active Workers 4 — Unique workers with an assignment in the period“; dashboard.test.js T01. | — |
| 3.2.2 | KPI Active Projects | Implemented | „Active Projects 3 — 3 with status Active · 2 with assignments in the period“. | — |
| 3.2.3 | KPI Approved Hours | Implemented | „Approved Hours 105h — +21h awaiting approval (estimate, not included)“. | — |
| 3.2.4 | KPI Calculated B2B Revenue | Implemented | `src/lib/finance/summary.js` `financialSummary().laborRevenue` (Approved × B2B × client coef po valuti); `dashboard.js` ga koristi; `kpis.test.js`, `dashboard.test.js` T27 | — |
| 3.2.5 | KPI Payroll Cost (B2C × worker coef, ne plaćeno) | Implemented | `financialSummary().payrollCost` = Approved × B2C × worker coef (`src/lib/finance/kpis.js`); `kpis.test.js` („§5 primer“ 8 × 45 = 360) | K4 rešen D30: nije isplaćeno i nije bruto 2 |
| 3.2.6 | KPI Additional Project Costs (po valuti ili uz kurs) | Implemented | „Additional Project Costs €100“; currency.test.js T28 (bez kursa+datuma ne ulazi u EUR). | — |
| 3.2.7 | KPI Project Profit | Implemented | „Project Profit −€100“ = prihod − trošak − dodatni (kpis.test.js); vidi P7-N5 za satnice bez snimka. | — |
| 3.2.8 | Client Unpaid / Payables kao odvojene kartice | Implemented | Odvojene kartice Payables €556 i Client Unpaid (+ Unbilled Revenue). | — |
| 3.3.1 | Financial Overview grafik po mesecima/projektima | Implemented | Revenue, Costs & Profit + Profitability Overview po valuti (kpis/currency). | — |
| 3.3.2 | Workforce Overview (aktivni, raspoloživi, po projektima/pozicijama) | Implemented | Workforce Overview: Active Workers 4, Available today 2 of 5, By project, By position. | — |
| 3.3.3 | Action Center (odmori, shortages, istek dodela, dokumenti, pending timesheets, obaveze, dospela potraživanja) | Implemented | Action Center: Workforce shortages (16 worker-shifts), Pending Timesheets 3, Unpaid payables 1 — linkovi. | — |
| 3.3.4 | Quick Links po pravima | Implemented | Quick Links sa `ok: can(…)` + canAccessPath (Dashboard.jsx:452–457). | — |
| 3.3.5 | Loading/empty/error; KPI bez podataka = 0 | Implemented | Prazna stanja („No approved hours in this period“, „No revenue in this period“), upozorenje o satnicama sa problemom. | — |

## §4 Project Assignments (A1 → A2)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 4.0 | Preimenovanje Rates & Assignments → Project Assignments | Implemented | Meni i naslov „Project Assignments“, ruta /assignments; migr. 160300 menja naziv i u poruci baze. | — |
| 4.1.1 | Centralna tabela: red = jedan Assignment | Implemented | Tabela Assignments (5), red = angažman (assignments.test.js T01). | — |
| 4.1.2 | Kolone Employee, Project, Client, Job Role, B2C, B2B, Start, End, Status, Actions (+ ID, valuta) | Implemented | Kolone Employee (+EMP-ID), Project (+Client), Job Role, B2C Rate, B2B Rate, Start, End, Status, Actions. | — |
| 4.1.3 | Pretraga + filteri Project/Client/Role/Status/Date Range, sort, paginacija | Implemented | Filteri Project/Client/Job Role/Status/Date Range + pretraga; assignments.test.js T02. | — |
| 4.1.4 | Brzi režimi Active / All Assignments | Implemented | Prekidači Active / All Assignments na stranici. | — |
| 4.1.5 | View detalji; u A1 bez lažnih Add/Edit | Implemented | Akcije reda: View assignment, Edit assignment, More actions — sve otvaraju stvarne dijaloge. | — |
| 4.1.6 | Export CSV/Excel i PDF po filterima, ceo skup, po pravima | Implemented | Export (CSV/XLSX) i Generate Report (PDF) nad filtriranim skupom; assignments.test.js T02/T26. | — |
| 4.2.1 | Kartica Total Assignments | Implemented | Total Assignments 5 — Across 2 projects. | — |
| 4.2.2 | Kartica Active Workers (jedinstveni) | Implemented | Active Workers 4 — „counted once“ (T01). | — |
| 4.2.3 | Kartica Active Projects | Implemented | Active Projects 2 — With workforce assigned. | — |
| 4.2.4 | Kartica Expiring This Month | Implemented | Expiring This Month 0 — Assignments end by Nov 30. | — |
| 4.3.1 | Donut Assignments by Status, klik filtrira | Implemented | Assignments by Status: Active 5 (100.0%), Upcoming/Ending soon/Completed 0 (0.0%); assignments.test.js T03. | — |
| 4.3.2 | Bar Assignments by Project, klik otvara projekat | Implemented | Assignments by Project: QA-Projekat-1 4, QA-Projekat-2b 1 (vidi T04 za test). | — |
| 4.3.3 | Workers Available for Reassignment (slobodna smena) | Implemented | Workers Available for Reassignment 2 — „Free on Nov 24 · whole …“; workforce.test.js T05, pgTAP 27. | — |
| 4.3.4 | Assignments Ending Soon (30 dana) | Implemented | Kartica Ending Soon odvojena od Expiring This Month (assignmentStatus ≤30 dana, assignments.test.js). | — |
| 4.3.5 | Workforce Shortages kartica | Implemented | Workforce Shortages kartica / Action Center 16 worker-shifts; workforce_coverage. | — |
| 4.3.6 | Sve kartice/grafici/tabela isti filteri, datum, prava | Implemented | Jedan izvor skupa u src/lib/assignments.js za tabelu, KPI, grafike i izvoz (T02). | — |
| 4.4.1 | Statusi Completed/Upcoming/Ending Soon/Active izvedeni iz datuma, isključivi | Implemented | assignmentStatus izveden iz datuma, isključivi statusi (assignments.test.js T03). | — |
| 4.4.2 | Status po datumu i vremenskoj zoni projekta; oznaka perioda | Implemented | todayInZone(timeZone) (assignments.js:43) + „Status as of Nov 24, 2026 in each project's time zone“. | — |
| 4.5.1 | A2 Add Assignment (Employee, Project, Role, datumi, B2C, posebna B2B) | Implemented | Add assignment dijalog (Employee, Project, Job role, Planned shift, Start/End, tarife); create_assignment RPC; pgTAP 22. | — |
| 4.5.2 | Reassign: Transfer i Additional, bez gubitka sati | Implemented | transfer_assignment / additional_assignment RPC (migr. 03); pgTAP 22 (istorija sati ostaje). | — |
| 4.5.3 | Edit: uloga, datumi, buduće tarife sa efektivnim datumom i tragom | Implemented | update_assignment_with_rates atomarno (migr. 160200); pgTAP 34 T07 + audit. | — |
| 4.5.4 | End Assignment od datuma, istorija ostaje | Implemented | end_assignment RPC; pgTAP 22 (End/Cancel, T06 baza). | — |
| 4.5.5 | Izmena se odražava u Overview/Workers/Workforce/izveštajima; bez konflikta intervala | Implemented | guard_assignment_overlap; pgTAP 22; dodela vidljiva na Workers/Workforce. | — |

## §5 Satnice, istorija, koeficijenti

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 5.01 | B2B naplata, B2C trošak; Job Role tarifa, izuzetak po dodeli nadjačava | Implemented | `src/lib/payroll/rates.js` `RATE_ORDER`; `resolve_rate` u bazi (assignment → role → project → employee, migr. `20261125030000`); pgTAP 23, 24; `rateHistory.test.js` | Izuzetak po angažovanju nadjačava Job Role tarifu |
| 5.02 | Effective From/To, iznos, valuta, istorija izmena | Implemented | rates: effective_from/to, valuta, superseded_by, change_reason; change_rate zatvara stari red; pgTAP 23; rateHistory.test.js T07. | — |
| 5.03 | Jednoznačna tarifa; preklapajući zapisi odbijeni; nedostajuća = vidljiva greška | Implemented | exclusion rates_no_overlap + timesheet_rate_problem (vidljiva greška); proba: preklapanje 41/43 normalizovano bez promene izbora. | — |
| 5.04 | Coefficients & Holidays: Regular/OT/Weekend/Holiday, worker i client | Implemented | resolve_rate assignment → role → project → employee; profil više nije nivo (D30 K5); pgTAP 23. | — |
| 5.05 | UI u % (100/150/200), interno 1.0/1.5/2.0 | Implemented | `src/lib/coefficientInput.js` + `coefficientInput.test.js`; D27 | — |
| 5.06 | Osnovni evropski praznici podrazumevano, uz izmenu | Implemented | `src/lib/europeanHolidays.js` + test; `20261124130000_podrazumevani_sifarnici.sql`; pgTAP 13; D25 | — |
| 5.07 | Jedna kategorija po satu; više kategorija → najviši multiplikator, bez sabiranja | Implemented | `20261124150000_praznik_vikendom.sql`, `src/lib/payroll/hours.js`, `payroll.test.js`, pgTAP 14; D29; `guard_timesheet` v4 koristi `hour_types` | Najviši koeficijent, bez sabiranja |
| 5.08 | Primer 8 × 45 × 1.0 = 360; 8 × 50 × 1.0 = 400 | Implemented | kpis/laborLines testovi (8×45=360, 8×50=400) — Payroll Cost = sati × B2C × koef. | K4: Payroll Cost = sati × B2C × koef. |
| 5.09 | B2C > B2B → upozorenje na negativnu maržu, bez auto-izmene | Implemented | `src/lib/projectSite.js` `negativeLabourMargin` + `projectSite.test.js`; `NegativeMarginNote.jsx`; tarife se ne menjaju (D26) | — |
| 5.10 | Odobren obračun čuva tarife, multiplikatore, valutu, rezultat | Implemented | `rate_snapshot` v1/v2 (`20261114180000`, `20261125040000`); pgTAP 04, 24; `timesheetDays.test.js` T07 | — |
| 5.11 | Uklanjanje satnica/Rate Basis/Work Fraction iz forme zaposlenog | Implemented | `EmployeeFormFields.jsx` bez satnica/Rate Basis/Work Fraction, `LegacyPayrollNotice.jsx`; D26 | K5 rešen D30: tarife samo u `rates`; kolone `rate_basis`/`work_fraction` ostaju za srpski obračun (D17) |

## §6 Timesheets

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 6.01 | Zapis: Employee, Project, Assignment, datum, smena/vreme od-do, sati, vrsta, status, odobrio | Implemented | timesheets.assignment_id, timesheet_entries (početak/kraj/smena/pauza), submitted_by/rejected_by (migr. 04). | — |
| 6.02 | Draft → Submitted → Approved/Rejected; odobrava ovlašćeni | Implemented | guard_timesheet v4: timesheets.edit/approve; pgTAP 24 (HR/PM po pravu). | — |
| 6.03 | Bez preklapanja intervala i neprihvatljivog zbira; validacija i na serveru | Implemented | Preklapanje intervala i max_daily_hours u bazi; pgTAP 24 T10. | — |
| 6.04 | Samo Approved u konačnom; Submitted kao procena | Implemented | labor_day_lines samo odobreni; T09 u laborLines/timesheetDays/projectReport i pgTAP 24; Submitted kao procena na Dashboard-u i Reports. | — |
| 6.05 | Odobren zaključan; korekcija uz razlog, ovlašćenje, trag, ponovni obračun | Implemented | reopen_timesheet uz razlog i audit 'correction' (K11); pgTAP 24/21. | — |
| 6.06 | Overview, Monthly Payroll i izveštaji iz istih odobrenih sati | Implemented | labor_day_lines kao jedini izvor za Payables, Billing, Reports (data model §3.2). | — |
| 6.07 | Bug: Add Timesheet Row ne nudi radnika dodeljenog projektu | Implemented | Tarifa po datumu rada (T07) — pgTAP 24. | — |

## §7 Payroll — obaveze i isplate

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 7.01 | Obaveza prema radniku ili prema Vendoru, razrada po radniku | Implemented | Primalac radnik ili Vendor; pgTAP 28 T12. | — |
| 7.02 | Po periodu: Calculated/Payable, Paid, Remaining, Due Date, status Unpaid/Partially Paid/Paid | Implemented | Payables & Payments: Calculated, Paid, Remaining, Due, status (payables.test.js). | — |
| 7.03 | Više Payment zapisa po obavezi (datum, iznos, valuta, referenca, opis, korisnik) | Implemented | payments (datum, iznos, valuta, referenca, opis, recorded_by); pgTAP 28. | — |
| 7.04 | Remaining = obaveza − uplate; bez duplog povezivanja i preplate | Implemented | Remaining = ukupno − uplate; preplata/druga valuta/izmena odbijeni; pgTAP 28 T11. | — |
| 7.05 | Obračunati trošak odvojen od stvarnog odliva | Implemented | Payables odvojeno od isplata; Dashboard „Confirmed, not yet paid out“ (T17). | — |
| 7.06 | Filter/izvoz po periodu, projektu, radniku, vendoru, statusu, dospelosti; samo ovlašćeni | Implemented | Filteri perioda i Export na Payables; HR/PM bez pristupa (SQL: payables 0, payments 0). | — |
| 7.07 | Obračun neto/bruto po srpskim propisima (postojeće) | Implemented | Monthly Payroll radi (ruta učitana), payroll_runs/payslips nedirnuti (R10). | K4 rešen D30: srpski mesečni obračun (neto/bruto) ostaje, ali nije izvor troška projekta |

## §8 Project Costs (C1 → C2)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 8.1.1 | Costs kartica: total, tabela, Add/Edit/Delete, filteri, izvoz; projekat automatski | Implemented | Costs kartica + /project-costs: Add/Edit/Delete, filteri, izvoz (projectCostsExport.js). | — |
| 8.1.2 | Obavezno Project, **Cost Date**, Amount, Currency, Category; Subcategory ako postoji | Implemented | guard_project_cost v2 (cost_date, kategorija, potkategorija); pgTAP 25; proba: backfill cost_date = created_date. | — |
| 8.1.3 | Opciono Worker/Vendor, Billable, Receipt/Invoice fajl, Notes | Implemented | employee_id/vendor_id, billable, receipt_url/receipt_name (privatni bucket, migr. 060100). | — |
| 8.1.4 | Category/Subcategory iz Settings → Cost Categories | Implemented | cost_category_id FK + snimak naziva (propagate_cost_category_rename); prikaz „No category linked“ za nepovezane. | — |
| 8.1.5 | Podrazumevane kategorije troškova (seed), dodavanje/brisanje | Implemented | `20261124130000_podrazumevani_sifarnici.sql` (`default_cost_categories()`, 12/86), `CostCategoriesSettings.jsx` „Restore default categories“; pgTAP 13; D25 | — |
| 8.1.6 | Trošak odmah u Financial Report; Payroll trošak ne sme ponovo kao dodatni | Implemented | cost_categories.payroll_linked odbija trošak rada; Financial Report odmah sa troškom; pgTAP 25 T14. | — |
| 8.2.1 | Centralna tabela Date, Project, Category, Subcategory, Description, Amount, Currency, Actions | Implemented | Centralna tabela troškova sa traženim kolonama (projectCosts.test.js T13). | — |
| 8.2.2 | Pretraga + filteri Project/Client/Category/Subcategory/Date, sort, izvoz Excel/CSV/PDF | Implemented | Filteri i izvoz Excel/CSV/PDF (projectCostsExport.js). | — |
| 8.2.3 | Zbir po filterima i analitika po kategorijama; valute ne mešati bez kursa | Implemented | Zbirovi po valuti, bez sabiranja bez kursa+datuma (T28). | — |
| 8.2.4 | Billable je samo oznaka; ne pravi prihod ni fakturu | Implemented | Billable samo oznaka; T15 u projectCosts/billingOverview i pgTAP 25/29. | — |
| 8.2.5 | Istorija izmena; trošak se ne pojavljuje dvaput | Implemented | Audit trigger na project_costs; jedan entitet za oba pogleda (T13). | — |

## §9 Client Billing Overview (bez faktura)

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 9.01 | B2B obračun = Approved × B2B × client coef, po klijentu/projektu/periodu, po radniku/ulozi, izvoz CSV/Excel/PDF | Implemented | billing_summary_lines (Approved × B2B × Client Coef) + billingExport.js; billingOverview.test.js. | — |
| 9.02 | Status obračuna In Preparation/Ready/Sent/Invoiced Externally sa ko/kada | Implemented | set_billing_status + billing_status_history (ko/kada); pgTAP 29. | — |
| 9.03 | Ručna evidencija eksternog računa (referenca, datum, iznos, valuta, dospeće) | Implemented | ext_invoice_* ručna evidencija bez stavki (migr. 09). | — |
| 9.04 | Client Payment: datum, iznos, valuta, referenca, veza; više delimičnih, korekcija sa tragom | Implemented | client_payments, više delimičnih, storno uz razlog; pgTAP 29 T16. | — |
| 9.05 | Outstanding / Unpaid / Partially Paid / Paid; Estimated Unpaid bez eksternog iznosa | Implemented | billing_balances: Outstanding / Estimated Unpaid; T16. | — |
| 9.06 | Billable Project Costs odvojeno, bez uvećanja prihoda | Implemented | billing_summary_costs odvojeno, ne menja calculated_amount (T15). | — |
| 9.07 | Van obuhvata: izdavanje/slanje/numeracija faktura, PDV, knjiženja | Implemented | „Teamora does not issue invoices“; nema sekvence/broja fakture (pgTAP 29 T29). | — |

## §10 Financial Reports

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 10.01 | Labor Revenue, Payroll Cost, Labor Margin, Net Project Profit, Profit Margin po formulama | Implemented | Payroll Reports: Labor Revenue, Payroll Cost, Labor Margin, Additional Costs, Net Project Profit, Profit Margin po valuti (projectReport.test.js). | — |
| 10.02 | Interni obračun odvojeno od eksterno fakturisanog, uplata i stvarnih isplata | Implemented | „Internal management calculation… not an official accounting balance“; odvojeno od fakturisanog/uplata/isplata (T17). | — |
| 10.03 | Filteri Project/Client/period/Employee/Role/Cost Category; izvoz PDF i CSV | Implemented | Filteri Period, Project, Client, Employee, Job role, Cost category + CSV/PDF. | — |
| 10.04 | Više valuta po valuti ili uz kurs i datum; originalni iznosi | Implemented | Po valuti + „Show in EUR“ uz kurs (currency.js, T28). | K3 rešen D30: iznosi po valuti; konverzija samo uz kurs i datum |
| 10.05 | Izveštaji i Dashboard isti obračunski servis; korekcije auditovane | Implemented | Isti servis (src/lib/finance kpis/summary) za Dashboard i Reports (T27). | — |

## §11 Staff Management i operativni moduli

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 11.01 | Jedinstven profil, kvalifikacije, direktno/vendor sa datumima i istorijom | Implemented | Profil + employment_history (direktno/vendor sa datumima); sertifikati/dokumenti kao kvalifikacije (replacements.js, onboarding). | — |
| 11.02 | Vendors: firme, radnici, ugovorni periodi, obaveze | Implemented | `supabase/migrations/20261125180000_ugovori_vendora.sql` (`vendor_contracts` sa periodom od/do, rokom plaćanja i valutom, bez preklapanja aktivnih ugovora istog vendora; pogled `vendor_worker_counts`); `src/lib/vendorOverview.js` + `vendorOverview.test.js`; `Vendors.jsx`, `VendorDetail.jsx`, `VendorContractDialog.jsx` (obaveze vendora iz `payables`); pgTAP 37 | Paralelni agent, 25.11.2026; vitest potvrđen, pgTAP 37 nije ponovo pokrenut u ovoj proveri. Postojeći ugovori se ne popunjavaju automatski (nema datuma u `contract_reference`) |
| 11.03 | Vendor ikonica handshake, ne kamion | Implemented | `navConfig.js`, `Vendors.jsx` — ikonica `Handshake` | — |
| 11.04 | Vendor ID automatski VEN-001… | Implemented | `20261124110000_vendor_id_automatski.sql`, `supabase/tests/12_vendor_id.test.sql` | — |
| 11.05 | CSV uvoz zaposlenih i vendora | Implemented | `src/lib/csvImport.js`, `csvEmployees.js` (`findDuplicates`, `planImport`), `vendorImport.js` + testovi, `ImportEmployeesDialog.jsx`, `ImportVendorsDialog.jsx`; D25 | Duplikati se otkrivaju pre uvoza; postupak u `docs/PLAN-MIGRACIJE.md` |
| 11.06 | Documents: radnik, tip, izdavanje/istek, fajl, status, prava pristupa | Implemented | document_types (osetljivost), issue_date, restricted, RLS + storage politika (migr. 06); pgTAP 26 T19. | — |
| 11.07 | Attendance/Schedule/Tasks/Leave/Notifications/Reports zadržati i povezati sa Workforce Plan | Implemented | Odsustva i raspored ulaze u Gantt (absence_kind, schedules.project_id); postojeće stranice rade. | — |
| 11.08 | Settings kao izvor: Positions, Cost Categories, multiplikatori, prava | Implemented | project_roles iz pozicija, cost_categories, hour_types, Users/Permissions (UsersSettings.jsx). | — |
| 11.09 | Ukloniti polja „Translation (Serbian)" | Implemented | `DepartmentsSettings.jsx` bez unosa prevoda (kolona `translation` ostaje u bazi, D24) | — |
| 11.10 | Jezik (EN/SK/RS) i valuta samo u Settings, samo admin | Implemented | `20261124140000_podesavanja_aplikacije.sql` (`app_settings`), `LanguageContext.jsx`, `AppSettingsContext.jsx`; pgTAP 12_podesavanja_aplikacije | — |
| 11.11 | Company Details: ZIP, samo Tax ID | Implemented | `20261124120000_adrese_firme_projekta.sql` (`pib` → `tax_id`, `zip`), `companyDetails.js` + test, pgTAP 07; D26 | — |
| 11.12 | Logo i ime Teamora | Implemented | `public/teamora-logo.png`, `teamora-mark.png`, `favicon.png`, `BrandLogo.jsx`, `index.html`; D23 | — |

## §12 Project Onboarding i ZIP

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 12.1.1 | Required Documents po projektu i po Job Role | Implemented | required_documents po projektu i Job Role (migr. 06). | — |
| 12.1.2 | Tip, obaveznost, period važenja, uloga/projekat, dozvola izvoza; bez ponovnog upload-a | Implemented | Tip, obaveznost, važenje, uloga, dozvola izvoza; reference na postojeće documents. | — |
| 12.1.3 | Provera postojanja, tipa i važenja za planirani period; ponovo posle izmene | Implemented | Status se računa iz manifesta pri svakoj promeni („re-checked on every change“). | — |
| 12.1.4 | Statusi Available/Missing/Expired/Expiring Soon/Not Permitted; Ready/Action Required | Implemented | onboarding.test.js T18 — Available/Missing/Expired/Expiring Soon/Not Permitted; Ready / Action Required. | — |
| 12.2.1 | Izbor radnika → automatski ZIP samo zahtevanih, postojećih, dozvoljenih | Implemented | prepare_onboarding_package + onboardingZip.js (JSZip) samo dozvoljeni dokumenti. | — |
| 12.2.2 | Preview pre preuzimanja | Implemented | Preview u kartici Onboarding pre preuzimanja. | — |
| 12.2.3 | Incomplete paket ne može Ready | Implemented | Incomplete paket ne može Ready (pgTAP 26). | — |
| 12.2.4 | Prava po ulozi i osobi, server-side kontrola download-a i sadržaja | Implemented | start_onboarding_download + storage politika documents.view_sensitive; pgTAP 26/20 T19. | — |
| 12.2.5 | Audit pripreme/preuzimanja paketa | Implemented | onboarding_packages / onboarding_package_downloads + audit. | — |

## §13 Workforce Planning

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 13.01 | Centralni pregled i kartica projekta nad istim Assignment/Schedule/Leave | Implemented | Centralni /workforce i kartica projekta nad istim workforce_coverage. | — |
| 13.02 | Gantt po projektu i Job Role; dan/nedelja/mesec; statusi Assigned…Replacement | Implemented | Gantt Day/Week/Month, grupisano projekat → Job Role → radnik; statusi Assigned, Available, Standby, Leave, Sick Leave, Other Absence, Replacement u workforce lib. | — |
| 13.03 | Required Workforce po projektu/ulozi/datumu/smeni, promenljiv | Implemented | Required workforce dugme + Requirements tab; pgTAP 27 T20. | — |
| 13.04 | Coverage = dostupni kvalifikovani − potrebni po datumu i smeni | Implemented | Coverage („−2 · 3/5“), Shortage 14, Projects with shortage 1; workforce.test.js. | — |
| 13.05 | Više projekata/smena bez preklapanja; konflikt vremena/odsustva/lokacije | Implemented | guard_schedule_overlap, worker_is_free; pgTAP 27; proba: stari preklopi u migration_report. | — |
| 13.06 | Klik na dan/smenu/deficit: ko pokriva, ko fali, zamene | Implemented | Coverage tab + klik na dan (workforceUi.test.js). | — |

## §14 Leave Requests i Smart Replacement

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 14.1.1 | Simulacija kapaciteta pri zahtevu za odmor | Implemented | decide_leave_request simulira workforce_coverage_all (migr. 160100) za sve projekte radnika. | — |
| 14.1.2 | Prikaz manjka: projekat, pozicija, dan/smena, potrebno, dostupno, deficit | Implemented | leave_shortage vraća projekat, ulogu, smenu, dan, potrebno/dostupno/deficit; pgTAP 33 T21. | — |
| 14.1.3 | Bez auto-odbijanja; menadžer odobrava uz razlog; ko/kada/zašto | Implemented | leave.approve_shortage + obavezan razlog + audit; pgTAP 30/33 T24. | — |
| 14.2.1 | Pretraga slobodnih i Standby, pa kvalifikovanih za premeštaj | Implemented | replacements.js: slobodni/Standby pa transfer; replacements.test.js T22. | — |
| 14.2.2 | Kriterijumi i redosled (uloga, raspoloživost, sertifikati, onboarding, lokacija, B2C) | Implemented | Redosled kriterijuma u replacements.js (test T22). | — |
| 14.2.3 | Full Match / Partial / Transfer Required / Not Eligible uz objašnjenje | Implemented | Full Match / Partial / Transfer Required / Not Eligible (replacements.test.js T22). | — |
| 14.2.4 | Upozorenje o manjku na izvornom projektu pri transferu | Implemented | assign_replacement traži p_ack_source_shortage; pgTAP 30/36 T23. | — |
| 14.2.5 | Assign Replacement = privremena dodela tek posle potvrde | Implemented | Privremena dodela assignment_type='replacement' tek posle potvrde (pgTAP 30). | — |
| 14.2.6 | Osvežavanje Gantt/Coverage/Onboarding/kalkulacija; istorija ostaje | Implemented | Invalidacija upita posle potvrde; istorija ostaje (dodele se ne završavaju). | — |

## §15 Obaveštenja, pristup, kvalitet

| ID | Zahtev | Status | Dokaz | Napomena |
|---|---|---|---|---|
| 15.01 | Notifications za odmor, deficit, zamenu, dokumente, istek dodele, timesheet, dospeće | Implemented | refresh_notifications (migr. 11, 160400) za sve tražene događaje; zvonce „10“. | — |
| 15.02 | Uloge najmanje Admin, Project Manager, HR, Finance; ograničenja po korisniku/projektu | Implemented | Uloge admin/project_manager/hr/finance + project_scope; operater@radnici.local je sada hr; proba: operater → hr. | — |
| 15.03 | B2C, isplate, lični dokumenti, ZIP — kontrola na serveru i u eksportu | Implemented | Column grant + view timesheet_money / employee_private_money / client_money maske; SQL: HR rates 0, PM b2c 0. | — |
| 15.04 | Audit trail (Assignment, Rate, Timesheet, Leave, Document, Billing, Client Payment, Payroll Payment, Cost, preuzimanja) | Implemented | audit_log trigeri na project_assignments, rates, timesheets, leave_requests, documents, billing_summaries, client_payments, payments, project_costs (+ onboarding preuzimanja); pgTAP 21. | — |
| 15.05 | Uvoz iz Base44 bez gubitka veza; duplikati pre migracije | Implemented | `docs/PLAN-MIGRACIJE.md` (redosled, mapiranje, duplikati, validacija, `migration_report`, kontrolni upiti, povratak); CSV uvoz sa proverom duplikata: `csvEmployees.js` `findDuplicates`, `vendorImport.js`, `csvEmployees.test.js`, `vendorImport.test.js` | D13/K7 rešeni D30. Samo zaposleni i vendori imaju CSV alat; ostali entiteti se unose u aplikaciji (plan, tačka 2) |
| 15.06 | Serverska validacija polja, iznosa, valuta, preklapanja, prava, statusa, integriteta | Implemented | Trigeri/constrainti po kategoriji (pgTAP 20–36, 925 testova zeleno). | — |
| 15.07 | Dosledni empty/loading/error/permission-denied; svetla tema sa ljubičastim akcentima | Implemented | PermissionDenied (App.jsx:54, data-testid permission-denied); prazna stanja; Teamora tokeni. | — |

## §17 Test scenariji T01–T29

| ID | Test | Status | Dokaz / šta fali |
|---|---|---|---|
| T01 | Dva Assignment reda, Active Workers jednom | Implemented | assignments.test.js, dashboard.test.js, pgTAP 22 — zeleni; ekran Active Workers „counted once“. |
| T02 | Isti obuhvat filtera za tabelu, KPI, grafike, CSV, PDF | Implemented | assignments.test.js T02. |
| T03 | Donut = 100%, klik filtrira | Implemented | assignments.test.js T03; donut 100.0%. |
| T04 | Assignments by Project i Quick Insights vode na filtrirane liste | Implemented | `src/lib/assignments.test.js` — tri testa „T04 …“ (Assignments by Project klik na traku, Quick Insights status/Ending Soon, Workers Available/Shortages vode na filtriranu listu); `QuickInsights.jsx`, `ProjectAssignmentsPage.jsx` — Test dodat 25.11.2026; vitest zelen |
| T05 | Workers Available po slobodnoj smeni | Implemented | workforce.test.js, workforceUi.test.js, pgTAP 27. |
| T06 | A1 bez obmanjujućih akcija; A2 Add/Edit/Reassign | Implemented | pgTAP 22 (T06 baza); dugmad Add Assignment / View / Edit / More actions otvaraju stvarne dijaloge. |
| T07 | Tarifa od 15.: sati pre/posle po svojoj tarifi; zaključen obračun isti | Implemented | timesheetDays.test.js, rateHistory.test.js, pgTAP 23/24/34. |
| T08 | R/OT/W/H sa worker/client koeficijentima — dva tačna iznosa | Implemented | `src/lib/payroll/payroll.test.js` „T08 Regular/Overtime/Weekend/Holiday sa različitim worker/client koeficijentima daju dva tačna iznosa“; pgTAP 03 (R/OT/W) i 14 (Holiday) sa oznakom T08 — Naziv dodat 25.11.2026; vitest zelen |
| T09 | Rejected/Submitted ne ulaze, Approved ulazi | Implemented | laborLines, timesheetDays, projectReport testovi + pgTAP 24. |
| T10 | Dva projekta isti dan bez preklapanja; preklapanje odbijeno | Implemented | timesheetDays.test.js + pgTAP 24. |
| T11 | Delimične isplate smanjuju Remaining | Implemented | payables.test.js, payablesDue, payablesList + pgTAP 28. |
| T12 | Vendor radnik: pojedinačan obračun, primalac Vendor | Implemented | payablesList.test.js + pgTAP 28. |
| T13 | Trošak iz Project → Costs postoji jednom u centralnom pregledu | Implemented | projectCosts.test.js + pgTAP 25. |
| T14 | Cost sa kategorijom i radnikom ulazi jednom u profit | Implemented | projectCosts.test.js, projectReport.test.js + pgTAP 25. |
| T15 | Billable Cost kao kandidat, bez fakture/prihoda | Implemented | projectCosts, billingOverview + pgTAP 25/29. |
| T16 | Eksterni račun + dve delimične uplate → Outstanding, Partially Paid | Implemented | billingOverview, finance/billing + pgTAP 29. |
| T17 | Dashboard ne meša obračun/fakturisano/uplaćeno, trošak/isplaćeno, profit/novac | Implemented | projectReport, dashboard, finance/kpis testovi. |
| T18 | Welder mora sertifikat koji Fitter ne mora | Implemented | onboarding.test.js + pgTAP 26. |
| T19 | ZIP preview; bez prava nema preuzimanja ni direktnim pozivom | Implemented | pgTAP 26 i 20 (direktan poziv bez prava odbijen). |
| T20 | Required Workforce po datumu/smeni; Gantt i deficit prate | Implemented | workforce, workforceUi + pgTAP 27. |
| T21 | Odsustvo pokazuje tačan manjak po ulozi/smeni | Implemented | workforce, replacements + pgTAP 27/30/33. |
| T22 | Predlog slobodnog kvalifikovanog; Partial Match | Implemented | workforceUi, replacements testovi. |
| T23 | Transfer pokazuje posledicu po izvorni projekat | Implemented | migracija 20261125170000 (assign_replacement meri manjak na SVIM projektima radnika, replacement_source_impact za pregled pre potvrde); replacements.test.js 18/18; pgTAP 30 + 36 PASS (PM bez pristupa izvornom projektu: bez potvrde odbijeno sa brojem koji nedostaje, uz potvrdu prolazi + audit). |
| T24 | Odmor uprkos deficitu samo menadžer sa pravom, uz razlog i audit | Implemented | pgTAP 20/30/33. |
| T25 | Preimenovanje projekta/klijenta ne prekida relacije | Implemented | projectReport.test.js + pgTAP 21/22. |
| T26 | Bez finansijskog prava nema B2C isplata ni u CSV/PDF | Implemented | assignments, payablesList, projectReport + pgTAP 02/03/11/14/20/21/24/28; SQL HR provera. |
| T27 | Dashboard metrike = izvorni moduli za isti period | Implemented | dashboard.test.js, assignments.test.js. |
| T28 | Nijedan agregat ne sabira EUR i drugu valutu bez kursa i datuma | Implemented | projectCosts, finance/currency, projectReport + pgTAP 25. |
| T29 | Billing bez kreiranja/PDF/slanja/numeracije faktura; izvoz, status, uplate rade | Implemented | pgTAP 29 (nema sekvence/broja/slanja fakture). |

---


---

## Konflikti sa postojećim odlukama — svi rešeni D30 (24.11.2026)

Luka je odlučio: „gledaj samo dokument, on je najnoviji izvor informacije" (`DECISIONS.md` D30). Spec v1.4 ima prednost; ranije odluke važe samo za ono što spec ne pokriva. Nijedan konflikt nije otvoren.

| # | Odluka | Kako je rešeno | Dokaz |
|---|---|---|---|
| K1 | D3 + D16 — ko odobrava satnice | Pravo `timesheets.approve` umesto `is_admin()`; vraćanje odobrene satnice samo `reopen_timesheet` uz `timesheets.correct` | migr. 04 (`guard_timesheet` v4), migr. 01 (katalog prava); pgTAP 20, 24 |
| K2 | D3 + D14 — uloge | Admin, Project Manager, HR, Finance + ograničenje po projektu (`user_project_access`, `can_see_project`); `operater` → `hr`; RLS i izvoz po pravima | migr. 01, 02; `src/lib/permissions.js`, `access.js`; pgTAP 20 (matrica uloga × resurs), 08, 11; `permissions.test.js` |
| K3 | D2 — sve u EUR | Iznosi nose valutu (EUR, RSD, GBP, USD); agregati po valuti, konverzija samo uz kurs i datum (`convertTotals`); nedostajući kurs je vidljiv | `src/lib/finance/currency.js` + test; migr. 03, 05 (`fx_rate_date`); T28 u pgTAP 25, `currency.test.js`, `kpis.test.js` |
| K4 | D7 + D8 + D17 + D20 — Payroll po srpskim propisima | Payroll Cost = Approved × B2C × worker coef; Net Profit = Labor Revenue − Payroll Cost − Additional Costs. Payables + Payments + Remaining Balance. Srpski mesečni obračun (neto/bruto) ostaje, ali nije izvor troška projekta | `src/lib/finance/kpis.js`, `summary.js`; migr. 08; pgTAP 28 (T11, T12); `payroll.test.js`, `serbianPayroll.js` ostaju |
| K5 | D4 + D17 — satnica iz profila | Tarife samo u `rates` (Rate History, Effective From/To, valuta); baza odbija preklapanje (`rates_no_overlap`); izmena samo kroz `change_rate`; tarife iz JSON-a i profila prenete; forma radnika bez satnica | migr. 03; pgTAP 23; `rateHistory.test.js`; `EmployeeFormFields.jsx` |
| K6 | D5 + D16 — vrsta sata | Najviši konfigurisani koeficijent, bez sabiranja (D29) | migr. `20261124150000`, `hours.js`, pgTAP 14 |
| K7 | D13 — bez prenosa iz Base44 | Plan migracije napisan; uvoz kroz CSV sa proverom duplikata; interna migracija modela (`assigned_employees` → `project_assignments`, `operater` → HR) u migracijama `20261125*` | `docs/PLAN-MIGRACIJE.md`; `csvEmployees.js`, `vendorImport.js`; migr. 01, 03 |
| K8 | D9 — samo po satu | Nema konflikta; potvrđeno | — |
| K9 | D12 — isti ekrani | Teamora redizajn (D23) | `Dashboard.jsx`, `navConfig.js`, `index.css` |
| K10 | D18 — PIB 9 cifara | Samo Tax ID + ZIP (D26) | `companyDetails.js`, pgTAP 07 |
| K11 | D10 — vraćanje u nacrt | Korekcija uz obavezan razlog, ovlašćenje `timesheets.correct`, audit `correction` i preračun | migr. 04 `reopen_timesheet`; pgTAP 24; audit pgTAP 21 |
| K12 | D16 — tarifa po nedelji | Tarifa po datumu rada (`resolve_rate` po danu, dnevne linije); nedelja preko promene deli iznos po danu (T07) | migr. 03, 04; `timesheetDays.test.js`, `rateHistory.test.js`, pgTAP 23, 24 |

Dodatno (D30): jedna evidencija angažovanja (`project_assignments`; JSON `projects.assigned_employees` je keš bez tarifa, direktan upis odbijen `guard_project_cache`); audit trail nad 9 tabela + preuzimanja paketa (migr. 01, pgTAP 21).

## Plan migracije i relacija (§18)

Ceo postupak je u `docs/PLAN-MIGRACIJE.md`: CSV uvoz (zaposleni, vendori), mapiranje po ID-u, redosled, provera duplikata, ponašanje migracija `20261125*` na produkcijskoj bazi (backfill, `migration_report`), kontrolni upiti i povratak.

## Otvoreno posle ove provere

- Nijedan red matrice nije otvoren. Preostaje samo proces: `QA-FINDINGS.md` još nema sekciju sa statusom svakog T-a (BACKLOG „Završni QA“), a pre push-a na produkciju treba pokrenuti dva upita iz P7-N5 (odobrene satnice bez `rate_snapshot`; troškovi van EUR) — vidi `docs/PLAN-MIGRACIJE.md` §6.1.
- 11.02, T04 i T08 su zatvorili paralelni agenti tokom ove provere; vitest je potvrđen, pgTAP 37 (vendor_contracts) i pun `npm run build && npm test && npm run test:db` treba pokrenuti pre commita.
- Otvoreno van matrice: ekran za `migration_report` ne postoji (pregled je SQL upit, `docs/PLAN-MIGRACIJE.md` §6.3).
