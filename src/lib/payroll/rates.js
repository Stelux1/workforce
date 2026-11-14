// Jedan izbor tarife za ceo program (D4). Čiste funkcije: ništa se ne čita iz baze, sve stiže kao ulaz.
//
// Redosled — prvi nivo koji ima tarifu > 0 pobeđuje:
//   radnik (trošak, B2C):  tarifa angažmana (Tarife) → satnica radnika na projektu (assigned_employees.b2c_rate)
//                          → tarifa projekta/pozicije (Tarife) → tarifa radnika (Tarife) → profil (b2c_hourly_rate)
//   klijent (prihod, B2B): tarifa angažmana (Tarife) → satnica radnika na projektu (assigned_employees.b2b_rate)
//                          → tarifa projekta/pozicije (Tarife) → zanimanje na projektu (job_roles.b2b_rate)
//                          → tarifa radnika (Tarife) → profil (b2b_hourly_rate)
//
// Ništa od toga → MissingRateError (nikad 0, D11). Pobednik koji nije EUR po satu → RateUnitError:
// pogrešna tarifa se ne preskače tiho na sledeći nivo, mora da se ispravi.
//
// Isti izbor radi i baza pri odobravanju satnice (resolve_timesheet_rate u
// supabase/migrations/20261114180000_tarifa_pri_odobravanju.sql) i odbija tarifu reda koja nije ova. Svaka promena
// ovde mora i tamo, sa istim primerom u payroll.test.js („isti primer kao pgTAP 04") i u pgTAP testu 04.

import { MissingRateError } from "./monthly.js";
import { validRate } from "./timesheet.js";

export const RATE_SOURCES = Object.freeze({
  ASSIGNMENT_RATE: "assignment_rate",
  PROJECT_EMPLOYEE: "project_employee",
  PROJECT_RATE: "project_rate",
  JOB_ROLE: "job_role",
  EMPLOYEE_RATE: "employee_rate",
  PROFILE: "profile",
});

const S = RATE_SOURCES;

export const RATE_ORDER = Object.freeze({
  worker: Object.freeze([S.ASSIGNMENT_RATE, S.PROJECT_EMPLOYEE, S.PROJECT_RATE, S.EMPLOYEE_RATE, S.PROFILE]),
  client: Object.freeze([S.ASSIGNMENT_RATE, S.PROJECT_EMPLOYEE, S.PROJECT_RATE, S.JOB_ROLE, S.EMPLOYEE_RATE, S.PROFILE]),
});

const SIDES = {
  worker: { kind: "cost", projectField: "b2c_rate", profileField: "b2c_hourly_rate", missingField: "workerRate", label: "radnika" },
  client: { kind: "revenue", projectField: "b2b_rate", profileField: "b2b_hourly_rate", missingField: "clientRate", label: "klijenta" },
};

/** Tarifa koja je pobedila po redosledu, ali nije u EUR po satu — obračun ne sme da je preskoči ni preračuna. */
export class RateUnitError extends Error {
  constructor({ side, source, ref, amount, currency, unit }) {
    super(
      `Tarifa ${SIDES[side]?.label || side} (${source}, ${ref}) je ${amount} ${currency} / ${unit} — obračun prima samo EUR po satu`
    );
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
// Baza ima podrazumevano EUR i po satu (rates.currency/unit not null default) — isto važi za red bez tih polja.
const currencyOf = (row) => row.currency ?? "EUR";
const unitOf = (row) => row.unit ?? "hourly";

/** Red iz Tarifa važi na `date`: aktivan i effective_from ≤ date ≤ effective_to (kraj može biti otvoren). */
function rateEffective(row, date) {
  if (!row) return false;
  if (row.status && row.status !== "active") return false;
  const from = day(row.effective_from);
  if (!from || from > date) return false;
  const to = day(row.effective_to);
  return !to || to >= date;
}

/** Dodela (Tarife i dodele) pokriva `date` i nije otkazana. */
function assignmentCovers(a, date) {
  if (!a || a.status === "cancelled") return false;
  const start = day(a.start_date);
  if (!start || start > date) return false;
  const end = day(a.end_date);
  return !end || end >= date;
}

/**
 * Najnoviji `effective_from` pobeđuje. Konflikt = drugi red istog nivoa sa istim datumom i drugačijom tarifom.
 * Redovi su već filtrirani na tarifu > 0; redosled je stabilan (created_date, pa id) da isti ulaz uvek da isto.
 */
function pickLatest(rows) {
  if (!rows.length) return null;
  const sorted = [...rows].sort(
    (a, b) =>
      day(b.effective_from).localeCompare(day(a.effective_from)) ||
      String(b.created_date || "").localeCompare(String(a.created_date || "")) ||
      String(a.id).localeCompare(String(b.id))
  );
  const best = sorted[0];
  const conflict = sorted.some(
    (r) =>
      r !== best &&
      day(r.effective_from) === day(best.effective_from) &&
      (validRate(r.amount) !== validRate(best.amount) || currencyOf(r) !== currencyOf(best) || unitOf(r) !== unitOf(best))
  );
  return {
    rate: validRate(best.amount),
    ref: best.id,
    conflict,
    amount: best.amount,
    currency: currencyOf(best),
    unit: unitOf(best),
  };
}

/** Prva vrednost > 0 iz liste (JSON polja projekta/profila su uvek EUR po satu). */
function pickFirst(values, ref) {
  const valid = values.map(validRate).filter((v) => v !== null);
  if (!valid.length) return null;
  return { rate: valid[0], ref, conflict: valid.some((v) => v !== valid[0]), amount: valid[0], currency: "EUR", unit: "hourly" };
}

function context({ date, employeeId, project, assignments, rates, employeePrivate }) {
  const d = day(date);
  if (!DATE_RE.test(d)) throw new Error(`Neispravan datum rada: ${date}`);
  if (!employeeId) throw new Error("Nedostaje radnik za izbor tarife");
  const projectId = project?.id || null;

  // Dodele ovog radnika na ovom projektu koje važe tog dana (najnovija prva).
  const covering = projectId
    ? (assignments || [])
        .filter((a) => a?.employee_id === employeeId && a.project_id === projectId && assignmentCovers(a, d))
        .sort((a, b) => day(b.start_date).localeCompare(day(a.start_date)))
    : [];
  const assigned = projectId ? (project.assigned_employees || []).filter((e) => e?.employee_id === employeeId) : [];
  // Pozicija na projektu: iz dodele koja važi tog dana, pa iz spiska radnika na projektu.
  const position = text(covering.find((a) => text(a.position))?.position) || text(assigned.find((e) => text(e.position))?.position);

  const usable = (rates || []).filter((r) => r && rateEffective(r, d) && validRate(r.amount) !== null);

  return { date: d, employeeId, projectId, project, covering, assigned, position, usable, employeePrivate };
}

const LEVELS = {
  [S.ASSIGNMENT_RATE]: (c, side) => {
    const ids = new Set(c.covering.map((a) => a.id));
    return pickLatest(
      c.usable.filter(
        (r) =>
          r.scope === "assignment" &&
          r.kind === side.kind &&
          ids.has(r.assignment_id) &&
          (!r.employee_id || r.employee_id === c.employeeId)
      )
    );
  },
  [S.PROJECT_EMPLOYEE]: (c, side) =>
    pickFirst(
      c.assigned.map((e) => e[side.projectField]),
      `project:${c.projectId}:employee:${c.employeeId}`
    ),
  [S.PROJECT_RATE]: (c, side) => {
    if (!c.projectId) return null;
    const rows = c.usable.filter(
      (r) =>
        r.scope === "project" &&
        r.kind === side.kind &&
        r.project_id === c.projectId &&
        (!r.employee_id || r.employee_id === c.employeeId)
    );
    // Tarifa za poziciju radnika ima prednost nad tarifom za ceo projekat (bez pozicije).
    const forPosition = c.position ? rows.filter((r) => text(r.position) === c.position) : [];
    return pickLatest(forPosition) || pickLatest(rows.filter((r) => !text(r.position)));
  },
  [S.JOB_ROLE]: (c, side) => {
    if (!c.projectId || !c.position) return null;
    const roles = (c.project.job_roles || []).filter((r) => text(r?.title) === c.position);
    return pickFirst(
      roles.map((r) => r[side.projectField]),
      `project:${c.projectId}:job_role:${c.position}`
    );
  },
  [S.EMPLOYEE_RATE]: (c, side) =>
    pickLatest(c.usable.filter((r) => r.scope === "employee" && r.kind === side.kind && r.employee_id === c.employeeId)),
  [S.PROFILE]: (c, side) => pickFirst([c.employeePrivate?.[side.profileField]], `employee:${c.employeeId}:profile`),
};

function resolveWith(c, sideName) {
  const side = SIDES[sideName];
  if (!side) throw new Error(`Nepoznata strana tarife: ${sideName}`);
  for (const source of RATE_ORDER[sideName]) {
    const hit = LEVELS[source](c, side);
    if (!hit) continue;
    if (hit.currency !== "EUR" || hit.unit !== "hourly") {
      throw new RateUnitError({ side: sideName, source, ref: hit.ref, amount: hit.amount, currency: hit.currency, unit: hit.unit });
    }
    return { rate: hit.rate, source, ref: hit.ref, conflict: hit.conflict };
  }
  throw new MissingRateError([{ field: side.missingField, key: `${c.employeeId}|${c.projectId ?? ""}`, date: c.date }]);
}

/**
 * Tarifa jedne strane ("worker" = trošak/B2C, "client" = prihod/B2B) za dan rada.
 * Vraća { rate, source, ref, conflict }; baca MissingRateError ili RateUnitError.
 */
export function resolveSideRate(side, input) {
  return resolveWith(context(input), side);
}

/**
 * Tarife radnika i klijenta za dan rada.
 * @param {object} input
 * @param {string} input.date             dan rada, "YYYY-MM-DD"
 * @param {string} input.employeeId
 * @param {object} [input.project]        { id, job_roles, assigned_employees }
 * @param {Array}  [input.assignments]    redovi project_assignments
 * @param {Array}  [input.rates]          redovi rates
 * @param {object} [input.employeePrivate] { b2c_hourly_rate, b2b_hourly_rate }
 * @returns {{ worker: {rate, source, ref, conflict}, client: {rate, source, ref, conflict} }}
 * @throws {RateUnitError} ako pobednička tarifa nije EUR po satu (ima prednost nad tarifom koja fali)
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
