# Teamora — kratka korisnička uputstva

Uputstva za sedam svakodnevnih poslova: angažmani, odobravanje satnica, isplate, obračun za klijente, onboarding ZIP, odsustva sa zamenama i početna strana. Pisana su prema onome što aplikacija stvarno radi (spec v1.4, odeljak 18).

## Kako se čitaju

- **Nazivi ekrana i dugmadi su na engleskom, onako kako stoje u aplikaciji.** U zagradi je naziv stavke menija na srpskom (RS) i slovačkom (SK). Kad se jezik aplikacije promeni (Settings → Language & Currency), dugmad i poruke se prevode, a nazivi ostaju prepoznatljivi.
- **Ko sme** znači ulogu i pravo. Uloge su Admin, Project Manager (PM), HR i Finance. Admin ima sva prava. Prava se po korisniku mogu proširiti ili ukinuti na ekranu Users (stavka „Users" / „Korisnici" / „Používatelia", odeljak Settings). Ako stranica ili dugme ne postoji kod vas, nemate pravo; baza ionako odbija radnju, pa sakrivanje dugmeta nije jedina zaštita.
- Pravila koja **sistem sprečava** važe i kad se radnja pokuša mimo ekrana. Poruke grešaka dolaze iz baze na srpskom i ovde su navedene doslovno.
- Podrazumevana prava po ulozi (admin može da ih menja po korisniku):

| Pravo | PM | HR | Finance |
|---|---|---|---|
| `assignments.manage` (angažmani bez tarifa) | da | da | ne |
| `rates.view_b2b` (B2B tarife i prihod) | da | ne | da |
| `rates.view_b2c` (B2C tarife, trošak rada, isplate radniku) | ne | ne | da |
| `rates.manage` (unos i promena tarifa) | ne | ne | da |
| `timesheets.edit` (unos i slanje satnica) | da | da | da |
| `timesheets.approve` | da | ne | da |
| `timesheets.correct` (vraćanje odobrene satnice) | ne | ne | da |
| `payroll.view` / `payroll.manage` / `payments.record` | ne | ne | da |
| `billing.view` / `billing.manage` | ne | ne | da |
| `reports.financial` | ne | ne | da |
| `onboarding.manage` / `onboarding.export` | da | da | ne |
| `documents.view_sensitive` | ne | da | ne |
| `workforce.manage` | da | da | ne |
| `leave.approve` | da | da | ne |
| `leave.approve_shortage` | da | ne | ne |

---

## 1. Project Assignments (Angažmani na projektima / Pridelenia na projektoch)

**Čemu služi.** Jedna evidencija ko radi na kom projektu, na kojoj poziciji (Job Role), od kada do kada i po kojoj tarifi. Isti podaci se vide na kartici Workers projekta, u Workforce Planning i u izveštajima.

**Ko sme.**
- Pregled: svako ko vidi projekat.
- Add, Edit, Transfer, End, Cancel: pravo `assignments.manage` (PM, HR).
- Kolone i polja B2B tarife: `rates.view_b2b`; B2C tarife: `rates.view_b2c`. Tarifu unosi i menja samo ko ima `rates.manage` (Finance) — kod ostalih polja za tarifu nema u dijalozima.

**Gde.** Meni Projects → **Project Assignments** (Projekti → Angažmani na projektima). Dve kartice: **Assignments** i **Rate History** (istorija tarifa).

### Novi angažman
1. Kliknite **Add Assignment** (Novi angažman / Pridať pridelenie).
2. Izaberite Employee, Project i **Job Role**. Job Role mora da pripada tom projektu; ako ga projekat nema, dodajte ga na kartici Overview projekta.
3. Unesite **Start date**; **End date** ostavite prazno za angažman bez kraja. Po želji izaberite **Planned shift**.
4. Samo uz `rates.manage`: B2C tarifa radnika po satu i, ako se klijentu naplaćuje drugačije od Job Role, B2B izuzetak. Prazno znači da važi tarifa Job Role.
5. Sačuvajte (**Create** / **Save**). Pojavljuje se poruka „Assignment saved".

### Izmena, završetak, prebacivanje
- **Edit assignment** (olovka u redu): Job Role, planirana smena, datumi, napomena. Promena tarife je posebno polje „Effective from" + nova cena + **Reason for the change** (najmanje 5 znakova). Nova cena važi od tog datuma, stara se završava dan ranije; već odobrene satnice zadržavaju svoje tarife.
- Meni **More actions** u redu nudi:
  - **Transfer** — završava ovaj angažman dan pre datuma transfera i otvara novi na drugom projektu. Sati koji su već uneti ostaju na starom angažmanu.
  - **Additional assignment** — zadržava ovaj angažman i dodaje još jedan.
  - **End assignment** — postavlja datum završetka i razlog.
  - **Cancel assignment** — poništava angažman, samo ako nema unetih sati i ako njegova tarifa nije u odobrenoj satnici; inače koristite End assignment.
- **View assignment** otvara panel sa detaljima, tarifama i istorijom izmena (vidite istoriju koju vam prava dozvoljavaju).
- Kod Transfer i Additional obavezan je **Reason** (najmanje 5 znakova); čuva se u istoriji izmena.

### Kartice i filteri
KPI kartice na vrhu (Total Assignments, Active Workers, Active Projects, Expiring This Month), filteri (Project, Client, Job Role, Status, Date Range), **Quick Insights** (statusi, po projektu, Workers Available for Reassignment, Assignments Ending Soon, Workforce Shortages — klik otvara Workforce Planning), izvoz **Export** i **Generate Report**. Brojke na početnoj strani vode ovde sa istim filterima, pa se moraju poklapati.

### Šta sistem sprečava
- Isti radnik ne može imati dva angažmana na istom projektu koja se preklapaju.
- Angažman sa unetim satima ne može da se obriše niti da mu se period skrati tako da sati ostanu bez angažmana; završite ga (End) ili napravite novi.
- Radnik i projekat angažmana sa satima ili tarifom ne menjaju se.
- Otkazan angažman se ne menja i ne završava.
- Tarifa angažmana mora biti veća od 0.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Radnik već ima dodelu na ovom projektu od … do … — dodele istog radnika na istom projektu ne smeju da se preklapaju" | Skratite postojeći angažman ili promenite datume novog. |
| „Dodela ima unete sate … i ne poništava se — završite je (End)" / „Tarifa dodele je u odobrenoj satnici …" | Koristite End assignment umesto otkazivanja. |
| „Dodela ima unete sate … — period ne može da se skrati tako da ti sati ostanu bez dodele" | Datum završetka ne sme biti pre poslednjeg dana sa satima. |
| „Job Role ne pripada projektu dodele" | Izaberite Job Role tog projekta ili ga prvo dodajte na projektu. |
| „Datum transfera mora biti posle početka stare dodele" | Transfer ne može biti na dan početka ili pre njega. |
| „Razlog je obavezan (najmanje 5 znakova)" | Dopunite polje Reason. |
| „Nemate pravo „assignments.manage"" | Tražite pravo od admina. |
| „The project has no job roles yet — add one on the project's Overview tab." | Dodajte Job Role na projektu pre angažmana. |

---

## 2. Timesheet Approval (Radni sati / Pracovné výkazy)

**Čemu služi.** Sati se unose po danima, šalju se na odobrenje, a odobravanjem se zamrzavaju tarife i iznosi. Odobreni sati ulaze u obračune, obaveze i izveštaje.

**Ko sme.**
- Unos i slanje: `timesheets.edit` (PM, HR, Finance).
- Approve / Reject: `timesheets.approve` (PM, Finance), ograničeno na projekte koje korisnik vidi.
- Korekcija odobrene satnice: `timesheets.correct` (Finance).
- Procena troška i prihoda vidi se samo uz `rates.view_b2c` odnosno `rates.view_b2b`.

**Gde.** Meni Payroll → **Timesheets** (Obračun i finansije → Radni sati). Pregled po nedeljama sa tabelom/karticama; Timesheet Dashboard je zaseban pregled.

### Unos i slanje
1. **Add Row**: izaberite radnika i projekat (angažman mora pokrivati dane sa satima), unesite sate po danu. Alternativa su **Work intervals** u detaljima (start, end, break; dan ne može preći 24 h).
2. Proverite upozorenje (trouglić) u redu; objašnjava šta fali.
3. **Submit for approval** (Pošalji na odobrenje). Status prelazi iz Draft u Submitted.

### Odobravanje
1. Filtrirajte na status **Submitted** (kartica „Pending Timesheets" na početnoj strani vodi ovde).
2. Otvorite **Details, intervals and corrections** i proverite sate i **Rates per day**.
3. Kliknite **Approve** (kvačica). Baza za svaki radni dan bira važeću tarifu i koeficijent i upisuje ih kao nepromenljiv snimak.
4. **Reject** (X) otvara polje **Rejection reason**; upišite razlog jer ga vidi onaj ko je uneo sate (polje nije tehnički obavezno). Odbija se samo poslata satnica.
5. **Back to draft** vraća poslatu ili odbijenu satnicu na izmenu.
6. Više redova odjednom: označite redove i koristite **Mass Edit** (Approval Status); redovi sa problemom se preskaču uz poruku zašto.

### Korekcija odobrene satnice
Odobrena satnica se ne menja i ne briše. U detaljima, odeljak **Correct approved timesheet**: upišite razlog (najmanje 5 znakova) i **Return to draft**. Posle ispravke ide ponovo slanje i odobrenje. Ako je mesec već zaključen odobrenim obračunom, korekcija ide kao „adjustment" obaveze u Payables.

### Šta sistem sprečava
- Satnica se ne šalje ni ne odobrava dok ima problem obračuna (nema angažmana za sve dane, nema tarife, nema koeficijenta, tarifa nije po satu, više valuta u istoj nedelji).
- Zbir sati istog radnika u danu ne sme preći dozvoljeni maksimum, računajući i druge projekte tog dana.
- Datum van angažmana ne prolazi.
- U zaključanom mesecu satnice se ne menjaju.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Satnica ne može da se pošalje/odobri: nema dodele radnika na projektu koja pokriva sve dane sa satima" | Napravite ili produžite angažman (odeljak 1). |
| „… nema tarife radnika (B2C) / klijenta (B2B) za …" | Unesite tarifu (Finance) pa pokušajte ponovo. |
| „… nedostaje koeficijent … — Podešavanja → Koeficijenti i praznici" | Admin unosi koeficijent u Coefficients & Holidays. |
| „… tarifa … nije po satu" | Tarifa mora biti po satu u istoj valuti. |
| „Dnevni zbir sati za … bi bio … h (najviše … h u danu); ostali projekti tog dana: …" | Smanjite sate ili ih rasporedite. |
| „Mesec … je zaključan" | Izmena je moguća tek posle otključavanja ili kao korekcija u Payroll. |
| „Odobrena satnica se ne menja; korekcija ide kroz vraćanje uz razlog (Reopen)" | Koristite Correct approved timesheet. |
| „Odbiti se može samo poslata satnica" / „Odbijenu satnicu prvo vratite u nacrt" | Redosled statusa: Draft → Submitted → Approved/Rejected. |

---

## 3. Payroll Payment — Payables & Payments (Obaveze i isplate / Záväzky a výplaty)

**Čemu služi.** Obaveze prema radnicima i dobavljačima računaju se iz odobrenih satnica (B2C tarifa × koeficijent). Isplate se evidentiraju posebno; ekran ne isplaćuje novac, samo beleži šta je plaćeno. Iznosi su uvek po valuti i ne sabiraju se.

**Ko sme.**
- Pregled: `payroll.view` (Finance, admin).
- Generisanje, potvrda, otkazivanje i korekcije: `payroll.manage`.
- Evidentiranje i storno isplate: `payments.record`.

**Gde.** Meni Payroll → **Payables & Payments** (Obračun i finansije → Obaveze i isplate / Mzdy a financie → Záväzky a výplaty); isti naziv je i naslov stranice. Srpski mesečni obračun (neto/bruto) je zasebno, u **Monthly Payroll**.

### Koraci
1. Izaberite **Period** (strelice za mesec ili datume Od/Do, najviše godinu dana).
2. Kliknite **Generate payables** (Generiši obaveze). Prave se ili osvežavaju **nacrti** po primaocu iz odobrenih satnica. Potvrđene obaveze se ne diraju.
3. Ako postoji odeljak **Needs attention**, pročitajte ga: navodi radnike čija odobrena satnica ima problem i koji se preskaču dok se ne reši, kao i nacrte koji su zastareli.
4. Otvorite red (**Details**), proverite razradu po radniku, projektu i angažmanu, pa **Confirm payable**. Posle potvrde su iznos, period, primalac i valuta zaključani.
5. **Record payment**: datum isplate, iznos, referenca (npr. broj izvoda). Status prelazi u Partially paid pa Paid.
6. Pogrešna isplata se ne briše: **Void** uz razlog (najmanje 5 znakova) i unos ispravne.
7. Razliku do neta iz mesečnog obračuna ili ispravku unesite kao **Add adjustment** (+/−) uz razlog. Kartica „Monthly payroll comparison" pokazuje razliku.
8. **Export** daje Excel ili CSV po filterima.

KPI: **Calculated** (obaveza iz odobrenih sati), **Confirmed**, **Paid**, **Remaining**, **Overdue**. Nacrti se ne računaju kao dug.

### Šta sistem sprečava
- **Preplata:** isplata veća od preostalog iznosa se ne evidentira; prvo se unosi korekcija sa razlogom.
- Isplata samo za potvrđenu obavezu, u valuti obaveze.
- Obaveza sa isplatama se ne otkazuje (prvo storno isplata); potvrđena se ne vraća u nacrt.
- Korekcija ne sme spustiti ukupno ispod nule ni ispod već isplaćenog.
- Isplata se ne menja ni ne briše, samo stornira uz razlog.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Preplata — evidentirajte korekciju (adjustment) sa razlogom" / „The amount is higher than the remaining balance (…)" | Iznos prelazi preostalo. |
| „Uplata se evidentira samo za potvrđenu obavezu" / „Confirm the payable first." | Prvo Confirm payable. |
| „Obaveza nije usklađena sa odobrenim satnicama — ponovo pokrenite generisanje" | Nacrt je zastareo; Generate payables. |
| „Primalac ima odobrenu satnicu sa problemom u periodu — rešite je pre potvrde" | Rešite problem satnice (odeljak 2). |
| „Obaveza sa uplatama se ne otkazuje — prvo stornirajte uplate" | Storno pa otkazivanje. |
| „Korekcija bi obavezu spustila ispod već isplaćenog iznosa (…)" | Korekcija je prevelika u minus. |
| „Razlog je obavezan (najmanje 5 znakova)" | Dopunite razlog. |
| „Period nije ispravan" / „Period obaveza može biti najviše godinu dana" | Ispravite Od/Do. |
| U Needs attention: „… has a problem (no_snapshot)" | Odobrena satnica nema sačuvan snimak tarife (starija ili nepotpuna). Korekcija: vratiti je uz razlog i ponovo odobriti. |

---

## 4. Billing Overview / Client Payments (Klijenti / Billing Overview)

**Čemu služi.** Interni B2B obračun za knjigovodstvo i praćenje uplata klijenata. **Teamora ne izdaje fakture:** nema kreiranja, PDF-a, slanja ni automatske numeracije faktura. Račun pravite u svom knjigovodstvenom programu, a ovde samo upisujete njegov broj, datum i iznos.

**Ko sme.**
- Pregled: `billing.view`. Izmene: `billing.manage` (Finance).
- Bez `billing.view` vidi se samo kartica **Clients** (spisak klijenata).
- B2B iznosi uz `rates.view_b2b`.

**Gde.** Meni Payroll → **Clients** („Clients / Billing Overview" / „Klijenti / Billing Overview"). Kartice: **Billing Overview** i **Clients**.

### Koraci
1. Izaberite period, klijenta i projekat. Tabela „Calculation by client and project" prikazuje odobrene sate × B2B tarifa × koeficijent klijenta, po valuti.
2. **Create billing summary**: klijent (opciono jedan projekat), period, valuta, napomena. Za isti klijent i valutu periodi se ne smeju preklapati.
3. Otvorite obračun. Status se menja ručno, korak po korak: **In Preparation → Ready for Accounting → Sent to Accounting → Invoiced Externally** (dugme „Mark as …"). Pri izlasku iz pripreme iznos se zamrzava iz odobrenih sati. Povratak u pripremu je moguć samo iz Ready for Accounting, uz razlog (najmanje 5 znakova), i samo dok nema eksternog računa.
4. Od statusa Ready for Accounting nadalje: **Record external invoice** (referenca, datum, iznos, valuta, dospeće iz vašeg programa).
5. **Record payment**: datum, iznos, referenca. Pogrešna uplata se ne briše nego se **Void** uz razlog.
6. **Billable costs** („Candidates" → **Add**): troškovi označeni kao Billable to Client prikazuju se odvojeno i ne povećavaju B2B prihod. Menjaju se samo dok je obračun In Preparation.
7. **Export** daje Excel, CSV ili PDF; dokument nosi napomenu „Internal calculation — not an invoice".

KPI: **Calculated**, **Not in any billing summary**, **Invoiced externally**, **Payments received**, **Outstanding** (fakturisano − primljeno, samo gde je upisan iznos računa) i **Estimated Unpaid** (obračunato − primljeno bez upisanog računa; nije potvrđeno potraživanje).

### Šta sistem sprečava
- Uplata ne može preći iznos eksternog računa; valuta uplate je valuta računa.
- Obračun van pripreme je zaključan (klijent, projekat, period, valuta). Obračun van pripreme ili sa uplatama se ne briše.
- Isti trošak se ne računa u dva obračuna.
- Nema sabiranja valuta.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Period se preklapa sa postojećim obračunom istog klijenta i valute" | Promenite period. |
| „Satnice sa problemom u periodu — rešite ih pre predaje obračuna" | Rešite problem satnice (odeljak 2). |
| „Nema odobrenih sati ni naplativih troškova za ovaj obračun u izabranom periodu" | Nema šta da se obračuna. |
| „Dozvoljen je samo jedan korak napred (ili Ready for Accounting → In Preparation)" | Statusi se ne preskaču. |
| „Obračun sa evidentiranim eksternim računom se ne vraća u pripremu" | Račun je već upisan; obračun ostaje van pripreme. |
| „Eksterni račun se evidentira tek kad obračun izađe iz pripreme" | Prvo Ready for Accounting. |
| „Uplata prelazi iznos eksternog računa (preostalo …). Korekcija = storno uplate uz razlog" | Smanjite iznos ili stornirajte pogrešnu uplatu. |
| „… line(s) without a B2B rate are not included" | Linije bez B2B tarife nisu uračunate; unesite tarifu. |
| „… line(s) belong to projects without a client and cannot be billed" | Dodelite klijenta projektu. |

---

## 5. Onboarding ZIP (kartica Onboarding na projektu)

**Čemu služi.** Za radnike na projektu proverava se da li imaju sva obavezna dokumenta, a dokumenta iz Employee Documents pakuju se u jedan ZIP. Ništa se ne otpremа dvaput.

**Ko sme.** `onboarding.manage` (definisanje zahteva i priprema) i `onboarding.export` (preuzimanje): PM i HR. Fajlove osetljivih tipova u paketu vidi samo ko ima `documents.view_sensitive` (HR).

**Gde.** Meni Projects → **Project Overview** → otvorite projekat → kartica **Onboarding**. Vrste dokumenata se vode u dijalogu **Document types**.

### Koraci
1. **Required Documents** → **Add required document**: izaberite **Document type**, na koju ulogu se odnosi (**All roles on the project** ili jedan Job Role, npr. sertifikat za zavarivača samo za Welder), **Validity** (Valid today / Valid on assignment start / Valid for the whole assignment), da li je **Mandatory**, **Allowed in ZIP export** i **Warn when expiring within (days)**.
2. Tabela **Worker readiness** (Workers on project) pokazuje po radniku status **Ready** ili **Action required** i po stavci: Available, Expiring soon, Expired, Missing, Not permitted.
3. Označite radnike (**Select all workers**) i kliknite **Prepare package**. Otvara se pregled sa spiskom dokumenata i svakim nedostatkom.
4. Ako je sve u redu, uključite **Mark as Ready** i potvrdite. Ako nešto fali, dugme glasi **Prepare as Incomplete**: paket se pravi kao Incomplete i ne može biti Ready, ali dostupna dokumenta mogu da se pregledaju i izvezu.
5. U odeljku **Onboarding packages** kliknite **Download ZIP**. Pregled pokazuje šta ulazi u paket, pa potvrdite preuzimanje.
6. Svaka priprema i svako preuzimanje beleži se (ko, kada, koja dokumenta); vidi se „Downloaded N× · last …".

### Šta sistem sprečava
- Obavezan dokument koji fali ili je istekao blokira status Ready.
- U paket ne ulaze dokumenta koja nisu označena kao dozvoljena za izvoz, dokumenta bez priloženog fajla, niti osetljiva dokumenta ako nemate pravo (u tabeli „Not permitted").
- Pripremljen paket se ne menja; za izmenu se priprema novi.
- Radnik koji nije angažovan na projektu ne može se staviti u paket.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Paket ima nedostatke (obavezan dokument fali ili nije važeći) i ne može biti označen kao Ready" | Dopunite dokumenta ili pripremite kao Incomplete. |
| „Paket nema nijedan dokument koji smete da preuzmete" | Nijedan dokument nije dostupan vašim pravima ili nema priložen fajl. |
| „Nemate pravo da pripremite/preuzmete onboarding paket …" | Tražite pravo `onboarding.manage` / `onboarding.export`. |
| „Radnik … nije angažovan na ovom projektu" | Prvo ga angažujte (odeljak 1). |
| „Izaberite bar jednog radnika" | Označite radnika pre Prepare package. |
| „Pripremljen paket se ne menja — pripremite novi" | Pripremite novi paket. |
| „Vrsta dokumenta … nije aktivna" | Aktivirajte tip u Document types. |
| „No required documents yet. Every worker is Ready until requirements are defined." | Dok nema zahteva, svi su Ready; prvo dodajte zahteve. |

---

## 6. Leave & Replacement (Odsustva / Žiadosti o voľno)

**Čemu služi.** Odluka o odsustvu uzima u obzir koliko radnika ostaje na smenama (provera kapaciteta). Ako odsustvo napravi manjak, predlažu se zamene.

**Ko sme.**
- Novi zahtev: osoblje aplikacije unosi zahtev u ime radnika (radnici se ne prijavljuju).
- Odluka (Approve/Reject): `leave.approve` (PM, HR).
- Odobrenje uprkos manjku: `leave.approve_shortage` (PM, admin).
- Dodela zamene: `workforce.manage` (PM, HR).

**Gde.** Meni Staff Management → **Leave Requests** (Kadrovi → Odsustva / Správa personálu → Žiadosti o voľno).

### Odluka o odsustvu
1. **New Request**: radnik, vrsta, datumi, razlog. Zahtev je Pending.
2. U redu zahteva kliknite **Review** (Odluka). Otvara se **Leave decision** sa odeljkom **Capacity check**.
3. Ako ne ostaje nijedan projekat bez radnika, poruka glasi „Approving this leave leaves no project short of workers." Kliknite **Approve** (razlog nije obavezan).
4. Ako nastaje manjak, tabela prikazuje projekat, ulogu, smenu i datum (potrebno, dostupno, deficit). Provera obuhvata **sve** projekte na kojima radnik radi, i one koje vi ne vidite (vide se samo brojevi i nazivi, bez tarifa i ličnih podataka). **Approve despite shortage** traži razlog od najmanje 5 znakova i pravo `leave.approve_shortage`; razlog ide u audit log. Ko nema to pravo vidi „Awaiting an authorised manager" i može da odbije ili zamoli ovlašćenog menadžera.
5. **Reject** je uvek moguć. Odluka se ne menja naknadno; za promenu se pravi novi zahtev.
6. Na zahtevu ostaje zapisano ko ga je uneo, ko je i kada odlučio i zašto (ime vidi svako osoblje).

### Zamena
1. Na zahtevu kliknite **Replacements** (Zamene). Prikazuju se **Replacement suggestions** po smenama koje su ostale kratke.
2. Kandidati su razvrstani: **Full Match**, **Partial Availability**, **Transfer Required**, **Standby**, **Not Eligible**, uz razloge (npr. Same job role, Role certificates in order, Different location, No B2C rate, Missing documents). Nedostajuća dokumenta se ne kriju.
3. **Assign replacement** → proverite period (mora biti u okviru potrebnih datuma) → **Confirm replacement**.
4. Ako premeštaj radnika sa drugog projekta tamo pravi manjak, prikazuje se upozorenje; morate označiti „I confirm the transfer and the shortage on the source project."
5. Posle potvrde stiže „Replacement assigned" (uz novo stanje manjka).

### Šta sistem sprečava
- Preklapanje sa već odobrenim odsustvom istog radnika.
- Odluka o već odlučenom zahtevu.
- Zamena radnika samim sobom, neaktivnog radnika, radnika koji je na odsustvu u tom periodu ili koji već ima angažman na tom projektu.
- Zamena van perioda odsustva i za odbijeno odsustvo.
- Premeštaj sa projekta kome nemate pristup.

### Česte poruke
| Poruka | Šta znači |
|---|---|
| „Odobrenje uprkos manjku traži razlog (najmanje 5 znakova)" | Upišite razlog. |
| „Nemate pravo „leave.approve_shortage"" | Samo ovlašćeni menadžer sme; odbijte ili prosledite. |
| „O zahtevu je već odlučeno" | Osvežite listu; napravite novi zahtev ako treba. |
| „Radnik već ima odobreno odsustvo od … do … koje se preklapa sa ovim zahtevom" | Promenite datume. |
| „Premeštaj pravi manjak na izvornom projektu: nedostaje još … — potvrdite transfer" | Potvrdite checkbox ili izaberite drugog kandidata. |
| „Radnik je na odsustvu … — izaberite period kad je dostupan" | Skratite period zamene. |
| „Zamena mora biti u periodu odsustva (… – …)" | Uskladite datume. |
| „Radnik već ima dodelu na ovom projektu … — zamena na drugoj ulozi ili delu perioda nije moguća" | Izaberite drugog kandidata. |
| „No qualified worker is free or transferable for this shift." | Nema kandidata; razmotrite Workforce Planning. |

---

## 7. Dashboard (Početna / Domov)

**Čemu služi.** Pregled operative i finansija za izabrani period; brojke vode na izvorne ekrane sa istim filterima i moraju da se poklapaju sa njima.

**Ko sme.** Svaki prijavljeni korisnik, ali sadržaj zavisi od prava:
- Finansijske kartice (Calculated B2B Revenue, Payroll Cost, Project Profit, Profit Margin, grafikon, Top Profitable …): `reports.financial` (Finance, admin).
- Kartica Additional Project Costs: `costs.view`; Payables: `payroll.view`; Client Unpaid i Unbilled Revenue: `billing.view`.
- Bez `reports.financial` vidi se operativni deo: radna snaga, centar za akcije, brzi linkovi.

**Gde.** Prva stavka menija **Dashboard** (Početna / Domov).

### Kako se koristi
1. Gore desno izaberite **Period** (This Month, Last Month, This Quarter, This Year), **Client**, **Project** i status projekta. Svi prikazi se menjaju zajedno.
2. Kartice: **Approved Hours** (uz napomenu koliko sati čeka odobrenje, nije uključeno), **Pending Timesheets**, finansijske kartice i traka sa **Payables**, **Client Unpaid**, **Unbilled Revenue**, **Active Workers**, **Active Projects**. Klik na karticu otvara izvorni ekran sa istim filterom.
3. Kad podaci imaju više valuta, grafikon i Top liste imaju izbor valute (tabovi EUR/...). Valute se nikad ne sabiraju.
4. **Workforce Overview** (aktivni i raspoloživi radnici danas, po projektu i poziciji), **At a Glance**, **Top Profitable Projects / Clients / Workers**.
5. **Action Center** daje upozorenja koja zahtevaju radnju, svako sa klikom na rešenje: odsustva na odobrenju, nedostatak radne snage, angažmani koji ističu u 30 dana, dokumenta koja ističu, radnici bez obaveznih dokumenata, satnice na odobrenju, neisplaćene obaveze, dospela potraživanja.
6. **Quick Links**: New Assignment, Add Project Cost, Review Timesheets, Prepare Onboarding ZIP, Open Workforce Plan (prikazuju se samo uz odgovarajuće pravo).

### Šta znači poruka na vrhu
| Poruka | Šta znači |
|---|---|
| „Some approved hours have no rate or coefficient and are not in the amounts." / „… approved timesheet(s) have a rate problem and are not in the amounts (their hours are still counted in Approved Hours)." | Sati su u brojaču sati, ali ne u iznosima. Rešite tarifu ili koeficijent (odeljci 1–2). |
| „Some dashboard data could not be loaded. The numbers below may be incomplete." | Dugme **Retry**; brojevi mogu biti nepotpuni. |
| „No approved hours in this period" | U periodu nema odobrenih sati; kartica prikazuje „—", ne nulu. |
| „No data yet" / „Not loaded" | Odgovarajući izvor još nema podatke ili nije učitan. |

---

*Poslednja provera naziva ekrana i dugmadi u kodu i u aplikaciji (lokalni razvojni server): 24.11.2026.*
