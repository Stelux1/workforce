# Popravke i ponovno testiranje — 14.11.2026 (popodne) — Claude Opus 5.5

Opseg: popravke svih nalaza iz jutarnjeg QA prolaza (ispod) i provera tri ranije netestirane stavke. Kod je menjan; baza je dobila novu migraciju (primenjena sa `supabase migration up`, **bez** reseta). Ništa nije commit-ovano.

## Sažetak
- **Sva 3 nova P0 su zatvorena i ponovo testirana**, zatim svih 8 P2 i 14 od 15 P3 (preostaje povezivanje `<label>` sa poljima u formi radnika), i poznati P0 §9.1 #1 (tarifa 0).
- Iz §9.3 je rešeno 15 od 16 stavki; #15 (neiskorišćene komponente) je namerno ostavljena zbog D12. Iz §9.1 su rešene #1, #5, #7 i #9, a #6 i #8 delimično. #2, #3 i #4 su planirani posao Faze 2 i traže koeficijente od Luke (D5).
- **Ranije netestirano, sada testirano:** poslednji aktivan admin ✅ (i nova zaštita od brisanja naloga); istek potpisanog linka ✅ (server ga odbija posle roka, aplikacija osvežava linkove pre isteka); rad sa više od 500/1000 satnica ✅ (1.110 odobrenih redova, isti zbirovi kao u bazi).
- Verify: `npm run build` ✅ · `npm test` **51/51** (bilo 29) · `npm run test:db` **49/49** (bilo 35). U konzoli nema grešaka ni upozorenja ni na jednom od 25 ekrana, ni u RS ni u EN.

## Šta je urađeno i kako je provereno
| Nalaz | Popravka | Ponovni test |
|---|---|---|
| **P0** zaobilaženje admin stranica (`/Payroll`, `/%70ayroll`…) | `access.js` normalizuje putanju (dekodira, mala slova, kose crte); test `access.test.js` | operater: `/Payroll`, `/Payroll/Reports`, `/Rates`, `/SETTINGS/departments`, `/Email-Notifications`, `/%70ayroll/weekly`, `//payroll`, `/payroll/`, `/Project-Costs/`, `/TIMESHEET-dashboard` → `/` ✅ |
| **P0** baza prihvata proizvoljne iznose | `guard_timesheet` računa trošak, prihod, zaradu i prekovremeno iz sati × tarifa (D16); `round2` zaokružuje isto kao Postgres | pgTAP: operater upiše 1 / 9.999 / 9.998, baza čuva 96 / 200 / 104; ni admin ne može da upiše drugi iznos ✅ |
| **P0** dupla imena projekata | Radni sati šalju `project_id`; izveštaji (detalj projekta, Fin. izveštaji, Platni spisak, Klijenti) po `project_id`/`client_id`; jedinstven naziv projekta po klijentu; jedinstven ručni red | dupli naziv istog klijenta → „Projekat sa ovim nazivom već postoji kod ovog klijenta." ✅; nov red čuva `project_id` ✅; pgTAP za oba indeksa ✅ |
| **P0 poznat** §9.1 #1 tarifa 0 | tarifa koja fali ostaje prazna (null) uz upozorenje; baza odobrava samo uz tarifu > 0 | QA-Radnik-4: „B2C: nema tarife", upozorenje, Odobri → „Satnica nema tarifu… (ili je 0)…", u bazi `b2c_rate = null` ✅ |
| P2 operater odbija satnicu | baza: odbijanje samo admin; Odobri/Odbij i te opcije u masovnoj izmeni skrivene operateru | operater vidi samo Pošalji ✅; pgTAP 42501 ✅ |
| P2 dokument bez fajla | posle neuspelog otpremanja Sačuvaj je blokiran uz uputstvo („…ili sačuvajte bez fajla"); isto u profilu radnika | lažan PDF → poruka, dugme isključeno; pravi PDF → sačuvano ✅ |
| P2 fajlovi ostaju u Storage-u | sloj podataka briše fajl pri brisanju zapisa (i dokumente obrisanog radnika) i pri zameni fajla | obrisan dokument → objekat nestao iz bucketa ✅ |
| P2 `/login` → Base44 404 | ruta `/login` → `/`; 404 bez Base44 teksta, RS/EN | ✅ |
| P2 kartica klijenta 0 posle preimenovanja | brojke po `client_id` projekta | preimenovanje → odmah 133 h / €2.810 / €1.250 ✅ |
| P2 negativan trošak / tarifa | forma proverava isto kao baza (negativan iznos, „do" pre „od") | ✅ (baza i dalje odbija) |
| P2 brisanje sa vezama, poruka o dobavljaču | poruka po vezi koja smeta (satnice, troškovi, projekti, angažmani, obračuni) + šta uraditi | projekat: „Projekat ima satnice… postavite status Završen."; klijent: „Klijent ima projekte…" ✅ |
| P2 Radni sati na telefonu | traka dugmadi se prelama | 375 px: širina stranice 375, „Dodaj unos" vidljiv ✅ |
| P3 1–15 | jedna poruka i osvežavanje u nedeljnom obračunu; 5 MB i provera sadržaja fajla (PDF/JPG/PNG/WEBP/HEIC), `accept` na inputu; zaštita od dvostrukog klika; zadatak obrisanog radnika „Nedodeljeno" (i trigger u bazi); pauza duža od smene; jedinstven Ref (`2026W48-EMP-005-QA-001`); „Radnik/Projekat nije pronađen" umesto spinnera; tekst za primaoce i promenljive u mejlu; izmene u tabeli se ne gube posle greške; ispravljeni tekstovi poruka i prevod poruka baze na EN; lokalni favicon i naslov; `aria-describedby` za dijaloge; pozicija bez automatskog prevoda; „Mesec … je već zaključan"; OPIS dopunjen | sve ručno provereno u pregledaču, osim zaštite od duplog klika (proverena dvostrukim klikom u skripti: nastao je 1 zadatak) |
| §9.3 #4 i #10 (padovi) | pozicije kao objekat; prazan datum koristi drugi datum; **error boundary** po stranici | masovna izmena sa odeljenjem ✅; brisanje datuma ✅; boundary nije izazvan jer padova više nema |
| §9.3 #9 rođendani, #8 status dokumenta, duplirana kartica | kalendarski dani; status iz roka (`documentStatus`); kartica „Istekli dokumenti" | R1 danas „Danas!", R2 sutra „Sutra" ✅ |
| §9.1 #7, #6, #8, #9 | fin. izveštaj projekta samo odobrene (ostale odvojeno); „ostaje nama" oduzima EUR troškove (D8); „Generiši" osvežava obračune na čekanju, zastareo ne može u „Plaćeno"; svi spiskovi čitaju sve redove | P1: 3.672 − 100 = 3.572 ✅; R2 780 → 792 € posle izmene, „Plaćeno" blokirano, R1 (već plaćen) upozorenje ✅ |
| §9.2 PDF i ISO godina | datumi iz reda, broj projekta u koloni, ISO godina | PDF: „QA-002"; 29.12.2025 → 2026W01 ✅ |
| §9.3 #12–14 | RSD isključen uz objašnjenje (D2); mobilni meni iz iste konfiguracije kao bočni; prevodi i datumi (`formatDate`, srLatn); 38 duplih ključeva uklonjeno; statusi prevedeni (`StatusBadge`) | prolaz kroz 25 ekrana: u RS nema engleskih UI reči, u EN nema srpskih ✅ |

## Ranije netestirane stavke
- **Poslednji aktivan admin** (SQL u transakciji sa `rollback`, uloge nisu trajno menjane): promena uloge, gašenje i **brisanje auth naloga** poslednjeg admina → „Mora da ostane bar jedan aktivan admin" (brisanje je nova zaštita, trigger `profiles_guard_last_admin_delete`); kad postoji drugi admin, promena prolazi. Posle testa: admin/operater kao pre.
- **Istek potpisanog linka:** link sa rokom 5 s → odmah 200, posle 7 s 400 `"exp" claim timestamp check failed`. Aplikacija sada osvežava podatke (pa i linkove) na 45 min i pri povratku na stranicu posle 30 min (`query-client.js`, test u `base44Client.test.js`).
- **Granica od 500 satnica:** PostgREST vraća najviše 1.000 redova po zahtevu; sloj podataka sada čita u delovima. Ubačeno 1.104 odobrenih QA satnica (`notes = 'QA-limit-test'`, 2040–2042): Platni spisak 1.236 h / €12.588 / €19.350 / €6.762, Fin. izveštaji po projektu i Klijenti — isto kao SQL zbir ✅. Test redovi su posle toga vraćeni u nacrt i obrisani (samo oni sa tom oznakom).

## Šta nije urađeno (i zašto)
- §9.1 #2, #3, #4: razvrstavanje sati (prekovremeni/vikend/praznik), jedan izvor tarife i satnica iz profila radnika su Faza 2 i traže koeficijente od Luke (D5).
- RSD troškovi se ne preračunavaju: nema kursa (D2, Faza 3/4).
- Podaci firme i logo u PDF-u (NEEDS-USER), servis za mejl (Faza 5), uklanjanje `@base44/sdk` (Faza 5).
- Forma radnika: `<label>` i dalje nije povezan sa poljem (pristupačnost, P3).
- Fajl koji se otpremi u formu koja se posle zatvori bez čuvanja ostaje u bucketu.
- Operater i dalje preko API-ja može da upiše tarifu u nacrt/poslatu satnicu (D3). Iznosi su sada usklađeni sa tarifom, ali tarifu pri odobravanju mora da proveri admin, dok Faza 2 ne uvede izbor tarife u bazi.

## Izmenjeni fajlovi
- Baza: `supabase/migrations/20261114120000_qa_popravke.sql` (nova), `supabase/tests/02_qa_popravke.test.sql` (nov, 14 testova).
- Sloj podataka i logika: `src/api/base44Client.js`, `src/api/errors.js`, `src/lib/access.js`, `src/lib/query-client.js`, `src/lib/payroll/money.js`, `src/lib/payroll/timesheet.js` (nov), `src/lib/documentStatus.js` (nov), `src/lib/timesheetReport.js`, `src/lib/timesheetPdf.js`, `src/lib/PageNotFound.jsx`; testovi `access.test.js`, `base44Client.test.js`, `documentStatus.test.js`, `timesheetReport.test.js`, dopunjeni `payroll.test.js` i `errors.test.js`.
- Ekrani: `App.jsx`, `index.html`, `public/favicon.svg`, `layout/{AppLayout,Sidebar,MobileNav,AppSettingsBar,navConfig}`, `shared/{ErrorBoundary,PageHeader,StatusBadge}`, `ui/dialog.jsx`, Radni sati, Platni spisak, Nedeljni obračun, Fin. izveštaji, Klijenti, detalj projekta (`ProjectFinancialReport`, `ProjectRoles`, `ProjectEmployees`), Zaposleni, forma i profil radnika, Dokumenti, Izveštaji, Početna, Prisustvo, Raspored, Zadaci, Email poruke, Odeljenja, Kategorije, Dobavljači, Tarife, Troškovi, Pregled radnih sati, `TimesheetPreviewModal`.
- Prevodi (Sonnet pomoćni agent): `translations.js` (`useL`, uklonjeni duplikati), `dateFormat.js` i `documentCategories.js` (novi), Email poruke, Projekti, Kategorije, Odsustva, Zadaci, Dokumenti, Početna, datumi na ekranima obračuna, Prisustvu, Rasporedu i u profilu.
- Dokumenti: `DECISIONS.md` (nova **D16**), `OPIS-APLIKACIJE.md` (napomena na vrhu, rešene stavke u §9 označene ✅), ovaj fajl, `BACKLOG.md` (tri nova zadatka).

## Stanje podataka posle ovog kruga
- Dodato: satnica QA-Radnik-4 / QA-001 u nedelji 23.11.2026 (poslata, bez tarife), zadatak `QA-Zadatak-Dvoklik`, prisustvo QA-Radnik-3 10.11.2026 (noćna smena, 7,5 h).
- Izmenjeno: R2 / QA-Projekat-1 u W45 ima 7 h u ponedeljak (31 h, odobreno); nedeljni obračun R2 je osvežen na 61 h / €792; klijent se ponovo zove `QA-Klijent`.
- Obrisano (moji QA podaci): dupli nacrt R1 u W46, dokument `QA-Dok-Posle-Popravke` (i njegov fajl), 1.104 test satnice.
- Dev server je bio ugašen tokom rada; ponovo je pokrenut iz `.claude/launch.json` („radnici-dev").

## Zaključak
- ✅ Svi nalazi QA prolaza koji ne čekaju Lukine podatke ili planirane faze su zatvoreni i ponovo provereni; verify je zelen.
- Prava upotreba novca i dalje čeka Fazu 2 (koeficijenti, jedan izvor tarife) i Fazu 3 (mesečni obračun neto/bruto), kao što piše u BACKLOG-u, plus postojeći `[review]` zadatak pre prve isplate.

---

# QA nalazi — 14.11.2026 — Claude Opus 5.5 (Claude Code, desktop sesija)

Opseg: ceo master prompt (Faze 0–6) nad lokalnom aplikacijom (`localhost:5173`, Supabase u Dockeru). Kod, migracije i `.env.local` nisu menjani; jedini izmenjen fajl je ovaj.

## Sažetak
- **Novi nalazi: 3 × P0, 0 × P1, 8 × P2, 15 × P3** (+ prevodi grupisani po ekranu u tabeli „Jezik"). **Poznati, potvrđeni: 34**, od toga **8 se ponaša drugačije** nego u OPIS-u (uglavnom bolje — prikaz grešaka je u međuvremenu popravljen).
- Najvažnije za Luku:
  1. **Zaštita admin stranica se zaobilazi velikim slovima** (`/Payroll`, `/Rates`, `/SETTINGS/departments`, `/%70ayroll/weekly`): operater vidi Platni spisak i Finansijske izveštaje sa svim zbirovima novca. RLS za privatne tabele i dalje drži.
  2. **Baza ne proverava novčane iznose satnice**: operater je preko API-ja upisao 8 h × 12/25 € sa trošak 1 € / prihod 9.999 €, a admin je to odobrio istim klikom „Odobri" — izveštaji sabiraju upisane iznose.
  3. **Dva projekta istog imena kvare novac**: Finansijski izveštaji dupliraju prihod, prazan projekat prikazuje tuđe satnice, a nove satnice za pravi projekat ne mogu da se odobre i mogu da se unesu dvaput.
  4. Tabela usklađivanja (Faza 2) je **potpuno tačna** za današnju logiku — svih 10 ekrana daje očekivane brojke; razlike su samo one poznate (§9.1 #1, #2, #6, #7, #8).
  5. Oba „verovatna pada" su **potvrđena i obaraju celu aplikaciju** u belu stranicu (masovna izmena radnika sa pozicijama; brisanje datuma u Pregledu radnih sati) — nema error boundary.
- **Nije testirano:** poslednji aktivan admin (zabranjeno menjati uloge; pokriva pgTAP); istek potpisanog linka posle 1 h na neosveženoj stranici; sadržaj PDF-a Pregleda radnih sati (samo generisanje); granica od 500 satnica (§9.1 #9); §9.3 #6 (izmena pozicije briše B2C) i #15 (mrtav kod); Supabase Studio kao UI — sve provere baze rađene SQL-om (`psql` u kontejneru) i REST API-jem; obaveštenja (aplikacija ih ne pravi). Dva „presrećem pa čitam" testa (Excel, PDF satnice) rađena su u stranici, bez snimanja na disk.

## Okruženje
- Commit: **nema** — `main` još nema nijedan commit (`git rev-parse` ne radi), ceo projekat je neprateći.
- `npm test`: **29/29** (17 payroll + 12 u novom `src/api/errors.test.js`; OPIS kaže 17). `npm run test:db`: **35/35**. `npm run build`: **prolazi**. Ponovljeno na kraju: build ✅, test 29/29 ✅.
- Kod se menjao tokom dana: `App.jsx`, `lib/errorToasts.js`, `lib/query-client.js`, `api/errors.js`, `api/base44Client.js`, `ui/sonner.jsx`, `Timesheets.jsx`, `EmployeeForm.jsx`, `EmployeeDetail.jsx`, `Documents.jsx`, `EmailNotifications.jsx` izmenjeni 11:19–11:21, posle OPIS-a (10:09). Zato poruke (toast) i greške sada **jesu vidljive**.
- Sesije: tab `localhost:5173` = admin, tab `[::1]:5173` = operater (dva origin-a → dve nezavisne prijave). Pre početka je tab bio prijavljen kao operater.
- **Zaključan mesec:** da — **mart 2026**, `lock_month('2026-03-15')` u 10:54:35 UTC, posle SQL provere da u 23.2.–31.3.2026 nema nijedne ne-QA satnice. **Otključan** `unlock_month('2026-03-01')`; `month_locks` je prazan, `payroll_runs` prazan.
- **QA podaci koji su ostali (za čišćenje):**
  - radnici `QA-Radnik-1` … `QA-Radnik-4` (EMP-002…005; R1 ima `employee_private` sa IBAN-om `RS35…0000`, platom 1000, email `qa-radnik-1@example.test`, datum rođenja 14.11.1990; R2 rođen 15.11.1991; R3 ima fotografiju). `QA-Radnik-5` (EMP-006, nastao greškom moje skripte kao „EMP-002 QA" pa preimenovan) je obrisan kroz test brisanja.
  - klijent `QA-Klijent-Novi` (bio `QA-Klijent`); projekti `QA-Projekat-1` (QA-001) i `QA-Projekat-2b` (QA-002); dodela na `/rates` R1→P1 od 1.1.2026; tarifa „QA-tarifa-ok" 15 €/h (P1, trošak).
  - 13 QA satnica (nedelje 2026-02-23, 03-02, 10-19, 11-02, 11-09, 11-16): među njima odobrene u W45/W43/W09/W10 i nacrti/poslate u W46/W47; dva reda u W46 imaju `project_id = null` (test duplikata imena). Da bi se obrisale odobrene, prvo ih vratiti u nacrt (mesec nije zaključan).
  - 2 nedeljna obračuna (W45: R1 „Plaćeno", R2 „Na čekanju"); trošak projekta 100 EUR (P1).
  - odeljenje `QA-Odeljenje-Novo` (pozicije `QA-Pozicija-Preimenovana`, `QA-Pozicija-2`), kategorija `QA-Kategorija-Nova` (+ podkategorija), dobavljač `QA-Dobavljac` (QA-VEN-001), email šablon `QA-Sablon-izmenjen`.
  - dokumenti za R1: `QA-Dok-PDF`, `QA-Dok-EXE-kao-PDF`, `QA-Dok-21MB` i `QA-Dok-DOCX` (poslednja dva bez fajla); 2 zadatka `QA-Zadatak-1` (bez dodele posle brisanja R5).
  - Storage bucket `files`: 7 objekata (3 fotografije R3, 2 PDF dokumenta, 1 „siroče" `QA-slika.png` posle brisanja dokumenta, 1 prilog satnice). Ostavljeni namerno: brisanje fajla na koji pokazuje red u bazi je gore od ostavljanja.
  - Nisu moji i nisu dirani: `QA Klijent` (bez crtice, napravljen 10:22) i zadatak „test" za Marka Testa.

## Tabela usklađivanja novca (Faza 2), popunjena
Satnice 2026W45 (A: R1/P1 46 h · B1: R2/P1 30 h · B2: R2/P2 30 h · D: R3/P1 10 h nacrt), u bazi tačno 552/920/368 · 360/600/240 · 420/750/330 · 120/200/80.

| Ekran | Očekivano | Stvarno | |
|---|---|---|---|
| Radni sati, kartice 2026W45 | 116 h · 1.452 · 2.470 · 1.018 | 116,0 h · €1452 · €2470 · €1018 | ✅ |
| Nedeljni obračun 2026W45 | R1 46/6/552/920/368/40,0 % · R2 60/0/780/1.350/570/42,2 % · R3 — | identično | ✅ |
| Platni spisak | 106 h · 1.332 · 2.270 · 938 · 41,3 % · za isplatu 1.332 | identično | ✅ |
| Platni spisak, Top 5 | R2 570, R1 368 · QA-Klijent 938 | identično | ✅ |
| Fin. izveštaji → Projekti | P1 76 h 1.520/912/608 · P2 30 h 750/420/330 | identično (marža 40,0 % / 44,0 %) | ✅ |
| Fin. izveštaji → Plate/Naplata/Zarada | R1 552, R2 780 · 2.270 · 368/570 | identično | ✅ |
| Detalj P1 → Fin. izveštaj | 86 h · 1.720/1.032/688 | identično | ✅ |
| Detalj P2 → Fin. izveštaj | 30 h · 750/420/330 | identično | ✅ |
| Klijenti → QA-Klijent | 106 h · 2.270 · 938 | identično | ✅ |
| Pregled radnih sati | 116 h, 3 radnika | 116,0 h, 3 zaposlena | ✅ |

Marža = zarada / prihod (1 decimala); satnica na 2 decimale; kartice Radnih sati i Platnog spiska na ceo evro. Detaljna tabela i Faza 2b su u prilogu ispod.

## Nalazi — NOVI (P0 → P3)

### [P0] Operater otvara admin stranice preko velikih slova ili URL-kodiranja
- Ekran / adresa: `/Payroll`, `/Payroll/Reports`, `/Rates`, `/SETTINGS/departments`, `/Email-Notifications`, `/%70ayroll/weekly`
- Uloga: operater
- Koraci: 1. Prijava kao operater. 2. Otvoriti `http://localhost:5173/Payroll`.
- Očekivano: povratak na `/` kao za `/payroll`.
- Dobijeno: otvara se Platni spisak sa 106 h · €1.332 · €2.270 · €938 · 41,3 %, Top 5 radnika i klijenata; `/Payroll/Reports` prikazuje tabelu projekata; `/Rates`, `/SETTINGS/departments`, `/Email-Notifications`, `/%70ayroll/weekly` se otvaraju. RLS i dalje krije `payroll_records`, `rates`, `email_templates` (prazno), upisi se odbijaju.
- Poznato: NOVO (zaobilazi zaštitu iz D3/§4)
- Fajl i red: `src/lib/access.js:12-14` (`path === p || path.startsWith(p + "/")` razlikuje velika/mala slova i ne dekodira), dok React Router rute podrazumevano ne razlikuju velika slova (`src/App.jsx:44-48`).

### [P0] Baza prihvata i odobrava satnicu sa proizvoljnim novčanim iznosima
- Ekran / adresa: `POST/PATCH /rest/v1/timesheets` (isti poziv koji šalje ekran), zatim dugme Odobri
- Uloga: operater (upis), admin (odobravanje)
- Koraci: 1. Operater upiše satnicu QA-Radnik-3 / QA-Projekat-2b, pon 8 h, `b2c_rate 12`, `b2b_rate 25`, ali `worker_cost 1`, `client_revenue 9999`, `profit 9998`, status `submitted`. 2. Admin odobri.
- Očekivano: trošak 96, prihod 200, zarada 104 (ili odbijanje).
- Dobijeno: baza ispravi samo `total_hours` (99 → 8); satnica je **odobrena** sa 1 / 9.999 / 9.998. Svi izveštaji sabiraju `worker_cost/client_revenue/profit` iz reda. (Red je posle testa vraćen u nacrt i obrisan.)
- Poznato: NOVO (povezano sa D11/Fazom 2, ali opis to ne navodi)
- Fajl i red: `supabase/migrations/20261113170000_init.sql:627-645` (`guard_timesheet` računa samo `total_hours`, pri odobravanju proverava samo da tarife nisu `null`); iznosi se računaju u pregledaču (`Timesheets.jsx:147-155`).

### [P0] Dva projekta istog imena: dupliran prihod u izveštajima, satnice ne mogu da se odobre
- Ekran / adresa: Projekti → Novi projekat; Finansijski izveštaji; Radni sati
- Uloga: admin
- Koraci: 1. Napraviti projekat sa imenom koje već postoji („QA-Projekat-1"). 2. Otvoriti njegov Finansijski izveštaj i Fin. izveštaje → Projekti. 3. Na Radnim satima dodati red za originalni „QA-001 · QA-Projekat-1", poslati, Odobri. 4. Ponovo dodati isti red.
- Očekivano: upozorenje ili zabrana duplog imena; izveštaji po ID-u; odobravanje radi.
- Dobijeno: novi prazan projekat prikazuje 92 h / 1.840 € tuđih satnica; Fin. izveštaji imaju dva reda „QA-Projekat-1" po 82 h / €1.640 (prihod dupliran); Odobri → „Satnica mora biti vezana za projekat sa liste da bi se odobrila" iako je projekat izabran sa liste; isti red (radnik+projekat+nedelja) primljen dvaput (`project_id = null`).
- Poznato: NOVO (posledica §9.1 #5 koja nije opisana)
- Fajl i red: `src/pages/payroll/Timesheets.jsx:332` (odbacuje `_project_id`), migracija `:622-625` (ime se razrešava samo kad je jedinstveno), `:526-527` (jedinstveni indeks samo `where project_id is not null`), `ProjectFinancialReport.jsx:13`, `PayrollReports.jsx:91,118`.

### [P2] Operater može da odbije satnicu
- Ekran / adresa: Radni sati (dugme Odbij) / `PATCH timesheets`
- Uloga: operater
- Koraci: satnica u statusu `submitted` → operater postavi `rejected` (i nazad `submitted`).
- Očekivano: odbijanje kao i odobravanje samo admin.
- Dobijeno: baza dozvoljava (200).
- Poznato: NOVO · Fajl: migracija `:630-645` (proverava se samo prelaz u `approved`).

### [P2] Dokument se upiše bez fajla kad otpremanje ne uspe
- Ekran / adresa: Dokumenti → Dodaj dokument
- Uloga: admin
- Koraci: izabrati fajl od 21 MB ili `.docx` → poruka „Fajl je prevelik…" / „Ovaj tip fajla nije dozvoljen…" → Sačuvaj.
- Očekivano: Sačuvaj blokiran ili jasno da fajl nije priložen.
- Dobijeno: „Dokument dodat", red `QA-Dok-21MB` / `QA-Dok-DOCX` sa `file_url = null`.
- Poznato: NOVO · Fajl: `src/pages/Documents.jsx` (dijalog za dodavanje).

### [P2] Obrisani fajlovi ostaju u Storage-u i dostupni su preko potpisanog linka
- Ekran / adresa: Dokumenti → obriši; forma radnika → zamena fotografije
- Uloga: admin
- Koraci: obrisati dokument `QA-Dok-Slika`; zameniti fotografiju 3 puta.
- Očekivano: fajl obrisan iz bucketa `files`.
- Dobijeno: red obrisan, objekat `…QA-slika.png` ostaje; sve tri fotografije ostaju; potpisan link važi još do 1 h i radi bez prijave.
- Poznato: NOVO · Fajl: `src/api/base44Client.js` (`delete` briše samo red; nema brisanja objekta).

### [P2] Prijava sa adrese `/login` vodi na Base44 404
- Ekran / adresa: `/login`
- Uloga: neprijavljen → admin
- Koraci: otvoriti `/login`, prijaviti se.
- Očekivano: Početna.
- Dobijeno: „404 Page Not Found … Admin Note: This could mean that the AI hasn't implemented this page yet. Ask it to implement it in the chat." (isto i za svaku nepostojeću adresu, samo EN).
- Poznato: NOVO (OPIS §6.26 ne pominje Base44 tekst) · Fajl: `src/App.jsx:72-102` (nema rute `/login`), `src/lib/PageNotFound.jsx:42-52`.

### [P2] Kartica klijenta posle preimenovanja pokazuje 0 h / €0 do osvežavanja
- Ekran / adresa: Klijenti → izmeni naziv
- Uloga: admin
- Koraci: `QA-Klijent` → `QA-Klijent-Novi`, Sačuvaj.
- Očekivano: 106 h / €2.270 / €938 (baza je osvežila `client_name` u svim satnicama).
- Dobijeno: 0,0 h / €0 / €0 dok se ne pritisne F5; posle F5 tačno. Poruka posle čuvanja: „Uredi".
- Poznato: NOVO · Fajl: `src/pages/payroll/Clients.jsx:52` (keš satnica se ne osvežava posle izmene klijenta).

### [P2] Negativan trošak projekta: forma i OPIS ga dozvoljavaju, baza odbija
- Ekran / adresa: Troškovi projekata → Dodaj
- Uloga: admin
- Koraci: iznos −50 EUR → Dodaj.
- Očekivano (OPIS §6.13): upis (npr. knjižno odobrenje).
- Dobijeno: „Iznos ne može biti negativan." (`project_costs.amount >= 0`). Isto za tarife (OPIS §6.14 kaže da se negativan iznos i „do" < „od" ne proveravaju — baza oba odbija).
- Poznato: NOVO (neslaganje opisa/forme i baze) · Fajl: migracija `:445`, `:423`, `:438`.

### [P2] Brisanje projekta/radnika/klijenta sa vezama: odbijeno, poruka pominje dobavljača
- Ekran / adresa: Detalj projekta → Obriši; Profil radnika → Obriši; Klijenti → Obriši
- Uloga: admin
- Koraci: obrisati `QA-Projekat-2b` (ima satnice), `QA-Radnik-4` (ima satnicu), `QA-Klijent-Novi` (ima projekte).
- Očekivano (OPIS §6.12): projekat se briše, satnice ostaju; ili jasna poruka šta smeta.
- Dobijeno: sve odbijeno sa „Ne može da se obriše jer ga koriste drugi podaci (npr. dobavljač koji ima angažmane)."
- Poznato: NOVO · Fajl: migracija `:493` (`project_id … on delete restrict`), `:489`; poruka `src/api/errors.js` (`inUse`).

### [P2] Radni sati na telefonu (375 px): traka dugmadi širi stranicu
- Ekran / adresa: `/timesheets`, širina 375 px (mobilni preset)
- Uloga: admin
- Koraci: otvoriti Radne sate na 375 px.
- Očekivano: sve u širini ekrana.
- Dobijeno: stranica je široka 548 px (prikaz/„Dodaj unos" desno van ekrana), telefon je umanjuje; dijalog za unos ima 7 polja po 64 px. Ostali provereni ekrani (Početna, Zaposleni, Dokumenti, Pregled radnih sati, Platni spisak, detalj projekta, Klijenti) staju, tabele imaju horizontalni skrol.
- Poznato: NOVO · Fajl: `Timesheets.jsx:417-434` (`PageHeader` sa 5 dugmadi).

### [P3] Ostali novi nalazi
| # | Nalaz | Gde |
|---|---|---|
| 1 | „Generiši obračun" kad svi radnici već imaju obračun ne radi ništa i ne kaže ništa; kad radi, poruka „Obračun generisan" se ponavlja po radniku | `WeeklyPayroll.jsx:40,81` |
| 2 | Fotografija „Maks 5MB" se ne proverava (6 MB prošlo), sadržaj se ne proverava (lažan JPG, `.exe` preimenovan u `.pdf` prihvaćen); input za dokument nema `accept` | `EmployeeForm.jsx`, `Documents.jsx` |
| 3 | Dvostruki klik na Sačuvaj pravi dva ista zapisa (zadatak `QA-Zadatak-1` ×2) | `Tasks.jsx` |
| 4 | Posle brisanja radnika zadatak i dalje prikazuje njegovo ime (`assigned_to_name`) | migracija `:321-322` |
| 5 | Prisustvo: pauza duža od smene → 0 h bez upozorenja | `Attendance.jsx` |
| 6 | Isti „Ref ID" za dva reda istog radnika u nedelji (`2026W45-EMP-003` za P1 i P2) | `Timesheets.jsx:158-163` |
| 7 | `/employees/abc` → tri poruke „Podaci nisu učitani…" + večni spinner; nepostojeći projekat → prazna stranica | `EmployeeDetail.jsx`, `ProjectDetail.jsx` |
| 8 | Email: bez čekiranog primaoca „No recipients with email addresses" iako je lista prikazana; pomoćni tekst nudi `{week_start}`, `{amount}`, `{payment_date}` koji se ne menjaju | `EmailNotifications.jsx` |
| 9 | Posle neuspele izmene u tabeli Radnih sati unete vrednosti nestaju, red ostaje u režimu izmene | `Timesheets.jsx:281-301` |
| 10 | Pogrešni tekstovi poruka: „Uredi" posle čuvanja klijenta, „Obriši" posle brisanja, „Dodano"/„Trošak je dodan" (ijekavica), „Employee deleted", „Row added", „Saved", „Updated 1 row(s) to "draft"" u RS; poruke iz baze („Satnicu može da odobri samo admin") i u EN | razni |
| 11 | Favicon se učitava sa `https://base44.com/logo_v2.svg` (spoljni zahtev) | `index.html:5` |
| 12 | Forma radnika i dijalozi: `<label>` nije povezan sa poljem (polja bez dostupnog imena); konzola: „Missing `Description` or `aria-describedby`" za DialogContent | `EmployeeFormFields.jsx`, `ui/dialog.jsx` |
| 13 | Pozicija bez prevoda dobija prevod = naziv; posle preimenovanja ekran i dalje prikazuje stari naziv | `DepartmentsSettings.jsx` |
| 14 | Ponovni `lock_month` istog meseca vraća sirovu poruku `duplicate key … month_locks_pkey` | migracija `:670` |
| 15 | OPIS je zastareo: `npm test` je 29 (ne 17); toast/greške, mejl, neuspelo otpremanje i „€undefined/h" se ponašaju drugačije (vidi poznate) | `OPIS-APLIKACIJE.md` |

### Jezik (P3, jedan red po ekranu)
| Ekran | RS režim: ostaje na engleskom | EN režim: ostaje na srpskom |
|---|---|---|
| Meni | — | grupa i stavka oba „Projects"; mobilni meni samo EN |
| Početna | status „Active", kategorije dokumenata „Contract/Passport/Id Card", datumi „Nov 14" | — |
| Zaposleni / profil | „Active", „Status", „Grid view/List view", kartica „Personal Tab" (ključ prevoda) | — |
| Dokumenti | „Unknown", „Title A → Z", „Status" | — |
| Zadaci | „Medium", „Due", „Archive" | — |
| Odsustva | „Vacation", „Pending" | — |
| Pregled projekata / detalj | — | „Aktivan", „zaposlenih", „Projekti", „Dodaj zanimanje/zaposlenog", „Zanimanja i tarife" |
| Tarife i dodele | naslov „Tarife i dodjele", „Dodjele" (ijekavica) | — |
| Radni sati | statusi „Draft/Submitted/Approved", „Employee A → Z", „Export All PDF", dani „Mon…Sun", „Cost/Rev" u zbiru, poruke „Row added/Saved" | — |
| Platni spisak | „Submitted", „Pending", „Timešiti" | — |
| Fin. izveštaji | „Sedmična rezime" (ijekavica, gramatika), „Pending" | cela kartica Projekti („Svi projekti", „Sati", „Prihod", „Bruto zarada", „Marža") |
| Klijenti | „Manage B2B client accounts", „Add Client", „billing rate" | naslov „Klijent" |
| Pregled radnih sati | — | „Period" (i naslov PDF/Excel „WorkforceHub — Pregled radnih sati") |
| Email poruke | ceo ekran | — |
| Kategorije troškova | „Cost Categories", „Add Category", „New Category", „Create Category" | — |
| Raspored | dani „Mon…Sun", datumi „Nov 9 – Nov 15" | — |
| Izbor jezika se pamti u `app_lang` ✅ | | |

## Nalazi — POZNATI, potvrđeni
- §9.1 #1 satnica bez tarife dobija B2C 0 i admin je odobrava — **potvrđeno** (QA-Radnik-4, 8 h, trošak 0, „zarada" 160 u Top 5).
- §9.1 #2 prekovremeno po redu, preko 40 h — potvrđeno (R2 60 h → 0 OT).
- §9.1 #3 Tarife i dodele ne utiču na satnice — potvrđeno (kalkulator 15 €/h, satnica 12 €/h).
- §9.1 #4 satnica iz profila nema polje — potvrđeno.
- §9.1 #5 veze po imenu — potvrđeno; vidi i novi P0 o duplom imenu.
- §9.1 #6 troškovi se ne oduzimaju, RSD ignorisan — potvrđeno.
- §9.1 #7 fin. izveštaj projekta broji i nacrte — potvrđeno (86 h ↔ 76 h).
- §9.1 #8 nedeljni obračun se ne ažurira — potvrđeno (R1 ostaje 552 € posle izmene na 528 €; označen „Plaćeno" sa starim iznosom; Platni spisak: trošak €1.308 ↔ za isplatu €1.332).
- §9.1 #9 sortiranje po `date` — potvrđeno upozorenjem u konzoli; granica od 500 nije testirana.
- §9.2 mejl ne radi — **ponaša se drugačije**: jasna poruka „Slanje mejlova još nije podešeno", dugme se vraća (ne zaglavljuje na „Sending…"); Mailpit 0.
- §9.2 PDF satnice — potvrđeno (ugrađena „Stelux Construct DOO", kolona „Br. projekta" = klijent; datumi iz izabrane nedelje).
- §9.2 ISO godina — potvrđeno (nedelja 29.12.2025 → „2025W01").
- §9.2 naslov „Base44 APP" — potvrđeno.
- §9.3 #1 toast se ne vidi — **ponaša se drugačije**: vidi se (sonner Toaster montiran).
- §9.3 #2 tihe greške — **ponaša se drugačije**: greške baze se prikazuju razumljivom porukom.
- §9.3 #3 operater vidi Odobri/Odbij/masovne akcije — potvrđeno, ali **sada dobija poruku** („Satnicu može da odobri samo admin").
- §9.3 #4 masovna izmena radnika — potvrđeno, **pad cele aplikacije** (bela stranica).
- §9.3 #5 „€undefined/h" i NaN — **drugačije**: piše „B2C: €/h", pregled zarade „€NaN/h" i „€—/h".
- §9.3 #7 brisanje klijenta bez potvrde — potvrđeno.
- §9.3 #8 status dokumenta „Unknown" — potvrđeno (i za istekli).
- §9.3 #9 rođendani — potvrđeno (danas se ne vidi, sutra „Danas!").
- §9.3 #10 Pregled radnih sati — potvrđeno, **pad cele aplikacije** (`RangeError: Invalid time value`, `TimesheetDashboard.jsx:111`); grupiše po klijentu („other", „Bez firme").
- §9.3 #11 „Otpremanje…" zauvek — **ponaša se drugačije**: poruka „Nema veze sa serverom…" i dugme se vraća (prilog i fotografija).
- §9.3 #12 EUR/RSD — potvrđeno (pamti se `app_currency`, iznosi ostaju u €).
- §9.3 #13 mobilni meni — potvrđeno (9 stavki, samo EN; Odjava na dnu).
- §9.3 #14 prevodi — potvrđeno; Radni sati **više nisu „uvek EN"** (naslovi su na srpskom, statusi i dani EN).
- §9.3 #16 nepostojeći radnik — potvrđeno (večni spinner).
- §4 operater: bankovni podaci se ne upisuju — potvrđeno, **ali sada uz upozorenje** „Saved, but bank details… NOT saved"; troškovi projekta 0 kod operatera — potvrđeno („Project Costs —").
- §6.1 duplirana kartica i rok do danas+31 — potvrđeno.
- §6.2 izbor ostaje posle filtera — potvrđeno.
- §6.4 baner „trenutni" ↔ „● Trenutno" — potvrđeno.
- §6.16 ručni projekat bez naziva prolazi; ručni unos dobija B2C/B2B 0 — potvrđeno.
- §6.21 noćna smena 0 h; §6.22 „do" < „od" u rasporedu — potvrđeno.
- §6.24 / §6.25 preimenovanje odeljenja/pozicije/kategorije ne menja postojeće zapise — potvrđeno.
- D3: operater vidi iznose u satnicama i projektu — nije nalaz (ali vidi i novi P0 o zaobilaženju stranica).

## Provereno i radi
- **Prijava:** pogrešna lozinka → poruka; neprijavljen ne dobija ništa (nijedan `/rest/v1` zahtev); `/` → Početna posle prijave.
- **RLS (API):** operater ne čita `employee_private`, `rates`, `project_costs`, `payroll_*`, `payslips`, `email_templates`, `month_locks`; ne upisuje klijente, šifarnike, praznike, vrste sati, tarife, troškove, privatne podatke; ne menja ulogu ni tuđi profil; ne zaključava/otključava mesec; ne odobrava, ne menja i ne briše odobrene satnice. Anon: 401 svuda. Bucket privatan.
- **Operater kroz ekran:** meni tačan; 9 zabranjenih adresa (mala slova) → `/`; izmena telefona ne briše IBAN/platu; IBAN se ne upisuje; Finansije u profilu prazne; dodavanje klijenta odbijeno uz poruku; vidi i preuzima dokumenta; 15 dozvoljenih ekrana bez grešaka.
- **Novac:** svih 10 ekrana iz tabele usklađivanja; izmena u tabeli preračunava iznose; preimenovanje klijenta/projekta zadržava veze i brojke.
- **Pravila baze:** ponedeljak, 0–24 h, jedan red po nedelji (kad `project_id` postoji), odobrena nepromenljiva, samo admin odobrava, zaključan mesec (i prelazna nedelja), otključavanje, `payroll_runs` samo za zaključan mesec i samo kao nacrt, dupla šifra radnika, kraj ≥ početak, ime bez razmaka, JMBG (kontrolna cifra, dužina, slova), `work_fraction`, negativna tarifa radnika, preklapanje angažmana, podizvođač ↔ dobavljač, brisanje dobavljača sa angažmanom, odsustvo do ≥ od, `client_id` iz imena.
- **CRUD:** radnik (dodaj/izmeni/obriši + kaskada), dobavljač, dokument (+pregled, preuzimanje, brisanje), zadatak, odsustvo, prisustvo, smena, projekat (+pozicija, dodela radnika, brisanje bez veza), trošak (dodaj/obriši sa potvrdom), tarifa, dodela, klijent, nedeljni obračun (generisanje, status), email šablon (dodaj/izmeni), odeljenje, kategorija.
- **Fajlovi:** PNG/JPG/PDF otpremanje; trajna referenca `storage://` u bazi; potpisan link 3600 s; izmenjen/bez tokena/javna putanja → 400; nedozvoljen tip i >20 MB odbijeni porukom; prilog satnice.
- **Izvoz:** Excel Pregleda radnih sati sadrži tačne sate po danu (144 h ukupno); PDF satnice (red i nedelja) sa tačnim satima.
- **Mobilni:** Početna, Zaposleni, Dokumenti, Pregled radnih sati, Platni spisak, detalj projekta, Klijenti staju u 375 px.

## Greške u konzoli po ekranu
| Ekran | Greške / upozorenja (prva linija, broj) |
|---|---|
| Svi ostali ekrani (admin 26 adresa, operater 15) | nema grešaka; samo React Router „Future Flag" upozorenja |
| `/payroll`, `/payroll/weekly`, `/clients` | `[podaci] Sortiranje po nepostojećem polju "date" u timesheets je preskočeno` ×1 po učitavanju |
| `/employees` (masovna izmena, izbor odeljenja) | `Uncaught Error: Objects are not valid as a React child (found: object with keys {name, translation})` ×6 + `The above error occurred in the <span>` ×2 + `Encountered two children with the same key` ×2 → bela stranica |
| `/timesheet-dashboard` (ručni opseg, obrisan datum) | `Uncaught RangeError: Invalid time value` ×10 → bela stranica |
| `/employees/abc` | `[podaci] Employee.list / AttendanceRecord.list / Document.list: invalid input syntax for type uuid` ×6 |
| dijalozi (Klijenti i dr.) | `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}` ×1 po otvaranju |
| očekivano odbijeni upisi | `Failed to load resource: 403/400` + `[podaci] Client.create: … row-level security` (operater), `400` pogrešna lozinka |
| `/employees/edit` (operater, IBAN) | `[podaci] Operater ne može da menja lične/platne podatke radnika — preskočeno` (upozorenje) |

## Zaključak
- **Faza 1 (BACKLOG)** može da krene, ali prvo treba zatvoriti tri nova P0: (1) provera admin adrese bez obzira na velika slova i kodiranje (`access.js`), (2) računanje iznosa satnice u bazi ili bar odbijanje neusklađenih iznosa pri odobravanju, (3) slanje `project_id` iz Radnih sati i zabrana/upozorenje za dupla imena projekata. Uz to dva pada cele aplikacije (§9.3 #4 i #10) i error boundary.
- **Faza 2 (novac)** je blokirana poznatim §9.1 #1 (tarifa 0 se odobrava) i novim P0 o neproverenim iznosima — to treba da reši planirani jedinstveni izbor tarife i obračun na jednom mestu (D4/D11), sa proverom u bazi.
- Prema skill-u bi akcioni nalazi išli i u `BACKLOG.md` kao zadaci sa `Accept:`; to nije urađeno jer master prompt dozvoljava pisanje samo u ovaj fajl.
- Presuda: **BLOCK** za bilo kakvu pravu upotrebu novca dok se ne zatvore 3 nova P0 i poznati §9.1 #1.

---

# Prilog — radne beleške po fazama (14.11.2026)

## Faza 0 — beleške
- Prijava pogrešnom lozinkom → „Pogrešan email ili lozinka" ✅. Ispravna prijava sa `/` → Početna ✅.
- Prijava sa adrese `/login` → posle uspeha 404 (vidi nalaz).
- Naslov taba „Base44 APP" — potvrđeno (§9.2).
- `/nesto-ne-postoji` → 404 „Page Not Found" + Base44 „Admin Note … Ask it to implement it in the chat" (samo EN).

## Faza 1 — beleške
- 1a: neprijavljen na `/`, `/employees`, `/timesheets`, `/payroll`, `/rates` → prikazuje se prijava **na istoj adresi** (nema preusmerenja na `/login`, ali nema ni treptaja podataka; nijedan zahtev ka `/rest/v1`). Po kodu namerno.
- 1b: meni operatera tačno odgovara OPIS §4 ✅.
- 1c: svih 9 zabranjenih adresa malim slovima vraća na `/` ✅ — ALI vidi nalaz o velikim slovima / URL-kodiranju.
- 1d: operater menja samo telefon QA-Radnik-1 → IBAN `RS35…0000` i plata 1000 ostaju ✅ (provereno SQL-om, `employee_private.updated_date` nepromenjen).
- 1d: operater upisuje IBAN → ne upisuje se ✅, i prikazuje se žuto upozorenje „Saved, but bank details, salary and rates were NOT saved…" (OPIS kaže „tiho" — sada ima poruku).
- 1d: profil → Financial kao operater: prazno ✅.
- 1d: operater dodaje `QA-Klijent-Operater` → odbijeno (403, 42501), dijalog ostaje otvoren, poruka „You don't have permission to make this change." ✅.
- 1e (API, operater): `GET` employee_private, rates, project_costs, payroll_runs, payslips, payslip_projects, payroll_records, payroll_params, email_templates, month_locks → `[]` (200) ✅. `profiles` → samo sopstveni red ✅.
- 1e: `POST` clients, department_configs, cost_categories, holidays, hour_types, month_locks, email_templates, project_costs, rates, employee_private → 403 `42501` ✅. `PATCH` hour_types, work_rules, employee_private, sopstveni profil (role=admin), tuđi profil (active=false) → 200 `[]`, ništa nije izmenjeno (SQL) ✅. `DELETE employee_private` → 204, ništa obrisano ✅. RPC `lock_month`/`unlock_month` → 403 „Samo admin…" ✅. Embed `employees?select=employee_private(*)` → `null` ✅.
- 1e (anon): `GET employees/timesheets/profiles/clients`, `POST employees` → 401 `permission denied` ✅; RPC `is_admin` → 401 ✅; storage list → `[]`.
- 1d satnice: operater klikne Odobri na satnicu koju je poslao admin → baza odbija, status ostaje „Submitted", poruka „Satnicu može da odobri samo admin" (na srpskom iako je ekran EN). Masovno „Approved" na nacrt D → odbijeno, dijalog ostaje otvoren uz poruku. Masovno brisanje odobrenog A → „Odobrena satnica ne može da se obriše; prvo je vratite u nacrt" (savet operateru koji to ne sme). Sve proveriti SQL-om: ništa nije promenjeno ✅.
- Bypass (velika slova) sa podacima: operater na `/Payroll` vidi 106 h · €1.332 · €2.270 · €938 · 41,3 % i Top 5; na `/Payroll/Reports` tabelu projekata; „Payroll Due" je €0 jer RLS krije `payroll_records`.

## Faza 2 — tabela usklađivanja (popunjena pre Faze 2b)
Priprema kroz ekran (admin): odeljenje `QA-Odeljenje` (pozicije `QA-Pozicija`, `QA-Pozicija-2`), klijent `QA-Klijent`, projekti `QA-Projekat-1` (QA-001, B2B 20) i `QA-Projekat-2` (QA-002, B2B 25), radnici `QA-Radnik-1/2/3` (EMP-002/003/004), dodele B2C 12/12/12 na P1 i 14 za R2 na P2. Satnice 2026W45 uneo admin kroz dijalog; A, B1, B2 nacrt → Pošalji → Odobri; D ostao nacrt. Posle svakog koraka provereno u bazi.

| Red | Sati | Prekov. | B2C/B2B | Trošak | Prihod | Zarada | Status | Baza |
|---|---|---|---|---|---|---|---|---|
| A | 46 | 6 | 12/20 | 552,00 | 920,00 | 368,00 | approved | ✅ |
| B1 | 30 | 0 | 12/20 | 360,00 | 600,00 | 240,00 | approved | ✅ |
| B2 | 30 | 0 | 14/25 | 420,00 | 750,00 | 330,00 | approved | ✅ |
| D | 10 | 0 | 12/20 | 120,00 | 200,00 | 80,00 | draft | ✅ |

| Ekran | Očekivano (današnja logika) | Stvarno | |
|---|---|---|---|
| Radni sati, kartice 2026W45 | 116 h · 1.452 · 2.470 · 1.018 | 116,0 h · €1452 · €2470 · €1018 (i red zbira isto) | ✅ |
| Nedeljni obračun 2026W45 | R1 46 h, 6, 552/920/368, 40,0 % · R2 60 h, 0, 780/1.350/570, 42,2 % · R3 nema | identično; u bazi `payroll_records` R1 OT 6, R2 OT 0, R2 `b2c_rate` 12 (prvi red); rok 15.11. | ✅ |
| Platni spisak | 106 h · 1.332 · 2.270 · 938 · 41,3 % · za isplatu 1.332 | 106,0 h · €1,332 · €2,270 · €938 · 41.3 % · „Plate na čekanju" €1,332 (2) | ✅ |
| Platni spisak, Top 5 | R2 570, R1 368 · QA-Klijent 938 | R2 €570 (60 h), R1 €368 (46 h) · QA-Klijent €938 (prihod €2,270) | ✅ |
| Fin. izveštaji → Projekti | P1 76 h, 1.520/912/608 · P2 30 h, 750/420/330 | P1 76,0 h €1520/€912/€608 40,0 % · P2 30,0 h €750/€420/€330 44,0 % | ✅ |
| Fin. izveštaji → Plate / Naplata / Zarada | R1 552, R2 780 · faktura 2.270 · zarada 368/570 | Plate R1 €552, R2 €780 · Naplata QA-Klijent 106 h, €2270 · Zarada R1 €368 (40,0 %), R2 €570 (42,2 %) | ✅ (vidi napomenu o „satnici" iz prvog reda) |
| Detalj P1 → Fin. izveštaj (i nacrti) | 86 h, 1.720/1.032/688 | 86,0 h, 1720,00/1032,00/688,00 €, 40,0 %, 3 unosa, prosek 20,00 €/h | ✅ (razlika 76↔86 h = poznato §9.1 #7) |
| Detalj P2 → Fin. izveštaj | 30 h, 750/420/330 | 30,0 h, 750,00/420,00/330,00 €, 44,0 % | ✅ |
| Klijenti → QA-Klijent | 106 h, 2.270, 938 | 106,0 h, €2270, €938 | ✅ |
| Pregled radnih sati | 116 h, 3 radnika | 116,0 h, 3 zaposlena, 1 firma, 38,7 h/zaposleni | ✅ |

- **Marža** = zarada / prihod × 100, zaokruženo na 1 decimalu (570/1350 = 42,2 %; 938/2270 = 41,3 %). Iznosi u satnici zaokruženi na 2 decimale. Kartice na Radnim satima i Platnom spisku zaokružuju na ceo evro (`toFixed(0)`).
- Poznato potvrđeno: R2 ima 60 h, a 0 prekovremenih (§9.1 #2); detalj projekta broji i nacrt (§9.1 #7).
- Napomena (poznato §6.20): „Plate radnika" prikazuje R2 „€12.00/h" i ukupno €780 (60 × 12 = 720); „Naplata klijentu" „€20.00/h" i €2270 (106 × 20 = 2120) — tarifa iz prvog reda, zbir tačan.

## Faza 2b — beleške
1. **Troškovi projekta** (QA-Projekat-1, kategorija `QA-Kategorija`/`QA-Podkategorija`): 100 EUR ✅ i 5.000 RSD ✅ upisani. Fin. izveštaji → P1: „Proj. troškovi €100.00", bruto zarada ostaje €608 (RSD ignorisan, troškovi se ne oduzimaju) — poznato §9.1 #6 potvrđeno. Detalj P1: „100.00 € / 5000.00 RSD", bruto zarada 688 €. **−50 EUR → baza odbija** („Iznos ne može biti negativan.", `project_costs.amount >= 0`), forma to dozvoljava → razlika u odnosu na OPIS §6.13 (vidi nalaz).
2. **Satnica bez tarife** (QA-Radnik-4 / EMP-005 na P1 bez ručne B2C, 19.10.2026, 8 h): pregled u dijalogu „B2C: €0/h · Margin €20.00/h", upisano `b2c_rate 0.00`, trošak 0, prihod 160, zarada 160; **admin odobrio bez prepreke** — poznato P0 §9.1 #1 potvrđeno. Platni spisak posle toga: 114 h, trošak €1,332, prihod €2,430, zarada €1,098 (45,2 %); R4 je u Top 5 sa „€160 zarada".
3. **Zastareli nedeljni obračun:** red A masovno vraćen u nacrt (toast „Updated 1 row(s) to "draft""), subota 6 → 4 izmenom u tabeli. Pre: 46 h, OT 6, 552/920/368. Posle čuvanja reda: **44 h, OT 4, 528/880/352** (izmena u tabeli preračunava; masovna promena statusa ne dira iznose). Posle ponovnog slanja/odobravanja Nedeljni obračun i dalje R1 46 h / €552 / €368; ponovno „Generiši obračun" ne radi ništa i ne kaže ništa. Platni spisak: „Ukupni trošak plata €1,308" a „Plate na čekanju €1,332" na istom ekranu — poznato §9.1 #8.
4. **Preimenovanja:** `QA-Klijent` → `QA-Klijent-Novi`: baza osvežila `client_name` u 2 projekta i svih 5 satnica (i odobrenih) ✅; kartica klijenta odmah posle čuvanja pokazuje 0,0 h / €0 / €0 dok se stranica ne osveži, posle F5 112 h / €2390 / €1082 (vidi nalaz). `QA-Projekat-2` → `QA-Projekat-2b`: fin. izveštaj projekta i Fin. izveštaji i dalje vide 30 h / 750/420/330 ✅. **Drugi projekat sa istim imenom** `QA-Projekat-1` (QA-003, bez klijenta) dozvoljen: njegov fin. izveštaj prikazuje sve satnice originalnog P1 (92 h, 1.840 €), Fin. izveštaji imaju dva reda „QA-Projekat-1" sa po 82 h / €1.640 (prihod dupliran); nova satnica izabrana kao „QA-001" dobija `project_id = null` i **ne može da se odobri**, a isti red (radnik+projekat+nedelja) može da se unese dva puta. Duplikat je posle testa preimenovan u `QA-Projekat-3-duplikat`.
5. **Ručni unos projekta** `QA-Rucni-Projekat` + klijent „Ostalo": upisano `client_name = other`, `b2c_rate = 0`, `b2b_rate = 0`, bez upozorenja; slanje prolazi, Odobri → „Satnica mora biti vezana za projekat sa liste da bi se odobrila". Pojavljuje se samo na Radnim satima (kartice) i Pregledu radnih sati (svi statusi); nikad u novčanim izveštajima (nije odobriva). Ručni unos sa **praznim** nazivom projekta takođe prolazi (red „—") — poznato §6.16.
6. **Negativni i veliki sati:** −5 → dijalog pokazuje „Total: −5.0h", baza odbija: „Sati po danu moraju biti između 0 i 24." ✅; 25 → isto ✅. Dijalog ostaje otvoren, poruka vidljiva.
7. **Dodatno (API):** operater `PATCH` odobrene satnice (u nacrt ili `b2c_rate`) → 403 „Odobrenu satnicu može da menja samo admin" ✅. Operater **može da odbije** poslatu satnicu (`submitted → rejected`) i vrati je u `submitted` — baza dozvoljava. Operater upisuje satnicu 8 h, tarife 12/25, ali `worker_cost 1`, `client_revenue 9999`, `profit 9998`, `total_hours 99` → baza ispravi samo `total_hours` na 8; admin odobri istim zahtevom kao dugme Odobri → **odobreno sa pogrešnim iznosima** (vidi nalaz P0). Red je posle testa vraćen u nacrt i obrisan.

## Faza 3 — pravila baze (beleške)
| Pravilo | Kako izazvano | Ishod | Ekran |
|---|---|---|---|
| Dva ista reda (radnik+projekat+nedelja) | dijalog Radni sati (R2/QA-002/W45) | odbijeno 23505 | „Za ovog radnika, projekat i nedelju satnica već postoji." ✅ |
| — ali kad je `project_id` prazan | duplikat imena projekta / ručni unos | **prolazi** (indeks važi samo `where project_id is not null`) | vidi nalaz |
| `week_start` nije ponedeljak | API admin (2026-11-18) | odbijeno `timesheets_week_start_check` | — ✅ |
| 0–24 h po danu | dijalog (−5, 25) | odbijeno | „Sati po danu moraju biti između 0 i 24." ✅ |
| Izmena odobrene | API admin `mon_hours=9` | „Odobrena satnica se ne menja; prvo je vratite u nacrt" ✅ | — |
| Brisanje odobrene | API admin; masovno brisanje kao operater | odbijeno ✅ | poruka vidljiva |
| Odobravanje samo admin | operater: dugme, masovno, API | odbijeno 42501 ✅ | poruka vidljiva |
| Odobravanje traži tarifu | admin odobrava B2C 0 kroz ekran; API insert `approved` sa 0/0 | **prolazi** (samo `null` se odbija) — poznato §9.1 #1 | — |
| Zaključan mesec | mart 2026 zaključan `lock_month('2026-03-15')` u 10:54:35 UTC posle SQL provere (0 ne-QA satnica u 23.2.–31.3.) | unos u W10 → „Mesec 03.2026 je zaključan" ✅; vraćanje odobrene u nacrt (W10 i prelazna W09 sa 4 h u ned 1.3.) → odbijeno ✅; izmena reda u W09 dodavanjem sati na 1.3. → odbijeno ✅; novi red u W09 samo sa satima 23.2. → dozvoljen (februar nije zaključan) ✅; drugi `lock_month` istog meseca → 409 duplicate key (sirova poruka) | poruke vidljive |
| Otključavanje | `unlock_month` postoji; operater → 403; admin `unlock_month('2026-03-01')` → 204 | **mart 2026 je otključan**, `month_locks` prazan | — |
| `payroll_runs` za nezaključan mesec | API admin (april 2026) | „Obračun može da se napravi samo za zaključan mesec" ✅; za zaključan mart sa `status=approved` → „Novi obračun mora biti nacrt" ✅; nacrt za zaključan mart → dozvoljen (SQL u transakciji, `rollback`) | nema ekran |
| Dupla šifra radnika | forma (EMP-002) | „Ova šifra radnika već postoji. Upišite drugu šifru." ✅ | — |
| Kraj zaposlenja pre početka | forma (10.5. → 1.5.2026) | „Datum završetka ne može biti pre datuma početka." ✅ (forma ne proverava, baza da) | — |
| Ime od samih razmaka | forma („   ") | „Ime ne sme biti prazno." ✅ | — |
| JMBG | API admin na QA-Radnik-1: `…0009` (pogrešna kontrolna), 12 cifara, slova → odbijeno `employee_private_jmbg_check` ✅; `0101990710008` → prihvaćen ✅, zatim vraćen na `null` | — | u formi nema polja (poznato) |
| Ostale provere `employee_private` | `work_fraction 0`, `b2c_hourly_rate −1` | odbijeno ✅ | — |
| Preklapanje angažmana | forma (blokira klijent) i API operater | 23P01 `employment_history_no_overlap` ✅ | „Ovo angažovanje se preklapa…" |
| Podizvođač bez dobavljača / direktan sa dobavljačem | API operater | odbijeno `employment_history_vendor` ✅ | forma ne dozvoljava |
| Angažman kraj pre početka | API | odbijeno ✅ | — |
| Brisanje dobavljača sa angažmanom | ekran (QA-Dobavljac) i API | 23503 ✅ | „Ne može da se obriše jer ga koriste drugi podaci…" |
| Odsustvo do < od | ekran (10.12. → 5.12.2026) | odbijeno ✅ | „Datum završetka ne može biti pre datuma početka." |
| Projekat → `client_id` po imenu | ekran | ✅ (QA-Projekat-1/2 dobili `client_id`) | — |
| Preimenovanje klijenta/projekta | ekran | ✅ osvežava projekte i satnice, i odobrene | vidi keš nalaz |
| Poslednji admin / promena sopstvene uloge | API operater (role=admin, tuđi `active=false`) | 0 redova izmenjeno ✅ | poslednji admin nije testiran (zabranjeno menjati uloge; pokriva pgTAP) |

## Faza 4 — beleške po ekranu (admin; ključne akcije i kao operater)
- **Početna:** R1 rođen 14.11. (danas) se ne prikazuje, R2 rođen 15.11. (sutra) piše „Danas!" (poznato §9.3 #9); dokumenta sa rokom 14.11. (0 d), 14.12. (30 d) i 15.12. (31 d) se broje (3), istekli 1.11. ne; kartica „Dokumenti ističu" duplirana (poznato); kategorije dokumenata na EN („Contract", „Passport", „Id Card") i status „Active" u RS.
- **Zaposleni:** auto-šifra EMP-002 … EMP-007 ✅; pretraga ✅; prikaz liste se pamti (`view_pref_employees`) ✅; izbor ostaje kad pretraga sakrije izabranog (poznato); **masovna izmena → izbor odeljenja koje ima pozicije ruši celu aplikaciju** (bela stranica, `Objects are not valid as a React child (found: object with keys {name, translation})`, `Employees.jsx:354-356`) — poznato §9.3 #4, sada potvrđeno.
- **Forma radnika:** admin izmena datuma rođenja ne dira IBAN/platu ✅; forma nema povezane `<label for>` (polja nemaju dostupno ime); posle uspešnog čuvanja radnika nema poruke o uspehu.
- **Profil radnika:** brisanje QA-Radnik-5 (4 dokumenta, 1 odsustvo, 3 prisustva, 2 smene, 2 angažmana, 2 zadatka) → potvrda ✅, kaskada u bazi ✅, zadacima `assigned_to = null` ali `assigned_to_name` ostaje „QA-Radnik-5 QA". Brisanje QA-Radnik-4 (ima satnicu) → „Ne može da se obriše jer ga koriste drugi podaci (npr. dobavljač koji ima angažmane)." Nepostojeći ID → večni spinner (poznato §9.3 #16); `/employees/abc` → 3 poruke „Podaci nisu učitani: Neko polje ima neispravnu vrednost…" + spinner. Nepostojeći projekat → prazna stranica.
- **Angažmani:** status „Završeno" bez kraja → baner „TRENUTNO Direktan zaposleni", a red bez „● Trenutno" (poznato §6.4).
- **Dobavljači:** dodavanje sa svim poljima ✅, „Aktivni radnici" 0 kad je angažman `ended` ✅; brisanje sa angažmanom odbijeno uz poruku; tekst potvrde „Angažovanja i istorija radnika ostaju nepromenjeni" zbunjuje.
- **Dokumenti:** dodavanje (radnik/naziv/kategorija/rok) ✅; status svuda „Unknown", i za istekli (poznato §9.3 #8).
- **Zadaci:** dodavanje ✅; dvostruki klik na Sačuvaj pravi dva ista zadatka (oba ostala u bazi: `QA-Zadatak-1` ×2).
- **Odsustva:** dodavanje ✅, „do" < „od" odbijeno ✅; lista prikazuje „Vacation"/„Pending" na EN.
- **Prisustvo:** noćna 22:00–06:00 → 0 h (poznato §6.21); pauza 120 min na smeni od 1 h → 0 h bez upozorenja; normalna 8–16 sa 30 min → 7,5 h ✅.
- **Raspored:** noćna smena i „do" < „od" (16:00 → 08:00) prolaze bez upozorenja (poznato §6.22).
- **Projekti:** dodavanje/izmena/preimenovanje ✅; projekat istog imena dozvoljen (vidi nalaz); brisanje projekta bez veza ✅ (bez poruke o uspehu); **brisanje projekta sa satnicama odbijeno** (FK `restrict`) — OPIS §6.12 kaže da se projekat briše a satnice ostaju.
- **Detalj projekta:** pozicija „B2C: €/h" (ne „€undefined/h") i pregled zarade „€NaN/h" bez ručne B2C (poznato §9.3 #5, tekst se malo razlikuje).
- **Troškovi projekta:** dodavanje EUR/RSD ✅, brisanje sa potvrdom ✅, negativan iznos odbija baza; posle preimenovanja kategorije troškovi prikazuju stari naziv (poznato §6.25).
- **Tarife i dodele:** tarifa i dodela ✅; negativan iznos i „do" < „od" odbija baza (forma ne proverava; OPIS §6.14 kaže da se uopšte ne proverava); kalkulator za R1/P1 daje 15 €/h dok satnica koristi 12 €/h (poznato §9.1 #3).
- **Radni sati:** nedelja 29.12.2025 → „2025W01" (poznato §9.2); PDF reda (QA-Radnik-2, W45, 30,0 h) i cele nedelje (4 strane) generisani i dekodirani — sati tačni, „Br. projekta" prikazuje klijenta, ugrađena „Stelux Construct DOO" (poznato). Posle neuspele izmene u tabeli unete vrednosti nestaju a red ostaje u režimu izmene.
- **Pregled radnih sati:** izvoz Excel (24 KB) pročitan: vrednosti po danima tačne, ukupno 144 h, grupe „Bez firme"/„other"/„QA-Klijent-Novi" (grupiše po klijentu, filter piše „Izvođač/Podizvođač" — poznato §9.3 #10); PDF (328 KB) generisan; Excel bez poruke, PDF sa „PDF izveštaj izvezen". **Brisanje datuma „od" u ručnom opsegu ruši celu aplikaciju** (`RangeError: Invalid time value`, `TimesheetDashboard.jsx:111`) — poznato §9.3 #10, potvrđeno.
- **Nedeljni obračun:** promena statusa odmah, bez potvrde (R1 „Plaćeno" sa zastarelih €552).
- **Klijenti:** bez naziva → „Obavezno polje nije popunjeno: naziv." ✅; brisanje bez potvrde (poznato §9.3 #7), poruka „Obriši"; klijent sa projektima se ne briše ✅; posle čuvanja poruka „Uredi"/„Dodano".
- **Email poruke:** šablon dodat i izmenjen ✅; slanje bez čekiranog primaoca → „No recipients with email addresses" iako je lista prikazana; sa čekiranim QA-Radnik-1 → „Slanje mejlova još nije podešeno (nema mejl servisa)." i dugme se vraća (OPIS kaže da zaglavljuje — više ne); Mailpit 0 poruka; pomoćni tekst nudi `{week_start}`, `{amount}`, `{payment_date}`.
- **Odeljenja / Kategorije:** preimenovanje odeljenja i pozicije ✅ (`QA-Odeljenje-Novo`, `QA-Pozicija-Preimenovana`); projekti i dodele zadržavaju „QA-Pozicija" kao tekst; forma sama upisuje prevod = naziv, pa ekran posle preimenovanja i dalje prikazuje stari naziv.
- **Operater:** 15 dozvoljenih ekrana bez grešaka u konzoli; fin. izveštaj projekta „Project Costs —" (poznato §4).

## Faza 5 — fajlovi (beleške)
Fajlovi su pravljeni u stranici (canvas/bajtovi) i ubacivani u `input[type=file]`; preuzimanja su presretana u stranici (ništa nije snimljeno na disk).
- **Fotografija radnika (QA-Radnik-3):** PNG ✅ i JPG ✅ otpremljeni, prikaz preko potpisanog linka, u bazi `storage://files/…` ✅. „JPG" od 6 MB (lažan sadržaj) prihvaćen — ograničenje „Maks 5MB" i sadržaj se ne proveravaju. `.txt` → „Ovaj tip fajla nije dozvoljen (samo PDF i slike)." ✅. Svaka zamenjena fotografija ostaje u bucketu (3 objekta za 1 radnika).
- **Dokument:** PDF ✅, PNG ✅; **21 MB → „Fajl je prevelik (najviše 20 MB)." i .docx → „Ovaj tip fajla nije dozvoljen…", ali dijalog i dalje dozvoli Sačuvaj i dokument se upiše BEZ fajla** (`QA-Dok-21MB`, `QA-Dok-DOCX`, `file_url = null`); .exe preimenovan u .pdf (bajtovi `MZ…`, tip `application/pdf`) prihvaćen. `input` za dokument nema `accept` (izbor fajla nije ograničen).
- **Prilog satnice:** PDF prihvaćen, spajalica u redu ✅ (`accept=".pdf"`).
- **Pregled/preuzimanje:** pregled u `iframe` ✅, link za preuzimanje ✅. **Brisanje dokumenta (`QA-Dok-Slika`) briše red, a fajl ostaje u bucketu** `files`.
- **Potpisan link:** bez prijave (fetch bez kolačića/tokena, kao incognito) → 200 `application/pdf` ✅ (namerno), važi tačno 3600 s (`exp − iat`); izmenjen token / bez tokena / `/object/public/` → 400 ✅. Istek posle 1 h na neosveženoj stranici nije testiran (sesija nije čekala sat).
- **Neuspelo otpremanje** (presretnut `fetch` ka `/storage/v1/object/files` → `TypeError`): i prilog satnice i fotografija prikazuju „Nema veze sa serverom. Proverite internet ili da li baza radi." i dugme se vraća — OPIS §9.3 #11 („Otpremanje…" zauvek) **više ne važi**.
- **Operater:** vidi sva 4 dokumenta i preuzima PDF (200) ✅.

---

# Pregled novčane logike, RLS-a i zaključavanja pre prve prave isplate — 14.11.2026 (veče) — Claude Opus 5.5

Opseg: BACKLOG Faza 3 `[review]`. HEAD `0e50f7f` i ceo diff `011eba8..HEAD` za novac i prava: `src/lib/payroll/*` i njihova SQL ogledala u `supabase/migrations/20261114120000…20261114220000`; RLS, grantovi i prava na funkcije u živoj lokalnoj bazi (`pg_policies`, `information_schema.role_table_grants`, `pg_proc.proacl`); zaključavanje i nepromenljivost (napadi u transakcijama sa `rollback`, REST sa lokalnim anon ključem). `MonthlyPayroll.jsx`, izvoz listića, `ProjectFinancialReport.jsx` i `PayrollDashboard.jsx` drugi agenti upravo menjaju — pregledani su u verziji iz HEAD-a (**u izradi**). Kod, baza i podaci nisu menjani; jedini izmenjen fajl je ovaj.

## Sažetak
- **Novi nalazi: 1 × P0, 4 × P1, 3 × P2, 8 × P3.**
- **P0:** operater kroz običan ekran projekta („Zaposleni na projektu" → prilagođena B2C satnica) upisuje satnicu radnika koja je 2. nivo jedinstvenog izbora tarife (D4) — iznad tarife projekta, tarife radnika i profila koje unosi samo admin. Provera tarife pri odobravanju (D16, migracija 180000) tu satnicu prihvata kao „važeću", admin jednim klikom „Odobri" odobrava, a mesečni obračun isplaćuje iz snimka. Isto bez ijednog broja: operater prebaci tuđu dodelu sa većom tarifom na radnika ili obriše dodelu pa FK kaskada obriše adminovu tarifu.
- Zaključavanje i nepromenljivost drže za svaki put dostupan preko API-ja (21 pokušaj, svi odbijeni ili bez uticaja na novac). `app.snapshot_sync` / `app.payroll_workflow` korisnik ne može da postavi (PostgREST izlaže samo `public`: `rpc/set_config` → PGRST202).
- JS ↔ SQL: nema razlike koja menja iznos; razlike u redosledu kod izjednačenja daju odbijeno odobravanje, ne pogrešan iznos.
- Verify: `npm test` **165/165**, `npm run test:db` **183/183** (7 fajlova). `npm run build` nije pokrenut (piše `dist/` dok drugi agenti rade).
- Presuda: **BLOCK** dok se ne zatvori P0 (minimum na kraju).

## Poznato (već prijavljeno Luki) — potvrđeno u živoj bazi, ne ponavljam
- Svih 6 odobrenih satnica nema `rate_snapshot` (QA-Radnik-1/2 i ostale, odobrene pre Faze 2) → obračun ih ispravno odbija (`payroll_run_problems` #4, `NO_SNAPSHOT`).
- EMP-005 / QA-Radnik-4, nedelja 19.10.2026: odobrena sa `b2c_rate 0,00`, trošak 0 (baza bi danas izabrala 15,00).
- `hour_types`: prekovremeni / vikend / praznik bez koeficijenata (samo redovni 1 / 1).
- `employment_history`: 0 redova — nijedan radnik još ne može da dobije listić (`NO_ENGAGEMENT`).
- `payroll_params` 2026: „potvrditi u Službenom glasniku".

## Nalazi (P0 → P3)

### [P0] Operater određuje satnicu radnika preko projekta i dodela — provera tarife pri odobravanju to prihvata
- Gde: `src/components/projects/ProjectEmployees.jsx:61-70, 84-93, 250-262` (prilagođena B2C satnica, bez provere uloge; `/projects/:id` je operateru dozvoljen), `ProjectRoles.jsx:65-80` (B2B zanimanja); RLS `projects_staff` i `project_assignments_staff` = `for all` za osoblje (`20261113170000_init.sql:944-948`); izbor tarife u bazi čita baš te podatke (`20261114180000_tarifa_pri_odobravanju.sql:75-96, 110-116`); `rates.assignment_id … on delete cascade` (`init.sql:430`, isto `rates.project_id` `:427`).
- Scenario 1 (dokazano, `rollback`): admin u Tarife unese tarifu projekta 12 €/h, profil radnika 14 €/h. Operater na projektu upiše radniku prilagođenu B2C satnicu 99 i pošalje satnicu (pon 8 h). Admin klikne Odobri: `approvalPayload` sam bira 99 (nivo `project_employee`), baza `resolve_timesheet_rate` takođe 99 → **odobreno, `worker_cost 792,00` umesto 96,00**, snimak `{"source": "project_employee", "rate": 99}`; obračun plaća iz snimka.
- Scenario 2 (dokazano, `rollback`): operater promeni `employee_id` dodele „Poslovođa" (adminova tarifa angažmana 25 €/h) na radnika čija je dodela 10 €/h i obriše njegovu dodelu → kaskada obriše adminov red u `rates` (RLS ne važi za FK kaskadu); baza za radnika bira **25,00**. Promena pozicije u dodeli / na projektu isto bira drugu tarifu pozicije.
- Zašto P0: pogrešan iznos za isplatu, kroz ekran, bez API-ja; zaobilazi upravo ono što D16 („broj koji je operater upisao u nacrt") i D3 (operater nema pristup tarifama) treba da spreče. Isti obrazac kao jutarnji P0 „operater upiše, admin odobri istim klikom".
- Popravka (minimum): (1) trigger na `projects` (insert/update): ako nije `is_admin()`, odbij svaku promenu `b2c_rate` / `b2b_rate` u `assigned_employees` i `job_roles` (operaterov nov unos bez tarife); (2) trigger na `project_assignments`: operater ne menja `employee_id` / `project_id` / `position` / datume / status i ne briše dodelu koja ima red u `rates`; `rates.assignment_id` i `rates.project_id` na `on delete restrict`; (3) ekran: polja tarife u `ProjectEmployees` / `ProjectRoles` samo za admina; (4) pgTAP: operater → 42501 za sva tri puta, admin-tok i dalje prolazi.

### [P1] Angažman (zaposlen ↔ podizvođač) menja operater, a od njega zavise porez, doprinosi i kome se plaća
- Gde: RLS `employment_history_staff` (`init.sql:944-948`); `src/components/employees/EmploymentHistoryCard.jsx:58-72` (bez provere uloge); upotreba `payrollMonth.js:340-360`, `monthly.js:68-79`; provera `20261114200000_mesecni_obracun.sql:196-207` poredi listić sa istom tabelom.
- Scenario (dokazano: operater `update employment_history set engagement_type …` prolazi): radnik sa bruto satnicom prebačen u „radnik podugovarača" → listić: isplata = bruto umesto neto, bez poreza i doprinosa, plaća se podizvođaču; baza ne vidi problem. Admin vidi samo oznaku „Podizvođač · …" u redu listića.
- Popravka: upis u `employment_history` samo admin (novčana odluka, D8), ili trigger: operater ne menja `engagement_type` / `vendor_id` / datume; pgTAP.

### [P1] Bruto satnica ispod najniže osnovice daje premalu ili negativnu isplatu, a baza odobrava
- Gde: `serbianPayroll.js:22-25, 50` (doprinosi na punu najnižu osnovicu, neto može < 0), `monthly.js:73` (`payout = calc.neto`), `payrollMonth.js:370-377` (samo upozorenje), `20261114200000_mesecni_obracun.sql:231-233` (proverava samo isplata = neto, ne i ≥ 0).
- Scenario (izračunato bibliotekom, kurs 117,2, najniža osnovica 437,69 €): bruto satnica, 8 h × 6 € = 48 € bruto → doprinosi radnika 87,10 € → **„za isplatu" −39,10 €**, obračun može da se odobri; 16 h × 12 € = 192 € bruto → neto 104,90 €. D17 svesno ne srazmerava početak/kraj rada u toku meseca, ali ovde to više nije samo upozorenje nego pogrešna isplata. Koliko znam, zakon za deo meseca srazmerava najnižu osnovicu — potvrditi sa knjigovođom.
- Popravka (minimum): `payroll_run_problems` odbija `payout < 0`; za `rate_basis = bruto` + `ispod_najnize_osnovice` blokirati dok knjigovođa ne potvrdi pravilo; test u `payroll.test.js` i pgTAP 05.

### [P1] „Ostaje nama" i zarada u izveštajima računaju trošak radnika iz satnice, ne bruto 2 (poznato kao Faza 4, ekrani u izradi)
- Gde (HEAD): `ProjectFinancialReport.jsx:37` (`worker_cost` satnice), `reports.js:106-120` (`projectFinancials` → `timesheetTotals.cost`), `PayrollDashboard.jsx:43, 59-61` („Payroll Due" iz starog `payroll_records`).
- Scenario: radnik sa neto satnicom 12 €/h, 160 h → satnica kaže trošak 1.920,00 €, a bruto 2 je 3.105,93 € (D8): „ostaje nama" je precenjen za 1.185,93 € po radniku mesečno. Kontrolna tabla prikazuje „Payroll Due" iz zapisa koji se više ne prave.
- Popravka: kao zadatak Faze 4 — za mesece sa obračunom trošak = `payslip_projects.labor_cost`, inače oznaka „procena"; „Payroll Due" iz odobrenih a neisplaćenih `payroll_runs`.

### [P1] Pre puštanja na server: nov nalog je odmah aktivan operater, prvi nalog postaje admin
- Gde: `init.sql:24-25` (`role default 'operater'`, `active default true`), `:30-39` (`handle_new_user`), `:50-53` (`is_staff` = svaki aktivan profil). Lokalno je registracija isključena (`supabase/config.toml:178`), ali nov Supabase projekat ima registraciju **uključenu** podrazumevano; najmanja lozinka 6 (`config.toml:184`).
- Scenario: Luka napravi projekat (NEEDS-USER, Faza 0) i ne isključi registraciju → bilo ko sa URL-om i javnim ključem postane operater: čita sve radnike i dokumenta (lične karte, pasoše), satnice sa tarifama, i menja projekte (→ P0); na praznoj bazi prvi registrovan postaje admin.
- Popravka: `handle_new_user` upisuje `active = false` svima osim prvog admina (admin aktivira); kontrolna lista za server: registracija isključena, lozinka ≥ 10 + zaštita od procurelih lozinki, `seed.sql` se ne pokreće.

### [P2] Baza ne proverava iznose listića prema snimku satnica — samo međusobnu usklađenost
- Gde: `20261114200000_mesecni_obracun.sql:16, 192-194, 222-233`.
- Scenario: greška u `src/lib/payroll` (pogrešan koeficijent u grupi, pogrešna osnovica poreza) daje listić koji prolazi svih 19 provera: zarada se poredi samo sa zbirom `worker_amount` koji šalje isti ekran, porez i doprinosi se ne porede sa parametrima. D17 to svesno ostavlja JS-u (D11), ali pre prave isplate nema druge brane.
- Popravka (odbrana u dubinu): u `payroll_run_problems` dodati (a) `worker_amount` po (radnik, projekat) iz dana satnice × linije snimka, sa istim ključem grupe kao `aggregate()` u `monthly.js`; (b) porez i doprinose iz `run.params`, kursa i `work_fraction`, tolerancija 0,01. Isti primer u `payroll.test.js` i pgTAP 05.

### [P2] Operater prebacuje projekat drugom klijentu — izveštaji po klijentu se menjaju i za zaključane mesece
- Gde: `init.sql:369-380` (`sync_project_client`, security definer, menja `client_id` po `client_name` koji šalje bilo ko iz osoblja), `reports.js:56-59` (klijent satnice = trenutni klijent projekta).
- Scenario: operater u formi projekta izabere drugog klijenta → sav prihod projekta, i iz odobrenih/zaključanih meseci, prelazi drugom klijentu u Klijentima i Fin. izveštajima.
- Popravka: promena `client_id` projekta sa odobrenim satnicama samo admin (trigger).

### [P2] Spisak isplata za banku (u izradi): valuta i negativni iznosi
- Gde: `src/lib/payroll/payslipExport.js` (još neprateći fajl), kolone „Iznos" / „Valuta" iz `payslips.payout` u EUR.
- Rizik: zarada rezidentima se po deviznim propisima isplaćuje u dinarima — spisak u EUR verovatno ne može direktno banci; negativan `payout` (P1 iznad) bi ušao u spisak. Proveriti sa knjigovođom pre prve isplate; izvoz neka preskoči/označi `payout ≤ 0` i neka ne otprema fajlove u zajednički bucket `files` (čita ga i operater).

### [P3] Ostalo
| # | Nalaz | Gde |
|---|---|---|
| 1 | `app.snapshot_sync` / `app.payroll_workflow` su obične GUC zastavice; preko API-ja nedostupne (PGRST202), ali ako se ikad pojavi put sa SQL-om: pod `snapshot_sync` se ne porede `total_hours`, `overtime_hours`, `profit`; pod `payroll_workflow` odobren obračun može da promeni kurs, parametre i mesec. Učvrstiti: uslov `pg_trigger_depth() > 1` + ta tri polja u poređenju; u workflow režimu dozvoliti samo `status`, `approved_*`, `paid_date`. | `20261114180000…sql:239-248`, `20261114200000…sql:46-54` |
| 2 | Admin na odobrenoj satnici (odobreno → odobreno) može da prepiše `approved_by` / `approved_date`, `affiliation_id`, `vendor_*`, `created_by` — novac ostaje, trag odobravanja ne. | `20261114180000…sql:294-302, 320-364` |
| 3 | `authenticated` ima `TRUNCATE`, `TRIGGER`, `REFERENCES` na svim tabelama (Supabase podrazumevano); TRUNCATE zaobilazi RLS i triggere po redu. Nedostupno preko PostgREST-a — `revoke` radi odbrane u dubinu. | grantovi u bazi |
| 4 | Operater čita koeficijente (`hour_types`), prag i praznike, a D3 kaže „bez podešavanja"; `company_settings_read` je `using (true)` — čita i deaktiviran nalog (ostale tabele traže `is_staff()`). | `init.sql:952-959`, `20261114210000…sql:21` |
| 5 | Tarifa se bira po ponedeljku za celu nedelju (i za deo nedelje u sledećem mesecu); dodela koja počinje u sredu ne važi te nedelje. Svesno (D16), ali nije upisano kao ograničenje. | `20261114180000…sql:332-333`, `timesheetRow.js:94-95` |
| 6 | Kurs se čuva sa 4 decimale (`numeric(10,4)`), a ekran računa sa svim upisanim decimalama → nacrt odmah „zastari" dok se ne generiše ponovo; `stale` u `MonthlyPayroll.jsx:157-167` (HEAD) guta grešku i tada ne blokira dugme (baza i dalje proverava). Zaokružiti kurs na 4 decimale pre računanja. | `init.sql:737`, `MonthlyPayroll.jsx:135, 157-167` |
| 7 | `lock_month` broji i odbijene satnice kao „neodobrene", a operater može da spreči zaključavanje upisom nacrta u mesec; operater briše radnika bez satnica → FK kaskada briše i `employee_private` (JMBG, IBAN); osoblje može da obriše bilo koji fajl u bucketu. | `20261114120000…sql:134-140`, `init.sql:205`, storage politike |
| 8 | `supabase/seed.sql` u gitu sadrži lozinke lokalnog admina i operatera (nikad ga ne pokretati na serveru). Pri istom `start_date` dve dodele JS i SQL biraju poziciju različitim redom → odobravanje odbijeno (bezbedno, ali zbunjujuće). | `seed.sql:4, 28`; `rates.js:126-133` ↔ `20261114180000…sql:89-92` |

## Provereno i radi
- **RLS:** uključen na svih 30 tabela u `public`; anon nema nijedan grant na tabele ni pravo na funkcije (REST sa anon ključem: tabele i `rpc/is_admin` → 42501). Samo admin: `employee_private`, `rates`, `project_costs`, `payroll_records`, `payroll_params`, `payroll_runs`, `payslips`, `payslip_projects`, `email_templates` (operater u transakciji: 0 redova u `rates`, `employee_private`, `payroll_runs`). `month_locks` samo čitanje (upis samo `lock_month` / `unlock_month`); `profiles` samo svoj red ili admin, bez insert/delete politike; klijenti, šifarnici, praznici, vrste sati, prag i podaci firme — upis samo admin.
- **Funkcije:** svih 30 u `public` ima `search_path=''`; security definer funkcije koje menjaju ili vraćaju novac proveravaju `is_admin()` (`save_payroll_draft`, `approve_payroll_run`, `payroll_run_problems`, `mark_payroll_paid`, `lock_month`, `unlock_month` — operater → 42501); pomoćne (`resolve_timesheet_rate`, `timesheet_amounts`, `timesheet_hours_by_type`, `rate_trim`, `rate_value`, `timesheet_rate_problem`, `payroll_params_for_month`) nemaju `authenticated`. PostgREST izlaže samo `public` / `graphql_public`; `pg_graphql` nije instaliran; nijedna tabela iz `public` nije u realtime publikaciji.
- **Satnica:** operater ne odobrava, ne odbija, ne menja i ne briše odobrenu; admin na odobrenoj ne menja sate, tarife, radnika, projekat ni nedelju, a iznosi, `hours_by_type` i snimak se zadržavaju; iznose, vrste sati i snimak uvek računa baza (vrednosti sa ekrana se ignorišu); nacrt nikad nema snimak ni `approved_by`.
- **Zaključan mesec + odobren obračun** (napadi kao admin, sve u `rollback`): izmena napomene, vraćanje u nacrt, brisanje i nov red sa danom u mesecu → „Mesec 03.2034 je zaključan"; izmena / brisanje / dodavanje listića i raspodele → odbijeno; brisanje obračuna, promena kursa ili napomene → odbijeno; `unlock_month` → odbijeno; brisanje dobavljača (FK `set null` u listić) → odbijeno; promena `payroll_params` ne menja `payroll_runs.params`; preimenovanje projekta i klijenta menja samo imena (96,00 / 216,00 / 120,00 ostaju).
- **JS ↔ SQL:** `round2` = Postgres `round(numeric, 2)` (pola od nule, bez float greške do 15 cifara); razvrstavanje sati (praznik → vikend → prag); iznos po vrsti uz prednost posebne satnice; redosled tarifa, datumi važenja, statusi i „samo EUR po satu"; RSD trošak `round(amount / kurs, 2)`; izbor `payroll_params` po prvom danu meseca; provere D17 (angažman, osnova satnice, udeo) iste u oba.
- **Mesečni obračun:** samo odobrene satnice; nedelja preko granice meseca deli se po danu, sa pragom, praznicima, tarifama i koeficijentima iz snimka (ne trenutnim); snimak koji ne odgovara satima, koeficijent ili tarifa koja fali → problem, nikad 0 ili 1,00; bez kursa nema nacrta ni odobravanja; zbir raspodele = trošak na cent; radnik sa problemom nema listić, a baza ne odobrava obračun bez njega.
- **Tajne i logovi:** `.env.local` u `.gitignore`, `.env.local.example` sa praznim vrednostima, nema service ključa ni `console.log` u `src` (osim testova); repozitorijum nema remote.
- **Testovi:** `npm test` 165/165, `npm run test:db` 183/183.

## Zaključak
- Novčano jezgro (`src/lib/payroll`) i čuvari u bazi su tačni i usklađeni, a zaključavanje i nepromenljivost odobrenog novca drže na svakom putu dostupnom korisniku.
- Rupa je na ulazu: tarifu koju plaćamo može da odredi operater (P0), a i angažman koji određuje porez (P1). Pre prve isplate još: premala/negativna isplata za bruto satnicu ispod najniže osnovice (P1) i valuta spiska za banku (P2, sa knjigovođom).
- Presuda: **BLOCK** — minimum za ✅:
  1. P0: operater ne menja tarife u `projects.assigned_employees` / `job_roles` ni dodele koje imaju tarifu (`project_assignments`); `rates.assignment_id` / `project_id` na `on delete restrict`; polja tarife na projektu samo za admina; pgTAP za sva tri puta.
  2. Preporučeno u istom krugu, pre prve isplate: P1 angažman samo admin; P1 `payout < 0` blokira odobravanje; P1 kontrolna lista za server.

### Popravke posle pregleda (14.11.2026, kasno veče)
- **P0 operater određuje tarifu — POPRAVLJENO** (D22, migracija `20261114240000`, pgTAP 08 sa 68 provera). Ponovljeni scenariji iz pregleda: operaterova tarifa 99 €/h odbijena, odobrava se adminovih 12 €/h (96,00); prebacivanje i brisanje dodele sa tarifom odbijeni, tarife ostaju, radnik i dalje dobija 10,00; brisanje projekta sa tarifama zaustavljeno (`on delete restrict`).
- **P1 angažman menja operater — POPRAVLJENO** (RLS: operater čita, piše samo admin; pgTAP 09).
- **P1 isplata < 0 / bruto ispod najniže osnovice — POPRAVLJENO kao blokada** (JS `payoutProblems` + provere #20/#21 u `payroll_run_problems`; primeri iz pregleda 8 h × 6 € i 16 h × 12 € su odbijeni, 40 h × 12 € prolazi). Pravilo za deo meseca čeka knjigovođu.
- **P1 nov nalog odmah aktivan — POPRAVLJENO** (`handle_new_user`: neaktivan operater, osim prvog naloga; postojeći nalozi nepromenjeni). Lista za pravi server je u D14.
- **P1 izveštaji po trošku satnice — POPRAVLJENO** u Fazi 4 (D20, commit a432b8f).
- **Verdict posle popravki: ✅** — nema otvorenih P0. P2/P3 ostaju zabeleženi gore.


---

# Phase 7 — spec v1.4 (25.11.2026)

Opseg: Teamora Master Development Specification v1.4 (D30) — svi zahtevi §1–§18 koji pre Phase 7 nisu bili „Implemented" i svih 29 test scenarija T01–T29. Stanje: HEAD `b4d3410` + necommitovane izmene (migracije `20261125170000`, `20261125180000`, pgTAP 36/37, VendorDetail, matrica, plan migracije, backlog). Detaljna lista sa dokazom po stavci: `PHASE7-CHECKLIST.md` (192 stavke). Kod nije menjan.

## Sažetak
- **192 / 192** stavki provereno i čekirano (prvi prolaz P7-2: 184/192; posle popravki P7-3: 192/192).
- Verify: `npm run build` exit 0 · `npm test` **628/628** (45 fajlova) · `npm run test:db` **969/969** (33 fajla) · `npm run lint` 0.
- Proba produkcijskih migracija nad prljavim podacima: **19/19 migracija bez greške**, bez gubitka podataka, idempotentno, anon bez ijedne dozvole.
- Otvoreno: nijedan P0/P1/P2. Uslov za push: dva upita na produkciji (P7-N5) i commit svih necommitovanih izmena.
- Presuda: **✅ SME na produkciju** (uz uslove ispod).

## Test scenariji T01–T29
| T | Status | Dokaz |
|---|---|---|
| T01 | ✅ | `assignments.test.js`, `payroll/dashboard.test.js`, pgTAP 22; ekran „Active Workers — counted once" |
| T02 | ✅ | `assignments.test.js` T02 (isti skup za tabelu, KPI, grafike, izvoz) |
| T03 | ✅ | `assignments.test.js` T03; donut 100.0 % |
| T04 | ✅ | `assignments.test.js` — 3 × T04 (traka → projekat, Quick Insights → lista sa istim brojem, Workforce linkovi) |
| T05 | ✅ | `workforce.test.js`, `workforceUi.test.js`, pgTAP 27 |
| T06 | ✅ | pgTAP 22 (T06 baza); Add/View/Edit/More actions otvaraju stvarne dijaloge |
| T07 | ✅ | `timesheetDays.test.js`, `rateHistory.test.js`, pgTAP 23/24/34 |
| T08 | ✅ | `payroll.test.js` T08, pgTAP 03 i 14 (`-- T08`) |
| T09 | ✅ | `finance/laborLines`, `timesheetDays`, `projectReport` testovi, pgTAP 24 |
| T10 | ✅ | `timesheetDays.test.js`, pgTAP 24 |
| T11 | ✅ | `finance/payables`, `payablesDue`, `payablesList` testovi, pgTAP 28 |
| T12 | ✅ | `payablesList.test.js`, pgTAP 28 |
| T13 | ✅ | `projectCosts.test.js`, pgTAP 25 |
| T14 | ✅ | `projectCosts.test.js`, `projectReport.test.js`, pgTAP 25 |
| T15 | ✅ | `projectCosts`, `billingOverview` testovi, pgTAP 25/29 |
| T16 | ✅ | `billingOverview`, `finance/billing` testovi, pgTAP 29 |
| T17 | ✅ | `projectReport`, `dashboard`, `finance/kpis` testovi; odvojene kartice na Dashboard-u |
| T18 | ✅ | `onboarding.test.js`, pgTAP 26 |
| T19 | ✅ | pgTAP 26 i 20 (direktan poziv bez prava odbijen, storage politika) |
| T20 | ✅ | `workforce`, `workforceUi` testovi, pgTAP 27 |
| T21 | ✅ | `workforce`, `replacements` testovi, pgTAP 27/30/33 |
| T22 | ✅ | `workforceUi`, `replacements` testovi |
| T23 | ✅ | migracija `20261125170000`, `replacements.test.js`, pgTAP 30 i 36 (PM bez pristupa izvornom projektu: bez potvrde odbijeno sa brojem koji nedostaje, uz potvrdu prolazi + audit) |
| T24 | ✅ | pgTAP 20/30/33 |
| T25 | ✅ | `projectReport.test.js`, pgTAP 21/22 |
| T26 | ✅ | `assignments`, `payablesList`, `projectReport` testovi; pgTAP 20/24/28 i dr.; SQL kao HR: tarife, obaveze, isplate, troškovi = 0 redova, iznosi satnica maskirani; UI (koordinator): HR bez B2C/B2B kolona i bez pristupa troškovima/obavezama |
| T27 | ✅ | `payroll/dashboard.test.js`, `assignments.test.js` (isti servis za Dashboard i izveštaje) |
| T28 | ✅ | `projectCosts`, `finance/currency`, `projectReport` testovi, pgTAP 25 |
| T29 | ✅ | pgTAP 29 (nema broja, sekvence, PDF-a ni slanja fakture); izvoz, ručni status i uplate rade |

## Proba produkcijskih migracija
- Zasebna baza `probe7` u lokalnom kontejneru: šeme `auth`/`storage` iz lokalne baze, migracije do `20261124150000`, pa „prljavi" podaci kakvi mogu biti na produkciji: dodele u `projects.assigned_employees` (duplikat sa velikim slovima, nepostojeći radnik, prazan id, tarife u JSON-u), tarife u profilu radnika i posebne satnice, preklapajuće tarife istog nivoa, dve preklapajuće dodele istog radnika na istom projektu, trošak bez kategorije / sa nepostojećom kategorijom / RSD bez kursa / RSD sa kursom bez datuma, nalog `operater`, odobrene satnice sa snimkom v1 (kroz pravi `guard_timesheet`), submitted i draft, odobren obračun i zaključan mesec 03.2026, preklopljen raspored i preklopljena odsustva.
- Svih 19 migracija `20261125*` redom u jednoj transakciji, pa `ROLLBACK`: **nijedna greška**. Drugi prolaz u istoj transakciji: bez greške, isti md5 nad `rates` i `project_assignments` → idempotentno.
- Podaci: broj radnika, projekata, troškova, satnica, obračuna, odsustava, dokumenata i profila isti; dodate samo dodele (2 → 5) i tarife (3 → 11) iz JSON-a/profila/satnica; snimci i iznosi odobrenih satnica bit-identični (md5); `operater` → `hr`; JSON keš projekta ostaje bez tarifa. Sporno ide u `migration_report` (preklapanja, nevažeći JSON elementi, troškovi bez kategorije i van EUR bez datuma kursa, nejednoznačna dodela odobrene satnice — ona i dalje ulazi u `labor_day_lines`).
- D14: posle migracija `anon` nema nijednu dozvolu nad tabelama ni funkcijama u `public`.

## Nalazi
| # | Ozb. | Nalaz | Status |
|---|---|---|---|
| P7-N1 | Visoko (isporuka) | `IMPLEMENTATION-MATRIX.md` nije bio ažuriran posle Phase 7 | REŠENO — 189/189 Implemented sa dokazom |
| P7-N2 | Srednje | Nije bilo plana migracije (§18) | REŠENO — `docs/PLAN-MIGRACIJE.md` |
| P7-N3 | Srednje | BACKLOG Phase 7 nije pratio stanje | REŠENO — 61 čekirana, 1 otvorena (ovaj QA) |
| P7-N4 | Srednje | Vendors bez ugovornih perioda i obaveza (§11.02) | REŠENO — `20261125180000_ugovori_vendora.sql`, pgTAP 37, `VendorDetail.jsx` |
| P7-N5 | Srednje (posle deploy-a) | Odobrena satnica bez `rate_snapshot` i trošak van EUR bez datuma kursa izlaze iz iznosa (spec-ispravno, ali vidljivo kao pad brojeva) | OTVORENO kao uslov — pre push-a na produkciji pokrenuti dva upita iz `docs/PLAN-MIGRACIJE.md` §6.1 (očekivano 0 / spisak za admina) |
| P7-N6 | Nisko | T04 i T08 bez imenovanog testa | REŠENO |
| P7-N7 | Info | PM može da premesti radnika sa projekta koji ne vidi — samo uz izričitu potvrdu, broj koji nedostaje i audit (§14.2.4) | OTVORENO — informacija za Luku |
| P7-N8 | Info | `migration_report` nema ekran u aplikaciji; pregled upitom (plan §6.3) | OTVORENO — informacija |
| P7-N9 | Info | 15.05: uvoz iz Base44 je po D30 K7 samo CSV (zaposleni, vendori); ostalo se unosi kroz aplikaciju, odobreni sati se ne prenose kao odobreni. Ispravno po D30, ali po slovu spec-a („bez gubitka istorije") suženje ako Base44 ima istoriju | NEEDS-USER — Luka potvrđuje da li u Base44 ima istorije za prenos |

## Provereno i radi
- Uloge Admin / Project Manager / HR / Finance + opseg projekata; `operater` → `hr`; prava u bazi (RLS, column grant, maskirani view-ovi), ne samo u UI-u; `PermissionDenied` za rute bez prava.
- Jedna evidencija angažmana (`project_assignments`), JSON samo izvedeni keš (direktan upis odbijen); Rate History sa `effective_from/to`, exclusion bez preklapanja, `change_rate` uz razlog; tarifa po datumu rada.
- Satnice: dodela, intervali, preklapanje i dnevni limit u bazi; korekcija odobrene uz razlog i audit; samo Approved u obračunu.
- Payables/Payments, Billing Overview bez faktura, Financial Reports po valuti, Onboarding ZIP sa serverskom kontrolom, Workforce Planning/Gantt, Leave kapacitet i zamene, obaveštenja, audit log na 19 tabela.
- Prevodi: 615 ključeva, 0 bez SK.

## Zaključak
- Phase 7 pokriva ceo spec v1.4 (189/189 u matrici, 192/192 u QA listi), testovi i proba migracija su zeleni.
- Presuda: **✅ SME na produkciju**, uz uslove: (1) dva upita iz plana §6.1 na produkciji pre push-a; (2) sve necommitovane izmene u commitu koji ide na main; (3) posle deploy-a admin pregleda `migration_report` (plan §6.3–6.4). Luka potvrđuje P7-N9.
