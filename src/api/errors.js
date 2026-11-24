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
    en: "The employee has project assignments (Rates & Assignments). Remove them first.",
    rs: "Radnik ima dodele na projektima (Tarife i dodele). Prvo ih uklonite.", sk: "Zamestnanec má pridelenia na projekty (Sadzby a pridelenia). Najprv ich odstráňte.",
  },
  // Tarife se ne brišu kaskadno (migracija 20261114240000): prvo se brišu tarife u Tarife i dodele (samo admin).
  inUseAssignmentRates: {
    en: "The assignment has rates (Rates & Assignments), so it can't be deleted. Delete those rates first.",
    rs: "Dodela ima tarife (Tarife i dodele), pa ne može da se obriše. Prvo obrišite te tarife.", sk: "Pridelenie má sadzby (Sadzby a pridelenia), preto ho nemožno odstrániť. Najprv odstráňte tieto sadzby.",
  },
  inUseProjectRates: {
    en: "The project has rates (Rates & Assignments), so it can't be deleted. An admin has to delete those rates first.",
    rs: "Projekat ima tarife (Tarife i dodele), pa ne može da se obriše. Admin prvo briše te tarife.", sk: "Projekt má sadzby (Sadzby a pridelenia), preto ho nemožno odstrániť. Tieto sadzby musí najprv odstrániť administrátor.",
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
  [/^Važeća tarifa (radnika|klijenta) \(izvor: (.+)\) je (\S+) (\S+) (po satu|po danu|nedeljno|mesečno) — odobravanje prima samo EUR po satu; ispravite tu tarifu u Tarife i dodele$/,
    (_, side, source, amount, currency, unit) =>
      `The current ${RATE_SIDE_EN[side]} rate (source: ${RATE_SOURCE_EN[source] || source}) is ${enNumber(amount)} ${currency} ${RATE_UNIT_EN[unit]} — approval accepts only EUR per hour; fix that rate in Rates & Assignments.`],
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
