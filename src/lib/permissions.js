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
});

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
export const ROLE_DEFAULTS = Object.freeze({
  project_manager: Object.freeze([
    P.PROJECTS_MANAGE, P.ASSIGNMENTS_MANAGE, P.RATES_VIEW_B2B, P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE,
    P.COSTS_VIEW, P.COSTS_MANAGE, P.ONBOARDING_MANAGE, P.ONBOARDING_EXPORT, P.WORKFORCE_MANAGE,
    P.LEAVE_APPROVE, P.LEAVE_APPROVE_SHORTAGE,
  ]),
  hr: Object.freeze([
    P.PROJECTS_MANAGE, P.ASSIGNMENTS_MANAGE, P.TIMESHEETS_EDIT, P.EMPLOYEES_MANAGE, P.EMPLOYEES_PRIVATE_VIEW,
    P.EMPLOYEES_PRIVATE_EDIT, P.DOCUMENTS_MANAGE, P.DOCUMENTS_VIEW_SENSITIVE, P.ONBOARDING_MANAGE,
    P.ONBOARDING_EXPORT, P.WORKFORCE_MANAGE, P.LEAVE_APPROVE,
  ]),
  finance: Object.freeze([
    P.RATES_VIEW_B2B, P.RATES_VIEW_B2C, P.RATES_MANAGE, P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE,
    P.TIMESHEETS_CORRECT, P.PAYROLL_VIEW, P.PAYROLL_MANAGE, P.PAYMENTS_RECORD, P.COSTS_VIEW, P.COSTS_MANAGE,
    P.BILLING_VIEW, P.BILLING_MANAGE, P.REPORTS_FINANCIAL, P.EMPLOYEES_PRIVATE_VIEW, P.ENGAGEMENT_MANAGE,
  ]),
});

// Grupe za ekran Users → Permissions (redosled i nazivi za prikaz).
export const PERMISSION_GROUPS = Object.freeze([
  { key: "projects", label: { en: "Projects", rs: "Projekti", sk: "Projekty" },
    codes: [P.PROJECTS_MANAGE, P.ASSIGNMENTS_MANAGE] },
  { key: "rates", label: { en: "Rates", rs: "Tarife", sk: "Sadzby" },
    codes: [P.RATES_VIEW_B2B, P.RATES_VIEW_B2C, P.RATES_MANAGE] },
  { key: "timesheets", label: { en: "Timesheets", rs: "Satnice", sk: "Pracovné výkazy" },
    codes: [P.TIMESHEETS_EDIT, P.TIMESHEETS_APPROVE, P.TIMESHEETS_CORRECT] },
  { key: "finance", label: { en: "Payroll & finance", rs: "Obračun i finansije", sk: "Mzdy a financie" },
    codes: [P.PAYROLL_VIEW, P.PAYROLL_MANAGE, P.PAYMENTS_RECORD, P.COSTS_VIEW, P.COSTS_MANAGE, P.BILLING_VIEW,
      P.BILLING_MANAGE, P.REPORTS_FINANCIAL] },
  { key: "people", label: { en: "Employees & documents", rs: "Radnici i dokumenta", sk: "Zamestnanci a dokumenty" },
    codes: [P.EMPLOYEES_MANAGE, P.EMPLOYEES_PRIVATE_VIEW, P.EMPLOYEES_PRIVATE_EDIT, P.ENGAGEMENT_MANAGE,
      P.DOCUMENTS_MANAGE, P.DOCUMENTS_VIEW_SENSITIVE, P.ONBOARDING_MANAGE, P.ONBOARDING_EXPORT] },
  { key: "workforce", label: { en: "Workforce & leave", rs: "Radna snaga i odsustva", sk: "Pracovná sila a voľno" },
    codes: [P.WORKFORCE_MANAGE, P.LEAVE_APPROVE, P.LEAVE_APPROVE_SHORTAGE] },
  { key: "admin", label: { en: "Administration", rs: "Administracija", sk: "Administrácia" },
    codes: [P.USERS_MANAGE, P.SETTINGS_MANAGE, P.AUDIT_VIEW] },
]);

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
  [P.EMPLOYEES_MANAGE]: { en: "Manage employee profiles and vendors", rs: "Profil radnika i dobavljači", sk: "Profily zamestnancov a dodávatelia" },
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
