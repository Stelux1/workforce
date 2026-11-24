# PLAN MIGRACIJE — preuzimanje postojećih (Base44) podataka u Teamora

Spec v1.4 §18 (plan migracije i relacija), §15.05 (uvoz bez gubitka veza, duplikati pre migracije), `DECISIONS.md` D13 i D30 K7. Stanje: 25.11.2026.
Pišu: Luka (vlasnik odluke), admin aplikacije (izvršava). Jezik: srpski; nazivi ekrana i polja su na engleskom kao u aplikaciji.

## 0. Šta ovaj plan pokriva i šta ne

- **Polazište (D13, D30 K7):** aplikacija je izgrađena iz Base44 izvoza, ali produkcija kreće iz baze koju je Luka napunio ručno i CSV uvozom. Plan opisuje kako se preuzima ono što još stoji u Base44 (zaposleni, vendori, klijenti, projekti, angažmani i dalje) — **ne** menja D13 u smislu automatskog prenosa celokupne baze. U repou nema Base44 izvoza, pa ovaj plan ne tvrdi koliko redova ima; brojevi se utvrđuju upitima iz tačke 7 pre i posle.
- **Alati koji postoje danas:** CSV uvoz zaposlenih (`ImportEmployeesDialog.jsx`, `src/lib/csvEmployees.js`) i vendora (`ImportVendorsDialog.jsx`, `src/lib/vendorImport.js`). Za ostale entitete **nema** uvoznika: klijenti, projekti, Job Roles, angažmani, tarife, satnice, troškovi i dokumenta se unose u aplikaciji (ekrani iz tačke 2). Ako obim to ne dozvoljava, pravi se zaseban uvoznik kao novi zadatak u `BACKLOG.md` — ne piše se SQL direktno u produkciju (vidi tačku 3, pravila).
- **Interna migracija modela** (JSON dodele → `project_assignments`, tarife iz JSON-a/profila → `rates`, `operater` → `hr` itd.) izvršava se sama pri deploy-u migracija `20261125*` — opisano u tački 6.

## 1. Pravila (važe za svaki korak)

1. **Veze po ID-u, ne po nazivu.** Radnik, projekat, klijent, vendor i Job Role se vezuju preko `id` (uuid). Naziv u redu (`employee_name`, `project_name`, `client_name`, `vendor_name`) je samo snimak za prikaz (T25). Zato se isti ulaz uvek bira iz padajuće liste, a ne upisuje kao tekst.
2. **Redosled je obavezan** — svaki sledeći entitet traži prethodni (tačka 2). Ne uvozi se angažman pre projekta, radnika i Job Role-a.
3. **Prvo probni prolaz, pa pravi.** CSV uvoz ima pregled (preview) i izveštaj o greškama; red sa greškom se ne uvozi, a ostali prolaze. Pregled se pročita u celini pre potvrde.
4. **Nema direktnog SQL-a u produkciji** za unos podataka. Svi upisi idu kroz aplikaciju, jer tek tada rade provere (guard trigeri), audit (`audit_log`) i prava. Izuzetak su upiti za čitanje i kontrolu (tačka 7).
5. **Novac samo propose-only:** nijedan korak ovog plana ne troši novac niti pokreće plaćanje; Payments i Client Payments se ne uvoze, evidentiraju se ručno kad se desi stvarna uplata/isplata.
6. **Šta se ne preuzima:** stari mesečni obračuni i listići (`payroll_*`) ostaju kakvi jesu u bazi (R10) i ne uvoze se ponovo; odobrene satnice iz Base44 se **ne** uvoze kao „odobrene" (satnica se odobrava samo u aplikaciji, uz snimak tarife) — ako je istorija sati potrebna, unosi se po nedeljama kroz Timesheets i odobrava ovlašćeni korisnik (tačka 2, korak 8).

## 2. Redosled prenosa

| # | Entitet | Kako se unosi | Zavisi od | Ekran / alat |
|---|---|---|---|---|
| 1 | Settings: Departments & Positions, Cost Categories, Coefficients & Holidays, Company Details, jezik/valuta | Ručno (podrazumevane vrednosti postoje: 12 kategorija troškova / 86 potkategorija, praznici 2026–2027) | — | Settings (samo admin) |
| 2 | Korisnici i uloge | Ručno; uloge Admin, Project Manager, HR, Finance + ograničenje po projektu | — | Settings → Users / Permissions |
| 3 | Klijenti | Ručno | — | Payroll → Clients / Billing Overview, ili Projects |
| 4 | Vendori (podizvođači) | **CSV uvoz** (`ImportVendorsDialog`); `Vendor ID` (VEN-001…) dodeljuje baza | — | Staff Management → Vendors → Import |
| 5 | Projekti | Ručno: naziv, klijent (izbor iz liste), lokacija (Address/ZIP/City), period, status, vremenska zona | Klijenti | Projects → Project Overview |
| 6 | Job Roles po projektu (`project_roles`) | Ručno na kartici Overview projekta; B2B tarifa Job Role-a se unosi uz ulogu | Projekti | Project Overview |
| 7 | Zaposleni | **CSV uvoz** (`ImportEmployeesDialog`); privatna polja (JMBG, lična karta, pasoš, banka, IBAN, SWIFT, poreski broj) uvozi samo admin | Settings (Departments) | Staff Management → Employees → Import |
| 7a | Pripadnost (direktno / preko vendora) sa datumima | Ručno po radniku; CSV je ne uvozi | Zaposleni, Vendori | Profil radnika → Employment History |
| 8 | Angažmani (Assignments) | Ručno; Add Assignment: radnik, projekat, Job Role, datumi | Radnici, projekti, Job Roles, pripadnost | Projects → Project Assignments |
| 9 | Tarife (B2C, B2B, Effective From/To, valuta) | Uz angažman (Add/Edit) ili Rate History; istorija se čuva (promena = nov red od datuma) | Angažmani | Project Assignments → Rate History |
| 10 | Satnice (istorija sati, samo ako je potrebna) | Po nedelji kroz Timesheets, dan po dan; odobrava ovlašćeni korisnik | Angažmani, tarife | Payroll → Timesheets |
| 11 | Troškovi projekta | Ručno ili po kartici Costs projekta: Cost Date, kategorija iz Settings, iznos, valuta, kurs i datum kursa za valutu ≠ EUR | Projekti, kategorije | Projects → Project Costs |
| 12 | Dokumenta radnika | Ručno po radniku: vrsta dokumenta (šifarnik), datum izdavanja i isteka, fajl | Zaposleni | Staff Management → Documents |
| 13 | Required Documents / Workforce Requirements | Ručno po projektu | Projekti, Job Roles | kartice Onboarding / Workforce Plan |
| 14 | Billing Summary, Client Payments, Payables, Payments | **Ne uvoze se** — nastaju iz odobrenih sati i ručnog evidentiranja uplata/isplata | — | Clients / Billing Overview, Payables & Payments |

Zašto ovaj redosled: `projects.client_id` je FK ka klijentu; `project_roles` pripadaju projektu; `project_assignments` traže radnika (`employee_id`), projekat i (za obračun) Job Role; `rates` se vezuju za angažman; `timesheets` traže angažman (obavezan za Submit/Approve); `documents.employee_id` traži radnika.

## 3. Mapiranje polja i relacija

### 3.1 Zaposleni (CSV → `employees`, `employee_private`)

Šablon se preuzima iz dijaloga Import (kolone u redosledu aplikacije; prepoznaju se i srpski nazivi kolona, sa i bez dijakritika). Red koji počinje sa `#` je komentar.

| Kolona CSV | Polje | Napomena |
|---|---|---|
| Employee ID | `employees.employee_id` | Prazno → baza dodeljuje sledeći `EMP-NNN`; ako je popunjeno, mora biti jedinstveno |
| First Name*, Last Name* | `first_name`, `last_name` | obavezno |
| Email, Phone, Date of Birth, Gender, Nationality, Address, City, Postal Code, Country | istoimena polja | datum `dd.mm.yyyy` ili `yyyy-mm-dd`; Gender: male/female/other (prepoznaje i m/ž, muški/ženski) |
| Department, Position | `department`, `position` | ako su odeljenja podešena u Settings, naziv mora postojati (inače greška „not found") — zato korak 1 ide pre uvoza |
| Employment Type, Start Date, End Date, Status | istoimena | Status prazan → `active` |
| Emergency Contact Name/Relationship/Phone | `emergency_contact_*` | |
| JMBG, ID Card Number/Expiry, Passport Number/Expiry, Bank Name, IBAN, SWIFT/BIC, Tax Number | `employee_private.*` | samo admin; za ostale uloge vrednost se ignoriše uz upozorenje; JMBG ima kontrolnu cifru (Excel koji izbaci vodeću nulu se ispravlja ako kontrolna cifra odgovara) |

Ne uvozi se (unosi se posle): pripadnost direktno/vendor (7a), supervisor, work location, profilna slika. **Satnice, Rate Basis i Work Fraction se više ne unose na profilu radnika** — tarife su u Rate History (korak 9).

### 3.2 Vendori (CSV → `vendors`)

Kolone: Vendor Name* (obavezno), Legal Name, Registration No., Tax No., VAT No., Country, City, Postal Code, Address, Contact Name, Email, Phone, Default Currency, Payment Terms, Settlement Cycle, Contract Ref., Status, Notes. `vendor_id` (VEN-NNN) se ne uvozi — dodeljuje ga baza. Ugovorni periodi vendora se unose ručno posle uvoza (CSV nema datume ugovora).

### 3.3 Veze koje se prave ručno (ID veze)

| Veza | Gde se bira | Šta se čuva |
|---|---|---|
| projekat → klijent | forma projekta | `projects.client_id` (`client_name` je snimak) |
| Job Role → projekat | Overview projekta | `project_roles.project_id`, jedinstveno po (projekat, naziv) |
| angažman → radnik, projekat, Job Role | Add Assignment | `employee_id`, `project_id`, `project_role_id`; vendor i vrsta angažovanja se popunjavaju iz pripadnosti radnika |
| tarifa → angažman | Add/Edit Assignment ili Rate History | `rates.assignment_id` (nivo angažmana), ili projekat/Job Role/radnik; baza odbija preklapanje intervala |
| satnica → angažman | red u Timesheets | `timesheets.assignment_id` |
| trošak → projekat, kategorija, radnik/vendor | Add Cost | `project_id`, `cost_category_id`, `employee_id`/`vendor_id` (najviše jedno) |
| dokument → radnik, vrsta | Documents | `employee_id`, vrsta iz `document_types` |

JSON `projects.assigned_employees` i `projects.job_roles` više **nisu izvor** — samo keš izveden iz `project_assignments`/`project_roles`; direktan upis odbija baza (`guard_project_cache`). Zato se angažmani nikad ne unose „na kartici projekta kao tekst", već preko Add Assignment.

## 4. Provera duplikata pre uvoza

**Automatski (CSV pregled, pre bilo kakvog upisa):**

| Entitet | Ključ duplikata | Ponašanje |
|---|---|---|
| Zaposleni | Employee ID, Email (bez velikih slova), JMBG | Poklapanje sa bazom ili sa ranijim redom istog fajla → red je „Duplicate"; duplikat šifre uvek blokira red, duplikat emaila/JMBG-a se preskače dok je uključeno „Skip duplicates" (podrazumevano) |
| Vendori | naziv (bez velikih slova/dijakritika), Registration No., Tax No. | Duplikat u bazi ili u fajlu → red se preskače |

Izveštaj o preskočenim i neuspelim redovima se preuzima kao CSV iz dijaloga (`teamora-employees-import-report.csv` i isti za vendore). Maksimum je 1000 redova po uvozu.

**Ručno (pre uvoza, u izvornoj tabeli):**
1. Sortirati zaposlene po prezimenu i imenu i potražiti iste osobe sa različitom šifrom ili bez emaila — ključ je tada JMBG, a kod stranaca datum rođenja + ime + prezime.
2. Isti klijent upisan dvaput („Firma d.o.o." / „Firma doo") — spojiti pre unosa; baza ne zabranjuje dva klijenta istog imena, a `sync_project_client` bi izabrao najstarijeg.
3. Isti vendor pod više naziva — jedan red, ostali nazivi u Notes.

**Posle uvoza (upiti u tački 7):** duplikat po `lower(email)`, po `jmbg`, po `employee_id` — svi moraju vratiti 0 redova.

## 5. Validacija

Pre uvoza: obavezna polja, format datuma i emaila, JMBG kontrolna cifra, enum vrednosti, postojanje odeljenja/pozicije (CSV pregled). Posle upisa u bazi važe pravila nezavisno od ekrana: preklapanje angažmana istog radnika na istom projektu se odbija; tarifa ne sme da preklapa interval istog nivoa; trošak traži Cost Date, kategoriju i (za valutu ≠ EUR) kurs sa datumom; satnica traži angažman; zbir sati radnika u danu preko svih projekata ne sme preći limit iz `work_rules`; pripadnost radnika (direktno/vendor) se ne sme preklapati.
Redovi koje baza odbije prikazuju se u aplikaciji sa objašnjenjem (lokalizovane poruke, `src/api/errors.js`) i ne ulaze delimično.

## 6. Deploy migracija `20261125*` na produkcijskoj bazi

Deploy je `git push` na `main` (Supabase migracije se primenjuju redom po imenu, sajt kroz Shipvela). Migracije `20261125010000` … `20261125180000` se primenjuju odjednom; redosled imena je redosled zavisnosti. Sve su idempotentne i **ne brišu poslovne podatke**. Proba je urađena na kopiji baze sa „prljavim" podacima (zasebna baza, sve migracije u jednoj transakciji, drugi prolaz bez razlike, ROLLBACK): bez grešaka, broj radnika, projekata, troškova, satnica, obračuna, odsustava i dokumenata isti pre i posle; snimci odobrenih satnica bit-identični; `anon` bez dozvola (D14). Proba je opisana u `PHASE7-CHECKLIST.md` („Proba produkcijskih migracija").

### 6.1 Pre push-a (obavezno, dva upita — P7-N5)

```sql
-- 1) odobrene satnice bez snimka tarife (očekivano 0)
select count(*) from timesheets where approval_status = 'approved' and rate_snapshot is null;
-- 2) troškovi van EUR (očekivano 0; ako nije, posle deploy-a treba datum kursa)
select count(*) from project_costs where currency <> 'EUR';
```

Ako je prvi broj > 0: ta satnica posle deploy-a ide u „ima problem" (ne ulazi u zbirove) — admin je vraća u nacrt (uz razlog, `reopen_timesheet`) i odobrava ponovo. Ako je drugi broj > 0: svaki takav trošak admin otvara i upisuje datum kursa (stoji i u `migration_report`); do tada ne ulazi u EUR zbir (T28).
Dodatno: `npx supabase migration list` (lokalno i udaljeno moraju imati iste prethodne verzije) i `npm run build && npm test` (verify iz AGENTS.md); pgTAP: `npm run test:db`. Praviti backup baze (Supabase → Database → Backups) neposredno pre push-a.

### 6.2 Šta migracije rade sa postojećim podacima (backfill)

| Migracija | Šta radi sa postojećim redovima |
|---|---|
| `…010000_temelj_uloge_audit` | `profiles.role = 'operater'` → `hr`; nalozi i aktivnost se ne diraju; prvi admin ostaje zaštićen; pravi katalog uloga/prava, `audit_log`, `migration_report`, `project_roles`, smene |
| `…020000_prava_rls` | Nove RLS politike po pravima; HR dobija sve što je operater imao |
| `…030000_angazmani_tarife` | Svaki element `projects.assigned_employees` → red u `project_assignments` (`legacy_source = 'assigned_employees_json'`; datumi iz satnica i projekta); radnici sa satnicama bez dodele → dodela (`legacy_source = 'timesheets'`); tarife iz JSON-a i profila → `rates` (popunjavanje rupa, isti rezultat izbora tarife); preklapajuće tarife se normalizuju tako da izbor za svaki dan ostane isti; pun JSON pre izmene u `migration_report`; JSON postaje keš bez tarifa |
| `…040000_satnice_po_danu` | Odobrene satnice (snimak v1) se ne menjaju; jedina izmena je `assignment_id` (null → vrednost) gde je dodela jednoznačna; neodobrene dobijaju preračun (procena, problemi); nejednoznačne ili bez dodele ostaju i idu u report |
| `…050000_troskovi_c1` | `cost_date = created_date::date`; kategorija se povezuje po nazivu (`cost_category_id`); nepovezana kategorija i valuta ≠ EUR bez datuma kursa ostaju i idu u report |
| `…060000_onboarding` (+`060100`) | 12 postojećih kategorija dokumenata → `document_types` (osetljivost); `documents.category` → FK; bucket za priloge troškova |
| `…070000_workforce_model` | Raspored dobija izvedeni interval; preklapanja među starim redovima idu u report |
| `…080000_obaveze_isplate`, `…090000_billing`, `…100000_odsustva_zamene`, `…110000_obavestenja` | Nove tabele (payables, payments, billing_summaries, client_payments, zamene, obaveštenja); postojeći redovi se ne diraju; `payroll_*` ostaje (R10) |
| `…1601xx`–`…170000` | Imenik osoblja, manjak na svim projektima, atomarna izmena angažmana, nazivi, osvežavanje obaveštenja, izvorni projekat zamene — samo funkcije/pogledi |
| `…180000_ugovori_vendora` | Nova tabela `vendor_contracts` i pogled `vendor_worker_counts`; **bez backfill-a** (u `vendors.contract_reference` nema datuma, period ugovora se ne izmišlja — unosi se ručno) |

### 6.3 `migration_report` — šta je i kako ga admin pregleda

Tabela `public.migration_report` (kolone: `id`, `migration`, `entity`, `entity_id`, `issue`, `details` jsonb, `created_date`, `resolved_at`, `resolved_by`). Svaka stavka je jedan red podataka koji je migracija **ostavila nepromenjen** (ili izmenila uz zapis), a traži čoveka. Ista beleška se ne upisuje dvaput pri ponovnom pokretanju.

- **Ko vidi:** samo korisnik sa pravom `users.manage` ili `settings.manage` (Admin). Niko ne sme da briše ni ubacuje redove; admin sme da menja `resolved_at`/`resolved_by`.
- **Gde:** u aplikaciji **nema posebnog ekrana** (P7-N8) — pregled je upit u Supabase SQL editoru (Dashboard → SQL Editor) ili kroz API entitet `MigrationReport`. Preporuka: odmah posle deploy-a pokrenuti upite ispod i sačuvati rezultat.

```sql
-- sve otvorene stavke, grupisano po problemu
select migration, entity, issue, count(*) as broj
from migration_report
where resolved_at is null
group by migration, entity, issue
order by migration, entity, issue;

-- detalji jedne vrste problema
select id, entity, entity_id, details
from migration_report
where issue = 'assignment_overlap' and resolved_at is null
order by id;

-- zatvaranje stavke posle ručne ispravke
update migration_report set resolved_at = now(), resolved_by = auth.uid() where id = <id>;
```

(`auth.uid()` radi samo iz aplikacije/API-ja kao prijavljen admin; u SQL editoru upisati `resolved_by` ručno ili ostaviti prazno.)

### 6.4 Šta znači koja stavka i šta admin radi

| `issue` | `entity` | Šta znači | Šta admin radi |
|---|---|---|---|
| `assigned_employees_backup` | projects | Pun raniji JSON dodela projekta sačuvan pre izmene (rezervna kopija) | Ništa; čuva se za slučaj spora, `details` sadrži ceo JSON |
| `invalid_assigned_employee` | projects | Element JSON-a bez postojećeg radnika, sa praznim ili duplim id-jem | Proveriti u `details`; ako je radnik stvaran, napraviti angažman ručno (Add Assignment) |
| `assignment_overlap` | project_assignments | Isti radnik ima dva angažmana na istom projektu u istom periodu | Skratiti ili spojiti angažmane (Edit / End Assignment) |
| `timesheet_outside_assignment` | timesheets | Satnica ima sate van perioda angažmana | Produžiti angažman ili ispraviti satnicu |
| `assignment_missing`, `assignment_ambiguous` | timesheets | Satnica bez dodele, ili više dodela pokriva dane | Otvoriti satnicu i izabrati angažman; odobrena satnica ostaje kakva je (snimak) |
| `draft_not_recalculated` | timesheets | Nacrt u zaključanom mesecu nije preračunat | Tek posle otključavanja meseca / ponovnog unosa |
| `rate_overlap_closed`, `rate_overlap_split`, `rate_duplicate_deactivated`, `rate_zero_deactivated` | rates | Preklapajuće/duple/nulte tarife su normalizovane (stari red zatvoren/podeljen/deaktiviran) tako da izbor tarife za svaki dan ostane isti | Pregledati u Rate History da li je rezultat ono što se želi |
| `rate_resolution_changed` | timesheets | Za neodobrenu satnicu novi redosled tarifa daje drugu tarifu nego ranije | Proveriti iznos pre odobravanja; odobrene nisu pogođene |
| `job_role_b2c_dropped`, `job_role_without_role`, `job_role_rate_shadowed` | projects | B2C na Job Role-u (nije dozvoljen), pozicija bez Job Role-a, ili tarifa Job Role-a koju nadjačava druga | Dodati Job Role / tarifu ručno; B2C ide na angažman ili radnika |
| `profile_special_rate_dropped` | employee_private | Posebna satnica iz profila nije prenesena | Uneti kao tarifu angažmana u Rate History ako treba |
| `schedule_overlap` | schedules | Preklopljen raspored istog radnika | Ispraviti u Schedule |
| `unknown_document_category` | documents | Kategorija dokumenta van šifarnika | Dodeliti vrstu dokumenta |
| tekst „Trošak nema povezanu kategoriju…" | project_costs | Trošak bez kategorije iz Settings | Otvoriti trošak i izabrati kategoriju (obavezno pri sledećoj izmeni) |
| tekst „Trošak van EUR nema datum kursa…" | project_costs | RSD/GBP/USD trošak bez datuma kursa — ne ulazi u EUR zbir | Otvoriti trošak i upisati kurs i datum kursa |

Redosled rešavanja: prvo `assignment_overlap`/`assignment_*` (utiču na obračun), zatim tarife, zatim troškovi, pa ostalo. Posle svake ispravke pokrenuti odgovarajuću kontrolu iz tačke 7 i zatvoriti stavku.

## 7. Kontrolni upiti posle prenosa

Svi su samo za čitanje; „očekivano" je za ispravno stanje. Pokreću se u SQL editoru kao admin.

```sql
-- 7.1 Brojevi po entitetu (porediti sa izvornim brojem iz Base44 / fajla)
select 'employees' t, count(*) from employees union all
select 'vendors', count(*) from vendors union all
select 'clients', count(*) from clients union all
select 'projects', count(*) from projects union all
select 'project_roles', count(*) from project_roles union all
select 'project_assignments', count(*) from project_assignments union all
select 'rates', count(*) from rates union all
select 'timesheets', count(*) from timesheets union all
select 'project_costs', count(*) from project_costs union all
select 'documents', count(*) from documents;

-- 7.2 Duplikati zaposlenih (očekivano: 0 redova)
select lower(email), count(*) from employees where coalesce(email,'') <> '' group by 1 having count(*) > 1;
select employee_id, count(*) from employees group by 1 having count(*) > 1;
select p.jmbg, count(*) from employee_private p where coalesce(p.jmbg,'') <> '' group by 1 having count(*) > 1;

-- 7.3 Projekat bez klijenta, angažman bez Job Role-a, bez tarife (očekivano: 0 ili objašnjeno)
select id, name from projects where client_id is null;
select id, employee_name, project_name from project_assignments where project_role_id is null and status <> 'cancelled';
select a.id, a.employee_name, a.project_name from project_assignments a
 where a.status = 'active' and not exists (select 1 from rates r where r.assignment_id = a.id)
   and not exists (select 1 from rates r where r.project_id = a.project_id and r.employee_id = a.employee_id);

-- 7.4 Preklapanja (očekivano: 0)
select a.id, b.id from project_assignments a join project_assignments b
  on a.employee_id = b.employee_id and a.project_id = b.project_id and a.id < b.id
 and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
 where a.status <> 'cancelled' and b.status <> 'cancelled';

-- 7.5 Veze po ID-u: snimak naziva ne odudara od stvarnog (očekivano: 0)
select a.id from project_assignments a join projects p on p.id = a.project_id where a.project_name is distinct from p.name;
select p.id from projects p join clients c on c.id = p.client_id where p.client_name is distinct from c.name;

-- 7.6 Pripadnost radnika (direktno/vendor) postoji za svakog aktivnog (očekivano: 0 ili objašnjeno)
select e.id, e.employee_id from employees e
 where e.status = 'active' and not exists (select 1 from employment_history h where h.employee_id = e.id);

-- 7.7 Troškovi (očekivano: 0 posle ispravki iz migration_report)
select id from project_costs where cost_category_id is null;
select id from project_costs where currency <> 'EUR' and fx_rate_date is null;

-- 7.8 Satnice (očekivano: 0)
select id from timesheets where approval_status = 'approved' and rate_snapshot is null;
select id from timesheets where approval_status in ('submitted','approved') and assignment_id is null;

-- 7.9 Dokumenta: ističu u narednih 30 dana ili bez fajla (informativno)
select id, employee_id, title, expiration_date from documents where expiration_date < current_date + 30;

-- 7.10 Otvorene stavke migration_report (očekivano: 0 posle rešavanja)
select count(*) from migration_report where resolved_at is null;

-- 7.11 Bezbednost: anon nema dozvole nad tabelama u public (očekivano: 0 redova)
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'anon' and table_schema = 'public';
```

U aplikaciji dodatno proveriti: Dashboard (Active Workers = broj radnika sa aktivnim angažmanom), Project Assignments (broj redova = 7.1), Workers kartica projekta (isti radnici kao u Project Assignments), Payroll → Timesheets (nema upozorenja „rate problem"), Reports (CSV izvoz po pravima). Brojevi na Dashboardu i u izveštajima moraju se poklopiti za isti period (T27).

## 8. Povratak (rollback)

- **Pre push-a:** nema promene u produkciji; odustajanje je bez posledica.
- **Posle push-a:** migracije ne brišu poslovne podatke, pa povratak ne zahteva ručno vraćanje redova. Ako deploy pukne usred primene, Supabase prekida na prvoj grešci (svaka migracija je u transakciji); ispraviti migraciju novom verzijom (ne menjati već primenjenu) i ponovo push.
- **Potpuni povratak stanja:** vraćanje backup-a baze napravljenog neposredno pre push-a (Supabase → Database → Backups / Point-in-time). Sve što je uneto posle backup-a se gubi — zato se unos podataka ne radi istog dana kad i deploy.
- **Pogrešan uvoz zaposlenih/vendora:** uvezeni redovi se brišu pojedinačno iz aplikacije (bez radnih sati i angažmana); radnik sa angažmanom ili satnicama se ne briše (FK `restrict`), nego se deaktivira (Status). Zato se uvoz radi prvo na probnom fajlu od nekoliko redova.
- **Šta se ne vraća:** audit zapisi (`audit_log`) i `migration_report` ostaju kao trag; niko ih ne briše.

## 9. Redosled izvršenja (kontrolna lista za admina)

1. Backup baze; upiti 6.1 (obe vrednosti zapisati).
2. Push na `main`; sačekati primenu migracija i sajta.
3. Upit 6.3 (otvorene stavke) → rešavati po redosledu iz 6.4; svaku zatvoriti.
4. Settings (korak 1–2): odeljenja/pozicije, kategorije, praznici, korisnici i uloge.
5. Uvoz vendora, pa zaposlenih (probni fajl, pa ceo); preuzeti izveštaj o preskočenim redovima; upiti 7.2.
6. Klijenti → projekti → Job Roles → pripadnost → angažmani → tarife (koraci 3–9).
7. Istorija sati i troškovi samo ako su potrebni (koraci 10–11).
8. Upiti 7.1–7.11; porediti sa izvornim brojevima; zapisati odstupanja u `BLOCKERS.md` ako ih ima.
9. Luka potvrđuje stanje (Dashboard, Project Assignments, Reports) pre nego što se Base44 gasi.
