# DECISIONS — App za radnike

Obavezujuće odluke. Pre bilo kakve strukturne izmene pročitaj ovo. Ako odluka mora da se promeni, prvo pitaj Luku i upiši novu odluku sa datumom.

## D1 — Backend: Supabase umesto Base44 (2026-11-13)
Zadržavamo React/Vite/Tailwind/shadcn UI iz Base44 izvoza. Baza, prijava i fajlovi idu na Supabase (Postgres + Auth + Storage). `@base44/sdk` i `@base44/vite-plugin` se uklanjaju.
**Zašto:** podaci u našoj bazi, prave relacije (radnik ↔ angažman ↔ projekat), zaključavanje i RLS na nivou baze. Base44 izvoz je vezivao satnice za projekat po imenu i imao 4 izvora tarifa.
**Ne menjati:** nijedna stranica ne sme da priča direktno sa Base44.

## D2 — Valuta: sve u EUR
Svi iznosi (tarife, troškovi, obračun) su u EUR. Zakonski parametri (neoporezivi iznos, osnovice) su u RSD i preračunavaju se po kursu EUR/RSD koji admin unese za taj mesec (`paramsInEur`). **Bez kursa nema obračuna** — nikakav podrazumevani kurs.

## D3 — Ko unosi sate (izmenjeno 2026-11-13)
Sate unose samo prijavljeni korisnici sa pristupom. Radnici nemaju nalog u v1. Satnice odobrava samo admin (baza).
Uloge: `admin` (sve) i `operater` (radnici, projekti, unos sati). Operater **u bazi** nema pristup: `employee_private` (JMBG, banka, tarife iz profila), `rates`, `project_costs`, obračunima i podešavanjima.
**Svesno ograničenje:** snimci tarifa u redovima satnica (`timesheets.b2c_rate` …) i u `projects.assigned_employees`/`job_roles` su vidljivi i operateru kroz API, jer ih postojeće stranice tako čuvaju (D12). Stranice sa novcem su mu sakrivene (`src/lib/access.js`). Ako zatreba strogo, prebaciti te snimke u posebnu tabelu. Isto važi za `timesheets.worker_cost`: od Faze 2 ga računa baza i uključuje posebne satnice iz `employee_private` (prekovremeni/vikend/praznik), pa operater preko API-ja iz troška i sati može da izračuna tu satnicu (14.11.2026).

## D4 — Jedan izbor tarife sa jasnim redosledom (izmenjeno 2026-11-13)
Postojeća aplikacija ima više mesta za unos tarife; sva ostaju (D12), ali novac se računa samo kroz jednu funkciju (`src/lib/payroll/rates.js`) sa redosledom:
tarifa angažmana (Tarife) → satnica radnika na projektu (`assigned_employees`) → tarifa projekta/pozicije (Tarife) → zanimanje na projektu (`job_roles`, samo za klijenta) → tarifa radnika (Tarife) → satnica iz profila radnika.
Ništa od toga → greška, nikad 0. Satnica radnika je neto ili bruto — `employee_private.rate_basis` (podrazumevano neto).

## D5 — Vrste sati i koeficijenti (izmenjeno 2026-11-13)
Satnica ostaje nedeljna (pon–ned po projektu, D12). Sati se razvrstavaju automatski: praznik (lista praznika koju unosi admin) → vikend (subota, nedelja) → preko dnevnog praga (podrazumevano 8h) prekovremeno → ostalo redovno. Noćni rad se ne vodi (satnica ga ne beleži).
Koeficijente unosi admin ručno, posebno za radnika i za klijenta; redovni = 1. **Prazan koeficijent blokira obračun** (nema tihog 1,00). Ako radnik u profilu ima posebnu satnicu za prekovremeni/vikend/praznik, ona ima prednost nad koeficijentom.

## D6 — Bez odbitaka u v1
Nema odbitaka za smeštaj, prevoz ni akontacije. Za isplatu = neto.

## D7 — Neto i bruto računa aplikacija (`src/lib/payroll`)
Po srpskim propisima: porez 10% iznad neoporezivog iznosa, doprinosi zaposlenog 19,9%, poslodavca 15,15%, najniža i najviša osnovica. Parametri za 2026. su u `params.js`, a u bazi se čuvaju sa datumom važenja.
**Ograničenja (svesno):** nema minulog rada, toplog obroka, regresa ni olakšica; zarada ispod najniže osnovice dobija upozorenje; nisu pokrivena posebna pravila za upućene radnike u inostranstvu. Ovo je upravljački obračun i **ne zamenjuje PPP-PD prijavu i knjigovođu**.

## D8 — Trošak radnika na projektu
Za zaposlenog: **bruto 2** (bruto + doprinosi poslodavca), raspodeljen po projektima srazmerno zaradi na svakom projektu (`allocate`, zbir tačan u centima). Za radnika preko podizvođača: iznos sati × tarifa, bez poreza.
**Ostaje nama = prihod − trošak radnika − ostali troškovi projekta.**

## D9 — Naplata projekta samo po satu (v1)
Prihod = sati × satnica klijentu × koeficijent za klijenta. Paušal kasnije, ako zatreba.

## D10 — Odobreno je nepromenljivo
Odobrena satnica nosi snimak tarifa i koeficijenata (`b2c_rate`, `b2b_rate`, `rate_snapshot`, `hours_by_type`) i ne može da se menja ni briše dok je admin ne vrati u nacrt. Zaključan mesec (i nedelja koja u njega zalazi) i odobren obračun ne mogu da se menjaju — sprovodi se triggerom u bazi, ne samo u UI. Jedini izuzetak: osvežavanje imena za prikaz posle preimenovanja projekta/klijenta.

## D11 — Novčana logika samo na jednom mestu
Sve formule za novac su u `src/lib/payroll/` kao čiste funkcije sa testovima (`npm test`). UI i izveštaji ih pozivaju, ne prepisuju. Tarifa ili koeficijent koji fali baca `MissingRateError` — nikad ne računa 0.

## D13 — Bez prenosa podataka iz Base44 (2026-11-13)
Luka je odlučio da preskočimo proveru Base44. Kreće se od prazne baze; podaci se unose u novoj aplikaciji.

## D14 — Lokalni razvoj
Lokalni Supabase radi na portovima 573xx (54xxx/55xxx/56xxx zauzimaju drugi projekti). Javna registracija je isključena — naloge otvara admin.

## D12 — Zadržavamo postojeću aplikaciju: isti dizajn, isti ekrani (izmenjeno 2026-11-13)
Luka: „nastavi tamo da bude isti dizajn, isto sve, ne moraš da radiš dupli posao". Nijedan postojeći ekran se ne pravi iznova i nijedan modul se ne izbacuje. Stranice zadržavaju izgled, komponente i prevode (`translations.js`, SR/EN); menja se samo izvor podataka (Base44 → Supabase) i novčana logika tamo gde je bila pogrešna. Baza prati imena polja i vrednosti koje stranice već koriste, osim gde je to uzrok greške (veza po imenu umesto po ID-u, više izvora tarifa).

## D15 — Sloj podataka sa Base44 pozivima (2026-11-13)
`src/api/base44Client.js` izlaže iste pozive kao Base44 SDK (`entities.X.list/filter/get/create/update/delete`, `integrations.Core.UploadFile`, `auth.*`) nad Supabase-om, pa stranice rade bez izmena. Pravila:
- tabela po entitetu (`ENTITY_TABLES`), kolone iz `src/api/schema.generated.js` (`npm run gen:schema` posle svake migracije); nepoznata polja se ne čuvaju (upozorenje u konzoli u razvoju);
- `Employee` spaja `employees` + `employee_private`; privatna polja upisuje samo admin;
- fajlovi su u privatnom bucketu `files`; u bazi `storage://files/…`, stranica dobija potpisan link (1h);
- slanje mejla baca jasnu grešku dok servis nije podešen.
**Ne menjati:** stranice ne pričaju sa Supabase-om direktno za Base44 entitete — sve ide kroz ovaj sloj, da pravila ostanu na jednom mestu.

## D16 — Iznose satnice računa baza (2026-11-14, posle QA prolaza)
Trošak, prihod, zarada i prekovremeno u `timesheets` računa trigger `guard_timesheet` iz sati i tarifa (zaokruženo na cent; od Faze 2 po vrsti sati — vidi ispod); vrednosti koje pošalje ekran se ignorišu. Odobravanje traži tarifu > 0 (D4/D11: „nikad 0"), a odobravanje i odbijanje sme samo admin.
**Zašto:** QA je pokazao da je baza prihvatala i odobravala proizvoljne iznose (8 h × 12 € upisano kao trošak 1 €, prihod 9.999 €), jer je novac računao samo pregledač.
**Faza 2 (izmenjeno 2026-11-14, migracija `20261114150000_satnice_vrste_sati.sql`):** baza i razvrstava sate — `hours_by_type` uvek računa trigger po istom pravilu kao `classifyWeek` (praznik → vikend → preko dnevnog praga `work_rules` prekovremeno → redovno), a `overtime_hours` = prekovremeni sati (više nije „preko 40h"). Iznosi su uvek `hours_by_type` × tarifa reda × koeficijent (`hour_types`), a posebna satnica radnika iz profila (prekovremeni/vikend/praznik) ima prednost nad koeficijentom radnika — isto kao `timesheetAmountsByType`; zaokruženo na cent po vrsti, pa zbir. Strana kojoj fali tarifa ili koeficijent ima prazan iznos (nacrt se čuva), a odobravanje se odbija uz poruku koja vrsta/strana fali. Pri odobravanju baza upisuje `rate_snapshot` (tarife reda + izvor/oznaka tarife, korišćeni koeficijenti i posebne satnice po vrsti, dnevni prag, praznici te nedelje); odobren red se više ne preračunava, pa kasnija promena tarife, koeficijenta, praga ili praznika ne menja odobrenu satnicu (D10). Neodobren red nema snimak. Ekran (Satnice) bira tarifu samo kroz `src/lib/payroll/rates.js` i šalje sate i tarife — `hours_by_type`, iznose, prekovremeno i snimak koje pošalje ekran baza ignoriše.
**Ne menjati:** ne vraćati poverenje u iznos ili `hours_by_type` sa ekrana. JS (`round2`) i baza zaokružuju isto (pola od nule); isti primeri su u `payroll.test.js` i `supabase/tests/03_vrste_sati.test.sql`. **Tarifa pri odobravanju (izmenjeno 2026-11-14, migracija `20261114180000_tarifa_pri_odobravanju.sql`):** baza u trenutku odobravanja bira tarifu za nedelju reda (`week_start`, kao `approvalPayload`) funkcijom `resolve_timesheet_rate` — isti redosled, datumi važenja, statusi i pravilo „samo EUR po satu" kao `rates.js` — i odbija red čija `b2c_rate`/`b2b_rate` nije ta tarifa (npr. broj koji je operater upisao u nacrt preko API-ja), kao i red bez važeće tarife; izvor i oznaku tarife u snimak upisuje baza. Svaka promena redosleda ide u oba (`rates.js` i migraciju), sa istim primerom u `payroll.test.js` i `supabase/tests/04_tarifa_pri_odobravanju.test.sql`.

## D17 — Mesečni obračun: tok, deljenje nedelje po danu, nepromenljivost (2026-11-14)
Stranica „Nedeljni obračun" je sada „Mesečni obračun" (`/payroll/monthly`; stari `/payroll/weekly` vodi na nju), isti izgled (D12). Novac računa `src/lib/payroll/payrollMonth.js` → `computeWorkerMonth`; baza čuva, proverava i zaključava (migracija `20261114200000_mesecni_obracun.sql`). Stari nedeljni zapisi (`payroll_records`) se više ne prave; tabela ostaje dok Faza 4 ne prebaci Platni spisak i Izveštaje na mesečni obračun.
- **Tok (samo admin, RLS + provere u funkcijama):** zaključaj mesec (`lock_month` — sve satnice koje zalaze u mesec odobrene) → kurs EUR/RSD za mesec (`payroll_runs.eur_rsd_rate`) → „Generiši obračun" = nacrt (`save_payroll_draft` u jednoj transakciji briše i upisuje listiće; može ponovo) → Odobri (`approve_payroll_run`) → Isplaćeno (`mark_payroll_paid`, samo posle odobravanja). **Izbor:** nacrt se pravi samo za već zaključan mesec (odobravanje ne zaključava samo); mesec sa obračunom ne može da se otključa — prvo se briše nacrt.
- **Bez kursa nema obračuna** ni nacrta ni odobravanja (ekran i baza, D2). Parametre (porez, doprinosi, osnovice u RSD) u obračun upisuje baza iz `payroll_params`: red sa najkasnijim `valid_from` do prvog dana meseca (isto pravilo kao `paramsRowForMonth`); nacrt računat sa drugim parametrima se odbija. Promena kursa nacrta briše njegove listiće.
- **Samo odobrene satnice.** Nedelja preko granice meseca se deli **po danu** (datum rada) — i sati i iznosi. Dan se razvrstava kao pri odobravanju, ali prag, praznici, tarife, koeficijenti i posebne satnice su iz `rate_snapshot` satnice, ne trenutna podešavanja (D10). Iznos sabira sate po (projekat, vrsta, tarife, koeficijenti) pa množi i zaokružuje po grupi, pa zbir dva meseca može da odstupi od odobrene satnice za cent.
- **Problem, nikad tiho 0 ili 1,00:** odobrena satnica bez snimka (odobrena pre Faze 2 — vratiti u nacrt i odobriti ponovo), snimak koji ne odgovara satima, tarifa/koeficijent koji fali u snimku, radnik bez angažmana (`employment_history`) ili sa promenom angažmana u toku meseca → poruka sa radnikom, nedeljom i projektom. Taj radnik nema listić; nacrt se čuva za ostale (da se vidi šta je izračunato), a baza ne odobrava obračun dok svaki radnik sa odobrenim satima nema listić.
- **Trošak (D8):** zaposleni = bruto 2, podizvođač = iznos sati bez poreza. Raspodela po projektima srazmerno zaradi (`allocate`); ostatak centa ide najvećem odsečenom ostatku, pa projektu sa manjim ID-om (stabilno, ne zavisi od redosleda učitavanja). Zbir raspodele = trošak listića, na cent.
- **Baza pre odobravanja** (`payroll_run_problems`, prikazuje se i na stranici): kurs, zaključan mesec, satnice bez snimka, listić za svakog radnika sa satima, sati po radniku i projektu prema `timesheet_days`, zbirovi listića (sati, zarada, raspodela = trošak), angažman, osnova satnice i udeo iz profila, i da su bruto/neto/porez/doprinosi međusobno usklađeni. Iznose po vrsti sati i porez računa samo `src/lib/payroll` (D11) — baza ih ne računa ponovo.
- **Odobren i isplaćen obračun, njegovi listići i raspodela su nepromenljivi** (trigger u bazi; zabranjeno je i prebacivanje listića u drugi obračun).
- **Pojednostavljenja (proverava knjigovođa):** parametri važe po prvom danu meseca obračuna, ne po datumu isplate; udeo radnog vremena je iz profila, a početak/kraj rada u toku meseca se ne srazmerava (zarada ispod najniže osnovice dobija upozorenje, D7).
**Ne menjati:** ne računati obračun iz trenutnih tarifa i koeficijenata umesto snimka; ne uvoditi podrazumevani kurs; ne dozvoliti izmenu ili brisanje odobrenog obračuna. Svaka promena pravila deljenja ide sa testom u `payroll.test.js` i primerom u `supabase/tests/05_mesecni_obracun.test.sql`.

## D18 — Podaci firme (2026-11-14)
Naziv, PIB (9 cifara), matični broj (8 cifara), adresa, mesto, tekući račun i logo firme su jedan red u `company_settings` (kao `work_rules`), entitet `CompanySettings`, stranica Podešavanja → „Podaci firme". Admin menja, svi prijavljeni čitaju (zaglavlje PDF-a platnog listića i satnice). Logo je PNG ili JPG do 2 MB, proveren po sadržaju. PDF bez podataka nema zaglavlje firme.
**Ne menjati:** podaci firme se ne seeduju i nema izmišljenih vrednosti — prazno dok ih Luka ne unese.

## D19 — Troškovi projekta u RSD: kurs uz trošak, EUR iznos računa baza (2026-11-14)
Trošak projekta van EUR nosi kurs koji admin unese uz trošak (`project_costs.eur_rsd_rate`, RSD za 1 EUR) i EUR iznos (`eur_amount`) koji računa trigger `guard_project_cost` (migracija `20261114220000_troskovi_kurs.sql`): EUR → `eur_amount = amount`; ostalo → `round(amount / kurs, 2)`, pola od nule kao `round2`. Trošak van EUR bez kursa > 0 baza ne prima, ni pri izmeni — nema podrazumevanog kursa (D2). Kurs je po trošku, ne mesečni kurs obračuna. Svi zbirovi troškova (Troškovi projekata, finansijski izveštaj projekta, „ostaje nama" iz D8, Izveštaji o platama) idu kroz `src/lib/payroll/costs.js` (`sumCostsEur`). Stari RSD red bez kursa nema EUR iznos, ne sabira se ni kao 0 ni kao RSD i prikazuje se kao „nedostaje kurs".
**Ne menjati:** ne vraćati poverenje u `eur_amount` sa ekrana; JS i baza zaokružuju isto (isti primeri u `payroll.test.js` i `supabase/tests/06_troskovi_kurs.test.sql`).
