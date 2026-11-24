// Fixture za testove finansijskog jezgra: odobrena satnica sa snimkom v2 (oblik timesheet_day_lines iz §2.6 data
// modela, koji upisuje baza i čita timesheetDayLines iz T-A2). Koristi se samo u *.test.js.

import { DAY_FIELDS, addDays } from "../payroll/timesheetDays.js";

/**
 * @param {object} p
 * @param {Array<{i:number, hours:number, code?:string, w?:number, wc?:number, wCur?:string, c?:number, cc?:number, cCur?:string}>} p.days
 *   i = dan u nedelji (0 = ponedeljak); w/c tarife B2C/B2B; wc/cc koeficijenti
 */
export function v2Timesheet({ id, employee_id = "E1", project_id = "P1", assignment_id = "A1", week_start = "2026-11-02", status = "approved", days = [], estimate = false }) {
  const dayHours = [0, 0, 0, 0, 0, 0, 0];
  const lines = days.map((d) => {
    dayHours[d.i] += d.hours;
    return {
      date: addDays(week_start, d.i),
      code: d.code ?? "redovni",
      hours: d.hours,
      worker: { rate: d.w ?? 45, currency: d.wCur ?? "EUR", source: "assignment_rate", ref: "R-W", coef: d.wc ?? 1 },
      client: { rate: d.c ?? 50, currency: d.cCur ?? "EUR", source: "role_rate", ref: "R-C", coef: d.cc ?? 1 },
    };
  });
  const row = {
    id, employee_id, project_id, assignment_id, week_start, approval_status: status,
    ...Object.fromEntries(DAY_FIELDS.map((f, i) => [f, dayHours[i]])),
  };
  if (estimate) row.estimate_days = lines;
  else if (status === "approved") row.rate_snapshot = { version: 2, daily_regular_hours: 8, max_daily_hours: 24, holidays: [], days: lines };
  return row;
}
