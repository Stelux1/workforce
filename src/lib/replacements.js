// Leave kapacitet i Smart Replacement (spec §14, model §2.12, traka W2-L). Čiste funkcije, bez pristupa bazi.
//
// • leaveShortage(base, simulated, employeeId?) — koji redovi pokrivenosti padaju zbog odsustva (§14.1, T21). Isto pravilo
//   koristi baza u `decide_leave_request` (shortage_snapshot): red je relevantan kad simulacija odsustva poveća broj
//   odsutnih (radnik je tu planiran) i posle simulacije ostaje deficit > 0.
// • replacementNeeds(rows) — uzastopni dani istog (projekat, uloga, smena) sa deficitom → potrebe za zamenu.
// • rankCandidates({need, ...}) — kandidati za zamenu po redosledu kriterijuma §14.2 i kategorije
//   full_match | partial_availability | transfer_required | not_eligible (T22), uz uticaj na izvorni projekat (T23).
// • simulateReplacement / replacementImpact — isto što radi `assign_replacement` u bazi, nad redovima u memoriji: posle
//   zamene, koliko fali na izvornim projektima (upozorenje pre potvrde) i koliko na ciljnom.
//
// Dostupnost i pokrivenost računa isključivo src/lib/workforce.js (isti izračun kao SQL `workforce_coverage`), a
// onboarding readiness src/lib/onboarding.js (isti algoritam kao SQL `onboarding_manifest`). Ništa se ne upisuje:
// radnik se premešta tek kad ovlašćeni korisnik potvrdi Assign Replacement (RPC `assign_replacement`).
//
// Ulazni redovi su redovi iz baze (snake_case); datumi 'YYYY-MM-DD'.

import { coverage, eachDay, workerIsFree, shiftInterval, scheduleInterval, intervalsOverlap, addDaysIso } from "./workforce";
import { workerReadiness } from "./onboarding";
import { resolveSideRate } from "./payroll/rates";

export const CANDIDATE_CATEGORIES = Object.freeze(["full_match", "partial_availability", "transfer_required", "not_eligible"]);
const CATEGORY_RANK = { full_match: 0, partial_availability: 1, transfer_required: 2, not_eligible: 3 };

/** Id privremene (hipotetičke) dodele u simulaciji; baza pravi pravu tek posle potvrde. */
export const SIMULATED_ASSIGNMENT_ID = "__replacement__";

const WORKING = new Set(["assigned", "replacement"]);
const OCCUPYING = new Set(["assigned", "replacement", "standby"]);
const INACTIVE_EMPLOYEE = new Set(["terminated", "suspended"]);
const SATISFIED_DOC = new Set(["available", "expiring_soon", "not_permitted"]);

const iso = (d) => String(d).slice(0, 10);
const covers = (start, end, date) => iso(start) <= date && (end == null || iso(end) >= date);
const norm = (s) => String(s ?? "").trim().toLowerCase();
const byEmployee = (rows, id) => rows.filter((r) => r.employee_id === id);

// ───────────────────────────── §14.1: manjak zbog odsustva ─────────────────────────────

/** Red pokrivenosti iz RPC-a (`work_date`, snake_case) ili iz `coverage()` (camelCase) → jedan oblik. */
export function normalizeCoverageRow(r) {
  return {
    projectId: r.projectId ?? r.project_id,
    projectRoleId: r.projectRoleId ?? r.project_role_id,
    shiftId: r.shiftId ?? r.shift_id,
    date: iso(r.date ?? r.work_date),
    required: Number(r.required ?? 0),
    planned: Number(r.planned ?? 0),
    absent: Number(r.absent ?? 0),
    available: Number(r.available ?? 0),
    deficit: Number(r.deficit ?? 0),
    surplus: Number(r.surplus ?? 0),
    // Nazivi iz `leave_shortage` / snimka (i za projekte koje korisnik ne vidi, §14.1); samo kad ih baza pošalje.
    ...(r.project_name != null ? { projectName: r.project_name } : {}),
    ...(r.role_title != null ? { roleTitle: r.role_title } : {}),
    ...(r.shift_name != null ? { shiftName: r.shift_name } : {}),
  };
}

const rowKey = (r) => `${r.projectId}|${r.projectRoleId}|${r.shiftId}|${r.date}`;

/**
 * Redovi koje odsustvo obara (T21): u simulaciji ima više odsutnih nego bez nje i deficit ostaje > 0.
 * `deficitBefore` je deficit bez ovog odsustva (već postojeći manjak), `deficit` je tačan manjak ako se odobri.
 * Isto pravilo i isti oblik (bez camelCase) upisuje baza u `leave_requests.shortage_snapshot`.
 */
export function leaveShortage(baseRows = [], simulatedRows = []) {
  const base = new Map(baseRows.map(normalizeCoverageRow).map((r) => [rowKey(r), r]));
  return simulatedRows
    .map(normalizeCoverageRow)
    .filter((r) => r.deficit > 0 && r.absent > (base.get(rowKey(r))?.absent ?? 0))
    .map((r) => ({ ...r, deficitBefore: base.get(rowKey(r))?.deficit ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.projectId).localeCompare(String(b.projectId))
      || String(a.projectRoleId).localeCompare(String(b.projectRoleId)) || String(a.shiftId).localeCompare(String(b.shiftId)));
}

/** Snimak manjka iz baze (`shortage_snapshot`) → isti oblik kao `leaveShortage`. */
export function snapshotRows(snapshot) {
  return Array.isArray(snapshot) ? snapshot.map((r) => ({ ...normalizeCoverageRow(r), deficitBefore: Number(r.deficit_before ?? 0) })) : [];
}

/** Ukupno nedostaje (radnik × smena), od toga zbog ovog odsustva (`added`), i najveći dnevni manjak. */
export function shortageTotals(rows = []) {
  return {
    rows: rows.length,
    missing: rows.reduce((s, r) => s + r.deficit, 0),
    added: rows.reduce((s, r) => s + Math.max(r.deficit - (r.deficitBefore ?? 0), 0), 0),
    maxDeficit: rows.reduce((m, r) => Math.max(m, r.deficit), 0),
    projects: new Set(rows.map((r) => r.projectId)).size,
  };
}

/**
 * Potrebe za zamenu: uzastopni dani istog (projekat, uloga, smena) spajaju se u jedan opseg.
 * Vraća `[{projectId, projectRoleId, shiftId, from, to, days, deficit}]` (deficit = najveći dnevni manjak u opsegu).
 */
export function replacementNeeds(rows = []) {
  const groups = new Map();
  for (const r of rows.map(normalizeCoverageRow).filter((x) => x.deficit > 0)) {
    const k = `${r.projectId}|${r.projectRoleId}|${r.shiftId}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    let cur = null;
    for (const r of list) {
      if (cur && addDaysIso(cur.to, 1) === r.date) {
        cur.to = r.date;
        cur.days += 1;
        cur.deficit = Math.max(cur.deficit, r.deficit);
      } else {
        cur = { projectId: r.projectId, projectRoleId: r.projectRoleId, shiftId: r.shiftId, from: r.date, to: r.date, days: 1, deficit: r.deficit };
        out.push(cur);
      }
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || String(a.projectId).localeCompare(String(b.projectId)));
}

// ───────────────────────────── simulacija zamene (isto kao assign_replacement) ─────────────────────────────

/**
 * Redovi rasporeda i dodele posle zamene, u memoriji. Za svaki dan [from, to]:
 *  1) ako radnik tog dana nema red rasporeda, njegove podrazumevane smene (angažman sa default_shift_id) postaju
 *     eksplicitni redovi — `released` ako se preklapaju sa smenom zamene, inače `assigned` (da raspored tog dana ne
 *     izbriše njegovu planiranu smenu na drugom projektu);
 *  2) redovi koji se preklapaju sa smenom zamene (assigned/replacement/standby) postaju `released`;
 *  3) dodaje se red `replacement` na ciljnom projektu i privremena dodela (assignment_type = replacement).
 * Postojeće dodele se ne završavaju (istorija ostaje).
 */
export function simulateReplacement({ employeeId, need, from, to, assignments = [], schedules = [], shifts = [], reuseAssignmentId = null }) {
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const shift = shiftsById.get(need.shiftId) || null;
  const assignmentId = reuseAssignmentId || SIMULATED_ASSIGNMENT_ID;
  const nextAssignments = reuseAssignmentId
    ? assignments
    : [...assignments, {
      id: SIMULATED_ASSIGNMENT_ID, employee_id: employeeId, project_id: need.projectId, project_role_id: need.projectRoleId,
      default_shift_id: need.shiftId, start_date: from, end_date: to, status: "active", assignment_type: "replacement",
    }];
  const next = schedules.map((s) => ({ ...s }));
  const released = [];
  const ownDefaults = (g) => assignments.filter((a) => a.employee_id === employeeId && a.status !== "cancelled" && a.default_shift_id && covers(a.start_date, a.end_date, g));
  const materialize = (g, want) => {
    if (next.some((s) => s.employee_id === employeeId && iso(s.date) === g)) return;
    for (const a of ownDefaults(g)) {
      const clash = intervalsOverlap(shiftInterval(shiftsById.get(a.default_shift_id) || null, g), want);
      const row = { id: `__default__${a.id}|${g}`, employee_id: employeeId, project_id: a.project_id, assignment_id: a.id,
        shift_id: a.default_shift_id, date: g, status: clash ? "released" : "assigned" };
      next.push(row);
      if (clash) released.push(row);
    }
  };
  for (const date of eachDay(from, to)) {
    const want = shiftInterval(shift, date);
    // isti dan uvek; susedni samo kad se njegova podrazumevana smena preklapa (smena preko ponoći) — kao u bazi
    for (const g of [addDaysIso(date, -1), date, addDaysIso(date, 1)]) {
      if (g === date || ownDefaults(g).some((a) => intervalsOverlap(shiftInterval(shiftsById.get(a.default_shift_id) || null, g), want))) materialize(g, want);
    }
    for (const d of [addDaysIso(date, -1), date, addDaysIso(date, 1)]) {
      for (const s of next) {
        if (s.employee_id !== employeeId || iso(s.date) !== d || !OCCUPYING.has(s.status)) continue;
        if (intervalsOverlap(scheduleInterval(s, shiftsById), want)) {
          s.status = "released";
          released.push(s);
        }
      }
    }
    next.push({ id: `__replacement__|${date}`, employee_id: employeeId, project_id: need.projectId, assignment_id: assignmentId,
      shift_id: need.shiftId, date, status: "replacement" });
  }
  return { assignments: nextAssignments, schedules: next, released };
}

/**
 * Posledica zamene po pokrivenosti (T23): redovi gde deficit raste (izvorni projekat) i stanje ciljne potrebe posle
 * zamene. `sourceShortage` prazno = odlazak radnika ne pravi manjak; inače UI traži izričitu potvrdu, a baza bez
 * potvrde (`p_ack_source_shortage`) odbija.
 */
export function replacementImpact({ employeeId, need, from, to, requirements = [], assignments = [], schedules = [], leaves = [], shifts = [], reuseAssignmentId = null }) {
  const lo = addDaysIso(from, -1);
  const hi = addDaysIso(to, 1);
  const before = coverage({ requirements, assignments, schedules, leaves, shifts, from: lo, to: hi });
  const sim = simulateReplacement({ employeeId, need, from, to, assignments, schedules, shifts, reuseAssignmentId });
  const after = coverage({ requirements, assignments: sim.assignments, schedules: sim.schedules, leaves, shifts, from: lo, to: hi });
  const beforeByKey = new Map(before.map((r) => [rowKey(r), r]));
  const sourceShortage = [];
  const target = [];
  for (const r of after) {
    const b = beforeByKey.get(rowKey(r));
    const isTarget = r.projectId === need.projectId && r.projectRoleId === need.projectRoleId && r.shiftId === need.shiftId && r.date >= from && r.date <= to;
    if (isTarget) target.push({ date: r.date, required: r.required, available: r.available, deficit: r.deficit, deficitBefore: b?.deficit ?? 0 });
    else if (b && r.deficit > b.deficit) {
      sourceShortage.push({ projectId: r.projectId, projectRoleId: r.projectRoleId, shiftId: r.shiftId, date: r.date,
        required: r.required, availableBefore: b.available, available: r.available, deficitBefore: b.deficit, deficit: r.deficit });
    }
  }
  return {
    sourceShortage,
    sourceMissing: sourceShortage.reduce((s, r) => s + (r.deficit - r.deficitBefore), 0),
    target,
    targetDeficitAfter: target.reduce((m, r) => Math.max(m, r.deficit), 0),
    released: sim.released,
  };
}

// ───────────────────────────── §14.2: kandidati ─────────────────────────────

/** Ključ uloge: `title_key` (ili naziv) uloge na projektu. */
export function roleKeyOf(projectRoles = [], projectRoleId) {
  const role = projectRoles.find((r) => r.id === projectRoleId);
  return role ? norm(role.title_key ?? role.title) : null;
}

/** Podudaranje lokacije radnika (city / work_location) i projekta (city / location): match | different | unknown. */
export function locationMatch(employee, project) {
  const mine = [employee?.city, employee?.work_location].map(norm).filter(Boolean);
  const theirs = [project?.city, project?.location].map(norm).filter(Boolean);
  if (!mine.length || !theirs.length) return "unknown";
  const hit = mine.some((a) => theirs.some((b) => a === b || a.includes(b) || b.includes(a)));
  return hit ? "match" : "different";
}

/** Gde je radnik zauzet tog dana u intervalu smene zamene: redovi rasporeda i podrazumevane smene angažmana. */
function occupiedBy({ employeeId, date, shift, assignments, schedules, shiftsById }) {
  const want = shiftInterval(shift, date);
  const out = [];
  for (const d of [addDaysIso(date, -1), date, addDaysIso(date, 1)]) {
    const rows = schedules.filter((s) => iso(s.date) === d);
    for (const s of rows) {
      if (!WORKING.has(s.status)) continue;
      if (intervalsOverlap(scheduleInterval(s, shiftsById), want)) out.push({ projectId: s.project_id, assignmentId: s.assignment_id || null, shiftId: s.shift_id || null, date: d });
    }
    if (rows.length === 0) {
      for (const a of assignments) {
        if (a.status === "cancelled" || !a.default_shift_id || !covers(a.start_date, a.end_date, d)) continue;
        if (intervalsOverlap(shiftInterval(shiftsById.get(a.default_shift_id) || null, d), want)) {
          out.push({ projectId: a.project_id, assignmentId: a.id, shiftId: a.default_shift_id, date: d });
        }
      }
    }
  }
  return out.map((o) => ({ ...o, employeeId }));
}

/**
 * Kandidati za zamenu za potrebu `need = {projectId, projectRoleId, roleKey?, departmentPosition?, shiftId, from, to}`.
 *
 * Kategorija (po raspoloživosti, §14.2):
 *  - full_match: kvalifikovan i slobodan (ili standby) svih potrebnih dana;
 *  - partial_availability: kvalifikovan, slobodan samo deo dana (T22);
 *  - transfer_required: kvalifikovan, ni jednog dana slobodan, ali je zauzet na drugom mestu (privremeni premeštaj);
 *  - not_eligible: nije kvalifikovan za ulogu, neaktivan, odsutan ili već pokriva ovu potrebu.
 * Redosled unutar liste (kriterijumi §14.2): kategorija → uloga (isti naziv pre srodne pozicije) → puna raspoloživost
 * (standby pre slobodnih, pa udeo slobodnih dana) → sertifikati za ulogu → onboarding readiness → lokacija → B2C
 * (samo uz `canViewB2C`, niži trošak prvi) → ime.
 * Dokumenta koja nedostaju se uvek vraćaju (`missingDocuments`), ne skrivaju se i ne isključuju kandidata.
 *
 * @returns {Array<{employeeId, category, score, reasons, missingDocuments, days, freeDays, busyDays, standby,
 *   roleMatch, location, b2c, sourceImpact, sourceAssignmentId}>}
 */
export function rankCandidates({
  need, employees = [], assignments = [], schedules = [], leaves = [], shifts = [], documents = [], requiredDocuments = [],
  documentTypes = [], projects = [], projectRoles = [], rates = null, requirements = null, canViewB2C = false,
  today = null, excludeEmployeeIds = [],
}) {
  if (!need?.projectId || !need?.projectRoleId || !need?.from || !need?.to) return [];
  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const shift = need.shiftId ? shiftsById.get(need.shiftId) || null : null;
  const rolesById = new Map(projectRoles.map((r) => [r.id, r]));
  const targetRole = rolesById.get(need.projectRoleId);
  const roleKey = need.roleKey ? norm(need.roleKey) : roleKeyOf(projectRoles, need.projectRoleId);
  const deptPos = norm(need.departmentPosition ?? targetRole?.department_position);
  const project = projects.find((p) => p.id === need.projectId) || null;
  const days = eachDay(need.from, need.to);
  const exclude = new Set(excludeEmployeeIds);
  const todayIso = today || days[0];
  const approvedLeaves = leaves.filter((l) => l.status === "approved");

  const out = [];
  for (const employee of employees) {
    if (exclude.has(employee.id)) continue;
    const myAssignments = byEmployee(assignments, employee.id);
    const mySchedules = byEmployee(schedules, employee.id);
    const myLeaves = byEmployee(approvedLeaves, employee.id);
    const reasons = [];

    // (1) Job Role: dodela (ili istorija) na ulozi istog naziva ili iste pozicije iz Settings
    let roleMatch = "none";
    for (const a of myAssignments) {
      if (a.status === "cancelled") continue;
      const role = rolesById.get(a.project_role_id);
      if (!role) continue;
      if (roleKey && norm(role.title_key ?? role.title) === roleKey) { roleMatch = "exact"; break; }
      if (deptPos && norm(role.department_position) === deptPos) roleMatch = "related";
    }
    reasons.push({ code: roleMatch === "exact" ? "role_exact" : roleMatch === "related" ? "role_related" : "role_mismatch" });

    // (2) raspoloživost po danu
    const inactive = INACTIVE_EMPLOYEE.has(employee.status);
    const perDay = days.map((date) => {
      if (myLeaves.some((l) => covers(l.start_date, l.end_date, date))) return { date, state: "leave" };
      const already = mySchedules.some((s) => iso(s.date) === date && s.project_id === need.projectId && s.shift_id === need.shiftId && WORKING.has(s.status))
        || (mySchedules.every((s) => iso(s.date) !== date) && myAssignments.some((a) => a.status !== "cancelled" && a.project_id === need.projectId
          && a.project_role_id === need.projectRoleId && a.default_shift_id === need.shiftId && covers(a.start_date, a.end_date, date)));
      if (already) return { date, state: "covering" };
      const free = workerIsFree({ employeeId: employee.id, date, shiftId: need.shiftId || null, shifts, assignments: myAssignments, schedules: mySchedules, leaves: myLeaves });
      if (free) {
        const standby = mySchedules.some((s) => iso(s.date) === date && s.status === "standby");
        return { date, state: standby ? "standby" : "free" };
      }
      return { date, state: "busy", occupied: occupiedBy({ employeeId: employee.id, date, shift, assignments: myAssignments, schedules: mySchedules, shiftsById }) };
    });
    const freeDays = perDay.filter((d) => d.state === "free" || d.state === "standby").length;
    const standbyDays = perDay.filter((d) => d.state === "standby").length;
    const busyDays = perDay.filter((d) => d.state === "busy").length;
    const leaveDays = perDay.filter((d) => d.state === "leave").length;
    const coveringDays = perDay.filter((d) => d.state === "covering").length;
    const sources = [];
    for (const d of perDay) for (const o of d.occupied || []) if (!sources.some((s) => s.assignmentId === o.assignmentId && s.projectId === o.projectId)) sources.push(o);

    if (inactive) reasons.push({ code: "inactive", status: employee.status });
    if (freeDays === days.length) reasons.push({ code: standbyDays === days.length ? "standby_all_days" : "free_all_days", days: days.length });
    else if (freeDays > 0) reasons.push({ code: "free_some_days", free: freeDays, total: days.length });
    if (standbyDays > 0 && standbyDays < days.length) reasons.push({ code: "standby_some_days", days: standbyDays });
    if (busyDays > 0) reasons.push({ code: "busy_days", days: busyDays, projectIds: [...new Set(sources.map((s) => s.projectId))] });
    if (leaveDays > 0) reasons.push({ code: "leave_days", days: leaveDays });
    if (coveringDays > 0) reasons.push({ code: "already_covering", days: coveringDays });

    let category;
    if (inactive || roleMatch === "none" || coveringDays === days.length) category = "not_eligible";
    else if (freeDays === days.length) category = "full_match";
    else if (freeDays > 0) category = "partial_availability";
    else if (busyDays > 0) category = "transfer_required";
    else category = "not_eligible";

    // (3) sertifikati za ulogu i (4) onboarding readiness (svi obavezni zahtevi projekta za tu ulogu)
    const hypothetical = { id: SIMULATED_ASSIGNMENT_ID, employee_id: employee.id, project_id: need.projectId, project_role_id: need.projectRoleId,
      start_date: need.from, end_date: need.to, status: "active" };
    const readiness = workerReadiness({ assignment: hypothetical, requirements: requiredDocuments, documents, documentTypes, today: todayIso, canViewSensitive: true });
    const reqById = new Map(requiredDocuments.map((q) => [q.id, q]));
    const missingDocuments = readiness.items
      .filter((i) => i.mandatory && !SATISFIED_DOC.has(i.status))
      .map((i) => ({ documentType: i.document_type, status: i.status, expirationDate: i.expiration_date, roleSpecific: !!reqById.get(i.requirement_id)?.project_role_id }));
    const certificatesOk = !missingDocuments.some((m) => m.roleSpecific);
    const readinessOk = missingDocuments.length === 0;
    const hasRoleRequirements = requiredDocuments.some((q) => q.project_id === need.projectId && q.project_role_id === need.projectRoleId);
    if (hasRoleRequirements) reasons.push({ code: certificatesOk ? "certificates_ok" : "certificates_missing", types: missingDocuments.filter((m) => m.roleSpecific).map((m) => m.documentType) });
    reasons.push({ code: readinessOk ? "readiness_ok" : "readiness_missing", count: missingDocuments.length });

    // (5) lokacija
    const location = locationMatch(employee, project);
    reasons.push({ code: `location_${location}` });

    // (6) procenjeni B2C trošak (samo uz pravo; tarifa koja bi važila na privremenoj dodeli prvog dana)
    let b2c = null;
    if (canViewB2C && Array.isArray(rates)) {
      try {
        const r = resolveSideRate("worker", { date: need.from, employeeId: employee.id, projectId: need.projectId, assignmentId: SIMULATED_ASSIGNMENT_ID, assignments: [hypothetical], rates });
        b2c = { rate: r.rate, currency: r.currency, source: r.source };
        reasons.push({ code: "b2c", rate: r.rate, currency: r.currency });
      } catch {
        reasons.push({ code: "b2c_missing" });
      }
    }

    // uticaj na izvorni projekat (T23) za dane kad je zauzet
    let sourceImpact = null;
    if (busyDays > 0 && category !== "not_eligible" && Array.isArray(requirements)) {
      const impact = replacementImpact({ employeeId: employee.id, need, from: need.from, to: need.to, requirements, assignments, schedules, leaves, shifts });
      sourceImpact = { rows: impact.sourceShortage, missing: impact.sourceMissing };
      if (impact.sourceShortage.length) reasons.push({ code: "source_shortage", missing: impact.sourceMissing, projectIds: [...new Set(impact.sourceShortage.map((r) => r.projectId))] });
    }

    const score = Math.round(
      (roleMatch === "exact" ? 30 : roleMatch === "related" ? 15 : 0)
      + (days.length ? (freeDays / days.length) * 30 : 0)
      + (certificatesOk ? 15 : 0)
      + (readinessOk ? 10 : 0)
      + (location === "match" ? 10 : location === "unknown" ? 5 : 0)
      + (standbyDays > 0 ? 5 : 0)
    );

    out.push({
      employeeId: employee.id,
      category,
      score: category === "not_eligible" ? 0 : score,
      reasons,
      missingDocuments,
      days: perDay.map(({ date, state }) => ({ date, state })),
      freeDays,
      busyDays,
      standby: standbyDays > 0,
      roleMatch,
      certificatesOk,
      readinessOk,
      location,
      b2c,
      sourceImpact,
      sourceAssignmentId: sources.length === 1 ? sources[0].assignmentId : null,
      sources,
      name: [employee.first_name, employee.last_name].filter(Boolean).join(" "),
    });
  }

  const LOC = { match: 0, unknown: 1, different: 2 };
  const ROLE = { exact: 0, related: 1, none: 2 };
  return out.sort((a, b) =>
    CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category]
    || ROLE[a.roleMatch] - ROLE[b.roleMatch]
    || Number(b.standby) - Number(a.standby)
    || b.freeDays - a.freeDays
    || Number(b.certificatesOk) - Number(a.certificatesOk)
    || Number(b.readinessOk) - Number(a.readinessOk)
    || LOC[a.location] - LOC[b.location]
    || (canViewB2C ? (a.b2c?.rate ?? Infinity) - (b.b2c?.rate ?? Infinity) : 0)
    || a.name.localeCompare(b.name)
    || String(a.employeeId).localeCompare(String(b.employeeId)));
}

/**
 * Najduži uzastopni opseg dana u kome je kandidat slobodan (za predlog „od–do" u Assign Replacement kod delimične
 * raspoloživosti). Bez slobodnih dana vraća ceo opseg potrebe (transfer).
 */
export function suggestedRange(candidate, need) {
  let best = null;
  let cur = null;
  for (const d of candidate?.days || []) {
    if (d.state === "free" || d.state === "standby") {
      cur = cur && addDaysIso(cur.to, 1) === d.date ? { ...cur, to: d.date } : { from: d.date, to: d.date };
      if (!best || eachDay(cur.from, cur.to).length > eachDay(best.from, best.to).length) best = cur;
    } else cur = null;
  }
  return best || { from: need.from, to: need.to };
}
