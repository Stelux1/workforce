import { describe, expect, it } from "vitest";
import { laborDayLines, sideAmount, SIDES } from "./finance/laborLines.js";
import { v2Timesheet } from "./finance/testFixtures.js";
import {
  billableCostCandidates, billingExportData, breakdownRows, canReturnToPreparation, costTotals, findOverlap,
  linkedCosts, nextBillingStatus, overviewByProject, rowsTotals, summaryBalance, summaryCalculation,
} from "./billingOverview.js";

const projects = [
  { id: "P1", client_id: "C1" },
  { id: "P2", client_id: "C1" },
  { id: "P3", client_id: "C2" },
];
const assignments = [{ id: "A1", project_role_id: "R-WELDER" }, { id: "A2", project_role_id: "R-FITTER" }];

// Novembar 2026: dva radnika na P1 (8 h × 50 i 3 × 8 h × 50 + prekovremeni 2 h × 50 × 1.5), jedan na P2, jedan na P3.
const timesheets = [
  v2Timesheet({ id: "T1", employee_id: "E1", project_id: "P1", assignment_id: "A1", week_start: "2026-11-02",
    days: [{ i: 0, hours: 8 }, { i: 1, hours: 8 }, { i: 2, hours: 8 }, { i: 2, hours: 2, code: "prekovremeni", cc: 1.5 }] }),
  v2Timesheet({ id: "T2", employee_id: "E2", project_id: "P1", assignment_id: "A2", week_start: "2026-11-02",
    days: [{ i: 0, hours: 7.5, c: 47.33 }, { i: 1, hours: 7.5, c: 47.33 }, { i: 2, hours: 7.5, c: 47.33 }] }),
  v2Timesheet({ id: "T3", employee_id: "E3", project_id: "P2", assignment_id: "A1", week_start: "2026-11-09",
    days: [{ i: 0, hours: 8, c: 60 }] }),
  v2Timesheet({ id: "T4", employee_id: "E4", project_id: "P3", week_start: "2026-11-09", days: [{ i: 0, hours: 4, cCur: "RSD", c: 5000 }] }),
  v2Timesheet({ id: "T5", employee_id: "E1", project_id: "P1", week_start: "2026-11-02", status: "submitted", estimate: true, days: [{ i: 3, hours: 8 }] }),
];
const range = { from: "2026-11-01", to: "2026-11-30" };
const { lines } = laborDayLines(timesheets, { ...range, projects, assignments });

const summary = (over = {}) => ({
  id: "S1", client_id: "C1", project_id: null, period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR",
  status: "in_preparation", calculated_amount: null, ...over,
});

describe("summaryCalculation — obračun Approved Hours × B2B × Client Coef (spec §9)", () => {
  it("u pripremi računa živo i isto kao sideAmount (jedno pravilo zaokruživanja, T27)", () => {
    const calc = summaryCalculation(summary(), { laborLines: lines });
    const expected = sideAmount(lines.filter((l) => l.clientId === "C1"), SIDES.REVENUE).byCurrency.EUR;
    // 24 × 50 + 2 × 50 × 1.5 + round2(22.5 × 47.33) + 8 × 60 = 1200 + 150 + 1064.93 + 480
    expect(expected).toBe(2894.93);
    expect(calc.frozen).toBe(false);
    expect(calc.amount).toBe(expected);
    expect(calc.totals.hours).toBe(56.5);
  });

  it("procena (submitted) nije u obračunu (T09)", () => {
    const calc = summaryCalculation(summary(), { laborLines: lines });
    expect(calc.rows.some((r) => r.employeeId === "E1" && r.hours === 32)).toBe(false);
  });

  it("projekat ograničava obračun; druga valuta istog klijenta nije u EUR obračunu", () => {
    expect(summaryCalculation(summary({ project_id: "P2" }), { laborLines: lines }).amount).toBe(480);
    expect(summaryCalculation(summary({ client_id: "C2" }), { laborLines: lines }).amount).toBe(0);
    expect(summaryCalculation(summary({ client_id: "C2", currency: "RSD" }), { laborLines: lines }).amount).toBe(20000);
  });

  it("van pripreme čita zamrznute linije i upozorava kad se živi obračun razlikuje", () => {
    const dbLines = [
      { id: "L1", summary_id: "S1", project_id: "P2", employee_id: "E3", project_role_id: "R-WELDER", hour_type: "redovni", hours: 8, client_rate: 60, client_coef: 1, amount: 480, currency: "EUR" },
      { id: "Lx", summary_id: "S9", project_id: "P2", employee_id: "E3", hour_type: "redovni", hours: 1, client_rate: 60, client_coef: 1, amount: 60, currency: "EUR" },
    ];
    const same = summaryCalculation(summary({ project_id: "P2", status: "ready_for_accounting", calculated_amount: "480.00" }), { laborLines: lines, dbLines });
    expect(same).toMatchObject({ frozen: true, amount: 480, live: { amount: 480, differs: false } });
    expect(same.rows).toHaveLength(1);
    const changed = summaryCalculation(summary({ project_id: "P2", status: "sent_to_accounting", calculated_amount: 480 }), { laborLines: [], dbLines });
    expect(changed.live).toMatchObject({ amount: 0, differs: true });
  });
});

describe("razrada po radniku / ulozi", () => {
  it("zbir razrade = zbir obračuna (redovi su grupe zaokruživanja)", () => {
    const calc = summaryCalculation(summary(), { laborLines: lines });
    for (const dim of ["employee", "role", "project", "hourType"]) {
      const sum = breakdownRows(calc.rows, dim).reduce((a, r) => a + Math.round((r.amount.EUR || 0) * 100), 0) / 100;
      expect(sum).toBe(calc.amount);
    }
    const byRole = Object.fromEntries(breakdownRows(calc.rows, "role").map((r) => [r.key, r]));
    expect(byRole["R-WELDER"]).toMatchObject({ hours: 34, amount: { EUR: 1830 } });
    expect(byRole["R-FITTER"]).toMatchObject({ hours: 22.5, amount: { EUR: 1064.93 } });
  });
});

describe("Zbir ekrana = zbir izvoza", () => {
  it("izvoz koristi iste redove i isti zbir kao ekran; billable troškovi su posebna tabela", () => {
    const s = summary();
    const calc = summaryCalculation(s, { laborLines: lines });
    const costs = [{ id: "K1", project_id: "P1", cost_date: "2026-11-05", amount: 300, currency: "EUR", billable: true, category: "Smeštaj" }];
    const data = billingExportData(s, calc, { costs, lookup: { employeeName: (id) => `Radnik ${id}`, clientName: () => "Klijent" } });
    expect(data.rows).toHaveLength(calc.rows.length);
    expect(data.totals).toEqual(calc.totals);
    expect(data.totals.byCurrency.EUR).toBe(calc.amount);
    const exportSum = data.rows.reduce((a, r) => a + Math.round(r.amount * 100), 0) / 100;
    expect(exportSum).toBe(calc.amount);
    // T15: trošak je odvojen i ne menja obračun
    expect(data.costTotals).toEqual({ EUR: 300 });
    expect(data.totals.byCurrency.EUR).toBe(2894.93);
    expect(data.header).toMatchObject({ client: "Klijent", project: null, periodStart: "2026-11-01", currency: "EUR" });
  });
});

describe("T15 — billable troškovi: kandidati, bez duplog brojanja", () => {
  const costs = [
    { id: "K1", project_id: "P1", cost_date: "2026-11-05", amount: 300, currency: "EUR", billable: true },
    { id: "K2", project_id: "P1", cost_date: "2026-11-06", amount: 80, currency: "EUR", billable: false },
    { id: "K3", project_id: "P3", cost_date: "2026-11-06", amount: 90, currency: "EUR", billable: true },
    { id: "K4", project_id: "P2", cost_date: "2026-12-01", amount: 50, currency: "EUR", billable: true },
    { id: "K5", project_id: "P2", cost_date: "2026-11-20", amount: 1200, currency: "RSD", billable: true },
  ];
  it("kandidat je billable trošak klijenta u periodu koji nije ni u jednom pregledu", () => {
    const c = billableCostCandidates(costs, { projects, clientId: "C1", ...range });
    expect(c.map((x) => x.id)).toEqual(["K1", "K5"]);
    expect(costTotals(c)).toEqual({ EUR: 300, RSD: 1200 });
  });
  it("trošak vezan za pregled više nije kandidat ni za jedan drugi pregled", () => {
    const links = [{ summary_id: "S1", project_cost_id: "K1" }];
    expect(billableCostCandidates(costs, { projects, links, clientId: "C1", ...range }).map((x) => x.id)).toEqual(["K5"]);
    expect(linkedCosts({ id: "S1" }, links, costs).map((x) => x.id)).toEqual(["K1"]);
    expect(linkedCosts({ id: "S2" }, links, costs)).toEqual([]);
  });
});

describe("T16 — eksterni račun + delimične uplate", () => {
  it("1000 − 400 − 300 = Outstanding 300, Partially Paid; obračun ostaje odvojen (T17)", () => {
    const s = summary({ status: "invoiced_externally", calculated_amount: 2894.93, ext_invoice_reference: "2026-INV-0457", ext_invoice_amount: 1000 });
    const pays = [
      { billing_summary_id: "S1", amount: 400 }, { billing_summary_id: "S1", amount: 300 },
      { billing_summary_id: "S1", amount: 999, voided_at: "2026-12-01" },
    ];
    const b = summaryBalance(s, pays, summaryCalculation(s, { laborLines: lines }));
    expect(b).toMatchObject({ calculated: 2894.93, invoiced: 1000, received: 700, outstanding: 300, estimatedUnpaid: null, status: "partially_paid" });
  });
  it("bez eksternog iznosa: Estimated Unpaid iz živog obračuna u pripremi", () => {
    const s = summary({ project_id: "P2" });
    const b = summaryBalance(s, [{ billing_summary_id: "S1", amount: 100 }], summaryCalculation(s, { laborLines: lines }));
    expect(b).toMatchObject({ calculated: 480, invoiced: null, outstanding: null, estimatedUnpaid: 380 });
  });
});

describe("statusi i preklapanje (isto kao baza)", () => {
  it("jedan korak napred; nazad samo Ready → In Preparation bez eksternog računa", () => {
    expect(nextBillingStatus("in_preparation")).toBe("ready_for_accounting");
    expect(nextBillingStatus("invoiced_externally")).toBe(null);
    expect(canReturnToPreparation({ status: "ready_for_accounting" })).toBe(true);
    expect(canReturnToPreparation({ status: "ready_for_accounting", ext_invoice_reference: "X" })).toBe(false);
    expect(canReturnToPreparation({ status: "sent_to_accounting" })).toBe(false);
  });
  it("ceo klijent ↔ projekat istog klijenta se preklapa; druga valuta ili drugi projekat ne", () => {
    const existing = [summary({ id: "S1", project_id: "P1" })];
    expect(findOverlap({ client_id: "C1", period_start: "2026-11-30", period_end: "2026-12-31", currency: "EUR" }, existing)?.id).toBe("S1");
    expect(findOverlap({ client_id: "C1", project_id: "P2", period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR" }, existing)).toBe(null);
    expect(findOverlap({ client_id: "C1", period_start: "2026-11-01", period_end: "2026-11-30", currency: "RSD" }, existing)).toBe(null);
    expect(findOverlap({ client_id: "C1", period_start: "2026-12-01", period_end: "2026-12-31", currency: "EUR" }, existing)).toBe(null);
  });
});

describe("pregled po klijentu i projektu", () => {
  it("neobračunat deo je prihod koji nije ni u jednom pregledu", () => {
    const rows = overviewByProject(lines, [summary({ project_id: "P2" })]);
    const p1 = rows.find((r) => r.projectId === "P1");
    const p2 = rows.find((r) => r.projectId === "P2");
    expect(p1).toMatchObject({ clientId: "C1", hours: 48.5, revenue: { EUR: 2414.93 }, unbilled: { EUR: 2414.93 } });
    expect(p2).toMatchObject({ revenue: { EUR: 480 }, unbilled: {}, unbilledHours: 0 });
    expect(rowsTotals([]).byCurrency).toEqual({});
  });
});
