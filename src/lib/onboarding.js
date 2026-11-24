// Project Onboarding (spec §12, model §2.10): status potrebnih dokumenata po radniku i paketu.
// ISTI algoritam radi i u bazi (`_onboarding_manifest`, migracija 20261125060000_onboarding.sql) — server odlučuje
// šta ulazi u ZIP i da li paket sme da bude Ready; ovde je isti račun za prikaz na kartici Onboarding.
// Datumi su ISO niske 'YYYY-MM-DD' (poređenje niski = poređenje datuma).

export const REQUIREMENT_STATUS = {
  AVAILABLE: "available",
  MISSING: "missing",
  EXPIRED: "expired",
  EXPIRING_SOON: "expiring_soon",
  NOT_PERMITTED: "not_permitted",
};

export const WORKER_STATUS = { READY: "ready", ACTION_REQUIRED: "action_required" };
export const PACKAGE_STATUS = { READY: "ready", INCOMPLETE: "incomplete" };
export const VALIDITY_RULES = ["assignment_period", "assignment_start", "none"];

// Zahtev je ispunjen za radnika (Ready for Onboarding) — zabrana izvoza ne znači da dokument fali.
const SATISFIED = new Set([REQUIREMENT_STATUS.AVAILABLE, REQUIREMENT_STATUS.EXPIRING_SOON, REQUIREMENT_STATUS.NOT_PERMITTED]);
// Dokument ide u ZIP.
const EXPORTABLE = new Set([REQUIREMENT_STATUS.AVAILABLE, REQUIREMENT_STATUS.EXPIRING_SOON]);

export function isoDate(d = new Date()) {
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

const maxIso = (a, b) => (a > b ? a : b);

// Zahtevi projekta koji važe za ulogu: zajednički (bez uloge) + zahtevi te uloge.
export function requirementsForAssignment(assignment, requirements = []) {
  if (!assignment) return [];
  return requirements.filter(
    (q) => q.project_id === assignment.project_id && (!q.project_role_id || q.project_role_id === assignment.project_role_id)
  );
}

// Period u kome dokument mora da važi: [R0, R1].
export function requirementWindow(assignment, validityRule, today) {
  if (validityRule === "none") return { from: today, to: today };
  const from = maxIso(today, assignment?.start_date || today);
  if (validityRule === "assignment_start") return { from, to: from };
  return { from, to: assignment?.end_date || from };
}

// Najbolji kandidat: najkasniji rok važenja; bez roka (null) je najbolji. Isti rok → noviji upis, pa id.
export function bestDocument(documents = [], employeeId, documentType) {
  const candidates = documents.filter((d) => d.employee_id === employeeId && d.category === documentType);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const ea = a.expiration_date || "9999-12-31";
    const eb = b.expiration_date || "9999-12-31";
    if (ea !== eb) return ea < eb ? 1 : -1;
    const ca = a.created_date || "";
    const cb = b.created_date || "";
    if (ca !== cb) return ca < cb ? 1 : -1;
    return String(a.id) < String(b.id) ? 1 : -1;
  })[0];
}

export function isSensitiveDocument(doc, documentTypes = []) {
  if (!doc) return false;
  if (doc.restricted) return true;
  const type = documentTypes.find((t) => t.code === doc.category);
  // Nepoznat tip se tretira kao osetljiv (bezbednija strana; baza ima FK, pa se to ne dešava).
  return type ? Boolean(type.sensitive) : true;
}

export function requirementStatus({ requirement, assignment, documents, documentTypes, today, canViewSensitive }) {
  const doc = bestDocument(documents, assignment.employee_id, requirement.document_type);
  const base = {
    requirement_id: requirement.id,
    document_type: requirement.document_type,
    mandatory: requirement.mandatory !== false,
    exportable: requirement.exportable !== false,
    validity_rule: requirement.validity_rule || "assignment_period",
    document_id: doc?.id ?? null,
    document_title: doc?.title ?? null,
    file_name: doc?.file_name ?? null,
    has_file: Boolean(doc?.file_url),
    expiration_date: doc?.expiration_date ?? null,
    sensitive: isSensitiveDocument(doc, documentTypes),
  };
  if (!doc) return { ...base, status: REQUIREMENT_STATUS.MISSING };
  const { to } = requirementWindow(assignment, base.validity_rule, today);
  const exp = doc.expiration_date;
  if (exp && exp < to) return { ...base, status: REQUIREMENT_STATUS.EXPIRED };
  if (!base.exportable || (base.sensitive && !canViewSensitive)) return { ...base, status: REQUIREMENT_STATUS.NOT_PERMITTED };
  const soonDays = Number.isFinite(Number(requirement.expiring_soon_days)) ? Number(requirement.expiring_soon_days) : 30;
  if (exp && exp <= addDaysIso(today, soonDays)) return { ...base, status: REQUIREMENT_STATUS.EXPIRING_SOON };
  return { ...base, status: REQUIREMENT_STATUS.AVAILABLE };
}

// Dodela radnika na projektu za koju se proverava onboarding: tekuća ili sledeća (najraniji početak među
// dodelama koje nisu završene), inače poslednja završena. Poništene (cancelled) se ne računaju. Isto u SQL-u.
export function onboardingAssignment(assignments = [], employeeId, projectId, today) {
  const own = assignments.filter((a) => a.employee_id === employeeId && a.project_id === projectId && a.status !== "cancelled");
  if (!own.length) return null;
  const open = own.filter((a) => !a.end_date || a.end_date >= today)
    .sort((a, b) => (a.start_date === b.start_date ? String(a.id).localeCompare(String(b.id)) : a.start_date < b.start_date ? -1 : 1));
  if (open.length) return open[0];
  return [...own].sort((a, b) => (a.end_date === b.end_date ? String(b.id).localeCompare(String(a.id)) : a.end_date < b.end_date ? 1 : -1))[0];
}

const STATUS_ORDER = { missing: 0, expired: 1, not_permitted: 2, expiring_soon: 3, available: 4 };

export function workerReadiness({ assignment, requirements, documents, documentTypes, today, canViewSensitive = false }) {
  const items = requirementsForAssignment(assignment, requirements)
    .map((requirement) => requirementStatus({ requirement, assignment, documents, documentTypes, today, canViewSensitive }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.document_type.localeCompare(b.document_type));
  const reasons = items
    .filter((i) => i.mandatory && !SATISFIED.has(i.status))
    .map(({ document_type, status, expiration_date }) => ({ document_type, status, expiration_date }));
  return { status: reasons.length ? WORKER_STATUS.ACTION_REQUIRED : WORKER_STATUS.READY, items, reasons };
}

export function packageStatus(workers = []) {
  return workers.some((w) => w.status === WORKER_STATUS.ACTION_REQUIRED) ? PACKAGE_STATUS.INCOMPLETE : PACKAGE_STATUS.READY;
}

export function isExportable(item) {
  return EXPORTABLE.has(item.status) && item.has_file;
}

// Status radnika na projektu (kartica Onboarding). Radnik bez dodele na projektu se ne prikazuje.
export function projectOnboarding({ project, assignments, employees, requirements, documents, documentTypes, today, canViewSensitive }) {
  const employeeIds = [...new Set(assignments.filter((a) => a.project_id === project.id && a.status !== "cancelled").map((a) => a.employee_id))];
  return employeeIds.map((employeeId) => {
    const assignment = onboardingAssignment(assignments, employeeId, project.id, today);
    const employee = employees.find((e) => e.id === employeeId);
    return {
      employee_id: employeeId,
      employee_name: employee ? `${employee.first_name || ""} ${employee.last_name || ""}`.trim() : "",
      assignment,
      ...workerReadiness({ assignment, requirements, documents, documentTypes, today, canViewSensitive }),
    };
  }).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

// Naziv fajla u ZIP-u: „Prezime_Ime/tip_naslov.ext" bez znakova koji smetaju sistemima datoteka.
export function safeName(s, fallback = "fajl") {
  const out = String(s || "").replace(/đ/g, "dj").replace(/Đ/g, "Dj").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_").replace(/^[_.]+|_+$/g, "").slice(0, 80);
  return out || fallback;
}

export function zipEntryName(item, used = new Set()) {
  const folder = safeName(item.employee_name, "radnik");
  const ext = (String(item.file_name || item.file_path || "").match(/\.[A-Za-z0-9]{1,5}$/) || [""])[0].toLowerCase();
  const base = `${folder}/${safeName(item.document_type)}_${safeName(item.title || item.file_name, "dokument").replace(/\.[A-Za-z0-9]{1,5}$/, "")}`;
  let name = base + ext;
  for (let i = 2; used.has(name); i += 1) name = `${base}_${i}${ext}`;
  used.add(name);
  return name;
}
