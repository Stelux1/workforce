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
- [ ] NEEDS-USER: napraviti Supabase projekat (besplatan plan) kad krećemo na server; ključeve upisati u `.env.local` sam — ne slati u chat.

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
