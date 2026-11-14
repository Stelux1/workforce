// Greške iz baze i Storage-a pretvara u rečenice koje korisnik razume (EN/RS prema izabranom jeziku).
// Poruke koje baza sama diže (npr. „Mesec 10.2031 je zaključan") su već na srpskom i prolaze nepromenjene.

const M = {
  permission: {
    en: "You don't have permission to make this change.",
    rs: "Nemate pravo na ovu izmenu.",
  },
  noRows: {
    en: "The change was not saved: the record doesn't exist or you don't have permission to change it.",
    rs: "Izmena nije sačuvana: zapis ne postoji ili nemate pravo da ga menjate.",
  },
  duplicate: { en: "Such a record already exists.", rs: "Takav zapis već postoji." },
  duplicateEmployeeId: {
    en: "This employee ID is already taken. Enter a different one.",
    rs: "Ova šifra radnika već postoji. Upišite drugu šifru.",
  },
  duplicateTimesheet: {
    en: "A timesheet for this employee, project and week already exists.",
    rs: "Za ovog radnika, projekat i nedelju satnica već postoji.",
  },
  duplicatePayrollMonth: {
    en: "A payroll for this month already exists.",
    rs: "Za ovaj mesec obračun već postoji.",
  },
  dates: {
    en: "The end date can't be before the start date.",
    rs: "Datum završetka ne može biti pre datuma početka.",
  },
  emptyName: { en: "The name can't be empty.", rs: "Naziv ne sme biti prazan." },
  emptyFirstName: { en: "First name can't be empty.", rs: "Ime ne sme biti prazno." },
  emptyLastName: { en: "Last name can't be empty.", rs: "Prezime ne sme biti prazno." },
  dayHours: {
    en: "Hours per day must be between 0 and 24.",
    rs: "Sati po danu moraju biti između 0 i 24.",
  },
  weekStart: { en: "The week must start on a Monday.", rs: "Nedelja mora da počne ponedeljkom." },
  jmbg: {
    en: "The JMBG is not valid (13 digits with a correct check digit).",
    rs: "JMBG nije ispravan (13 cifara i ispravna kontrolna cifra).",
  },
  vendorRequired: {
    en: "A subcontractor engagement needs a vendor, and a direct employment must not have one.",
    rs: "Angažman preko podizvođača mora imati dobavljača, a direktno zaposlenje ne sme.",
  },
  negative: { en: "The amount can't be negative.", rs: "Iznos ne može biti negativan." },
  workFraction: {
    en: "The working-time share must be greater than 0 and at most 1.",
    rs: "Udeo radnog vremena mora biti veći od 0 i najviše 1.",
  },
  coefficient: { en: "The coefficient must be greater than 0.", rs: "Koeficijent mora biti veći od 0." },
  notAllowedValue: { en: "The selected value is not allowed.", rs: "Izabrana vrednost nije dozvoljena." },
  overlap: {
    en: "This engagement overlaps an existing engagement of the same employee.",
    rs: "Ovaj angažman se preklapa sa postojećim angažmanom istog radnika.",
  },
  inUse: {
    en: "This can't be deleted because other records use it.",
    rs: "Ne može da se obriše jer ga koriste drugi podaci.",
  },
  // Brisanje koje sprečava konkretna veza — kaže šta tačno smeta (QA 14.11.2026).
  inUseProjectTimesheets: {
    en: "The project has timesheets, so it can't be deleted. Set the project to Completed instead.",
    rs: "Projekat ima satnice, pa ne može da se obriše. Umesto toga postavite status Završen.",
  },
  inUseProjectCosts: {
    en: "The project has project costs. Delete the costs first.",
    rs: "Projekat ima troškove. Prvo obrišite troškove projekta.",
  },
  inUseEmployeeTimesheets: {
    en: "The employee has timesheets, so they can't be deleted. Set the status to Terminated instead.",
    rs: "Radnik ima satnice, pa ne može da se obriše. Umesto toga postavite status Otpušten.",
  },
  inUseEmployeePayroll: {
    en: "The employee has payroll records, so they can't be deleted. Set the status to Terminated instead.",
    rs: "Radnik ima obračune, pa ne može da se obriše. Umesto toga postavite status Otpušten.",
  },
  inUseEmployeeAssignments: {
    en: "The employee has project assignments (Rates & Assignments). Remove them first.",
    rs: "Radnik ima dodele na projektima (Tarife i dodele). Prvo ih uklonite.",
  },
  inUseClientProjects: {
    en: "The client has projects, so it can't be deleted.",
    rs: "Klijent ima projekte, pa ne može da se obriše.",
  },
  inUseVendorEngagements: {
    en: "The vendor has engagements, so it can't be deleted. Set it to Inactive instead.",
    rs: "Dobavljač ima angažmane, pa ne može da se obriše. Umesto toga postavite status Neaktivan.",
  },
  duplicateProject: {
    en: "A project with this name already exists for this client.",
    rs: "Projekat sa ovim nazivom već postoji kod ovog klijenta.",
  },
  fileContent: {
    en: "The file content doesn't match its type (only real PDF and image files are allowed).",
    rs: "Sadržaj fajla ne odgovara tipu (dozvoljeni su samo pravi PDF i slike).",
  },
  photoTooBig: { en: "The photo is too large (max 5 MB).", rs: "Fotografija je prevelika (najviše 5 MB)." },
  missingLink: {
    en: "The linked record (e.g. employee or project) doesn't exist.",
    rs: "Povezani zapis (npr. radnik ili projekat) ne postoji.",
  },
  required: { en: "A required field is empty", rs: "Obavezno polje nije popunjeno" },
  badValue: {
    en: "A field has an invalid value (e.g. text where a number is expected).",
    rs: "Neko polje ima neispravnu vrednost (npr. tekst umesto broja).",
  },
  badDate: { en: "Invalid date.", rs: "Neispravan datum." },
  tooBig: { en: "The number is too large.", rs: "Broj je prevelik." },
  session: {
    en: "Your session has expired. Please sign in again.",
    rs: "Prijava je istekla. Prijavite se ponovo.",
  },
  network: {
    en: "No connection to the server. Check the internet connection or whether the database is running.",
    rs: "Nema veze sa serverom. Proverite internet ili da li baza radi.",
  },
  fileTooBig: { en: "The file is too large (max 20 MB).", rs: "Fajl je prevelik (najviše 20 MB)." },
  fileType: {
    en: "This file type is not allowed (PDF and images only).",
    rs: "Ovaj tip fajla nije dozvoljen (samo PDF i slike).",
  },
  notFound: { en: "Record not found.", rs: "Zapis nije pronađen." },
  noFile: { en: "No file selected.", rs: "Nije izabran fajl." },
  emailNotConfigured: {
    en: "Sending emails is not set up yet (no email service).",
    rs: "Slanje mejlova još nije podešeno (nema mejl servisa).",
  },
  privateSkipped: {
    en: "Saved, but bank details, salary and rates were NOT saved — only an admin can change them.",
    rs: "Sačuvano, ali bankovni podaci, plata i tarife NISU sačuvani — to može da menja samo admin.",
  },
  unknown: { en: "Something went wrong while saving.", rs: "Došlo je do greške pri radu sa bazom." },
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
};

export function currentLang() {
  try {
    return (globalThis.localStorage?.getItem("app_lang") || "en").toLowerCase() === "rs" ? "rs" : "en";
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
  if (constraint === "employee_private_work_fraction_check") return "workFraction";
  if (/_coef_check$/.test(constraint)) return "coefficient";
  if (/_(amount|rate|hourly_rate|eur_rsd_rate)_check$/.test(constraint)) return "negative";
  return "notAllowedValue";
}

const IN_USE_BY_CONSTRAINT = {
  timesheets_project_id_fkey: "inUseProjectTimesheets",
  project_costs_project_id_fkey: "inUseProjectCosts",
  payslip_projects_project_id_fkey: "inUseProjectTimesheets",
  timesheets_employee_id_fkey: "inUseEmployeeTimesheets",
  payroll_records_employee_id_fkey: "inUseEmployeePayroll",
  payslips_employee_id_fkey: "inUseEmployeePayroll",
  project_assignments_employee_id_fkey: "inUseEmployeeAssignments",
  projects_client_id_fkey: "inUseClientProjects",
  employment_history_vendor_id_fkey: "inUseVendorEngagements",
};
const inUseKey = (constraint) => IN_USE_BY_CONSTRAINT[constraint] || "inUse";

// Poruke koje baza diže na srpskom (guard_timesheet, lock_month…) — na engleskom kad je izabran EN.
const DB_MESSAGES_EN = [
  [/^Satnicu može da odobri samo admin$/, "Only an admin can approve a timesheet."],
  [/^Satnicu može da odbije samo admin$/, "Only an admin can reject a timesheet."],
  [/^Odobrenu satnicu može da menja samo admin$/, "Only an admin can change an approved timesheet."],
  [/^Odobrena satnica se ne menja; prvo je vratite u nacrt$/, "An approved timesheet can't be changed; set it back to draft first."],
  [/^Odobrena satnica ne može da se obriše; prvo je vratite u nacrt$/, "An approved timesheet can't be deleted; set it back to draft first."],
  [/^Satnica nema tarifu radnika ili klijenta.*$/, "The timesheet has no worker or client rate (or it is 0), so it can't be approved."],
  [/^Satnica mora biti vezana za projekat sa liste da bi se odobrila$/, "The timesheet must be linked to a project from the list before it can be approved."],
  [/^Mesec (\S+) je već zaključan$/, "Month $1 is already locked."],
  [/^Mesec (\S+) je zaključan$/, "Month $1 is locked."],
  [/^Mesec ima (\d+) neodobrenih satnica$/, "The month has $1 unapproved timesheets."],
  [/^Samo admin može da (zaključa|otključa) mesec$/, "Only an admin can lock or unlock a month."],
  [/^Mora da ostane bar jedan aktivan admin$/, "At least one active admin must remain."],
  [/^Obračun može da se napravi samo za zaključan mesec$/, "A payroll can only be created for a locked month."],
];
function dbMessage(raw, lang) {
  if (lang !== "en") return raw;
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
    // Naše poruke iz baze („Satnicu može da odobri samo admin") su jasnije od opšte.
    if (/row-level security|permission denied/i.test(raw) || !raw) return say("permission");
    return { key: "db", text: dbMessage(raw, lang) };
  }
  if (code === "23505") {
    if (constraint === "employees_employee_id_key") return say("duplicateEmployeeId");
    if (constraint === "timesheets_one_per_week" || constraint === "timesheets_one_per_week_manual") return say("duplicateTimesheet");
    if (constraint === "projects_name_client_key") return say("duplicateProject");
    if (constraint === "payroll_runs_month_key") return say("duplicatePayrollMonth");
    return say("duplicate");
  }
  if (code === "23514") {
    if (/violates check constraint/i.test(raw)) return say(checkMessage(constraint));
    return { key: "db", text: dbMessage(raw, lang) }; // poruka iz naših pravila u bazi
  }
  if (code === "23P01") return say("overlap");
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
