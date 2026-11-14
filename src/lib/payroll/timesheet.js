// Iznosi jedne nedeljne satnice po današnjem pravilu ekrana (dok Faza 2 ne uvede razvrstavanje sati, D5).
// Isto pravilo sprovodi i baza (guard_timesheet, migracija 20261114120000) — klijent ne može da upiše drugi iznos.
import { round2 } from "./money.js";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Zbir sati po danima; prazno polje = 0. */
export function totalHours(row) {
  return round2(DAYS.reduce((sum, d) => sum + (Number.parseFloat(row?.[`${d}_hours`]) || 0), 0));
}

/** Tarifa > 0 ili null. Tarifa koja fali NIJE 0 (D4/D11) — satnica bez tarife ne sme da se odobri. */
export function validRate(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}

/**
 * Tarife za novi red satnice: prvo dodela na projektu (assigned_employees), pa profil radnika.
 * Vraća { b2c, b2b, missing } — missing je spisak tarifa koje fale (za upozorenje), nikad tiha 0.
 */
export function resolveTimesheetRates(assignment, employee) {
  const b2c = validRate(assignment?.b2c_rate) ?? validRate(employee?.b2c_hourly_rate);
  const b2b = validRate(assignment?.b2b_rate) ?? validRate(employee?.b2b_hourly_rate);
  const missing = [];
  if (b2c === null) missing.push("b2c");
  if (b2b === null) missing.push("b2b");
  return { b2c, b2b, missing };
}

/** Trošak = sati × B2C, prihod = sati × B2B, zarada = prihod − trošak; bez tarife → null (ne 0). */
export function timesheetAmounts(hours, b2c, b2b) {
  const h = round2(hours || 0);
  const cost = validRate(b2c) === null ? null : round2(h * b2c);
  const revenue = validRate(b2b) === null ? null : round2(h * b2b);
  return {
    worker_cost: cost,
    client_revenue: revenue,
    profit: cost === null || revenue === null ? null : round2(revenue - cost),
    overtime_hours: Math.max(0, round2(h - 40)),
  };
}
