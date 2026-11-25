// Uloge i prava (spec v1.4 §15.02, D30 K1/K2; docs/TEAMORA-DATA-MODEL.md §2.1).
// Izvor istine je baza: katalog `permissions`, podrazumevana prava `role_permissions`, izuzeci
// `user_permission_overrides`, a `my_permissions()` vraća prava prijavljenog korisnika (admin = sva).
// Ovde su samo kodovi, nazivi za prikaz i provera `can()` za sakrivanje u UI-ju — baza ionako odbija (RLS, RPC).

export const PERMISSIONS = Object.freeze({
  PROJECTS_MANAGE: "projects.manage",
  ASSIGNMENTS_MANAGE: "assignments.manage",
  RATES_VIEW_B2B: "rates.view_b2b",
  RATES_VIEW_B2C: "rates.view_b2c",
  RATES_MANAGE: "rates.manage",
  TIMESHEETS_EDIT: "timesheets.edit",
  TIMESHEETS_APPROVE: "timesheets.approve",
  TIMESHEETS_CORRECT: "timesheets.correct",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_MANAGE: "payroll.manage",
  PAYMENTS_RECORD: "payments.record",
  COSTS_VIEW: "costs.view",
  COSTS_MANAGE: "costs.manage",
  BILLING_VIEW: "billing.view",
  BILLING_MANAGE: "billing.manage",
  REPORTS_FINANCIAL: "reports.financial",
  EMPLOYEES_MANAGE: "employees.manage",
  EMPLOYEES_PRIVATE_VIEW: "employees.private.view",
  EMPLOYEES_PRIVATE_EDIT: "employees.private.edit",
  ENGAGEMENT_MANAGE: "engagement.manage",
  DOCUMENTS_MANAGE: "documents.manage",
  DOCUMENTS_VIEW_SENSITIVE: "documents.view_sensitive",
  ONBOARDING_MANAGE: "onboarding.manage",
  ONBOARDING_EXPORT: "onboarding.export",
  WORKFORCE_MANAGE: "workforce.manage",
  LEAVE_APPROVE: "leave.approve",
  LEAVE_APPROVE_SHORTAGE: "leave.approve_shortage",
  USERS_MANAGE: "users.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
  // Izmena oblasti koje su ranije menjali svi (D31): prisustvo, zadaci, odsustva; dobavljači (ranije employees.manage).
  ATTENDANCE_MANAGE: "attendance.manage",
  TASKS_MANAGE: "tasks.manage",
  LEAVE_MANAGE: "leave.manage",
  VENDORS_MANAGE: "vendors.manage",
  // Sekcije menija (D31, migracija 20261125210000): sve uloge ih podrazumevano imaju, admin ih skida po korisniku.
  VIEW_EMPLOYEES: "view.employees",
  VIEW_VENDORS: "view.vendors",
  VIEW_DOCUMENTS: "view.documents",
  VIEW_ATTENDANCE: "view.attendance",
  VIEW_SCHEDULE: "view.schedule",
  VIEW_TASKS: "view.tasks",
  VIEW_LEAVE: "view.leave",
  VIEW_REPORTS: "view.reports",
  VIEW_PROJECTS: "view.projects",
  VIEW_ASSIGNMENTS: "view.assignments",
  VIEW_WORKFORCE: "view.workforce",
  VIEW_TIMESHEETS: "view.timesheets",
  VIEW_CLIENTS: "view.clients",
});

export const SECTION_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS).filter((c) => c.startsWith("view.")));

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

export const ROLES = Object.freeze(["admin", "project_manager", "hr", "finance"]);

export const ROLE_LABELS = Object.freeze({
  admin: { en: "Admin", rs: "Admin", sk: "Admin" },
  project_manager: { en: "Project Manager", rs: "Projekt menadžer", sk: "Projektový manažér" },
  hr: { en: "HR", rs: "HR", sk: "HR" },
  finance: { en: "Finance", rs: "Finansije", sk: "Financie" },
});

export const PROJECT_SCOPES = Object.freeze(["all", "assigned"]);

// Podrazumevana prava po ulozi — isto kao seed `role_permissions` (migracija 20261125010000, §2.1).
// Admin nije ovde: ima sva prava u bazi (has_permission), bez obzira na role_permissions i override.
const P = PERMISSIONS;
const STAFF_EDIT = [P.ATTENDANCE_MANAGE, P.TASKS_MANAGE, P.LEAVE_MANAGE]; // kao is_staff ranije — sve uloge
export const ROLE_DEFAULTS = Object.freeze({
  project_manager: Object.freeze([
    P.PROJECTS_MANAGE, P.ASSIGNMENTS_MANAGE, P.RATES_VIEW_B2B, P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE,
    P.COSTS_VIEW, P.COSTS_MANAGE, P.ONBOARDING_MANAGE, P.ONBOARDING_EXPORT, P.WORKFORCE_MANAGE,
    P.LEAVE_APPROVE, P.LEAVE_APPROVE_SHORTAGE, ...SECTION_PERMISSIONS, ...STAFF_EDIT,
  ]),
  hr: Object.freeze([
    P.PROJECTS_MANAGE, P.ASSIGNMENTS_MANAGE, P.TIMESHEETS_EDIT, P.EMPLOYEES_MANAGE, P.EMPLOYEES_PRIVATE_VIEW,
    P.EMPLOYEES_PRIVATE_EDIT, P.DOCUMENTS_MANAGE, P.DOCUMENTS_VIEW_SENSITIVE, P.ONBOARDING_MANAGE,
    P.ONBOARDING_EXPORT, P.WORKFORCE_MANAGE, P.LEAVE_APPROVE, ...SECTION_PERMISSIONS, ...STAFF_EDIT, P.VENDORS_MANAGE,
  ]),
  finance: Object.freeze([
    P.RATES_VIEW_B2B, P.RATES_VIEW_B2C, P.RATES_MANAGE, P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE,
    P.TIMESHEETS_CORRECT, P.PAYROLL_VIEW, P.PAYROLL_MANAGE, P.PAYMENTS_RECORD, P.COSTS_VIEW, P.COSTS_MANAGE,
    P.BILLING_VIEW, P.BILLING_MANAGE, P.REPORTS_FINANCIAL, P.EMPLOYEES_PRIVATE_VIEW, P.ENGAGEMENT_MANAGE,
    ...SECTION_PERMISSIONS, ...STAFF_EDIT,
  ]),
});

// Matrica prava za ekran Korisnici (D31, kao u Blitzkriegu): oblast × Vidi / Menja / Odobrava / Dodatno.
// Svaki kod iz kataloga je tačno u jednoj ćeliji (test). null = ta radnja za oblast ne postoji.
const lbl = (en, rs, sk) => ({ en, rs, sk });
export const MATRIX_COLUMNS = Object.freeze([
  { key: "view", label: lbl("View", "Vidi", "Vidí") },
  { key: "edit", label: lbl("Add & edit", "Dodaje i menja", "Pridáva a mení") },
  { key: "approve", label: lbl("Approve", "Odobrava", "Schvaľuje") },
  { key: "extra", label: lbl("Extra", "Dodatno", "Navyše") },
]);
const area = (key, label, view, edit, approve = null, extra = []) =>
  Object.freeze({ key, label, view, edit, approve, extra: Object.freeze(extra) });
const x = (code, label) => Object.freeze({ code, label });
export const PERMISSION_MATRIX = Object.freeze([
  { key: "staff", label: lbl("Staff Management", "Kadrovi", "Správa personálu"), areas: [
    area("employees", lbl("Employees", "Zaposleni", "Zamestnanci"), P.VIEW_EMPLOYEES, P.EMPLOYEES_MANAGE),
    area("private", lbl("Personal data (ID, passport, bank)", "Lični podaci (JMBG, pasoš, banka)", "Osobné údaje (ID, pas, banka)"),
      P.EMPLOYEES_PRIVATE_VIEW, P.EMPLOYEES_PRIVATE_EDIT),
    area("engagement", lbl("Engagement history (payee)", "Istorija angažovanja (primalac isplate)", "História pracovných vzťahov"),
      null, P.ENGAGEMENT_MANAGE),
    area("vendors", lbl("Vendors", "Dobavljači", "Dodávatelia"), P.VIEW_VENDORS, P.VENDORS_MANAGE),
    area("documents", lbl("Documents", "Dokumenti", "Dokumenty"), P.VIEW_DOCUMENTS, P.DOCUMENTS_MANAGE, null,
      [x(P.DOCUMENTS_VIEW_SENSITIVE, lbl("Sensitive files", "Osetljivi fajlovi", "Citlivé súbory"))]),
    area("onboarding", lbl("Onboarding packages", "Onboarding paketi", "Onboarding balíky"), null, P.ONBOARDING_MANAGE, null,
      [x(P.ONBOARDING_EXPORT, lbl("Download ZIP", "Preuzimanje ZIP-a", "Stiahnutie ZIP"))]),
    area("attendance", lbl("Attendance", "Prisustvo", "Dochádzka"), P.VIEW_ATTENDANCE, P.ATTENDANCE_MANAGE),
    area("schedule", lbl("Schedule (changes follow Workforce Planning)", "Raspored (izmene prate Planiranje)", "Rozvrh (zmeny podľa plánovania)"),
      P.VIEW_SCHEDULE, null),
    area("tasks", lbl("Tasks", "Zadaci", "Úlohy"), P.VIEW_TASKS, P.TASKS_MANAGE),
    area("leave", lbl("Leave Requests", "Odsustva", "Žiadosti o voľno"), P.VIEW_LEAVE, P.LEAVE_MANAGE, P.LEAVE_APPROVE,
      [x(P.LEAVE_APPROVE_SHORTAGE, lbl("Approve despite shortage", "Odobrava uprkos manjku", "Schváli aj pri nedostatku"))]),
    area("reports", lbl("Reports", "Izveštaji", "Prehľady"), P.VIEW_REPORTS, null),
  ] },
  { key: "projects", label: lbl("Projects", "Projekti", "Projekty"), areas: [
    area("projects", lbl("Projects and job roles", "Projekti i pozicije", "Projekty a pozície"), P.VIEW_PROJECTS, P.PROJECTS_MANAGE),
    area("assignments", lbl("Project Assignments", "Angažmani na projektima", "Pridelenia na projektoch"), P.VIEW_ASSIGNMENTS, P.ASSIGNMENTS_MANAGE),
    area("workforce", lbl("Workforce Planning (shifts, schedule, replacements)", "Planiranje radne snage (smene, raspored, zamene)", "Plánovanie pracovnej sily"),
      P.VIEW_WORKFORCE, P.WORKFORCE_MANAGE),
    area("costs", lbl("Project Costs", "Troškovi projekata", "Náklady projektov"), P.COSTS_VIEW, P.COSTS_MANAGE),
  ] },
  { key: "finance", label: lbl("Payroll & finance", "Obračun i finansije", "Mzdy a financie"), areas: [
    area("timesheets", lbl("Timesheets", "Radni sati", "Pracovné výkazy"), P.VIEW_TIMESHEETS, P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE,
      [x(P.TIMESHEETS_CORRECT, lbl("Correct approved (with reason)", "Korekcija odobrenih (uz razlog)", "Oprava schválených"))]),
    area("rates", lbl("Rates", "Tarife", "Sadzby"), P.RATES_VIEW_B2B, P.RATES_MANAGE, null,
      [x(P.RATES_VIEW_B2C, lbl("B2C: labour cost and worker pay", "B2C: trošak rada i isplata radniku", "B2C: náklady práce"))]),
    area("payroll", lbl("Payroll, payables and payments", "Obračun, obaveze i isplate", "Mzdy, záväzky a platby"), P.PAYROLL_VIEW, P.PAYROLL_MANAGE, null,
      [x(P.PAYMENTS_RECORD, lbl("Record payments", "Unos isplata", "Zadávanie platieb"))]),
    area("clients", lbl("Clients / Billing Overview", "Klijenti / Billing Overview", "Klienti / Billing Overview"), P.VIEW_CLIENTS, P.BILLING_MANAGE, null,
      [x(P.BILLING_VIEW, lbl("Billing amounts and client payments", "Iznosi fakturisanja i uplate", "Sumy fakturácie a platby"))]),
    area("financialReports", lbl("Financial reports and KPIs", "Finansijski izveštaji i KPI", "Finančné prehľady a KPI"), P.REPORTS_FINANCIAL, null),
  ] },
  { key: "admin", label: lbl("Administration", "Administracija", "Administrácia"), areas: [
    area("settings", lbl("Settings", "Podešavanja", "Nastavenia"), null, P.SETTINGS_MANAGE),
    area("users", lbl("Users and permissions", "Korisnici i prava", "Používatelia a oprávnenia"), null, P.USERS_MANAGE),
    area("audit", lbl("Audit log", "Audit log", "Audit log"), P.AUDIT_VIEW, null),
  ] },
]);

// Kodovi jedne kolone (za „označi celu kolonu") i svi kodovi matrice.
export function matrixColumnCodes(column) {
  return PERMISSION_MATRIX.flatMap((g) => g.areas.flatMap((a) =>
    column === "extra" ? a.extra.map((e) => e.code) : a[column] ? [a[column]] : []));
}
export const MATRIX_CODES = Object.freeze(MATRIX_COLUMNS.flatMap((c) => matrixColumnCodes(c.key)));

// Presetovi: „samo pregled svega" = kolona Vidi + B2C pregled + iznosi fakturisanja (bez izmena, odobravanja i
// osetljivih fajlova); „sve osim administracije"; „ništa".
export const VIEW_ONLY_CODES = Object.freeze([...matrixColumnCodes("view"), P.RATES_VIEW_B2C, P.BILLING_VIEW]);
export const PERMISSION_PRESETS = Object.freeze([
  { key: "role", label: lbl("As role", "Kao uloga", "Ako rola") },
  { key: "viewAll", label: lbl("View everything", "Samo pregled svega", "Iba prezeranie všetkého") },
  { key: "all", label: lbl("Everything except administration", "Sve osim administracije", "Všetko okrem administrácie") },
  { key: "none", label: lbl("Nothing", "Ništa", "Nič") },
]);
export function presetCodes(key, roleDefaults = []) {
  if (key === "role") return [...roleDefaults];
  if (key === "viewAll") return [...VIEW_ONLY_CODES];
  if (key === "all") return MATRIX_CODES.filter((c) => ![P.USERS_MANAGE, P.SETTINGS_MANAGE, P.AUDIT_VIEW].includes(c));
  return [];
}

// Konačna prava → izmene u odnosu na ulogu (za kreiranje naloga).
export function diffFromRole(codes, roleDefaults = []) {
  const set = new Set(codes);
  const def = new Set(roleDefaults);
  return {
    granted: [...set].filter((c) => !def.has(c)).sort(),
    denied: [...def].filter((c) => !set.has(c)).sort(),
  };
}

export const PERMISSION_LABELS = Object.freeze({
  [P.PROJECTS_MANAGE]: { en: "Manage projects and job roles", rs: "Projekti i Job Roles", sk: "Projekty a pracovné pozície" },
  [P.ASSIGNMENTS_MANAGE]: { en: "Manage assignments (without rates)", rs: "Angažmani (bez tarifa)", sk: "Pridelenia (bez sadzieb)" },
  [P.RATES_VIEW_B2B]: { en: "View B2B rates and revenue", rs: "Pregled B2B tarifa i prihoda", sk: "Zobrazenie B2B sadzieb a výnosov" },
  [P.RATES_VIEW_B2C]: { en: "View B2C rates, labour cost and worker pay", rs: "Pregled B2C tarifa, troška rada i isplata radniku", sk: "Zobrazenie B2C sadzieb, nákladov práce a výplat" },
  [P.RATES_MANAGE]: { en: "Enter and change rates", rs: "Unos i izmena tarifa", sk: "Zadávanie a zmena sadzieb" },
  [P.TIMESHEETS_EDIT]: { en: "Enter and submit timesheets", rs: "Unos i slanje satnica", sk: "Zadávanie a odosielanie výkazov" },
  [P.TIMESHEETS_APPROVE]: { en: "Approve and reject timesheets", rs: "Odobravanje i odbijanje satnica", sk: "Schvaľovanie a zamietanie výkazov" },
  [P.TIMESHEETS_CORRECT]: { en: "Reopen approved timesheets (with reason)", rs: "Korekcija odobrene satnice (uz razlog)", sk: "Oprava schváleného výkazu (s dôvodom)" },
  [P.PAYROLL_VIEW]: { en: "View payroll, payables and payments", rs: "Pregled obračuna, obaveza i isplata", sk: "Zobrazenie miezd, záväzkov a platieb" },
  [P.PAYROLL_MANAGE]: { en: "Lock months, run payroll, generate payables", rs: "Zaključavanje meseca, obračun, obaveze", sk: "Uzamknutie mesiaca, mzdy, záväzky" },
  [P.PAYMENTS_RECORD]: { en: "Record and reverse payments", rs: "Unos i storno isplata", sk: "Zadávanie a storno platieb" },
  [P.COSTS_VIEW]: { en: "View project costs", rs: "Pregled troškova projekata", sk: "Zobrazenie nákladov projektov" },
  [P.COSTS_MANAGE]: { en: "Manage project costs", rs: "Unos i izmena troškova projekata", sk: "Správa nákladov projektov" },
  [P.BILLING_VIEW]: { en: "View billing and client payments", rs: "Pregled fakturisanja i uplata klijenata", sk: "Zobrazenie fakturácie a platieb klientov" },
  [P.BILLING_MANAGE]: { en: "Manage billing, client payments and clients", rs: "Fakturisanje, uplate klijenata i klijenti", sk: "Fakturácia, platby klientov a klienti" },
  [P.REPORTS_FINANCIAL]: { en: "Financial reports and KPIs", rs: "Finansijski izveštaji i KPI", sk: "Finančné prehľady a KPI" },
  [P.EMPLOYEES_MANAGE]: { en: "Manage employee profiles", rs: "Profil radnika (unos i izmena)", sk: "Profily zamestnancov" },
  [P.EMPLOYEES_PRIVATE_VIEW]: { en: "View personal data (ID, passport, bank)", rs: "Pregled ličnih podataka (JMBG, lična karta, pasoš, banka)", sk: "Zobrazenie osobných údajov (ID, pas, banka)" },
  [P.EMPLOYEES_PRIVATE_EDIT]: { en: "Edit personal data (ID, passport, bank)", rs: "Izmena ličnih podataka (JMBG, lična karta, pasoš, banka)", sk: "Úprava osobných údajov (ID, pas, banka)" },
  [P.ENGAGEMENT_MANAGE]: { en: "Manage engagement history (payee)", rs: "Istorija angažovanja (primalac isplate)", sk: "História pracovných vzťahov (príjemca platby)" },
  [P.DOCUMENTS_MANAGE]: { en: "Upload and edit employee documents", rs: "Otpremanje i izmena dokumenata radnika", sk: "Nahrávanie a úprava dokumentov" },
  [P.DOCUMENTS_VIEW_SENSITIVE]: { en: "Open sensitive document files", rs: "Otvaranje osetljivih dokumenata", sk: "Otváranie citlivých dokumentov" },
  [P.ONBOARDING_MANAGE]: { en: "Required documents and onboarding packages", rs: "Obavezna dokumenta i onboarding paketi", sk: "Povinné dokumenty a onboarding balíky" },
  [P.ONBOARDING_EXPORT]: { en: "Download onboarding ZIP", rs: "Preuzimanje onboarding ZIP-a", sk: "Stiahnutie onboarding ZIP" },
  [P.WORKFORCE_MANAGE]: { en: "Shifts, required workforce, schedule, replacements", rs: "Smene, potrebna radna snaga, raspored, zamene", sk: "Zmeny, potrebná pracovná sila, rozpis, zástupy" },
  [P.LEAVE_APPROVE]: { en: "Approve and reject leave", rs: "Odobravanje i odbijanje odsustva", sk: "Schvaľovanie a zamietanie voľna" },
  [P.LEAVE_APPROVE_SHORTAGE]: { en: "Approve leave despite a shortage", rs: "Odobrenje odsustva uprkos manjku", sk: "Schválenie voľna napriek nedostatku" },
  [P.USERS_MANAGE]: { en: "Users and permissions", rs: "Korisnici i prava", sk: "Používatelia a oprávnenia" },
  [P.SETTINGS_MANAGE]: { en: "Other settings", rs: "Ostala podešavanja", sk: "Ostatné nastavenia" },
  [P.AUDIT_VIEW]: { en: "Full audit log", rs: "Pun audit log", sk: "Úplný audit log" },
  [P.ATTENDANCE_MANAGE]: { en: "Enter and change attendance", rs: "Unos i izmena prisustva", sk: "Zadávanie a zmena dochádzky" },
  [P.TASKS_MANAGE]: { en: "Create and change tasks", rs: "Unos i izmena zadataka", sk: "Vytváranie a zmena úloh" },
  [P.LEAVE_MANAGE]: { en: "Create and change leave requests", rs: "Unos i izmena zahteva za odsustvo", sk: "Zadávanie a zmena žiadostí o voľno" },
  [P.VENDORS_MANAGE]: { en: "Manage vendors and vendor contracts", rs: "Dobavljači i ugovori dobavljača", sk: "Dodávatelia a zmluvy dodávateľov" },
  [P.VIEW_EMPLOYEES]: { en: "Employees", rs: "Zaposleni", sk: "Zamestnanci" },
  [P.VIEW_VENDORS]: { en: "Vendors", rs: "Dobavljači", sk: "Dodávatelia" },
  [P.VIEW_DOCUMENTS]: { en: "Documents", rs: "Dokumenti", sk: "Dokumenty" },
  [P.VIEW_ATTENDANCE]: { en: "Attendance", rs: "Prisustvo", sk: "Dochádzka" },
  [P.VIEW_SCHEDULE]: { en: "Schedule", rs: "Raspored", sk: "Rozvrh" },
  [P.VIEW_TASKS]: { en: "Tasks", rs: "Zadaci", sk: "Úlohy" },
  [P.VIEW_LEAVE]: { en: "Leave Requests", rs: "Odsustva", sk: "Žiadosti o voľno" },
  [P.VIEW_REPORTS]: { en: "Reports", rs: "Izveštaji", sk: "Prehľady" },
  [P.VIEW_PROJECTS]: { en: "Project Overview", rs: "Pregled projekata", sk: "Prehľad projektov" },
  [P.VIEW_ASSIGNMENTS]: { en: "Project Assignments", rs: "Angažmani na projektima", sk: "Pridelenia na projektoch" },
  [P.VIEW_WORKFORCE]: { en: "Workforce Planning", rs: "Planiranje radne snage", sk: "Plánovanie pracovnej sily" },
  [P.VIEW_TIMESHEETS]: { en: "Timesheets", rs: "Radni sati", sk: "Pracovné výkazy" },
  [P.VIEW_CLIENTS]: { en: "Clients / Billing Overview", rs: "Klijenti / Billing Overview", sk: "Klienti / Billing Overview" },
});

const toSet = (perms) => (perms instanceof Set ? perms : new Set(Array.isArray(perms) ? perms : []));

// can(perms, "rates.manage") — ima pravo; can(perms, ["a", "b"]) — ima bar jedno od njih.
// Prazan zahtev (null/undefined/[]) znači „bez posebnog prava" (svaki aktivan korisnik).
export function can(perms, code) {
  if (code == null) return true;
  const set = toSet(perms);
  if (Array.isArray(code)) return code.length === 0 || code.some((c) => set.has(c));
  return set.has(code);
}

export function canAll(perms, codes = []) {
  const set = toSet(perms);
  return codes.every((c) => set.has(c));
}

// Efektivna prava (isto pravilo kao has_permission/my_permissions u bazi) — za prikaz na ekranu Users.
// `defaults` su prava uloge iz baze (role_permissions); bez njih se koristi seed ROLE_DEFAULTS.
export function effectivePermissions(role, overrides = [], defaults = ROLE_DEFAULTS[role] || []) {
  if (role === "admin") return new Set(ALL_PERMISSIONS);
  const set = new Set(defaults);
  for (const o of overrides) {
    if (o.granted) set.add(o.permission);
    else set.delete(o.permission);
  }
  return set;
}

export const roleLabel = (role, lang = "en") => ROLE_LABELS[role]?.[lang] || ROLE_LABELS[role]?.en || role || "—";
export const permissionLabel = (code, lang = "en") =>
  PERMISSION_LABELS[code]?.[lang] || PERMISSION_LABELS[code]?.en || code;
