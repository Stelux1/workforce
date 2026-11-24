import { describe, expect, it } from "vitest";
import { round2, sum2 } from "./money.js";
import { classifyWeek, timesheetAmountsByType } from "./hours.js";
import {
  DAY_PROBLEM, dailyLimitViolations, dailyTotals, dayInterval, entryHours, overlappingEntries, overlaps, snapshotVersion,
  timesheetDayLines,
} from "./timesheetDays.js";
import { PROBLEM, timesheetMonthLines } from "./payrollMonth.js";
import { canApprove, canSubmit, estimateTotals, groupedProblems, rateDays } from "./timesheetRow.js";

// Isti primer kao supabase/tests/24_satnice_po_danu.test.sql: nedelja od pon 6.3.2034, radnik na dva projekta,
// tarifa radnika 10 € do utorka i 12 € od srede (dodela A1), klijent 20 €, redovni koeficijent 1,0.
const WEEK = "2034-03-06";
const day = (i) => ["2034-03-06", "2034-03-07", "2034-03-08", "2034-03-09", "2034-03-10", "2034-03-11", "2034-03-12"][i];
const workerRateOn = (date) => (date >= "2034-03-08" ? 12 : 10);

/** v2 dnevna linija istog oblika koji upisuje baza (timesheet_day_lines). */
function v2Day(date, hours, { code = "redovni", w = workerRateOn(date), c = 20, currency = "EUR" } = {}) {
  return {
    date, code, hours,
    worker: { rate: w, currency, source: "assignment_rate", ref: "r-w", coef: 1 },
    client: { rate: c, currency, source: "role_rate", ref: "r-c", coef: 1 },
    worker_cost: round2(hours * w), client_revenue: round2(hours * c),
  };
}

function approvedV2(days, extra = {}) {
  const hours = [0, 0, 0, 0, 0, 0, 0];
  for (const d of days) hours[[0, 1, 2, 3, 4, 5, 6].find((i) => day(i) === d.date)] += d.hours;
  return {
    id: "TS-1", employee_id: "E1", project_id: "P1", assignment_id: "A1", week_start: WEEK, approval_status: "approved",
    mon_hours: hours[0], tue_hours: hours[1], wed_hours: hours[2], thu_hours: hours[3], fri_hours: hours[4], sat_hours: hours[5], sun_hours: hours[6],
    rate_snapshot: { version: 2, daily_regular_hours: 8, max_daily_hours: 24, holidays: [], days },
    ...extra,
  };
}

describe("dnevne linije satnice (timesheetDays.js)", () => {
  it("T07 tarifa se menja u sredu: dve tarife po danu, iznos = zbir po danu (isti primer kao pgTAP 24)", () => {
    const row = approvedV2([0, 1, 2, 3, 4].map((i) => v2Day(day(i), 8)));
    const r = timesheetDayLines(row);
    expect(r.problems).toEqual([]);
    expect(r.lines.map((l) => [l.date, l.workerRate, l.clientRate])).toEqual([
      ["2034-03-06", 10, 20], ["2034-03-07", 10, 20], ["2034-03-08", 12, 20], ["2034-03-09", 12, 20], ["2034-03-10", 12, 20],
    ]);
    // 2 × 8 × 10 + 3 × 8 × 12 = 160 + 288 = 448; prihod 5 × 8 × 20 = 800
    expect(sum2(r.lines.map((l) => l.hours * l.workerRate * l.workerCoef))).toBe(448);
    expect(sum2(r.lines.map((l) => l.hours * l.clientRate * l.clientCoef))).toBe(800);
    expect(r.lines[0]).toMatchObject({
      projectId: "P1", employeeId: "E1", assignmentId: "A1", hourType: "redovni", workerCurrency: "EUR", clientCurrency: "EUR",
      timesheetId: "TS-1", weekStart: WEEK, workerSource: "assignment_rate",
    });
    expect(rateDays(row).map((d) => d.workerRate)).toEqual([10, 10, 12, 12, 12]);
  });

  it("opseg datuma: samo dani u [from, to]; `days` su dani sa satima u opsegu", () => {
    const row = approvedV2([0, 1, 2, 3, 4].map((i) => v2Day(day(i), 8)));
    const r = timesheetDayLines(row, { from: "2034-03-08", to: "2034-03-09" });
    expect(r.days).toEqual(["2034-03-08", "2034-03-09"]);
    expect(r.lines.map((l) => l.date)).toEqual(["2034-03-08", "2034-03-09"]);
  });

  it("T09 poslata i odbijena satnica nemaju konačne linije; procena je odvojena (estimate_days)", () => {
    const days = [v2Day(day(0), 8)];
    for (const status of ["draft", "submitted", "rejected"]) {
      const row = { ...approvedV2(days), approval_status: status, rate_snapshot: null, estimate_days: days };
      expect(timesheetDayLines(row).lines).toEqual([]);
      expect(timesheetDayLines(row).problems).toEqual([]);
    }
    const submitted = { ...approvedV2(days), approval_status: "submitted", rate_snapshot: null, estimate_days: days };
    expect(timesheetDayLines(submitted, { estimate: true }).lines.map((l) => l.workerRate)).toEqual([10]);
    expect(estimateTotals(submitted)).toEqual({ workerCost: 80, clientRevenue: 160, workerCurrency: "EUR", clientCurrency: "EUR" });
    expect(timesheetDayLines({ ...submitted, estimate_days: null }, { estimate: true }).problems).toEqual([{ code: DAY_PROBLEM.NO_ESTIMATE }]);
  });

  it("procena bez prava na novac (maska baze) nema iznosa", () => {
    const masked = { ...v2Day(day(0), 8), worker: null, worker_cost: null };
    const row = { ...approvedV2([masked]), approval_status: "submitted", estimate_days: [masked], rate_snapshot: null };
    expect(estimateTotals(row)).toEqual({ workerCost: null, clientRevenue: 160, workerCurrency: null, clientCurrency: "EUR" });
  });

  it("v2 snimak čiji sati ne odgovaraju redu → problem, bez linija", () => {
    const row = { ...approvedV2([v2Day(day(0), 8)]), mon_hours: 9 };
    expect(timesheetDayLines(row)).toMatchObject({ lines: [], problems: [{ code: DAY_PROBLEM.SNAPSHOT_MISMATCH }] });
  });

  it("odobren red bez snimka i bez projekta → problem (nikad tiho 0)", () => {
    const base = approvedV2([v2Day(day(0), 8)]);
    expect(timesheetDayLines({ ...base, rate_snapshot: null }).problems).toEqual([{ code: DAY_PROBLEM.NO_SNAPSHOT }]);
    expect(timesheetDayLines({ ...base, project_id: null }).problems).toEqual([{ code: DAY_PROBLEM.NO_PROJECT }]);
    expect(snapshotVersion(null)).toBeNull();
    expect(snapshotVersion({ lines: [] })).toBe(1);
    expect(snapshotVersion({ version: 2 })).toBe(2);
  });

  it("v1 snimak (odobreno ranije): ista podela po danu i isti iznosi kao pre (D10)", () => {
    // pon 10h, sub 8h, prag 8: 8 redovno + 2 prekovremeno + 8 vikend; tarife 12 / 20.
    const TYPES = [
      { code: "redovni", worker_coef: 1, client_coef: 1 },
      { code: "prekovremeni", worker_coef: 1.5, client_coef: 1.6 },
      { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
    ];
    const days = [10, 0, 0, 0, 0, 8, 0];
    const hbt = classifyWeek({ weekStart: WEEK, dayHours: days, holidays: [], dailyThreshold: 8 });
    const a = timesheetAmountsByType({ hoursByType: hbt, workerRate: 12, clientRate: 20, hourTypes: TYPES });
    const row = {
      id: "V1", employee_id: "E1", project_id: "P1", week_start: WEEK, approval_status: "approved",
      mon_hours: 10, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 0, sat_hours: 8, sun_hours: 0,
      rate_snapshot: { worker: { rate: 12 }, client: { rate: 20 }, daily_regular_hours: 8, holidays: [], lines: a.lines },
    };
    const r = timesheetDayLines(row);
    expect(r.lines.map((l) => [l.date, l.hourType, l.hours, l.workerRate, l.workerCoef, l.clientCoef, l.workerCurrency])).toEqual([
      ["2034-03-06", "redovni", 8, 12, 1, 1, "EUR"],
      ["2034-03-06", "prekovremeni", 2, 12, 1.5, 1.6, "EUR"],
      ["2034-03-11", "vikend", 8, 12, 1.3, 1.4, "EUR"],
    ]);
    const cost = sum2(r.lines.map((l) => round2(l.hours * l.workerRate * l.workerCoef)));
    expect(cost).toBe(a.worker_cost); // 96 + 36 + 124,80 = 256,80
    expect(cost).toBe(256.8);
  });

  it("mesečni obračun: tarifa u drugoj valuti → rate_not_eur (srpski obračun prima samo EUR)", () => {
    const row = approvedV2([v2Day(day(0), 8, { currency: "GBP" })]);
    const r = timesheetMonthLines(row, "2034-03-01");
    expect(r.lines).toEqual([]);
    expect(r.problems).toEqual([{ code: PROBLEM.RATE_NOT_EUR, currencies: ["GBP"] }]);
    expect(timesheetMonthLines(approvedV2([v2Day(day(0), 8)]), "2034-03-01").lines).toHaveLength(1);
  });
});

describe("intervali rada i dnevni zbir (T10)", () => {
  it("T10 dva projekta istog dana 4 h + 4 h bez preklapanja prolaze (isti primer kao pgTAP 24)", () => {
    const a = { employee_id: "E1", work_date: "2034-03-13", start_time: "08:00", end_time: "12:00" };
    const b = { employee_id: "E1", work_date: "2034-03-13", start_time: "12:00", end_time: "16:00" };
    expect(overlaps(a, b)).toBe(false); // kraj jednog = početak drugog
    expect([entryHours(a), entryHours(b)]).toEqual([4, 4]);
    expect(overlappingEntries([a, b])).toEqual([]);
    const rows = [
      { id: "X", employee_id: "E1", project_id: "P1", week_start: "2034-03-13", mon_hours: 4, approval_status: "draft" },
      { id: "Y", employee_id: "E1", project_id: "P2", week_start: "2034-03-13", mon_hours: 4, approval_status: "draft" },
    ];
    expect(dailyTotals(rows)).toEqual([{ employeeId: "E1", date: "2034-03-13", hours: 8, projectIds: ["P1", "P2"], timesheetIds: ["X", "Y"] }]);
    expect(dailyLimitViolations(rows, 24)).toEqual([]);
  });

  it("T10 preklopljeni intervali 08–12 i 11–15 su odbijeni", () => {
    const a = { employee_id: "E1", work_date: "2034-03-14", start_time: "08:00", end_time: "12:00" };
    const b = { employee_id: "E1", work_date: "2034-03-14", start_time: "11:00", end_time: "15:00" };
    expect(overlaps(a, b)).toBe(true);
    expect(overlappingEntries([a, b])).toHaveLength(1);
    // odbijena satnica ne učestvuje (counts = false), drugi radnik ne smeta
    expect(overlappingEntries([a, { ...b, counts: false }])).toEqual([]);
    expect(overlappingEntries([a, { ...b, employee_id: "E2" }])).toEqual([]);
  });

  it("T10 zbir 14 + 12 h u danu je odbijen (maksimum 24 h)", () => {
    const rows = [
      { id: "X", employee_id: "E1", project_id: "P1", week_start: "2034-03-13", wed_hours: 14, approval_status: "draft" },
      { id: "Y", employee_id: "E1", project_id: "P2", week_start: "2034-03-13", wed_hours: 12, approval_status: "submitted" },
    ];
    expect(dailyLimitViolations(rows, 24)).toMatchObject([{ date: "2034-03-15", hours: 26 }]);
    // odbijena satnica se ne broji
    expect(dailyLimitViolations([rows[0], { ...rows[1], approval_status: "rejected" }], 24)).toEqual([]);
  });

  it("noćna smena prelazi ponoć; pauza se oduzima; bez vremena važe upisani sati", () => {
    const night = { work_date: "2034-03-15", start_time: "22:00", end_time: "06:00", break_minutes: 30 };
    const iv = dayInterval(night);
    expect(iv.end - iv.start).toBe(8 * 60);
    expect(entryHours(night)).toBe(7.5);
    expect(overlaps(night, { work_date: "2034-03-16", start_time: "05:00", end_time: "09:00" })).toBe(true);
    expect(dayInterval({ work_date: "2034-03-15", hours: 3 })).toBeNull();
    expect(entryHours({ work_date: "2034-03-15", hours: 3 })).toBe(3);
    expect(dayInterval({ work_date: "2034-03-15", start_time: "25:00", end_time: "06:00" })).toBeNull();
  });
});

describe("problemi obračuna reda (calc_problems)", () => {
  it("Submit traži dodelu i dane u njenom opsegu; odobravanje traži red bez problema", () => {
    expect(canSubmit({ calc_problems: null })).toBe(true);
    expect(canSubmit({ calc_problems: [{ code: "assignment_missing" }] })).toBe(false);
    expect(canSubmit({ calc_problems: [{ code: "rate_missing", side: "worker", date: "2034-03-06" }] })).toBe(true);
    expect(canApprove({ calc_problems: [{ code: "rate_missing", side: "worker", date: "2034-03-06" }] })).toBe(false);
    expect(canApprove({ calc_problems: null })).toBe(true);
  });

  it("isti problem na više dana se prikazuje jednom sa spiskom datuma", () => {
    const row = { calc_problems: [
      { code: "rate_missing", side: "worker", date: "2034-03-07" },
      { code: "rate_missing", side: "worker", date: "2034-03-06" },
      { code: "rate_missing", side: "client", date: "2034-03-06" },
    ] };
    expect(groupedProblems(row)).toEqual([
      { code: "rate_missing", side: "worker", detail: null, dates: ["2034-03-06", "2034-03-07"] },
      { code: "rate_missing", side: "client", detail: null, dates: ["2034-03-06"] },
    ]);
  });
});
