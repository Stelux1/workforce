// Osnovni pomoćnici za red nedeljne satnice. Vrste sati, tarife i iznosi su u hours.js, rates.js i timesheetRow.js;
// iznose u bazi računa guard_timesheet (migracija 20261114150000) po istom pravilu.
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
