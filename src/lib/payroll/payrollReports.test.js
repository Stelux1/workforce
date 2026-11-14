import { describe, expect, it } from "vitest";
import { payrollTotals, projectTotals } from "./payrollMonth.js";
import {
  finalPayrollTotals, isDraftRun, isFinalRun, monthPayrollReport, payrollRunRows, payslipContributions, payslipsWithProjects,
  SLIP_TOTAL_FIELDS,
} from "./payrollReports.js";

// Sačuvani obračuni kakve vraća baza: payroll_runs, payslips, payslip_projects. Iznosi su već izračunati
// (computeWorkerMonth) — izveštaj ih samo sabira. Iznosi namerno kao tekst i sa float zamkama (0,1 + 0,2).
const RUNS = [
  { id: "R-FEB", month: "2026-02-01", status: "paid" },
  { id: "R-MAR", month: "2026-03-01", status: "approved" },
  { id: "R-APR", month: "2026-04-01", status: "draft" },
];

const slip = (id, run_id, employee_name, o = {}) => ({
  id, run_id, employee_id: `E-${employee_name}`, employee_name, engagement_type: "direct_employee",
  total_hours: 0, basis_amount: 0, bruto: 0, neto: 0, tax: 0,
  emp_pio: 0, emp_health: 0, emp_unemployment: 0, er_pio: 0, er_health: 0, total_cost: 0, payout: 0, ...o,
});

const PAYSLIPS = [
  slip("S1", "R-MAR", "Petar Petrović", {
    total_hours: "168", basis_amount: "2016.10", bruto: "2016.10", neto: "1489.87", tax: "125.10",
    emp_pio: "282.25", emp_health: "103.32", emp_unemployment: "15.12", er_pio: "201.61", er_health: "103.32",
    total_cost: "2321.03", payout: "1489.87",
  }),
  slip("S2", "R-MAR", "Ana Anić", {
    total_hours: 40.5, basis_amount: 486.1, bruto: 812.33, neto: 562.62, tax: 0.1, emp_pio: 0.1, emp_health: 0.2,
    emp_unemployment: 0.3, er_pio: 0.1, er_health: 0.2, total_cost: 935.4, payout: 562.62,
  }),
  // Podizvođač: bez poreza i doprinosa (null), trošak = iznos sati.
  slip("S3", "R-MAR", "Đorđe Đurić", {
    engagement_type: "subcontractor_worker", vendor_id: "V1", total_hours: 20, basis_amount: 300, bruto: null, neto: null,
    tax: null, emp_pio: null, emp_health: null, emp_unemployment: null, er_pio: null, er_health: null,
    total_cost: 300, payout: 300,
  }),
  slip("S4", "R-FEB", "Petar Petrović", { total_hours: 160, bruto: 1920, neto: 1412.5, tax: 117.1, total_cost: 2210.88, payout: 1412.5 }),
  slip("S5", "R-APR", "Petar Petrović", { total_hours: 150, bruto: 1800, neto: 1330.15, tax: 108.2, total_cost: 2072.7, payout: 1330.15 }),
];

const PAYSLIP_PROJECTS = [
  { payslip_id: "S1", project_id: "P-B", hours: 68, worker_amount: "816.10", labor_cost: "939.62", revenue: "1360.00" },
  { payslip_id: "S1", project_id: "P-A", hours: 100, worker_amount: "1200.00", labor_cost: "1381.41", revenue: "2000.00" },
  { payslip_id: "S2", project_id: "P-A", hours: 40.5, worker_amount: 486.1, labor_cost: 935.4, revenue: 810.1 },
  { payslip_id: "S3", project_id: "P-B", hours: 20, worker_amount: 300, labor_cost: 300, revenue: 400.2 },
  // Druga meseca — ne sme da uđe u mart.
  { payslip_id: "S4", project_id: "P-A", hours: 160, worker_amount: 1920, labor_cost: 2210.88, revenue: 3200 },
  { payslip_id: "S5", project_id: "P-A", hours: 150, worker_amount: 1800, labor_cost: 2072.7, revenue: 3000 },
];

// Isto kao stranica Mesečni obračun: listići jednog obračuna + njihovi redovi raspodele (filter po payslip_id).
function monthlyPageStored(runId) {
  const slips = PAYSLIPS.filter((s) => s.run_id === runId);
  const ids = new Set(slips.map((s) => s.id));
  return payslipsWithProjects(slips, PAYSLIP_PROJECTS.filter((p) => ids.has(p.payslip_id)));
}

describe("Izveštaji o platama — mesečni obračun (payslips), isti zbir kao Mesečni obračun", () => {
  it("mesec: zbirovi radnika i projekata = payrollTotals/projectTotals za iste listiće", () => {
    const run = RUNS[1];
    const report = monthPayrollReport({ run, payslips: PAYSLIPS, payslipProjects: PAYSLIP_PROJECTS });
    const stored = monthlyPageStored("R-MAR");
    expect(report.totals).toEqual(payrollTotals(stored));
    expect(report.projects).toEqual(projectTotals(stored));
    expect(report.payslips.map((s) => s.id)).toEqual(stored.map((s) => s.id));
    // Konkretne brojke (centi, bez float greške): neto 1489,87 + 562,62; podizvođač nema neto (null → 0).
    expect(report.totals.neto).toBe(2052.49);
    expect(report.totals.payout).toBe(2352.49);
    expect(report.totals.totalCost).toBe(3556.43);
    expect(report.totals.employeeContributions).toBe(401.29);
    expect(report.totals.employerContributions).toBe(305.23);
    expect(report.totals.allocated).toBe(3556.43);
    expect(report.totals.revenue).toBe(4570.3);
    expect(report.allocationOk).toBe(true);
    expect(report.projects).toEqual([
      { project_id: "P-A", hours: 140.5, worker_amount: 1686.1, labor_cost: 2316.81, revenue: 2810.1, difference: 493.29 },
      { project_id: "P-B", hours: 88, worker_amount: 1116.1, labor_cost: 1239.62, revenue: 1760.2, difference: 520.58 },
    ]);
    expect(report).toMatchObject({ runId: "R-MAR", month: "2026-03-01", status: "approved", final: true, draft: false });
  });

  it("mesec: listići i raspodela drugih obračuna se ne mešaju; redosled učitavanja ne menja zbir", () => {
    const shuffled = [...PAYSLIP_PROJECTS].reverse();
    const a = monthPayrollReport({ run: RUNS[1], payslips: [...PAYSLIPS].reverse(), payslipProjects: shuffled });
    const b = monthPayrollReport({ run: RUNS[1], payslips: PAYSLIPS, payslipProjects: PAYSLIP_PROJECTS });
    expect(a.totals).toEqual(b.totals);
    expect(a.projects).toEqual(b.projects);
    expect(a.payslips.every((s) => s.run_id === "R-MAR")).toBe(true);
    expect(a.payslips.find((s) => s.id === "S1").projects.map((p) => p.project_id)).toEqual(["P-A", "P-B"]);
  });

  it("nacrt: pregled meseca postoji i označen je kao nacrt (nije konačan)", () => {
    const report = monthPayrollReport({ run: RUNS[2], payslips: PAYSLIPS, payslipProjects: PAYSLIP_PROJECTS });
    expect(report).toMatchObject({ status: "draft", draft: true, final: false });
    expect(report.totals).toEqual(payrollTotals(monthlyPageStored("R-APR")));
    expect(monthPayrollReport({ run: null, payslips: PAYSLIPS, payslipProjects: [] })).toBeNull();
  });

  it("po mesecima: jedan red po obračunu, od najnovijeg, zbir = payrollTotals listića tog obračuna", () => {
    const rows = payrollRunRows(RUNS, PAYSLIPS);
    expect(rows.map((r) => [r.month, r.status, r.final, r.draft, r.workers])).toEqual([
      ["2026-04-01", "draft", false, true, 1],
      ["2026-03-01", "approved", true, false, 3],
      ["2026-02-01", "paid", true, false, 1],
    ]);
    for (const row of rows) {
      const all = payrollTotals(PAYSLIPS.filter((s) => s.run_id === row.runId));
      expect(Object.keys(row.totals)).toEqual([...SLIP_TOTAL_FIELDS]);
      for (const f of SLIP_TOTAL_FIELDS) expect(row.totals[f]).toBe(all[f]);
    }
    // Obračun bez listića: red postoji, nule.
    const empty = payrollRunRows([{ id: "R-MAJ", month: "2026-05-01", status: "draft" }], PAYSLIPS);
    expect(empty[0]).toMatchObject({ workers: 0, totals: { payout: 0, totalCost: 0 } });
  });

  it("zbir konačnih: samo odobreni i isplaćeni, nacrt se ne sabira", () => {
    const fin = finalPayrollTotals(RUNS, PAYSLIPS);
    const expected = payrollTotals(PAYSLIPS.filter((s) => s.run_id !== "R-APR"));
    expect(fin.months).toBe(2);
    expect(fin.workers).toBe(4);
    for (const f of SLIP_TOTAL_FIELDS) expect(fin.totals[f]).toBe(expected[f]);
    expect(fin.totals.payout).toBe(3764.99); // 2352,49 (mart) + 1412,50 (februar), bez nacrta za april
    expect(finalPayrollTotals([RUNS[2]], PAYSLIPS)).toMatchObject({ months: 0, workers: 0, totals: { payout: 0 } });
  });

  it("status: konačan je samo odobren ili isplaćen", () => {
    expect(isFinalRun({ status: "approved" })).toBe(true);
    expect(isFinalRun({ status: "paid" })).toBe(true);
    expect(isFinalRun({ status: "draft" })).toBe(false);
    expect(isFinalRun(null)).toBe(false);
    expect(isDraftRun({ status: "draft" })).toBe(true);
    expect(isDraftRun({ status: "approved" })).toBe(false);
  });

  it("doprinosi listića u centima; podizvođač bez doprinosa = null (prikaz „—“), ne 0", () => {
    expect(payslipContributions(PAYSLIPS[1])).toEqual({ employee: 0.6, employer: 0.3 });
    expect(payslipContributions(PAYSLIPS[0])).toEqual({ employee: 400.69, employer: 304.93 });
    expect(payslipContributions(PAYSLIPS[2])).toEqual({ employee: null, employer: null });
    // Zbir doprinosa po listićima = zbir meseca iz payrollTotals.
    const stored = monthlyPageStored("R-MAR");
    const t = payrollTotals(stored);
    const per = stored.map(payslipContributions);
    expect(per.reduce((a, c) => Math.round(a * 100 + (c.employee || 0) * 100) / 100, 0)).toBe(t.employeeContributions);
    expect(per.reduce((a, c) => Math.round(a * 100 + (c.employer || 0) * 100) / 100, 0)).toBe(t.employerContributions);
  });
});
