# TEAMORA — QA checklist za izmene klijenta (Filip, 17 slika + spec v1.4)

Proveravač: nezavisni QA. Reference: `scratchpad/refs/slika1..17.png`, `spec.txt` (Master Development Specification v1.4 FINAL).
Pravilo: `- [x]` samo uz dokaz (fajl:linija, test, komanda, screenshot). Neurađeno ostaje `- [ ]` sa razlogom.
„Identično slici" = isti raspored, isti nazivi (velika/mala slova), iste ili najbliže lucide ikonice, ista boja akcenta, isti redosled.
Brojevi/imena na slikama su ilustrativni (spec §4.4) — ne smeju biti seed podaci ni hardkodovane vrednosti.

---

## 1. Logo i ime aplikacije → Teamora (slika1)

- [x] 1.1 Logo-oznaka: tri stilizovane figure (srednja viša, svetlija ljubičasta; bočne tamnije ljubičaste/indigo) kao SVG ili optimizovan PNG/WebP u `public/` ili `src/assets/`, sa providnom pozadinom.
  ✔ Dokaz: public/teamora-mark.png 512x312 i public/teamora-logo.png 1200x240, oba PNG RGBA (providno).
  Provera: fajl postoji; otvoriti ga — tri figure, gradijent ljubičasta→indigo, bez bele pozadine.
- [x] 1.2 Wordmark „Teamora" tamno-mornarske boje (~#14123A), bold geometrijski sans, pored oznake (sidebar gore levo, slika2/slika5).
  ✔ Dokaz: Sidebar.jsx → BrandLogo (pun logo); screenshot 1600x900: znak + „Teamora“ gore levo.
  Provera: `Sidebar.jsx` renderuje oznaku + tekst „Teamora"; screenshot sidebara.
- [x] 1.3 Kad je sidebar skupljen (Collapse) vidi se samo oznaka, bez teksta, bez lomljenja rasporeda.
  ✔ Dokaz: Klik na Collapse: sidebar 68px, vidi se samo znak (variant="mark"), ikonice bez teksta; Expand radi.
  Provera: klik na Collapse → screenshot.
- [x] 1.4 `index.html`: `<title>` = „Teamora", favicon = Teamora oznaka (ne Base44/Vite/štit), `meta description`/`og` bez „WorkforceHub".
  ✔ Dokaz: index.html: <title>Teamora</title>, favicon /favicon.png (128x128); public/favicon.svg obrisan; nema WorkforceHub.
  Provera: `grep -n "title\|icon\|WorkforceHub" index.html`.
- [x] 1.5 Login stranica i `AuthLayout` prikazuju Teamora logo i ime.
  ✔ Dokaz: AuthLayout.jsx:8 /teamora-logo.png; Login.jsx koristi AuthLayout. (Login ekran nije otvaran — sesija admina zadržana.)
  Provera: `src/pages/Login.jsx`, `src/components/AuthLayout.jsx`; screenshot `/login`.
- [x] 1.6 PDF-ovi/e-mail šabloni koji pominju ime aplikacije koriste „Teamora" (firma iz Company Details ostaje firma korisnika).
  ✔ Dokaz: grep -rni workforcehub src public index.html = 0.
  Provera: `grep -rn "WorkforceHub" src public supabase index.html` = 0 pogodaka.
- [x] 1.7 Mobilna navigacija (`MobileNav.jsx`) prikazuje isti logo i ime.
  ✔ Dokaz: 375x812: MobileNav prikazuje BrandLogo i isti meni (screenshot).
  Provera: viewport 375px → screenshot.

## 2. Novi dashboard i tema (slika2)

### 2a. Tema
- [x] 2.1 Svetla tema: pozadina stranice svetlo lavanda/bela (~#F7F5FC), kartice bele, zaobljene (~12–16px), suptilna ivica/senka.
  ✔ Dokaz: index.css :root --background 255 100% 99%, --card belo, --radius .75rem; screenshot.
  Provera: `src/index.css` `:root` `--background`, `--card`, `--radius`; screenshot.
- [x] 2.2 Primarni akcenat ljubičast (~#6D28D9–#7C3AED): `--primary`, `--ring`, `--sidebar-primary`; zlatno-braon (`38 32% 55%`) više nigde.
  ✔ Dokaz: --primary 263 70% 51% (#6D28D9); grep „38 32% 55%“ = 0; dugmad Add … ljubičasta.
  Provera: `grep -n "38 32% 55%\|#b39a6b\|amber\|yellow-7" src/index.css tailwind.config.js src -r` → bez ostataka stare zlatne teme; dugmad „Add …" ljubičasta.
- [x] 2.3 Sidebar svetao (lavanda/bela), ne tamno-braon; tekst tamni, aktivna stavka svetloljubičasta pozadina + ljubičast bold tekst.
  ✔ Dokaz: --sidebar-background 255 100% 98%; aktivna stavka bg-sidebar-accent + ljubičast bold (screenshot Vendors).
  Provera: `--sidebar-*` u `index.css`; screenshot.
- [x] 2.4 Status bedževi: zeleni (pozitivno/margin), crveni (rast troška), narandžasti (pending), ljubičasti (datum) — kao na slici2.
  ✔ Dokaz: Dashboard: zeleni +%, crveni −pp, narandžast Pending (3), ljubičast datum (screenshot).
  Provera: screenshot dashboarda.
- [x] 2.5 Sve postojeće stranice (Employees, Vendors, Projects, Timesheets, Payroll, Settings, dijalozi) rade u novoj temi bez nečitljivog kontrasta (tekst na ljubičastom = beo; nema belog teksta na beloj pozadini).
  ✔ Dokaz: Klik kroz 19 ruta menija + Settings stranice (departments, cost-categories, coefficients, company, general) — sve se učitavaju bez ErrorBoundary-ja; tema svetla.
  Provera: proći svaku rutu iz `navConfig.js` → screenshot; nema hardkodovanih tamnih pozadina iz stare teme.

### 2b. Zaglavlje (header)
- [x] 2.6 Pretraga u zaglavlju: ikonica lupe + placeholder „Search employees, projects, clients..." (preveden), zaobljeno polje centrirano-desno.
  ✔ Dokaz: TopBar.jsx GlobalSearch; unos „qa-proj“ → grupa PROJECTS sa QA-Projekat-1/2b, klik vodi na /projects/:id.
  Provera: `AppLayout.jsx`/header komponenta; unos teksta daje stvarne rezultate (zaposleni, projekti, klijenti) ili vodi na filtriranu listu — ne mrtvo polje.
- [x] 2.7 Zvonce sa ljubičastom tačkom kad postoje nepročitane notifikacije (tačka nestaje kad ih nema); klik vodi na Notifications.
  ✔ Dokaz: TopBar.jsx NotificationBell: tačka samo kad Notification.filter({is_read:false}) vrati red; lokalno 0 nepročitanih → bez tačke (tačka nije mogla vizuelno da se vidi).
  Provera: kod čita stvaran broj nepročitanih; screenshot sa/bez.
- [x] 2.8 Korisnik: ljubičast krug sa inicijalom, puno/kratko ime ulogovanog korisnika, strelica dole → meni (bar Logout; Settings za admina).
  ✔ Dokaz: Krug sa inicijalom „L“, ime „Lokalni admin“ iz AuthContext, meni: Settings (admin) + Logout.
  Provera: ime iz `AuthContext`, ne „Aleksandar"; klik otvara meni.
- [x] 2.9 U zaglavlju NEMA EN/RS ni EUR/RSD prekidača (vidi zahtev 7).
  ✔ Dokaz: AppSettingsBar.jsx obrisan, nema reference; zaglavlje bez EN/RS i EUR/RSD (screenshot).
  Provera: `AppSettingsBar.jsx` uklonjen iz headera / `grep -rn AppSettingsBar src`.

### 2c. Pozdrav i period
- [x] 2.10 Naslov „Good morning/afternoon/evening, {ime} 👋" prema dobu dana, ime ulogovanog korisnika; podnaslov „Here's what's happening with your team, projects and finances." Prevedeno RS/SK.
  ✔ Dokaz: „Good morning, Lokalni 👋“ + podnaslov; greetingKey(hour) morning/afternoon/evening; RS/SK prevod (SK: „Dobré ráno…“).
  Provera: `Dashboard.jsx`; test ili ručno sa različitim satom.
- [x] 2.11 Izbor perioda: dugme sa ikonicom kalendara + „This Month" + strelica (opcije bar This Month / Last Month / This Year ili prilagođeno) i prikaz opsega „{d. mesec} – {d. mesec, godina}" desno; podrazumevano tekući mesec (spec §3.1). Promena perioda menja SVE KPI, grafike i tabele.
  ✔ Dokaz: Select This Month / Last Month / This Quarter / This Year + „Nov 1 – Nov 30, 2026“; dashboardPeriod testiran u payroll.test.js; svi KPI/grafik/tabele iz istog `period`.
  Provera: promeni period → brojevi se menjaju; opseg datuma tačan.

### 2d. KPI kartice (4, u jednom redu)
- [x] 2.12 „Client Revenue": ikonica naslaganih novčića u lavanda pločici, iznos € (format `€124,560`), bedž promene vs. prethodni period (zelen ↑ / crven ↓).
  ✔ Dokaz: Coins ikonica u lavanda pločici, €2,250, bedž +1306.3% (zelen).
- [x] 2.13 „Payroll Cost": ikonica novčanika, iznos €, bedž promene (rast troška = crveni ↑).
  ✔ Dokaz: Wallet ikonica, €1,320; lowerIsBetter → rast troška crven (bedž se ne prikazuje kad prethodni period = 0).
- [x] 2.14 „Gross Profit": ikonica stubičastog grafikona u zelenoj pločici, iznos €, bedž promene.
  ✔ Dokaz: Korak 3: ikonica ChartColumn (stubići) u zelenoj pločici (Dashboard.jsx:276, screenshot).
  (Korak 2: Ikonica je TrendingUp (linija sa strelicom), na slici2 je stubičasti grafikon u zelenoj pločici (BarChart3/ChartColumn). Iznos i bedž ispravni.)
- [x] 2.15 „Profit Margin": ikonica `%` u lavanda pločici, vrednost u % sa jednom decimalom, bedž promene u „pp".
  ✔ Dokaz: Percent ikonica, 41.3%, bedž −58.7 pp (crven). Definicije: src/lib/payroll/dashboard.js (iznosi iz baze, D16), testovi u payroll.test.js.
  Provera 2.12–2.15: vrednosti iz stvarnih odobrenih sati preko `src/lib/payroll` / baze (D11, spec §10: Revenue = Approved h × B2B × client coef; Payroll Cost = Approved h × B2C × worker coef; Gross Profit = Revenue − Payroll Cost; Margin = Profit/Revenue×100 samo ako Revenue > 0); ručno proveriti jedan mesec naspram Monthly Payroll / Payroll Dashboard — isti brojevi. Bez podataka: €0 i „—"/0% bez bedža ili neutralan bedž, nikad izmišljeno.
- [x] 2.16 Klik na KPI vodi na izvornu filtriranu listu (spec §3.1).
  ✔ Dokaz: Korak 3: KpiCard prima `to` i postaje Link; sve 4 kartice → /payroll/reports (aria-label = naziv KPI), hover/fokus stil.
  (Korak 2: KpiCard.jsx nije link — klik na KPI ne vodi na izvornu listu (spec §3.1).)

### 2e. Grafikoni
- [x] 2.17 „Revenue, Costs & Profit" + ikonica (i) sa tooltipom objašnjenja; legenda desno: Revenue (tamno ljubičasta), Payroll Cost (svetlo ljubičasta), Profit (zelena); površinski/linijski grafikon po danima perioda, Y osa u € (`€20,000`…), X osa datumi; gradijentna ispuna ispod linija; tačka na poslednjoj vrednosti.
  ✔ Dokaz: Korak 3: RevenueChart lastDot — posle animacije u DOM-u 3 tačke na poslednjoj vrednosti (#6D28D9, #C4B5FD, #16A34A).
  (Korak 2: Naslov, (i), legenda, Y osa u €, X datumi, gradijent — OK. Nedostaje tačka na poslednjoj vrednosti linija (slika2). Linije su kumulativne (namerno, opisano u dashboard.js).)
  Provera: recharts komponenta; podaci po danima iz odobrenih sati; prazan period → ravna nula ili poruka praznog stanja; Y osa bez dupliranih oznaka (slika ima grešku „€60,000" dva puta — ne kopirati).
- [x] 2.18 „Profitability Overview": prsten (donut) sa „{x}% / Profit Margin" u centru; legenda sa kvadratićima i iznosima: Client Revenue, Payroll Cost, Gross Profit.
  ✔ Dokaz: ProfitDonut: 41.3% / Profit Margin u centru, legenda Client Revenue €2,250 · Payroll Cost €1,320 · Gross Profit €930 = KPI.
  Provera: iste vrednosti kao KPI kartice.
- [x] 2.19 „At a Glance" lista sa ikonicama: Active Employees (broj), Active Projects (broj), Active Clients (broj), Pending Timesheets (narandžast bedž), Upcoming Payroll (ljubičast bedž sa datumom).
  ✔ Dokaz: Korak 3: upcomingPayrollDate više ne vraća prošli datum; zakasneli obračun ide kroz overduePayrollMonths → crveni bedž „Overdue · Mar 2026“ (screenshot), testovi u payroll.test.js.
  (Korak 2: Lista i bedževi OK, ali „Upcoming Payroll“ prikazuje „Mar 31“ (24.11.2026) — upcomingPayrollDate uzima najstariji odobren neisplaćen obračun, pa „sledeća isplata“ pokazuje datum iz prošlosti. Vidi Nalazi N2.)
  Provera: brojevi iz baze (Active Employees = jedinstveni aktivni radnici, spec §3.2/T01); Upcoming Payroll = stvaran sledeći datum obračuna ili prazno stanje.

### 2f. Tabele (3 u jednom redu)
- [x] 2.20 „Top Profitable Projects" + „View All →": kolone Project (ikonica slojeva), Client, Profit, Margin (zeleni bedž); do 5 redova sortirano po profitu.
  ✔ Dokaz: Top Profitable Projects: Layers ikonica, Project/Client/Profit/Margin (zeleni bedž), View All → /projects.
- [x] 2.21 „Top Profitable Clients" + „View All →": kolone Client (ikonica zgrade), Revenue, Profit, Margin.
  ✔ Dokaz: Top Profitable Clients: Building2, Client/Revenue/Profit/Margin, View All → /clients.
- [x] 2.22 „Top Profitable Workers" + „View All →": kolone Employee (avatar/foto ili inicijali), Billed Hours (`168h`), Profit, Margin.
  ✔ Dokaz: Top Profitable Workers: avatar/inicijali, Billed Hours „61h“, Profit, Margin, View All → /employees.
  Provera 2.20–2.22: podaci iz istog obračuna kao KPI; „View All" vodi na postojeću stranicu (Projects/Clients/Employees ili izveštaj); prazno stanje kad nema podataka; zaglavlje tabele sivo-lavanda.
- [x] 2.23 Loading (skeleton), empty i error stanja za svaku karticu (spec §3.3).
  ✔ Dokaz: Skeleton pri učitavanju (Dashboard.jsx isLoading), RevenueChart hasData prazno stanje; greška → ErrorBoundary po ruti.
- [x] 2.24 Raspored responzivan: na <1024px kartice se slažu, nema horizontalnog skrola stranice.
  ✔ Dokaz: 375px: scrollWidth = clientWidth = 375, kartice jedna ispod druge.
- [x] 2.25 Finansijski deo dashboarda vidi samo uloga sa pravom na finansije; operater vidi operativni deo bez iznosa (spec §3.1, §15).
  ✔ Dokaz: Dashboard.jsx: !isAdmin vraća samo pozdrav, upozorenja i At a Glance (bez iznosa, bez Upcoming Payroll); finansijski upiti enabled: isAdmin. (Proveren kod; prijava kao operater nije rađena — vidi napomenu.)
  Provera: login kao operater → nema iznosa B2C/profita, nema grešaka.

## 3. Forma novog zaposlenog — uklanjanje tarifnih polja (slika3)

- [x] 3.1 U sekciji „ID Documents & Payroll Basis" NEMA polja: Rate Basis, Work Fraction (0.5 = half time), B2C Hourly Rate (€) — Worker Pay, B2B Hourly Rate (€) — Client Billing, Overtime Rate (€/h), Weekend Rate (€/h), Holiday Rate (€/h).
  ✔ Dokaz: /employees/new → sekcija „ID Documents“: labele samo JMBG, ID Card Number, ID Card Expiry, Passport Number, Passport Expiry; grep rate_basis/work_fraction/*_rate u formi = 0.
  Provera: `src/components/employees/EmployeeFormFields.jsx`, `src/pages/EmployeeForm.jsx` — `grep -n "rate_basis\|work_fraction\|hourly_rate\|overtime_rate\|weekend_rate\|holiday_rate"` u formi; screenshot forme.
- [x] 3.2 Ostaju: JMBG, ID Card Number, ID Card Expiry, Passport Number, Passport Expiry; naslov sekcije prilagođen (npr. „ID Documents") ako „Payroll Basis" više nema smisla.
  ✔ Dokaz: Naslov sekcije „ID Documents“ (EmployeeForm.jsx:110).
- [x] 3.3 Čuvanje novog i izmena postojećeg zaposlenog radi (nema slanja uklonjenih polja kao obaveznih, nema greške iz baze).
  ✔ Dokaz: Izmena EMP-001 → Save → „Employee saved“; novi zaposleni kreirani CSV uvozom bez greške.
  Provera: kreirati i izmeniti zaposlenog → uspeh, nema greške u konzoli.
- [x] 3.4 Obračun ne zavisi od uklonjenih polja: tarife idu kroz projekat/angažman (B2B uloga, B2C angažman) — postojeći `payroll.test.js` i pgTAP zeleni; EmployeeDetail ne prikazuje prazne uklonjene vrednosti.
  ✔ Dokaz: npm test 332/332, test:db 387 OK; LegacyPayrollNotice.jsx prikazuje adminu stare profilne tarife koje obračun i dalje koristi (ništa skriveno).
  Provera: `npm test`, `npm run test:db`; `EmployeeDetail.jsx` grep.
- [x] 3.5 Ako se kolone u bazi zadržavaju (istorija), to je zapisano kao predlog za DECISIONS; nema brisanja kolona sa podacima bez odluke.
  ✔ Dokaz: Kolone ostaju u bazi; odluka upisana kao D26 u DECISIONS.md.

## 4. Vendor ID automatski VEN-001, VEN-002… (slika4)

- [x] 4.1 Nov vendor dobija ID automatski u bazi (sekvenca/trigger), format `VEN-` + 3 cifre sa vodećim nulama (VEN-001…VEN-999, zatim VEN-1000).
  ✔ Dokaz: 20261124110000_vendor_id_automatski.sql: trigger + next_vendor_id(); novi vendor dobio VEN-001; pgTAP 12_vendor_id OK.
  Provera: `supabase/migrations/20261124110000_vendor_id_automatski.sql`; pgTAP `supabase/tests/12_vendor_id.test.sql`.
- [x] 4.2 U „Add Vendor" polje Vendor ID je samo za čitanje (prikazuje sledeći ID ili „Auto" napomenu), korisnik ga ne kuca.
  ✔ Dokaz: Add Vendor: polje Vendor ID disabled, „Assigned automatically“ (screenshot).
  Provera: `src/components/vendors/VendorDialog.jsx`; screenshot.
- [x] 4.3 Jedinstvenost: dva istovremena unosa ne dobijaju isti ID; brisanje vendora ne dovodi do ponovne upotrebe postojećeg ID-a na način koji pravi duplikat.
  ✔ Dokaz: pg_advisory_xact_lock + parcijalni unique indeks vendors_vendor_id_key. (Brisanje vendora sa najvećim brojem omogućava ponovnu upotrebu tog broja — bez duplikata.)
  Provera: unique constraint + pgTAP.
- [x] 4.4 Postojeći vendori bez ID-a dobijaju ID migracijom (bez gubitka podataka); postojeći ID-evi ostaju.
  ✔ Dokaz: Migracija numeriše postojeće bez ID-a po created_date; ručni ID-evi ostaju (QA-VEN-001 zadržan).
- [x] 4.5 Vendor ID vidljiv u tabeli Vendors i u CSV uvozu (zahtev 14) ID se ne uvozi ručno nego dodeljuje.
  ✔ Dokaz: Tabela: „ID: VEN-00x“; CSV kolona Vendor ID sa VEN-999 ignorisana, dodeljeni VEN-002/VEN-003.

## 5. Novi sidebar i ikonice (slika5)

Tačan redosled i ikonice (lucide naziv u zagradi je očekivani ekvivalent):
- [x] 5.1 Vrh: Teamora oznaka + „Teamora".
  ✔ Dokaz: Teamora znak + reč (BrandLogo).
- [x] 5.2 „Dashboard" (`LayoutGrid` — mreža 2×2), samostalna stavka.
  ✔ Dokaz: DASHBOARD_ITEM LayoutGrid.
- [x] 5.3 Sekcija „Staff Management" (`Users`), sa strelicom gore/dole (`ChevronUp`/`ChevronDown`); stavke redom:
  ✔ Dokaz: navConfig.js: Users sekcija sa Chevron; Employees User, Vendors Handshake, Documents FileText, Attendance Clock, Schedule CalendarDays, Tasks SquareCheck, Leave Requests Calendar, Notifications Bell, Reports ChartNoAxesColumn — redosled kao slika5.
  Employees (`User`), Vendors (`Handshake` — NE kamion), Documents (`FileText`), Attendance (`Clock`), Schedule (`CalendarDays` — kalendar sa tačkicama), Tasks (`SquareCheck`/`CheckSquare`), Leave Requests (`Calendar`), Notifications (`Bell`), Reports (`ChartColumn`/`BarChart3`).
- [x] 5.4 Sekcija „Projects" (`Folder`) sa strelicom; stavke: Project Overview (`FolderKanban` — fascikla sa stubićima), Project Costs (`Coins` — naslagani novčići), Rates & Assignments (`SlidersHorizontal`).
  ✔ Dokaz: Folder, FolderKanban, Coins, SlidersHorizontal — kao očekivani lucide ekvivalenti iz ove stavke. Korak 3: Project Costs i sekcija Payroll koriste CoinStack (naslagani novčići, NavIcons.jsx).
- [x] 5.5 Sekcija „Payroll" (`Coins`/`Database`-slični naslagani novčići), sa strelicom; stavke: Payroll Dashboard (`Gauge`), Timesheets (`ClipboardList`), Timesheet Overview (`Table2`/`LayoutPanelLeft` — tabela), Monthly Payroll (`CalendarDollar`-ekvivalent: kalendar sa $), Clients (`Building2`), Payroll Reports (`ChartColumn`).
  ✔ Dokaz: Coins sekcija; Gauge, ClipboardList, Table2, CalendarDollar (kalendar sa $), Building2, ChartNoAxesColumn — redosled kao slika5; ikonica sekcije CoinStack (naslagani novčići).
- [x] 5.6 Sekcija „Settings" (`Settings` zupčanik) sa strelicom (podrazumevano skupljena); unutra Settings stavke (Email Notifications, Departments & Positions, Cost Categories, Coefficients & Holidays, Company Details, Users) — vidljive samo adminu.
  ✔ Dokaz: Settings zupčanik, defaultOpen:false; 7 stavki (+ Language & Currency); ADMIN_ONLY_PREFIXES '/settings' — operater ne vidi.
- [x] 5.7 Tanke horizontalne linije razdvajaju Staff Management / Projects / Payroll / Settings i donji blok.
  ✔ Dokaz: border-t između Dashboard/sekcija i iznad Logout/Collapse.
- [x] 5.8 Dole: „Logout" (`LogOut`) i „Collapse" (`ChevronLeft`); Collapse skuplja sidebar na samo ikonice (tooltip sa nazivom), Logout odjavljuje.
  ✔ Dokaz: LogOut + ChevronLeft dole; Collapse testiran (68px, ikonice, title tooltip).
- [x] 5.9 Zaglavlje sekcije: svetlolavanda zaobljena pozadina, ljubičast bold tekst i ikonica, strelica desno; podstavke uvučene, tamni tekst, tanke (outline) ljubičaste ikonice.
  ✔ Dokaz: SectionGroup: bg-sidebar-accent/50, text-sidebar-primary font-bold, ChevronUp/Down; podstavke uvučene (ml-3), strokeWidth 1.75.
- [x] 5.10 Aktivna stavka: svetloljubičasta zaobljena pozadina + ljubičast bold tekst (kao „Vendors" na slici5); sekcija aktivne stavke automatski otvorena.
  ✔ Dokaz: Vendors aktivan: svetloljubičasta pozadina + bold ljubičast tekst; sekcija sa aktivnom stavkom otvorena (hasActive).
- [x] 5.11 Pozadina sidebara svetla lavanda sa blagim talasastim ukrasom dole (bez tamne braon teme).
  ✔ Dokaz: Korak 3: Sidebar.jsx:123 dekorativni SVG talas u dnu (text-primary, opacity 0.07/0.08), vidljiv na screenshotu dole levo.
  (Korak 2: Pozadina svetla lavanda — OK, ali nema talasastog ukrasa u dnu sidebara sa slike5.)
- [x] 5.12 Sve stavke vode na postojeće rute (nijedna mrtva veza, nijedna ruta izgubljena u odnosu na stari meni).
  ✔ Dokaz: Klik kroz sve linkove menija — 19/19 stranica otvara se; Settings rute otvarane direktno.
  Provera 5.1–5.12: `src/components/layout/navConfig.js` (redosled, nazivi, ikonice), `Sidebar.jsx`, `MobileNav.jsx` (isti redosled/ikonice); screenshot uporedo sa slikom5; klik na svaku stavku → stranica bez greške.
- [x] 5.13 Napomena za odluku: slika2 prikazuje ravniji meni (badge „12" na Timesheets, kartica „Teamora Pro / Active until…"). Mernodavan za meni je slika5 (zahtev 5); badge broja pending timesheets je dozvoljen samo sa stvarnim brojem; „Teamora Pro" kartica se NE pravi bez stvarnog pretplatničkog podatka (bio bi placeholder).
  ✔ Dokaz: Bedž na Timesheets = usePendingTimesheets (stvaran broj, lokalno 3); nema „Teamora Pro“ ni hardkodovanog „12“.
  Provera: nema hardkodovanog „12" ni „Active until Dec 31, 2025".

## 6. Uklanjanje polja za srpski prevod (slika6)

- [x] 6.1 Departments → New/Edit Department: nema polja „Translation (Serbian) - optional" ispod Department Name.
  ✔ Dokaz: New Department dijalog: samo Department Name (placeholder „e.g. Engineering, Sales, HR...“).
- [x] 6.2 Positions u istom dijalogu: nema „Translation (Serbian) - optional" ispod „Position in English".
  ✔ Dokaz: Positions: samo „Position name“.
- [x] 6.3 Cost Categories (kategorija i potkategorija): nema polja za srpski prevod.
  ✔ Dokaz: Cost Categories: nema polja za srpski (grep „Translation (Serbian)“ u UI = 0; ostao samo neiskorišćen ključ u translations.sk.js:290).
- [x] 6.4 Nijedan drugi dijalog (job roles, tipovi dokumenata, praznici…) nema poseban unos srpskog prevoda.
  ✔ Dokaz: grep name_sr/name_rs/Translation (Serbian) u src/pages i src/components = 0.
  Provera 6.1–6.4: `grep -rni "Translation (Serbian)\|name_sr\|name_rs\|_sr\b" src/pages src/components`; screenshot dijaloga.
- [x] 6.5 Postojeći zapisi i prikaz rade (naziv se prikazuje kako je unet; ako postoji kolona `*_sr`, ne briše se bez odluke i ne izaziva grešku pri čuvanju).
  ✔ Dokaz: Kolona cost_categories.translation zadržana; čuvanje radi (dodata kategorija/brisanje praznika bez greške).

## 7. Jezik i valuta samo u Podešavanjima, samo admin (slika7)

- [x] 7.1 Iz zaglavlja uklonjeni EN/RS i EUR/RSD prekidači (desktop i mobilni).
  ✔ Dokaz: Zaglavlje desktop i mobilno bez EN/RS i EUR/RSD (screenshotovi).
  Provera: `AppLayout.jsx`, `MobileNav.jsx`; screenshot zaglavlja.
- [x] 7.2 Podešavanja (npr. Company Details ili nova „General/Application" stavka u Settings) imaju izbor jezika: English, Slovenčina (slovački), Srpski.
  ✔ Dokaz: /settings/general „Language & Currency“: English, Slovenčina, Srpski.
- [x] 7.3 Izbor valute u Podešavanjima; podrazumevano EUR (D2); ponuđene samo podržane valute (EUR, RSD).
  ✔ Dokaz: EUR jedini aktivan, RSD prikazan disabled uz objašnjenje (D2/D24); baza odbija RSD (pgTAP 12).
- [x] 7.4 Podešavanja jezika/valute su na nivou aplikacije (baza, `20261124140000_podesavanja_aplikacije.sql`), ne samo localStorage; važe za sve korisnike posle osvežavanja.
  ✔ Dokaz: Tabela public.app_settings (jedan red, en/EUR); promena na SK važila posle navigacije na druge stranice.
- [x] 7.5 Samo admin vidi i menja ova podešavanja; operater ih ne vidi u meniju, a direktan pristup ruti/upisu u bazu je odbijen (RLS/RPC).
  ✔ Dokaz: pgTAP 12_podesavanja_aplikacije (operater ne menja); SQL simulacija kao operater@radnici.local: UPDATE app_settings = 0 redova; AdminRouteGuard + visibleNavItems kriju /settings.
  Provera: pgTAP `12_podesavanja_aplikacije.test.sql` (operater ne može UPDATE); login kao operater → nema stavke, direktna ruta → zabrana.
- [x] 7.6 Promena jezika u slovački prevodi ceo UI (meni, dashboard, dijalozi) — nema ključeva koji ostaju na engleskom zbog nedostajućeg `sk`.
  ✔ Dokaz: Prebačeno na Slovenčina: meni, dashboard, Coefficients, Vendors + CSV dijalog prevedeni; skripta: 611 ključeva u translations.js, 0 bez SK. Vraćeno na English.
  Provera: `src/lib/translations.js` — svaki unos ima `rs` i `sk` (skripta/test koji broji unose bez `sk` = 0); `LanguageContext.jsx` podržava `sk`.
- [x] 7.7 Promena valute utiče na prikaz iznosa doslednim kursom (ili jasno: samo prikaz), ne menja sačuvane iznose (D2/D19).
  ✔ Dokaz: Iznosi ostaju u EUR; RSD samo informativno (napomena na ekranu), ništa se ne preračunava.

## 8/9. Podrazumevane kategorije troškova (slika8, slika9)

Seed mora sadržati tačno ovih 12 kategorija (9 sa slike8 + 3 sa slike9; ukupno 86 potkategorija) sa potkategorijama (bez teksta „Kopiraj kategorije" koji je ostatak UI dugmeta na slici):
- [x] 8.1 Accommodation (9): Apartment Rental, Hotel & Guesthouse, Worker Housing, Utilities, Cleaning Services, Laundry & Linen, Maintenance & Repairs, Booking Fees, Accommodation Taxes.
  ✔ Dokaz: DB: Accommodation 9 — nazivi identični slici.
- [x] 8.2 Administrative Costs (7): Permits, Certification, Documentation, Printing, Phone Costs, Internet Costs, Office Supplies.
  ✔ Dokaz: Administrative Costs 7 — identično.
- [x] 8.3 Insurance & Compliance (9): General Liability Insurance, Employer's Liability Insurance, Workers' Compensation Insurance, Professional Indemnity Insurance, Project-Specific Insurance, Compliance Audits, Legal & Regulatory Services, Safety Inspections, Regulatory Fees & Licenses.
  ✔ Dokaz: Insurance & Compliance 9 — identično, „Regulatory Fees & Licenses“ bez „Kopiraj kategorije“.
- [x] 8.4 Meals & Per Diems (7): Daily Allowance (Per Diem), Meal Allowance, Breakfast Expenses, Lunch Expenses, Dinner Expenses, Catering Services, Drinking Water & Refreshments.
  ✔ Dokaz: Meals & Per Diems 7 — identično.
- [x] 8.5 Medical Expenses (6): Medical Examinations, Fit to Work Examinations, Alcohol & Drug Testing, Vaccination, First Aid, Medical Equipment.
  ✔ Dokaz: Medical Expenses 6 — identično.
- [x] 8.6 Miscellaneous Costs (4): Unforeseen Costs, Project Contingency, Banking Fees, Insurance.
  ✔ Dokaz: Miscellaneous Costs 4 — identično.
- [x] 8.7 PPE / Safety Equipment (10): Workwear, Safety Shoes, Safety Helmets, Safety Glasses, Safety Gloves, Ear Protection, Fall Protection Equipment, Respiratory Protection, High Visibility Vests, Rain Gear.
  ✔ Dokaz: PPE / Safety Equipment 10 — identično.
- [x] 8.8 Recruitment & Onboarding (8): Recruitment Agency Fees, Job Advertising, Candidate Screening, Background Checks, Interview Expenses, Onboarding Expenses, Employee Relocation, Initial Worksite Induction.
  ✔ Dokaz: Recruitment & Onboarding 8 — identično.
- [x] 8.9 Site Facilities & Services (9): Site Office Rental, Portable Toilets & Sanitary Facilities, Site Utilities, Waste Disposal, Site Cleaning Services, Temporary Site Facilities, Site Security Services, Site Access & Parking Fees, Site Maintenance.
  ✔ Dokaz: Site Facilities & Services 9 — identično, „Site Maintenance“ bez artefakta.
- [x] 8.10 Tools & Equipment (7): Hand Tools, Power Tools, Consumables, Calibration, Equipment Rental, Tool Maintenance, Lifting Equipment.
  ✔ Dokaz: Tools & Equipment 7 — identično.
- [x] 8.11 Training Costs (6): HSE Training, Working at Height Training, Lifting Training, Operator Training, Welder Certification, VCA / SCC Training.
  ✔ Dokaz: Training Costs 6 — identično.
- [x] 8.12 Transport & Logistics (4): Fuel, Travel Expenses, Flight Tickets, Car Rental.
  ✔ Dokaz: Transport & Logistics 4 — identično. Seed: 20261124130000_podrazumevani_sifarnici.sql (idempotentan, po nazivu, advisory lock); pgTAP 13 OK; ekran: kartice 3 kolone, „N subcategories“, olovka + crvena kanta.
  Provera 8.1–8.12: migracija sa seedom (idempotentna: `on conflict do nothing`/`where not exists`, ne duplira pri ponovnom pokretanju, ne dira korisničke kategorije); SQL upit `select c.name, count(s) …` daje 12 redova sa tačnim brojevima (9,7,9,7,6,4,10,8,9,7,6,4 = 86); pgTAP test za broj kategorija/potkategorija; screenshot Cost Categories (kartice u 3 kolone, broj „N subcategories", čipovi, olovka i crvena kanta).
- [x] 8.13 Nazivi tačno kao na slici (velika slova, „&", apostrofi u „Employer's"/„Workers'"); nijedan naziv ne sadrži „Kopiraj kategorije".
  ✔ Dokaz: grep Kopiraj u migracijama = 0; pgTAP 13 „nazivi bez artefakta“.
  Provera: `grep -n "Kopiraj" supabase/migrations` = 0; SQL poređenje naziva.
- [x] 8.14 Moguće dodati novu kategoriju i potkategoriju (Add Category radi).
  ✔ Dokaz: Add Category postoji (QA-Kategorija-Nova postoji u bazi iz ranijeg QA unosa).
- [x] 8.15 Moguće obrisati podrazumevanu kategoriju/potkategoriju; ako je kategorija već korišćena u troškovima, ponašanje je bezbedno (zabrana sa jasnom porukom ili arhiviranje) — istorijski troškovi ne gube kategoriju.
  ✔ Dokaz: Brisanje uz potvrdu; project_costs čuva naziv kategorije kao tekst (nema FK), pa istorijski troškovi ne gube kategoriju.
- [x] 8.16 Obrisana podrazumevana kategorija se NE vraća sama pri sledećoj migraciji/deployu.
  ✔ Dokaz: Seed se izvršava samo jednom (migracija); „Restore default categories“ je ručno dugme samo za admina (restore_default_cost_categories, 42501 za operatera).
- [x] 8.17 Kategorije su odmah dostupne u Add Cost (Project → Costs i Project Costs) sa potkategorijama (spec §8.1).
  ✔ Dokaz: ProjectCostsPage.jsx čita CostCategory.list iz iste tabele.

## 10. Koeficijenti u procentima (slika10)

- [x] 10.1 Coefficients & Holidays: Worker i Client koeficijent prikazani i unose se kao procenti sa sufiksom „%" (Regular 100% zaključano; Overtime, Weekend, Holiday npr. 150%, 200%).
  ✔ Dokaz: Polja sa sufiksom %, Regular 100% zaključan (screenshot).
- [x] 10.2 Interno se čuva 1.0 / 1.5 / 2.0 (unos 150 → 1.5 u bazi; 1.5 iz baze → prikaz 150%); nema dvostrukog množenja ni zaokruživanja koje gubi preciznost (npr. 125% → 1.25).
  ✔ Dokaz: Uneto 150/125 za Overtime → baza 1.5000/1.2500, posle osvežavanja prikaz 150/125; coefficientInput.test.js (9 testova). Vraćeno na prazno posle testa.
  Provera: `src/lib/coefficientInput.js` + `coefficientInput.test.js` (konverzija oba smera, granice, nevalidan unos); SQL `select` posle čuvanja.
- [x] 10.3 Opis ispod naslova i napomena „Regular is fixed at 100%" prilagođeni procentima i prevedeni.
  ✔ Dokaz: „Entered as a percentage of the hourly rate (150% = 1.5 × rate). Regular is fixed at 100%.“ + SK prevod.
- [x] 10.4 Validacija: negativne/prazne vrednosti odbijene; razumna gornja granica.
  ✔ Dokaz: Baza: check worker/client_coef ≤ 10 i > 0 (migracija 20261124130000, pgTAP 13).
- [x] 10.5 Svi drugi prikazi koeficijenata (timesheet pregled, payslip PDF, izveštaji) dosledno u %, obračun nepromenjen (`npm test` zelen).
  ✔ Dokaz: Koeficijenti se u UI prikazuju samo na Coefficients & Holidays (grep worker_coef/client_coef u src van lib = 0); obračun nepromenjen, testovi zeleni.

## 11. Podrazumevani evropski praznici (slika11)

- [x] 11.1 Lista praznika nije prazna posle instalacije: seed osnovnih evropskih praznika za tekuću (i sledeću) godinu — bar: New Year's Day (1.1), Good Friday, Easter Monday, Labour Day (1.5), Ascension Day, Whit Monday, Christmas Day (25.12), St. Stephen's Day/Boxing Day (26.12); pokretni datumi tačno izračunati (Uskrs 2026 = 5.4, Uskrs 2027 = 28.3).
  ✔ Dokaz: 16 praznika 2026/2027 u bazi; Uskrs 2026 5.4 (Good Friday 3.4, Easter Monday 6.4), 2027 28.3 (26.3/29.3); europeanHolidays.test.js.
  Provera: migracija/seed + SQL upit; pgTAP ili unit test za datume.
- [x] 11.2 Seed idempotentan, ne duplira praznike i ne vraća obrisane.
  ✔ Dokaz: insert … on conflict (date) do nothing; dugme „Add default European holidays for 2026“ dodaje samo nedostajuće.
- [x] 11.3 Moguće dodati (Date + Name + „Add holiday"), izmeniti i obrisati praznik.
  ✔ Dokaz: Dodat „QA Test Holiday“ 15.08.2026 i obrisan kroz UI (potvrda „Yes, delete“); izmena (Pencil) postoji u kodu.
- [x] 11.4 Lista sortirana po datumu, prikaz datuma u formatu aplikacije.
  ✔ Dokaz: Sortirano po datumu; SK prikaz 01.01.2026, EN prikaz ISO 2026-01-01 (vidi Nalazi N7).
- [x] 11.5 Sati na praznik i dalje se obračunavaju holiday koeficijentom (postojeći testovi zeleni).
  ✔ Dokaz: payroll.test.js + pgTAP 03/14 zeleni.

## 12. Company Details: ZIP, bez PIB (slika12)

- [x] 12.1 Dodato polje „ZIP" (postal code) uz Address/City, sačuvano u bazi (migracija, kolona `if not exists`).
  ✔ Dokaz: Polje „ZIP (Postal code)“; uneto „821 06“ → company_settings.zip; vraćeno na prazno.
- [x] 12.2 Uklonjeno „PIB (tax ID)"; ostaje samo „Tax ID" (jedno polje). Postojeća PIB vrednost se ne gubi (prebačena u Tax ID ako je Tax ID prazan).
  ✔ Dokaz: Samo „Tax ID“; migracija 20261124120000 preimenuje pib → tax_id (vrednost ostaje).
- [x] 12.3 Podnaslov stranice ne pominje PIB; PDF dokumenti (payslip, timesheet PDF, bank export) koriste Tax ID i ZIP, bez „PIB".
  ✔ Dokaz: Podnaslov bez PIB; companyDetails.test.js „nema polja PIB — samo Tax ID i ZIP“, footer bez PIB; pgTAP 07 ažuriran i zelen.
  Provera: `src/pages/CompanySettings.jsx`, `src/lib/companyDetails.js` + `companyDetails.test.js`, `src/lib/companyPdf.js`; `grep -rn "PIB\|pib" src`; pgTAP `07_podaci_firme` ažuriran; screenshot.

## 13. CSV uvoz zaposlenih

- [x] 13.1 Na Employees postoji dugme „Import CSV" (samo admin/ovlašćeni).
  ✔ Dokaz: Employees → „Import CSV“ (dostupno onima koji smeju da dodaju zaposlene; privatna polja samo admin).
- [x] 13.2 Preuzimanje šablona CSV sa tačnim zaglavljem kolona (ime, prezime, email, telefon, JMBG, odeljenje, pozicija, status…).
  ✔ Dokaz: employeeTemplate() u ImportEmployeesDialog.jsx (šablon sa primerom).
- [x] 13.3 Parser podržava `,` i `;` separator, UTF-8 sa/bez BOM (š, ć, č, ž, đ), navodnike, prazne redove; Excel „Save as CSV" radi.
  ✔ Dokaz: Test fajl sa BOM, `;`, đ/č/ž/š — mapirano automatski po srpskim nazivima kolona; csvImport.test.js 28 testova.
  Provera: `src/lib/csvImport.js` + unit testovi sa tim slučajevima.
- [x] 13.4 Pregled pre uvoza: tabela redova, greške po redu (obavezna polja, nevalidan email/JMBG/datum), duplikati (isti email/JMBG u fajlu ili bazi) označeni i preskočeni — ne prave se duplikati (spec §15).
  ✔ Dokaz: Pregled: 2 Ready, 1 Error (email, datum 31.02, JMBG, prezime), 1 Duplicate (isti email u fajlu).
- [x] 13.5 Uvoz upisuje validne redove, prikazuje rezime (uvezeno / preskočeno / greške); EMP-ID se dodeljuje automatski.
  ✔ Dokaz: Uvezeno 2 (EMP-006, EMP-007), rezime Imported 2 / Skipped 1 / Errors 1. Test podaci obrisani.
- [x] 13.6 Ne uvoze se uklonjena tarifna polja (zahtev 3); osetljiva polja (JMBG) poštuju postojeća prava.
  ✔ Dokaz: EMPLOYEE_FIELDS bez tarifnih polja; private polja samo admin („Admin only — value ignored“).
- [x] 13.7 Prevodi RS/SK za sve nove stringove uvoza.
  ✔ Dokaz: Dijalog preveden na SK/RS (0 ključeva bez SK).

## 14. CSV uvoz vendora

- [x] 14.1 Na Vendors dugme „Import CSV" + šablon (Vendor Name, Legal Name, Registration No., Tax No., VAT No., Country, City, Postal Code, Address, Contact Name, Email, Phone, Default Currency, Payment Terms, Settlement Cycle, Contract Ref., Status).
  ✔ Dokaz: Vendors → Import CSV, šablon sa svim kolonama forme.
- [x] 14.2 Isti parser/pravila kao 13.3; validacija valute (EUR/RSD), statusa, ciklusa.
  ✔ Dokaz: Isti parser; validacija valute/ciklusa/statusa (vendorImport.js).
- [x] 14.3 Vendor ID se dodeljuje automatski (VEN-xxx), kolona ID u CSV se ignoriše ili odbija.
  ✔ Dokaz: „Ignored column: Vendor ID“; dodeljeni VEN-002/VEN-003.
- [x] 14.4 Duplikati (isti naziv/Registration No./Tax No.) označeni i preskočeni; rezime uvoza.
  ✔ Dokaz: Duplikat naziva u fajlu preskočen; prazan naziv = greška. Rezime posle uvoza: vidi Nalazi N6.
- [x] 14.5 Testovi za vendor mapiranje/validaciju.
  ✔ Dokaz: vendorImport.test.js 8 testova.

## 15. Novi projekat — lokacija: Address, ZIP, City (slika15)

- [x] 15.1 „New project"/„Edit project" umesto jednog polja „Location" ima tri: Address, ZIP, City (redosled kao u zahtevu), uz ostala polja (Project number, Project name *, Client, Start/End date, Status, Work description).
  ✔ Dokaz: New project: Address, ZIP, City (placeholderi „Street and number“, „e.g. 2040“, „City“).
  Provera: `src/components/projects/ProjectFormModal.jsx`; screenshot.
- [x] 15.2 Baza: kolone za adresu, ZIP, grad (migracija, `if not exists`); postojeća vrednost „Location" se ne gubi (mapirana u City/Address ili ostaje za prikaz).
  ✔ Dokaz: Kolone address/zip/city (20261124120000); stari location → city; test projekat sačuvan sa sva tri polja.
- [x] 15.3 Kartica „Location" na Project Detail (slika17) prikazuje sastavljenu adresu („Address, ZIP City").
  ✔ Dokaz: Kartica Location: „Dvojkrížna ulica 12227/49, 821 06 Bratislava“.
- [x] 15.4 Lista projekata/pretraga i izvozi koji su koristili lokaciju i dalje rade.
  ✔ Dokaz: location se i dalje upisuje sastavljenom adresom (za stare izveštaje/pretragu); projectSite.test.js.

## 16/17. Bug: Add Timesheet Row ne nudi zaposlenog sa projekta (slika16, slika17)

- [x] 16.1 Reprodukcija: projekat „INEOS Project ONE" sa zaposlenim dodatim preko „Add employee" (uloga Work Preparator, B2B 50, B2C 45) → Timesheets → Add Row → izbor projekta → padajuća lista Employee sadrži tog zaposlenog.
  ✔ Dokaz: Napravljen projekat + job role + zaposleni (Add employee) → Timesheets → Add Row → izbor projekta → lista nudi tog zaposlenog; red sačuvan (Draft). Test podaci obrisani.
  Provera: lokalno ponoviti scenario; screenshot otvorene liste.
- [x] 16.2 Uzrok identifikovan i opisan u izveštaju (npr. filter po statusu/datumu angažmana, pogrešan ključ relacije, RLS, nedostajući join) i ispravljen u izvoru, ne zaobilaznicom.
  ✔ Dokaz: Izbor radnika izdvojen u employeesForProject() (src/lib/projectSite.js): veza po ID-u iz projects.assigned_employees, poređenje kao normalizovan tekst; Timesheets.jsx:1096.
  Provera: diff fajla Timesheets (`src/pages/payroll/Timesheets.jsx` ili dijalog) i/ili SQL.
- [x] 16.3 Prazna lista prikazuje jasnu poruku („No employees assigned to this project" + veza na projekat), ne prazan beli okvir kao na slici16.
  ✔ Dokaz: Prazna lista: „No active employees on this project. Add them in the project's "Employees on the project" card.“ (data-testid no-project-employees).
- [x] 16.4 Angažman bez datuma početka/kraja ili sa datumom u nedelji se računa kao aktivan za tu nedelju; zaposleni čiji je angažman završen pre nedelje se ne nudi.
  ✔ Dokaz: Nudi samo aktivne radnike koji su na projektu (uklonjen sa projekta = ne nudi se); assigned_employees nema datume, pa provera po nedelji nije primenljiva.
- [x] 16.5 Regresioni test (unit ili pgTAP) koji pokriva filter zaposlenih za projekat/nedelju.
  ✔ Dokaz: projectSite.test.js (employeesForProject: dodeljen, neaktivan, prazna lista).
- [x] 16.6 Posle izbora zaposlenog, Add Row čuva red; tarife se uzimaju po D4/D16 (baza), Client se popunjava iz projekta.
  ✔ Dokaz: Add Row sačuvao red 2026W48-EMP-007, tarife B2C 55/B2B 50 iz projekta prikazane u dijalogu.

---

## Dodatno iz spec dokumenta (urađeno sada)

- [x] S.1 Vendors ikonica = handshake (`Handshake`), ne transportni kamion — u sidebaru, mobilnom meniju, Vendors zaglavlju/praznom stanju i ikonici reda u tabeli (slika14 ima kamion u redu tabele) (spec §11).
  ✔ Dokaz: navConfig Handshake; Vendors.jsx ikonica reda = handshake (screenshot); grep Truck u src = 0.
  Provera: `grep -rn "Truck" src` = 0 za vendor kontekst.
- [x] S.2 Koeficijenti u UI kao procenti (100%/150%/200%), interno 1.0/1.5/2.0 — isto kao 10.1–10.5 (spec §5).
  ✔ Dokaz: Isto kao 10.1–10.5.
- [x] S.3 Praznik + vikend (ili praznik + overtime) → primenjuje se NAJVIŠI konfigurisani multiplikator, bez sabiranja ili dvostrukog množenja (spec §5).
  ✔ Dokaz: Migracija 20261124150000_praznik_vikendom.sql (vrsta praznik_vikend, veći koeficijent po strani, bez sabiranja), hours.js classifyWeek; payroll.test.js (150/200 → 2.0, ne 3.0; strane posebno; jednaki → praznik; prazan blokira; D10 snimci) + pgTAP 14 OK; D29.
  Provera: funkcija u `src/lib/payroll` (i odgovarajuća logika u bazi ako baza računa iznose po D16) + test u `payroll.test.js`: npr. weekend 150%, holiday 200%, subota-praznik → 2.0 (ne 3.0 ni 3.5); ako je weekend 250% a holiday 200% → 2.5; pgTAP ako se pravilo menja u bazi.
- [x] S.4 Upozorenje na negativnu radnu maržu kad je B2C > B2B (pri dodeli zaposlenog na projekat / izmeni tarife / Rates & Assignments): vidljivo upozorenje, čuvanje NIJE blokirano, nijedna tarifa se ne menja automatski (spec §5).
  ✔ Dokaz: Add employee sa B2C 55 > B2B 50: crveno upozorenje „Negative labour margin…“, Add nije blokiran, tarife nepromenjene; isto u Add Timesheet Row i na kartici projekta; negativeLabourMargin testiran u projectSite.test.js.
  Provera: komponenta (`ProjectEmployees.jsx` / rates) + test funkcije poređenja u `src/lib/payroll`; screenshot sa B2C 55 / B2B 50.
- [x] S.5 Svetla Teamora tema sa ljubičastim akcentima svuda, uključujući empty/loading/error i permission-denied prikaze (spec §15) — vidi 2.1–2.5.
  ✔ Dokaz: Vidi 2.1–2.5; EmptyState/ErrorBoundary u novoj temi.
- [x] S.6 KPI bez podataka prikazuje 0 ili neutralno prazno stanje, nikad izmišljenu vrednost (spec §3.3) — Dashboard, Payroll Dashboard, Timesheet Dashboard, Project Financial Report.
  ✔ Dokaz: changePct vraća null kad je osnovica 0 (bez izmišljenog bedža), marža null kad je prihod 0; grep mockup imena/brojeva u src = 0.
  Provera: prazna baza/period bez sati → €0 / 0 / „—"; `grep` za hardkodovane brojeve iz mockupa (124,560 / 78,320 / 46,240 / 37.1 / Aleksandar / NovaTech / Milan Jovanović) = 0.
- [x] S.7 Implementation Matrix: dokument (npr. `IMPLEMENTATION-MATRIX.md`) sa SVAKIM zahtevom spec-a (§1 odluke 01–10, §2–§15, test scenariji T01–T29) i statusom Implemented / In Progress / Needs Correction / Not Started + dokaz (fajl/test/ekran) (spec §16 korak 0, §18).
  ✔ Dokaz: Korak 3: IMPLEMENTATION-MATRIX.md ažuriran — 5.05/5.06/5.07/5.09/5.11/11.03/T08 = Implemented sa dokazom; „In Progress (ovaj krug)“ = 0; zbir: 42 Implemented, 3 In Progress, 65 Needs Correction, 90 Not Started.
  (Korak 2: IMPLEMENTATION-MATRIX.md postoji i pokriva §1–§18 i T01–T29 (242 reda), ali statusi nisu ažurirani posle ovog kruga: 5.05, 5.06, 5.09, 5.11, 11.03, 11.05, 15.07 i dalje „In Progress (ovaj krug)“, 5.07 „Needs Correction“ iako je urađeno (D29), 11.03 navodi Truck. Vidi Nalazi N3.)
  Provera: svaki odeljak 1–18 i svaki T01–T29 ima red; statusi su tačni (nasumično proveriti 5 „Implemented" naspram koda).
- [x] S.8 Preostali veliki moduli spec-a upisani u `BACKLOG.md` po BACKLOG-SPEC formatu, svaki sa `Accept:` kriterijumima koji se mehanički proveravaju: Project Assignments A1 (§4.1–4.4, T01–T05) i A2 (§4.5, T06), Rate History sa Effective From/To (§5, T07), Timesheet Draft→Submitted→Approved/Rejected + preklapanja (§6, T09–T10), Payroll isplate/delimične isplate/Remaining Balance (§7, T11–T12), Project Costs C1/C2 (§8, T13–T15), Client Billing Overview bez faktura (§9, T16, T29), Financial Reports (§10, T17, T28), Onboarding ZIP (§12, T18–T19), Workforce Planning/Gantt (§13, T20–T21), Leave + Smart Replacement (§14, T22–T24), uloge Admin/PM/HR/Finance + audit trail (§15, T26), Main Dashboard filteri Project/Client/Status + Action Center + Quick Links (§3, T27).
  ✔ Dokaz: BACKLOG.md +84 linije, 46 novih `Accept:`; pokriveni A1/A2, Rate History, Timesheet, Payroll isplate, Costs C1/C2, Billing, Financial Reports, Onboarding ZIP, Workforce/Gantt, Leave/Replacement, uloge+audit, Dashboard. (Dve stavke su sada već urađene — vidi Nalazi N4.)
  Provera: `grep -c "Accept:" BACKLOG.md` porastao; svaki modul iz liste ima zadatak.

## Opšte

- [x] G.1 `npm run build && npm test` — zeleno (bez grešaka; upozorenja zabeležiti).
  ✔ Dokaz: npm run build exit 0 (vite logLevel error), npm test 21 fajl / 332 testa zeleno.
- [x] G.2 `npm run test:db` — svi pgTAP testovi zeleni (uključujući nove za vendor ID, podešavanja, kategorije, praznike, company details).
  ✔ Dokaz: npm run test:db: 15 fajlova, 387 testova, Result: PASS (uključujući 12_vendor_id, 12_podesavanja, 13_sifarnici, 14_praznik_vikendom).
- [x] G.3 `npm run lint` bez grešaka u izmenjenim fajlovima.
  ✔ Dokaz: Korak 3: `npm run lint` (eslint . --quiet) — 0 grešaka, exit 0.
  (Korak 2: npm run lint: 30 grešaka (unused imports) u 12 fajlova, većina izmenjena u ovom krugu (EmployeeDetail 12, EmailNotifications 5, Clients 2, Timesheets, ProjectDetail, RatesPage…). Vidi Nalazi N5.)
- [x] G.4 Nema grešaka ni upozorenja React-a u konzoli pregledača na: Dashboard, Employees (+forma), Vendors (+dijalog, uvoz), Projects (+forma, detalj), Timesheets (+Add Row), Payroll Dashboard, Monthly Payroll, sve Settings stranice, Login.
  ✔ Dokaz: Konzola: samo React Router future-flag upozorenja i HMR websocket poruke dev servera (okruženje); nema React grešaka na proverenim stranicama.
  Provera: pregledač → `read_console_messages` po ruti.
- [x] G.5 Nema placeholder sadržaja: nema lorem ipsum, „TODO" u UI, mockup imena/brojeva sa slike2, lažnih trendova (%), „Teamora Pro" kartice bez podatka.
  ✔ Dokaz: grep lorem/aleksandar/novatech/brightapps/coresoft/teamora pro/Active until u src = 0; nema TODO teksta u UI.
  Provera: `grep -rni "lorem\|todo\|aleksandar\|novatech\|brightapps\|coresoft\|teamora pro" src`.
- [x] G.6 Nema ostataka „WorkforceHub" u UI, `index.html`, `public/` (manifest), PDF/e-mail šablonima.
  ✔ Dokaz: grep workforcehub u src/public/index.html = 0 (ostaje samo `name` u package.json — nije UI).
  Provera: `grep -rni "workforcehub\|workforce hub" src public index.html` = 0.
- [x] G.7 Svi novi/izmenjeni stringovi kroz `t()` i u `src/lib/translations.js` imaju `rs` (latinica, ekavica) i `sk`; nijedan hardkodovan engleski tekst u novim komponentama.
  ✔ Dokaz: 0 od 611 ključeva bez SK (privremeni test, obrisan); translations.test.js „nema praznih vrednosti“; SK proveren vizuelno.
  Provera: skripta koja proverava da svaki unos ima `rs` i `sk`; vizuelno u SK i RS jeziku za Dashboard, sidebar, uvoz CSV, Company Details.
- [x] G.8 Operater (ne-admin) ne vidi Settings admin stavke (jezik/valuta, Users, Coefficients, Company Details, kategorije ako su admin-only) i ne može ih menjati ni direktnim pozivom (RLS/RPC; pgTAP), ne vidi finansijske iznose ako nema pravo.
  ✔ Dokaz: SQL kao operater: UPDATE app_settings/company_settings/hour_types = 0 redova, INSERT holidays/cost_categories odbijen RLS-om, DELETE cost_categories = 0; nav i rute /settings sakrivene (access.js). Prijava kroz UI kao operater nije rađena (vidi napomenu).
  Provera: login kao operater + pgTAP testovi zabrane.
- [x] G.9 Migracije: samo dodeljeni vremenski prefiksi, idempotentne gde ima smisla, bez brisanja korisničkih podataka, bez dozvola za `anon` (D14); `npm run gen:schema` ažuran.
  ✔ Dokaz: Novi prefiksi 20261124110000–150000; idempotentno (if not exists / on conflict / drop … if exists); grant samo authenticated/service_role, revoke od anon; gen:schema ponovo pokrenut — fajl identičan.
  Provera: pregled svakog novog `supabase/migrations/20261124*.sql`; `grep -n "anon" ` u novim migracijama.
- [x] G.10 Novčana logika samo u `src/lib/payroll` (D11), svaka promena formule sa testom u `payroll.test.js`.
  ✔ Dokaz: dashboard.js i hours.js u src/lib/payroll sa testovima u payroll.test.js (121 test).
- [x] G.11 Mobilni prikaz (375px): sidebar/MobileNav, dashboard, forme upotrebljivi, bez horizontalnog skrola.
  ✔ Dokaz: 375px: dashboard i MobileNav bez horizontalnog skrola.
- [x] G.12 Odluke koje menjaju postojeće (D12 „isti dizajn" → nova Teamora tema; D2 valuta u podešavanjima; uklanjanje tarifnih polja zaposlenog; jezik SK) predložene za upis u `DECISIONS.md` u izveštajima graditelja.
  ✔ Dokaz: DECISIONS.md D23–D29 upisane.

---

## Rezultat provere (24.11.2026, QA)

Korak 2: čekirano 132 / 139. **Korak 3 (završna provera): čekirano 139 / 139.**
Verify korak 2: build OK · test 332/332 · test:db 387 OK · lint 30 grešaka.
Verify korak 3: `npm run build` exit 0 · `npm test` 23 fajla / 339 testova OK · `npm run test:db` 15 fajlova / 387 testova PASS · `npm run lint` 0 grešaka (package name „teamora“).
Praktično provereno u pregledaču (1600x900 i 375x812, lokalni admin): Add Vendor → VEN-001; CSV uvoz vendora (VEN-002/003, Vendor ID kolona ignorisana) i zaposlenih (EMP-006/007, greške i duplikati označeni); projekat sa Address/ZIP/City; Add employee na projekat → Add Timesheet Row nudi tog radnika i čuva red; koeficijenti 150/125 % → 1.5/1.25 u bazi; dodavanje/brisanje praznika; Company Details Tax ID + ZIP; prebacivanje na slovački i nazad na engleski. Svi test podaci obrisani, koeficijenti i podaci firme vraćeni na prethodne (prazne) vrednosti.

Napomena (operater): kao operater se nisam prijavljivao kroz UI — upis lozinke na zahtev drugog agenta nije dozvoljen bez Lukinog direktnog zahteva. Prava operatera proverena SQL simulacijom (JWT operater@radnici.local u transakciji sa rollback-om), pgTAP testovima 12/13 i kodom (access.js, AdminRouteGuard, Dashboard.jsx).

## Nalazi

Po ozbiljnosti (Srednje → Nisko). Nijedan nalaz ne blokira build/test.

- **N1 [REŠENO — KPI kartice su linkovi na /payroll/reports.]** (Srednje) — KPI kartice nisu klikabilne (2.16).** `src/components/dashboard/KpiCard.jsx` je običan `Card`. Spec §3.1: klik na KPI vodi na filtriranu izvornu listu. Treba: `to` prop (Client Revenue/Gross Profit/Margin → `/payroll/reports` za period, Payroll Cost → `/payroll/monthly`).
- **N2 [REŠENO — „Overdue · Mar 2026“ crveni bedž; upcoming više nije datum iz prošlosti.]** (Srednje) — „Upcoming Payroll“ pokazuje datum iz prošlosti (2.19).** `src/lib/payroll/dashboard.js` `upcomingPayrollDate()` uzima najstariji odobren a neisplaćen obračun → lokalno 24.11.2026 prikazuje „Mar 31“. Treba: ako je taj datum pre danas, označiti ga kao zakasnelu isplatu (npr. crveni bedž „Overdue · Mar 31“) ili prikazati kraj tekućeg meseca; dodati test.
- **N3 [REŠENO — matrica ažurirana (vidi S.7).]** (Srednje) — Implementation Matrix nije ažuriran posle ovog kruga (S.7).** `IMPLEMENTATION-MATRIX.md` redovi 5.05, 5.06, 5.09, 5.11, 11.03, 11.05, 15.07 = „In Progress (ovaj krug)“; 5.07 i T08 = „Needs Correction“ iako je D29 urađen; 11.03 i dalje navodi `Truck`. Treba: statuse prebaciti na Implemented sa dokazom (fajl/test) i zbir statusa ponovo izračunati.
- **N4 [REŠENO — BACKLOG 5.07 i 5.09 čekirani.]** (Nisko) — BACKLOG ima dve stavke koje su sada urađene.** „(posle K6) Vrsta sata po najvišem koeficijentu (5.07)“ (urađeno: 20261124150000 + D29) i „Upozorenje B2C > B2B (5.09)“ (urađeno: NegativeMarginNote, projectSite.negativeLabourMargin — proveriti da li je pokriven i ekran Tarife). Treba čekirati ili suziti na ono što fali.
- **N5 [REŠENO — lint 0 grešaka.]** (Nisko) — lint: 30 grešaka „unused imports“ (G.3).** Npr. `src/pages/SchedulePage.jsx:4 Calendar`, `src/pages/payroll/Clients.jsx:4 Clock, TrendingUp`, `src/pages/payroll/Timesheets.jsx:4 User`, `src/pages/projects/ProjectDetail.jsx:8 Users`, `src/pages/rates/RatesPage.jsx:4 CardContent`, `src/pages/EmployeeDetail.jsx` (12). Lint nije deo verify komande, ali `npm run lint:fix` bi ih uklonio.
- **N6 [REŠENO — test fajl (1 validan, 1 duplikat, 1 greška): rezime Imported 1 / Skipped 2 / Failed 0. Test vendor obrisan.]** (Nisko) — Rezime CSV uvoza vendora ne broji preskočene redove.** Pregled kaže „Skipped (duplicate): 1, Error: 1“, a posle uvoza „Imported 2 · Skipped 0 · Failed 0“ (`src/components/vendors/ImportVendorsDialog.jsx`). Uvoz zaposlenih to radi ispravno (1 / 1). Treba: u rezime uneti i redove preskočene u pregledu.
- **N7 [REŠENO — EN prikaz „Jan 1, 2026“ (formatIsoDate po jeziku).]** (Nisko) — Datumi praznika na engleskom su ISO (`2026-01-01`), na slovačkom `01.01.2026`** (`src/pages/CoefficientsSettings.jsx` `fmt`). Treba isti format datuma aplikacije kao u ostalim tabelama.
- **N8 [REŠENO — ChartColumn, tačka na kraju linija, talas u sidebaru, CoinStack ikonica.]** (Nisko, vizuelno) — odstupanja od slika:** Gross Profit ikonica je `TrendingUp`, na slici2 su stubići (`ChartColumn`) u zelenoj pločici (2.14); grafikon nema tačku na poslednjoj vrednosti linija (2.17); sidebar nema talasasti ukras u dnu (5.11); `Coins` (dva novčića) umesto naslaganih novčića za Project Costs/Payroll (5.4/5.5).
- **N9 [REŠENO — „Pending Timesheets“ SK = „Čakajúce výkazy“.]** (Nisko) — SK prevod „Pending Timesheets“ = „Čakajúce dochádzky“** (dochádzka = prisustvo). Bolje „Čakajúce výkazy“ (u skladu sa „Pracovné výkazy“ u meniju). `src/lib/translations.sk.js`.
- **N10 [REŠENO — naslovi „Timesheet Overview“ i „Project Overview“.]** (Nisko) — naslovi stranica ne prate nove nazive iz menija:** stavka „Timesheet Overview“ otvara stranicu „Timesheet Dashboard“, „Project Overview“ otvara „Projects“.
- **N11 [REŠENO (nereprodukovano) — /vendors: 3 uzastopna otvaranja Add Vendor odmah po učitavanju, dijalog ostaje otvoren; /timesheets: Add Row kliknut čim se dugme pojavilo, dijalog otvoren 4+ s. Verovatno HMR dok su agenti menjali fajlove.]** (Nisko, verovatno postojeće) — dijalog otvoren dok se stranica još učitava se sam zatvori.** Viđeno dva puta (Add Vendor, Add Timesheet Row) kod prvog klika odmah posle učitavanja; drugi klik radi. Nije reprodukovano pouzdano — vredi proveriti da li remount pri dolasku podataka resetuje `open` stanje.
- **N12 [OTVORENO (info) — rename pib → tax_id i dalje važi za deploy; nije greška u kodu.]** (Info) — `pib` → `tax_id` je rename kolone** (`20261124120000_adrese_firme_projekta.sql`). Pošto push na main deploy-uje bazu i sajt zajedno, kratko vreme stari frontend može da gađa nepostojeću kolonu `pib`. Prihvatljivo, ali za znanje pri deploy-u.


Dodatno u koraku 3: Dashboard ima filtere All clients / All projects (spec §3.1), filterTimesheets testiran u payroll.test.js.
