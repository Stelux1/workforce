// Projekat: adresa radilišta, izbor radnika za satnicu i upozorenje o negativnoj marži rada. Čiste funkcije (bez baze).
import { formatAddress } from "@/lib/companyDetails";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

/**
 * Adresa projekta za prikaz: „Address, ZIP City" iz polja address/zip/city (migracija 20261124120000).
 * Projekat bez tih polja (unet pre migracije) prikazuje stari tekst `location`.
 */
export function projectAddress(project) {
  if (!project) return "";
  return formatAddress(project) || clean(project.location);
}

const day = (v) => (v ? String(v).slice(0, 10) : "");

/** "YYYY-MM-DD" + n dana (UTC, da vremenska zona ne pomeri dan). */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Radnici koje dijalog „Add Timesheet Row" nudi za izabrani projekat.
 *
 * Phase 7 (T-A2, §2.4/§2.6): izvor su dodele (`project_assignments`) — jedna stavka po dodeli koja nije otkazana i
 * pokriva bar jedan dan nedelje [weekStart, weekStart + 6]. Radnik sa dve dodele iste nedelje (prelazak na drugu
 * ulogu) dobija dve stavke, jer se sati beleže na tačno jednu dodelu (Submit to traži).
 * Bez `assignments` (stari poziv) važi keš `projects.assigned_employees`. Ručni unos projekta nudi sve aktivne radnike.
 * ID se poredi kao tekst, da broj/tekst ili različit zapis istog uuid-a ne sakrije radnika.
 * @param {object} project
 * @param {Array} employees
 * @param {object} [opts]
 * @param {boolean} [opts.manual]       ručni unos projekta (bez veze)
 * @param {Array}   [opts.assignments]  redovi project_assignments (bilo kog projekta; filtrira se ovde)
 * @param {string}  [opts.weekStart]    ponedeljak nedelje "YYYY-MM-DD" (obavezan uz `assignments`)
 * @returns {Array<{ employee, assignment }>} sortirano po prezimenu, imenu, pa početku dodele
 */
export function employeesForProject(project, employees, { manual = false, assignments, weekStart } = {}) {
  const active = (employees || []).filter((e) => e && e.status === "active");
  const byName = (a, b) =>
    `${clean(a.employee.last_name)} ${clean(a.employee.first_name)}`.localeCompare(
      `${clean(b.employee.last_name)} ${clean(b.employee.first_name)}`
    ) || day(a.assignment?.start_date).localeCompare(day(b.assignment?.start_date));
  if (manual) return active.map((employee) => ({ employee, assignment: null })).sort(byName);
  const key = (v) => clean(v).toLowerCase();

  if (Array.isArray(assignments)) {
    const projectId = key(project?.id);
    const from = day(weekStart);
    if (!projectId || !from) return [];
    const to = addDays(from, 6);
    const byId = new Map(active.map((e) => [key(e.id), e]));
    return assignments
      .filter((a) => a && key(a.project_id) === projectId && a.status !== "cancelled" && byId.has(key(a.employee_id))
        && day(a.start_date) && day(a.start_date) <= to && (!day(a.end_date) || day(a.end_date) >= from))
      .map((assignment) => ({ employee: byId.get(key(assignment.employee_id)), assignment }))
      .sort(byName);
  }

  const assigned = new Map();
  for (const a of project?.assigned_employees || []) {
    const id = key(a?.employee_id);
    if (id && !assigned.has(id)) assigned.set(id, a);
  }
  return active
    .filter((e) => assigned.has(key(e.id)))
    .map((employee) => ({ employee, assignment: assigned.get(key(employee.id)) }))
    .sort(byName);
}

/**
 * Dani nedelje (indeksi 0–6, pon–ned) koje dodela pokriva — za unos sati samo u opsegu angažmana.
 * Bez dodele → svi dani (ručni unos projekta).
 */
export function assignmentWeekDays(assignment, weekStart) {
  const from = day(weekStart);
  return [0, 1, 2, 3, 4, 5, 6].filter((i) => {
    if (!assignment || !from) return true;
    const d = addDays(from, i);
    return day(assignment.start_date) <= d && (!day(assignment.end_date) || day(assignment.end_date) >= d);
  });
}

const rateNumber = (v) => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Negativna marža rada (spec §5): B2C (trošak radnika) veći od B2B (naplata klijentu). Samo upozorenje —
 * tarife se ne menjaju. Kad neka tarifa nije uneta, nema upozorenja (to je posebna greška „nema tarife").
 */
export function negativeLabourMargin(b2c, b2b) {
  const cost = rateNumber(b2c);
  const revenue = rateNumber(b2b);
  return cost !== null && revenue !== null && cost > revenue;
}

/**
 * Ključevi keša (React Query) koje treba osvežiti posle svake izmene projekta (radnici, zanimanja, podaci).
 * Satnica i liste čitaju projekte iz ["projects"]; osvežavanje samo ["project", id] je ostavljalo dijalog
 * „Add Timesheet Row" sa starom listom bez novododatog radnika (bug 16/17).
 */
export function projectQueryKeys(projectId) {
  return [["project", projectId], ["projects"]];
}
