// Jedan red nedeljne satnice (stranica Satnice): sati po danu, vrste sati, tarife za nacrt i za odobravanje.
// Čiste funkcije nad rates.js (jedan izbor tarife, D4) i hours.js (vrste sati i iznosi, D5) — ništa se ne čita iz baze.
// Iznose u bazi računa guard_timesheet (D16) po istom pravilu; ovde je ono što ekran šalje i pregled za admina.

import { round2 } from "./money.js";
import { MissingRateError } from "./monthly.js";
import { RateUnitError, resolveRates, resolveSideRate } from "./rates.js";
import { classifyWeek, timesheetAmountsByType } from "./hours.js";

export const DAY_FIELDS = Object.freeze(["mon_hours", "tue_hours", "wed_hours", "thu_hours", "fri_hours", "sat_hours", "sun_hours"]);
const DEFAULT_DAILY_THRESHOLD = 8; // isto kao work_rules.daily_regular_hours default i hours.js

/** Sati po danima kao brojevi; prazno polje (ili nešto što nije broj) = 0. Opseg 0–24 proverava baza. */
export function dayHours(row) {
  return Object.fromEntries(
    DAY_FIELDS.map((f) => {
      const n = Number.parseFloat(row?.[f]);
      return [f, Number.isFinite(n) ? round2(n) : 0];
    })
  );
}

/** Dnevni prag iz work_rules (red ili niz redova); bez reda → 8, kao baza. */
export function dailyThresholdOf(workRules) {
  const row = Array.isArray(workRules) ? workRules[0] : workRules;
  const n = Number(row?.daily_regular_hours);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_THRESHOLD;
}

/**
 * Vrste sati reda po classifyWeek (pregled na ekranu; u bazi isto računa guard_timesheet).
 * Neispravan unos (npr. 25 sati u danu, nedelja bez ponedeljka) → null umesto greške, da prikaz ne pukne.
 */
export function hoursByTypeOf(row, { holidays, dailyThreshold } = {}) {
  try {
    return classifyWeek({ weekStart: row?.week_start, dayHours: dayHours(row), holidays, dailyThreshold });
  } catch {
    return null;
  }
}

/**
 * Prekovremeni sati za prikaz (više nije „preko 40h"): hours_by_type koji je izračunala baza; odobren red bez
 * hours_by_type (odobren pre Faze 2) zadržava upisan broj; ostalo pregled po classifyWeek. Neispravan unos → null.
 */
export function overtimeHours(row, rules) {
  const stored = row?.hours_by_type?.prekovremeni;
  if (stored !== undefined && stored !== null && Number.isFinite(Number(stored))) return Number(stored);
  if (row?.approval_status === "approved") return Number(row.overtime_hours) || 0;
  return hoursByTypeOf(row, rules)?.prekovremeni ?? null;
}

/** Greška izbora tarife ili koeficijenta koju ekran prikazuje kao poruku (ne pada). */
export const isMoneyError = (e) => e instanceof MissingRateError || e instanceof RateUnitError;

/**
 * Tarife za nacrt, svaka strana posebno kroz jedan izbor tarife. Nacrt se čuva i kad tarifa fali (null, nikad 0):
 * operater mora da može da upiše sate, a odobravanje bez tarife ionako ne prolazi (baza).
 * @param {object} input  ulaz za resolveRates ({ date, employeeId, project, assignments, rates, employeePrivate })
 * @returns {{ b2c_rate: number|null, b2b_rate: number|null, problems: Error[] }}
 */
export function draftRates(input) {
  const out = { b2c_rate: null, b2b_rate: null, problems: [] };
  for (const [side, field] of [["worker", "b2c_rate"], ["client", "b2b_rate"]]) {
    try {
      out[field] = resolveSideRate(side, input).rate;
    } catch (e) {
      if (!isMoneyError(e)) throw e;
      out.problems.push(e);
    }
  }
  return out;
}

/**
 * Šta admin šalje pri odobravanju reda: tarife iz jedinstvenog izbora za nedelju reda (week_start). Baza pri
 * odobravanju ponovo bira tarifu po istom redosledu (resolve_timesheet_rate) i odbija red čija tarifa nije ta;
 * ceo snimak (izvor i oznaka tarife, koeficijenti, posebne satnice, prag, praznici) upisuje baza. Uz to vraća
 * pregled iznosa — isti obračun koji će baza upisati.
 * @param {object} input
 * @param {object} input.row             red satnice (employee_id, week_start, mon_hours … sun_hours)
 * @param {object} [input.project]       projekat reda ({ id, assigned_employees, job_roles })
 * @param {Array}  [input.assignments]   redovi project_assignments
 * @param {Array}  [input.rates]         redovi rates
 * @param {object} [input.employeePrivate] profil radnika (b2c/b2b satnica, posebne satnice)
 * @param {Array}  input.hourTypes       redovi hour_types
 * @param {Array}  [input.holidays]      praznici
 * @param {number} [input.dailyThreshold] work_rules.daily_regular_hours
 * @returns {{ data: { approval_status: "approved", b2c_rate: number, b2b_rate: number }, hoursByType: object, amounts: object }}
 * @throws {MissingRateError|RateUnitError} tarifa koja fali ili nije EUR po satu
 * @throws {MissingCoefficientError} koeficijent koji fali za vrstu sa satima
 */
export function approvalPayload({ row, project, assignments, rates, employeePrivate, hourTypes, holidays, dailyThreshold }) {
  const resolved = resolveRates({
    date: row?.week_start,
    employeeId: row?.employee_id,
    project,
    assignments,
    rates,
    employeePrivate,
  });
  const hoursByType = classifyWeek({ weekStart: row.week_start, dayHours: dayHours(row), holidays, dailyThreshold });
  const amounts = timesheetAmountsByType({
    hoursByType,
    workerRate: resolved.worker,
    clientRate: resolved.client,
    hourTypes,
    employeePrivate,
  });
  return {
    data: {
      approval_status: "approved",
      b2c_rate: resolved.worker.rate,
      b2b_rate: resolved.client.rate,
    },
    hoursByType,
    amounts,
  };
}

/**
 * Pregled iznosa reda za admina (dijalog unosa): vrste sati + timesheetAmountsByType.
 * Ne baca: koeficijent ili tarifa koja fali vraća se kao `error` (MissingCoefficientError / MissingRateError).
 * @returns {{ hoursByType: object|null, amounts: object|null, error: Error|null }}
 */
export function previewAmounts({ row, workerRate, clientRate, hourTypes, holidays, dailyThreshold, employeePrivate }) {
  const hoursByType = hoursByTypeOf(row, { holidays, dailyThreshold });
  if (!hoursByType) return { hoursByType: null, amounts: null, error: null };
  try {
    return {
      hoursByType,
      amounts: timesheetAmountsByType({ hoursByType, workerRate, clientRate, hourTypes, employeePrivate }),
      error: null,
    };
  } catch (error) {
    if (!isMoneyError(error)) throw error;
    return { hoursByType, amounts: null, error };
  }
}
