# App za radnike — opis aplikacije za testiranje

Stanje: 14.11.2026. Ovaj opis služi da drugi AI napiše plan i uputstvo za testiranje. Sve ovde je provereno u kodu; tvrdnje o greškama imaju putanju do fajla.

> **Ažurirano 14.11.2026 (posle QA prolaza i popravki).** Ponašanje opisano ispod je delom zastarelo — tačno stanje i šta je popravljeno je u `QA-FINDINGS.md` (odeljak „Popravke i ponovno testiranje"). Najvažnije razlike: poruke o uspehu i greškama se prikazuju; greške baze su razumljive (i na EN); iznose satnice računa baza (D16); satnica bez tarife ostaje prazna i ne može da se odobri; izveštaji vezuju satnice po `project_id`/`client_id`; zaštita admin stranica ne zavisi od velikih slova; mobilni meni ima sve stavke; oba pada (masovna izmena radnika, prazan datum u Pregledu radnih sati) su popravljena; obrisani fajlovi se brišu iz Storage-a; spiskovi se čitaju bez granice od 500/1000 redova. U §9 su rešene stavke označene sa ✅.

---

## 1. Šta je aplikacija

Interna web aplikacija za firmu koja svoje radnike i radnike podizvođača šalje na projekte kod klijenata. Pokriva:

- **radnike:** lične podatke, kontakt, zaposlenje, bankovne podatke, dokumenta, angažmane (direktno zaposlen ili preko podizvođača);
- **projekte:** klijent, lokacija, pozicije sa tarifom za klijenta, radnici dodeljeni projektu sa satnicom;
- **satnice:** nedeljni unos sati po radniku i projektu (pon–ned), slanje na odobravanje, odobravanje, PDF;
- **novac:** koliko plaćamo radnika po satu (B2C), koliko naplaćujemo klijentu po satu (B2B), mesečni obračun (neto/bruto, porez, doprinosi, bruto 2 po projektima), izveštaji o zaradi po radniku, klijentu i projektu, troškovi projekta;
- **ostalo:** zadaci, odsustva, prisustvo, raspored smena, obaveštenja, mejl šabloni, podešavanja (odeljenja i pozicije, kategorije troškova).

Aplikacija je nastala kao izvoz iz Base44 i prebačena je na Supabase. **Izgled i ekrani su ostali isti kao u Base44.** Promenjeni su izvor podataka, prijava i pravila u bazi. Novčana logika na ekranima je **još uvek stara** i delom pogrešna (vidi §9). Ispravan obračun neto/bruto ima svoj ekran od Faze 3 — „Mesečni obračun" (§6.18, §8).

Korisnici su admin i operater. Radnici se ne prijavljuju.

---

## 2. Pokretanje, prijava i testovi

| Šta | Gde / kako |
|---|---|
| Aplikacija | http://localhost:5173 — `npm run dev -- --port 5173` (u Claude desktop aplikaciji: preview „radnici-dev") |
| Baza (lokalni Supabase u Dockeru) | `npx supabase start` · API `http://127.0.0.1:57321` · baza `127.0.0.1:57322` |
| Supabase Studio (pregled tabela, korisnici) | http://127.0.0.1:57323 |
| Mailpit (mejlovi prijave) | http://127.0.0.1:57324 |
| Nalozi | `admin@radnici.local` (admin) i `operater@radnici.local` (operater). **Lozinke su u `supabase/seed.sql`** — ne prepisivati ih u izveštaje. |
| Novi korisnici | Registracija je isključena. Nalog se pravi samo u Supabase Studio → Authentication. Prvi napravljeni korisnik postaje admin, svi ostali su operateri. U aplikaciji nema ekrana za upravljanje korisnicima. |
| Testovi obračuna | `npm test` — 17 testova (vitest) |
| Testovi pravila baze | `npm run test:db` — 35 testova (pgTAP); sve se vraća, ne ostavlja podatke |
| Build | `npm run build` |
| Brisanje svih podataka | `npx supabase db reset` — **briše sve lokalne podatke** i ponovo pravi dva naloga. Ne pokretati bez Lukinog odobrenja. |

Ako u `.env.local` fale ključevi, aplikacija prikazuje ekran „Supabase nije podešen" umesto prijave.

### Podaci koji su sada u lokalnoj bazi

- 1 radnik: **Marko Test** (EMP-001), aktivan, bez pozicije
- 1 klijent: **Test Gradnja d.o.o.**
- 1 projekat: **Hala Novi Sad** (vezan za tog klijenta)
- Nema satnica, tarifa, podizvođača, dokumenata ni praznika.
- Vrste sati: `redovni` ima koeficijent 1 (radnik i klijent). `prekovremeni`, `vikend` i `praznik` nemaju koeficijent. Ekrani ih trenutno ne koriste.

---

## 3. Tehnički okvir (koliko treba za testiranje)

- React 18 + Vite + Tailwind + shadcn/ui. Supabase pruža Postgres, prijavu, Storage i pravila pristupa po redovima (RLS).
- `src/api/base44Client.js` prima iste pozive koje su stranice slale Base44-u (`entities.X.list/filter/get/create/update/delete`, `UploadFile`, `SendEmail`) i izvršava ih nad Supabase-om. Stranice zato nisu menjane.
- Podaci radnika su podeljeni u dve tabele:
  - `employees` sadrži javna polja;
  - `employee_private` sadrži JMBG, banku, IBAN, platu i tarife i vidi je samo admin. Sloj podataka ih spaja pri čitanju.
- Fajlovi su u privatnom Storage-u (bucket `files`, PDF i slike, do 20 MB). Stranice dobijaju potpisan link koji važi 1 sat.
- Novčane formule koje treba da važe ubuduće su u `src/lib/payroll/`. Pravila odlučivanja su u `DECISIONS.md` (D1–D15), a plan rada u `BACKLOG.md`.

---

## 4. Uloge i pristup

| | Admin | Operater |
|---|---|---|
| Kadrovi (Zaposleni, Dobavljači, Dokumenti, Zadaci, Odsustva, Obaveštenja, Izveštaji) | da | da |
| Projekti → Pregled projekata, detalj projekta | da | da |
| Projekti → Troškovi projekata, Tarife i dodele | da | **ne** |
| Obračun → Radni sati (`/timesheets`), Klijenti (`/clients`) | da | da |
| Obračun → Platni spisak, Pregled radnih sati, Mesečni obračun, Finansijski izveštaji | da | **ne** |
| Podešavanja (Email poruke, Odeljenja, Kategorije troškova) | da | **ne** |

**U aplikaciji:**
- operater ne vidi zabranjene stavke u meniju;
- kad otvori zabranjenu adresu direktno, vraća se na početnu (`src/lib/access.js`, `src/App.jsx`).

**U bazi (RLS):**
- Operater ne vidi `employee_private` (JMBG, banka, plata, tarife radnika), `rates`, `project_costs`, `payroll_*`, `payslips` ni `email_templates`.
- Operater ne može da upisuje klijente, odeljenja, kategorije troškova, vrste sati, praznike ni pravila rada.
- Operater ne može da odobri satnicu niti da upiše već odobrenu.
- Operater ne može sam sebi da promeni ulogu.
- Neprijavljen korisnik ne vidi ništa.

**Prihvaćeno ograničenje (D3):** operater vidi tarife i iznose koji su upisani u samu satnicu (`b2c_rate`, `b2b_rate`, `worker_cost`, `client_revenue`, `profit`) i u projekat (`job_roles`, `assigned_employees`). Zato na Radnim satima i u finansijskom izveštaju projekta vidi novac.

**Gde ekran i baza ne idu zajedno** (dobro mesto za test):
- Ekrani nigde ne proveravaju ulogu. Operater na Radnim satima vidi dugmad Odobri, Odbij, masovnu izmenu i brisanje. Baza odbija odobravanje, ali greška se ne prikazuje (§5).
- Operater na Klijentima vidi dugme za dodavanje, a baza mu ne dozvoljava upis.
- Kad operater čuva radnika, bankovni podaci i plata se tiho ne upisuju.
- Kod operatera finansijski izveštaj projekta prikazuje troškove projekta kao 0, jer ih RLS ne vraća.

---

## 5. Ponašanje koje važi za sve ekrane

1. **Jezik** se bira u gornjoj traci (EN/RS). Podrazumevan je EN i pamti se u `localStorage` pod ključem `app_lang`. Mnogo teksta ostaje na jednom jeziku bez obzira na izbor (§9.3).
2. **Prekidač valute EUR/RSD** u gornjoj traci se pamti, ali **ne menja ništa** na ekranima. Svi iznosi su u €.
3. **Poruke o uspehu i greškama (toast) se ne prikazuju nigde.**
   - 22 stranice i komponente šalju poruke preko biblioteke `sonner`.
   - `src/App.jsx` montira samo shadcn `<Toaster/>` (`@/components/ui/toaster`).
   - `sonner` Toaster (`src/components/ui/sonner.jsx`) nije nigde uključen.
   - Zato se ne vide ni poruke tipa „Popunite obavezna polja".
4. **Greške pri upisu su tihe.**
   - Nijedna izmena nema obradu greške, a `src/lib/query-client.js` nema globalnu.
   - Kad baza odbije upis, dijalog ostane otvoren, dugme se ponovo aktivira i nema objašnjenja. Zato posle svake akcije treba proveriti da li je zapis zaista sačuvan (osvežiti stranicu ili pogledati u Studiju).
5. **Podaci se pri čuvanju tiho menjaju:**
   - polja koja ne postoje u bazi se izbacuju (upozorenje samo u konzoli dev builda);
   - prazno polje postaje `null`, a kod polja sa satima postaje `0`;
   - filter po nepostojećem polju vraća prazan spisak;
   - sortiranje po nepostojećem polju se preskače.
6. **Fajlovi:** link na fajl ističe posle 1 sata, a stranica ga ne osvežava sama. Tek ponovno učitavanje daje novi link.
7. **Datumi** u prikazu imaju engleske nazive meseci i dana i na srpskom.
8. **Mobilni meni** (uska širina ekrana) sadrži samo Početnu, Zaposlene, Dokumente, Prisustvo, Raspored, Zadatke, Odsustva, Obaveštenja i Izveštaje, sa nazivima samo na engleskom. Nema projekata, satnica, obračuna, klijenata, dobavljača ni podešavanja.
9. **Grid ili lista:** na Zaposlenima, Dokumentima, Radnim satima i Rasporedu izbor prikaza se pamti po stranici.
10. **Odjava:** dno bočnog menija, a na mobilnom dno menija.

---

## 6. Meni i ekrani

Naziv ekrana je dat kao „EN / RS" iz menija. Uz svaki ekran piše ko ga vidi.

### 6.0 Prijava — `/login` (svi)
- Polja: email i lozinka. Pogrešni podaci daju poruku „Pogrešan email ili lozinka".
- Napomena na ekranu: nalozi se prave kod administratora. Nema registracije ni zaboravljene lozinke.
- Ako je korisnik prijavljen, ali nema aktivan profil, prikazuje se ekran „korisnik nije registrovan".

### 6.1 Dashboard / Početna — `/` (svi)
- Samo pregled, bez akcija; kartice nisu klikabilne.
- **Kartice:**
  - Ukupno radnika (uz „N aktivnih"), Aktivni, Na odsustvu. Na odsustvu računa samo radnike sa statusom `on_leave`; odobreno odsustvo se ne računa.
  - Dokumenta koja ističu: rok `expiration_date` u narednih 0–30 dana, praktično do danas+31.
  - Otvoreni zadaci (status nije `completed`, od najviše 50 zadataka).
  - Zahtevi za odsustvo na čekanju (od najviše 50).
  - Rođendani u narednih 30 dana. Spisak je skraćen na 5, pa brojka nikad ne prelazi 5.
  - Kartica „Dokumenta koja ističu" se ponavlja dva puta.
- **Spiskovi:** 5 poslednje dodatih radnika (link na profil), rođendani, dokumenta koja ističu (redosled po datumu dodavanja, ne po roku).
- **Greška u rođendanima** (`src/pages/Dashboard.jsx:51-61`): rođendan danas pada u sledeću godinu i ne prikazuje se, a rođendan sutra piše „Danas!".

### 6.2 Employees / Zaposleni — `/employees` (svi)
- **Pretraga:** ime, prezime, pozicija, šifra (ne email).
- **Filteri:** status (active / suspended / on_leave / terminated) i odeljenje (vrednosti kako su upisane u radnike).
- **Sortiranje** po kolonama, samo u prikazu liste: ime, odeljenje, pozicija, šifra, status.
- **Kartica / red:** fotografija ili inicijali, „Prezime Ime", status, pozicija i odeljenje (prevedeni preko podešavanja odeljenja, po imenu), šifra, email, telefon.
- **Dodaj radnika** otvara `/employees/new` (puno učitavanje stranice).
- **Masovna izmena** izabranih radnika: status, odeljenje, pozicija, mesto rada. Popunjava se samo ono što je uneto, i to za svakog radnika posebno.
  - Izbor ostaje i kad se promeni filter, pa se menjaju i radnici koji se ne vide.
  - **Verovatan pad:** padajuća lista pozicija u masovnoj izmeni crta objekat `{name, translation}` kao tekst (`src/pages/Employees.jsx:354-356`). Proveriti kad odeljenje ima pozicije.

### 6.3 Forma radnika — `/employees/new` i `/employees/edit?id=<uuid>` (svi)
- **Izgled:** fotografija na vrhu (do 5 MB, slika; veličina se ne proverava). Ispod je harmonika sa 5 sekcija, a otvorena je samo jedna.
- **Lično:**
  - ime* i prezime* (proverava se samo da nisu prazni; baza odbija i samo razmake);
  - datum rođenja, pol (male / female / other);
  - državljanstvo (99 ponuđenih vrednosti).
- **Kontakt:** telefon, email (format se ne proverava), adresa, grad, poštanski broj, država (49 vrednosti).
- **Zaposlenje:**
  - šifra radnika: kod novog radnika automatski `EMP-NNN` (najveći broj + 1, gleda poslednjih 100 radnika). Baza zahteva da bude jedinstvena, a forma to ne proverava;
  - odeljenje i pozicija iz podešavanja; promena odeljenja briše poziciju;
  - vrsta zaposlenja (full_time / part_time / temporary / contractor);
  - početak i kraj (baza zahteva kraj ≥ početak, forma ne);
  - status.
- **Finansije:** banka, IBAN, SWIFT, PIB, plata (prazno postaje 0), učestalost isplate (monthly / bi_weekly / weekly). Upisuje se u `employee_private` samo kad čuva admin.
- **Kontakt za hitne slučajeve:** ime, srodstvo, telefon, adresa.
- **Nema u formi (treba za novac):**
  - satnica radnika B2C i B2B;
  - prekovremena, vikend i praznična tarifa;
  - JMBG, lična karta, pasoš;
  - osnova satnice neto/bruto i udeo radnog vremena.

  Komponenta `PayrollInfoFields` postoji, ali se ne koristi (`src/components/employees/EmployeeFormFields.jsx:400-465`). Zato radnik **ne može da dobije satnicu iz profila kroz aplikaciju**. Satnica se trenutno zadaje samo na projektu (§6.12).
- **Čuvanje** vodi na spisak radnika. Ako fotografija ne uspe da se otpremi, ostaje „Otpremanje..." zauvek.

### 6.4 Profil radnika — `/employees/:id` (svi)
- **Zaglavlje:** fotografija, ime, pozicija, status. Dugmad Izmeni i Obriši (sa potvrdom).
  - Brisanje radnika u bazi briše i njegova dokumenta, odsustva, prisustva, smene, angažmane i privatne podatke. Zadacima samo skida dodelu.
- **Kartice:**
  - Lično;
  - Zaposlenje;
  - Angažmani;
  - Finansije: plata uvek u €; operater ovde ne vidi ništa;
  - Hitni kontakt;
  - Dokumenta (broj).
- **Dokumenta:**
  - Dodavanje traži naziv* i kategoriju*. Kategorije: id_card, passport, work_permit, contract, certificate, diploma, training_certificate, driver_license, insurance, medical_certificate, safety_certificate, other.
  - Rok važenja i fajl (PDF ili slika) nisu obavezni.
  - Za postojeće dokumente: pregled, preuzimanje (otvara novi tab) i brisanje.
  - Status dokumenta se nigde ne računa.
- **Angažmani** (istorija: direktno zaposlen ili radnik podizvođača):
  - Polja: vrsta*, podizvođač* (samo kod podizvođača), početak*, kraj (prazno znači da traje), status (active / ended), napomena.
  - Forma proverava preklapanje sa drugim angažmanima i ne gleda status.
  - Baza takođe odbija preklapanje, kraj pre početka i podizvođača bez dobavljača.
  - Baner „trenutni angažman" i oznaka „● Trenutni" u redu koriste različita pravila. Baner gleda datume, a oznaka gleda status = active i prazan kraj.
- Ako radnik ne postoji, stranica se vrti zauvek.

### 6.5 Vendors / Dobavljači (podizvođači) — `/vendors` (svi)
- **Spisak:** pretraga po nazivu, pravnom nazivu, šifri, državi, kontaktu i emailu; sortirano po nazivu.
  - Kolone: naziv i šifra/PDV, mesto, kontakt, broj aktivnih radnika, valuta, status.
  - Aktivni radnici = broj angažmana sa ovim dobavljačem i statusom active (broje se redovi, ne ljudi; datumi se ne gledaju).
- **Forma:**
  - naziv*, pravni naziv, šifra (npr. VEN-001, ručno), matični broj, PIB, PDV broj;
  - država, grad, poštanski broj, adresa;
  - kontakt osoba, email, telefon;
  - valuta (EUR / RSD / GBP / USD), rok plaćanja, ciklus obračuna (weekly / biweekly / monthly), broj ugovora, status, napomena.
- **Brisanje:** dobavljač koji ima ijedan angažman ne može da se obriše (baza), a greška se ne vidi.

### 6.6 Documents / Dokumenti — `/documents` (svi)
- Registar dokumenata svih radnika.
- Pretraga po nazivu i imenu fajla, filter po kategoriji (12 kategorija, nazivi samo na srpskom).
- Sortiranje: naziv A–Ž i Ž–A, radnik, rok važenja, najnovije.
- **Dodavanje:** radnik*, naziv*, kategorija*, rok važenja, fajl. Forma se ne prazni posle otkazivanja.
- **Pregled:** slike i PDF se prikazuju u prozoru, ostalo „pregled nije dostupan". Uz to preuzimanje i brisanje.
- Status dokumenta (valid / expiring_soon / expired) se nigde ne računa, pa piše „unknown".

### 6.7 Tasks / Zadaci — `/tasks` (svi)
- **Dodavanje:** naslov*, opis, dodeljen (samo aktivni radnici), rok, prioritet (low / medium / high / urgent). Status je na početku todo.
- **Kartice:** naslov, prioritet, kome je dodeljen, rok. Opis se ne prikazuje.
- Status se menja direktno na kartici (todo / in_progress / review / completed). Završeni zadaci prelaze u „Arhivu".
- Pretraga po naslovu, filter po statusu. Nema izmene ostalih polja ni brisanja.

### 6.8 Leave Requests / Odsustva — `/leave-requests` (svi)
- **Novi zahtev:** radnik*, vrsta* (vacation / sick / personal / maternity / paternity / unpaid / other), od*, do* (baza zahteva do ≥ od), razlog. Status je na početku pending.
- Filter po statusu. Zahtev na čekanju može da se odobri ili odbije, bez potvrde i bez beleženja ko je to uradio.
- Odobravanje ne menja status radnika i ne šalje obaveštenje. Nema izmene ni brisanja.

### 6.9 Notifications / Obaveštenja — `/notifications` (svi)
- Spisak sa oznakom pročitano/nepročitano. Klik označava kao pročitano; postoji i „Označi sve kao pročitano".
- **Aplikacija nigde ne pravi obaveštenja**, pa se spisak puni samo spolja, npr. ručno u Studiju.

### 6.10 Reports / Izveštaji — `/reports` (svi)
- Četiri grafikona: radnici po odeljenju, radnici po statusu, po vrsti zaposlenja i dokumenta po statusu.
- Dokument bez statusa se broji kao valid. Nema filtera ni izvoza.

### 6.11 Projects / Pregled projekata — `/projects` (svi)
- Ceo ekran je na srpskom, bez prevoda.
- Pretraga po nazivu, klijentu i lokaciji. Sortiranje po nazivu je u listi, a primenjuje se i u gridu.
- Prikaz: `[broj] naziv`, status (Aktivan / Pauziran / Završen), klijent, lokacija, datumi, broj dodeljenih radnika.
- **Forma projekta (dodavanje i izmena):** broj projekta, naziv* (jedina provera), klijent (izbor po imenu), lokacija, početak, kraj (ne proverava se da je posle početka), status, opis.
  - Baza sama povezuje projekat sa klijentom po imenu (`client_id`). Preimenovanje klijenta osvežava ime u projektima.
- Nema brisanja iz spiska, samo iz detalja projekta.

### 6.12 Detalj projekta — `/projects/:id` (svi)
- Dugmad Izmeni i Obriši (sa potvrdom). Brisanje projekta ne briše njegove satnice ni troškove.
- **Kartica Pregled:**
  - **Pozicije (`job_roles`):**
    - Polja: naziv pozicije (iz podešavanja odeljenja) i **B2B tarifa** (koliko naplaćujemo klijentu po satu).
    - Čuva se samo naziv i B2B. Izmena pozicije briše eventualnu B2C vrednost. Moguće su dve iste pozicije. Brisanje je bez potvrde.
  - **Radnici na projektu (`assigned_employees`):**
    - Polja: radnik (samo oni koji još nisu dodati), pozicija (iz pozicija projekta ili „Ostalo"), **ručna B2C tarifa** (koliko plaćamo radnika po satu).
    - Upisuje se B2B iz pozicije i B2C iz ručnog unosa.
    - Greške u prikazu: u izboru pozicije piše „B2C: €undefined/h", a pregled zarade daje NaN kad B2C nije ručno unet (`src/components/projects/ProjectEmployees.jsx:218, 273-277`).
- **Kartica Finansijski izveštaj** (`ProjectFinancialReport.jsx`):
  - satnice se traže **po imenu projekta**, i to **sve, i neodobrene** (nacrti i odbijene);
  - troškovi projekta se traže po `project_id`;
  - prihod = Σ prihod satnica, trošak radnika = Σ trošak satnica;
  - troškovi projekta u EUR i RSD prikazani su odvojeno i ne preračunavaju se;
  - **bruto zarada = prihod − trošak radnika, bez oduzimanja troškova projekta;**
  - marža i prosečno €/h;
  - tabela po radnicima i po kategorijama troškova.

### 6.13 Project Costs / Troškovi projekata — `/project-costs` (admin)
- Pretraga po napomeni i kategoriji, filter po projektu.
- Zbir u EUR i zbir u RSD se prikazuju odvojeno (bez preračuna), uz mali grafikon.
- **Dodavanje:** projekat*, iznos* (može negativan), valuta (EUR / RSD), kategorija i podkategorija (iz podešavanja, čuva se po imenu), napomena.
- Nema izmene. Brisanje ide sa potvrdom.

### 6.14 Rates & Assignments / Tarife i dodele — `/rates` (admin)
- **Tarife:**
  - Polja:
    - opseg: assignment / project / employee;
    - vrsta: cost (plaćamo radnika) / revenue (naplaćujemo klijentu);
    - dodela, radnik, projekat, pozicija (zavisno od opsega);
    - jedinica: hourly / daily / weekly / monthly;
    - iznos*;
    - valuta: EUR / RSD / GBP / USD;
    - status;
    - važi od*, važi do;
    - napomena.
  - Ne proverava se da je „do" posle „od", ne proverava se preklapanje, a negativan iznos je dozvoljen.
- **Dodele (angažman radnika na projektu):** radnik*, projekat*, pozicija, od*, do, status (planned / active / completed / cancelled), referenca tarife, napomena. Pri čuvanju se upisuje i dobavljač iz angažmana radnika na dan početka.
- **Kalkulator tarife:**
  - Bira se radnik, projekat i datum. Prikazuje koja tarifa važi za trošak i za prihod, iz kog nivoa dolazi, i upozorenje na sukob.
  - Redosled: dodela → projekat (pozicija ima prednost) → radnik. Kad nema tarife, piše „nema važeće tarife" i ne vraća 0.
- **VAŽNO:** tarife sa ovog ekrana **ne utiču na novac u satnicama**. Koristi ih samo kalkulator (§9.1).

### 6.15 Payroll Dashboard / Platni spisak — `/payroll` (admin)
- Pregled za sve vreme, bez filtera po datumu.
- **Kartice** (samo odobrene satnice):
  - ukupno sati, trošak plata, prihod od klijenata, neto zarada (prihod − trošak), marža;
  - za isplatu = Σ nedeljnih obračuna sa statusom pending;
  - satnice na odobravanju, aktivni radnici.
- **Top 5:** radnici po zaradi (grupisano po imenu radnika) i klijenti po zaradi (po imenu klijenta).
- **Spiskovi:** obračuni na čekanju i satnice na odobravanju.
- Učitava 500 satnica sortiranih po polju `date`, koje ne postoji. Sortiranje se zato preskače i sa puno satnica neke se ne računaju.

### 6.16 Timesheets / Radni sati — `/timesheets` (svi; glavni ekran za unos)
- **Biranje nedelje:** prethodna, sledeća, ova nedelja; nedelja počinje ponedeljkom. Prikazuju se samo redovi izabrane nedelje.
- Nema filtera po radniku, projektu ili statusu i nema pretrage. Sortiranje: ime, sati, status.
- **Kartice nedelje** (svi statusi, i nacrti i odbijene): ukupno sati, trošak, prihod, zarada.
- **Tabela:**
  - kolone: izbor, oznaka nedelje (npr. 2026W46), radnik (spajalica ako ima prilog), projekat/klijent, pon–ned sa datumima (vikend obojen), ukupno, prekovremeno, status, akcije;
  - poslednji red sadrži zbirove.
- **Izmena u tabeli** (samo prikaz liste): menjaju se samo sati po danima (0–24, korak 0,5). Projekat, klijent, napomena i prilog posle unosa ne mogu da se menjaju.
- **Dodavanje reda:**
  - projekat* (aktivni pa završeni, ili „ručni unos" slobodnim tekstom; ne proverava se iako ima *);
  - radnik* (ako je izabran projekat, samo radnici dodeljeni tom projektu);
  - klijent (iz spiska klijenata ili „other");
  - 7 polja za sate (prolaze i negativni brojevi);
  - napomena;
  - prilog (PDF).
- **Statusi:** nacrt → poslato (Pošalji) → odobreno / odbijeno (Odobri / Odbij). Odbijena satnica nema dugme za ponovno slanje.
  - Izmena i brisanje se ne nude za odobrene.
  - Masovna izmena statusa izabranih redova može da postavi bilo koji status, pa i da vrati odobrenu u nacrt (to baza dozvoljava adminu ako mesec nije zaključan). Iznosi se pri tom ne preračunavaju.
  - Masovno brisanje pokušava da obriše i odobrene. Baza to odbija, a greška se ne vidi.
- **PDF:** za jedan red i za celu nedelju; pregled satnice u prozoru (§9.2).
- **Kako se računa novac danas** (`src/pages/payroll/Timesheets.jsx`):
  - **ukupno sati** = zbir 7 dana (baza ga ionako sama preračuna);
  - **prekovremeno** = max(0, ukupno − 40), **posebno za svaki red** (radnik sa dva projekta po 30 h nema prekovremenih). Prekovremeni sati se plaćaju i naplaćuju kao redovni, bez koeficijenta;
  - **tarifa:** prvo satnica radnika na projektu (`assigned_employees`), pa satnica iz profila radnika, a **ako nema nijedne, upisuje se 0, bez upozorenja**;
  - **trošak radnika** = sati × B2C, **prihod** = sati × B2B, **zarada** = prihod − trošak, zaokruženo na 2 decimale.
- Satnica je za projekat vezana **po imenu**. Baza sama upisuje `project_id` kad je ime jednoznačno.
- Ekran je **uvek na engleskom** (`const T = UI.en`, red 193).

### 6.17 Timesheet Dashboard / Pregled radnih sati — `/timesheet-dashboard` (admin)
- Tabela sati bez novca.
- **Filteri:**
  - dobavljač/klijent;
  - godina;
  - period: ISO nedelje od–do, mesec ili proizvoljno od–do datuma;
  - projekat (po imenu);
  - pretraga po radniku.

  Na početku je izabrano poslednje 4 nedelje sa podacima.
- **Prikaz:** kolone po danima ili po nedeljama. Grupe po dobavljaču sa međuzbirom, pa ukupan zbir. Sortiranje: ime, šifra, ukupno sati.
- **Kartice:** ukupno sati, broj radnika, broj dobavljača, prosek po radniku.
- **Izvoz:** Excel i PDF (naslov „Teamora — Timesheet Report").
- Broje se **sve** satnice, i neodobrene.
- Ako se kod proizvoljnog perioda obriše datum, stranica verovatno pada (`TimesheetDashboard.jsx:104, 133`).

### 6.18 Monthly Payroll / Mesečni obračun — `/payroll/monthly` (admin; stari `/payroll/weekly` vodi ovde)
Isti izgled kao nekadašnji „Nedeljni obračun", mesec umesto nedelje (D17). Novac računa `src/lib/payroll/payrollMonth.js`.
- **Biranje meseca** (strelice, „Ovaj mesec"; mesec ostaje u adresi `?month=2026-03`).
- **Kurs EUR/RSD** za mesec unosi admin (npr. 117,2). Bez kursa „Generiši obračun" odbija, i ekran i baza; podrazumevani kurs ne postoji.
- **Zaključavanje meseca:** dugme „Zaključaj mesec" (sve satnice koje zalaze u mesec moraju biti odobrene) i „Otključaj mesec" (samo dok ne postoji obračun).
- **Generiši obračun** pravi nacrt (može ponovo): samo iz **odobrenih** satnica; nedelja koja prelazi u drugi mesec deli se po danu, sa tarifama, koeficijentima, pragom i praznicima iz snimka satnice. Po radniku: neto, porez, doprinosi radnika, bruto, doprinosi poslodavca, bruto 2 (trošak), za isplatu; klikom na radnika — raspodela po projektima. Podizvođač: isplata = trošak = sati × tarifa, bez poreza.
- **Šta blokira obračun:** satnica odobrena bez snimka (pre Faze 2), koeficijent/tarifa koja fali u snimku, radnik bez angažmana — poruka sa radnikom, nedeljom i projektom; takav radnik nema listić. Ispod je i provera iz baze. Nacrt koji više ne odgovara podacima ili promenjen kurs se takođe prikazuju.
- **Kartice:** ukupno sati, za isplatu, bruto 2 (trošak), prihod od klijenata.
- **Raspodela troška po projektima:** sati, zarada, trošak radnika, prihod, razlika; ispod piše da je zbir troška po projektima jednak zbiru bruto 2 (ostali troškovi projekta nisu uključeni).
- **Status:** Nacrt → Odobri obračun (uz potvrdu; dugme radi tek kad nema problema) → Označi kao isplaćeno (uz potvrdu). „Obriši nacrt" postoji samo za nacrt. Odobren i isplaćen obračun ne mogu da se menjaju ni brišu (baza).
- Neto/bruto je upravljački obračun po D7 i **ne zamenjuje PPP-PD prijavu i knjigovođu**.

### 6.19 Clients / Klijenti — `/clients` (svi; upis samo admin)
- **Prikaz:** grid ili lista; pretraga po nazivu; sortiranje po nazivu.
- **Kartica:** naziv, kontakt, „€X/h billing rate", sati, prihod i zarada. Sati, prihod i zarada su iz odobrenih satnica, povezani **po imenu klijenta**.
- **Forma:** naziv* (ne proverava se), kontakt osoba, email, telefon, podrazumevana B2B tarifa (samo za prikaz, ne koristi se u računu), PDV broj, rok plaćanja, adresa, napomena.
- **Brisanje bez potvrde.**

### 6.20 Payroll Reports / Finansijski izveštaji — `/payroll/reports` (admin)
- **Projekti:** satnice po imenu projekta (samo odobrene), troškovi po `project_id`.
  - Sve-projekti tabela: sati, prihod, trošak radnika, troškovi (samo EUR, RSD se ignoriše), bruto zarada **bez oduzimanja troškova**, marža.
  - Izbor jednog projekta daje detaljan pregled.
  - Na ovoj kartici tekst je na srpskom i kad je izabran engleski.
- **Plate radnika:** po imenu radnika. Prikazuje sate, tarifu iz prvog reda, ukupnu platu i grafikon top 8.
- **Naplata klijentima:** po imenu klijenta, sa B2B tarifom iz prvog reda i ukupnim iznosom fakture.
- **Zarada:** po radniku.
- **Nedeljni pregled:** svi nedeljni obračuni.
- Nema izvoza.

### 6.21 Attendance / Prisustvo — `/attendance` (svi; samo u mobilnom meniju)
- **Unos:** radnik* (aktivni), datum* (danas), dolazak, odlazak, pauza u minutima, status (present / absent / late / half_day / holiday), prekovremeno (ručno).
- **Sati** = odlazak − dolazak − pauza. Noćna smena daje 0, a bez oba vremena je 0.
- Pretraga po radniku. Nema izmene ni brisanja.

### 6.22 Schedule / Raspored — `/schedule` (svi; samo u mobilnom meniju)
- Nedeljni kalendar (grid ili lista).
- **Unos smene:** radnik* (aktivni), datum*, od*, do* (ne proverava se da je „do" posle „od"), vrsta (morning / afternoon / night / full_day / custom), lokacija.
- Brisanje bez potvrde. Nema izmene.

### 6.23 Email Notifications / Email poruke — `/email-notifications` (admin)
- Ceo ekran je na engleskom.
- **Šabloni** (7 vrsta: timesheet_reminder, payroll_notification, shift_schedule, document_expiry, payment_confirmation, contract_reminder, general_announcement): dodavanje, izmena i brisanje.
- **Slanje:** svim aktivnim radnicima koji imaju email ili izabranima. Zamenjuju se samo `{employee_name}` i `{company_name}` (uvek „Stelux Construct DOO"), i to samo u telu poruke.
- **Slanje mejla nije podešeno:** poziv uvek baca grešku „Slanje mejlova još nije podešeno". Dugme ostaje na „Sending..." i ništa se ne prikazuje.

### 6.24 Departments & Positions / Odeljenja — `/settings/departments` (admin)
- **Odeljenje:** naziv* (EN), prevod (RS), pozicije (naziv i prevod).
- Pozicije se mogu dodavati, menjati i brisati. Duplikat se proverava samo pri dodavanju.
- Radnici čuvaju odeljenje i poziciju **kao tekst**, pa preimenovanje ne menja postojeće radnike.

### 6.25 Cost Categories / Kategorije troškova — `/settings/cost-categories` (admin)
- **Kategorija:** naziv* (EN), prevod (RS), podkategorije.
- Troškovi projekata čuvaju kategoriju **po imenu**, pa preimenovanje ili brisanje kategorije menja kako se postojeći troškovi prikazuju.

### 6.26 Nepostojeća adresa
Prikazuje se stranica „nije pronađeno".

---

## 7. Pravila koja baza sprovodi bez obzira na ekran

Ovo su dobra mesta za testove. Kroz aplikaciju se greška **ne vidi** (§5.4), pa se ishod proverava ponovnim učitavanjem ili u Studiju. Pravila su pokrivena pgTAP testovima u `supabase/tests/01_pravila.test.sql`.

| Pravilo | Šta se očekuje |
|---|---|
| Satnica: nedelja počinje ponedeljkom | drugi dan → odbijeno |
| Satnica: jedan red po radnik + projekat + nedelja | drugi isti red → odbijeno |
| Satnica: po danu 0–24 h | van opsega → odbijeno |
| Satnica: ukupno sati računa baza | poslato 99, upisano tačno |
| Satnica: `project_id` | popunjava se iz imena projekta kad je ime jednoznačno |
| Odobravanje satnice | samo admin; operater → odbijeno |
| Odobravanje traži B2C i B2B tarifu | prazna (`null`) → odbijeno. **Tarifa 0 prolazi**, a ekran upisuje 0 kad tarife nema (§9.1). |
| Odobrena satnica | ne menja se i ne briše; admin može samo da joj vrati status (ako mesec nije zaključan) |
| Zaključan mesec | nema unosa ni izmene satnica koje imaju dane u tom mesecu, uključujući nedelju koja prelazi iz meseca u mesec. Mesec se zaključava samo funkcijom u bazi; **u aplikaciji nema dugmeta**. |
| Radnik: šifra (`employee_id`) jedinstvena | dupla → odbijeno |
| Radnik: kraj ≥ početak; ime ne sme biti samo razmaci | inače odbijeno |
| JMBG: 13 cifara + kontrolna cifra | pogrešna → odbijeno (u formi još nema polja) |
| Angažmani istog radnika ne smeju da se preklapaju | odbijeno |
| Angažman preko podizvođača traži dobavljača | odbijeno |
| Dobavljač koji ima angažman | ne može da se obriše |
| Odsustvo: do ≥ od | odbijeno |
| Projekat dobija `client_id` iz imena klijenta | automatski |
| Preimenovanje klijenta ili projekta | osvežava ime u projektima i satnicama, veze ostaju |
| Poslednji aktivan admin | ne može da se ukloni ili ugasi |
| Operater menja svoju ulogu | ne uspeva |
| Mesečni obračun (`payroll_runs`) | samo za zaključan mesec i samo sa kursom EUR/RSD; parametre upisuje baza; odobrava se samo ako se slažu sati po radniku i projektu, zbirovi, angažman i bruto/neto/porez/doprinosi (`payroll_run_problems`); odobren i isplaćen je nepromenljiv, isplata samo posle odobravanja; mesec sa obračunom ne može da se otključa. Ekran: §6.18 (D17). |

---

## 8. Obračun neto/bruto

Fajlovi su u `src/lib/payroll/`, a testovi u `payroll.test.js` (`npm test`). Koristi ga stranica „Mesečni obračun" (§6.18) preko `payrollMonth.js`.

- **Propisi Srbije 2026:**
  - porez 10% na bruto umanjen za neoporezivi iznos 34.221 RSD;
  - doprinosi na teret radnika: PIO 14%, zdravstvo 5,15%, nezaposlenost 0,75%;
  - doprinosi na teret poslodavca: PIO 10%, zdravstvo 5,15%;
  - najniža osnovica 51.297 RSD, najviša 732.820 RSD.
- Iznosi se vode u EUR. Granice u RSD se preračunavaju po kursu koji admin unosi za mesec. **Bez kursa nema obračuna**; ne postoji podrazumevani kurs.
- Obračun ide i od bruta ka netu i od neta ka brutu, sa tačnim netom na cent. Za nepun mesec se srazmerno smanjuju osnovica i neoporezivi iznos.
- Ukupni trošak radnika (bruto 2) se raspoređuje po projektima srazmerno, a zbir je tačan na cent.
- Radnik preko podizvođača: isplata = trošak = osnovica, bez poreza i doprinosa.
- Odbici (krediti, administrativne zabrane) se ne rade, po odluci D6.
- **Ručno provereni primeri (RSD):**

  | Ulaz | Rezultat |
  |---|---|
  | bruto 100.000 | neto 73.522,10; poslodavac 15.150; ukupno 115.150 |
  | neto 100.000 | bruto 137.771,62 (tačno) |
  | bruto 40.000 (ispod najniže osnovice) | doprinosi na osnovicu 51.297 = 10.208,11; neto 29.213,99 |
  | bruto 1.000.000 (iznad najviše osnovice) | neto 757.590,92; poslodavac 111.022,23 |
  | 168 h × 12 € + 10 h × 12 € × 1,26 | osnovica 2.167,20 €; prihod 3.612 € (uz tarifu za klijenta iz testa) |

- **Planirana pravila za satnice** (Faza 2, D4/D5):
  - **jedan izbor tarife**, redom: dodela → satnica radnika na projektu → tarifa projekta/pozicije → pozicija na projektu (samo klijent) → tarifa radnika → profil radnika. Ako ništa ne nađe, **greška, nikad 0**;
  - **razvrstavanje sati:** praznik → vikend (subota, nedelja) → preko 8 h dnevno prekovremeno → ostalo redovno;
  - **iznos** = sati × tarifa × koeficijent. Ako koeficijent fali, to je greška.

---

## 9. Poznati problemi

Tester treba svaki nalaz da označi kao **poznat** (sa ove liste) ili **nov**.

### 9.1 Novac — poznato i planirano za popravku (BACKLOG Faza 2–4)

1. ✅ *(rešeno: tarifa ostaje prazna uz upozorenje, baza traži tarifu > 0)* **Satnica bez tarife dobija 0 i može da se odobri.** Ekran upisuje 0 (`Timesheets.jsx:293-294, 324-325, 874-878`), a baza odbija samo praznu tarifu.
2. ✅ *(rešeno: baza razvrstava sate — praznik → vikend → preko dnevnog praga prekovremeno; iznos po vrsti × koeficijent; D16, migracija 20261114150000)* **Prekovremeni rad:** preko 40 h nedeljno, računa se posebno za svaki red i plaća se kao redovan. Vikend i praznici se ne razlikuju.
3. **Tarife i dodele (`/rates`) se ne koriste u satnicama.** Postoje dva nepovezana modela dodele: radnici na projektu (`assigned_employees`) i dodele na `/rates`.
4. **Satnica iz profila radnika ne može da se unese** jer polja nisu u formi. Satnica se zadaje samo na projektu.
5. ✅ *(rešeno za satnice i izveštaje: `project_id`, klijent preko projekta; ime ostaje samo kao snimak za prikaz)* **Veze po imenu umesto po ID-u:**
   - satnica → projekat (izveštaji, finansijski izveštaj projekta, filter projekta);
   - satnica → klijent (Klijenti, Platni spisak, Finansijski izveštaji);
   - grupisanje po imenu radnika.
6. ✅ *(delom: EUR troškovi se oduzimaju — D8; RSD i dalje bez kursa, D2)* **Zarada projekta ne oduzima troškove projekta.** RSD troškovi se ne preračunavaju, a u Finansijskim izveštajima se ignorišu.
7. ✅ *(rešeno: broji samo odobrene, neodobrene prikazuje odvojeno)* **Finansijski izveštaj projekta broji i neodobrene satnice**, a Finansijski izveštaji samo odobrene. Isti projekat zato daje dve različite brojke.
8. ✅ *(rešeno u Fazi 3: „Nedeljni obračun" je sada „Mesečni obračun" sa neto/bruto, kursom, zaključavanjem meseca i nepromenljivim odobrenim obračunom — §6.18, D17; platni listić PDF je sledeći zadatak)* **Nedeljni obračun se ne ažurira** posle izmene satnica. Nema neto/bruto, nema zaključavanja meseca u aplikaciji, nema platnog listića.
9. ✅ *(rešeno: sloj podataka čita sve redove u delovima od 1000)* Platni spisak i Nedeljni obračun učitavaju 500 satnica bez redosleda (polje `date` ne postoji), pa sa više podataka neke se ne računaju.

### 9.2 Ostalo poznato

- **Mejl ne radi:** ✅ *(delom: jasna poruka „Slanje mejlova još nije podešeno", dugme se vraća)* slanje uvek pada (servis — Faza 5).
- **PDF i pregled satnice:**
  - ugrađeni podaci firme „Stelux Construct DOO, Despota Stefana 39a, Velika Plana" i logo sa Base44 adrese (čeka se logo i podaci firme od Luke);
  - ✅ kolona „Project No." prikazuje klijenta *(sada broj projekta)*;
  - ✅ datumi se uzimaju iz izabrane nedelje na stranici, a ne iz reda *(sada iz reda)*.
- ✅ *(rešeno: ISO godina)* **Oznaka nedelje** u Radnim satima i PDF-u uzima kalendarsku godinu umesto ISO godine, pa nedelja 1 koja počinje krajem decembra dobija pogrešnu godinu (`Timesheets.jsx:158-163, 197-198`).
- ✅ *(rešeno: „WorkforceHub — radnici", lokalni favicon)* U `index.html` je naslov stranice „Base44 APP".
- Ostaci Base44 (`@base44/sdk`, folder `base44/`, `OAuthConsent.jsx`) se uklanjaju u Fazi 5.

### 9.3 Pronađeno pri ovom popisu (14.11.)

| # | Problem | Gde |
|---|---|---|
| 1 | ✅ Nijedna poruka (toast) se ne prikazuje, jer je montiran pogrešan Toaster | `src/App.jsx:1, 117`; 22 fajla koriste `sonner` |
| 2 | ✅ Greške pri upisu su tihe; dijalog ostaje otvoren bez objašnjenja | sve izmene, `src/lib/query-client.js` |
| 3 | ✅ Operater vidi Odobri, Odbij i masovne akcije na Radnim satima; baza odbija, ekran ćuti | `Timesheets.jsx` |
| 4 | ✅ Masovna izmena radnika: lista pozicija crta objekat (verovatan pad) | `Employees.jsx:354-356` |
| 5 | ✅ Radnici na projektu: „B2C: €undefined/h", pregled zarade NaN | `ProjectEmployees.jsx:218, 273-277` |
| 6 | ✅ Pozicija na projektu čuva samo B2B; izmena briše B2C | `ProjectRoles.jsx:59-62` |
| 7 | ✅ Brisanje klijenta bez potvrde | `Clients.jsx:109, 186` |
| 8 | ✅ Status dokumenta se ne računa (prikazuje se unknown, a Izveštaji ga broje kao valid) | `Documents.jsx`, `Reports.jsx:52-57` |
| 9 | ✅ Rođendan danas se ne prikazuje; rođendan sutra piše „Danas!" | `Dashboard.jsx:51-61` |
| 10 | ✅ Pregled radnih sati: prazan datum u proizvoljnom periodu verovatno ruši stranicu; filter dobavljača ne odgovara grupisanju | `TimesheetDashboard.jsx:64, 104, 133`, `timesheetReport.js:83, 96` |
| 11 | ✅ Neuspelo otpremanje fajla ostavlja „Otpremanje..." zauvek (fotografija, prilog satnice) | `EmployeeForm.jsx:67-74`, `Timesheets.jsx:311-317` |
| 12 | ✅ (RSD isključen dok ne postoji kurs) Prekidač valute EUR/RSD ne radi ništa | `AppSettingsBar.jsx` |
| 13 | ✅ Mobilni meni nema projekte, satnice, obračun, klijente, dobavljače ni podešavanja | `MobileNav.jsx:14-22` |
| 14 | ✅ Prevodi: Radni sati i Email poruke su uvek na engleskom, Projekti i Troškovi uvek na srpskom, Finansijski izveštaji na srpskom i u EN. Statusi, datumi i mnoge poruke nisu prevedeni. Oko 40 duplih ključeva u `translations.js`. | razni |
| 15 | `ProjectCosts.jsx` se ne koristi nigde; `PayrollInfoFields` se ne koristi | `src/components/...` |
| 16 | ✅ Profil nepostojećeg radnika se vrti zauvek | `EmployeeDetail.jsx:212-217` |

---

## 10. Šta je urađeno, a šta sledi

- **Urađeno (Faza 0):**
  - baza prema poljima iz aplikacije, sa pravilima i 35 testova;
  - prijava i uloge;
  - sloj podataka sa istim pozivima kao Base44;
  - obračunsko jezgro neto/bruto sa 17 testova;
  - u pregledaču provereno: dodavanje radnika, klijenta i projekta, i da operater ne vidi novčane stranice.
- **Faza 1:** proći svaku stranicu kao admin i operater i popraviti sloj podataka; u formu radnika dodati JMBG, ličnu kartu, pasoš, neto/bruto i udeo radnog vremena; fajlovi.
- **Faza 2:** jedan izbor tarife, razvrstavanje sati, ispravka Radnih sati i nova stranica „Koeficijenti i praznici".
- **Faza 3:** Mesečni obračun (neto/bruto, kurs, zaključavanje meseca), platni listić PDF, Excel za banku.
- **Faza 4:** tačna zarada po projektu (prihod − trošak radnika − troškovi projekta) i veze po ID-u svuda.
- **Faza 5:** mejl servis i uklanjanje ostataka Base44.
- **Faza 6 (opciono):** portal za radnike.

---

## 11. Uputstvo za AI koji piše test prompt

**Šta testirati, po prioritetu:**

1. **Prava pristupa:** sve iz §4, kao admin, kao operater i neprijavljen. Uključiti direktne adrese i pokušaje upisa koje baza treba da odbije.
2. **Novac:** Radni sati → Nedeljni obračun → Platni spisak → Finansijski izveštaji → finansijski izveštaj projekta → Klijenti. Iste satnice moraju da daju iste brojke svuda. Zabeležiti gde se razlikuju.
3. **Pravila baze iz §7**, kroz aplikaciju i proverom u Studiju.
4. **Dodavanje, izmena i brisanje** za svaki entitet iz §6, uz proveru da je zapis zaista sačuvan (poruke se ne vide).
5. **Fajlovi:** otpremanje, pregled, preuzimanje, istek linka posle 1 h, izmena zapisa koji ima fajl.
6. **Jezik EN/RS, uska širina ekrana (mobilni) i konzola pregledača** (greške po stranici).

**Primer novčanog scenarija** (današnja logika, da se vidi da li ekrani računaju dosledno):

- **Priprema:**
  - klijent „QA Klijent";
  - projekat „QA Projekat" za tog klijenta;
  - pozicija na projektu sa B2B 20 €/h;
  - radnik dodat na projekat sa ručnom B2C 12 €/h.
- **Unos:** satnica od pon do pet po 8 h i subota 6 h.
- **Očekivano danas:** ukupno 46 h, prekovremeno 6 h (46 − 40), trošak 46 × 12 = 552,00 €, prihod 46 × 20 = 920,00 €, zarada 368,00 €.
- **Dalje:** odobriti satnicu, napraviti nedeljni obračun i uporediti iste brojke na svim novčanim ekranima.
- **Po planu iz Faze 2 bi bilo drugačije:** 40 h redovno + 6 h vikend sa koeficijentom za vikend. Pošto taj koeficijent još nije unet, to bi bila greška, a ne iznos.

**Pravila za testera:**

- Sve test podatke praviti sa prefiksom `QA-`. Ne brisati Marka Testa, Test Gradnju ni Halu Novi Sad.
- Ne pokretati `npx supabase db reset` bez Lukinog odobrenja.
- Ne upisivati lozinke ni ključeve u izveštaj.
- Za svaki nalaz navesti:
  - ekran i ulogu;
  - korake;
  - šta se očekivalo i šta se dobilo;
  - ozbiljnost: **P0** pogrešan novac, gubitak podataka ili rupa u pristupu; **P1** funkcija ne radi; **P2** pogrešan prikaz ili zbunjujuće; **P3** kozmetika i prevod;
  - da li je poznat (§9) ili nov;
  - fajl i red, ako se zna.
- Rezultat upisati u `QA-FINDINGS.md` u korenu projekta: novi odeljak sa datumom, nalazi poređani po ozbiljnosti, spisak onoga što je provereno i radi, i zaključak.
