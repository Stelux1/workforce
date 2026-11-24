import { describe, expect, it } from "vitest";
import { round2 } from "./money.js";
import { projectMargin } from "./monthly.js";
import { classifyWeek, timesheetAmountsByType } from "./hours.js";
import { DAY_FIELDS } from "./timesheetRow.js";
import { LABOR_SOURCE, projectFinancialReport, REPORT_PROBLEM, reportProblemMessage } from "./projectReport.js";
import { payrollDue, projectFinancials } from "./reports.js";

// Odobrena satnica sa snimkom (rate_snapshot) kakav upisuje guard_timesheet — isti postupak kao u payroll.test.js.
const KOEF = [
  { code: "redovni", worker_coef: 1, client_coef: 1 },
  { code: "prekovremeni", worker_coef: 1.5, client_coef: 1.6 },
  { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
  { code: "praznik", worker_coef: 2, client_coef: 2.2 },
];
function odobrena({ id, employee_id = "E1", employee_name = "QA Radnik 1", project_id = "PA", project = "QA Hala A", week_start, days: pocetak, b2c = 12, b2b = 20, threshold = 8, holidays = [], status = "approved" }) {
  const days = Array.from({ length: 7 }, (_, i) => pocetak[i] ?? 0); // pon–ned, dani koji nisu navedeni = 0
  const row = {
    id, employee_id, employee_name, project_id, project, week_start, approval_status: status, b2c_rate: b2c, b2b_rate: b2b,
    ...Object.fromEntries(DAY_FIELDS.map((f, i) => [f, days[i]])),
    total_hours: round2(days.reduce((a, b) => a + b, 0)),
  };
  const hbt = classifyWeek({ weekStart: week_start, dayHours: days, holidays, dailyThreshold: threshold });
  const a = timesheetAmountsByType({ hoursByType: hbt, workerRate: b2c, clientRate: b2b, hourTypes: KOEF });
  row.hours_by_type = hbt;
  row.worker_cost = a.worker_cost;
  row.client_revenue = a.client_revenue;
  row.profit = round2(a.client_revenue - a.worker_cost);
  row.rate_snapshot = { worker: { rate: b2c }, client: { rate: b2b }, daily_regular_hours: threshold, holidays, lines: a.lines.map((l) => ({ ...l, special_rate: null })) };
  return row;
}

// Mart 2026: E1 pon 8h (96 / 160), E2 pon 8h + uto 10h (16 redovno + 2 prekovremeno: 228 / 384).
const T1 = odobrena({ id: "T1", week_start: "2026-03-02", days: [8] });
const T2 = odobrena({ id: "T2", employee_id: "E2", employee_name: "QA Radnik 2", week_start: "2026-03-09", days: [8, 10] });
const TROSKOVI = [
  { id: "C1", project_id: "PA", amount: 100, currency: "EUR", eur_amount: 100 },
  { id: "C2", project_id: "PA", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100, fx_rate_date: "2026-04-01" },
  { id: "C3", project_id: "PA", amount: 5000, currency: "RSD", eur_rsd_rate: null, eur_amount: null }, // bez kursa
  { id: "C4", project_id: "PB", amount: 999, currency: "EUR", eur_amount: 999 }, // drugi projekat
];
const report = (o) => projectFinancialReport({ projectId: "PA", costs: TROSKOVI, runs: [], payslips: [], payslipProjects: [], ...o });

describe("finansijski izveštaj projekta (projectReport.js)", () => {
  it("Accept: ostaje nama = projectMargin(prihod, trošak radnika, troškovi u EUR)", () => {
    expect([T1.worker_cost, T1.client_revenue, T2.worker_cost, T2.client_revenue]).toEqual([96, 160, 228, 384]);
    const nacrt = odobrena({ id: "N1", week_start: "2026-03-16", days: [8], status: "submitted" });
    const drugi = odobrena({ id: "X1", project_id: "PB", week_start: "2026-03-02", days: [8] });
    const r = report({ timesheets: [T1, T2, nacrt, drugi] });

    // prihod 160 + 384 = 544; trošak 96 + 228 = 324 (procena); troškovi 100 + 11.720 RSD / 117,2 = 200 (5.000 RSD bez kursa nije oduzet)
    expect(r.totals).toMatchObject({ hours: 26, count: 2, revenue: 544, laborCost: 324, estimatedLaborCost: 324, payrollLaborCost: 0, otherCosts: 200 });
    expect(r.totals.remaining).toBe(20);
    const m = projectMargin({ revenue: 544, laborCost: 324, otherCosts: 200 });
    expect([r.totals.remaining, r.totals.marginPct]).toEqual([m.remaining, m.marginPct]);
    expect(r.totals.laborDifference).toBe(220);
    expect(r.costs).toEqual({ count: 3, eur: 200, fromRsd: { amount: 11720, eur: 100 }, missingRsd: 5000 });
    expect(r.pending).toEqual({ count: 1, hours: 8 });
    expect(r.problems).toEqual([]);

    // Bez obračuna i bez nedelje preko meseca ukupno je isto kao Izveštaji o platama (reports.js → projectFinancials).
    const pf = projectFinancials([T1, T2], TROSKOVI.filter((c) => c.project_id === "PA"));
    expect([r.totals.revenue, r.totals.laborCost, r.totals.otherCosts, r.totals.remaining]).toEqual([pf.revenue, pf.workerCost, pf.costsEUR, pf.profit]);
  });

  it("mesec bez odobrenog obračuna je procena iz satnica", () => {
    const r = report({ timesheets: [T1, T2] });
    expect(r.months).toEqual([
      { month: "2026-03-01", runStatus: null, laborSource: LABOR_SOURCE.ESTIMATE, estimate: true, hours: 26, revenue: 544, laborCost: 324, difference: 220 },
    ]);
    expect(r.totals.hasEstimate).toBe(true);
    expect(r.employees.map((e) => [e.id, e.name, e.hours, e.revenue, e.laborCost, e.estimate])).toEqual([
      ["E2", "QA Radnik 2", 18, 384, 228, true],
      ["E1", "QA Radnik 1", 8, 160, 96, true],
    ]);
  });

  it("Accept: preimenovanje projekta ne menja brojke (grupiše se samo po project_id)", () => {
    const pre = report({ timesheets: [T1, T2] });
    // Isti ID, drugo ime u snimku satnice; drugi projekat sa STARIM imenom se ne spaja.
    const preimenovan = [T1, T2].map((ts) => ({ ...ts, project: "QA Hala A — novo ime" }));
    const istoIme = odobrena({ id: "X2", project_id: "PB", project: "QA Hala A", week_start: "2026-03-02", days: [8] });
    expect(report({ timesheets: [...preimenovan, istoIme] })).toEqual(pre);
  });

  it("mesec sa odobrenim obračunom: trošak radnika = bruto 2 iz payslip_projects, ne procena iz satnica", () => {
    const T3 = odobrena({ id: "T3", week_start: "2026-04-06", days: [8] }); // april: 96 / 160
    const runs = [
      { id: "R3", month: "2026-03-01", status: "approved" },
      { id: "R4", month: "2026-04-01", status: "draft" },
    ];
    const payslips = [
      { id: "S1", run_id: "R3", employee_id: "E1", employee_name: "QA Radnik 1" },
      { id: "S2", run_id: "R3", employee_id: "E2", employee_name: "QA Radnik 2" },
      { id: "S3", run_id: "R4", employee_id: "E1", employee_name: "QA Radnik 1" },
    ];
    const payslipProjects = [
      { payslip_id: "S1", project_id: "PA", hours: 8, worker_amount: 96, labor_cost: 157.45, revenue: 160 },
      { payslip_id: "S1", project_id: "PB", hours: 4, worker_amount: 48, labor_cost: 78.72, revenue: 80 }, // drugi projekat
      { payslip_id: "S2", project_id: "PA", hours: 18, worker_amount: 228, labor_cost: 373.97, revenue: 384 },
      { payslip_id: "S3", project_id: "PA", hours: 8, worker_amount: 96, labor_cost: 157.45, revenue: 160 }, // nacrt → ne važi
    ];
    const r = report({ timesheets: [T1, T2, T3], runs, payslips, payslipProjects });

    expect(r.months).toEqual([
      { month: "2026-03-01", runStatus: "approved", laborSource: LABOR_SOURCE.PAYROLL, estimate: false, hours: 26, revenue: 544, laborCost: 531.42, difference: 12.58 },
      { month: "2026-04-01", runStatus: "draft", laborSource: LABOR_SOURCE.ESTIMATE, estimate: true, hours: 8, revenue: 160, laborCost: 96, difference: 64 },
    ]);
    expect(r.totals).toMatchObject({ revenue: 704, payrollLaborCost: 531.42, estimatedLaborCost: 96, laborCost: 627.42, otherCosts: 200, hasEstimate: true });
    expect(r.totals.remaining).toBe(projectMargin({ revenue: 704, laborCost: 627.42, otherCosts: 200 }).remaining);
    expect(r.totals.remaining).toBe(-123.42);
    // po satima: E2 18 h (samo mart, obračun), E1 8 + 8 h (mart obračun 157,45 + april procena 96)
    expect(r.employees.map((e) => [e.id, e.hours, e.laborCost, e.estimate])).toEqual([["E2", 18, 373.97, false], ["E1", 16, 253.45, true]]);
    expect(r.problems).toEqual([]);

    // Isplaćen obračun je takođe konačan; bez procene u ukupnom.
    const paid = report({ timesheets: [T1, T2], runs: [{ ...runs[0], status: "paid" }], payslips, payslipProjects });
    expect(paid.months[0]).toMatchObject({ runStatus: "paid", laborSource: LABOR_SOURCE.PAYROLL, laborCost: 531.42 });
    expect(paid.totals.hasEstimate).toBe(false);
  });

  it("odobren obračun čiji sati ne odgovaraju satnicama se prijavljuje (ne prećutkuje)", () => {
    const r = report({
      timesheets: [T1, T2],
      runs: [{ id: "R3", month: "2026-03-01", status: "approved" }],
      payslips: [{ id: "S1", run_id: "R3", employee_id: "E1" }],
      payslipProjects: [{ payslip_id: "S1", project_id: "PA", hours: 8, labor_cost: 157.45 }],
    });
    expect(r.months[0]).toMatchObject({ laborSource: LABOR_SOURCE.PAYROLL, laborCost: 157.45 });
    expect(r.problems).toEqual([{ code: REPORT_PROBLEM.PAYROLL_HOURS_MISMATCH, month: "2026-03-01", payrollHours: 8, timesheetHours: 26 }]);
    expect(reportProblemMessage(r.problems[0])).toBe("03.2026: odobren obračun ima 8 h na ovom projektu, odobrene satnice 26 h.");
  });

  it("Accept: nedelja 30.3.–5.4. se deli po danu (isto kao mesečni obračun), ništa se ne gubi na granici", () => {
    // pon 8, uto 10, sre 10 (1.4. praznik u snimku), čet 8; prag 8 — isti primer kao payroll.test.js (D17).
    const r0 = odobrena({ id: "T9", week_start: "2026-03-30", days: [8, 10, 10, 8], holidays: ["2026-04-01"] });
    expect([r0.worker_cost, r0.client_revenue]).toEqual([564, 984]);
    const r = report({ timesheets: [r0], costs: [] });
    expect(r.months.map((m) => [m.month, m.hours, m.revenue, m.laborCost])).toEqual([
      ["2026-03-01", 18, 384, 228], // 16×12 + 2×12×1,5 = 228; 16×20 + 2×20×1,6 = 384
      ["2026-04-01", 18, 600, 336], // 10×12×2 + 8×12 = 336; 10×20×2,2 + 8×20 = 600
    ]);
    expect([r.totals.hours, r.totals.revenue, r.totals.laborCost]).toEqual([36, 984, 564]);
    expect(r.problems).toEqual([]);

    // Mart odobren: trošak marta iz obračuna, april i dalje procena (podeljen deo nedelje).
    const s = report({
      timesheets: [r0], costs: [],
      runs: [{ id: "R3", month: "2026-03-01", status: "approved" }],
      payslips: [{ id: "S1", run_id: "R3", employee_id: "E1" }],
      payslipProjects: [{ payslip_id: "S1", project_id: "PA", hours: 18, labor_cost: 373.97 }],
    });
    expect(s.months.map((m) => [m.month, m.laborSource, m.laborCost])).toEqual([
      ["2026-03-01", LABOR_SOURCE.PAYROLL, 373.97],
      ["2026-04-01", LABOR_SOURCE.ESTIMATE, 336],
    ]);
    expect(s.problems).toEqual([]);
  });

  it("nedelja preko meseca bez snimka: deli se srazmerno satima i prijavljuje kao problem (procena)", () => {
    // Odobrena pre Faze 2 (bez snimka): pet 27.2. 8h, ned 1.3. 4h; iznosi iz baze 144 / 240.
    const stara = { ...odobrena({ id: "S9", week_start: "2026-02-23", days: [0, 0, 0, 0, 8, 0, 4] }), rate_snapshot: null, worker_cost: 144, client_revenue: 240 };
    const r = report({ timesheets: [stara], costs: [] });
    expect(r.months.map((m) => [m.month, m.hours, m.revenue, m.laborCost, m.estimate])).toEqual([
      ["2026-02-01", 8, 160, 96, true],
      ["2026-03-01", 4, 80, 48, true],
    ]);
    expect([r.totals.revenue, r.totals.laborCost]).toEqual([240, 144]); // zbir tačan na cent
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ code: REPORT_PROBLEM.SPLIT_BY_HOURS, timesheetId: "S9", weekStart: "2026-02-23", months: ["2026-02-01", "2026-03-01"] });
    const poruka = reportProblemMessage(r.problems[0]);
    expect(poruka).toContain("QA Radnik 1, nedelja od 23.02.2026");
    expect(poruka).toContain("02.2026 i 03.2026");
    expect(poruka).toContain("(procena)");
    expect(reportProblemMessage(r.problems[0], "en")).toContain("(estimate)");
  });

  it("bez podataka: nule, bez meseci i bez procene", () => {
    const r = projectFinancialReport({ projectId: "PA" });
    expect(r.months).toEqual([]);
    expect(r.totals).toMatchObject({ hours: 0, revenue: 0, laborCost: 0, otherCosts: 0, remaining: 0, marginPct: null, hasEstimate: false });
    expect(r.costs).toEqual({ count: 0, eur: 0, fromRsd: { amount: 0, eur: 0 }, missingRsd: 0 });
  });
});

describe("Payroll Due iz mesečnog obračuna (reports.js → payrollDue)", () => {
  const runs = [
    { id: "R4", month: "2026-04-01", status: "approved" },
    { id: "R2", month: "2026-02-01", status: "paid" },
    { id: "R5", month: "2026-05-01", status: "draft" },
    { id: "R3", month: "2026-03-01", status: "approved" },
  ];
  const payslips = [
    { run_id: "R3", payout: 650.1 },
    { run_id: "R3", payout: 420.25 },
    { run_id: "R4", payout: 1000 },
    { run_id: "R2", payout: 999 },
    { run_id: "R5", payout: 555 },
  ];
  it("za isplatu = zbir „za isplatu“ odobrenih, a neisplaćenih obračuna, po mesecu od najstarijeg", () => {
    expect(payrollDue(runs, payslips)).toEqual({
      total: 2070.35,
      workers: 3,
      months: [
        { runId: "R3", month: "2026-03-01", payout: 1070.35, workers: 2 },
        { runId: "R4", month: "2026-04-01", payout: 1000, workers: 1 },
      ],
    });
  });
  it("nema odobrenog neisplaćenog obračuna → 0", () => {
    expect(payrollDue(runs.filter((r) => r.status !== "approved"), payslips)).toEqual({ total: 0, workers: 0, months: [] });
    expect(payrollDue([], [])).toEqual({ total: 0, workers: 0, months: [] });
  });
});
