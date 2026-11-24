# BACKLOG — App za radnike

Format: `~/.claude/os/BACKLOG-SPEC.md`. Verify: `npm run build && npm test` (+ `npm run test:db` kad se menja baza). Pravila: `DECISIONS.md`.
Zadaci označeni *(opus)* diraju novac ili prijavu — po politici modela radi ih opus, ne sonnet.
Princip (D12): postojeće stranice ostaju iste; menja se izvor podataka i novčana logika gde je pogrešna.

## Phase 0 — Temelj

- [x] [build] Raspakovati Base44 izvoz, git, npm install. Accept: `npm run build` prolazi.
- [x] [build] Obračunsko jezgro: bruto↔neto po srpskim propisima, mesečni obračun radnika, raspodela troška po projektima (`src/lib/payroll`). Accept: `npm test` zelen; ručno izračunati primeri prolaze; tarifa koja fali baca grešku.
- [x] [build] Lokalni Supabase (portovi 573xx), `.env.local.example` sa praznim ključevima, `src/api/supabase.js`, ekran „Supabase nije podešen". Accept: `npx supabase status` radi.
- [x] [build] *(opus)* Šema po imenima polja iz aplikacije (D12): sve Base44 tabele + `employee_private`, `project_id`/`client_id` veze, zaključavanje meseca, odobravanje satnica samo za admina i samo sa tarifom, mesečni obračun (`payroll_runs`/`payslips`). Accept: `npm run test:db` — 35 testova zeleno.
- [x] [build] *(opus)* Prijava i uloge (Supabase Auth, `AuthLayout`, `src/lib/access.js`). Accept: neprijavljen vidi prijavu; operater ne vidi novčane stranice i direktan URL ga vraća na početnu — provereno u pregledaču.
- [x] [build] Sloj podataka sa istim pozivima kao Base44 (`src/api/base44Client.js`) + uklonjen Base44 vite plugin. Accept: dodavanje radnika, klijenta i projekta kroz postojeće forme radi; banka/IBAN završavaju u `employee_private`; projekat dobija `client_id` — provereno u pregledaču.
- [x] NEEDS-USER: napraviti Supabase projekat (besplatan plan) kad krećemo na server. Urađeno 22.11.2026: projekat `workforce` (ref `yuhsygsaxiodmxfydgyi`, eu-west-1), GitHub `Stelux1/workforce` povezan, „Deploy to production" na grani `main` — svaki push na `main` primenjuje nove migracije; `seed.sql` i auth podešavanja iz `config.toml` se NE prenose (podešavaju se u Supabase-u).
- [ ] NEEDS-USER: URL i Publishable key produkcionog projekta upisati u `.env.local` sam — ne slati u chat. Lukin nalog napraviti prvi (prvi nalog postaje admin), pa isključiti registraciju i podići minimalnu lozinku na 10 (D14, dopuna 14.11.2026).

## Phase 1 — Sve postojeće stranice na novoj bazi

- [x] [build] Proći svaku stranicu kao admin i kao operater (Dashboard, Zaposleni, profil radnika, Podizvođači, Dokumenta, Zadaci, Odsustva, Obaveštenja, Izveštaji, Projekti, detalj projekta, Troškovi, Tarife i angažmani, Satnice, Pregled satnica, Klijenti, Izveštaji o platama, Podešavanja) i popraviti greške u sloju podataka. Accept: nijedna stranica ne baca grešku u konzoli; dodavanje/izmena/brisanje radi za svaki entitet.
- [x] [build] Forma radnika, isti stil (`EmployeeFormFields`): JMBG (13 cifara + kontrolna cifra), broj lične karte i važenje, broj pasoša i važenje, osnova satnice neto/bruto, udeo radnog vremena; sekcija vidljiva samo adminu. Accept: pogrešan JMBG odbijen i u formi i u bazi; operater ne vidi sekciju.
- [x] [build] Forma radnika: svaki `<Label>` povezan sa svojim poljem (`htmlFor`/`id`), i u dijalozima dokumenata/angažmana. Accept: u pregledaču svako polje forme radnika ima dostupno ime (accessibility tree), `npm run build && npm test` prolaze. (QA 14.11.2026, P3)
- [x] [build] Fajlovi otpremljeni u formu koja se zatvori bez čuvanja (fotografija, dokument, prilog satnice) se brišu iz bucketa `files`. Accept: otpremi pa Otkaži → objekat ne postoji u `storage.objects`; sačuvan zapis i dalje otvara svoj fajl. (QA 14.11.2026)
- [x] [build] Fajlovi (dokumenta, prilozi satnica, fotografija) preko privatnog Storage-a. Accept: fajl se otvara samo prijavljenom korisniku (potpisan link); izmena zapisa ne pretvara link u trajni URL koji ističe.

## Phase 2 — Novac u satnicama

- [x] [build] *(opus)* Jedan izbor tarife za ceo program (`src/lib/payroll/rates.js`), redosled: tarifa angažmana (Tarife) → satnica radnika na projektu (`assigned_employees`) → tarifa projekta/pozicije (Tarife) → zanimanje na projektu (`job_roles`, samo klijent) → tarifa radnika (Tarife) → satnica iz profila radnika. Ništa od toga → greška, nikad 0. Samo EUR i po satu; drugačije → greška. Koriste ga Satnice i Kalkulator tarifa. Accept: unit test za svaki nivo i za „nema tarife".
- [x] [build] *(opus)* Razvrstavanje sati iz nedeljne satnice: praznik (lista praznika) → vikend (subota, nedelja) → preko dnevnog praga prekovremeno → ostalo redovno; iznos = sati × tarifa × koeficijent (prekovremeni/vikend/praznik tarifa iz profila radnika ima prednost nad koeficijentom). Accept: test — pon 10h + sub 8h uz prag 8h = 8 redovno + 2 prekovremeno + 8 vikend; koeficijent koji fali → greška.
- [x] [build] Stranica Satnice: šalje `project_id`, računa preko gornja dva modula, čuva `hours_by_type` i `rate_snapshot`, odobrava samo admin (dugmad skrivena operateru), prazno polje = 0, prekovremeni više nije „preko 40h". Accept: odobrena satnica bez tarife nije moguća; promena tarife posle odobravanja ne menja odobrenu satnicu.
- [x] [build] *(opus)* Baza pri odobravanju proverava i samu tarifu satnice prema jedinstvenom izboru tarife (dodela/projekat), ne samo da je > 0 — operater preko API-ja trenutno može da upiše proizvoljnu tarifu u nacrt (D3, D16). Accept: pgTAP — satnica čija `b2c_rate`/`b2b_rate` ne odgovara važećoj tarifi ne može da se odobri.
- [x] [build] Podešavanja → „Koeficijenti i praznici" (nova stranica u istom stilu kao Odeljenja/Kategorije troškova): koeficijenti po vrsti sati za radnika i klijenta, dnevni prag, lista praznika. Accept: samo admin; prazan koeficijent prikazan crveno.

## Phase 3 — Mesečni obračun i isplata

- [x] [build] *(opus)* Stranica „Nedeljni obračun" postaje „Mesečni obračun" (isti izgled, mesec umesto nedelje): kurs EUR/RSD, zaključavanje meseca, generisanje platnih listića preko `computeWorkerMonth` (sati delova nedelje se dele po mesecima), neto/bruto/porez/doprinosi/bruto 2, raspodela po projektima, odobravanje i „isplaćeno". Accept: zbir troška po projektima = zbir bruto 2; odobren obračun nepromenljiv (baza); bez kursa nema obračuna.
- [x] [build] Platni listić PDF (postojeći PDF stil iz satnica) i Excel spisak isplata za banku. Accept: iznosi isti kao u bazi; logo firme umesto Base44 slike.
- [x] [build] Podešavanja → „Podaci firme" (`company_settings`, D18): polja prazna dok ih Luka ne unese. Accept: operater ne može da menja; neispravan PIB odbijen (pgTAP 07).
- [ ] NEEDS-USER: logo i podaci firme (naziv, PIB, adresa) za platni listić i PDF satnice.
- [x] [build] *(opus)* P0 iz pregleda 14.11. veče: operater ne sme da menja tarife — `projects.assigned_employees`/`job_roles` b2c/b2b, `project_assignments` sa tarifom (radnik, projekat, pozicija, datumi, status, brisanje), `rates` FK `on delete restrict`; polja tarife na stranici projekta samo za admina. Accept: pgTAP — operater ne može ni jednim od tri puta da promeni tarifu koju baza bira pri odobravanju.
- [x] [build] *(opus)* P1 iz pregleda: `employment_history` menja samo admin; obračun odbija isplatu < 0 i bruto tarifu ispod minimalne osnovice (dok knjigovođa ne potvrdi pravilo); novi nalog je neaktivan osim prvog admina. Accept: pgTAP za sva tri; postojeći nalozi ne menjaju ulogu ni status.
- [x] [review] Pregled novčane logike, RLS-a i zaključavanja pre prve prave isplate. Accept: nalazi u `QA-FINDINGS.md`; nema otvorenih P0.

## Phase 4 — Profitabilnost

- [x] [build] Finansijski izveštaj projekta (`ProjectFinancialReport`): satnice po `project_id`, samo odobrene; **ostaje nama = prihod − trošak radnika − troškovi projekta**; za mesece sa obračunom trošak radnika = bruto 2 iz obračuna, za otvorene meseci procena označena kao „procena". Accept: brojke se slažu sa `projectMargin`; preimenovanje projekta ne menja brojke.
- [x] [build] Troškovi projekta u RSD dobijaju kurs i EUR iznos. Accept: zbir troškova u EUR uključuje RSD troškove preračunate po unetom kursu.
- [x] [build] Kontrolna tabla obračuna, Izveštaji o platama i Klijenti: po `project_id`/`client_id`, a ne po imenu; „Payroll Due" iz mesečnog obračuna. Accept: preimenovanje klijenta ne menja nijednu brojku.
- [x] [build] Izveštaji o platama: kartica sa platama čita stari nedeljni `PayrollRecord`; prebaciti na mesečni obračun (`payslips`). Accept: brojke iste kao na stranici Mesečni obračun za isti mesec.

## Phase 5 — Ostalo

- [x] [build] *(opus)* Podešavanja → „Korisnici": admin vidi naloge, aktivira/deaktivira i menja ulogu (admin/operater); poslednji aktivan admin ostaje zaštićen. Accept: pgTAP — operater ne može da menja naloge; deaktivacija poslednjeg admina odbijena.
- [x] [build] Sitnice iz pregleda: kartica „Čeka odobrenje" na kontrolnoj tabli prikazuje nedelju (`week_start`); spisak za banku upozorava na radnika bez JMBG-a; Email poruke uzimaju naziv firme iz „Podaci firme" umesto upisanog „Stelux". Accept: testovi za JMBG upozorenje i naziv firme.
- [ ] [build] Mejl obaveštenja: izabrati servis za slanje (npr. Resend) — do tada stranica jasno kaže da slanje nije podešeno. Accept: slanje radi ili jasna poruka, nikad tiho ništa.
- [x] [build] Konačno uklanjanje Base44 ostataka: `@base44/sdk`, `@base44/vite-plugin` iz package.json, folder `base44/`, `lib/app-params.js`, `pages/OAuthConsent.jsx`, Base44 logo URL, naslov „Base44 APP" u `index.html`. Accept: `grep -ri base44 src index.html package.json` vraća samo ime fajla sloja podataka; `npm run build` prolazi.

## Phase 6 — Opciono

- [ ] [build] Portal za radnike (telefon): vide svoje sate i isplate, samo čitanje. Accept: radnik vidi isključivo svoje podatke (RLS test).

## Phase 7 — Teamora spec v1.4

Izvor: klijentov „Teamora Master Development Specification v1.4" (23.11.2026), redosled §16. Stanje i dokazi: `IMPLEMENTATION-MATRIX.md` (ID-jevi u zagradi, npr. „4.3.1"). Testovi prihvatanja T01–T29 su iz §17: svaki `[build]` koji ga pominje dodaje imenovan test (`it("T07 …")` u `src/lib/payroll/*.test.js` ili `-- T07` u `supabase/tests/`), pa se pokrivenost proverava `grep -rn "T07" src supabase/tests`. Ne praviti paralelne module: dopunjavati postojeće (D12, spec „Obavezno pravilo").

### Urađeno u Teamora krugu (24.11.2026)

- [x] [build] Rebrend Teamora: logo, favicon, naslov, svetla tema sa ljubičastim tokenima (D23). Accept: `public/teamora-logo.png` i tokeni u `src/index.css`; `grep -ri base44 index.html` prazno; `npm run build` prolazi. (11.12, 15.07)
- [x] [build] Sidebar po slici 5 i gornja traka (pretraga, obaveštenja, korisnički meni), značka broja satnica na čekanju; Vendors = Handshake. Accept: `navConfig.js` koristi `Handshake`, `grep -rn Truck src` prazno. (11.03)
- [x] [build] Novi Main Dashboard (KPI, grafik, donut, top tabele, At a glance) iz `src/lib/payroll/dashboard.js`. Accept: brojevi samo iz odobrenih satnica; test u `payroll.test.js`/dashboard; operater ne vidi finansije. (3.0, 3.2.3–3.2.5, 3.3.1) Ostaje: filteri Project/Client/Status (3.1.1), klikabilne KPI kartice (N1).
- [x] [build] Vendor ID automatski `VEN-NNN` u bazi. Accept: pgTAP 12_vendor_id zelen; vrednost sa ekrana se ignoriše. (11.04)
- [x] [build] CSV uvoz zaposlenih i vendora uz preskakanje duplikata. Accept: `csvImport.test.js`, `csvEmployees.test.js`, `vendorImport.test.js` zeleni. (11.05)
- [x] [build] Jezik EN/RS/SK i valuta kao podešavanje cele aplikacije (samo admin). Accept: `app_settings` + pgTAP 12_podesavanja_aplikacije; `translations.test.js` zelen. (11.10, D24)
- [x] [build] Podrazumevane kategorije troškova (12/86) i uklonjena polja „Translation (Serbian)". Accept: pgTAP 13_podrazumevani_sifarnici; dugme „Restore default categories". (8.1.5, 11.09)
- [x] [build] Podrazumevani evropski praznici 2026–2027 i praznik vikendom (veći koeficijent). Accept: `europeanHolidays.test.js`, pgTAP 13 i 14; postojeći datum se ne prepisuje. (5.06, 5.07)
- [x] [build] Koeficijenti u procentima (100/150/200). Accept: `coefficientInput.test.js`; baza 0 < k ≤ 10. (5.05, D27)
- [x] [build] Company Details: ZIP i samo Tax ID (`pib` → `tax_id`). Accept: `companyDetails.test.js`, pgTAP 07. (11.11, D26)
- [x] [build] Adresa projekta Address/ZIP/City. Accept: `projectSite.test.js`; migracija `20261124120000`. (2.2.8)
- [x] [build] Bug satnice: Add Timesheet Row nudi radnika dodeljenog projektu; forma radnika bez satnica/Rate Basis/Work Fraction. Accept: `employeesForProject` test; `EmployeeFormFields.jsx` bez tih polja. (6.07, 5.11)

### Korak 0 — odluke (blokiraju zadatke koji ih diraju; vidi „Konflikti" u matrici)

- [ ] NEEDS-USER: K2/K1 — uloge Admin / Project Manager / HR / Finance umesto admin/operater i ko odobrava satnice (menja D3, D14, D16). Bez ovoga ne kreću zadaci označeni „(posle K2)".
- [ ] NEEDS-USER: K4/K5 — Payroll Cost na projektu: spec (sati × B2C × koeficijent) ili postojeći bruto 2 po srpskim propisima (D7, D8, D17, D20); i šta posle uklanjanja satnice / Rate Basis / Work Fraction iz forme radnika (D4 nivo „profil", D17 provere).
- [ ] NEEDS-USER: K3 — valute: potvrditi „tarife i obračun samo EUR, troškovi sa kursom i datumom kursa" ili tražiti multi-valutu (D2).
- [ ] NEEDS-USER: K6/K12 — vrsta sata po najvišem koeficijentu umesto prioriteta (D5) i tarifa po danu rada umesto po nedelji (D16); K11 — obavezan razlog pri vraćanju odobrene satnice (D10); K7 — potvrditi D13 (bez Base44 prenosa); K9/K10 — upisati izmene D12 i D18 posle Teamora redizajna.

### Korak 1 — zajednički model, ID veze, Assignments, Rate History, koeficijenti

- [ ] [build] *(opus)* Jedan izvor dodela (2.3.2): migracija prebacuje svaki element `projects.assigned_employees` u red `project_assignments` (radnik, projekat, pozicija, datumi), a njegove b2c/b2b u `rates` (`scope='assignment'`, `effective_from` = početak dodele); `ProjectEmployees.jsx` i Satnice čitaju/pišu `project_assignments`. `rates.js` + `resolve_timesheet_rate` bez nivoa `project_employee`. Accept: pgTAP — posle migracije svaka odobrena satnica i obračun imaju iste iznose kao pre (D10); dodela dodata na kartici projekta vidi se u `/rates` i obrnuto; Add Timesheet Row nudi tog radnika; `npm run build && npm test && npm run test:db` zeleno.
- [ ] [build] *(opus)* Baza odbija preklapajuće tarife istog nivoa (5.03): exclusion constraint na `rates` po (scope, kind, employee/project/position/assignment) × `daterange(effective_from, effective_to)` za `status='active'`. Accept: pgTAP — druga tarifa koja preklapa interval odbijena, susedna (sledeći dan) prima; postojeći test 04 zelen.
- [ ] [build] Rate History (5.02): izmena reda u `rates` ne prepisuje iznos — UI „Promeni od datuma" zatvara stari red (`effective_to` = dan pre) i pravi novi. Accept: test u `payroll.test.js` „T07 — tarifa od 15." (posle K12: dani pre 15. stara, od 15. nova tarifa); pgTAP — odobrena satnica pre promene ima isti `rate_snapshot`.
- [x] [build] *(opus)* (posle K6) Vrsta sata po najvišem koeficijentu (5.07) u `classifyWeek` i `guard_timesheet` istovremeno, primer u `payroll.test.js` i pgTAP 03. Accept: „T08" — praznik u subotu sa vikend 200% i praznik 150% daje 200%, bez sabiranja; dva iznosa (radnik i klijent) tačna na cent. — urađeno 24.11.2026 (Teamora krug): migracija `20261124150000_praznik_vikendom.sql`, D29, pgTAP 14.
- [x] [build] Upozorenje B2C > B2B (5.09) na Tarifama, kartici projekta i dodeli, bez izmene tarife. Accept: čista funkcija `negativeMargin(b2c, b2b)` sa testom; upozorenje vidljivo u pregledaču; tarife se ne menjaju. (Ako je paralelni agent završio u ovom krugu — samo štiklirati posle provere.) — urađeno 24.11.2026 (Teamora krug): `NegativeMarginNote.jsx`, `projectSite.negativeLabourMargin` + test; ekran Tarife (RateDialog) nije pokriven.
- [ ] [build] Kategorije troškova po ID-u (8.1.4/11.08): `project_costs.cost_category_id` (FK) + snimak imena; postojeći redovi se povezuju po imenu. Accept: pgTAP — preimenovanje kategorije ne menja zbir po kategoriji; trošak sa nepostojećom potkategorijom odbijen kad kategorija ima potkategorije.

### Korak 2 — Project Assignments A1 i Quick Insights

- [ ] [build] Preimenovati „Rates & Assignments" u „Project Assignments" (meni, naslov, prevodi EN/RS/SK); tarife ostaju kao kartica „Rate History". Accept: `grep -rn "Rates & Assignments" src` prazno osim prevoda starog ključa; ruta `/rates` i dalje radi.
- [ ] [build] Izvedeni status dodele (4.4.1): čista funkcija `assignmentStatus(a, today)` → Completed / Upcoming / Ending Soon (≤30 dana) / Active, međusobno isključivi. Accept: testovi za sve granice (danas = start, danas = end, end za 30 i 31 dan, bez end).
- [ ] [build] Tabela dodela A1 (4.1.2–4.1.4): kolone Employee (+ID), Project, Client, Job Role, B2C, B2B (+valuta), Start, End, Status, Actions; pretraga; filteri Project/Client/Role/Status/Date Range; brzi režimi Active / All; sort; paginacija 10/25/50. B2C/B2B kolone samo za admina. Accept: u pregledaču filter po klijentu smanjuje tabelu; operater ne vidi B2C/B2B.
- [ ] [build] KPI kartice dodela (4.2): Total Assignments, Active Workers (jedinstveni radnici), Active Projects, Expiring This Month — čiste funkcije nad istim filtriranim skupom kao tabela. Accept: test „T01 — radnik na dva projekta = 2 reda, 1 Active Worker"; test da Expiring This Month ≠ Ending Soon.
- [ ] [build] Quick Insights (4.3.1, 4.3.2, 4.3.4): donut po statusu (klik postavlja filter), bar po projektu (klik otvara projekat, View all filtrira), Ending Soon (30 dana). Accept: test „T03 — procenti zbir 100%"; u pregledaču klik na segment filtrira tabelu („T04").
- [ ] [build] Izvoz dodela CSV/Excel i PDF (4.1.6) iz istog filtriranog i sortiranog skupa (ne samo trenutna stranica); B2C kolona samo uz pravo. Accept: test „T02 — CSV redovi = filtrirani skup", „T26 — operater: izvoz bez B2C kolone".

### Korak 3 — Timesheets approval, obračun i Payroll sa stvarnim isplatama

- [ ] [build] *(opus)* Provera preklapanja sati preko projekata (6.03): zbir sati radnika po danu preko svih satnica ≤ 24 i ≤ pravila iz `work_rules` (novo polje `max_daily_hours`), u bazi i u formi. Accept: pgTAP „T10" — dva projekta isti dan 4 h + 4 h prolazi, 14 h + 12 h odbijeno.
- [ ] [build] *(opus)* (posle K11) Korekcija odobrene satnice (6.05): vraćanje u nacrt traži razlog; upis u audit (`audit_log`, vidi korak 9). Accept: pgTAP — vraćanje bez razloga odbijeno; sa razlogom postoji audit red sa korisnikom i vremenom.
- [ ] [build] *(opus)* Payable + Payment model (7.02–7.04): tabele `payables` (iz odobrenog `payroll_runs`/`payslips`: iznos, valuta, primalac radnik ili Vendor, due date) i `payments` (datum, iznos, valuta, referenca, opis, `created_by`); Remaining i status Unpaid/Partially Paid/Paid računa `src/lib/payroll/payables.js`. Samo admin/Finance (RLS). Accept: `payroll.test.js` „T11 — 1000 − 300 − 200 = 500, Partially Paid"; pgTAP — preplata i isti payment na dve obaveze odbijeni.
- [ ] [build] *(opus)* Primalac obaveze Vendor (7.01): obaveza za radnika podizvođača ide na Vendor iz angažmana, sa razradom po radniku. Accept: test „T12 — dva radnika istog vendora = jedna obaveza vendoru, dve stavke"; listić radnika postoji.
- [ ] [build] Ekran isplata na Mesečnom obračunu: Calculated, Paid, Remaining, Due, status; unos delimične isplate; filteri po periodu/radniku/vendoru/statusu/dospelosti i Excel izvoz. Accept: u pregledaču dve delimične isplate menjaju Remaining tačno; „Payroll Due" na tabli = zbir Remaining.

### Korak 4 — Project Costs C1 i Financial Report

- [ ] [build] `project_costs.cost_date` (obavezno, postojeći redovi = `created_date`), opciono `employee_id`/`vendor_id`, `billable` (bool), `receipt_url` (privatni bucket). Accept: pgTAP — trošak bez datuma odbijen; operater i dalje nema pristup (RLS D3); `npm run gen:schema`.
- [ ] [build] Kartica „Costs" u projektu (8.1.1): uključiti postojeći `ProjectCosts.jsx` u `ProjectDetail.jsx`, dopuniti Edit, Date kolonu, filtere kategorija/potkategorija/datum, CSV izvoz; projekat automatski. Accept: test/pregledač „T13 — trošak dodat u projektu postoji jednom u `/project-costs`"; zbir kartice = zbir centralnog pregleda filtriranog na projekat.
- [ ] [build] Financial Report koristi `cost_date` i prikazuje troškove po mesecu (8.1.6). Accept: `projectReport.test.js` „T14 — trošak sa kategorijom i radnikom ulazi jednom u profit".

### Korak 5 — Project Assignments A2 i Project Costs C2

- [ ] [build] *(opus)* Add/Edit Assignment sa B2C i posebnom B2B tarifom od efektivnog datuma (4.5.1, 4.5.3); provera da se dodele istog radnika ne preklapaju u vremenu na istom projektu. Accept: pgTAP — preklapajuća dodela odbijena; „T06" — A2 akcije rade, nijedno dugme bez funkcije.
- [ ] [build] *(opus)* End Assignment i Reassign (4.5.2, 4.5.4): End postavlja `end_date`; Transfer zatvara staru i pravi novu dodelu; Additional pravi dodatnu. Sati ostaju vezani za staru dodelu. Accept: pgTAP — posle Transfera broj satnica i iznosi stare dodele isti.
- [ ] [build] Centralna tabela troškova C2 (8.2.1–8.2.2): kolone Date, Project, Category, Subcategory, Description, Amount, Currency, Worker/Vendor, Billable, Actions; filteri Project/Client/Category/Subcategory/Date; sort; izvoz Excel/CSV/PDF filtriranog skupa; analitika po kategoriji. Accept: test — zbir izvoza = zbir ekrana; „T28 — RSD bez kursa nije u EUR zbiru".
- [ ] [build] Billable trošak je samo oznaka (8.2.4): ne ulazi u prihod nigde. Accept: test „T15 — billable trošak ne menja Labor Revenue ni Net Profit dvaput".

### Korak 6 — Billing Overview (bez faktura) i Financial Reports

- [ ] [build] *(opus)* `billing_summaries` (klijent, projekat, period, iznos iz `src/lib/payroll`, valuta, status In Preparation / Ready for Accounting / Sent to Accounting / Invoiced Externally sa `status_changed_by/at`) + opciona ručna polja eksternog računa (referenca, datum, iznos, valuta, dospeće). Accept: pgTAP — promena statusa beleži korisnika i vreme; ne postoji kolona/funkcija za broj fakture koji generiše sistem („T29").
- [ ] [build] *(opus)* `client_payments` (datum, iznos, valuta, referenca, klijent/projekat/period, opciona eksterna referenca) i `src/lib/payroll/billing.js`: Outstanding = eksterno fakturisano − uplate; bez eksternog iznosa „Estimated Unpaid". Accept: test „T16 — račun 1000, uplate 400 + 300 → Outstanding 300, Partially Paid".
- [ ] [build] Stranica „Clients / Billing Overview" (zamenjuje sadržaj `Clients.jsx`, isti stil): B2B obračun po klijentu/projektu/periodu, razrada po radniku/ulozi, Billable troškovi odvojeno, izvoz CSV/Excel/PDF obračuna. Accept: zbir ekrana = zbir izvoza; nema dugmeta za izradu/slanje fakture.
- [ ] [build] Financial Reports (10.01–10.03): Labor Revenue, Payroll Cost, Labor Margin, Net Project Profit, Profit Margin % (samo kad prihod > 0) po formulama spec-a (posle K4), odvojeno od fakturisanog/uplaćenog/isplaćenog; filteri; izvoz PDF i CSV. Accept: `projectReport.test.js` — formule na ručnom primeru 8 × 45 = 360 / 8 × 50 = 400; Profit Margin null kad je prihod 0.

### Korak 7 — Project Onboarding, preview, ZIP, prava

- [ ] [build] `documents.issue_date` + tip dokumenta kao šifarnik; `required_documents` (projekat, opciono Job Role, tip, obavezno, minimalno važenje, `exportable`). Accept: pgTAP — zahtev za ulogu se ne primenjuje na drugu ulogu.
- [ ] [build] `src/lib/onboarding.js`: status zahteva Available / Missing / Expired / Expiring Soon / Not Permitted to Export za radnika × dodelu × planirani period; radnik Ready / Action Required sa razlozima. Accept: test „T18 — Welder bez sertifikata = Missing; Fitter Ready".
- [ ] [build] Kartica „Onboarding" u projektu: zahtevi, status po radniku, preview paketa (projekat, radnici, dokumenti, istek, nedostaci, zabrane). Incomplete paket ne može Ready. Accept: u pregledaču nedostatak je vidljiv; dugme Ready onemogućeno za Incomplete.
- [ ] [build] *(opus)* (posle K2) ZIP preko Supabase Edge funkcije: proverava pravo korisnika po dokumentu, pakuje samo dozvoljene, upisuje audit (ko, kada, projekat, radnici, dokumenti). `documents` i Storage čitanje ograničiti po pravu. Accept: pgTAP/integracioni test „T19 — korisnik bez prava ne dobija osetljiv fajl ni direktnim pozivom (403)"; audit red postoji posle preuzimanja.

### Korak 8 — Workforce Planning, Gantt, requirements, odsustva i zamene

- [ ] [build] `workforce_requirements` (projekat, Job Role, datum, smena, potreban broj) i `schedules.project_id` + `assignment_id`. Accept: pgTAP — dva zahteva za isti projekat/ulogu/datum/smenu odbijena; `npm run gen:schema`.
- [ ] [build] `src/lib/workforce.js`: Coverage = dostupni kvalifikovani (dodela, raspored, bez odsustva) − potrebno, po datumu i smeni. Accept: test „T20 — promena potrebnog broja menja deficit"; „T05 — radnik sa dodelom ali slobodnom smenom je dostupan".
- [ ] [build] Stranica Projects → Workforce Planning i kartica projekta „Workforce Plan": Gantt po projektu i ulozi, dan/nedelja/mesec, statusi Assigned/Available/Standby/Leave/Sick/Other/Replacement, tabela deficita i viška. Accept: u pregledaču izmena zahteva odmah menja deficit u tabeli i na Gantt-u.
- [ ] [build] Leave Request simulacija kapaciteta (14.1.1–14.1.2): pre odobravanja prikaz projekta, pozicije, dana/smene, potrebno, dostupno, deficit. Accept: test „T21 — odsustvo jednog od dva potrebna daje deficit 1 za tu ulogu/smenu".
- [ ] [build] *(opus)* (posle K2) Odobravanje odmora uprkos deficitu (14.1.3): samo pravo `approve_leave_with_shortage`, obavezan razlog, audit (ko, kada, zašto) — u bazi. Accept: pgTAP „T24".
- [ ] [build] Smart Replacement (14.2): kandidati po redosledu kriterijuma (uloga, raspoloživost, sertifikati, onboarding, lokacija, B2C), kategorije Full Match / Partial Availability / Transfer Required / Not Eligible sa objašnjenjem. Accept: test „T22 — delimično dostupan = Partial"; „T23 — transfer pokazuje deficit izvornog projekta".
- [ ] [build] Assign Replacement pravi privremenu dodelu (po datumu/smeni) tek posle potvrde ovlašćenog korisnika; osvežava Gantt/Coverage/Onboarding. Accept: u pregledaču posle potvrde deficit = 0; bez potvrde nema nove dodele.

### Korak 9 — Main Dashboard, notifikacije, prava, završni QA

- [ ] [build] *(opus)* Audit trail (2.3.4, 15.04): `audit_log` (tabela, id zapisa, akcija, stare/nove vrednosti, korisnik, vreme) preko triggera za `project_assignments`, `rates`, `timesheets`, `leave_requests`, `documents`, `billing_summaries`, `client_payments`, `payments`, `project_costs`; samo čitanje za admina, niko ne briše. Accept: pgTAP — izmena svake od tabela pravi audit red; `delete from audit_log` odbijen.
- [ ] [build] *(opus)* (posle K2) Uloge i prava: Admin / Project Manager / HR / Finance + opciono ograničenje po projektu; RLS i `src/lib/access.js` po pravima; B2C snimci satnica (`timesheets.b2c_rate`, `worker_cost`) skriveni bez finansijskog prava (rešava D3 „svesno ograničenje"). Accept: pgTAP po ulozi; „T26 — HR ne čita `worker_cost` ni kroz API ni u izvozu".
- [ ] [build] Main Dashboard KPI po §3.2 nad istim funkcijama kao moduli: Active Workers (iz dodela), Active Projects, Approved Hours, B2B Revenue, Payroll Cost, Additional Costs, Project Profit (sa troškovima), Client Unpaid i Payables odvojeno; filteri period/Project/Client; klik vodi na filtriranu listu. Accept: test „T27 — KPI = zbir izvornog modula za isti period"; „T17 — profit, fakturisano, uplaćeno i isplaćeno su četiri različite vrednosti".
- [ ] [build] Action Center i Quick Links (3.3.3–3.3.4) po pravima. Accept: korisnik bez prava ne vidi akciju; svaka stavka vodi na filtriranu listu.
- [ ] [build] Generisane notifikacije (15.01): odmor na čekanju, novi deficit, kandidat za zamenu, dokument ističe, dodela ističe, timesheet na odobrenju, dospele obaveze/potraživanja — bez duplikata. Accept: test generatora; ponovno pokretanje ne pravi drugi isti zapis.
- [ ] [review] Završni QA po spec-u v1.4: svih 29 scenarija T01–T29 i regresija Phase 0–6. Accept: `QA-FINDINGS.md` sekcija sa statusom svakog T-a; `IMPLEMENTATION-MATRIX.md` ažuriran; nema otvorenih P0.
- [ ] [content] Kratka uputstva (§18): Assignments, Timesheet Approval, Payroll Payment, Billing Overview / Client Payments, Onboarding ZIP, Leave & Replacement, Dashboard. Accept: po jedan odeljak u `OPIS-APLIKACIJE.md`, sa stvarnim nazivima ekrana.
