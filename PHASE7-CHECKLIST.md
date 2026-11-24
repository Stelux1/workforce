# PHASE 7 — QA checklist (Teamora spec v1.4, D30)

Izvor istine: `spec.txt` (Master Development Specification v1.4 FINAL) + `DECISIONS.md` D30. Obuhvat: svaki zahtev §1–§18 koji u `IMPLEMENTATION-MATRIX.md` (stanje 24.11.2026) nije „Implemented", svih 29 test scenarija T01–T29 i isporuke §18.
Pravilo provere: `- [x]` samo uz dokaz (fajl:linija, ime testa, izlaz upita, screenshot). Ne-urađeno ostaje `- [ ]` sa razlogom. ID u zagradi = red matrice.
Uloge za proveru prava (D30 K1/K2): **Admin**, **Project Manager (PM)**, **HR** (bivši operater), **Finance**. Provera „kao druga uloga" = SQL u transakciji sa `set local role authenticated` + `request.jwt.claims` tog korisnika + `rollback`, i/ili pgTAP test, i/ili pregledač (tab „seed") kad Luka dozvoli prijavu.
Imenovanje testova (BRIEF-P7): vitest `it("T07 …")`, pgTAP `-- T07 …` / opis `'T07 …'`. Gde piše „test T0x", traži se baš taj naziv.

---

## §1 Potvrđene odluke vlasnika proizvoda

- [ ] 1.01 Primalac plaćanja razlikuje direktnog radnika i radnika podizvođača (Vendor) na nivou angažovanja.
  Provera: `project_assignments.vendor_id` (ili `payee_type`) popunjen za vendor angažman; upit `select payee_type, vendor_id from payables …` za vendor radnika vraća Vendor; test T12.
- [ ] 1.03 Payroll = obaveza + stvarne isplate (delimične, datumi, preostalo) — vidi §7.
  Provera: tabele `payables` i `payments` postoje (`\d`), test T11 zelen.
- [ ] 1.04 Isti radnik na više projekata istog dana bez preklapanja stvarnog rada — vidi §6.03.
  Provera: test T10 (vitest + pgTAP).
- [ ] 1.05 Onboarding ZIP sa pravima — vidi §12. Provera: T18, T19.
- [ ] 1.06 Odmori: manjak, zamene, odobrenje uz obrazloženje — vidi §14. Provera: T21–T24.
- [ ] 1.07 Promena B2B/B2C važi od izabranog datuma; zaključeni obračuni ostaju isti. Provera: T07.
- [ ] 1.09 Potrebe po projektu, Job Role, datumu i smeni — vidi §13.03. Provera: T20.
- [ ] 1.10 Interni B2B obračun + ručno praćenje uplata, bez izdavanja faktura — vidi §9. Provera: T16, T29.

## §2 Navigacija, ekran projekta, jedan izvor istine

- [ ] 2.1.3 Sekcija Projects: Project Overview, Project Costs, **Project Assignments**, **Workforce Planning**.
  Provera: `navConfig.js` redosled i nazivi (EN/RS/SK); klik na obe nove stavke otvara stranicu bez greške; „Rates & Assignments" više ne postoji u meniju.
- [ ] 2.1.4 Payroll: „Clients" postaje **Clients / Billing Overview** (§9).
  Provera: naziv u meniju i naslov stranice; stranica prikazuje B2B obračun, status, uplate (ne samo zbir sati).
- [ ] 2.1.5 Reports: centralni, kontrolisani izveštaji sa izvozom i proverom prava.
  Provera: Reports stranica ima finansijske izveštaje (§10) sa CSV/PDF izvozom; HR ne vidi finansijske izveštaje ni u UI ni direktnim upitom.
- [ ] 2.2.1 Projekat ima kartice **Overview | Workers | Onboarding | Costs | Workforce Plan | Financial Report** (tim redom).
  Provera: `ProjectDetail.jsx`; screenshot sa svih 6 kartica; svaka se otvara bez greške.
- [ ] 2.2.3 Workers kartica: radnici/vendor radnici, uloga, B2C, B2B, datumi, status angažovanja — iz `project_assignments` (ne iz JSON-a).
  Provera: `grep -rn assigned_employees src` ne vraća čitanje kao izvor; dodela kreirana na Project Assignments odmah se vidi na Workers kartici i obrnuto.
- [ ] 2.2.4 Onboarding kartica (§12). Provera: kartica prikazuje zahteve, status po radniku i dugme Prepare Onboarding Package.
- [ ] 2.2.5 Costs kartica sa automatski izabranim projektom (§8.1.1). Provera: Add Cost iz projekta ima zaključan projekat; isti red se vidi na /project-costs (T13).
- [ ] 2.2.6 Workforce Plan kartica (§13). Provera: Gantt filtriran na projekat, isti podaci kao centralni Workforce Planning.
- [ ] 2.2.7 Financial Report kartica: odobreni rad, prihod, payroll cost, dodatni troškovi, rezultat, interni obračuni, evidentirane uplate, otvorena potraživanja.
  Provera: screenshot sa svim stavkama; brojevi = `src/lib/payroll` funkcije (test T17/T27).
- [ ] 2.3.2 Jedna logička evidencija za Assignment, Rate History, Timesheet, Project Cost, Document, Leave, Workforce Requirement, Billing Summary, Client Payment, Payable, Payment.
  Provera: `docs/TEAMORA-DATA-MODEL.md` navodi po jednu tabelu za svaki entitet; `projects.assigned_employees` migriran u `project_assignments` (upit: broj JSON elemenata = broj migriranih redova, bez duplikata) i više se ne piše (trigger ili uklonjen iz UI); tarife samo u `rates`.
- [ ] 2.3.3 Centralne stranice i kartice projekta čitaju/menjaju iste zapise.
  Provera: izmena dodele na kartici Workers → isti `id` izmenjen u `project_assignments` i vidljiv na Project Assignments; isto za troškove (T13).
- [ ] 2.3.4 Audit trail za izmene i potvrđene finansijske podatke — vidi 15.04.

## §3 Main Dashboard

- [ ] 3.1.1 Globalni filteri: period (podrazumevano tekući mesec), Project, Client, **Status**; primenjuju se zajednički na KPI i grafike.
  Provera: `Dashboard.jsx` ima i Status filter; promena svakog filtera menja KPI i grafikon; test filtera u `payroll.test.js` (`filterTimesheets`) pokriva Status.
- [ ] 3.1.2 Klik na KPI **ili upozorenje** vodi na izvornu listu sa primenjenim filterom (period/projekat/klijent u URL-u).
  Provera: klik na KPI otvara listu sa istim periodom i filterima (URL query), ne samo stranicu.
- [ ] 3.1.3 Korisnik vidi samo dozvoljene projekte/radnike/iznose; HR operativni prikaz bez stopa i finansija.
  Provera: kao HR — dashboard bez iznosa, upit na `timesheets.worker_cost/b2c_rate` vraća NULL/odbijeno; kao PM ograničen na projekat — vidi samo svoje projekte.
- [ ] 3.2.1 KPI **Active Workers** = jedinstveni radnici sa aktivnim Assignment u periodu.
  Provera: test T01; dashboard prikazuje broj iz `project_assignments`, ne iz `employees.status`.
- [ ] 3.2.2 KPI **Active Projects** (status Active i/ili aktivno angažovanje u periodu; obuhvat jasno označen).
  Provera: kartica sa tooltipom obuhvata; vitest za funkciju brojanja.
- [ ] 3.2.3 KPI **Approved Hours** (samo odobreni sati u periodu).
  Provera: kartica postoji; zbir = `select sum(total_hours) from timesheets where approval_status='approved' and …` za isti period.
- [ ] 3.2.6 KPI **Additional Project Costs** po valuti ili uz eksplicitan kurs.
  Provera: kartica prikazuje troškove; kad postoje troškovi u RSD i EUR, prikaz po valuti ili uz kurs+datum (T28).
- [ ] 3.2.7 KPI **Project Profit** = prihod − trošak rada − dodatni troškovi (spec §10), označen kao obračunski (nije stanje na računu).
  Provera: vitest za formulu; vrednost na dashboardu = Net Project Profit iz Financial Reports za isti period (T27).
- [ ] 3.2.8 Odvojene kartice **Client Unpaid** i **Payables** (neplaćeno klijentsko / neisplaćene obaveze); nepodneti obračuni zasebno.
  Provera: dve kartice; brojevi = §9 Outstanding/Estimated Unpaid i §7 Remaining; T17.
- [ ] 3.3.1 Financial Overview po mesecima/projektima bez mešanja valuta (T28).
- [ ] 3.3.2 **Workforce Overview**: aktivni, raspoloživi, raspodela po projektima i pozicijama.
  Provera: panel na dashboardu; brojevi iz Assignment/Schedule/Leave.
- [ ] 3.3.3 **Action Center**: odmori na čekanju, Workforce Shortages, dodele pred istekom, dokumenti koji fale/ističu, pending timesheets, neplaćene obaveze, dospela potraživanja (ako postoji rok).
  Provera: svaka stavka ima broj i link na filtriranu listu; prazno stanje kad nema ničeg.
- [ ] 3.3.4 **Quick Links**: New Assignment, Add Project Cost, Review Timesheets, Prepare Onboarding ZIP, Open Workforce Plan — samo korisnicima sa pravima.
  Provera: kao Admin svih 5; kao HR bez Add Project Cost (ili po matrici prava); linkovi rade.
- [ ] 3.3.5 Loading / empty / error stanja jasna; KPI bez podataka = 0 ili neutralno.
  Provera: prazan period → €0/0/„—"; simulirana greška upita → poruka, ne bela strana.

## §4 Project Assignments (A1 → A2)

- [ ] 4.0 Preimenovanje „Rates & Assignments" → „Project Assignments" (meni, naslov, prevodi EN/RS/SK); tarife ostaju dostupne.
  Provera: grep „Rates & Assignments" u UI = 0; ruta radi; stari `/rates` preusmeren.
- [ ] 4.1.1 Centralna tabela: red = jedan Assignment; radnik na više projekata = više redova, jedan profil.
  Provera: radnik sa 2 dodele → 2 reda, isti `employee_id` link na isti profil.
- [ ] 4.1.2 Kolone Employee (+ID), Project, Client, Job Role, B2C Rate, B2B Rate (+valuta), Start, End, Status, Actions.
  Provera: zaglavlje tabele (screenshot); B2C kolona skrivena/prazna za HR.
- [ ] 4.1.3 Pretraga (employee, project, role) + kombinovani filteri Project/Client/Job Role/Status/Date Range, sortiranje kolona, paginacija i izbor broja redova.
  Provera: kombinacija filtera daje isti skup kao SQL upit; sortiranje po svakoj koloni; 10/25/50 redova.
- [ ] 4.1.4 Brzi režimi **Active** (Active + Ending Soon) i **All Assignments** (svi statusi uz ostale filtere).
  Provera: brojevi redova u oba režima = vitest funkcije režima.
- [ ] 4.1.5 View otvara detalje angažovanja; nijedno dugme ne obećava lažnu funkciju (T06).
- [ ] 4.1.6 Export CSV/Excel i Generate PDF Report: poštuju filtere, sortiranje i prava; ceo skup, ne samo stranica.
  Provera: izvoz sa 30 redova i stranicom 10 → fajl ima 30 redova istim redosledom; kao HR izvoz bez B2C kolone (T26); T02.
- [ ] 4.2.1 Kartica **Total Assignments** = broj jedinstvenih Assignment zapisa u filtriranom obuhvatu.
- [ ] 4.2.2 Kartica **Active Workers** = jedinstveni radnici (T01).
- [ ] 4.2.3 Kartica **Active Projects** = različiti projekti sa aktivnim radnikom.
- [ ] 4.2.4 Kartica **Expiring This Month** = End Date u tekućem kalendarskom mesecu, nije završeno; period jasno prikazan.
  Provera 4.2.x: vitest za svaku formulu sa graničnim datumima (kraj meseca, već završen); kartice prate filtere (T02).
- [ ] 4.3.1 Donut **Assignments by Status** (Active/Upcoming/Ending Soon/Completed, broj i %), klik na segment postavlja filter (T03).
- [ ] 4.3.2 Bar **Assignments by Project**; View all otvara filtriranu listu, klik na projekat otvara njegove dodele (T04).
- [ ] 4.3.3 **Workers Available for Reassignment**: jedinstveni odgovarajući radnici slobodni za izabrani dan/smenu; klik otvara Workforce Planning (T05).
- [ ] 4.3.4 **Assignments Ending Soon** = budući istek u narednih 30 dana, različito od Expiring This Month; klik otvara filtriranu listu.
- [ ] 4.3.5 **Workforce Shortages**: broj projekata sa deficitom po ulozi i smeni u periodu; klik vodi u Workforce Planning.
- [ ] 4.3.6 Sve kartice, grafici i tabela koriste isti skup filtera, isti referentni datum i ista prava (T02).
  Provera: jedna funkcija izvodi skup (`src/lib/…`) koju koriste tabela, KPI, grafici i izvoz — grep pokazuje zajednički izvor.
- [ ] 4.4.1 Statusi Completed / Upcoming / Ending Soon (≤30 dana) / Active izvedeni iz datuma, međusobno isključivi.
  Provera: vitest `assignmentStatus` sa granicama (danas = start, danas = end, end za 30 i 31 dan).
- [ ] 4.4.2 Status po datumu i vremenskoj zoni projekta; oznaka perioda/ref. datuma na ekranu.
  Provera: projekat ima `timezone`; test sa projektom u drugoj zoni oko ponoći; ekran prikazuje „as of {datum}".
- [ ] 4.5.1 A2 **Add Assignment**: Employee, Project, Job Role, datumi, B2C, opciona posebna B2B tarifa.
  Provera: dodela kreirana iz dijaloga → red u `project_assignments` + tarife u `rates` sa effective_from; pojavljuje se u Workers, Timesheets, Workforce (4.5.5).
- [ ] 4.5.2 **Reassign**: Transfer zatvara staru i pravi novu dodelu; Additional pravi dodatnu bez ukidanja; istorijski sati ostaju.
  Provera: pgTAP/vitest: posle Transfer stara ima `end_date`, nova počinje sledeći dan; satnice stare dodele nepromenjene (broj i iznosi).
- [ ] 4.5.3 **Edit**: uloga, datumi, buduće tarife sa efektivnim datumom i revizijskim tragom.
  Provera: izmena tarife od datuma X ne menja redove pre X; audit red u `audit_log`.
- [ ] 4.5.4 **End Assignment** od zadatog datuma; Timesheets, obračuni i izvodi ostaju.
- [ ] 4.5.5 Izmena se odražava u Overview/Workers, Workforce Planning i izveštajima; konflikt istih radnih intervala sprečen.
  Provera: pgTAP — dve dodele istog radnika sa preklapajućim intervalom iste smene → greška; bez preklapanja → OK.

## §5 Satnice, istorija, koeficijenti

- [ ] 5.02 Obe tarife (B2B i B2C) imaju Effective From, opciono Effective To, iznos, valutu i istoriju izmena; izmena ne prepisuje stari iznos.
  Provera: „Promeni od datuma" zatvara stari red (`effective_to`) i pravi novi; `audit_log` red; upit istorije za tarifu vraća oba reda.
- [ ] 5.03 Jednoznačna tarifa na datum rada; preklapajući/kontradiktorni zapisi odbijeni u bazi; nedostajuća tarifa = vidljiva greška pre finalnog obračuna.
  Provera: pgTAP — insert preklapajućeg reda istog nivoa → exception (exclusion constraint/trigger); satnica bez tarife → prikazana greška, ne može u finalni obračun.
- [ ] 5.04 B2B polazi od Job Role, izuzetak po angažovanju; B2C vezan za radnika/angažovanje i projekat; profil radnika nije izvor tarife (D30 K5).
  Provera: `rateEngine`/`resolve_timesheet_rate` ne čita profil; vitest/pgTAP za redosled: izuzetak po angažovanju > Job Role.
- [ ] 5.08 Primer: 8 h × B2C 45 × 1.0 = 360 EUR trošak; 8 × B2B 50 × 1.0 = 400 EUR prihod (Payroll Cost po spec-u, D30 K4).
  Provera: vitest `it("§5 primer 8×45=360, 8×50=400")` i isti brojevi na Financial Report i Dashboard za taj slučaj.

## §6 Timesheets

- [ ] 6.01 Zapis ima Employee, Project, **Assignment**, datum, planiranu/realnu smenu ili vreme od-do, broj sati, vrstu rada, status, odobrio.
  Provera: `\d timesheets` (ili nova tabela unosa) — `assignment_id` NOT NULL za nove, polja za vreme/smenu; UI unos ih prikazuje.
- [ ] 6.02 Statusi Draft → Submitted → Approved/Rejected; odobravaju samo korisnici sa pravom odobravanja (D30 K1), ne samo admin.
  Provera: pgTAP — PM sa pravom odobri; HR bez prava → 42501; prelaz Draft→Approved bez Submitted odbijen (ako spec tok to zahteva).
- [ ] 6.03 Bez preklapajućih intervala i neprihvatljivog zbira sati istog dana preko projekata; validacija u UI **i** na serveru.
  Provera: T10; pgTAP insert preklapanja → greška; UI prikazuje poruku pre čuvanja.
- [ ] 6.04 Samo Approved ulazi u konačni Payroll i B2B prihod; Submitted samo kao procena, nikad u konačne KPI (T09).
- [ ] 6.05 Odobren zapis zaključan; korekcija traži razlog, ovlašćenje, audit trag i kontrolisani ponovni obračun pogođenog perioda (D30 K11).
  Provera: pgTAP — vraćanje u nacrt bez razloga → greška; sa razlogom → audit red (ko, kada, zašto, stare vrednosti); zaključan mesec (payroll run) označen za ponovni obračun.
- [ ] 6.06 Timesheet Overview, Monthly Payroll i izveštaji koriste iste odobrene sate (bez nezavisnih algoritama).
  Provera: za isti mesec zbir sati/iznosa jednak na sva tri ekrana; jedna funkcija u `src/lib/payroll`.
- [ ] 6.07 Tarifa po datumu rada, ne po početku nedelje (D30 K12) — T07.

## §7 Payroll — obaveze i isplate

- [ ] 7.01 Obaveza prema radniku (direktan) ili prema Vendoru (podizvođač), uz razradu po radniku (T12).
- [ ] 7.02 Po obračunskom periodu: Calculated/Payable, Paid, Remaining Balance, Due Date (kad postoji), status Unpaid / Partially Paid / Paid.
  Provera: ekran isplata sa svim kolonama; status izveden funkcijom sa vitest testom (0, delimično, puno).
- [ ] 7.03 Više Payment zapisa po obavezi: datum, iznos, valuta, referenca, opis, korisnik koji je evidentirao.
  Provera: `\d payments`; unos 2 uplate kroz UI → 2 reda sa `created_by`.
- [ ] 7.04 Remaining = potvrđena obaveza − zbir uplata; isti Payment ne može dvaput; preplata odbijena bez evidentirane korekcije.
  Provera: T11; pgTAP — preplata → greška; duplo povezivanje istog payment-a → greška (unique).
- [ ] 7.05 Obračunati trošak prikazan odvojeno od stvarnog odliva; neplaćeno nikad kao plaćeno (T17).
- [ ] 7.06 Filter/izvoz po periodu, projektu, radniku, vendoru, statusu isplate, dospelosti; finansijski detalji samo ovlašćenim ulogama.
  Provera: izvoz CSV sa filterima; kao HR stranica/upit/izvoz odbijeni (T26).
- [ ] 7.07 Postojeći mesečni obračun neto/bruto ostaje (D30 K4) ali nije izvor troška projekta.
  Provera: Monthly Payroll radi kao pre (regresija); Financial Report i Dashboard koriste B2C × koef (5.08).

## §8 Project Costs (C1 → C2)

- [ ] 8.1.1 Costs kartica u projektu: ukupan iznos, tabela, pregled, Add/Edit/Delete, filteri kategorija/potkategorija/datum, izvoz Excel/CSV; projekat automatski.
- [ ] 8.1.2 Obavezno Project, **Cost Date**, Amount, Currency, Category; Subcategory obavezna samo ako kategorija ima potkategorije.
  Provera: pgTAP — insert bez `cost_date` ili bez subkategorije za kategoriju sa potkategorijama → greška; bez potkategorija → OK; postojeći redovi backfill `cost_date = created_date`.
- [ ] 8.1.3 Opciono Worker/Vendor, Billable to Client, Receipt/Invoice fajl, Notes (Description/Notes u tabeli).
  Provera: kolone postoje; upload fajla radi i fajl se otvara samo ovlašćenima.
- [ ] 8.1.4 Category/Subcategory povezani sa Settings → Cost Categories (po ID-u, sa snimkom imena).
  Provera: `project_costs.cost_category_id` FK; preimenovanje kategorije ne kida istoriju (prikaz snimka ili novog imena dosledno).
- [ ] 8.1.6 Trošak se odmah vidi u Financial Report; trošak već knjižen kroz Payroll ne može ponovo kao Additional Project Cost.
  Provera: posle Add Cost Financial Report (bez reload-a / posle invalidacije) pokazuje iznos; pokušaj unosa troška sa kategorijom/vezom koja duplira payroll → odbijen.
- [ ] 8.2.1 Centralna tabela: Date, Project, Category, Subcategory, Description, Amount, Currency, Actions (+ Worker/Vendor, Billable).
- [ ] 8.2.2 Pretraga + filteri Project/Client/Category/Subcategory/Cost Date, sortiranje, izvoz filtriranog skupa Excel/CSV/PDF.
- [ ] 8.2.3 Ukupno po filtrima i analitika po kategorijama; bez sabiranja različitih valuta bez kursa i datuma (T28).
- [ ] 8.2.4 Billable je samo oznaka — ne pravi račun, stavku ni prihod (T15).
- [ ] 8.2.5 Oba pogleda dele iste podatke, istorija izmena (audit), trošak se ne pojavljuje dvaput (T13).

## §9 Client Billing Overview (bez faktura)

- [ ] 9.01 B2B obračun = Approved Hours × važeća B2B × Client Coefficient, grupisano po klijentu, projektu i periodu; pregled po radniku/ulozi; ukupno i valuta; izvoz CSV/Excel i PDF.
  Provera: vitest sa 2 radnika i 2 uloge; izvoz sadrži iste zbirove kao ekran.
- [ ] 9.02 Status obračuna In Preparation / Ready for Accounting / Sent to Accounting / Invoiced Externally; ručni prelazi, ko i kada sačuvano.
  Provera: promena statusa → `audit_log`/kolone `status_changed_by/at`; nema akcije „izdaj račun".
- [ ] 9.03 Opciona ručna evidencija eksternog računa: referenca/broj, datum izdavanja, iznos, valuta, datum dospeća — bez stavki fakture.
- [ ] 9.04 Client Payment: datum, iznos, valuta, referenca, klijent/projekat/period, opciona eksterna referenca; više delimičnih; korekcija sa audit tragom.
- [ ] 9.05 Outstanding = eksterno fakturisani iznos − uplate; status Unpaid/Partially Paid/Paid; bez eksternog iznosa „Estimated Unpaid" (ne kao potvrđeno potraživanje).
  Provera: T16; vitest za slučaj bez eksternog iznosa → oznaka Estimated Unpaid.
- [ ] 9.06 Billable Project Costs odvojeno kao kandidati za dodatni eksterni obračun, bez uvećanja B2B prihoda; isti trošak se ne broji dvaput (T15).
- [ ] 9.07 Van obuhvata: nema kreiranja/PDF faktura, slanja, numeracije, PDV, knjiženja, e-faktura, naloga, bankovnih integracija (T29).

## §10 Financial Reports

- [ ] 10.01 Labor Revenue, Payroll Cost (B2C × worker coef), Labor Margin, Net Project Profit, Profit Margin % (samo kad prihod > 0) — tačno po formulama spec-a.
  Provera: vitest `it("§10 formule …")` sa ručno izračunatim primerom; isti brojevi na ekranu.
- [ ] 10.02 Interni obračun i procena profitabilnosti odvojeni od eksterno fakturisanog iznosa, primljenih uplata i stvarnih Payroll isplata; oznaka „nije zvanični bilans".
- [ ] 10.03 Filteri Project, Client, period, Employee, Job Role, Cost Category (po pravima); izvoz PDF i CSV.
- [ ] 10.04 Više valuta: po valuti ili uz transparentan kurs i datum konverzije; originalni iznosi sačuvani (T28).
- [ ] 10.05 Izveštaji i Dashboard koriste isti obračunski servis; potvrđeni istorijski rezultati stabilni; korekcije eksplicitne i auditovane (T27).

## §11 Staff Management, Vendors, Documents, postojeći moduli

- [ ] 11.01 Jedinstven profil radnika + kvalifikacije; direktni status i pripadnost Vendor firmi sa datumima važenja i istorijom.
  Provera: kvalifikacije/sertifikati na profilu (koriste se u §12/§14); istorija pripadnosti vendoru sa datumima.
- [ ] 11.02 Vendors: firme, povezani radnici, ugovorni periodi, obaveze plaćanja.
  Provera: stranica vendora prikazuje radnike i otvorene obaveze (§7).
- [ ] 11.06 Documents: radnik, tip (šifarnik), datum izdavanja/isteka, fajl, status, pravila pristupa; Onboarding referencira iste dokumente.
  Provera: `documents.issue_date`, tip kao FK; RLS za osetljive tipove (HR/Admin).
- [ ] 11.07 Attendance/Schedule/Tasks/Leave/Notifications/Reports zadržani i povezani sa Workforce Plan i upozorenjima; bez paralelnih kalendara.
  Provera: odsustvo iz Leave Requests vidljivo na Gantt-u; regresija postojećih stranica.
- [ ] 11.08 Settings kao izvor: Departments & Positions = Job Roles, Cost Categories, Coefficients & Holidays, Users/Permissions = prava.
  Provera: Job Role u dodeli bira se iz pozicija; Users/Permissions ekran upravlja ulogama §15.02.

## §12 Project Onboarding i ZIP

- [ ] 12.1.1 Required Documents po projektu + dodatni po Job Role.
- [ ] 12.1.2 Za svaki zahtev: tip, obaveznost, period važenja, uloga/projekat, dozvola izvoza; bez ponovnog upload-a dokumenata koji postoje.
- [ ] 12.1.3 Provera postojanja, tipa i važenja u planiranom periodu; ponavlja se posle izmene uloge, datuma ili dokumenta.
  Provera: promena uloge Fitter→Welder menja status radnika bez ručnog osvežavanja.
- [ ] 12.1.4 Statusi zahteva Available / Missing / Expired / Expiring Soon / Not Permitted to Export; radnik Ready for Onboarding / Action Required sa spiskom razloga.
  Provera: vitest `onboarding.js` za svaki status.
- [ ] 12.2.1 Izbor jednog/više radnika → ZIP samo sa zahtevanim, postojećim i dozvoljenim dokumentima.
  Provera: raspakovan ZIP sadrži tačno očekivane fajlove.
- [ ] 12.2.2 Preview pre preuzimanja: projekat, radnici, nazivi dokumenata, isteci, nedostaci, zabrane izvoza.
- [ ] 12.2.3 Paket sa nedostajućim/nevažećim obaveznim dokumentom = Incomplete, ne može biti Ready.
- [ ] 12.2.4 Prava po ulozi i osobi; server-side kontrola download-a i sadržaja ZIP-a.
  Provera: T19 — korisnik bez prava direktnim pozivom Edge funkcije/storage URL-a dobija 403.
- [ ] 12.2.5 Audit: ko je pripremio/preuzeo, kada, projekat/radnici, koji dokumenti.
  Provera: `audit_log` red posle preuzimanja sa listom dokumenata.

## §13 Workforce Planning

- [ ] 13.01 Centralni Projects → Workforce Planning i Project → Workforce Plan koriste iste Assignment, Schedule i Leave podatke.
- [ ] 13.02 Gantt: radnici grupisani po projektu i Job Role; dan/nedelja/mesec; detalj po smeni/satu; statusi Assigned, Available, Standby, Leave, Sick Leave, Other Absence, Replacement.
  Provera: screenshot sva tri prikaza i legenda svih 7 statusa.
- [ ] 13.03 Required Workforce po projektu, Job Role, datumu i smeni; menja se tokom projekta.
  Provera: tabela `workforce_requirements`; T20.
- [ ] 13.04 Coverage = realno dostupni kvalifikovani − potrebni, po datumu i smeni; deficit i višak u tabeli i na Gantt-u.
  Provera: vitest `workforce.js` coverage.
- [ ] 13.05 Više projekata i smena bez preklapanja; sprečen konflikt vremena, odsustva i nemogućeg prelaza lokacija (kad je poznat).
  Provera: pgTAP/vitest — dodela u vreme odsustva → greška/upozorenje; preklapanje smena → greška.
- [ ] 13.06 Klik na dan/smenu/deficit: ko pokriva, ko fali, koje zamene se mogu razmotriti.

## §14 Leave Requests i Smart Replacement

- [ ] 14.1.1 Pri zahtevu za odmor simulacija preostalog kapaciteta po svim relevantnim projektima, danima, smenama i ulogama.
- [ ] 14.1.2 Pre odluke prikaz: projekat, pozicija, dan/smena, potrebno, dostupno, tačan deficit (T21).
- [ ] 14.1.3 Bez auto-odbijanja; odobrenje uprkos deficitu samo menadžer sa pravom, obavezno obrazloženje; ko/kada/zašto (T24).
- [ ] 14.2.1 Prvo slobodni i Standby, zatim kvalifikovani za privremeni premeštaj.
- [ ] 14.2.2 Redosled kriterijuma: Job Role → puna raspoloživost → sertifikati → Onboarding Readiness → lokacija/mobilnost → procenjeni B2C trošak.
  Provera: vitest sa kandidatima koji se razlikuju po jednom kriterijumu → očekivan redosled.
- [ ] 14.2.3 Kategorije Full Match / Partial Availability / Transfer Required / Not Eligible uz objašnjenje; dokumenti koji fale nisu skriveni (T22).
- [ ] 14.2.4 Transfer sa drugog projekta prikazuje manjak na izvornom projektu pre potvrde (T23).
- [ ] 14.2.5 Assign Replacement pravi privremenu dodelu (datum/smena) tek posle potvrde ovlašćenog; nema automatskog premeštanja.
- [ ] 14.2.6 Posle potvrde osveženi Gantt, Coverage, Onboarding i kalkulacije; istorija sačuvana.

## §15 Obaveštenja, pristup, kvalitet

- [ ] 15.01 Notifications: odmor na čekanju, novi deficit, kandidat za zamenu, dokument fali/ističe, angažovanje ističe, Timesheet na odobrenju, dospele obaveze i potraživanja.
  Provera: za svaki događaj red u `notifications` (trigger/job) i prikaz na zvoncetu.
- [ ] 15.02 Uloge Admin, Project Manager, HR, Finance (+ ograničenje po korisniku i projektu); `operater` migriran u HR (D30).
  Provera: `select role, count(*) from profiles group by role` bez `operater`; Users ekran dodeljuje uloge; pgTAP po ulozi.
- [ ] 15.03 B2C tarife, isplate, lični dokumenti i ZIP — kontrola na serveru i u eksportima, ne skrivanjem dugmadi.
  Provera: kao HR direktan PostgREST upit `rates?select=amount&kind=eq.b2c` → 0 redova/odbijeno; izvoz bez kolona (T26).
- [ ] 15.04 Audit trail: Assignment, Rate, Timesheet, Leave, Document, Billing Summary, Client Payment, Payroll Payment, Project Cost; preuzimanje osetljivih paketa.
  Provera: `audit_log` (tabela, id zapisa, akcija, stare/nove vrednosti, korisnik, vreme); pgTAP: po jedan insert/update za svaku od 9 tabela → audit red; audit tabela nije izmenljiva od strane korisnika.
- [ ] 15.05 Uvoz/migracija iz Base44 bez gubitka veza i istorije; duplikati identifikovani pre migracije (plan §18, CSV uvoz).
- [ ] 15.06 Serverska validacija: obavezna polja, iznosi, valute, preklapanja vremena, prava, statusi, referencijalni integritet.
  Provera: pgTAP po jedan negativan slučaj za svaku kategoriju.
- [ ] 15.07 Dosledni empty, loading, error i **permission-denied** prikazi na svim novim ekranima; svetla Teamora tema (D23 tokeni, bez hardkodovanih boja).
  Provera: kao HR direktna ruta na finansijski ekran → permission-denied poruka (ne prazan ekran ni tihi redirect bez objašnjenja); grep hardkodovanih hex boja u novim fajlovima = 0.

## §16 Redosled — koraci završenosti

- [ ] 16.0 Korak 0: svi zahtevi statusirani u matrici (vidi §18.1).
- [ ] 16.1 Korak 1: jedan Assignment i jedna tarifa predstavljeni dosledno svuda (2.3.2, 5.02–5.04).
- [ ] 16.2 Korak 2: A1 tabela, 4 KPI, 2 grafika, brze kartice, filteri i izvoz sa stvarnim podacima (§4.1–4.3).
- [ ] 16.3 Korak 3: samo Approved sati; obaveze i delimične isplate tačne (§6, §7).
- [ ] 16.4 Korak 4: Costs tab i centralni pogled dele zapise, bez duplog obračuna (§8.1, T13/T14).
- [ ] 16.5 Korak 5: A2 Edit/Add/Transfer/End + C2 analitika, izveštaji, istorija (§4.5, §8.2).
- [ ] 16.6 Korak 6: Billing Overview, interne B2B kalkulacije, ručne uplate, Financial Reports (§9, §10).
- [ ] 16.7 Korak 7: Onboarding, preview, ZIP, prava (§12).
- [ ] 16.8 Korak 8: Workforce Planning, Gantt, requirements, odsustva, zamene (§13, §14).
- [ ] 16.9 Korak 9: Main Dashboard usaglašen sa modulima, objedinjene notifikacije, integracioni i sigurnosni testovi (§3, §15, T27).
  Provera 16.x: korak je čekiran samo kad su sve njegove stavke iz ove liste čekirane.

## §17 Test scenariji T01–T29 (svaki mora postojati kao imenovan test i proći)

- [ ] T01 Radnik na dva projekta → dva Assignment reda, Active Workers broji jednom.
  Provera: vitest `it("T01 …")` + na ekranu Project Assignments 2 reda i kartica Active Workers = 1 (i na Main Dashboard-u).
- [ ] T02 Filteri Project/Client/Job Role/Status/Date Range daju isti obuhvat za tabelu, KPI, grafike, CSV i PDF.
  Provera: vitest `it("T02 …")` nad zajedničkom funkcijom; ručno: isti filter → broj redova tabele = Total Assignments = zbir donut-a = redovi u CSV = redovi u PDF.
- [ ] T03 Donut statusi čine 100% bez preklapanja; klik na segment filtrira tabelu.
  Provera: vitest `it("T03 …")` (zbir procenata = 100, statusi isključivi); klik na „Ending Soon" → tabela samo Ending Soon.
- [ ] T04 Assignments by Project otvara odgovarajući projekat; Quick Insights kartice vode na realne filtrirane liste.
  Provera: klik na bar projekta → URL i tabela tog projekta; svaka Quick Insights kartica → lista sa brojem redova = broj na kartici.
- [ ] T05 Workers Available proverava realnu slobodnu smenu, ne samo odsustvo aktivnog projekta.
  Provera: vitest `it("T05 …")` — radnik sa dodelom u jutarnjoj smeni je dostupan za noćnu; radnik bez dodele ali na odmoru nije dostupan.
- [ ] T06 A1 bez nefunkcionalnih/obmanjujućih akcija; A2 omogućava Add/Edit/Reassign.
  Provera: svako dugme na Project Assignments radi stvarnu akciju (klik test); nema disabled „coming soon" dugmadi.
- [ ] T07 Tarifa menjana od 15. u mesecu: sati pre i posle koriste svoju tarifu; ranije zaključen obračun ostaje isti.
  Provera: pgTAP `'T07 …'` (nedelja preko 15. deli iznos po danu) + vitest `it("T07 …")`; snimak odobrene satnice iz prethodnog meseca nepromenjen (upit pre/posle).
- [ ] T08 Regular/Overtime/Weekend/Holiday sa različitim worker/client koeficijentima daje dva tačna iznosa.
  Provera: postojeći testovi (payroll.test.js praznik vikendom, pgTAP 03/14) preimenovani/dopunjeni sa `T08` u nazivu i zeleni.
- [ ] T09 Rejected/Submitted ne ulazi u finalni payroll i revenue; Approved ulazi.
  Provera: vitest/pgTAP sa `T09` u nazivu; Payables, Billing i Dashboard za isti period ne sadrže Submitted iznose.
- [ ] T10 Dva projekta u jednom danu bez preklapanja prolaze; preklopljena smena odbijena.
  Provera: pgTAP `'T10 …'` (insert drugog intervala koji se preklapa → exception) + UI poruka pri unosu.
- [ ] T11 Delimične isplate smanjuju Remaining Balance tačno za uplaćeni iznos.
  Provera: pgTAP/vitest `T11`: obaveza 1.000, uplate 300 i 200 → Remaining 500, status Partially Paid; uplata 500 → Paid; uplata +1 → odbijeno (preplata).
- [ ] T12 Vendor radnik ima pojedinačan obračun, a primalac obaveze je Vendor ako tako glasi angažovanje.
  Provera: pgTAP/vitest `T12`; ekran isplata prikazuje Vendor kao primaoca i razradu po radniku.
- [ ] T13 Trošak dodat na Project → Costs odmah postoji i u centralnom Project Costs, samo jednom.
  Provera: UI test + upit `select count(*) from project_costs where …` = 1; vitest `T13` za izvod liste.
- [ ] T14 Cost sa Category/Subcategory i povezanim radnikom ulazi jednom u projektni profit.
  Provera: `projectReport.test.js` `it("T14 …")` sa `employee_id` na trošku.
- [ ] T15 Billable Project Cost prikazan kao kandidat za eksterni obračun, ne kreira fakturu, stavku ni dodatni prihod.
  Provera: vitest `T15` — Labor Revenue nepromenjen; Billing prikazuje trošak u posebnoj sekciji.
- [ ] T16 Ručna referenca i iznos fakture iz drugog programa + dve delimične uplate → tačan Outstanding i Partially Paid; nema izdavanja računa.
  Provera: pgTAP/vitest `T16` (npr. 2.000 − 500 − 700 = 800, Partially Paid); ekran Billing.
- [ ] T17 Dashboard ne meša interni B2B obračun sa eksterno fakturisanim i primljenim uplatama; Payroll Cost sa isplaćenim; profit sa raspoloživim novcem.
  Provera: odvojene, jasno nazvane kartice; vitest `T17` za izvođenje KPI iz različitih izvora.
- [ ] T18 Welder mora imati sertifikat koji Fitter ne mora; nedostatak precizno označen.
  Provera: vitest `T18` (`onboarding.js`); ekran Onboarding: Welder „Action Required: Welder certificate missing", Fitter Ready.
- [ ] T19 ZIP preview prikazuje dozvoljene dokumente i nedostatke; korisnik bez prava ne preuzima osetljive fajlove ni direktnim pozivom.
  Provera: pgTAP/Edge test `T19`; ručno curl/fetch bez prava → 403; preview screenshot.
- [ ] T20 Required Workforce se menja po datumu/smeni, Gantt i deficit odmah prate.
  Provera: vitest `T20`; izmena zahteva u UI → Gantt deficit se menja bez reload-a.
- [ ] T21 Odsustvo koje obara Coverage pokazuje tačan broj nedostajućih po ulozi/smeni.
  Provera: vitest `T21`; dijalog odobravanja prikazuje „Welder · noćna · potrebno 3 · dostupno 2 · deficit 1".
- [ ] T22 Sistem predlaže slobodnog kvalifikovanog radnika; delimično dostupnog označava Partial Match.
  Provera: vitest `T22`; ekran zamena sa kategorijama.
- [ ] T23 Transfer sa drugog projekta prikazuje posledicu po izvorni projekat i traži potvrdu.
  Provera: vitest `T23`; dijalog potvrde sa deficitom izvornog projekta.
- [ ] T24 Odmor uprkos deficitu može odobriti samo menadžer sa pravom, uz obavezan razlog i audit.
  Provera: pgTAP `T24` — HR bez prava → 42501; menadžer bez razloga → greška; sa razlogom → audit red.
- [ ] T25 Promena naziva projekta ili klijenta ne prekida istorijske relacije ni finansijske izveštaje.
  Provera: pgTAP/vitest `T25` — rename projekta/klijenta, izveštaj za prethodni mesec isti iznosi; sve relacije po ID-u (grep da se ne spaja po imenu).
- [ ] T26 Korisnik bez finansijskog ovlašćenja ne vidi privatne B2C isplate niti ih dobija u CSV/PDF izvozu.
  Provera: pgTAP `T26` (HR: select na rates b2c/payments/payables → 0 ili 42501); izvoz kao HR bez B2C kolona.
- [ ] T27 Main Dashboard operativne i finansijske metrike za isti period = izvorni moduli.
  Provera: vitest `T27` (ista funkcija/servis); ručno: Approved Hours, Revenue, Payroll Cost, Costs, Profit, Unpaid, Payables na dashboardu = Financial Reports / Timesheet Overview / Payables / Billing za isti mesec.
- [ ] T28 Nijedan agregat ne sabira EUR i drugu valutu bez transparentnog kursa i datuma.
  Provera: vitest `T28` (agregat sa EUR+RSD bez kursa → odvojeni zbirovi ili greška); pgTAP za `project_costs` kurs + datum konverzije.
- [ ] T29 U Client Billing ne postoji kreiranje, PDF izrada, slanje ni automatska numeracija faktura; izvoz obračuna, ručni status i evidencija uplata rade.
  Provera: grep „invoice number|create invoice|send invoice" u UI = 0; izvoz, promena statusa i unos uplate rade (screenshot).

## §18 Isporuke i definicija završetka

- [ ] 18.1 **Implementation Matrix** ažurna: svaki zahtev i T01–T29 sa statusom Implemented / In Progress / Needs Correction / Not Started i dokazom (fajl/test/ekran).
  Provera: nasumično 10 „Implemented" redova potvrđeno u kodu/testu; nijedan red ne tvrdi Implemented bez dokaza; zbirna tabela tačna.
- [ ] 18.2 **Plan migracije i relacija**: kako se Base44 podaci preuzimaju, validiraju i mapiraju bez gubitka istorije; duplikati pre migracije (CSV uvoz, D30 K7); takođe migracija `assigned_employees` → `project_assignments` i `operater` → HR.
  Provera: dokument u `docs/` sa mapiranjem entitet → tabela, redosledom, proverom duplikata i povratkom (rollback).
- [ ] 18.3 **Fazni plan**: po fazi dokaz funkcionalnosti, demonstracija u aplikaciji, prolaz T-testova iz §17.
  Provera: BACKLOG Phase 7 zadaci vezani za T-brojeve sa `Accept:`; svaka faza ima listu testova koji je zatvaraju.
- [ ] 18.4 **Prava i bezbednost**: testovi osetljivih dokumenata, finansijskih podataka, ZIP izvoza i svih korisničkih uloga.
  Provera: pgTAP fajl(ovi) sa matricom uloga × operacija (Admin, PM, HR, Finance) za rates, payments, payables, documents, billing, ZIP.
- [ ] 18.5a Uputstvo **Assignments** (A1 pregled, A2 Add/Edit/Reassign/End). Provera: fajl u `docs/uputstva/`, koraci odgovaraju stvarnim dugmadima na ekranu.
- [ ] 18.5b Uputstvo **Timesheet Approval** (Draft→Submitted→Approved/Rejected, korekcija sa razlogom).
- [ ] 18.5c Uputstvo **Payroll Payment** (obaveza, delimična isplata, Remaining, vendor kao primalac).
- [ ] 18.5d Uputstvo **Billing Overview / Client Payments** (status, ručna eksterna faktura, uplate, Estimated Unpaid).
- [ ] 18.5e Uputstvo **Onboarding ZIP** (Required Documents, statusi, preview, prava).
- [ ] 18.5f Uputstvo **Leave & Replacement** (simulacija kapaciteta, odobrenje uz razlog, zamene).
- [ ] 18.5g Uputstvo **Dashboard** (filteri, KPI definicije, Action Center, Quick Links).
  Provera 18.5x: kratko (1–2 strane), na srpskom (i EN ako je klijentu potrebno), bez placeholdera, sa nazivima ekrana kakvi su u aplikaciji.
- [ ] 18.6 **Regresija**: ranije funkcionalnosti rade posle promene modela i obračuna.
  Provera: `npm run build && npm test && npm run test:db && npm run lint` zeleno; ručno prolazak kroz sve rute menija bez greške; Monthly Payroll, payslip PDF, bankovni spisak, CSV uvozi, Teamora UI (TEAMORA-CHECKLIST.md) i dalje prolaze.

## Opšte (Phase 7)

- [ ] G.1 `npm run build && npm test && npm run test:db && npm run lint` — sve zeleno.
- [ ] G.2 Migracije samo sa dodeljenim prefiksima, idempotentne, bez brisanja podataka, backfill postojećih redova, ništa `anon`-u (D14); `npm run gen:schema` ažuran; nove tabele u `ENTITY_TABLES`.
- [ ] G.3 Novac samo kroz čiste funkcije u `src/lib/payroll/` (ili `src/lib/`) sa testovima; pravila u bazi sa pgTAP; testovi imenovani po T-brojevima.
- [ ] G.4 Svi novi stringovi na EN/RS/SK (0 ključeva bez `sk`), datumi kroz `dateFormat.js`, boje samo kroz Teamora tokene.
- [ ] G.5 Bez placeholdera, mockup podataka i izmišljenih brojeva; KPI bez podataka = 0/prazno.
- [ ] G.6 Nema grešaka u konzoli na novim ekranima (Project Assignments, Workforce Planning, Billing Overview, Payroll Payments, Onboarding, Leave & Replacement, Reports).
- [ ] G.7 Model podataka po `docs/TEAMORA-DATA-MODEL.md`, bez paralelnih tabela za isti entitet.
