// Angažman (project_assignments) — jedna evidencija za Project Workers, Project Assignments, Timesheets, Workforce,
// Onboarding, Payables i Billing (docs/TEAMORA-DATA-MODEL.md §2.4). Čiste funkcije, bez pristupa bazi.
//
// Project Assignments (spec §4, W2-K): tabela, KPI kartice, Quick Insights i izvoz rade nad ISTIM skupom redova —
// `decorateAssignments` → `filterAssignments` → (`sortAssignments`) — pa za isti filter daju isti obuhvat (T02).
// Prikazni status se računa na „danas" u vremenskoj zoni projekta (§4.4); isti dan nosi svaki red (`today`).
import { resolveSideRate } from "./payroll/rates.js";

export const ASSIGNMENT_STATUSES = Object.freeze(["active", "upcoming", "ending_soon", "completed"]);
export const ENDING_SOON_DAYS = 30;
/** Brzi režim „Active" (§4.1): trenutno važeći angažmani. */
export const ACTIVE_MODE_STATUSES = Object.freeze(["active", "ending_soon"]);
export const DEFAULT_TIME_ZONE = "Europe/Bratislava";

const day = (v) => (v ? String(v).slice(0, 10) : "");
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
const lower = (v) => text(v).toLowerCase();

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Prikazni status na dan `today` (§4.4; isto kao SQL assignment_display_status). Četiri statusa su međusobno
 * isključiva; `cancelled` je van njih (poništena dodela, nikad ne važi).
 * @param {{status?: string, start_date: string, end_date?: string|null}} a
 * @param {string} today "YYYY-MM-DD" (u vremenskoj zoni projekta)
 * @returns {"cancelled"|"completed"|"upcoming"|"ending_soon"|"active"}
 */
export function assignmentStatus(a, today) {
  const t = day(today);
  if (a?.status === "cancelled") return "cancelled";
  const end = day(a?.end_date);
  if (end && end < t) return "completed";
  if (day(a?.start_date) > t) return "upcoming";
  if (end && end <= addDays(t, ENDING_SOON_DAYS)) return "ending_soon";
  return "active";
}

/** Kalendarski dan („YYYY-MM-DD") u vremenskoj zoni; neispravna zona → podrazumevana firme. */
export function todayInZone(timeZone, now = new Date()) {
  const fmt = (tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    return fmt(timeZone || DEFAULT_TIME_ZONE);
  } catch {
    return fmt(DEFAULT_TIME_ZONE);
  }
}

/** Status reda: već izračunat (`displayStatus`) ili iz datuma na `today`. */
const statusOf = (a, today) => a?.displayStatus ?? assignmentStatus(a, a?.today ?? today);

/** Datum na koji se prikazuje tarifa reda: danas za važeće, početak za predstojeće, kraj za završene. */
export function rateReferenceDate(a, status, today) {
  if (status === "upcoming") return day(a.start_date);
  if (status === "completed") return day(a.end_date);
  return day(today);
}

function sideRate(side, a, date, rates) {
  try {
    const r = resolveSideRate(side, {
      date, employeeId: a.employee_id, projectId: a.project_id, assignmentId: a.id, assignments: [a], rates,
    });
    return { rate: r.rate, currency: r.currency, source: r.source, ref: r.ref };
  } catch (e) {
    return { error: e?.name === "RateUnitError" ? "unit" : "missing" };
  }
}

/**
 * Obogaćeni redovi za ekran i izvoz: status na „danas" projekta, šifra radnika, klijent, ključ Job Role i tarife.
 * B2C/B2B se računaju SAMO uz pravo (`rates.view_b2c` / `rates.view_b2b`); bez prava je vrednost `null` i ne postoji
 * ni u izvozu (T26). Baza ionako ne vraća tarife bez prava (RLS nad `rates`).
 * @param {object[]} list redovi project_assignments
 * @param {object} ctx
 * @param {object[]} [ctx.projects]  {id, name, client_id, client_name, time_zone}
 * @param {object[]} [ctx.employees] {id, employee_id (šifra), first_name, last_name, profile_photo}
 * @param {object[]} [ctx.rates]     redovi rates (samo ono što je baza vratila)
 * @param {string[]|Set} [ctx.perms] prava korisnika
 * @param {string} [ctx.defaultTimeZone] app_settings.time_zone
 * @param {string} [ctx.today]       fiksni dan (testovi); inače „danas" u zoni projekta
 * @param {Date} [ctx.now]
 */
export function decorateAssignments(list, ctx = {}) {
  const { projects = [], employees = [], rates = [], perms = [], defaultTimeZone = DEFAULT_TIME_ZONE, today = null, now = new Date() } = ctx;
  const permSet = perms instanceof Set ? perms : new Set(perms);
  const seeB2C = permSet.has("rates.view_b2c");
  const seeB2B = permSet.has("rates.view_b2b");
  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const employeesById = new Map(employees.map((e) => [e.id, e]));
  const todayByZone = new Map();
  const todayFor = (tz) => {
    const key = tz || defaultTimeZone || DEFAULT_TIME_ZONE;
    if (!todayByZone.has(key)) todayByZone.set(key, todayInZone(key, now));
    return todayByZone.get(key);
  };
  return (list || []).map((a) => {
    const project = projectsById.get(a.project_id);
    const employee = employeesById.get(a.employee_id);
    const t = today ? day(today) : todayFor(project?.time_zone);
    const displayStatus = assignmentStatus(a, t);
    const refDate = rateReferenceDate(a, displayStatus, t);
    const live = displayStatus !== "cancelled";
    return {
      ...a,
      today: t,
      displayStatus,
      employeeName: text(a.employee_name) || (employee ? `${text(employee.last_name)} ${text(employee.first_name)}`.trim() : ""),
      employeeCode: text(employee?.employee_id),
      employeePhoto: employee?.profile_photo || null,
      projectName: text(a.project_name) || text(project?.name),
      clientId: project?.client_id || null,
      clientName: text(project?.client_name),
      projectStatus: project?.status || null,
      roleName: text(a.position),
      roleKey: lower(a.position),
      b2c: seeB2C && live ? sideRate("worker", a, refDate, rates) : null,
      b2b: seeB2B && live ? sideRate("client", a, refDate, rates) : null,
    };
  });
}

/**
 * Filteri §4.1: pretraga (radnik, šifra, projekat, Job Role), Project, Client, Job Role, Status, Date Range i brzi režim.
 * `mode='active'` → samo Active i Ending Soon; `mode='all'` → svi statusi. Poništene (cancelled) su van 4 statusa i
 * prikazuju se samo kad je izričito izabran status `cancelled`.
 * Date Range: angažman se preklapa sa [from, to] (otvoren kraj = traje).
 * @param {object[]} rows redovi iz `decorateAssignments`
 * `projectStatus` (pstatus iz src/lib/listLinks.js) sužava na projekte u tom statusu (active|paused|completed);
 * `expiring='month'` → samo angažmani iz kartice Expiring This Month.
 * @param {{search?, projectId?, clientId?, projectStatus?, roleKey?, status?, from?, to?, mode?: 'active'|'all', expiring?}} f
 */
export function filterAssignments(rows, f = {}) {
  const q = lower(f.search);
  const status = f.status && f.status !== "all" ? f.status : null;
  const mode = f.mode === "active" ? "active" : "all";
  const from = day(f.from);
  const to = day(f.to);
  return (rows || []).filter((a) => {
    const s = statusOf(a, f.today);
    if (status) {
      if (s !== status) return false;
    } else if (s === "cancelled") {
      return false;
    }
    if (mode === "active" && !ACTIVE_MODE_STATUSES.includes(s)) return false;
    if (f.projectId && f.projectId !== "all" && a.project_id !== f.projectId) return false;
    if (f.clientId && f.clientId !== "all" && (a.clientId ?? null) !== f.clientId) return false;
    if (f.projectStatus && f.projectStatus !== "all" && (a.projectStatus ?? null) !== f.projectStatus) return false;
    if (f.roleKey && f.roleKey !== "all" && (a.roleKey ?? lower(a.position)) !== f.roleKey) return false;
    if (from && a.end_date && day(a.end_date) < from) return false;
    if (to && day(a.start_date) > to) return false;
    if (f.expiring === "month" && !expiresThisMonth(a, statusOf(a, f.today), day(a.today ?? f.today))) return false;
    if (q) {
      const hay = [a.employeeName ?? a.employee_name, a.employeeCode, a.projectName ?? a.project_name, a.roleName ?? a.position]
        .map(lower)
        .join("\n");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const STATUS_ORDER = { active: 0, ending_soon: 1, upcoming: 2, completed: 3, cancelled: 4 };
const SORT_VALUE = {
  employee: (a) => lower(a.employeeName ?? a.employee_name),
  project: (a) => lower(a.projectName ?? a.project_name),
  client: (a) => lower(a.clientName),
  role: (a) => lower(a.roleName ?? a.position),
  b2c: (a) => (a.b2c && !a.b2c.error ? a.b2c.rate : null),
  b2b: (a) => (a.b2b && !a.b2b.error ? a.b2b.rate : null),
  start: (a) => day(a.start_date),
  end: (a) => day(a.end_date) || null, // bez kraja = najkasnije
  status: (a) => STATUS_ORDER[statusOf(a)] ?? 9,
};
export const SORT_KEYS = Object.freeze(Object.keys(SORT_VALUE));

/**
 * Sortiranje kolona (stabilno; prazne vrednosti uvek na kraju, osim „bez kraja" koji je najkasniji datum).
 * @param {{key: string, dir: 'asc'|'desc'}} sort
 */
export function sortAssignments(rows, sort = { key: "employee", dir: "asc" }) {
  const get = SORT_VALUE[sort?.key] || SORT_VALUE.employee;
  const dir = sort?.dir === "desc" ? -1 : 1;
  const openEnd = sort?.key === "end";
  return (rows || [])
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      const xa = x.v === null || x.v === "" || x.v === undefined;
      const ya = y.v === null || y.v === "" || y.v === undefined;
      if (xa || ya) {
        if (xa && ya) return x.i - y.i;
        if (openEnd) return (xa ? 1 : -1) * dir; // otvoren kraj = posle svakog datuma
        return xa ? 1 : -1;
      }
      const c = typeof x.v === "number" && typeof y.v === "number" ? x.v - y.v : String(x.v).localeCompare(String(y.v));
      return c * dir || x.i - y.i;
    })
    .map((x) => x.row);
}

/** Angažman se preklapa sa [from, to] (prazna granica = otvoreno; bez kraja = traje). */
export function overlaps(a, { from, to } = {}) {
  if (from && a.end_date && day(a.end_date) < day(from)) return false;
  if (to && day(a.start_date) > day(to)) return false;
  return true;
}

function monthBounds(today) {
  const [y, m] = day(today).split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { monthStart: first, monthEnd: last };
}

/** End Date u tekućem kalendarskom mesecu (dan `today`), a angažman nije već završen ni poništen. */
export function expiresThisMonth(a, status, today) {
  if (status === "cancelled" || !a?.end_date || !today) return false;
  const { monthStart, monthEnd } = monthBounds(today);
  const end = day(a.end_date);
  return end >= monthStart && end <= monthEnd && end >= day(today);
}

/**
 * KPI kartice §4.2 nad filtriranim skupom:
 * - total: broj zapisa;
 * - activeWorkers: jedinstveni radnici sa trenutno važećim angažmanom (Active ili Ending Soon) — radnik na dva
 *   projekta se broji jednom (T01);
 * - activeProjects: različiti projekti sa takvim radnikom;
 * - expiringThisMonth: End Date u tekućem kalendarskom mesecu i angažman nije već završen (end ≥ danas).
 * `monthStart`/`monthEnd` su za oznaku perioda na ekranu.
 * Sa periodom (`period = {from, to}`, filter Date Range) „aktivan" znači angažman (ne poništen) koji se preklapa sa
 * periodom — isto pravilo kao Main Dashboard (`assignmentsInPeriod` u src/lib/payroll/dashboard.js, T27).
 */
export function assignmentKpis(rows, { today, period = null } = {}) {
  const list = rows || [];
  const workers = new Set();
  const projects = new Set();
  let expiring = 0;
  let refToday = day(today) || (list[0]?.today ?? "");
  for (const a of list) {
    const s = statusOf(a, today);
    const active = period && (period.from || period.to) ? s !== "cancelled" && overlaps(a, period) : ACTIVE_MODE_STATUSES.includes(s);
    if (active) {
      workers.add(a.employee_id);
      projects.add(a.project_id);
    }
    if (expiresThisMonth(a, s, day(a.today ?? today))) expiring += 1;
  }
  if (!refToday) refToday = new Date().toISOString().slice(0, 10);
  return {
    total: list.length,
    activeWorkers: workers.size,
    activeProjects: projects.size,
    expiringThisMonth: expiring,
    ...monthBounds(refToday),
  };
}

/** Procenti sa jednom decimalom čiji je zbir tačno 100 (najveći ostatak); bez podataka sve 0. */
export function percentages(counts) {
  const total = counts.reduce((s, c) => s + c, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c * 1000) / total);
  const base = raw.map(Math.floor);
  let left = 1000 - base.reduce((s, b) => s + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    if (counts[i] > 0) {
      base[i] += 1;
      left -= 1;
    }
  }
  return base.map((b) => b / 10);
}

/**
 * Donut „Assignments by Status" (§4.3): četiri isključiva statusa, zbir procenata 100 (T03). Poništeni se ne broje.
 * @returns {{total: number, items: {status, count, pct}[]}}
 */
export function statusBreakdown(rows, { today } = {}) {
  const counts = Object.fromEntries(ASSIGNMENT_STATUSES.map((s) => [s, 0]));
  for (const a of rows || []) {
    const s = statusOf(a, today);
    if (s in counts) counts[s] += 1;
  }
  const values = ASSIGNMENT_STATUSES.map((s) => counts[s]);
  const pcts = percentages(values);
  return {
    total: values.reduce((s, c) => s + c, 0),
    items: ASSIGNMENT_STATUSES.map((status, i) => ({ status, count: values[i], pct: pcts[i] })),
  };
}

/** „Assignments by Project": broj angažovanja po projektu, najviše prvo (pa po nazivu). */
export function byProject(rows) {
  const map = new Map();
  for (const a of rows || []) {
    const cur = map.get(a.project_id) || { projectId: a.project_id, projectName: a.projectName ?? a.project_name ?? "", count: 0 };
    cur.count += 1;
    map.set(a.project_id, cur);
  }
  return [...map.values()].sort((x, y) => y.count - x.count || String(x.projectName).localeCompare(String(y.projectName)));
}

/**
 * „Assignments Ending Soon": trenutno važeći angažmani koji ističu u narednih `days` dana (status Ending Soon) —
 * klik vodi na isti filter statusa. Razlikuje se od kalendarske metrike Expiring This Month.
 */
export function endingSoon(rows, days = ENDING_SOON_DAYS, { today } = {}) {
  return (rows || [])
    .filter((a) => {
      const t = day(a.today ?? today);
      const s = statusOf(a, today);
      return (s === "active" || s === "ending_soon") && a.end_date && day(a.end_date) >= t && day(a.end_date) <= addDays(t, days);
    })
    .sort((x, y) => day(x.end_date).localeCompare(day(y.end_date)));
}

/** Broj radnika po projektu sa važećim ili predstojećim angažmanom (Project Overview; ne iz JSON keša). */
export function workersByProject(list, today) {
  const sets = new Map();
  for (const a of list || []) {
    const s = statusOf(a, today);
    if (s === "cancelled" || s === "completed") continue;
    if (!sets.has(a.project_id)) sets.set(a.project_id, new Set());
    sets.get(a.project_id).add(a.employee_id);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

/** Kolone izvoza (§4.1, T26). B2C/B2B kolone postoje samo uz pravo. */
export const EXPORT_COLUMNS = Object.freeze([
  { key: "employee" },
  { key: "employee_code" },
  { key: "project" },
  { key: "client" },
  { key: "job_role" },
  { key: "b2c_rate", perm: "rates.view_b2c" },
  { key: "b2c_currency", perm: "rates.view_b2c" },
  { key: "b2b_rate", perm: "rates.view_b2b" },
  { key: "b2b_currency", perm: "rates.view_b2b" },
  { key: "start_date" },
  { key: "end_date" },
  { key: "status" },
]);

/**
 * Redovi za CSV/Excel/PDF — CEO filtrirani i sortirani skup (ne samo strana). Kolone za koje korisnik nema pravo se
 * izbacuju i iz zaglavlja i iz redova (T26; druga linija odbrane — server te vrednosti ionako ne vraća).
 * @returns {{columns: string[], rows: object[]}}
 */
export function exportRows(list, perms = []) {
  const permSet = perms instanceof Set ? perms : new Set(perms);
  const columns = EXPORT_COLUMNS.filter((c) => !c.perm || permSet.has(c.perm)).map((c) => c.key);
  const rate = (r) => (r && !r.error ? r : null);
  const rows = (list || []).map((a) => {
    const b2c = rate(a.b2c);
    const b2b = rate(a.b2b);
    const full = {
      employee: a.employeeName ?? a.employee_name ?? "",
      employee_code: a.employeeCode ?? "",
      project: a.projectName ?? a.project_name ?? "",
      client: a.clientName ?? "",
      job_role: a.roleName ?? a.position ?? "",
      b2c_rate: b2c ? b2c.rate : null,
      b2c_currency: b2c ? b2c.currency : "",
      b2b_rate: b2b ? b2b.rate : null,
      b2b_currency: b2b ? b2b.currency : "",
      start_date: day(a.start_date),
      end_date: day(a.end_date),
      status: statusOf(a),
    };
    return Object.fromEntries(columns.map((k) => [k, full[k]]));
  });
  return { columns, rows };
}
