// Jedan izbor tarife za ceo program (D4, Teamora spec §5, docs/TEAMORA-DATA-MODEL.md §2.5). Čiste funkcije: ništa se
// ne čita iz baze, sve stiže kao ulaz.
//
// Redosled — ista za radnika (trošak, B2C) i klijenta (prihod, B2B); prvi nivo koji ima tarifu > 0 pobeđuje:
//   1. assignment_rate  tarifa angažmana (rates scope 'assignment' na dodeli koja važi tog dana) — izuzetak po angažmanu
//   2. role_rate        tarifa Job Role na projektu (rates scope 'project' sa project_role_id dodele)
//   3. project_rate     tarifa za ceo projekat (scope 'project', bez Job Role i bez pozicije) — stari podaci
//   4. employee_rate    tarifa radnika (scope 'employee') — stari podaci; ekran više ne nudi nov unos
// Spisak radnika projekta (assigned_employees), zanimanja (job_roles) i profil radnika više nisu izvor tarife
// (migracija 20261125030000 ih je prenela u rates; D30 K5).
//
// Unutar nivoa pobeđuje najnoviji effective_from (pa najnoviji created_date, pa id) — baza (rates_no_overlap) ne
// dozvoljava dve aktivne tarife istog ključa u istom periodu. Ništa → MissingRateError (nikad 0, D11). Pobednik
// koji nije po satu → RateUnitError (ne preskače se tiho). Valuta je dozvoljena (K3): rezultat nosi `currency`.
//
// Isto bira baza: public.resolve_rate (supabase/migrations/20261125030000_angazmani_tarife.sql). Primer „T07" je isti
// u src/lib/payroll/rateHistory.test.js i u supabase/tests/23_tarife_istorija.test.sql.

import { MissingRateError } from "./monthly.js";
import { validRate } from "./timesheet.js";

export const RATE_SOURCES = Object.freeze({
  ASSIGNMENT_RATE: "assignment_rate",
  ROLE_RATE: "role_rate",
  PROJECT_RATE: "project_rate",
  EMPLOYEE_RATE: "employee_rate",
});

const S = RATE_SOURCES;
const ORDER = Object.freeze([S.ASSIGNMENT_RATE, S.ROLE_RATE, S.PROJECT_RATE, S.EMPLOYEE_RATE]);

export const RATE_ORDER = Object.freeze({ worker: ORDER, client: ORDER });

const SIDES = {
  worker: { kind: "cost", missingField: "workerRate", label: "radnika" },
  client: { kind: "revenue", missingField: "clientRate", label: "klijenta" },
};

/** Tarifa koja je pobedila po redosledu, ali nije po satu — obračun ne sme da je preskoči ni preračuna. */
export class RateUnitError extends Error {
  constructor({ side, source, ref, amount, currency, unit }) {
    super(`Tarifa ${SIDES[side]?.label || side} (${source}, ${ref}) je ${amount} ${currency} / ${unit} — obračun prima samo tarifu po satu`);
    this.name = "RateUnitError";
    this.side = side;
    this.source = source;
    this.ref = ref;
    this.amount = amount;
    this.currency = currency;
    this.unit = unit;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v) => (v ? String(v).slice(0, 10) : "");
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());
// Poređenje kao `collate "C"` u bazi (uuid-ovi su ASCII).
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const currencyOf = (row) => row.currency ?? "EUR";
const unitOf = (row) => row.unit ?? "hourly";

/** Red iz Tarifa važi na `date`: aktivan, iznos > 0 i effective_from ≤ date ≤ effective_to (kraj može biti otvoren). */
export function rateEffective(row, date) {
  if (!row || (row.status && row.status !== "active")) return false;
  if (validRate(row.amount) === null) return false;
  const from = day(row.effective_from);
  if (!from || from > date) return false;
  const to = day(row.effective_to);
  return !to || to >= date;
}

/** Dodela pokriva `date` i nije otkazana. */
export function assignmentCovers(a, date) {
  if (!a || a.status === "cancelled") return false;
  const start = day(a.start_date);
  if (!start || start > date) return false;
  const end = day(a.end_date);
  return !end || end >= date;
}

/**
 * Dodela koja važi za radnika na projektu tog dana: zadata (`assignmentId`) ako pokriva datum, inače ne-otkazana
 * koja pokriva datum — najnoviji početak, pa id (kao resolve_rate).
 */
export function coveringAssignment({ date, employeeId, projectId, assignmentId, assignments }) {
  const d = day(date);
  if (!projectId) return null;
  const list = (assignments || []).filter(
    (a) => a?.employee_id === employeeId && a.project_id === projectId && assignmentCovers(a, d)
  );
  list.sort(
    (a, b) =>
      Number(b.id === assignmentId) - Number(a.id === assignmentId) ||
      day(b.start_date).localeCompare(day(a.start_date)) ||
      cmp(String(a.id), String(b.id))
  );
  return list[0] || null;
}

/** Najnoviji effective_from pobeđuje; konflikt = drugi red sa istim datumom i drugačijom tarifom. */
function pickLatest(rows) {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      day(b.effective_from).localeCompare(day(a.effective_from)) ||
      String(b.created_date || "").localeCompare(String(a.created_date || "")) ||
      cmp(String(a.id), String(b.id))
  );
  const best = sorted[0];
  const conflict = sorted.some(
    (r) =>
      r !== best &&
      day(r.effective_from) === day(best.effective_from) &&
      (validRate(r.amount) !== validRate(best.amount) || currencyOf(r) !== currencyOf(best) || unitOf(r) !== unitOf(best))
  );
  return { row: best, conflict };
}

function context(input) {
  const { date, employeeId, assignmentId, assignments, rates } = input || {};
  const d = day(date);
  if (!DATE_RE.test(d)) throw new Error(`Neispravan datum rada: ${date}`);
  if (!employeeId) throw new Error("Nedostaje radnik za izbor tarife");
  const projectId = input.projectId ?? input.project?.id ?? null;
  const assignment = coveringAssignment({ date: d, employeeId, projectId, assignmentId, assignments });
  const usable = (rates || []).filter((r) => rateEffective(r, d));
  return { date: d, employeeId, projectId, assignment, usable };
}

const forEmployee = (r, employeeId) => !r.employee_id || r.employee_id === employeeId;

const LEVELS = {
  [S.ASSIGNMENT_RATE]: (c, kind) =>
    c.assignment ? pickLatest(c.usable.filter((r) => r.scope === "assignment" && r.kind === kind && r.assignment_id === c.assignment.id)) : null,
  [S.ROLE_RATE]: (c, kind) => {
    const role = c.assignment?.project_role_id;
    if (!role) return null;
    return pickLatest(
      c.usable.filter(
        (r) => r.scope === "project" && r.kind === kind && r.project_id === c.projectId && r.project_role_id === role && forEmployee(r, c.employeeId)
      )
    );
  },
  [S.PROJECT_RATE]: (c, kind) => {
    if (!c.projectId) return null;
    return pickLatest(
      c.usable.filter(
        (r) =>
          r.scope === "project" && r.kind === kind && r.project_id === c.projectId && !r.project_role_id && !text(r.position) && forEmployee(r, c.employeeId)
      )
    );
  },
  [S.EMPLOYEE_RATE]: (c, kind) => pickLatest(c.usable.filter((r) => r.scope === "employee" && r.kind === kind && r.employee_id === c.employeeId)),
};

function resolveWith(c, sideName) {
  const side = SIDES[sideName];
  if (!side) throw new Error(`Nepoznata strana tarife: ${sideName}`);
  for (const source of ORDER) {
    const hit = LEVELS[source](c, side.kind);
    if (!hit) continue;
    const { row, conflict } = hit;
    if (unitOf(row) !== "hourly") {
      throw new RateUnitError({ side: sideName, source, ref: row.id, amount: row.amount, currency: currencyOf(row), unit: unitOf(row) });
    }
    return {
      rate: validRate(row.amount),
      currency: currencyOf(row),
      source,
      ref: row.id,
      conflict,
      assignmentId: c.assignment?.id ?? null,
      projectRoleId: c.assignment?.project_role_id ?? null,
    };
  }
  throw new MissingRateError([{ field: side.missingField, key: `${c.employeeId}|${c.projectId ?? ""}`, date: c.date }]);
}

/**
 * Tarifa jedne strane ("worker" = trošak/B2C, "client" = prihod/B2B) za dan rada.
 * @param {"worker"|"client"} side
 * @param {object} input  { date, employeeId, projectId, assignmentId?, assignments, rates }
 * @returns {{ rate, currency, source, ref, conflict, assignmentId, projectRoleId }}
 * @throws {MissingRateError|RateUnitError}
 */
export function resolveSideRate(side, input) {
  return resolveWith(context(input), side);
}

/**
 * Tarife radnika i klijenta za dan rada.
 * @param {object} input
 * @param {string} input.date             dan rada, "YYYY-MM-DD"
 * @param {string} input.employeeId
 * @param {string} [input.projectId]      (ili `project.id`)
 * @param {string} [input.assignmentId]   dodela satnice, ako je poznata
 * @param {Array}  [input.assignments]    redovi project_assignments
 * @param {Array}  [input.rates]          redovi rates
 * @returns {{ worker: object, client: object }}
 * @throws {RateUnitError} pobednička tarifa nije po satu (ima prednost nad tarifom koja fali)
 * @throws {MissingRateError} sa `missing` za stranu (ili obe) bez tarife
 */
export function resolveRates(input) {
  const c = context(input);
  const out = {};
  const missing = [];
  for (const side of ["worker", "client"]) {
    try {
      out[side] = resolveWith(c, side);
    } catch (e) {
      if (e instanceof MissingRateError) missing.push(...e.missing);
      else throw e;
    }
  }
  if (missing.length) throw new MissingRateError(missing);
  return out;
}

/**
 * Nivo reda iz Tarifa (za prikaz u Rate History): assignment_rate | role_rate | project_rate | employee_rate.
 * Stari red projekta sa pozicijom bez Job Role je `project_rate` sa pozicijom (izbor ga ne koristi).
 */
export function rateLevel(row) {
  if (row?.scope === "assignment") return S.ASSIGNMENT_RATE;
  if (row?.scope === "employee") return S.EMPLOYEE_RATE;
  return row?.project_role_id ? S.ROLE_RATE : S.PROJECT_RATE;
}

/**
 * Tarifa reda koja važi na datum (ili null): za prikaz B2B Job Role, B2C dodele i sl.
 * @param {Array} rates  redovi rates
 * @param {(row) => boolean} match
 * @param {string} date  "YYYY-MM-DD"
 */
export function currentRate(rates, match, date) {
  const hit = pickLatest((rates || []).filter((r) => match(r) && rateEffective(r, day(date))));
  return hit ? hit.row : null;
}
