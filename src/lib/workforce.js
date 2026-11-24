// Workforce Planning: potreban broj radnika, pokrivenost (coverage), slobodni radnici, Gantt statusi
// (spec §13.03–13.05, §14.1, 4.3.3). Čiste funkcije, bez pristupa bazi. Isti izračun postoji u SQL-u
// (`workforce_coverage`, `worker_is_free`, `absence_kind`) i oba su pokrivena istim primerima
// (`workforce.test.js` i `supabase/tests/27_workforce.test.sql`).
//
// Ulazni redovi su redovi iz baze (snake_case):
//   shifts           {id, project_id, start_time, end_time}                    'HH:MM' ili 'HH:MM:SS'
//   requirements     {project_id, project_role_id, shift_id, date_from, date_to, required_count}
//   assignments      {id, employee_id, project_id, project_role_id, default_shift_id, start_date, end_date, status}
//   schedules        {employee_id, project_id, assignment_id, shift_id, date, status, start_at?, end_at?, shift_start?, shift_end?}
//   leaves           {id, employee_id, leave_type, start_date, end_date, status}
//   projectRoles     {id, project_id, title_key, department_position}
//   employees        {id, status}
// Datumi su 'YYYY-MM-DD' (bez vremenske zone: dan je kalendarski dan projekta).

const DAY_MS = 86_400_000;
const MIN_MS = 60_000;

/** Statusi rasporeda koji znače „radnik radi u toj smeni" (zauzimaju interval). */
const WORKING_STATUSES = new Set(["assigned", "replacement"]);

export const GANTT_STATUSES = ["assigned", "available", "standby", "leave", "sick_leave", "other_absence", "replacement"];

// ───────────────────────────── datumi i intervali ─────────────────────────────

/** 'YYYY-MM-DD' → ms (UTC ponoć). Vremenska zona se ne primenjuje: važi samo redosled i razlika. */
export function dayMs(isoDate) {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDaysIso(isoDate, n) {
  return new Date(dayMs(isoDate) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Svi dani [from, to] uključivo. */
export function eachDay(from, to) {
  const out = [];
  for (let t = dayMs(from); t <= dayMs(to); t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

function timeMinutes(value) {
  const [h, m] = String(value).split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Interval smene na dati datum: [start, end) u ms. Smena kojoj je kraj ≤ početak prelazi ponoć (kraj je sutradan).
 * Bez smene (null) interval je ceo dan.
 */
export function shiftInterval(shift, date) {
  const base = dayMs(date);
  if (!shift) return { start: base, end: base + DAY_MS };
  const s = timeMinutes(shift.start_time);
  const e = timeMinutes(shift.end_time);
  return { start: base + s * MIN_MS, end: base + (e <= s ? e + 24 * 60 : e) * MIN_MS };
}

/** Poluotvoreni intervali [start, end) se preklapaju. Uzastopne smene (kraj = početak) se ne preklapaju. */
export function intervalsOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function timestampMs(value) {
  // 'YYYY-MM-DDTHH:MM[:SS]' ili 'YYYY-MM-DD HH:MM[:SS]', tumači se kao zidno vreme (bez zone), isto kao timestamp u bazi.
  const [d, t = "00:00"] = String(value).split(/[T ]/);
  return dayMs(d) + timeMinutes(t) * MIN_MS;
}

/** Interval reda rasporeda: `start_at/end_at`, inače iz smene, inače iz `shift_start/shift_end` (HH:MM). */
export function scheduleInterval(row, shiftsById) {
  if (row.start_at && row.end_at) return { start: timestampMs(row.start_at), end: timestampMs(row.end_at) };
  const shift = row.shift_id ? shiftsById.get(row.shift_id) : null;
  if (shift) return shiftInterval(shift, row.date);
  if (row.shift_start && row.shift_end) return shiftInterval({ start_time: row.shift_start, end_time: row.shift_end }, row.date);
  return shiftInterval(null, row.date);
}

const covers = (start, end, date) => start <= date && (end == null || end >= date);
const approved = (leave) => leave.status === "approved";

/** Vrsta odsustva za Gantt: godišnji/lično/neplaćeno → leave, bolovanje → sick_leave, ostalo → other_absence. */
export function absenceKind(leaveType) {
  if (leaveType === "vacation" || leaveType === "personal" || leaveType === "unpaid") return "leave";
  if (leaveType === "sick") return "sick_leave";
  return "other_absence";
}

// ───────────────────────────── indeksi ─────────────────────────────

function indexes({ shifts = [], assignments = [], schedules = [], leaves = [], simulateLeaveId = null, projectRoles = [] }) {
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const assignmentsById = new Map(assignments.map((a) => [a.id, a]));
  const rolesById = new Map(projectRoles.map((r) => [r.id, r]));
  const schedulesByEmployeeDay = new Map();
  for (const s of schedules) {
    const key = `${s.employee_id}|${String(s.date).slice(0, 10)}`;
    if (!schedulesByEmployeeDay.has(key)) schedulesByEmployeeDay.set(key, []);
    schedulesByEmployeeDay.get(key).push(s);
  }
  const leavesByEmployee = new Map();
  for (const l of leaves) {
    if (!approved(l) && l.id !== simulateLeaveId) continue;
    if (!leavesByEmployee.has(l.employee_id)) leavesByEmployee.set(l.employee_id, []);
    leavesByEmployee.get(l.employee_id).push(l);
  }
  const assignmentsByEmployee = new Map();
  for (const a of assignments) {
    if (a.status === "cancelled") continue;
    if (!assignmentsByEmployee.has(a.employee_id)) assignmentsByEmployee.set(a.employee_id, []);
    assignmentsByEmployee.get(a.employee_id).push(a);
  }
  return { shiftsById, assignmentsById, rolesById, schedulesByEmployeeDay, leavesByEmployee, assignmentsByEmployee };
}

const leaveOn = (idx, employeeId, date) => (idx.leavesByEmployee.get(employeeId) || []).find((l) => covers(l.start_date, l.end_date, date)) || null;
const rowsOn = (idx, employeeId, date) => idx.schedulesByEmployeeDay.get(`${employeeId}|${date}`) || [];

/** Dodele radnika koje nose planiranu (podrazumevanu) smenu na dan: nema nijednog reda rasporeda tog dana. */
function defaultPlannedOn(idx, employeeId, date) {
  if (rowsOn(idx, employeeId, date).length > 0) return [];
  return (idx.assignmentsByEmployee.get(employeeId) || []).filter((a) => a.default_shift_id && covers(a.start_date, a.end_date, date));
}

/** Radnici planirani za (projekat, uloga, datum, smena) — definicija iz modela podataka §2.11. */
function plannedEmployees(idx, { projectId, projectRoleId, shiftId, date, employeeIds }) {
  const out = new Set();
  for (const employeeId of employeeIds) {
    const explicit = rowsOn(idx, employeeId, date).some((s) => {
      if (s.project_id !== projectId || s.shift_id !== shiftId || !WORKING_STATUSES.has(s.status)) return false;
      const a = s.assignment_id ? idx.assignmentsById.get(s.assignment_id) : null;
      return !!a && a.status !== "cancelled" && a.project_role_id === projectRoleId;
    });
    const byDefault = defaultPlannedOn(idx, employeeId, date).some(
      (a) => a.project_id === projectId && a.project_role_id === projectRoleId && a.default_shift_id === shiftId
    );
    if (explicit || byDefault) out.add(employeeId);
  }
  return out;
}

// ───────────────────────────── coverage ─────────────────────────────

/**
 * Pokrivenost po (projekat, uloga, smena, datum) u [from, to]: planirani − odsutni = dostupni, deficit i višak.
 * Redovi se prave samo tamo gde postoji potreba (Required Workforce).
 * `simulateLeaveId`: zahtev za odsustvo koji se računa kao odobren (simulacija pri odlučivanju, §14.1).
 * Vraća `coveringEmployeeIds` (planirani koji su prisutni) i `missing` (planirani koji su odsutni).
 */
export function coverage({ requirements = [], assignments = [], schedules = [], leaves = [], shifts = [], from, to, simulateLeaveId = null, projectId = null }) {
  const idx = indexes({ shifts, assignments, schedules, leaves, simulateLeaveId });
  const employeeIds = new Set([...assignments.map((a) => a.employee_id), ...schedules.map((s) => s.employee_id)]);
  const out = [];
  for (const req of requirements) {
    if (projectId && req.project_id !== projectId) continue;
    const lo = req.date_from > from ? req.date_from : from;
    const hi = req.date_to < to ? req.date_to : to;
    if (lo > hi) continue;
    for (const date of eachDay(lo, hi)) {
      const planned = plannedEmployees(idx, {
        projectId: req.project_id,
        projectRoleId: req.project_role_id,
        shiftId: req.shift_id,
        date,
        employeeIds,
      });
      const covering = [];
      const missing = [];
      for (const employeeId of [...planned].sort()) (leaveOn(idx, employeeId, date) ? missing : covering).push(employeeId);
      const required = req.required_count;
      const available = covering.length;
      out.push({
        projectId: req.project_id,
        projectRoleId: req.project_role_id,
        shiftId: req.shift_id,
        date,
        required,
        planned: planned.size,
        absent: missing.length,
        available,
        deficit: Math.max(required - available, 0),
        surplus: Math.max(available - required, 0),
        coveringEmployeeIds: covering,
        missing,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      String(a.projectId).localeCompare(String(b.projectId)) ||
      String(a.projectRoleId).localeCompare(String(b.projectRoleId)) ||
      String(a.shiftId).localeCompare(String(b.shiftId))
  );
}

/** Broj različitih projekata sa deficitom (Quick Insights, Dashboard „Workforce Shortages"). */
export function shortageProjects(rows) {
  return new Set(rows.filter((r) => r.deficit > 0).map((r) => r.projectId)).size;
}

// ───────────────────────────── slobodni radnici ─────────────────────────────

/**
 * Da li je radnik slobodan na dan za smenu (T05): nije odsutan, nema zauzet (assigned/replacement) red rasporeda i
 * nema podrazumevanu smenu čiji se interval preklapa sa intervalom smene. Radnik sa aktivnim angažmanom, ali
 * u drugoj (nepreklopljenoj) smeni, JESTE slobodan. Smena `null` znači ceo dan. Red `released` i `standby` ne zauzimaju.
 */
export function workerIsFree({ employeeId, date, shiftId = null, shifts = [], assignments = [], schedules = [], leaves = [], employees = null }) {
  const idx = indexes({ shifts, assignments, schedules, leaves });
  return isFree(idx, { employeeId, date, shift: shiftId ? idx.shiftsById.get(shiftId) || null : null, employees });
}

function isFree(idx, { employeeId, date, shift, employees }) {
  if (employees) {
    const e = employees.find((x) => x.id === employeeId);
    if (e && e.status && (e.status === "terminated" || e.status === "suspended")) return false;
  }
  if (leaveOn(idx, employeeId, date)) return false;
  const wanted = shiftInterval(shift, date);
  // Smena koja prelazi ponoć dodiruje susedne dane: proveri prethodni, isti i sledeći.
  for (const d of [addDaysIso(date, -1), date, addDaysIso(date, 1)]) {
    for (const s of rowsOn(idx, employeeId, d)) {
      if (!WORKING_STATUSES.has(s.status)) continue;
      if (intervalsOverlap(wanted, scheduleInterval(s, idx.shiftsById))) return false;
    }
    for (const a of defaultPlannedOn(idx, employeeId, d)) {
      if (intervalsOverlap(wanted, shiftInterval(idx.shiftsById.get(a.default_shift_id), d))) return false;
    }
  }
  return true;
}

const sameText = (a, b) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Radnici slobodni za dan i smenu (Workers Available for Reassignment, 4.3.3). Kvalifikovan je radnik koji ima
 * (ili je imao) dodelu na ulozi sa istim `title_key` (`roleKey`) ili istim `department_position`; bez `roleKey`
 * važe svi. `standby` označava radnika koji tog dana ima red rasporeda u statusu standby (prvi za zamenu, §14.2).
 */
export function availableWorkers({ date, shiftId = null, roleKey = null, departmentPosition = null, employees = [], assignments = [], schedules = [], leaves = [], shifts = [], projectRoles = [] }) {
  const idx = indexes({ shifts, assignments, schedules, leaves, projectRoles });
  const shift = shiftId ? idx.shiftsById.get(shiftId) || null : null;
  const filterByRole = !!(roleKey || departmentPosition);
  const out = [];
  for (const employee of employees) {
    if (!isFree(idx, { employeeId: employee.id, date, shift, employees: [employee] })) continue;
    if (filterByRole) {
      const qualified = (idx.assignmentsByEmployee.get(employee.id) || []).some((a) => {
        const role = idx.rolesById.get(a.project_role_id);
        return !!role && (sameText(role.title_key ?? role.title, roleKey) || sameText(role.department_position, departmentPosition));
      });
      if (!qualified) continue;
    }
    const standby = rowsOn(idx, employee.id, date).some((s) => s.status === "standby");
    out.push({ employeeId: employee.id, standby });
  }
  // Prvo standby, pa ostali slobodni; unutar grupe stabilan redosled po id.
  return out.sort((a, b) => Number(b.standby) - Number(a.standby) || String(a.employeeId).localeCompare(String(b.employeeId)));
}

// ───────────────────────────── Gantt ─────────────────────────────

/**
 * Status ćelije Gant prikaza za radnika, dan i projekat: odsustvo (odobreno) ima prednost, pa zamena, raspoređen
 * (red rasporeda ili podrazumevana smena angažmana na tom projektu), standby; inače available.
 * `shiftId` (opciono) sužava na jednu smenu.
 */
export function ganttCell({ employeeId, date, projectId = null, shiftId = null, assignments = [], schedules = [], leaves = [], shifts = [] }) {
  const idx = indexes({ shifts, assignments, schedules, leaves });
  const leave = leaveOn(idx, employeeId, date);
  if (leave) return absenceKind(leave.leave_type);
  const rows = rowsOn(idx, employeeId, date).filter((s) => (!projectId || s.project_id === projectId) && (!shiftId || s.shift_id === shiftId));
  if (rows.some((s) => s.status === "replacement")) return "replacement";
  if (rows.some((s) => s.status === "assigned")) return "assigned";
  const byDefault = defaultPlannedOn(idx, employeeId, date).some((a) => (!projectId || a.project_id === projectId) && (!shiftId || a.default_shift_id === shiftId));
  if (byDefault) return "assigned";
  if (rows.some((s) => s.status === "standby")) return "standby";
  return "available";
}
