// Greške iz baze i Storage-a pretvara u rečenice koje korisnik razume (EN/RS prema izabranom jeziku).
// Poruke koje baza sama diže (npr. „Mesec 10.2031 je zaključan") su već na srpskom i prolaze nepromenjene.

import { permissionLabel } from "@/lib/permissions";

const M = {
  permission: {
    en: "You don't have permission to make this change.",
    rs: "Nemate pravo na ovu izmenu.", sk: "Nemáte oprávnenie vykonať túto zmenu.",
  },
  noRows: {
    en: "The change was not saved: the record doesn't exist or you don't have permission to change it.",
    rs: "Izmena nije sačuvana: zapis ne postoji ili nemate pravo da ga menjate.", sk: "Zmena nebola uložená: záznam neexistuje alebo nemáte oprávnenie ho meniť.",
  },
  duplicate: { en: "Such a record already exists.", rs: "Takav zapis već postoji.", sk: "Takýto záznam už existuje." },
  duplicateHoliday: {
    en: "A holiday for this date already exists.",
    rs: "Praznik za ovaj datum već postoji.", sk: "Sviatok pre tento dátum už existuje.",
  },
  duplicateEmployeeId: {
    en: "This employee ID is already taken. Enter a different one.",
    rs: "Ova šifra radnika već postoji. Upišite drugu šifru.", sk: "Toto ID zamestnanca je už obsadené. Zadajte iné.",
  },
  duplicateTimesheet: {
    en: "A timesheet for this employee, project and week already exists.",
    rs: "Za ovog radnika, projekat i nedelju satnica već postoji.", sk: "Pracovný výkaz pre tohto zamestnanca, projekt a týždeň už existuje.",
  },
  duplicatePayrollMonth: {
    en: "A payroll for this month already exists.",
    rs: "Za ovaj mesec obračun već postoji.", sk: "Zúčtovanie pre tento mesiac už existuje.",
  },
  dates: {
    en: "The end date can't be before the start date.",
    rs: "Datum završetka ne može biti pre datuma početka.", sk: "Dátum ukončenia nemôže byť pred dátumom začiatku.",
  },
  emptyName: { en: "The name can't be empty.", rs: "Naziv ne sme biti prazan.", sk: "Názov nemôže byť prázdny." },
  emptyFirstName: { en: "First name can't be empty.", rs: "Ime ne sme biti prazno.", sk: "Meno nemôže byť prázdne." },
  emptyLastName: { en: "Last name can't be empty.", rs: "Prezime ne sme biti prazno.", sk: "Priezvisko nemôže byť prázdne." },
  dayHours: {
    en: "Hours per day must be between 0 and 24.",
    rs: "Sati po danu moraju biti između 0 i 24.", sk: "Hodiny za deň musia byť medzi 0 a 24.",
  },
  weekStart: { en: "The week must start on a Monday.", rs: "Nedelja mora da počne ponedeljkom.", sk: "Týždeň musí začínať v pondelok." },
  jmbg: {
    en: "The JMBG is not valid (13 digits with a correct check digit).",
    rs: "JMBG nije ispravan (13 cifara i ispravna kontrolna cifra).", sk: "JMBG nie je platné (13 číslic so správnou kontrolnou číslicou).",
  },
  vendorRequired: {
    en: "A subcontractor engagement needs a vendor, and a direct employment must not have one.",
    rs: "Angažman preko podizvođača mora imati dobavljača, a direktno zaposlenje ne sme.", sk: "Pracovný vzťah subdodávateľa vyžaduje dodávateľa a priame zamestnanie ho mať nesmie.",
  },
  negative: { en: "The amount can't be negative.", rs: "Iznos ne može biti negativan.", sk: "Suma nemôže byť záporná." },
  workFraction: {
    en: "The working-time share must be greater than 0 and at most 1.",
    rs: "Udeo radnog vremena mora biti veći od 0 i najviše 1.", sk: "Podiel pracovného času musí byť väčší ako 0 a najviac 1.",
  },
  coefficient: { en: "The coefficient must be greater than 0.", rs: "Koeficijent mora biti veći od 0.", sk: "Koeficient musí byť väčší ako 0." },
  notAllowedValue: { en: "The selected value is not allowed.", rs: "Izabrana vrednost nije dozvoljena.", sk: "Vybraná hodnota nie je povolená." },
  rateOverlap: {
    en: "This rate overlaps an existing rate for the same assignment / job role. To change the price use “Change from date”.",
    rs: "Tarifa se preklapa sa postojećom tarifom iste dodele / Job Role. Za promenu cene koristite „Promeni od datuma”.",
    sk: "Sadzba sa prekrýva s existujúcou sadzbou toho istého pridelenia / roly. Na zmenu ceny použite „Zmeniť od dátumu”.",
  },
  inUseRole: {
    en: "This job role is used by assignments or rates, so it can't be deleted. Deactivate it instead.",
    rs: "Job Role koriste dodele ili tarife, pa ne može da se obriše. Umesto toga ga deaktivirajte.",
    sk: "Pracovnú rolu používajú pridelenia alebo sadzby, preto ju nemožno odstrániť. Radšej ju deaktivujte.",
  },
  overlap: {
    en: "This engagement overlaps an existing engagement of the same employee.",
    rs: "Ovaj angažman se preklapa sa postojećim angažmanom istog radnika.", sk: "Tento pracovný vzťah sa prekrýva s existujúcim pracovným vzťahom toho istého zamestnanca.",
  },
  overlapInterval: {
    en: "This work interval overlaps another interval of the same employee (possibly on another project).",
    rs: "Ovaj interval rada se preklapa sa drugim intervalom istog radnika (možda na drugom projektu).",
    sk: "Tento pracovný interval sa prekrýva s iným intervalom toho istého zamestnanca (možno na inom projekte).",
  },
  inUse: {
    en: "This can't be deleted because other records use it.",
    rs: "Ne može da se obriše jer ga koriste drugi podaci.", sk: "Nemožno odstrániť, pretože to používajú iné záznamy.",
  },
  // Brisanje koje sprečava konkretna veza — kaže šta tačno smeta (QA 14.11.2026).
  inUseProjectTimesheets: {
    en: "The project has timesheets, so it can't be deleted. Set the project to Completed instead.",
    rs: "Projekat ima satnice, pa ne može da se obriše. Umesto toga postavite status Završen.", sk: "Projekt má pracovné výkazy, preto ho nemožno odstrániť. Nastavte projekt radšej ako Dokončený.",
  },
  inUseProjectCosts: {
    en: "The project has project costs. Delete the costs first.",
    rs: "Projekat ima troškove. Prvo obrišite troškove projekta.", sk: "Projekt má náklady projektu. Najprv odstráňte náklady.",
  },
  costOneParty: {
    en: "A cost can be linked to a worker or to a vendor, not to both.",
    rs: "Trošak može da bude vezan za radnika ili za dobavljača, ne za oba.", sk: "Náklad môže byť viazaný na pracovníka alebo dodávateľa, nie na oboch.",
  },
  inUseCostCategory: {
    en: "This cost category has project costs, so it can't be deleted. Move or delete those costs first.",
    rs: "Kategorija ima troškove projekata, pa ne može da se obriše. Prvo prebacite ili obrišite te troškove.", sk: "Kategória má náklady projektov, preto ju nemožno odstrániť. Najprv presuňte alebo odstráňte tieto náklady.",
  },
  inUseEmployeeCosts: {
    en: "The employee is linked to project costs, so they can't be deleted. Set the status to Terminated instead.",
    rs: "Radnik je vezan za troškove projekata, pa ne može da se obriše. Umesto toga postavite status Otpušten.", sk: "Zamestnanec je viazaný na náklady projektov, preto ho nemožno odstrániť. Nastavte radšej stav Ukončený.",
  },
  inUseVendorContracts: {
    en: "The vendor has contract periods, so it can't be deleted. Set it to Inactive instead.",
    rs: "Dobavljač ima ugovorne periode, pa ne može da se obriše. Umesto toga ga postavite na Neaktivan.", sk: "Dodávateľ má zmluvné obdobia, preto ho nemožno odstrániť. Nastavte ho radšej ako Neaktívny.",
  },
  vendorContractOverlap: {
    en: "This contract period overlaps another active contract of the same vendor. End the previous contract or change the dates.",
    rs: "Ugovorni period se preklapa sa drugim aktivnim ugovorom istog dobavljača. Završite prethodni ugovor ili promenite datume.", sk: "Zmluvné obdobie sa prekrýva s inou aktívnou zmluvou toho istého dodávateľa. Ukončite predchádzajúcu zmluvu alebo zmeňte dátumy.",
  },
  inUseVendorCosts: {
    en: "The vendor is linked to project costs, so it can't be deleted. Set it to Inactive instead.",
    rs: "Dobavljač je vezan za troškove projekata, pa ne može da se obriše. Umesto toga ga postavite na Neaktivan.", sk: "Dodávateľ je viazaný na náklady projektov, preto ho nemožno odstrániť. Nastavte ho radšej ako Neaktívny.",
  },
  inUseEmployeeTimesheets: {
    en: "The employee has timesheets, so they can't be deleted. Set the status to Terminated instead.",
    rs: "Radnik ima satnice, pa ne može da se obriše. Umesto toga postavite status Otpušten.", sk: "Zamestnanec má pracovné výkazy, preto ho nemožno odstrániť. Nastavte radšej stav Ukončený.",
  },
  inUseEmployeePayroll: {
    en: "The employee has payroll records, so they can't be deleted. Set the status to Terminated instead.",
    rs: "Radnik ima obračune, pa ne može da se obriše. Umesto toga postavite status Otpušten.", sk: "Zamestnanec má mzdové záznamy, preto ho nemožno odstrániť. Nastavte radšej stav Ukončený.",
  },
  inUseEmployeeAssignments: {
    en: "The employee has project assignments (Project Assignments). Remove them first.",
    rs: "Radnik ima dodele na projektima (Angažmani na projektima). Prvo ih uklonite.", sk: "Zamestnanec má pridelenia na projekty (Pridelenia na projektoch). Najprv ich odstráňte.",
  },
  // Tarife se ne brišu kaskadno (migracija 20261114240000): prvo se brišu tarife angažmana u Angažmani na projektima.
  inUseAssignmentRates: {
    en: "The assignment has rates (Project Assignments), so it can't be deleted. Delete those rates first.",
    rs: "Dodela ima tarife (Angažmani na projektima), pa ne može da se obriše. Prvo obrišite te tarife.", sk: "Pridelenie má sadzby (Pridelenia na projektoch), preto ho nemožno odstrániť. Najprv odstráňte tieto sadzby.",
  },
  inUseProjectRates: {
    en: "The project has rates (Project Assignments), so it can't be deleted. An admin has to delete those rates first.",
    rs: "Projekat ima tarife (Angažmani na projektima), pa ne može da se obriše. Admin prvo briše te tarife.", sk: "Projekt má sadzby (Pridelenia na projektoch), preto ho nemožno odstrániť. Tieto sadzby musí najprv odstrániť administrátor.",
  },
  inUseClientProjects: {
    en: "The client has projects, so it can't be deleted.",
    rs: "Klijent ima projekte, pa ne može da se obriše.", sk: "Klient má projekty, preto ho nemožno odstrániť.",
  },
  inUseVendorEngagements: {
    en: "The vendor has engagements, so it can't be deleted. Set it to Inactive instead.",
    rs: "Dobavljač ima angažmane, pa ne može da se obriše. Umesto toga postavite status Neaktivan.", sk: "Dodávateľ má pracovné vzťahy, preto ho nemožno odstrániť. Nastavte ho radšej ako Neaktívny.",
  },
  duplicateProject: {
    en: "A project with this name already exists for this client.",
    rs: "Projekat sa ovim nazivom već postoji kod ovog klijenta.", sk: "Projekt s týmto názvom už pre tohto klienta existuje.",
  },
  fileContent: {
    en: "The file content doesn't match its type (only real PDF and image files are allowed).",
    rs: "Sadržaj fajla ne odgovara tipu (dozvoljeni su samo pravi PDF i slike).", sk: "Obsah súboru nezodpovedá jeho typu (povolené sú iba skutočné súbory PDF a obrázky).",
  },
  photoTooBig: { en: "The photo is too large (max 5 MB).", rs: "Fotografija je prevelika (najviše 5 MB).", sk: "Fotografia je príliš veľká (max. 5 MB)." },
  missingLink: {
    en: "The linked record (e.g. employee or project) doesn't exist.",
    rs: "Povezani zapis (npr. radnik ili projekat) ne postoji.", sk: "Prepojený záznam (napr. zamestnanec alebo projekt) neexistuje.",
  },
  required: { en: "A required field is empty", rs: "Obavezno polje nije popunjeno", sk: "Povinné pole je prázdne" },
  badValue: {
    en: "A field has an invalid value (e.g. text where a number is expected).",
    rs: "Neko polje ima neispravnu vrednost (npr. tekst umesto broja).", sk: "Pole má neplatnú hodnotu (napr. text tam, kde sa očakáva číslo).",
  },
  badDate: { en: "Invalid date.", rs: "Neispravan datum.", sk: "Neplatný dátum." },
  tooBig: { en: "The number is too large.", rs: "Broj je prevelik.", sk: "Číslo je príliš veľké." },
  session: {
    en: "Your session has expired. Please sign in again.",
    rs: "Prijava je istekla. Prijavite se ponovo.", sk: "Vaša relácia vypršala. Prihláste sa znova.",
  },
  network: {
    en: "No connection to the server. Check the internet connection or whether the database is running.",
    rs: "Nema veze sa serverom. Proverite internet ili da li baza radi.", sk: "Bez spojenia so serverom. Skontrolujte internetové pripojenie alebo či beží databáza.",
  },
  fileTooBig: { en: "The file is too large (max 20 MB).", rs: "Fajl je prevelik (najviše 20 MB).", sk: "Súbor je príliš veľký (max. 20 MB)." },
  fileType: {
    en: "This file type is not allowed (PDF and images only).",
    rs: "Ovaj tip fajla nije dozvoljen (samo PDF i slike).", sk: "Tento typ súboru nie je povolený (iba PDF a obrázky).",
  },
  notFound: { en: "Record not found.", rs: "Zapis nije pronađen.", sk: "Záznam sa nenašiel." },
  noFile: { en: "No file selected.", rs: "Nije izabran fajl.", sk: "Nie je vybraný žiadny súbor." },
  emailNotConfigured: {
    en: "Sending emails is not set up yet (no email service).",
    rs: "Slanje mejlova još nije podešeno (nema mejl servisa).", sk: "Odosielanie e-mailov zatiaľ nie je nastavené (chýba e-mailová služba).",
  },
  privateSkipped: {
    en: "Saved, but personal and bank details were NOT saved — you don't have the permission to change them.",
    rs: "Sačuvano, ali lični i bankovni podaci NISU sačuvani — nemate pravo da ih menjate.", sk: "Uložené, ale osobné a bankové údaje NEBOLI uložené — nemáte oprávnenie ich meniť.",
  },
  missingPermission: {
    en: "You don't have the permission for this action", rs: "Nemate pravo za ovu radnju", sk: "Na túto akciu nemáte oprávnenie",
  },
  unknown: { en: "Something went wrong while saving.", rs: "Došlo je do greške pri radu sa bazom.", sk: "Pri ukladaní sa niečo pokazilo." },
};

const FIELD_NAMES = {
  rs: {
    first_name: "ime", last_name: "prezime", name: "naziv", title: "naslov", employee_id: "radnik",
    project_id: "projekat", week_start: "nedelja", start_date: "početak", end_date: "kraj",
    amount: "iznos", category: "kategorija", date: "datum", leave_type: "vrsta odsustva",
    effective_from: "važi od", engagement_type: "vrsta angažmana", subject: "naslov", body: "tekst",
    type: "vrsta", shift_start: "početak smene", shift_end: "kraj smene",
  },
  en: {},
  sk: {
    first_name: "meno", last_name: "priezvisko", name: "názov", title: "názov", employee_id: "zamestnanec",
    project_id: "projekt", week_start: "týždeň", start_date: "začiatok", end_date: "koniec",
    amount: "suma", category: "kategória", date: "dátum", leave_type: "druh voľna",
    effective_from: "platí od", engagement_type: "typ pracovného vzťahu", subject: "predmet", body: "text",
    type: "typ", shift_start: "začiatok zmeny", shift_end: "koniec zmeny",
  },
};

export function currentLang() {
  try {
    const l = (globalThis.localStorage?.getItem("app_lang") || "en").toLowerCase();
    return l === "rs" || l === "sk" ? l : "en";
  } catch {
    return "en";
  }
}

export const msg = (key, lang = currentLang()) => (M[key] || M.unknown)[lang] || M[key]?.en || M.unknown.en;

const constraintOf = (text) => /constraint "([^"]+)"/.exec(text || "")?.[1] || "";

function checkMessage(constraint) {
  if (/_dates$/.test(constraint)) return "dates";
  if (/_first_name_check$/.test(constraint)) return "emptyFirstName";
  if (/_last_name_check$/.test(constraint)) return "emptyLastName";
  if (/_(name|title)_check$/.test(constraint)) return "emptyName";
  if (/^timesheets_\w+_hours_check$/.test(constraint)) return "dayHours";
  if (constraint === "timesheets_week_start_check") return "weekStart";
  if (constraint === "employee_private_jmbg_check") return "jmbg";
  if (constraint === "employment_history_vendor") return "vendorRequired";
  if (constraint === "project_costs_one_party") return "costOneParty";
  if (constraint === "employee_private_work_fraction_check") return "workFraction";
  if (/_coef_check$/.test(constraint)) return "coefficient";
  if (/_(amount|rate|hourly_rate|eur_rsd_rate)_check$/.test(constraint)) return "negative";
  return "notAllowedValue";
}

const IN_USE_BY_CONSTRAINT = {
  timesheets_project_id_fkey: "inUseProjectTimesheets",
  project_costs_project_id_fkey: "inUseProjectCosts",
  project_costs_cost_category_id_fkey: "inUseCostCategory",
  project_costs_employee_id_fkey: "inUseEmployeeCosts",
  project_costs_vendor_id_fkey: "inUseVendorCosts",
  payslip_projects_project_id_fkey: "inUseProjectTimesheets",
  timesheets_employee_id_fkey: "inUseEmployeeTimesheets",
  payroll_records_employee_id_fkey: "inUseEmployeePayroll",
  payslips_employee_id_fkey: "inUseEmployeePayroll",
  project_assignments_employee_id_fkey: "inUseEmployeeAssignments",
  rates_assignment_id_fkey: "inUseAssignmentRates",
  rates_project_id_fkey: "inUseProjectRates",
  rates_project_role_id_fkey: "inUseRole",
  project_assignments_project_role_id_fkey: "inUseRole",
  projects_client_id_fkey: "inUseClientProjects",
  employment_history_vendor_id_fkey: "inUseVendorEngagements",
  vendor_contracts_vendor_id_fkey: "inUseVendorContracts",
};
const inUseKey = (constraint) => IN_USE_BY_CONSTRAINT[constraint] || "inUse";

// Provera tarife pri odobravanju (guard_timesheet, migracija 20261114180000): strana, izvor tarife i jedinica.
const RATE_SIDE_EN = { radnika: "worker", klijenta: "client" };
const RATE_MISSING_SIDE_EN = { radnika: "the worker", klijenta: "the client", "radnika ni klijenta": "the worker or the client" };
const RATE_SOURCE_EN = {
  "tarifa angažmana": "assignment rate",
  "tarifa Job Role": "job role rate",
  "satnica radnika na projektu": "worker's rate on the project",
  "tarifa projekta/pozicije": "project/position rate",
  "zanimanje na projektu": "job role on the project",
  "tarifa radnika": "employee rate",
  "profil radnika": "employee profile",
};
const RATE_UNIT_EN = { "po satu": "per hour", "po danu": "per day", nedeljno: "per week", mesečno: "per month" };
const enNumber = (n) => (n === "prazno" ? "empty" : n.replace(",", "."));

// Poruke koje baza diže na srpskom (guard_timesheet, lock_month…) — na engleskom kad je izabran EN.
const DB_MESSAGES_EN = [
  [/^Satnicu može da odobri samo admin$/, "Only an admin can approve a timesheet."],
  [/^Satnicu može da odbije samo admin$/, "Only an admin can reject a timesheet."],
  [/^Odobrenu satnicu može da menja samo admin$/, "Only an admin can change an approved timesheet."],
  [/^Odobrena satnica se ne menja; prvo je vratite u nacrt$/, "An approved timesheet can't be changed; set it back to draft first."],
  [/^Odobrena satnica ne može da se obriše; prvo je vratite u nacrt$/, "An approved timesheet can't be deleted; set it back to draft first."],
  [/^Satnica nema tarifu radnika ili klijenta.*$/, "The timesheet has no worker or client rate (or it is 0), so it can't be approved."],
  [/^Satnica mora biti vezana za projekat sa liste da bi se odobrila$/, "The timesheet must be linked to a project from the list before it can be approved."],
  // Faza 2 (vrste sati): spisak vrsta ostaje na srpskom, kao u bazi (npr. „vikend (radnik)").
  [/^Nedostaje koeficijent za vrstu sati: (.+) — admin ga upisuje u Koeficijenti i praznici$/,
    "Missing coefficient for hour type: $1 — an admin enters it in Settings → Coefficients & Holidays."],
  [/^Satnica nema potpun obračun i ne može da se odobri$/, "The timesheet amounts are incomplete, so it can't be approved."],
  // Tarifa reda mora biti važeća tarifa iz jedinstvenog izbora (D4, D16).
  [/^Tarifa (radnika|klijenta) \(([^)]+)\) ne odgovara važećoj tarifi \((\S+), izvor: (.+)\) — osvežite stranicu i odobrite ponovo$/,
    (_, side, rate, expected, source) =>
      `The ${RATE_SIDE_EN[side]} rate (${enNumber(rate)}) doesn't match the current rate (${enNumber(expected)}, source: ${RATE_SOURCE_EN[source] || source}) — refresh the page and approve again.`],
  [/^Nema važeće tarife (radnika ni klijenta|radnika|klijenta) za nedelju od (\S+) — satnica ne može da se odobri$/,
    (_, side, week) => `No valid rate for ${RATE_MISSING_SIDE_EN[side]} for the week of ${week} — the timesheet can't be approved.`],
  [/^Važeća tarifa (radnika|klijenta) \(izvor: (.+)\) je (\S+) (\S+) (po satu|po danu|nedeljno|mesečno) — odobravanje prima samo EUR po satu; ispravite tu tarifu u (?:Tarife i dodele|Angažmani na projektima)$/,
    (_, side, source, amount, currency, unit) =>
      `The current ${RATE_SIDE_EN[side]} rate (source: ${RATE_SOURCE_EN[source] || source}) is ${enNumber(amount)} ${currency} ${RATE_UNIT_EN[unit]} — approval accepts only EUR per hour; fix that rate in Project Assignments.`],
  [/^Mesec (\S+) je već zaključan$/, "Month $1 is already locked."],
  [/^Mesec (\S+) je zaključan$/, "Month $1 is locked."],
  [/^Mesec ima (\d+) neodobrenih satnica$/, "The month has $1 unapproved timesheets."],
  [/^Samo admin može da (zaključa|otključa) mesec$/, "Only an admin can lock or unlock a month."],
  [/^Mora da ostane bar jedan aktivan admin$/, "At least one active admin must remain."],
  // Uloge i prava (migracije 20261125010000 i 20261125020000).
  [/^Ulogu admin i nalog admina menja samo admin$/, "Only an admin can give or remove the admin role or change an admin's account."],
  [/^Svoju ulogu, status i opseg projekata ne možete da menjate$/, "You can't change your own role, status or project access."],
  [/^Svoja prava i projekte ne možete da menjate$/, "You can't change your own permissions or projects."],
  [/^Admin ima sva prava; pojedinačna prava mu se ne menjaju$/, "An admin has all permissions; individual permissions can't be changed."],
  [/^Audit log se ne menja i ne briše$/, "The audit log can't be changed or deleted."],
  // Kreiranje korisnika (migracija 20261125190000, D31).
  [/^Samo admin može da otvori nov nalog$/, "Only an admin can create a new account."],
  [/^Email adresa nije ispravna$/, "The email address isn't valid."],
  [/^Lozinka mora da ima bar 10 znakova$/, "The password must have at least 10 characters."],
  [/^Nepoznata uloga: (.+)$/, "Unknown role: $1."],
  [/^Opseg projekata mora biti „all" ili „assigned"$/, "Project access must be “all” or “assigned”."],
  [/^Nepoznato pravo: (.+)$/, "Unknown permission: $1."],
  [/^Admin ima sva prava; ne mogu mu se oduzeti$/, "An admin has all permissions; they can't be removed."],
  [/^Nepoznat projekat: (.+)$/, "Unknown project: $1."],
  [/^Korisnik ne postoji$/, "The user doesn't exist."],
  [/^Nalog sa adresom (.+) već postoji$/, "An account with the address $1 already exists."],
  [/^Obračun može da se napravi samo za zaključan mesec$/, "A payroll can only be created for a locked month."],
  // Mesečni obračun (migracija 20261114200000): spisak problema ostaje na srpskom, kao u bazi.
  [/^Bez kursa EUR\/RSD nema obračuna — unesite kurs za mesec$/, "No payroll without an EUR/RSD exchange rate — enter the rate for the month."],
  [/^Nema obračunskih parametara \(porez i doprinosi\) za mesec (\S+)$/, "No payroll parameters (tax and contributions) for month $1."],
  [/^Obračunski parametri za mesec su se promenili — osvežite stranicu i generišite ponovo$/,
    "The payroll parameters for the month have changed — refresh the page and generate again."],
  [/^Obračun nije usklađen: ([\s\S]+)$/, "The payroll doesn't reconcile: $1"],
  [/^Odobren obračun ne može ponovo da se generiše$/, "An approved payroll can't be generated again."],
  [/^Odobren obračun ne može da se menja; status se menja samo odobravanjem\/isplatom$/,
    "An approved payroll can't be changed; its status changes only by approving or marking it paid."],
  [/^Odobren ili isplaćen obračun ne može da se obriše$/, "An approved or paid payroll can't be deleted."],
  [/^Platni listić odobrenog obračuna ne može da se menja$/, "A payslip of an approved payroll can't be changed."],
  [/^Isplaćen može da bude samo odobren obračun$/, "Only an approved payroll can be marked as paid."],
  [/^Obračun ne postoji ili nije nacrt$/, "The payroll doesn't exist or is not a draft."],
  [/^Za ovaj mesec postoji obračun; prvo obrišite nacrt obračuna$/, "This month has a payroll; delete the draft payroll first."],
  [/^Samo admin može da (pravi|odobri|vidi) obračun$/, "Only an admin can manage payroll."],
  [/^Samo admin može da označi isplatu$/, "Only an admin can mark a payroll as paid."],
  // Trošak projekta van EUR mora imati kurs (guard_project_cost, migracija 20261114220000).
  [/^Trošak u (\S+) mora imati kurs veći od 0 \(koliko \S+ vredi 1 EUR\)$/,
    "A cost in $1 needs an exchange rate greater than 0 (how many $1 is 1 EUR)."],
  // Project Costs C1 (guard_project_cost v2, migracija 20261125050000).
  [/^Trošak u (\S+) mora imati datum kursa$/, "A cost in $1 needs an exchange rate date."],
  [/^Datum troška je obavezan$/, "The cost date is required."],
  [/^Iznos troška je obavezan$/, "The cost amount is required."],
  [/^Valuta troška je obavezna$/, "The cost currency is required."],
  [/^Kategorija troška je obavezna$/, "The cost category is required."],
  [/^Kategorija troška ne postoji$/, "The cost category does not exist."],
  [/^Podkategorija je obavezna za kategoriju (.+)$/, "A subcategory is required for category $1."],
  [/^Podkategorija „(.+)" ne postoji u kategoriji (.+)$/, "Subcategory \"$1\" does not exist in category $2."],
  [/^Trošak rada ide kroz Timesheets\/Payroll$/, "Labour cost goes through Timesheets/Payroll, not Project Costs."],
  // Tarife na projektu i u dodelama menja samo admin (guard_project_rates / guard_assignment_rates, migracija 20261114240000).
  [/^Zanimanje sa tarifom na projektu dodaje, menja i briše samo admin$/,
    "Only an admin can add, change or delete a job role that has a rate on the project."],
  [/^Satnicu radnika na projektu \(B2C\/B2B tarifu\) upisuje samo admin$/,
    "Only an admin can enter the employee's rate on the project (B2C/B2B)."],
  [/^Radnika kome je admin odredio tarifu na projektu menja i uklanja samo admin$/,
    "Only an admin can change or remove an employee whose rate on the project was set by an admin."],
  [/^Pozicija „(.+)" ima tarifu na ovom projektu — radnika na nju raspoređuje samo admin$/,
    "Position \"$1\" has a rate on this project — only an admin can assign employees to it."],
  [/^Dodele radnika kome je admin odredio tarifu na ovom projektu menja i briše samo admin$/,
    "Only an admin can change or delete the assignments of an employee whose rate on this project was set by an admin."],
  // Angažmani i Rate History (migracija 20261125030000).
  [/^Radnici i Job Roles se menjaju kroz angažmane i Job Roles$/, "Workers and job roles are changed through assignments and job roles."],
  [/^Radnik već ima dodelu na ovom projektu od (\S+) do (\S+) — dodele istog radnika na istom projektu ne smeju da se preklapaju$/,
    (_, from, to) => `The employee already has an assignment on this project from ${from} to ${to === "neodređeno" ? "open-ended" : to} — assignments of the same employee on the same project must not overlap.`],
  [/^Job Role ne pripada projektu dodele$/, "The job role doesn't belong to the assignment's project."],
  [/^Job Role je obavezan$/, "A job role is required."],
  [/^Smena ne pripada projektu dodele$/, "The shift doesn't belong to the assignment's project."],
  [/^Dodela ima unete sate \(od (\S+)\) i ne briše se — završite je \(End\) ili napravite novu$/,
    "The assignment has recorded hours (from $1) and can't be deleted — end it instead."],
  [/^Radnik i projekat dodele sa unetim satima ili tarifom se ne menjaju — završite je i napravite novu dodelu$/,
    "The employee and project of an assignment with hours or rates can't change — end it and create a new assignment."],
  [/^Dodela ima unete sate (\S+) — period ne može da se skrati tako da ti sati ostanu bez dodele$/,
    "The assignment has hours on $1 — the period can't be shortened so that those hours are left without an assignment."],
  [/^Dodela ima tarifu angažmana — period, status i Job Role menjajte kroz Edit \/ End Assignment$/,
    "The assignment has its own rate — change the period, status or job role through Edit / End Assignment."],
  [/^Poslednji dan rada na dodeli je (\S+) — kraj ne može biti pre njega$/, "The last day worked on the assignment is $1 — the end can't be before it."],
  [/^Kraj dodele ne može biti pre početka \((\S+)\)$/, "The assignment can't end before it starts ($1)."],
  [/^Dodela ima unete sate i ne poništava se — završite je \(End\)$/, "The assignment has recorded hours, so it can't be cancelled — end it instead."],
  [/^Tarifa dodele je u odobrenoj satnici — dodela se ne poništava, završite je \(End\)$/,
    "The assignment's rate is used in an approved timesheet — end the assignment instead of cancelling it."],
  [/^Otkazana dodela se ne (menja|završava)$/, "A cancelled assignment can't be changed."],
  [/^Datum transfera mora biti posle početka stare dodele \((\S+)\)$/, "The transfer date must be after the start of the old assignment ($1)."],
  [/^Razlog je obavezan \(najmanje 5 znakova\)$/, "A reason is required (at least 5 characters)."],
  [/^Iznos tarife mora biti veći od 0$/, "The rate amount must be greater than 0."],
  [/^Iznos, valuta, jedinica, nivo i početak važenja tarife se ne menjaju — novu cenu unesite kao „Promeni od datuma"$/,
    "A rate's amount, currency, unit, level and start date can't be changed — enter the new price with “Change from date”."],
  [/^Tarifa je primenjena u satnicama i ne briše se — postavite je na Neaktivna$/,
    "The rate is used in timesheets and can't be deleted — set it to Inactive instead."],
  [/^Datum promene mora biti u periodu važenja tarife \(od (\S+) do (\S+)\)$/, "The change date must be within the rate's validity ($1 – $2)."],
  [/^Menja se samo aktivna tarifa$/, "Only an active rate can be changed."],
  [/^Pozicija „(.+)" nije Job Role ovog projekta — prvo dodajte Job Role$/, "Position \"$1\" is not a job role of this project — add the job role first."],
  [/^Job Role ne pripada projektu tarife$/, "The job role doesn't belong to the rate's project."],
  [/^Tarifa (angažmana|projekta|radnika) mora biti vezana za (dodelu|projekat|radnika)$/, "The rate must be linked to an assignment, project or employee."],
  [/^Nemate pristup ovom projektu$/, "You don't have access to this project."],
  // obaveze i isplate (migracija 20261125080000, §7)
  [/^Obaveze nastaju generisanjem iz odobrenih satnica \(Generiši obaveze\)$/, "Payables are created by generating them from approved timesheets (Generate payables)."],
  [/^Period nije ispravan$/, "The period is not valid."],
  [/^Period obaveza može biti najviše godinu dana$/, "A payables period can be at most one year."],
  [/^Briše se samo nacrt obaveze — potvrđenu otkažite$/, "Only a draft payable can be deleted — cancel a confirmed one."],
  [/^Otkazana obaveza se ne menja$/, "A cancelled payable can't be changed."],
  [/^Period, primalac i valuta obaveze se ne menjaju$/, "A payable's period, payee and currency can't be changed."],
  [/^Iznos obaveze se računa iz satnica — razliku unesite kao korekciju sa razlogom$/, "The payable amount is calculated from timesheets — enter any difference as an adjustment with a reason."],
  [/^Obaveza bez iznosa se ne potvrđuje$/, "A payable without an amount can't be confirmed."],
  [/^Primalac ima odobrenu satnicu sa problemom u periodu — rešite je pre potvrde$/, "The payee has an approved timesheet with a problem in this period — fix it before confirming."],
  [/^Obaveza nije usklađena sa odobrenim satnicama — ponovo pokrenite generisanje$/, "The payable doesn't match the approved timesheets — generate payables again."],
  [/^Obaveza sa uplatama se ne otkazuje — prvo stornirajte uplate$/, "A payable with payments can't be cancelled — void the payments first."],
  [/^Potvrđena obaveza se ne vraća u nacrt — razliku unesite kao korekciju sa razlogom$/, "A confirmed payable can't go back to draft — enter any difference as an adjustment with a reason."],
  [/^Linija obaveze se ne menja — unesite novu korekciju sa razlogom$/, "A payable line can't be changed — enter a new adjustment with a reason."],
  [/^Linije rada menja samo generisanje obaveza$/, "Labour lines are changed only by generating payables."],
  [/^Linija potvrđene obaveze se ne briše — unesite novu korekciju sa razlogom$/, "A line of a confirmed payable can't be deleted — enter a new adjustment with a reason."],
  [/^Obaveza ne postoji$/, "The payable doesn't exist."],
  [/^Razlog korekcije je obavezan \(najmanje 5 znakova\)$/, "An adjustment reason is required (at least 5 characters)."],
  [/^Iznos korekcije ne može biti 0$/, "The adjustment amount can't be 0."],
  [/^Valuta korekcije \((\w+)\) mora biti valuta obaveze \((\w+)\)$/, "The adjustment currency ($1) must be the payable's currency ($2)."],
  [/^Korekcija obaveze prema radniku može se odnositi samo na tog radnika$/, "An adjustment of a payable to a worker can only refer to that worker."],
  [/^Korekcija bi obavezu spustila ispod nule$/, "The adjustment would bring the payable below zero."],
  [/^Korekcija bi obavezu spustila ispod već isplaćenog iznosa \((\S+)\)$/, "The adjustment would bring the payable below the amount already paid ($1)."],
  [/^Uplata se ne briše — stornirajte je uz razlog$/, "A payment can't be deleted — void it with a reason."],
  [/^Uplata se evidentira samo za potvrđenu obavezu$/, "A payment can be recorded only for a confirmed payable."],
  [/^Valuta uplate \((\w+)\) mora biti valuta obaveze \((\w+)\)$/, "The payment currency ($1) must be the payable's currency ($2)."],
  [/^Preplata — evidentirajte korekciju \(adjustment\) sa razlogom$/, "Overpayment — record an adjustment with a reason first."],
  [/^Uplata se ne menja — stornirajte je uz razlog i unesite novu$/, "A payment can't be changed — void it with a reason and record a new one."],
  [/^Uplata je već stornirana$/, "The payment has already been voided."],
  [/^Razlog storna je obavezan \(najmanje 5 znakova\)$/, "A void reason is required (at least 5 characters)."],
  // Odsustva i zamene (W2-L, migracija 20261125100000)
  [/^Zahtev za odsustvo se odobrava ili odbija kroz odluku \(Approve \/ Reject\)$/, "A leave request is approved or rejected only through a decision (Approve / Reject)."],
  [/^Odlučen zahtev za odsustvo se ne menja — napravite novi zahtev$/, "A decided leave request can't be changed — create a new request."],
  [/^Radnik već ima odobreno odsustvo od (\S+) do (\S+) koje se preklapa sa ovim zahtevom$/, "The employee already has approved leave from $1 to $2 that overlaps this request."],
  [/^Odobrenje uprkos manjku traži razlog \(najmanje 5 znakova\)$/, "Approving despite a shortage requires a reason (at least 5 characters)."],
  [/^O zahtevu je već odlučeno$/, "This request has already been decided."],
  [/^Premeštaj pravi manjak na izvornom projektu: nedostaje još (\S+) \(radnik × smena\) — potvrdite transfer$/,
    "The transfer creates a shortage on the source project: $1 more worker-shift(s) missing — confirm the transfer."],
  [/^Radnik je na odsustvu (\S+) — izaberite period kad je dostupan$/, "The employee is on leave on $1 — choose a period when they are available."],
  [/^Zamena mora biti u periodu odsustva \((\S+) – (\S+)\)$/, "The replacement must be within the leave period ($1 – $2)."],
  [/^Radnik ne može da zameni sam sebe$/, "An employee can't replace themselves."],
  [/^Radnik nije aktivan$/, "The employee is not active."],
  [/^Odsustvo je odbijeno — zamena nije potrebna$/, "The leave was rejected — no replacement is needed."],
  [/^Radnik je raspoređen na projektu kome nemate pristup — premeštaj tamo odobrava ovlašćeni korisnik tog projekta$/,
    "The employee is scheduled on a project you can't access — a user authorised for that project must approve the transfer."],
  // Zamena: izvorni projekat na svim projektima radnika (migracija 20261125170000)
  [/^Premeštaj oslobađa raspored radnika na projektu kome nemate pristup \((.+)\) — potvrdite transfer$/,
    "The transfer releases the employee's schedule on a project you can't access ($1) — confirm the transfer."],
  // --- Poruke ostalih migracija 20261125* (prevod za EN/SK; RS ostaje izvorni tekst) ---
  // Prava i opšte provere (prava_rls, obaveze_isplate)
  [/^Podrazumevane kategorije troškova vraća samo admin$/, "Only an admin can restore the default cost categories."],
  // Rate History / izbor tarife / dodele (20261125030000, 20261125160200)
  [/^Nepoznata strana tarife: (.+)$/, "Unknown rate side: $1."],
  [/^Nedostaje datum rada za izbor tarife$/, "The work date is missing, so the rate can't be selected."],
  [/^Nedostaje radnik za izbor tarife$/, "The employee is missing, so the rate can't be selected."],
  [/^Tarifa ne postoji$/, "The rate doesn't exist."],
  [/^Projekat ne postoji$/, "The project doesn't exist."],
  [/^Radnik ne postoji$/, "The employee doesn't exist."],
  [/^Datum početka dodele je obavezan$/, "The assignment start date is required."],
  [/^Dodela ne postoji$/, "The assignment doesn't exist."],
  [/^Tarife se šalju kao niz$/, "Rates must be sent as a list."],
  [/^Datum promene tarife mora biti u okviru angažmana \(od (\S+) do (\S+)\)$/,
    "The rate change date must be within the assignment ($1 – $2)."],
  [/^Vrsta tarife mora biti „cost" \(B2C\) ili „revenue" \(B2B\)$/, "The rate type must be “cost” (B2C) or “revenue” (B2B)."],
  [/^Ista vrsta tarife je poslata dva puta$/, "The same rate type was sent twice. Send each type once."],
  // Satnice po danu / intervali / Reopen (20261125040000)
  [/^Nemate pravo da brišete satnice ovog projekta$/, "You don't have permission to delete timesheets of this project."],
  [/^Odobrena satnica ne može da se obriše; korekcija ide kroz vraćanje uz razlog$/,
    "An approved timesheet can't be deleted; correct it by reopening it with a reason."],
  [/^Nemate pravo da menjate odobrenu satnicu$/, "You don't have permission to change an approved timesheet."],
  [/^Odobrena satnica se ne menja; korekcija ide kroz vraćanje uz razlog \(Reopen\)$/,
    "An approved timesheet can't be changed; correct it by reopening it with a reason (Reopen)."],
  [/^Odobrena satnica se vraća u nacrt samo korekcijom uz razlog \(Reopen\)$/,
    "An approved timesheet goes back to draft only through a correction with a reason (Reopen)."],
  [/^Korekcija vraća satnicu u nacrt$/, "A correction sets the timesheet back to draft."],
  [/^Nemate pravo da odobravate ili odbijate satnice ovog projekta$/, "You don't have permission to approve or reject timesheets of this project."],
  [/^Odbiti se može samo poslata satnica$/, "Only a submitted timesheet can be rejected."],
  [/^Odbijenu satnicu prvo vratite u nacrt$/, "Set the rejected timesheet back to draft first."],
  [/^Nemate pravo da menjate sate ove satnice$/, "You don't have permission to change the hours of this timesheet."],
  [/^Nemate pravo da unosite ili menjate satnice ovog projekta$/, "You don't have permission to enter or change timesheets of this project."],
  [/^Nemate pravo da unosite sate ovog projekta$/, "You don't have permission to enter hours for this project."],
  [/^Satnica ima intervale rada; nedelja se ne menja$/, "The timesheet has work intervals, so its week can't be changed."],
  [/^Dan (\S+) ima intervale rada — sati se menjaju kroz intervale$/, "Day $1 has work intervals — change the hours through the intervals."],
  [/^Dodela ne pripada ovom radniku i projektu$/, "The assignment doesn't belong to this employee and project."],
  [/^Dodela je otkazana; izaberite važeću dodelu$/, "The assignment is cancelled; choose a valid assignment."],
  [/^Dnevni zbir sati za (\S+) bi bio (\S+) h \(najviše (\S+) h u danu\); ostali projekti tog dana: (.*)$/,
    "The daily total for $1 would be $2 h (maximum $3 h per day); other projects that day: $4."],
  [/^Satnica mora biti vezana za projekat sa liste$/, "The timesheet must be linked to a project from the list."],
  [/^Satnica ne može da se pošalje: ([\s\S]+)$/, "The timesheet can't be submitted: $1"],
  [/^Satnica ne može da se odobri: ([\s\S]+)$/, "The timesheet can't be approved: $1"],
  [/^Satnica ne postoji$/, "The timesheet doesn't exist."],
  [/^Interval ne može da pređe u drugu satnicu$/, "An interval can't be moved to another timesheet."],
  [/^Datum (\S+) nije u nedelji satnice \(od (\S+)\)$/, "Date $1 is not in the timesheet's week (starting $2)."],
  [/^Smena pripada drugom projektu$/, "The shift belongs to another project."],
  [/^Pauza je duža od intervala rada$/, "The break is longer than the work interval."],
  [/^Unesite vreme početka i kraja, smenu ili broj sati$/, "Enter the start and end time, a shift, or the number of hours."],
  [/^Intervali za (\S+) daju (\S+) h — dan ima najviše 24 h$/, "The intervals for $1 add up to $2 h — a day has at most 24 h."],
  [/^Nemate pravo na korekciju odobrene satnice$/, "You don't have permission to correct an approved timesheet."],
  [/^Korekcija važi samo za odobrenu satnicu$/, "A correction applies only to an approved timesheet."],
  [/^Period je zaključen odobrenim obračunom — korekcija ide kao Payable adjustment \(Payroll\)$/,
    "The period is locked by an approved payroll — make the correction as a Payable adjustment (Payroll)."],
  // Onboarding paketi (20261125060000)
  [/^Job Role ne pripada ovom projektu$/, "The job role doesn't belong to this project."],
  [/^Vrsta dokumenta „(.+)" nije aktivna$/, "Document type \"$1\" is not active."],
  [/^Radnik (.+) nije angažovan na ovom projektu$/, "Employee $1 is not engaged on this project."],
  [/^Neki od izabranih radnika ne postoje$/, "Some of the selected employees don't exist."],
  [/^Nemate pravo na onboarding ovog projekta$/, "You don't have permission for onboarding on this project."],
  [/^Pripremljen paket se ne menja — pripremite novi$/, "A prepared package can't be changed — prepare a new one."],
  [/^Paket ima nedostatke \(obavezan dokument fali ili nije važeći\) i ne može biti označen kao Ready$/,
    "The package has gaps (a required document is missing or not valid) and can't be marked as Ready."],
  [/^Zapis preuzimanja paketa se ne menja i ne briše$/, "A package download record can't be changed or deleted."],
  [/^Nemate pravo da pripremite onboarding paket za ovaj projekat$/, "You don't have permission to prepare an onboarding package for this project."],
  [/^Izaberite bar jednog radnika$/, "Select at least one employee."],
  [/^Nemate pravo da preuzmete ovaj onboarding paket$/, "You don't have permission to download this onboarding package."],
  [/^Paket nema nijedan dokument koji smete da preuzmete$/, "The package has no document that you are allowed to download."],
  // Workforce Planning model (20261125070000)
  [/^Angažman ne pripada tom radniku$/, "The engagement doesn't belong to that employee."],
  [/^Angažman ne pripada tom projektu$/, "The engagement doesn't belong to that project."],
  [/^Smena ne postoji$/, "The shift doesn't exist."],
  [/^Radnik već ima raspored koji se preklapa \((\S+) – (\S+)\) u istom vremenu$/,
    "The employee already has an overlapping schedule ($1 – $2) at the same time."],
  [/^Job Role ne pripada tom projektu$/, "The job role doesn't belong to that project."],
  [/^Nemate pravo da menjate potreban broj radnika$/, "You don't have permission to change the required number of workers."],
  [/^Job Role ne postoji$/, "The job role doesn't exist."],
  [/^Nemate pristup tom projektu$/, "You don't have access to that project."],
  [/^Uloga, smena, datum „od" i broj \(≥ 0\) su obavezni$/, "Job role, shift, “from” date and number (≥ 0) are required."],
  [/^Za novi period zadajte i datum „do"$/, "For a new period, also enter the “to” date."],
  [/^Datum „do" je pre datuma „od"$/, "The “to” date is before the “from” date."],
  [/^Samo osoblje može da proverava raspoloživost$/, "Only staff members can check availability."],
  // Billing Overview / Clients (20261125090000)
  [/^Novi obračun počinje u statusu In Preparation$/, "A new billing summary starts in the In Preparation status."],
  [/^Status obračuna se menja samo kroz set_billing_status \(ko i kada se beleži\)$/,
    "The billing status is changed only through the status action (who and when is recorded)."],
  [/^Obračun van pripreme je zaključan: klijent, projekat, period i valuta se ne menjaju \(vratite ga u In Preparation\)$/,
    "A billing summary that is out of preparation is locked: client, project, period and currency can't be changed (set it back to In Preparation)."],
  [/^Projekat ne pripada izabranom klijentu$/, "The project doesn't belong to the selected client."],
  [/^Eksterni račun se evidentira tek kad obračun izađe iz pripreme \(Ready for Accounting ili dalje\)$/,
    "The external invoice can be recorded only after the billing summary leaves preparation (Ready for Accounting or later)."],
  [/^Uplate ovog obračuna su u valuti (\S+); valuta računa mora ostati (\S+)$/,
    "The payments of this billing summary are in $1; the invoice currency must stay $2."],
  [/^Evidentirane uplate \((.+)\) prelaze iznos eksternog računa \((.+)\)\. Korekcija = storno uplate uz razlog$/,
    "The recorded payments ($1) exceed the external invoice amount ($2). To correct, void a payment with a reason."],
  [/^Period se preklapa sa postojećim obračunom istog klijenta i valute \((\S+) – (\S+), (\S+)\)$/,
    "The period overlaps an existing billing summary of the same client and currency ($1 – $2, $3)."],
  [/^Obračun van pripreme se ne briše$/, "A billing summary that is out of preparation can't be deleted."],
  [/^Obračun sa evidentiranim uplatama se ne briše$/, "A billing summary with recorded payments can't be deleted."],
  [/^Obračun nije pronađen$/, "The billing summary was not found."],
  [/^Nepoznat status obračuna: (.+)$/, "Unknown billing status: $1."],
  [/^Obračun je već u tom statusu$/, "The billing summary is already in that status."],
  [/^Obračun sa evidentiranim eksternim računom se ne vraća u pripremu$/,
    "A billing summary with a recorded external invoice can't be set back to In Preparation."],
  [/^Za vraćanje u pripremu upišite razlog \(najmanje 5 znakova\)$/, "To set it back to In Preparation, enter a reason (at least 5 characters)."],
  [/^Dozvoljen je samo jedan korak napred \(ili Ready for Accounting → In Preparation\)$/,
    "Only one step forward is allowed (or Ready for Accounting → In Preparation)."],
  [/^Satnice sa problemom u periodu — rešite ih pre predaje obračuna: ([\s\S]+)$/,
    "There are timesheets with problems in the period — fix them before handing over the billing summary: $1"],
  [/^Nema odobrenih sati ni naplativih troškova za ovaj obračun u izabranom periodu$/,
    "There are no approved hours or billable costs for this billing summary in the selected period."],
  [/^Veza troška sa obračunom se ne menja; uklonite je i dodajte ponovo$/,
    "A cost's link to the billing summary can't be changed; remove it and add it again."],
  [/^Naplativi troškovi se menjaju samo dok je obračun u pripremi$/, "Billable costs can be changed only while the billing summary is In Preparation."],
  [/^Trošak nije pronađen$/, "The cost was not found."],
  [/^Trošak nije označen kao naplativ \(Billable to Client\)$/, "The cost is not marked as Billable to Client."],
  [/^Trošak ne pripada klijentu ili projektu ovog obračuna$/, "The cost doesn't belong to the client or project of this billing summary."],
  [/^Datum troška nije u periodu obračuna$/, "The cost date is not within the billing period."],
  [/^Trošak je već u drugom obračunu — isti trošak se ne broji dvaput$/, "The cost is already in another billing summary — the same cost can't be counted twice."],
  [/^Trošak je uključen u obračun klijenta; prvo ga uklonite iz obračuna$/, "The cost is included in a client billing summary; remove it from the billing summary first."],
  [/^Trošak je uključen u obračun klijenta; prvo ga uklonite iz obračuna pa skinite oznaku billable$/,
    "The cost is included in a client billing summary; remove it from the billing summary first, then clear the Billable to Client mark."],
  [/^Trošak je u obračunu predatom knjigovodstvu; iznos, valuta, projekat i datum se ne menjaju$/,
    "The cost is in a billing summary handed over to accounting; its amount, currency, project and date can't be changed."],
  [/^Trošak je uključen u obračun klijenta; projekat i datum menjajte tek kad ga uklonite iz obračuna$/,
    "The cost is included in a client billing summary; change its project and date only after removing it from the billing summary."],
  [/^Stornirana uplata se ne menja$/, "A voided payment can't be changed."],
  [/^Uplata se ne menja; stornirajte je uz razlog i evidentirajte ispravnu$/, "A payment can't be changed; void it with a reason and record the correct one."],
  [/^Uplata i obračun moraju biti za istog klijenta$/, "The payment and the billing summary must be for the same client."],
  [/^Uplata i obračun moraju biti za isti projekat$/, "The payment and the billing summary must be for the same project."],
  [/^Valuta uplate mora biti (\S+) \(valuta računa, odnosno obračuna\)$/, "The payment currency must be $1 (the invoice / billing summary currency)."],
  [/^Uplata prelazi iznos eksternog računa \(preostalo (.+)\)\. Korekcija = storno uplate uz razlog$/,
    "The payment exceeds the external invoice amount (remaining: $1). To correct, void a payment with a reason."],
  [/^Projekat ne pripada klijentu uplate$/, "The project doesn't belong to the payment's client."],
  // Odsustva i kapacitet (20261125100000, 20261125160100)
  [/^Samo osoblje može da proverava kapacitet$/, "Only staff members can check capacity."],
  [/^Zahtev za odsustvo ne postoji$/, "The leave request doesn't exist."],
  [/^Odluka mora biti „approved" ili „rejected"$/, "The decision must be “approved” or “rejected”."],
  [/^Period zamene nije ispravan$/, "The replacement period is not valid."],
  [/^Izvorna dodela ne pripada tom radniku$/, "The source assignment doesn't belong to that employee."],
  [/^Nemate pristup izvornom projektu$/, "You don't have access to the source project."],
  [/^Radnik već ima dodelu na ovom projektu \((.+), (\S+) – (\S+)\) — zamena na drugoj ulozi ili delu perioda nije moguća$/,
    "The employee already has an assignment on this project ($1, $2 – $3) — a replacement in another role or for part of the period isn't possible."],
  // Obaveštenja (20261125110000)
  [/^Prijava je obavezna$/, "You must be signed in."],
  [/^Nemate pravo na obaveštenja$/, "You don't have permission for notifications."],
  // Imenik osoblja i atomarna izmena angažmana (20261125160000+): bez dodatnih korisničkih poruka.
];
// „Nemate pravo „payroll.manage"" (ili sa običnim navodnicima).
const PERMISSION_RE = /^Nemate pravo [„"]([a-z_.]+)["“"]$/;

function dbMessage(raw, lang) {
  if (lang === "rs") return raw; // poruke iz baze su na srpskom; slovački prikaz koristi engleski prevod
  for (const [re, en] of DB_MESSAGES_EN) if (re.test(raw)) return raw.replace(re, en);
  return raw;
}

// Vraća { key, text }: key je vrsta greške (za testove), text je poruka za korisnika.
export function describeError(error, lang = currentLang()) {
  const code = String(error?.code ?? "");
  const raw = String(error?.message ?? "");
  const status = String(error?.statusCode ?? error?.status ?? "");
  const constraint = constraintOf(raw) || constraintOf(error?.details);
  const say = (key) => ({ key, text: msg(key, lang) });

  if (code === "NO_ROWS") return say("noRows");
  if (error?.name === "TypeError" && /fetch|network|load failed/i.test(raw)) return say("network");
  if (/failed to fetch|networkerror|load failed/i.test(raw)) return say("network");
  if (code === "PGRST301" || code === "PGRST303" || /jwt expired|invalid jwt/i.test(raw)) return say("session");
  if (/row-level security/i.test(raw)) return say("permission"); // i baza i Storage

  // Storage
  if (status === "413" || /maximum allowed size|payload too large/i.test(raw)) return say("fileTooBig");
  if (/mime type .* not supported|invalid mime/i.test(raw)) return say("fileType");

  // Postgres
  if (code === "42501") {
    // Provera prava iz baze (require_permission / RPC): poruka nosi kod prava → naziv prava na jeziku korisnika.
    const perm = PERMISSION_RE.exec(raw);
    if (perm) return { key: "missingPermission", text: `${msg("missingPermission", lang)}: ${permissionLabel(perm[1], lang)}.` };
    // Naše poruke iz baze („Satnicu može da odobri samo admin") su jasnije od opšte.
    if (/row-level security|permission denied/i.test(raw) || !raw) return say("permission");
    return { key: "db", text: dbMessage(raw, lang) };
  }
  if (code === "23505") {
    if (constraint === "holidays_pkey") return say("duplicateHoliday");
    if (constraint === "employees_employee_id_key") return say("duplicateEmployeeId");
    if (constraint === "timesheets_one_per_week" || constraint === "timesheets_one_per_week_manual"
      || constraint === "timesheets_one_per_assignment_week") return say("duplicateTimesheet");
    if (constraint === "projects_name_client_key") return say("duplicateProject");
    if (constraint === "payroll_runs_month_key") return say("duplicatePayrollMonth");
    return say("duplicate");
  }
  if (code === "23514") {
    if (/violates check constraint/i.test(raw)) return say(checkMessage(constraint));
    return { key: "db", text: dbMessage(raw, lang) }; // poruka iz naših pravila u bazi
  }
  if (code === "23P01") {
    if (constraint === "rates_no_overlap") return say("rateOverlap");
    if (constraint === "timesheet_entries_no_overlap") return say("overlapInterval");
    if (constraint === "vendor_contracts_no_overlap") return say("vendorContractOverlap");
    if (raw && !/violates exclusion constraint/i.test(raw)) return { key: "db", text: dbMessage(raw, lang) };
    return say("overlap");
  }
  if (code === "23503") return say(/update or delete on table/i.test(raw) ? inUseKey(constraint) : "missingLink");
  if (code === "23502") {
    const column = /column "([^"]+)"/.exec(raw)?.[1];
    const field = column ? FIELD_NAMES[lang]?.[column] || column : "";
    return { key: "required", text: `${msg("required", lang)}${field ? `: ${field}` : ""}.` };
  }
  if (code === "22P02") return say("badValue");
  if (code === "22007" || code === "22008") return say("badDate");
  if (code === "22003") return say("tooBig");

  if (raw && !code && !/[{}"]|relation |violates /.test(raw)) {
    // Poruka koja nije tehnička (npr. „Projekat nije pronađen") ostaje kakva jeste.
    return { key: "plain", text: raw };
  }
  return say("unknown");
}

// Greška sa već pripremljenom porukom (bez poziva baze).
export function plainError(key, context) {
  const e = new Error(msg(key));
  e.isDataError = true;
  e.code = key === "noRows" ? "NO_ROWS" : undefined;
  e.context = context;
  return e;
}

// Greška sloja podataka: poruka za korisnika + originalna poruka baze za konzolu.
export function dataError(error, context) {
  const { text } = describeError(error);
  // Originalna poruka ostaje u konzoli za testiranje i otklanjanje grešaka.
  if (import.meta.env?.MODE !== "test") console.error(`[podaci] ${context}:`, error);
  const e = new Error(text);
  e.isDataError = true;
  e.code = error?.code;
  e.context = context;
  e.original = error?.message;
  e.details = error?.details;
  return e;
}
