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

/**
 * Radnici koje dijalog „Add Timesheet Row" nudi za izabrani projekat: aktivni radnici dodati na projekat
 * (`projects.assigned_employees`, veza po ID-u radnika). Ručni unos projekta (bez projekta) nudi sve aktivne radnike.
 * ID se poredi kao tekst, da broj/tekst ili različit zapis istog uuid-a ne sakrije radnika.
 * @returns {Array<{ employee, assignment }>} sortirano po prezimenu pa imenu
 */
export function employeesForProject(project, employees, { manual = false } = {}) {
  const active = (employees || []).filter((e) => e && e.status === "active");
  const byName = (a, b) =>
    `${clean(a.employee.last_name)} ${clean(a.employee.first_name)}`.localeCompare(
      `${clean(b.employee.last_name)} ${clean(b.employee.first_name)}`
    );
  if (manual) return active.map((employee) => ({ employee, assignment: null })).sort(byName);
  const assigned = new Map();
  for (const a of project?.assigned_employees || []) {
    const id = clean(a?.employee_id).toLowerCase();
    if (id && !assigned.has(id)) assigned.set(id, a);
  }
  return active
    .filter((e) => assigned.has(clean(e.id).toLowerCase()))
    .map((employee) => ({ employee, assignment: assigned.get(clean(employee.id).toLowerCase()) }))
    .sort(byName);
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
