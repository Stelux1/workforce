// Pomoćne čiste funkcije za ekran Workforce Planning (spec §13): opseg prikaza, redovi Gantt-a, dnevne trake,
// pregled zahteva i detalj pokrivenosti. Sav izračun dostupnosti i pokrivenosti je u `workforce.js` (isti kao SQL
// `workforce_coverage`); ovde se samo slaže za prikaz. Ulazni redovi su redovi iz baze (snake_case).
import {
  absenceKind,
  addDaysIso,
  availableWorkers,
  coverage,
  dayMs,
  eachDay,
  ganttCell,
  scheduleInterval,
  shiftInterval,
} from "./workforce";

export const VIEWS = ["day", "week", "month"];
const HOUR_MS = 3_600_000;

export const employeeName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(" ") || e.employee_name || "—" : "—");

// ───────────────────────────── opseg prikaza ─────────────────────────────

/** Opseg prikaza oko datuma: dan, nedelja (ponedeljak–nedelja) ili kalendarski mesec. */
export function viewRange(view, anchor) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const dow = new Date(dayMs(anchor)).getUTCDay(); // 0 = nedelja
    const from = addDaysIso(anchor, -((dow + 6) % 7));
    return { from, to: addDaysIso(from, 6) };
  }
  const [y, m] = anchor.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}

/** Pomeranje sidra za jedan korak prikaza (dir = -1 | 1). Mesec se pomera na prvi dan susednog meseca. */
export function moveAnchor(view, anchor, dir) {
  if (view === "day") return addDaysIso(anchor, dir);
  if (view === "week") return addDaysIso(anchor, 7 * dir);
  const [y, m] = anchor.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + dir, 1)).toISOString().slice(0, 10);
}

export const overlapsRange = (start, end, from, to) => (start == null || start <= to) && (end == null || end >= from);
const covers = (start, end, date) => (start == null || start <= date) && (end == null || end >= date);

function groupBy(rows, keyOf) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

// ───────────────────────────── pokrivenost po ulozi i danu ─────────────────────────────

/** Zbir pokrivenosti svih smena za (uloga, datum): {required, planned, absent, available, deficit, surplus, shifts}. */
export function roleDayCoverage(coverageRows) {
  const map = new Map();
  for (const r of coverageRows) {
    const key = `${r.projectRoleId}|${r.date}`;
    const acc = map.get(key) || { required: 0, planned: 0, absent: 0, available: 0, deficit: 0, surplus: 0, shifts: [] };
    for (const k of ["required", "planned", "absent", "available", "deficit", "surplus"]) acc[k] += r[k];
    acc.shifts.push(r);
    map.set(key, acc);
  }
  return map;
}

/** Ukupni brojevi za traku sa pokazateljima: potrebno, dostupno, smene/dani sa manjkom, projekti sa manjkom. */
export function coverageTotals(coverageRows) {
  const projects = new Set();
  let required = 0;
  let available = 0;
  let deficit = 0;
  let surplus = 0;
  let deficitCells = 0;
  for (const r of coverageRows) {
    required += r.required;
    available += r.available;
    deficit += r.deficit;
    surplus += r.surplus;
    if (r.deficit > 0) {
      deficitCells += 1;
      projects.add(r.projectId);
    }
  }
  return { required, available, deficit, surplus, deficitCells, shortageProjects: projects.size };
}

// ───────────────────────────── Gantt (dan/nedelja/mesec) ─────────────────────────────

/**
 * Redovi Gantt-a grupisani po projektu pa Job Role. Uloga se prikazuje ako ima potrebu (Required Workforce) ili
 * angažman u opsegu. Red uloge nosi dnevni zbir pokrivenosti (`summary`), a radnik red po angažmanu sa ćelijama
 * `{date, status}` (status iz `ganttCell`; `null` = angažman tog dana ne važi). Ćelija odsustva ima prednost.
 */
export function buildGantt({
  projects = [], roles = [], assignments = [], schedules = [], leaves = [], shifts = [], employees = [],
  requirements = [], coverageRows = [], from, to, projectId = null,
}) {
  const days = eachDay(from, to);
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const schedulesByEmployee = groupBy(schedules, (s) => s.employee_id);
  const leavesByEmployee = groupBy(leaves.filter((l) => l.status === "approved"), (l) => l.employee_id);
  const assignmentsByEmployee = groupBy(assignments.filter((a) => a.status !== "cancelled"), (a) => a.employee_id);
  const perRoleDay = roleDayCoverage(coverageRows);

  const groups = [];
  for (const project of projects) {
    if (projectId && project.id !== projectId) continue;
    const projectRoles = roles
      .filter((r) => r.project_id === project.id)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.title).localeCompare(String(b.title)));
    const roleBlocks = [];
    for (const role of projectRoles) {
      const roleAssignments = assignments
        .filter((a) => a.project_id === project.id && a.project_role_id === role.id && a.status !== "cancelled" && overlapsRange(a.start_date, a.end_date, from, to))
        .sort((a, b) => employeeName(employeesById.get(a.employee_id)).localeCompare(employeeName(employeesById.get(b.employee_id))) || String(a.start_date).localeCompare(String(b.start_date)));
      const hasRequirement = requirements.some((q) => q.project_role_id === role.id && overlapsRange(q.date_from, q.date_to, from, to));
      if (!roleAssignments.length && !hasRequirement) continue;
      const summary = days.map((date) => ({ date, ...(perRoleDay.get(`${role.id}|${date}`) || null) }));
      const workers = roleAssignments.map((a) => {
        const own = assignmentsByEmployee.get(a.employee_id) || [];
        const own_schedules = schedulesByEmployee.get(a.employee_id) || [];
        const own_leaves = leavesByEmployee.get(a.employee_id) || [];
        const cells = days.map((date) => ({
          date,
          status: covers(a.start_date, a.end_date, date)
            ? ganttCell({ employeeId: a.employee_id, date, projectId: project.id, assignments: own, schedules: own_schedules, leaves: own_leaves, shifts })
            : null,
        }));
        return { assignment: a, employee: employeesById.get(a.employee_id) || null, cells };
      });
      roleBlocks.push({ role, summary, workers, hasRequirement });
    }
    if (roleBlocks.length || projectId) groups.push({ project, roles: roleBlocks });
  }
  return groups.sort((a, b) => String(a.project.name).localeCompare(String(b.project.name)));
}

/**
 * Trake jednog radnika u danu za dnevni prikaz: [{startH, endH, status, shiftId?}] u satima 0–24.
 * Odsustvo je cela traka; inače redovi rasporeda tog dana (i prelaz iz prethodnog dana), a bez redova rasporeda
 * podrazumevana smena angažmana.
 */
export function dayBars({ date, assignment, projectId = null, schedules = [], leaves = [], shifts = [] }) {
  const base = dayMs(date);
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const leave = leaves.find((l) => l.status === "approved" && l.employee_id === assignment.employee_id && covers(l.start_date, l.end_date, date));
  if (leave) return [{ startH: 0, endH: 24, status: absenceKind(leave.leave_type) }];
  const clip = (iv) => ({ startH: Math.max(0, (iv.start - base) / HOUR_MS), endH: Math.min(24, (iv.end - base) / HOUR_MS) });
  const bars = [];
  const prev = addDaysIso(date, -1);
  for (const s of schedules) {
    if (s.employee_id !== assignment.employee_id || s.status === "released") continue;
    const day = String(s.date).slice(0, 10);
    if (day !== date && day !== prev) continue;
    if (projectId && s.project_id && s.project_id !== projectId) continue;
    const c = clip(scheduleInterval(s, shiftsById));
    if (c.endH > c.startH) bars.push({ ...c, status: s.status, shiftId: s.shift_id || null });
  }
  const anyToday = schedules.some((s) => s.employee_id === assignment.employee_id && String(s.date).slice(0, 10) === date);
  if (!anyToday && assignment.default_shift_id && covers(assignment.start_date, assignment.end_date, date)) {
    const shift = shiftsById.get(assignment.default_shift_id);
    if (shift) {
      const c = clip(shiftInterval(shift, date));
      if (c.endH > c.startH) bars.push({ ...c, status: "assigned", shiftId: shift.id });
    }
  }
  return bars;
}

// ───────────────────────────── zahtevi ─────────────────────────────

/** Zahtevi koji se vide u opsegu, sa brojem dana sa manjkom/viškom i najvećim manjkom (iz pokrivenosti). */
export function requirementRows({ requirements = [], coverageRows = [], from, to }) {
  const byKey = groupBy(coverageRows, (r) => `${r.projectRoleId}|${r.shiftId}`);
  return requirements
    .filter((q) => overlapsRange(q.date_from, q.date_to, from, to))
    .map((q) => {
      const rows = (byKey.get(`${q.project_role_id}|${q.shift_id}`) || []).filter((r) => r.date >= q.date_from && r.date <= q.date_to);
      return {
        ...q,
        deficitDays: rows.filter((r) => r.deficit > 0).length,
        surplusDays: rows.filter((r) => r.surplus > 0).length,
        maxDeficit: rows.reduce((m, r) => Math.max(m, r.deficit), 0),
        coveredDays: rows.length,
      };
    })
    .sort((a, b) => String(a.project_id).localeCompare(String(b.project_id)) || String(a.project_role_id).localeCompare(String(b.project_role_id)) || a.date_from.localeCompare(b.date_from));
}

// ───────────────────────────── detalj pokrivenosti (klik na dan/smenu) ─────────────────────────────

/**
 * Za (projekat, uloga, datum): po smeni ko pokriva, ko fali (odsutni sa vrstom odsustva) i ko je slobodan za zamenu
 * (T05: radnik sa aktivnim angažmanom, ali u smeni koja se ne preklapa, JE slobodan). Slobodni su kvalifikovani
 * po ulozi (isti `title_key` ili `department_position`).
 */
export function coverageDetail({
  projectId, projectRoleId, date, requirements = [], assignments = [], schedules = [], leaves = [], shifts = [],
  employees = [], projectRoles = [],
}) {
  const role = projectRoles.find((r) => r.id === projectRoleId) || null;
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const rows = coverage({ requirements, assignments, schedules, leaves, shifts, from: date, to: date, projectId }).filter((r) => r.projectRoleId === projectRoleId);
  return rows.map((r) => {
    const free = availableWorkers({
      date, shiftId: r.shiftId, roleKey: role?.title_key ?? null, departmentPosition: role?.department_position ?? null,
      employees, assignments, schedules, leaves, shifts, projectRoles,
    }).map((f) => ({ ...f, employee: employeesById.get(f.employeeId) || null }));
    const leaveOf = (employeeId) => leaves.find((l) => l.status === "approved" && l.employee_id === employeeId && covers(l.start_date, l.end_date, date)) || null;
    return {
      ...r,
      covering: r.coveringEmployeeIds.map((id) => employeesById.get(id) || { id }),
      absentWorkers: r.missing.map((id) => {
        const leave = leaveOf(id);
        return { employee: employeesById.get(id) || { id }, leaveType: leave?.leave_type || null, kind: leave ? absenceKind(leave.leave_type) : "other_absence" };
      }),
      free,
    };
  });
}

/** Radnici kvalifikovani za ulogu (isti `title_key` / `department_position` na bilo kojem angažmanu), za predloge zamena. */
export function qualifiedEmployeeIds({ role, assignments = [], projectRoles = [] }) {
  if (!role) return [];
  const rolesById = new Map(projectRoles.map((r) => [r.id, r]));
  const same = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  const ids = new Set();
  for (const a of assignments) {
    if (a.status === "cancelled") continue;
    const r = rolesById.get(a.project_role_id);
    if (r && (same(r.title_key, role.title_key) || same(r.department_position, role.department_position))) ids.add(a.employee_id);
  }
  return [...ids];
}
