# PHASE 7 — QA checklist (Teamora spec v1.4, D30)

Izvor istine: `spec.txt` (Master Development Specification v1.4 FINAL) + `DECISIONS.md` D30. Obuhvat: svaki zahtev §1–§18 koji u `IMPLEMENTATION-MATRIX.md` (stanje 24.11.2026) nije „Implemented", svih 29 test scenarija T01–T29 i isporuke §18.
Pravilo provere: `- [x]` samo uz dokaz (fajl:linija, ime testa, izlaz upita, screenshot). Ne-urađeno ostaje `- [ ]` sa razlogom. ID u zagradi = red matrice.
Uloge za proveru prava (D30 K1/K2): **Admin**, **Project Manager (PM)**, **HR** (bivši operater), **Finance**. Provera „kao druga uloga" = SQL u transakciji sa `set local role authenticated` + `request.jwt.claims` tog korisnika + `rollback`, i/ili pgTAP test, i/ili pregledač (tab „seed") kad Luka dozvoli prijavu.
Imenovanje testova (BRIEF-P7): vitest `it("T07 …")`, pgTAP `-- T07 …` / opis `'T07 …'`. Gde piše „test T0x", traži se baš taj naziv.

---

## §1 Potvrđene odluke vlasnika proizvoda

- [x] 1.01 Primalac plaćanja razlikuje direktnog radnika i radnika podizvođača (Vendor) na nivou angažovanja.
  ✔ Dokaz: project_assignments.payee/vendor iz angažmana (fill_assignment_engagement, migr. 03); pgTAP 28 T12 i payablesList.test.js T12.
  Provera: `project_assignments.vendor_id` (ili `payee_type`) popunjen za vendor angažman; upit `select payee_type, vendor_id from payables …` za vendor radnika vraća Vendor; test T12.
- [x] 1.03 Payroll = obaveza + stvarne isplate (delimične, datumi, preostalo) — vidi §7.
  ✔ Dokaz: tabele payables/payable_lines/payments (migr. 08); pgTAP 28 T11; ekran Payables & Payments.
  Provera: tabele `payables` i `payments` postoje (`\d`), test T11 zelen.
- [x] 1.04 Isti radnik na više projekata istog dana bez preklapanja stvarnog rada — vidi §6.03.
  ✔ Dokaz: timesheet_entries + guard preklapanja (migr. 04); pgTAP 24 T10, timesheetDays.test.js T10.
  Provera: test T10 (vitest + pgTAP).
- [x] 1.05 Onboarding ZIP sa pravima — vidi §12. Provera: T18, T19.
  ✔ Dokaz: migr. 06 onboarding + onboardingZip.js; pgTAP 26 T18/T19.
- [x] 1.06 Odmori: manjak, zamene, odobrenje uz obrazloženje — vidi §14. Provera: T21–T24.
  ✔ Dokaz: decide_leave_request + assign_replacement (migr. 10, 160100, 170000); pgTAP 30/33/36 T21–T24.
- [x] 1.07 Promena B2B/B2C važi od izabranog datuma; zaključeni obračuni ostaju isti. Provera: T07.
  ✔ Dokaz: change_rate/guard_rate_history (migr. 03), tarifa po danu (04); pgTAP 23/24 T07.
- [x] 1.09 Potrebe po projektu, Job Role, datumu i smeni — vidi §13.03. Provera: T20.
  ✔ Dokaz: workforce_requirements (migr. 07); pgTAP 27 T20; ekran Workforce Planning → Requirements.
- [x] 1.10 Interni B2B obračun + ručno praćenje uplata, bez izdavanja faktura — vidi §9. Provera: T16, T29.
  ✔ Dokaz: billing_summaries/client_payments (migr. 09); pgTAP 29 T16/T29; ekran Clients / Billing Overview.

## §2 Navigacija, ekran projekta, jedan izvor istine

- [x] 2.1.3 Sekcija Projects: Project Overview, Project Costs, **Project Assignments**, **Workforce Planning**.
  ✔ Dokaz: Meni Projects: Project Overview, Project Costs, Project Assignments (/assignments), Workforce Planning (/workforce) — videno u pregledaču.
  Provera: `navConfig.js` redosled i nazivi (EN/RS/SK); klik na obe nove stavke otvara stranicu bez greške; „Rates & Assignments" više ne postoji u meniju.
- [x] 2.1.4 Payroll: „Clients" postaje **Clients / Billing Overview** (§9).
  ✔ Dokaz: Meni Payroll: Payroll Dashboard, Timesheets, Timesheet Overview, Monthly Payroll, Payables & Payments, Clients / Billing Overview, Payroll Reports.
  Provera: naziv u meniju i naslov stranice; stranica prikazuje B2B obračun, status, uplate (ne samo zbir sati).
- [x] 2.1.5 Reports: centralni, kontrolisani izveštaji sa izvozom i proverom prava.
  ✔ Dokaz: Reports stranica: „Reports & exports“ sa Payroll Reports, Project Costs, Billing, Payables, Timesheet Overview, Project Assignments (izvozi CSV/XLSX/PDF); HR bez prava: canAccessPath + PermissionDenied (App.jsx:54).
  Provera: Reports stranica ima finansijske izveštaje (§10) sa CSV/PDF izvozom; HR ne vidi finansijske izveštaje ni u UI ni direktnim upitom.
- [x] 2.2.1 Projekat ima kartice **Overview | Workers | Onboarding | Costs | Workforce Plan | Financial Report** (tim redom).
  ✔ Dokaz: ProjectDetail: Overview | Workers | Onboarding | Costs | Workforce Plan | Financial Report — svih 6 kartica otvoreno u pregledaču.
  Provera: `ProjectDetail.jsx`; screenshot sa svih 6 kartica; svaka se otvara bez greške.
- [x] 2.2.3 Workers kartica: radnici/vendor radnici, uloga, B2C, B2B, datumi, status angažovanja — iz `project_assignments` (ne iz JSON-a).
  ✔ Dokaz: Workers kartica: radnici, Job Role, period, B2C/B2B, status (QA-Radnik-1…4); izvor project_assignments (JSON je izvedeni keš, guard_project_cache odbija direktan upis).
  Provera: `grep -rn assigned_employees src` ne vraća čitanje kao izvor; dodela kreirana na Project Assignments odmah se vidi na Workers kartici i obrnuto.
- [x] 2.2.4 Onboarding kartica (§12). Provera: kartica prikazuje zahteve, status po radniku i dugme Prepare Onboarding Package.
  ✔ Dokaz: Onboarding kartica: zahtevi, Worker readiness, Prepare package (pregledač).
- [x] 2.2.5 Costs kartica sa automatski izabranim projektom (§8.1.1). Provera: Add Cost iz projekta ima zaključan projekat; isti red se vidi na /project-costs (T13).
  ✔ Dokaz: Costs kartica sa troškom projekta (QA-trosak-100EUR), projekat automatski; pgTAP 25 T13.
- [x] 2.2.6 Workforce Plan kartica (§13). Provera: Gantt filtriran na projekat, isti podaci kao centralni Workforce Planning.
  ✔ Dokaz: Workforce Plan kartica: Gantt filtriran na projekat, isti brojevi kao centralni (−2 · 3/5).
- [x] 2.2.7 Financial Report kartica: odobreni rad, prihod, payroll cost, dodatni troškovi, rezultat, interni obračuni, evidentirane uplate, otvorena potraživanja.
  ✔ Dokaz: Financial Report kartica: Labor Revenue 2,040, Payroll Cost 1,224, Additional Costs 100, Net Profit 716, margin 35.10%, „Timesheets not included“ lista.
  Provera: screenshot sa svim stavkama; brojevi = `src/lib/payroll` funkcije (test T17/T27).
- [x] 2.3.2 Jedna logička evidencija za Assignment, Rate History, Timesheet, Project Cost, Document, Leave, Workforce Requirement, Billing Summary, Client Payment, Payable, Payment.
  ✔ Dokaz: docs/TEAMORA-DATA-MODEL.md §2.4–2.13 po jedna tabela; proba migracija: JSON dodele prebačene u project_assignments (legacy_source), backup JSON-a u migration_report, keš bez tarifa.
  Provera: `docs/TEAMORA-DATA-MODEL.md` navodi po jednu tabelu za svaki entitet; `projects.assigned_employees` migriran u `project_assignments` (upit: broj JSON elemenata = broj migriranih redova, bez duplikata) i više se ne piše (trigger ili uklonjen iz UI); tarife samo u `rates`.
- [x] 2.3.3 Centralne stranice i kartice projekta čitaju/menjaju iste zapise.
  ✔ Dokaz: UI piše kroz RPC nad project_assignments; „The assignment appears at once on the project's Workers tab, in Project Assignments and in planning“; pgTAP 22.
  Provera: izmena dodele na kartici Workers → isti `id` izmenjen u `project_assignments` i vidljiv na Project Assignments; isto za troškove (T13).
- [x] 2.3.4 Audit trail za izmene i potvrđene finansijske podatke — vidi 15.04.
  ✔ Dokaz: Vidi 15.04 — audit_log sa triggerima na 18 tabela.

## §3 Main Dashboard

- [x] 3.1.1 Globalni filteri: period (podrazumevano tekući mesec), Project, Client, **Status**; primenjuju se zajednički na KPI i grafike.
  ✔ Dokaz: Dashboard: period, All clients, All projects, All statuses (Dashboard.jsx:278); filterTimesheets test.
  Provera: `Dashboard.jsx` ima i Status filter; promena svakog filtera menja KPI i grafikon; test filtera u `payroll.test.js` (`filterTimesheets`) pokriva Status.
- [x] 3.1.2 Klik na KPI **ili upozorenje** vodi na izvornu listu sa primenjenim filterom (period/projekat/klijent u URL-u).
  ✔ Dokaz: KpiCard `to` = finLink/listUrl sa parametrima perioda i filtera (Dashboard.jsx:404–415).
  Provera: klik na KPI otvara listu sa istim periodom i filterima (URL query), ne samo stranicu.
- [x] 3.1.3 Korisnik vidi samo dozvoljene projekte/radnike/iznose; HR operativni prikaz bez stopa i finansija.
  ✔ Dokaz: SQL kao hr@radnici.local: rates 0, payables 0, payments 0, project_costs 0, timesheet_money.worker_cost 0 ne-null; pm: b2c 0; pgTAP 20 T26.
  Provera: kao HR — dashboard bez iznosa, upit na `timesheets.worker_cost/b2c_rate` vraća NULL/odbijeno; kao PM ograničen na projekat — vidi samo svoje projekte.
- [x] 3.2.1 KPI **Active Workers** = jedinstveni radnici sa aktivnim Assignment u periodu.
  ✔ Dokaz: Dashboard „Active Workers 4 — Unique workers with an assignment in the period“; dashboard.test.js T01.
  Provera: test T01; dashboard prikazuje broj iz `project_assignments`, ne iz `employees.status`.
- [x] 3.2.2 KPI **Active Projects** (status Active i/ili aktivno angažovanje u periodu; obuhvat jasno označen).
  ✔ Dokaz: „Active Projects 3 — 3 with status Active · 2 with assignments in the period“.
  Provera: kartica sa tooltipom obuhvata; vitest za funkciju brojanja.
- [x] 3.2.3 KPI **Approved Hours** (samo odobreni sati u periodu).
  ✔ Dokaz: „Approved Hours 105h — +21h awaiting approval (estimate, not included)“.
  Provera: kartica postoji; zbir = `select sum(total_hours) from timesheets where approval_status='approved' and …` za isti period.
- [x] 3.2.6 KPI **Additional Project Costs** po valuti ili uz eksplicitan kurs.
  ✔ Dokaz: „Additional Project Costs €100“; currency.test.js T28 (bez kursa+datuma ne ulazi u EUR).
  Provera: kartica prikazuje troškove; kad postoje troškovi u RSD i EUR, prikaz po valuti ili uz kurs+datum (T28).
- [x] 3.2.7 KPI **Project Profit** = prihod − trošak rada − dodatni troškovi (spec §10), označen kao obračunski (nije stanje na računu).
  ✔ Dokaz: „Project Profit −€100“ = prihod − trošak − dodatni (kpis.test.js); vidi P7-N5 za satnice bez snimka.
  Provera: vitest za formulu; vrednost na dashboardu = Net Project Profit iz Financial Reports za isti period (T27).
- [x] 3.2.8 Odvojene kartice **Client Unpaid** i **Payables** (neplaćeno klijentsko / neisplaćene obaveze); nepodneti obračuni zasebno.
  ✔ Dokaz: Odvojene kartice Payables €556 i Client Unpaid (+ Unbilled Revenue).
  Provera: dve kartice; brojevi = §9 Outstanding/Estimated Unpaid i §7 Remaining; T17.
- [x] 3.3.1 Financial Overview po mesecima/projektima bez mešanja valuta (T28).
  ✔ Dokaz: Revenue, Costs & Profit + Profitability Overview po valuti (kpis/currency).
- [x] 3.3.2 **Workforce Overview**: aktivni, raspoloživi, raspodela po projektima i pozicijama.
  ✔ Dokaz: Workforce Overview: Active Workers 4, Available today 2 of 5, By project, By position.
  Provera: panel na dashboardu; brojevi iz Assignment/Schedule/Leave.
- [x] 3.3.3 **Action Center**: odmori na čekanju, Workforce Shortages, dodele pred istekom, dokumenti koji fale/ističu, pending timesheets, neplaćene obaveze, dospela potraživanja (ako postoji rok).
  ✔ Dokaz: Action Center: Workforce shortages (16 worker-shifts), Pending Timesheets 3, Unpaid payables 1 — linkovi.
  Provera: svaka stavka ima broj i link na filtriranu listu; prazno stanje kad nema ničeg.
- [x] 3.3.4 **Quick Links**: New Assignment, Add Project Cost, Review Timesheets, Prepare Onboarding ZIP, Open Workforce Plan — samo korisnicima sa pravima.
  ✔ Dokaz: Quick Links sa `ok: can(…)` + canAccessPath (Dashboard.jsx:452–457).
  Provera: kao Admin svih 5; kao HR bez Add Project Cost (ili po matrici prava); linkovi rade.
- [x] 3.3.5 Loading / empty / error stanja jasna; KPI bez podataka = 0 ili neutralno.
  ✔ Dokaz: Prazna stanja („No approved hours in this period“, „No revenue in this period“), upozorenje o satnicama sa problemom.
  Provera: prazan period → €0/0/„—"; simulirana greška upita → poruka, ne bela strana.

## §4 Project Assignments (A1 → A2)

- [x] 4.0 Preimenovanje „Rates & Assignments" → „Project Assignments" (meni, naslov, prevodi EN/RS/SK); tarife ostaju dostupne.
  ✔ Dokaz: Meni i naslov „Project Assignments“, ruta /assignments; migr. 160300 menja naziv i u poruci baze.
  Provera: grep „Rates & Assignments" u UI = 0; ruta radi; stari `/rates` preusmeren.
- [x] 4.1.1 Centralna tabela: red = jedan Assignment; radnik na više projekata = više redova, jedan profil.
  ✔ Dokaz: Tabela Assignments (5), red = angažman (assignments.test.js T01).
  Provera: radnik sa 2 dodele → 2 reda, isti `employee_id` link na isti profil.
- [x] 4.1.2 Kolone Employee (+ID), Project, Client, Job Role, B2C Rate, B2B Rate (+valuta), Start, End, Status, Actions.
  ✔ Dokaz: Kolone Employee (+EMP-ID), Project (+Client), Job Role, B2C Rate, B2B Rate, Start, End, Status, Actions.
  Provera: zaglavlje tabele (screenshot); B2C kolona skrivena/prazna za HR.
- [x] 4.1.3 Pretraga (employee, project, role) + kombinovani filteri Project/Client/Job Role/Status/Date Range, sortiranje kolona, paginacija i izbor broja redova.
  ✔ Dokaz: Filteri Project/Client/Job Role/Status/Date Range + pretraga; assignments.test.js T02.
  Provera: kombinacija filtera daje isti skup kao SQL upit; sortiranje po svakoj koloni; 10/25/50 redova.
- [x] 4.1.4 Brzi režimi **Active** (Active + Ending Soon) i **All Assignments** (svi statusi uz ostale filtere).
  ✔ Dokaz: Prekidači Active / All Assignments na stranici.
  Provera: brojevi redova u oba režima = vitest funkcije režima.
- [x] 4.1.5 View otvara detalje angažovanja; nijedno dugme ne obećava lažnu funkciju (T06).
  ✔ Dokaz: Akcije reda: View assignment, Edit assignment, More actions — sve otvaraju stvarne dijaloge.
- [x] 4.1.6 Export CSV/Excel i Generate PDF Report: poštuju filtere, sortiranje i prava; ceo skup, ne samo stranica.
  ✔ Dokaz: Export (CSV/XLSX) i Generate Report (PDF) nad filtriranim skupom; assignments.test.js T02/T26.
  Provera: izvoz sa 30 redova i stranicom 10 → fajl ima 30 redova istim redosledom; kao HR izvoz bez B2C kolone (T26); T02.
- [x] 4.2.1 Kartica **Total Assignments** = broj jedinstvenih Assignment zapisa u filtriranom obuhvatu.
  ✔ Dokaz: Total Assignments 5 — Across 2 projects.
- [x] 4.2.2 Kartica **Active Workers** = jedinstveni radnici (T01).
  ✔ Dokaz: Active Workers 4 — „counted once“ (T01).
- [x] 4.2.3 Kartica **Active Projects** = različiti projekti sa aktivnim radnikom.
  ✔ Dokaz: Active Projects 2 — With workforce assigned.
- [x] 4.2.4 Kartica **Expiring This Month** = End Date u tekućem kalendarskom mesecu, nije završeno; period jasno prikazan.
  ✔ Dokaz: Expiring This Month 0 — Assignments end by Nov 30.
  Provera 4.2.x: vitest za svaku formulu sa graničnim datumima (kraj meseca, već završen); kartice prate filtere (T02).
- [x] 4.3.1 Donut **Assignments by Status** (Active/Upcoming/Ending Soon/Completed, broj i %), klik na segment postavlja filter (T03).
  ✔ Dokaz: Assignments by Status: Active 5 (100.0%), Upcoming/Ending soon/Completed 0 (0.0%); assignments.test.js T03.
- [x] 4.3.2 Bar **Assignments by Project**; View all otvara filtriranu listu, klik na projekat otvara njegove dodele (T04).
  ✔ Dokaz: Assignments by Project: QA-Projekat-1 4, QA-Projekat-2b 1 (vidi T04 za test).
- [x] 4.3.3 **Workers Available for Reassignment**: jedinstveni odgovarajući radnici slobodni za izabrani dan/smenu; klik otvara Workforce Planning (T05).
  ✔ Dokaz: Workers Available for Reassignment 2 — „Free on Nov 24 · whole …“; workforce.test.js T05, pgTAP 27.
- [x] 4.3.4 **Assignments Ending Soon** = budući istek u narednih 30 dana, različito od Expiring This Month; klik otvara filtriranu listu.
  ✔ Dokaz: Kartica Ending Soon odvojena od Expiring This Month (assignmentStatus ≤30 dana, assignments.test.js).
- [x] 4.3.5 **Workforce Shortages**: broj projekata sa deficitom po ulozi i smeni u periodu; klik vodi u Workforce Planning.
  ✔ Dokaz: Workforce Shortages kartica / Action Center 16 worker-shifts; workforce_coverage.
- [x] 4.3.6 Sve kartice, grafici i tabela koriste isti skup filtera, isti referentni datum i ista prava (T02).
  ✔ Dokaz: Jedan izvor skupa u src/lib/assignments.js za tabelu, KPI, grafike i izvoz (T02).
  Provera: jedna funkcija izvodi skup (`src/lib/…`) koju koriste tabela, KPI, grafici i izvoz — grep pokazuje zajednički izvor.
- [x] 4.4.1 Statusi Completed / Upcoming / Ending Soon (≤30 dana) / Active izvedeni iz datuma, međusobno isključivi.
  ✔ Dokaz: assignmentStatus izveden iz datuma, isključivi statusi (assignments.test.js T03).
  Provera: vitest `assignmentStatus` sa granicama (danas = start, danas = end, end za 30 i 31 dan).
- [x] 4.4.2 Status po datumu i vremenskoj zoni projekta; oznaka perioda/ref. datuma na ekranu.
  ✔ Dokaz: todayInZone(timeZone) (assignments.js:43) + „Status as of Nov 24, 2026 in each project's time zone“.
  Provera: projekat ima `timezone`; test sa projektom u drugoj zoni oko ponoći; ekran prikazuje „as of {datum}".
- [x] 4.5.1 A2 **Add Assignment**: Employee, Project, Job Role, datumi, B2C, opciona posebna B2B tarifa.
  ✔ Dokaz: Add assignment dijalog (Employee, Project, Job role, Planned shift, Start/End, tarife); create_assignment RPC; pgTAP 22.
  Provera: dodela kreirana iz dijaloga → red u `project_assignments` + tarife u `rates` sa effective_from; pojavljuje se u Workers, Timesheets, Workforce (4.5.5).
- [x] 4.5.2 **Reassign**: Transfer zatvara staru i pravi novu dodelu; Additional pravi dodatnu bez ukidanja; istorijski sati ostaju.
  ✔ Dokaz: transfer_assignment / additional_assignment RPC (migr. 03); pgTAP 22 (istorija sati ostaje).
  Provera: pgTAP/vitest: posle Transfer stara ima `end_date`, nova počinje sledeći dan; satnice stare dodele nepromenjene (broj i iznosi).
- [x] 4.5.3 **Edit**: uloga, datumi, buduće tarife sa efektivnim datumom i revizijskim tragom.
  ✔ Dokaz: update_assignment_with_rates atomarno (migr. 160200); pgTAP 34 T07 + audit.
  Provera: izmena tarife od datuma X ne menja redove pre X; audit red u `audit_log`.
- [x] 4.5.4 **End Assignment** od zadatog datuma; Timesheets, obračuni i izvodi ostaju.
  ✔ Dokaz: end_assignment RPC; pgTAP 22 (End/Cancel, T06 baza).
- [x] 4.5.5 Izmena se odražava u Overview/Workers, Workforce Planning i izveštajima; konflikt istih radnih intervala sprečen.
  ✔ Dokaz: guard_assignment_overlap; pgTAP 22; dodela vidljiva na Workers/Workforce.
  Provera: pgTAP — dve dodele istog radnika sa preklapajućim intervalom iste smene → greška; bez preklapanja → OK.

## §5 Satnice, istorija, koeficijenti

- [x] 5.02 Obe tarife (B2B i B2C) imaju Effective From, opciono Effective To, iznos, valutu i istoriju izmena; izmena ne prepisuje stari iznos.
  ✔ Dokaz: rates: effective_from/to, valuta, superseded_by, change_reason; change_rate zatvara stari red; pgTAP 23; rateHistory.test.js T07.
  Provera: „Promeni od datuma" zatvara stari red (`effective_to`) i pravi novi; `audit_log` red; upit istorije za tarifu vraća oba reda.
- [x] 5.03 Jednoznačna tarifa na datum rada; preklapajući/kontradiktorni zapisi odbijeni u bazi; nedostajuća tarifa = vidljiva greška pre finalnog obračuna.
  ✔ Dokaz: exclusion rates_no_overlap + timesheet_rate_problem (vidljiva greška); proba: preklapanje 41/43 normalizovano bez promene izbora.
  Provera: pgTAP — insert preklapajućeg reda istog nivoa → exception (exclusion constraint/trigger); satnica bez tarife → prikazana greška, ne može u finalni obračun.
- [x] 5.04 B2B polazi od Job Role, izuzetak po angažovanju; B2C vezan za radnika/angažovanje i projekat; profil radnika nije izvor tarife (D30 K5).
  ✔ Dokaz: resolve_rate assignment → role → project → employee; profil više nije nivo (D30 K5); pgTAP 23.
  Provera: `rateEngine`/`resolve_timesheet_rate` ne čita profil; vitest/pgTAP za redosled: izuzetak po angažovanju > Job Role.
- [x] 5.08 Primer: 8 h × B2C 45 × 1.0 = 360 EUR trošak; 8 × B2B 50 × 1.0 = 400 EUR prihod (Payroll Cost po spec-u, D30 K4).
  ✔ Dokaz: kpis/laborLines testovi (8×45=360, 8×50=400) — Payroll Cost = sati × B2C × koef.
  Provera: vitest `it("§5 primer 8×45=360, 8×50=400")` i isti brojevi na Financial Report i Dashboard za taj slučaj.

## §6 Timesheets

- [x] 6.01 Zapis ima Employee, Project, **Assignment**, datum, planiranu/realnu smenu ili vreme od-do, broj sati, vrstu rada, status, odobrio.
  ✔ Dokaz: timesheets.assignment_id, timesheet_entries (početak/kraj/smena/pauza), submitted_by/rejected_by (migr. 04).
  Provera: `\d timesheets` (ili nova tabela unosa) — `assignment_id` NOT NULL za nove, polja za vreme/smenu; UI unos ih prikazuje.
- [x] 6.02 Statusi Draft → Submitted → Approved/Rejected; odobravaju samo korisnici sa pravom odobravanja (D30 K1), ne samo admin.
  ✔ Dokaz: guard_timesheet v4: timesheets.edit/approve; pgTAP 24 (HR/PM po pravu).
  Provera: pgTAP — PM sa pravom odobri; HR bez prava → 42501; prelaz Draft→Approved bez Submitted odbijen (ako spec tok to zahteva).
- [x] 6.03 Bez preklapajućih intervala i neprihvatljivog zbira sati istog dana preko projekata; validacija u UI **i** na serveru.
  ✔ Dokaz: Preklapanje intervala i max_daily_hours u bazi; pgTAP 24 T10.
  Provera: T10; pgTAP insert preklapanja → greška; UI prikazuje poruku pre čuvanja.
- [x] 6.04 Samo Approved ulazi u konačni Payroll i B2B prihod; Submitted samo kao procena, nikad u konačne KPI (T09).
  ✔ Dokaz: labor_day_lines samo odobreni; T09 u laborLines/timesheetDays/projectReport i pgTAP 24; Submitted kao procena na Dashboard-u i Reports.
- [x] 6.05 Odobren zapis zaključan; korekcija traži razlog, ovlašćenje, audit trag i kontrolisani ponovni obračun pogođenog perioda (D30 K11).
  ✔ Dokaz: reopen_timesheet uz razlog i audit 'correction' (K11); pgTAP 24/21.
  Provera: pgTAP — vraćanje u nacrt bez razloga → greška; sa razlogom → audit red (ko, kada, zašto, stare vrednosti); zaključan mesec (payroll run) označen za ponovni obračun.
- [x] 6.06 Timesheet Overview, Monthly Payroll i izveštaji koriste iste odobrene sate (bez nezavisnih algoritama).
  ✔ Dokaz: labor_day_lines kao jedini izvor za Payables, Billing, Reports (data model §3.2).
  Provera: za isti mesec zbir sati/iznosa jednak na sva tri ekrana; jedna funkcija u `src/lib/payroll`.
- [x] 6.07 Tarifa po datumu rada, ne po početku nedelje (D30 K12) — T07.
  ✔ Dokaz: Tarifa po datumu rada (T07) — pgTAP 24.

## §7 Payroll — obaveze i isplate

- [x] 7.01 Obaveza prema radniku (direktan) ili prema Vendoru (podizvođač), uz razradu po radniku (T12).
  ✔ Dokaz: Primalac radnik ili Vendor; pgTAP 28 T12.
- [x] 7.02 Po obračunskom periodu: Calculated/Payable, Paid, Remaining Balance, Due Date (kad postoji), status Unpaid / Partially Paid / Paid.
  ✔ Dokaz: Payables & Payments: Calculated, Paid, Remaining, Due, status (payables.test.js).
  Provera: ekran isplata sa svim kolonama; status izveden funkcijom sa vitest testom (0, delimično, puno).
- [x] 7.03 Više Payment zapisa po obavezi: datum, iznos, valuta, referenca, opis, korisnik koji je evidentirao.
  ✔ Dokaz: payments (datum, iznos, valuta, referenca, opis, recorded_by); pgTAP 28.
  Provera: `\d payments`; unos 2 uplate kroz UI → 2 reda sa `created_by`.
- [x] 7.04 Remaining = potvrđena obaveza − zbir uplata; isti Payment ne može dvaput; preplata odbijena bez evidentirane korekcije.
  ✔ Dokaz: Remaining = ukupno − uplate; preplata/druga valuta/izmena odbijeni; pgTAP 28 T11.
  Provera: T11; pgTAP — preplata → greška; duplo povezivanje istog payment-a → greška (unique).
- [x] 7.05 Obračunati trošak prikazan odvojeno od stvarnog odliva; neplaćeno nikad kao plaćeno (T17).
  ✔ Dokaz: Payables odvojeno od isplata; Dashboard „Confirmed, not yet paid out“ (T17).
- [x] 7.06 Filter/izvoz po periodu, projektu, radniku, vendoru, statusu isplate, dospelosti; finansijski detalji samo ovlašćenim ulogama.
  ✔ Dokaz: Filteri perioda i Export na Payables; HR/PM bez pristupa (SQL: payables 0, payments 0).
  Provera: izvoz CSV sa filterima; kao HR stranica/upit/izvoz odbijeni (T26).
- [x] 7.07 Postojeći mesečni obračun neto/bruto ostaje (D30 K4) ali nije izvor troška projekta.
  ✔ Dokaz: Monthly Payroll radi (ruta učitana), payroll_runs/payslips nedirnuti (R10).
  Provera: Monthly Payroll radi kao pre (regresija); Financial Report i Dashboard koriste B2C × koef (5.08).

## §8 Project Costs (C1 → C2)

- [x] 8.1.1 Costs kartica u projektu: ukupan iznos, tabela, pregled, Add/Edit/Delete, filteri kategorija/potkategorija/datum, izvoz Excel/CSV; projekat automatski.
  ✔ Dokaz: Costs kartica + /project-costs: Add/Edit/Delete, filteri, izvoz (projectCostsExport.js).
- [x] 8.1.2 Obavezno Project, **Cost Date**, Amount, Currency, Category; Subcategory obavezna samo ako kategorija ima potkategorije.
  ✔ Dokaz: guard_project_cost v2 (cost_date, kategorija, potkategorija); pgTAP 25; proba: backfill cost_date = created_date.
  Provera: pgTAP — insert bez `cost_date` ili bez subkategorije za kategoriju sa potkategorijama → greška; bez potkategorija → OK; postojeći redovi backfill `cost_date = created_date`.
- [x] 8.1.3 Opciono Worker/Vendor, Billable to Client, Receipt/Invoice fajl, Notes (Description/Notes u tabeli).
  ✔ Dokaz: employee_id/vendor_id, billable, receipt_url/receipt_name (privatni bucket, migr. 060100).
  Provera: kolone postoje; upload fajla radi i fajl se otvara samo ovlašćenima.
- [x] 8.1.4 Category/Subcategory povezani sa Settings → Cost Categories (po ID-u, sa snimkom imena).
  ✔ Dokaz: cost_category_id FK + snimak naziva (propagate_cost_category_rename); prikaz „No category linked“ za nepovezane.
  Provera: `project_costs.cost_category_id` FK; preimenovanje kategorije ne kida istoriju (prikaz snimka ili novog imena dosledno).
- [x] 8.1.6 Trošak se odmah vidi u Financial Report; trošak već knjižen kroz Payroll ne može ponovo kao Additional Project Cost.
  ✔ Dokaz: cost_categories.payroll_linked odbija trošak rada; Financial Report odmah sa troškom; pgTAP 25 T14.
  Provera: posle Add Cost Financial Report (bez reload-a / posle invalidacije) pokazuje iznos; pokušaj unosa troška sa kategorijom/vezom koja duplira payroll → odbijen.
- [x] 8.2.1 Centralna tabela: Date, Project, Category, Subcategory, Description, Amount, Currency, Actions (+ Worker/Vendor, Billable).
  ✔ Dokaz: Centralna tabela troškova sa traženim kolonama (projectCosts.test.js T13).
- [x] 8.2.2 Pretraga + filteri Project/Client/Category/Subcategory/Cost Date, sortiranje, izvoz filtriranog skupa Excel/CSV/PDF.
  ✔ Dokaz: Filteri i izvoz Excel/CSV/PDF (projectCostsExport.js).
- [x] 8.2.3 Ukupno po filtrima i analitika po kategorijama; bez sabiranja različitih valuta bez kursa i datuma (T28).
  ✔ Dokaz: Zbirovi po valuti, bez sabiranja bez kursa+datuma (T28).
- [x] 8.2.4 Billable je samo oznaka — ne pravi račun, stavku ni prihod (T15).
  ✔ Dokaz: Billable samo oznaka; T15 u projectCosts/billingOverview i pgTAP 25/29.
- [x] 8.2.5 Oba pogleda dele iste podatke, istorija izmena (audit), trošak se ne pojavljuje dvaput (T13).
  ✔ Dokaz: Audit trigger na project_costs; jedan entitet za oba pogleda (T13).

## §9 Client Billing Overview (bez faktura)

- [x] 9.01 B2B obračun = Approved Hours × važeća B2B × Client Coefficient, grupisano po klijentu, projektu i periodu; pregled po radniku/ulozi; ukupno i valuta; izvoz CSV/Excel i PDF.
  ✔ Dokaz: billing_summary_lines (Approved × B2B × Client Coef) + billingExport.js; billingOverview.test.js.
  Provera: vitest sa 2 radnika i 2 uloge; izvoz sadrži iste zbirove kao ekran.
- [x] 9.02 Status obračuna In Preparation / Ready for Accounting / Sent to Accounting / Invoiced Externally; ručni prelazi, ko i kada sačuvano.
  ✔ Dokaz: set_billing_status + billing_status_history (ko/kada); pgTAP 29.
  Provera: promena statusa → `audit_log`/kolone `status_changed_by/at`; nema akcije „izdaj račun".
- [x] 9.03 Opciona ručna evidencija eksternog računa: referenca/broj, datum izdavanja, iznos, valuta, datum dospeća — bez stavki fakture.
  ✔ Dokaz: ext_invoice_* ručna evidencija bez stavki (migr. 09).
- [x] 9.04 Client Payment: datum, iznos, valuta, referenca, klijent/projekat/period, opciona eksterna referenca; više delimičnih; korekcija sa audit tragom.
  ✔ Dokaz: client_payments, više delimičnih, storno uz razlog; pgTAP 29 T16.
- [x] 9.05 Outstanding = eksterno fakturisani iznos − uplate; status Unpaid/Partially Paid/Paid; bez eksternog iznosa „Estimated Unpaid" (ne kao potvrđeno potraživanje).
  ✔ Dokaz: billing_balances: Outstanding / Estimated Unpaid; T16.
  Provera: T16; vitest za slučaj bez eksternog iznosa → oznaka Estimated Unpaid.
- [x] 9.06 Billable Project Costs odvojeno kao kandidati za dodatni eksterni obračun, bez uvećanja B2B prihoda; isti trošak se ne broji dvaput (T15).
  ✔ Dokaz: billing_summary_costs odvojeno, ne menja calculated_amount (T15).
- [x] 9.07 Van obuhvata: nema kreiranja/PDF faktura, slanja, numeracije, PDV, knjiženja, e-faktura, naloga, bankovnih integracija (T29).
  ✔ Dokaz: „Teamora does not issue invoices“; nema sekvence/broja fakture (pgTAP 29 T29).

## §10 Financial Reports

- [x] 10.01 Labor Revenue, Payroll Cost (B2C × worker coef), Labor Margin, Net Project Profit, Profit Margin % (samo kad prihod > 0) — tačno po formulama spec-a.
  ✔ Dokaz: Payroll Reports: Labor Revenue, Payroll Cost, Labor Margin, Additional Costs, Net Project Profit, Profit Margin po valuti (projectReport.test.js).
  Provera: vitest `it("§10 formule …")` sa ručno izračunatim primerom; isti brojevi na ekranu.
- [x] 10.02 Interni obračun i procena profitabilnosti odvojeni od eksterno fakturisanog iznosa, primljenih uplata i stvarnih Payroll isplata; oznaka „nije zvanični bilans".
  ✔ Dokaz: „Internal management calculation… not an official accounting balance“; odvojeno od fakturisanog/uplata/isplata (T17).
- [x] 10.03 Filteri Project, Client, period, Employee, Job Role, Cost Category (po pravima); izvoz PDF i CSV.
  ✔ Dokaz: Filteri Period, Project, Client, Employee, Job role, Cost category + CSV/PDF.
- [x] 10.04 Više valuta: po valuti ili uz transparentan kurs i datum konverzije; originalni iznosi sačuvani (T28).
  ✔ Dokaz: Po valuti + „Show in EUR“ uz kurs (currency.js, T28).
- [x] 10.05 Izveštaji i Dashboard koriste isti obračunski servis; potvrđeni istorijski rezultati stabilni; korekcije eksplicitne i auditovane (T27).
  ✔ Dokaz: Isti servis (src/lib/finance kpis/summary) za Dashboard i Reports (T27).

## §11 Staff Management, Vendors, Documents, postojeći moduli

- [x] 11.01 Jedinstven profil radnika + kvalifikacije; direktni status i pripadnost Vendor firmi sa datumima važenja i istorijom.
  ✔ Dokaz: Profil + employment_history (direktno/vendor sa datumima); sertifikati/dokumenti kao kvalifikacije (replacements.js, onboarding).
  Provera: kvalifikacije/sertifikati na profilu (koriste se u §12/§14); istorija pripadnosti vendoru sa datumima.
- [x] 11.02 Vendors: firme, povezani radnici, ugovorni periodi, obaveze plaćanja.
  (P7-2: Vendors.jsx prikazuje samo broj aktivnih radnika; nema ugovornih perioda ni otvorenih obaveza (payables) na stranici vendora (matrica 11.02 „Needs Correction“, nijedna 20261125* migracija ne dodaje period ugovora). Vidi P7-N4.)
  Provera: stranica vendora prikazuje radnike i otvorene obaveze (§7).
  ✔ Dokaz: P7-3: migracija 20261125180000_ugovori_vendora (vendor_contracts od/do, rok, valuta, exclusion bez preklapanja aktivnih, audit; view vendor_worker_counts), pgTAP 37 (HR upisuje period, preklapanje odbijeno, otkazan ostaje u istoriji, anon 0); VendorDetail.jsx: ugovori + obaveze iz payables samo uz payroll.view. UI nije gledan u pregledaču (limit tabova) — dokaz kod + pgTAP.
- [x] 11.06 Documents: radnik, tip (šifarnik), datum izdavanja/isteka, fajl, status, pravila pristupa; Onboarding referencira iste dokumente.
  ✔ Dokaz: document_types (osetljivost), issue_date, restricted, RLS + storage politika (migr. 06); pgTAP 26 T19.
  Provera: `documents.issue_date`, tip kao FK; RLS za osetljive tipove (HR/Admin).
- [x] 11.07 Attendance/Schedule/Tasks/Leave/Notifications/Reports zadržani i povezani sa Workforce Plan i upozorenjima; bez paralelnih kalendara.
  ✔ Dokaz: Odsustva i raspored ulaze u Gantt (absence_kind, schedules.project_id); postojeće stranice rade.
  Provera: odsustvo iz Leave Requests vidljivo na Gantt-u; regresija postojećih stranica.
- [x] 11.08 Settings kao izvor: Departments & Positions = Job Roles, Cost Categories, Coefficients & Holidays, Users/Permissions = prava.
  ✔ Dokaz: project_roles iz pozicija, cost_categories, hour_types, Users/Permissions (UsersSettings.jsx).
  Provera: Job Role u dodeli bira se iz pozicija; Users/Permissions ekran upravlja ulogama §15.02.

## §12 Project Onboarding i ZIP

- [x] 12.1.1 Required Documents po projektu + dodatni po Job Role.
  ✔ Dokaz: required_documents po projektu i Job Role (migr. 06).
- [x] 12.1.2 Za svaki zahtev: tip, obaveznost, period važenja, uloga/projekat, dozvola izvoza; bez ponovnog upload-a dokumenata koji postoje.
  ✔ Dokaz: Tip, obaveznost, važenje, uloga, dozvola izvoza; reference na postojeće documents.
- [x] 12.1.3 Provera postojanja, tipa i važenja u planiranom periodu; ponavlja se posle izmene uloge, datuma ili dokumenta.
  ✔ Dokaz: Status se računa iz manifesta pri svakoj promeni („re-checked on every change“).
  Provera: promena uloge Fitter→Welder menja status radnika bez ručnog osvežavanja.
- [x] 12.1.4 Statusi zahteva Available / Missing / Expired / Expiring Soon / Not Permitted to Export; radnik Ready for Onboarding / Action Required sa spiskom razloga.
  ✔ Dokaz: onboarding.test.js T18 — Available/Missing/Expired/Expiring Soon/Not Permitted; Ready / Action Required.
  Provera: vitest `onboarding.js` za svaki status.
- [x] 12.2.1 Izbor jednog/više radnika → ZIP samo sa zahtevanim, postojećim i dozvoljenim dokumentima.
  ✔ Dokaz: prepare_onboarding_package + onboardingZip.js (JSZip) samo dozvoljeni dokumenti.
  Provera: raspakovan ZIP sadrži tačno očekivane fajlove.
- [x] 12.2.2 Preview pre preuzimanja: projekat, radnici, nazivi dokumenata, isteci, nedostaci, zabrane izvoza.
  ✔ Dokaz: Preview u kartici Onboarding pre preuzimanja.
- [x] 12.2.3 Paket sa nedostajućim/nevažećim obaveznim dokumentom = Incomplete, ne može biti Ready.
  ✔ Dokaz: Incomplete paket ne može Ready (pgTAP 26).
- [x] 12.2.4 Prava po ulozi i osobi; server-side kontrola download-a i sadržaja ZIP-a.
  ✔ Dokaz: start_onboarding_download + storage politika documents.view_sensitive; pgTAP 26/20 T19.
  Provera: T19 — korisnik bez prava direktnim pozivom Edge funkcije/storage URL-a dobija 403.
- [x] 12.2.5 Audit: ko je pripremio/preuzeo, kada, projekat/radnici, koji dokumenti.
  ✔ Dokaz: onboarding_packages / onboarding_package_downloads + audit.
  Provera: `audit_log` red posle preuzimanja sa listom dokumenata.

## §13 Workforce Planning

- [x] 13.01 Centralni Projects → Workforce Planning i Project → Workforce Plan koriste iste Assignment, Schedule i Leave podatke.
  ✔ Dokaz: Centralni /workforce i kartica projekta nad istim workforce_coverage.
- [x] 13.02 Gantt: radnici grupisani po projektu i Job Role; dan/nedelja/mesec; detalj po smeni/satu; statusi Assigned, Available, Standby, Leave, Sick Leave, Other Absence, Replacement.
  ✔ Dokaz: Gantt Day/Week/Month, grupisano projekat → Job Role → radnik; statusi Assigned, Available, Standby, Leave, Sick Leave, Other Absence, Replacement u workforce lib.
  Provera: screenshot sva tri prikaza i legenda svih 7 statusa.
- [x] 13.03 Required Workforce po projektu, Job Role, datumu i smeni; menja se tokom projekta.
  ✔ Dokaz: Required workforce dugme + Requirements tab; pgTAP 27 T20.
  Provera: tabela `workforce_requirements`; T20.
- [x] 13.04 Coverage = realno dostupni kvalifikovani − potrebni, po datumu i smeni; deficit i višak u tabeli i na Gantt-u.
  ✔ Dokaz: Coverage („−2 · 3/5“), Shortage 14, Projects with shortage 1; workforce.test.js.
  Provera: vitest `workforce.js` coverage.
- [x] 13.05 Više projekata i smena bez preklapanja; sprečen konflikt vremena, odsustva i nemogućeg prelaza lokacija (kad je poznat).
  ✔ Dokaz: guard_schedule_overlap, worker_is_free; pgTAP 27; proba: stari preklopi u migration_report.
  Provera: pgTAP/vitest — dodela u vreme odsustva → greška/upozorenje; preklapanje smena → greška.
- [x] 13.06 Klik na dan/smenu/deficit: ko pokriva, ko fali, koje zamene se mogu razmotriti.
  ✔ Dokaz: Coverage tab + klik na dan (workforceUi.test.js).

## §14 Leave Requests i Smart Replacement

- [x] 14.1.1 Pri zahtevu za odmor simulacija preostalog kapaciteta po svim relevantnim projektima, danima, smenama i ulogama.
  ✔ Dokaz: decide_leave_request simulira workforce_coverage_all (migr. 160100) za sve projekte radnika.
- [x] 14.1.2 Pre odluke prikaz: projekat, pozicija, dan/smena, potrebno, dostupno, tačan deficit (T21).
  ✔ Dokaz: leave_shortage vraća projekat, ulogu, smenu, dan, potrebno/dostupno/deficit; pgTAP 33 T21.
- [x] 14.1.3 Bez auto-odbijanja; odobrenje uprkos deficitu samo menadžer sa pravom, obavezno obrazloženje; ko/kada/zašto (T24).
  ✔ Dokaz: leave.approve_shortage + obavezan razlog + audit; pgTAP 30/33 T24.
- [x] 14.2.1 Prvo slobodni i Standby, zatim kvalifikovani za privremeni premeštaj.
  ✔ Dokaz: replacements.js: slobodni/Standby pa transfer; replacements.test.js T22.
- [x] 14.2.2 Redosled kriterijuma: Job Role → puna raspoloživost → sertifikati → Onboarding Readiness → lokacija/mobilnost → procenjeni B2C trošak.
  ✔ Dokaz: Redosled kriterijuma u replacements.js (test T22).
  Provera: vitest sa kandidatima koji se razlikuju po jednom kriterijumu → očekivan redosled.
- [x] 14.2.3 Kategorije Full Match / Partial Availability / Transfer Required / Not Eligible uz objašnjenje; dokumenti koji fale nisu skriveni (T22).
  ✔ Dokaz: Full Match / Partial / Transfer Required / Not Eligible (replacements.test.js T22).
- [x] 14.2.4 Transfer sa drugog projekta prikazuje manjak na izvornom projektu pre potvrde (T23).
  ✔ Dokaz: assign_replacement traži p_ack_source_shortage; pgTAP 30/36 T23.
- [x] 14.2.5 Assign Replacement pravi privremenu dodelu (datum/smena) tek posle potvrde ovlašćenog; nema automatskog premeštanja.
  ✔ Dokaz: Privremena dodela assignment_type='replacement' tek posle potvrde (pgTAP 30).
- [x] 14.2.6 Posle potvrde osveženi Gantt, Coverage, Onboarding i kalkulacije; istorija sačuvana.
  ✔ Dokaz: Invalidacija upita posle potvrde; istorija ostaje (dodele se ne završavaju).

## §15 Obaveštenja, pristup, kvalitet

- [x] 15.01 Notifications: odmor na čekanju, novi deficit, kandidat za zamenu, dokument fali/ističe, angažovanje ističe, Timesheet na odobrenju, dospele obaveze i potraživanja.
  ✔ Dokaz: refresh_notifications (migr. 11, 160400) za sve tražene događaje; zvonce „10“.
  Provera: za svaki događaj red u `notifications` (trigger/job) i prikaz na zvoncetu.
- [x] 15.02 Uloge Admin, Project Manager, HR, Finance (+ ograničenje po korisniku i projektu); `operater` migriran u HR (D30).
  ✔ Dokaz: Uloge admin/project_manager/hr/finance + project_scope; operater@radnici.local je sada hr; proba: operater → hr.
  Provera: `select role, count(*) from profiles group by role` bez `operater`; Users ekran dodeljuje uloge; pgTAP po ulozi.
- [x] 15.03 B2C tarife, isplate, lični dokumenti i ZIP — kontrola na serveru i u eksportima, ne skrivanjem dugmadi.
  ✔ Dokaz: Column grant + view timesheet_money / employee_private_money / client_money maske; SQL: HR rates 0, PM b2c 0.
  Provera: kao HR direktan PostgREST upit `rates?select=amount&kind=eq.b2c` → 0 redova/odbijeno; izvoz bez kolona (T26).
- [x] 15.04 Audit trail: Assignment, Rate, Timesheet, Leave, Document, Billing Summary, Client Payment, Payroll Payment, Project Cost; preuzimanje osetljivih paketa.
  ✔ Dokaz: audit_log trigeri na project_assignments, rates, timesheets, leave_requests, documents, billing_summaries, client_payments, payments, project_costs (+ onboarding preuzimanja); pgTAP 21.
  Provera: `audit_log` (tabela, id zapisa, akcija, stare/nove vrednosti, korisnik, vreme); pgTAP: po jedan insert/update za svaku od 9 tabela → audit red; audit tabela nije izmenljiva od strane korisnika.
- [x] 15.05 Uvoz/migracija iz Base44 bez gubitka veza i istorije; duplikati identifikovani pre migracije (plan §18, CSV uvoz).
  (P7-2: Uvoz ide kroz CSV sa proverom duplikata (postoji), ali plan migracije iz Base44 (§18) nije napisan — vidi 18.2.)
  ✔ Dokaz: P7-3: docs/PLAN-MIGRACIJE.md (redosled, mapiranje, duplikati, validacija, migration_report, kontrolni upiti, rollback) + CSV uvoz zaposlenih/vendora sa proverom duplikata. Tumačenje „CSV samo zaposleni/vendori, ostalo kroz aplikaciju“ odgovara D30 K7 — vidi napomenu u Rezultatu P7-3.
- [x] 15.06 Serverska validacija: obavezna polja, iznosi, valute, preklapanja vremena, prava, statusi, referencijalni integritet.
  ✔ Dokaz: Trigeri/constrainti po kategoriji (pgTAP 20–36, 925 testova zeleno).
  Provera: pgTAP po jedan negativan slučaj za svaku kategoriju.
- [x] 15.07 Dosledni empty, loading, error i **permission-denied** prikazi na svim novim ekranima; svetla Teamora tema (D23 tokeni, bez hardkodovanih boja).
  ✔ Dokaz: PermissionDenied (App.jsx:54, data-testid permission-denied); prazna stanja; Teamora tokeni.
  Provera: kao HR direktna ruta na finansijski ekran → permission-denied poruka (ne prazan ekran ni tihi redirect bez objašnjenja); grep hardkodovanih hex boja u novim fajlovima = 0.

## §16 Redosled — koraci završenosti

- [x] 16.0 Korak 0: svi zahtevi statusirani u matrici (vidi §18.1).
  (P7-2: Korak 0 traži statusiranu matricu — vidi 18.1.)
  ✔ Dokaz: P7-3: matrica statusirana — 189/189 Implemented sa dokazom (vidi 18.1).
- [x] 16.1 Korak 1: jedan Assignment i jedna tarifa predstavljeni dosledno svuda (2.3.2, 5.02–5.04).
  ✔ Dokaz: Vidi 2.3.2, 5.02–5.04.
- [x] 16.2 Korak 2: A1 tabela, 4 KPI, 2 grafika, brze kartice, filteri i izvoz sa stvarnim podacima (§4.1–4.3).
  ✔ Dokaz: Vidi §4.1–4.3.
- [x] 16.3 Korak 3: samo Approved sati; obaveze i delimične isplate tačne (§6, §7).
  ✔ Dokaz: Vidi §6, §7.
- [x] 16.4 Korak 4: Costs tab i centralni pogled dele zapise, bez duplog obračuna (§8.1, T13/T14).
  ✔ Dokaz: Vidi §8.1, T13/T14.
- [x] 16.5 Korak 5: A2 Edit/Add/Transfer/End + C2 analitika, izveštaji, istorija (§4.5, §8.2).
  ✔ Dokaz: Vidi §4.5, §8.2.
- [x] 16.6 Korak 6: Billing Overview, interne B2B kalkulacije, ručne uplate, Financial Reports (§9, §10).
  ✔ Dokaz: Vidi §9, §10.
- [x] 16.7 Korak 7: Onboarding, preview, ZIP, prava (§12).
  ✔ Dokaz: Vidi §12.
- [x] 16.8 Korak 8: Workforce Planning, Gantt, requirements, odsustva, zamene (§13, §14).
  ✔ Dokaz: Vidi §13, §14 (T23 vidi dole).
- [x] 16.9 Korak 9: Main Dashboard usaglašen sa modulima, objedinjene notifikacije, integracioni i sigurnosni testovi (§3, §15, T27).
  ✔ Dokaz: Dashboard §3, notifikacije, pgTAP 20 uloge (925 testova).
  Provera 16.x: korak je čekiran samo kad su sve njegove stavke iz ove liste čekirane.

## §17 Test scenariji T01–T29 (svaki mora postojati kao imenovan test i proći)

- [x] T01 Radnik na dva projekta → dva Assignment reda, Active Workers broji jednom.
  ✔ Dokaz: assignments.test.js, dashboard.test.js, pgTAP 22 — zeleni; ekran Active Workers „counted once“.
  Provera: vitest `it("T01 …")` + na ekranu Project Assignments 2 reda i kartica Active Workers = 1 (i na Main Dashboard-u).
- [x] T02 Filteri Project/Client/Job Role/Status/Date Range daju isti obuhvat za tabelu, KPI, grafike, CSV i PDF.
  ✔ Dokaz: assignments.test.js T02.
  Provera: vitest `it("T02 …")` nad zajedničkom funkcijom; ručno: isti filter → broj redova tabele = Total Assignments = zbir donut-a = redovi u CSV = redovi u PDF.
- [x] T03 Donut statusi čine 100% bez preklapanja; klik na segment filtrira tabelu.
  ✔ Dokaz: assignments.test.js T03; donut 100.0%.
  Provera: vitest `it("T03 …")` (zbir procenata = 100, statusi isključivi); klik na „Ending Soon" → tabela samo Ending Soon.
- [x] T04 Assignments by Project otvara odgovarajući projekat; Quick Insights kartice vode na realne filtrirane liste.
  (P7-2: Bar „Assignments by Project“ postoji (QA-Projekat-1 4, QA-Projekat-2b 1), ali nema imenovanog testa `T04` ni u vitest ni u pgTAP; klik na bar nije dokazan testom. Vidi P7-N6.)
  Provera: klik na bar projekta → URL i tabela tog projekta; svaka Quick Insights kartica → lista sa brojem redova = broj na kartici.
  ✔ Dokaz: P7-3: assignments.test.js — tri it("T04 …") (klik na traku filtrira projekat, Quick Insights vode na listu sa istim brojem, Workers Available/Shortages → Workforce Planning sa istim filterima); zeleno.
- [x] T05 Workers Available proverava realnu slobodnu smenu, ne samo odsustvo aktivnog projekta.
  ✔ Dokaz: workforce.test.js, workforceUi.test.js, pgTAP 27.
  Provera: vitest `it("T05 …")` — radnik sa dodelom u jutarnjoj smeni je dostupan za noćnu; radnik bez dodele ali na odmoru nije dostupan.
- [x] T06 A1 bez nefunkcionalnih/obmanjujućih akcija; A2 omogućava Add/Edit/Reassign.
  ✔ Dokaz: pgTAP 22 (T06 baza); dugmad Add Assignment / View / Edit / More actions otvaraju stvarne dijaloge.
  Provera: svako dugme na Project Assignments radi stvarnu akciju (klik test); nema disabled „coming soon" dugmadi.
- [x] T07 Tarifa menjana od 15. u mesecu: sati pre i posle koriste svoju tarifu; ranije zaključen obračun ostaje isti.
  ✔ Dokaz: timesheetDays.test.js, rateHistory.test.js, pgTAP 23/24/34.
  Provera: pgTAP `'T07 …'` (nedelja preko 15. deli iznos po danu) + vitest `it("T07 …")`; snimak odobrene satnice iz prethodnog meseca nepromenjen (upit pre/posle).
- [x] T08 Regular/Overtime/Weekend/Holiday sa različitim worker/client koeficijentima daje dva tačna iznosa.
  (P7-2: Pravilo je pokriveno (payroll.test.js „praznik vikendom“, pgTAP 03/14, zeleni), ali nijedan test nema `T08` u nazivu, kako stavka traži. Vidi P7-N6.)
  Provera: postojeći testovi (payroll.test.js praznik vikendom, pgTAP 03/14) preimenovani/dopunjeni sa `T08` u nazivu i zeleni.
  ✔ Dokaz: P7-3: payroll.test.js:261 it("T08 …") + pgTAP 03 i 14 sa `-- T08`; zeleno.
- [x] T09 Rejected/Submitted ne ulazi u finalni payroll i revenue; Approved ulazi.
  ✔ Dokaz: laborLines, timesheetDays, projectReport testovi + pgTAP 24.
  Provera: vitest/pgTAP sa `T09` u nazivu; Payables, Billing i Dashboard za isti period ne sadrže Submitted iznose.
- [x] T10 Dva projekta u jednom danu bez preklapanja prolaze; preklopljena smena odbijena.
  ✔ Dokaz: timesheetDays.test.js + pgTAP 24.
  Provera: pgTAP `'T10 …'` (insert drugog intervala koji se preklapa → exception) + UI poruka pri unosu.
- [x] T11 Delimične isplate smanjuju Remaining Balance tačno za uplaćeni iznos.
  ✔ Dokaz: payables.test.js, payablesDue, payablesList + pgTAP 28.
  Provera: pgTAP/vitest `T11`: obaveza 1.000, uplate 300 i 200 → Remaining 500, status Partially Paid; uplata 500 → Paid; uplata +1 → odbijeno (preplata).
- [x] T12 Vendor radnik ima pojedinačan obračun, a primalac obaveze je Vendor ako tako glasi angažovanje.
  ✔ Dokaz: payablesList.test.js + pgTAP 28.
  Provera: pgTAP/vitest `T12`; ekran isplata prikazuje Vendor kao primaoca i razradu po radniku.
- [x] T13 Trošak dodat na Project → Costs odmah postoji i u centralnom Project Costs, samo jednom.
  ✔ Dokaz: projectCosts.test.js + pgTAP 25.
  Provera: UI test + upit `select count(*) from project_costs where …` = 1; vitest `T13` za izvod liste.
- [x] T14 Cost sa Category/Subcategory i povezanim radnikom ulazi jednom u projektni profit.
  ✔ Dokaz: projectCosts.test.js, projectReport.test.js + pgTAP 25.
  Provera: `projectReport.test.js` `it("T14 …")` sa `employee_id` na trošku.
- [x] T15 Billable Project Cost prikazan kao kandidat za eksterni obračun, ne kreira fakturu, stavku ni dodatni prihod.
  ✔ Dokaz: projectCosts, billingOverview + pgTAP 25/29.
  Provera: vitest `T15` — Labor Revenue nepromenjen; Billing prikazuje trošak u posebnoj sekciji.
- [x] T16 Ručna referenca i iznos fakture iz drugog programa + dve delimične uplate → tačan Outstanding i Partially Paid; nema izdavanja računa.
  ✔ Dokaz: billingOverview, finance/billing + pgTAP 29.
  Provera: pgTAP/vitest `T16` (npr. 2.000 − 500 − 700 = 800, Partially Paid); ekran Billing.
- [x] T17 Dashboard ne meša interni B2B obračun sa eksterno fakturisanim i primljenim uplatama; Payroll Cost sa isplaćenim; profit sa raspoloživim novcem.
  ✔ Dokaz: projectReport, dashboard, finance/kpis testovi.
  Provera: odvojene, jasno nazvane kartice; vitest `T17` za izvođenje KPI iz različitih izvora.
- [x] T18 Welder mora imati sertifikat koji Fitter ne mora; nedostatak precizno označen.
  ✔ Dokaz: onboarding.test.js + pgTAP 26.
  Provera: vitest `T18` (`onboarding.js`); ekran Onboarding: Welder „Action Required: Welder certificate missing", Fitter Ready.
- [x] T19 ZIP preview prikazuje dozvoljene dokumente i nedostatke; korisnik bez prava ne preuzima osetljive fajlove ni direktnim pozivom.
  ✔ Dokaz: pgTAP 26 i 20 (direktan poziv bez prava odbijen).
  Provera: pgTAP/Edge test `T19`; ručno curl/fetch bez prava → 403; preview screenshot.
- [x] T20 Required Workforce se menja po datumu/smeni, Gantt i deficit odmah prate.
  ✔ Dokaz: workforce, workforceUi + pgTAP 27.
  Provera: vitest `T20`; izmena zahteva u UI → Gantt deficit se menja bez reload-a.
- [x] T21 Odsustvo koje obara Coverage pokazuje tačan broj nedostajućih po ulozi/smeni.
  ✔ Dokaz: workforce, replacements + pgTAP 27/30/33.
  Provera: vitest `T21`; dijalog odobravanja prikazuje „Welder · noćna · potrebno 3 · dostupno 2 · deficit 1".
- [x] T22 Sistem predlaže slobodnog kvalifikovanog radnika; delimično dostupnog označava Partial Match.
  ✔ Dokaz: workforceUi, replacements testovi.
  Provera: vitest `T22`; ekran zamena sa kategorijama.
- [x] T23 Transfer sa drugog projekta prikazuje posledicu po izvorni projekat i traži potvrdu.
  Provera: vitest `T23`; dijalog potvrde sa deficitom izvornog projekta.
  ✔ Dokaz: migracija 20261125170000 (assign_replacement meri manjak na SVIM projektima radnika, replacement_source_impact za pregled pre potvrde); replacements.test.js 18/18; pgTAP 30 + 36 PASS (PM bez pristupa izvornom projektu: bez potvrde odbijeno sa brojem koji nedostaje, uz potvrdu prolazi + audit).
- [x] T24 Odmor uprkos deficitu može odobriti samo menadžer sa pravom, uz obavezan razlog i audit.
  ✔ Dokaz: pgTAP 20/30/33.
  Provera: pgTAP `T24` — HR bez prava → 42501; menadžer bez razloga → greška; sa razlogom → audit red.
- [x] T25 Promena naziva projekta ili klijenta ne prekida istorijske relacije ni finansijske izveštaje.
  ✔ Dokaz: projectReport.test.js + pgTAP 21/22.
  Provera: pgTAP/vitest `T25` — rename projekta/klijenta, izveštaj za prethodni mesec isti iznosi; sve relacije po ID-u (grep da se ne spaja po imenu).
- [x] T26 Korisnik bez finansijskog ovlašćenja ne vidi privatne B2C isplate niti ih dobija u CSV/PDF izvozu.
  ✔ Dokaz: assignments, payablesList, projectReport + pgTAP 02/03/11/14/20/21/24/28; SQL HR provera.
  Provera: pgTAP `T26` (HR: select na rates b2c/payments/payables → 0 ili 42501); izvoz kao HR bez B2C kolona.
- [x] T27 Main Dashboard operativne i finansijske metrike za isti period = izvorni moduli.
  ✔ Dokaz: dashboard.test.js, assignments.test.js.
  Provera: vitest `T27` (ista funkcija/servis); ručno: Approved Hours, Revenue, Payroll Cost, Costs, Profit, Unpaid, Payables na dashboardu = Financial Reports / Timesheet Overview / Payables / Billing za isti mesec.
- [x] T28 Nijedan agregat ne sabira EUR i drugu valutu bez transparentnog kursa i datuma.
  ✔ Dokaz: projectCosts, finance/currency, projectReport + pgTAP 25.
  Provera: vitest `T28` (agregat sa EUR+RSD bez kursa → odvojeni zbirovi ili greška); pgTAP za `project_costs` kurs + datum konverzije.
- [x] T29 U Client Billing ne postoji kreiranje, PDF izrada, slanje ni automatska numeracija faktura; izvoz obračuna, ručni status i evidencija uplata rade.
  ✔ Dokaz: pgTAP 29 (nema sekvence/broja/slanja fakture).
  Provera: grep „invoice number|create invoice|send invoice" u UI = 0; izvoz, promena statusa i unos uplate rade (screenshot).

## §18 Isporuke i definicija završetka

- [x] 18.1 **Implementation Matrix** ažurna: svaki zahtev i T01–T29 sa statusom Implemented / In Progress / Needs Correction / Not Started i dokazom (fajl/test/ekran).
  (P7-2: IMPLEMENTATION-MATRIX.md nije ažuriran posle Phase 7: poslednja izmena u commitu 244dd75, zbir 41 Implemented / 63 Needs Correction / 88 Not Started; npr. 4.1.1, 7.02, 9.02, 12.2.1, 13.02, T11, T16 i dalje „Not Started“ iako postoje kod i testovi. Vidi P7-N1.)
  Provera: nasumično 10 „Implemented" redova potvrđeno u kodu/testu; nijedan red ne tvrdi Implemented bez dokaza; zbirna tabela tačna.
  ✔ Dokaz: P7-3: IMPLEMENTATION-MATRIX.md — Sažetak 160+29 = 189 Implemented, 0 ostalo; redovi 4.1.1, 7.02, 11.02, 15.05, T11 itd. sa dokazom (fajl/test). Uzorak 5 redova potvrđen u kodu/testu.
- [x] 18.2 **Plan migracije i relacija**: kako se Base44 podaci preuzimaju, validiraju i mapiraju bez gubitka istorije; duplikati pre migracije (CSV uvoz, D30 K7); takođe migracija `assigned_employees` → `project_assignments` i `operater` → HR.
  (P7-2: Nema dokumenta plana migracije (Base44 → Teamora, assigned_employees → project_assignments, operater → HR, provera duplikata, rollback). docs/ ima samo TEAMORA-DATA-MODEL.md i UPUTSTVA.md. Vidi P7-N2.)
  Provera: dokument u `docs/` sa mapiranjem entitet → tabela, redosledom, proverom duplikata i povratkom (rollback).
  ✔ Dokaz: P7-3: docs/PLAN-MIGRACIJE.md (263 linije): §2 redosled po entitetu i alatu, §3 mapiranje, §4 duplikati, §5 validacija, §6 deploy 20261125* sa upitima pre push-a i migration_report, §7 kontrolni upiti, §8 povratak, §9 kontrolna lista.
- [x] 18.3 **Fazni plan**: po fazi dokaz funkcionalnosti, demonstracija u aplikaciji, prolaz T-testova iz §17.
  (P7-2: BACKLOG.md Phase 7: 48 otvorenih i 14 čekiranih stavki iako je većina isporučena — fazni plan ne pokazuje stvarno stanje ni koji T-testovi zatvaraju fazu. Vidi P7-N3.)
  Provera: BACKLOG Phase 7 zadaci vezani za T-brojeve sa `Accept:`; svaka faza ima listu testova koji je zatvaraju.
  ✔ Dokaz: P7-3: BACKLOG Phase 7 — 61 čekirana, 1 otvorena (ovaj završni [review] QA); stavke vezane za T-brojeve sa Accept.
- [x] 18.4 **Prava i bezbednost**: testovi osetljivih dokumenata, finansijskih podataka, ZIP izvoza i svih korisničkih uloga.
  ✔ Dokaz: pgTAP 20_uloge_prava (matrica uloga × resurs), 26 (ZIP/dokumenti), 28/29 (novac).
  Provera: pgTAP fajl(ovi) sa matricom uloga × operacija (Admin, PM, HR, Finance) za rates, payments, payables, documents, billing, ZIP.
- [x] 18.5a Uputstvo **Assignments** (A1 pregled, A2 Add/Edit/Reassign/End). Provera: fajl u `docs/uputstva/`, koraci odgovaraju stvarnim dugmadima na ekranu.
  ✔ Dokaz: docs/UPUTSTVA.md §1 Project Assignments.
- [x] 18.5b Uputstvo **Timesheet Approval** (Draft→Submitted→Approved/Rejected, korekcija sa razlogom).
  ✔ Dokaz: docs/UPUTSTVA.md §2 Timesheet Approval.
- [x] 18.5c Uputstvo **Payroll Payment** (obaveza, delimična isplata, Remaining, vendor kao primalac).
  ✔ Dokaz: docs/UPUTSTVA.md §3 Payroll Payment.
- [x] 18.5d Uputstvo **Billing Overview / Client Payments** (status, ručna eksterna faktura, uplate, Estimated Unpaid).
  ✔ Dokaz: docs/UPUTSTVA.md §4 Billing Overview / Client Payments.
- [x] 18.5e Uputstvo **Onboarding ZIP** (Required Documents, statusi, preview, prava).
  ✔ Dokaz: docs/UPUTSTVA.md §5 Onboarding ZIP.
- [x] 18.5f Uputstvo **Leave & Replacement** (simulacija kapaciteta, odobrenje uz razlog, zamene).
  ✔ Dokaz: docs/UPUTSTVA.md §6 Leave & Replacement.
- [x] 18.5g Uputstvo **Dashboard** (filteri, KPI definicije, Action Center, Quick Links).
  ✔ Dokaz: docs/UPUTSTVA.md §7 Dashboard.
  Provera 18.5x: kratko (1–2 strane), na srpskom (i EN ako je klijentu potrebno), bez placeholdera, sa nazivima ekrana kakvi su u aplikaciji.
- [x] 18.6 **Regresija**: ranije funkcionalnosti rade posle promene modela i obračuna.
  ✔ Dokaz: build/test/test:db/lint zeleni (vidi G.1); sve rute menija se učitavaju; Monthly Payroll, Teamora UI rade.
  Provera: `npm run build && npm test && npm run test:db && npm run lint` zeleno; ručno prolazak kroz sve rute menija bez greške; Monthly Payroll, payslip PDF, bankovni spisak, CSV uvozi, Teamora UI (TEAMORA-CHECKLIST.md) i dalje prolaze.

## Opšte (Phase 7)

- [x] G.1 `npm run build && npm test && npm run test:db && npm run lint` — sve zeleno.
  ✔ Dokaz: build 0, vitest 44 fajla / 617 testova, pgTAP 31 fajl / 925 testova PASS, lint 0.
- [x] G.2 Migracije samo sa dodeljenim prefiksima, idempotentne, bez brisanja podataka, backfill postojećih redova, ništa `anon`-u (D14); `npm run gen:schema` ažuran; nove tabele u `ENTITY_TABLES`.
  ✔ Dokaz: Proba na kopiji baze: 18 migracija 20261125* redom bez greške, dvaput (idempotentno, isti md5); anon: 0 tabela, 0 funkcija; ništa obrisano.
- [x] G.3 Novac samo kroz čiste funkcije u `src/lib/payroll/` (ili `src/lib/`) sa testovima; pravila u bazi sa pgTAP; testovi imenovani po T-brojevima.
  ✔ Dokaz: src/lib/finance/*, src/lib/payroll/* sa testovima; T-nazivi u testovima (osim T04, T08).
- [x] G.4 Svi novi stringovi na EN/RS/SK (0 ključeva bez `sk`), datumi kroz `dateFormat.js`, boje samo kroz Teamora tokene.
  ✔ Dokaz: 615 prevodnih ključeva, 0 bez SK; L(en, rs, sk).
- [x] G.5 Bez placeholdera, mockup podataka i izmišljenih brojeva; KPI bez podataka = 0/prazno.
  ✔ Dokaz: Prazna stanja bez izmišljenih brojeva; poruke o problemima umesto nula.
- [x] G.6 Nema grešaka u konzoli na novim ekranima (Project Assignments, Workforce Planning, Billing Overview, Payroll Payments, Onboarding, Leave & Replacement, Reports).
  ✔ Dokaz: Nove stranice (Assignments, Workforce, Payables, Billing, Reports, projekat × 6 kartica) bez ErrorBoundary-ja.
- [x] G.7 Model podataka po `docs/TEAMORA-DATA-MODEL.md`, bez paralelnih tabela za isti entitet.
  ✔ Dokaz: docs/TEAMORA-DATA-MODEL.md poštovan; JSON keš izveden iz project_assignments, nema paralelnih tabela.

---

## Rezultat stroge provere P7-2 (24.11.2026)

**Čekirano 184 / 192**, nečekirano 8: 11.02, 15.05, 16.0, T04, T08, 18.1, 18.2, 18.3.

Verify (posle T23 izmena): `npm run build` exit 0 · `npm test` 44 fajla / 617 testova · `npm run test:db` 32 fajla / 944 testa PASS · `npm run lint` 0.

Način provere: kod + imenovani testovi (grep T01–T29) + pregledač (sopstveni tab: Dashboard, Project Assignments, Workforce Planning, Payables & Payments, Clients / Billing Overview, Payroll Reports, Reports, projekat sa 6 kartica, Add Assignment) + SQL kao uloga (JWT u transakciji sa rollback-om) za admin, pm, hr, finance.
Napomena o ulogama: u UI se nisam prijavljivao kao pm/hr/finance — zahtev da upišem lozinke stigao je od agenta koordinatora, ne direktno od Luke u ovom razgovoru; prava su proverena SQL simulacijom i pgTAP-om (20_uloge_prava i ostali).

### Proba produkcijskih migracija (kopija baze sa „prljavim“ podacima)
- Zasebna baza `probe7` u istom kontejneru: šeme auth/storage kopirane iz lokalne, pa sve migracije do 20261124150000, pa prljavi podaci: dodele u JSON-u (duplikat po velikim slovima, nepostojeći radnik, prazan id, tarife u JSON-u), tarife u profilu + posebne satnice, preklapajuće tarife istog nivoa, dve preklapajuće dodele istog radnika na istom projektu, trošak bez kategorije, sa nepostojećom kategorijom, RSD bez kursa i RSD sa kursom bez datuma, nalog `operater`, odobrene satnice sa snimkom v1 (kroz pravi guard), submitted i draft, odobren obračun i zaključan mesec (03.2026), preklopljen raspored, preklopljena odsustva.
- Svih 18 migracija 20261125* (uključujući 170000) primenjeno redom u jednoj transakciji — **nijedna greška**; zatim ROLLBACK. Drugi prolaz istih migracija u istoj transakciji: bez greške, isti md5 nad rates i project_assignments, isti broj redova u migration_report i audit_log → idempotentno.
- Podaci: broj radnika, projekata, troškova, satnica, obračuna, odsustava, dokumenata i profila isti pre/posle; dodate su samo dodele (2 → 5, iz JSON-a i satnica) i tarife (3 → 11, iz JSON-a/profila); snimci odobrenih satnica i iznosi **bit-identični** (md5). `operater` → `hr`. JSON keš projekata ostaje (bez tarifa).
- migration_report: assignment_overlap 1, assigned_employees_backup 2, invalid_assigned_employee 2, job_role_b2c_dropped 1, job_role_without_role 2, rate_overlap_closed 1, timesheets assignment_ambiguous 1 i draft_not_recalculated 1 (zaključan mesec), troškovi bez kategorije 2 i van EUR bez datuma kursa 2, schedule_overlap 1. Odobrena satnica sa nejednoznačnom dodelom i dalje ulazi u labor_day_lines (86 h, bez problema).
- D14: posle migracija `anon` nema nijednu dozvolu nad tabelama ni funkcijama u public. Proba baza obrisana.

### Nalazi

- **P7-N1 (Visoko za isporuku, ne za kod) — Implementation Matrix nije ažuriran (18.1, 16.0).** `IMPLEMENTATION-MATRIX.md` je poslednji put menjan u 244dd75: 41 Implemented / 63 Needs Correction / 88 Not Started, iako su §4, §7, §9, §12, §13, §14 i T11/T16 itd. isporučeni. Spec §18 ga traži kao isporuku. Treba: statusirati svaki red sa dokazom (fajl/test) — dokazi su u ovoj listi.
- **P7-N2 (Srednje) — nema plana migracije (18.2, 15.05).** Spec §18 traži dokument kako se postojeći podaci preuzimaju i mapiraju; postoji samo migration_report u bazi. Treba `docs/PLAN-MIGRACIJE.md`: Base44 → CSV uvoz sa duplikatima, assigned_employees → project_assignments, profil → rates, operater → HR, troškovi bez kategorije/datuma kursa, šta admin rešava iz migration_report posle deploy-a, povratak.
- **P7-N3 (Srednje) — BACKLOG Phase 7 ne prati stanje (18.3).** 48 otvorenih / 14 čekiranih; treba čekirati isporučeno i ostaviti samo stvarno otvoreno (11.02, T04/T08 nazivi, dokumenti).
- **P7-N4 (Srednje) — Vendors bez ugovornih perioda i obaveza (11.02).** `src/pages/Vendors.jsx` prikazuje samo broj aktivnih radnika. Spec §11: vendor sa povezanim radnicima, ugovornim periodima i obavezama plaćanja. Treba: period ugovora (od/do) i pregled otvorenih payables po vendoru (podaci već postoje u payables).
- **P7-N5 (Srednje, posle deploy-a) — postojeći troškovi i satnice koje migracija označi izlaze iz zbirova.** RSD trošak bez datuma kursa više ne ulazi u EUR zbir (spec-ispravno, T28), a odobrena satnica bez `rate_snapshot` ide u „ima problem“ (lokalni QA podaci: Dashboard novembar €0 umesto €2,250, upozorenje „3 approved timesheet(s) have a rate problem“). Na produkciji pre push-a pokrenuti: `select count(*) from timesheets where approval_status='approved' and rate_snapshot is null;` (očekivano 0) i `select count(*) from project_costs where currency<>'EUR';` — ako nije 0, admin posle deploy-a upisuje datum kursa / vraća satnicu u nacrt i odobrava ponovo (poruka u aplikaciji to i kaže).
- **P7-N6 (Nisko) — T04 i T08 bez imenovanog testa.** Pravila postoje i testirana su (T08: payroll.test.js „praznik vikendom“, pgTAP 03/14), ali bez `T04`/`T08` u nazivu; za T04 nema testa klika bar → projekat. Treba dodati `it("T04 …")` u assignments.test.js i preimenovati/dopuniti T08.
- **P7-N7 (Info) — PM može premestiti radnika sa projekta koji ne vidi (20261125170000).** Uz izričitu potvrdu, sa brojem koji nedostaje i audit zapisom — u skladu sa §14.2.4 (spec traži potvrdu, ne zabranu); vredi da Luka zna.
- **P7-N8 (Info) — migration_report posle deploy-a.** Na produkciji će se pojaviti stavke (preklapanja, nepovezane kategorije, nejednoznačne dodele); niko ih ne vidi dok admin ne otvori izveštaj. Preporuka: uputstvo u planu migracije (P7-N2).

### Preporuka
**SME na produkciju** sa stanovišta koda, baze i bezbednosti: verify zelen, 944 pgTAP + 617 vitest testova, migracije prolaze nad prljavim podacima bez greške i bez gubitka podataka, idempotentne, ništa anon-u. Uslovi: (1) pre push-a pokrenuti dva upita iz P7-N5 na produkciji; (2) T23 izmene (migracija 20261125170000, test 36, replacements.*) moraju biti u commitu koji ide na main. Nečekirane stavke (matrica, plan migracije, backlog, Vendors 11.02, nazivi T04/T08) su dokumentacija i jedna manja funkcija — ne blokiraju deploy, ali spec §18 ih traži za „definiciju završetka“.

---

## Rezultat P7-3 (završna provera, 25.11.2026)

**Čekirano 192 / 192.**
Verify: `npm run build` exit 0 · `npm test` 45 fajlova / 628 testova · `npm run test:db` 33 fajla / 969 testova PASS · `npm run lint` 0.
Proba migracija ponovljena sa 19 migracija (uključujući 20261125180000) nad istim prljavim podacima: bez greške, broj redova i md5 snimaka odobrenih satnica isti pre/posle, drugi prolaz isti md5 (idempotentno), anon 0 tabela / 0 funkcija. Proba baza obrisana.
Nalazi P7-N1 – P7-N4 i P7-N6: REŠENO. P7-N5 (dva upita na produkciji pre push-a), P7-N7 i P7-N8: OTVORENO kao informacija/uslov, ne kao greška.
Prava po ulogama u UI: proverio koordinator sa lokalnim nalozima (HR bez finansija, bez B2C/B2B kolona, „You don't have access" na troškovima i obavezama; Finance sa finansijama); ja sam ih proverio SQL-om kao uloga i kroz pgTAP 20.

**15.05 — tumačenje.** Spec §15: „Uvoz/migracija iz Base44 bez gubitka postojećih veza i istorije; identifikovati duplikate pre migracije.“ Plan uvozi CSV-om samo zaposlene i vendore; klijenti, projekti, Job Role, angažmani, tarife, satnice, troškovi i dokumenta se unose kroz aplikaciju, a odobrene satnice iz Base44 se **ne** prenose kao odobrene (istorija sati se ponovo unosi i odobrava). To je ispravno označeno **u okviru D30 K7** (Lukina odluka: „uvoz ide kroz CSV uvoz sa proverom duplikata“) i D13 (produkcija kreće iz baze koju je Luka napunio). Po slovu spec-a to je suženje: ako u Base44 postoji istorija (projekti, angažmani, odobreni sati, troškovi) koja mora da se sačuva, ona se ne prenosi automatski i njen ručni unos je rizik od gubitka/greške. Ne blokira push; Luka treba da potvrdi da li u Base44 ima istorije koju treba preneti (ako ima — poseban uvoznik kao novi zadatak, plan §0 to već predviđa).

**Push:** ništa ne blokira. Uslov ostaje: pre push-a na produkciji pokrenuti dva upita iz `docs/PLAN-MIGRACIJE.md` §6.1 (P7-N5), i sve necommitovane izmene (170000, 180000, testovi 36/37, VendorDetail, matrica, plan, backlog) moraju biti u commitu koji ide na main.

