// Dnevne linije rada i jedno pravilo zaokruživanja za ceo sistem (spec §10, data model §3.2, T09, osnova za T27).
// Čiste funkcije, ništa se ne čita iz baze.
//
// Izvor linija je `timesheetDayLines(row, {from, to, estimate})` iz src/lib/payroll/timesheetDays.js (T-A2): za
// odobrenu satnicu vraća po jedan red za svaki dan × vrstu sati, sa tarifom i koeficijentom tog dana (v1 i v2
// snimak), a za `submitted` uz `estimate: true` procenu iz `estimate_days`. Ovaj modul je ne kopira; testovi mogu
// da proslede `dayLinesOf` (fixture istog oblika).
//
// PRAVILO ZAOKRUŽIVANJA (isto u SQL-u: generate_payables, set_billing_status):
//   za period se sati sabiraju po grupi (project_id, employee_id, hour_type, rate, coef, currency) — posebno za
//   trošak (worker) i za prihod (client); iznos grupe = round2(Σhours × rate × coef); iznos perioda = zbir grupa.
// Dashboard, Financial Report, Billing i Payables za isti period i filter zato daju isti broj (T27).

import { round2 } from "../payroll/money.js";
import { timesheetDayLines } from "../payroll/timesheetDays.js";
import { normalizeCurrency, sortCurrencies } from "./currency.js";

/** Strana obračuna: trošak rada (B2C × worker coef) i prihod (B2B × client coef). */
export const SIDES = Object.freeze({ COST: "cost", REVENUE: "revenue" });

const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const asList = (v) => (v === null || v === undefined || v === "" ? null : Array.isArray(v) ? v : [v]);

function indexById(list) {
  const m = new Map();
  for (const x of list || []) if (x?.id) m.set(x.id, x);
  return m;
}

/** Dopunjava liniju klijentom (preko projekta) i Job Role (preko dodele), da bi filteri i grupisanje radili. */
function enrich(line, { projectsById, assignmentsById, row }) {
  const projectId = line.projectId ?? row?.project_id ?? null;
  const assignmentId = line.assignmentId ?? row?.assignment_id ?? null;
  const assignment = assignmentId ? assignmentsById.get(assignmentId) : null;
  return {
    ...line,
    date: dateOnly(line.date),
    projectId,
    employeeId: line.employeeId ?? row?.employee_id ?? null,
    assignmentId,
    timesheetId: line.timesheetId ?? row?.id ?? null,
    clientId: line.clientId ?? (projectId ? projectsById.get(projectId)?.client_id ?? null : null),
    projectRoleId: line.projectRoleId ?? assignment?.project_role_id ?? null,
    hours: Number(line.hours) || 0,
  };
}

/** Da li linija prolazi filtere { projectId, clientId, employeeId, projectRoleId } (vrednost ili niz). */
export function matchesFilters(line, filters = {}) {
  const checks = [
    ["projectId", line.projectId],
    ["clientId", line.clientId],
    ["employeeId", line.employeeId],
    ["projectRoleId", line.projectRoleId],
  ];
  for (const [key, value] of checks) {
    const wanted = asList(filters?.[key]);
    if (wanted && !wanted.includes(value)) return false;
  }
  return true;
}

const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

function collect(timesheets, status, { from, to, filters, projects, assignments, dayLinesOf, estimate }) {
  const fn = dayLinesOf || timesheetDayLines;
  const ctx = { projectsById: indexById(projects), assignmentsById: indexById(assignments) };
  const f = dateOnly(from);
  const t = dateOnly(to);
  const lines = [];
  const problems = [];
  for (const row of timesheets || []) {
    if (row?.approval_status !== status) continue;
    const res = fn(row, { from: f ?? undefined, to: t ?? undefined, estimate }) || {};
    for (const p of res.problems || []) problems.push({ timesheetId: row.id, employeeId: row.employee_id, projectId: row.project_id, weekStart: dateOnly(row.week_start), ...p });
    for (const raw of res.lines || []) {
      const line = enrich(raw, { ...ctx, row });
      if (!line.date || !inRange(line.date, f, t)) continue;
      if (!matchesFilters(line, filters)) continue;
      lines.push(estimate ? { ...line, estimate: true } : line);
    }
  }
  return { lines, problems };
}

/**
 * Konačne dnevne linije: SAMO odobrene satnice (T09) → timesheetDayLines → linije sa datumom u [from, to].
 * @param {object[]} timesheets redovi `timesheets`
 * @param {{from?:string, to?:string, filters?:object, projects?:object[], assignments?:object[], dayLinesOf?:Function}} opts
 *   filters { projectId, clientId, employeeId, projectRoleId } (vrednost ili niz); projects — za klijenta linije;
 *   assignments — za Job Role kad ga snimak nema (v1).
 * @returns {{lines: object[], problems: object[]}} problem satnice (D11) → ta satnica nema linija, problem se vraća.
 */
export function laborDayLines(timesheets = [], { from = null, to = null, filters = {}, projects = [], assignments = [], dayLinesOf } = {}) {
  return collect(timesheets, "approved", { from, to, filters, projects, assignments, dayLinesOf, estimate: false });
}

/**
 * Procena: `submitted` satnice iz `estimate_days` (tarife po važećim pravilima, ne snimak). Uvek odvojeno, linije
 * nose `estimate: true` i nikad ne ulaze u konačne KPI-jeve (§6.04, T09). Isti opcioni parametri kao laborDayLines.
 */
export function estimateDayLines(timesheets = [], { from = null, to = null, filters = {}, projects = [], assignments = [], dayLinesOf } = {}) {
  return collect(timesheets, "submitted", { from, to, filters, projects, assignments, dayLinesOf, estimate: true });
}

const SIDE_FIELDS = {
  [SIDES.COST]: { rate: "workerRate", coef: "workerCoef", currency: "workerCurrency" },
  [SIDES.REVENUE]: { rate: "clientRate", coef: "clientCoef", currency: "clientCurrency" },
};

/** Ključ grupe zaokruživanja za stranu (project, employee, hour_type, rate, coef, currency). */
function roundingKey(line, side) {
  const f = SIDE_FIELDS[side];
  return [line.projectId, line.employeeId, line.hourType, Number(line[f.rate]), Number(line[f.coef]), normalizeCurrency(line[f.currency])].join("|");
}

/**
 * Iznos strane po pravilu zaokruživanja: grupe → round2(Σhours × rate × coef) → zbir po valuti (u centima).
 * Linija bez tarife ili koeficijenta (npr. maskirana pravom) ne ulazi u iznos i vraća se u `missing`.
 * @returns {{byCurrency: Record<string, number>, missing: object[]}}
 */
export function sideAmount(lines = [], side) {
  const f = SIDE_FIELDS[side];
  if (!f) throw new Error(`Nepoznata strana obračuna: ${side}`);
  const groups = new Map();
  const missing = [];
  for (const line of lines || []) {
    const hours = Number(line.hours) || 0;
    if (hours === 0) continue;
    const rate = numOrNull(line[f.rate]);
    const coef = numOrNull(line[f.coef]);
    if (rate === null || coef === null) {
      missing.push(line);
      continue;
    }
    const key = roundingKey(line, side);
    const g = groups.get(key) || { hoursCents: 0, rate, coef, currency: normalizeCurrency(line[f.currency]) };
    g.hoursCents += Math.round(hours * 100);
    groups.set(key, g);
  }
  const cents = {};
  for (const g of groups.values()) {
    const amount = round2((g.hoursCents / 100) * g.rate * g.coef);
    cents[g.currency] = (cents[g.currency] || 0) + Math.round(amount * 100);
  }
  const byCurrency = {};
  for (const cur of sortCurrencies(Object.keys(cents))) byCurrency[cur] = cents[cur] / 100 || 0;
  return { byCurrency, missing };
}

/** Zbir sati (na 2 decimale, bez float greške). */
export function sumHours(lines = []) {
  return Math.round((lines || []).reduce((acc, l) => acc + Math.round((Number(l.hours) || 0) * 100), 0)) / 100;
}

const GROUP_FIELDS = Object.freeze({
  project: "projectId",
  client: "clientId",
  employee: "employeeId",
  role: "projectRoleId",
  hourType: "hourType",
  assignment: "assignmentId",
  date: "date",
});

/**
 * Agregat po dimenziji: [{key, hours, revenue:{CUR:x}, cost:{CUR:y}}], sortirano po ključu.
 * @param groupBy 'project'|'client'|'employee'|'role'|'hourType'|'assignment'|'date', niz njih, funkcija (line → ključ)
 *   ili null (jedan red, key = null). Za višestruki ključ `key` je niz vrednosti u istom redu.
 * Zaokruživanje je unutar svakog reda po pravilu iz zaglavlja. Za 'project', 'client' i 'employee' zbir redova je
 * tačno zbir perioda; za dimenzije ispod para (projekat, radnik) — uloga, vrsta sati, datum — zbir redova može
 * odstupiti od zbira perioda za cent (isto kao zbir dva perioda, D17).
 */
export function aggregateLabor(lines = [], groupBy = null) {
  const keyOf = typeof groupBy === "function"
    ? groupBy
    : groupBy === null || groupBy === undefined
      ? () => null
      : (() => {
          const dims = (Array.isArray(groupBy) ? groupBy : [groupBy]).map((g) => {
            const field = GROUP_FIELDS[g];
            if (!field) throw new Error(`Nepoznata dimenzija grupisanja: ${g}`);
            return field;
          });
          return dims.length === 1 ? (l) => l[dims[0]] ?? null : (l) => dims.map((d) => l[d] ?? null);
        })();
  const buckets = new Map();
  for (const line of lines || []) {
    const key = keyOf(line);
    const id = JSON.stringify(key ?? null);
    const b = buckets.get(id) || { key: key ?? null, lines: [] };
    b.lines.push(line);
    buckets.set(id, b);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, b]) => {
      const revenue = sideAmount(b.lines, SIDES.REVENUE);
      const cost = sideAmount(b.lines, SIDES.COST);
      return {
        key: b.key,
        hours: sumHours(b.lines),
        revenue: revenue.byCurrency,
        cost: cost.byCurrency,
        missingRevenueRate: revenue.missing.length,
        missingCostRate: cost.missing.length,
      };
    });
}
