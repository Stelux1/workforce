import { describe, expect, it } from "vitest";
import {
  dueState, filterPayableRows, monthRange, netComparison, payableExportRows, payableRows, periodMonth, sortPayableRows,
  workerBreakdown,
} from "./payablesList.js";

// Isti primer kao pgTAP 28: Vendor sa dva radnika (40 h i 24 h × 12 €) i direktni radnik (40 h × 10 €), februar 2036.
const VENDOR = { id: "V1", name: "QA Vendor d.o.o." };
const EMPLOYEES = [
  { id: "D1", first_name: "Ana", last_name: "Direktna" },
  { id: "S1", first_name: "Bojan", last_name: "Prvi" },
  { id: "S2", first_name: "Ceca", last_name: "Druga" },
];
const PAYABLES = [
  { id: "PV", payee_type: "vendor", vendor_id: "V1", employee_id: null, currency: "EUR", status: "confirmed",
    period_start: "2036-02-01", period_end: "2036-02-29", calculated_amount: 768, adjustments_amount: -18, total_amount: 750, due_date: "2036-03-15" },
  { id: "PD", payee_type: "employee", employee_id: "D1", vendor_id: null, currency: "EUR", status: "draft",
    period_start: "2036-02-01", period_end: "2036-02-29", calculated_amount: 400, adjustments_amount: 0, total_amount: 400, due_date: null },
  { id: "PX", payee_type: "employee", employee_id: "S1", vendor_id: null, currency: "RSD", status: "cancelled",
    period_start: "2036-01-01", period_end: "2036-01-31", calculated_amount: 100, adjustments_amount: 0, total_amount: 100, due_date: null },
];
const LINES = [
  { payable_id: "PV", kind: "labor", employee_id: "S1", project_id: "P1", assignment_id: "A2", hours: 40, amount: 480 },
  { payable_id: "PV", kind: "labor", employee_id: "S2", project_id: "P1", assignment_id: "A3", hours: 24, amount: 288 },
  { payable_id: "PV", kind: "adjustment", employee_id: "S1", amount: -18, reason: "Odbitak za opremu" },
  { payable_id: "PD", kind: "labor", employee_id: "D1", project_id: "P2", assignment_id: "A1", hours: 40, amount: 400 },
];
const PAYMENTS = [
  { payable_id: "PV", amount: 300, payment_date: "2036-03-05", recorded_at: "2036-03-05T09:00:00Z" },
  { payable_id: "PV", amount: 200, payment_date: "2036-03-12", recorded_at: "2036-03-12T09:00:00Z", voided_at: "2036-03-13T09:00:00Z", void_reason: "Pogrešan izvod" },
];
const rows = payableRows(PAYABLES, { lines: LINES, payments: PAYMENTS, employees: EMPLOYEES, vendors: [VENDOR], today: "2036-03-20" });
const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

describe("payableRows — stanje iz finance/payables.js, nazivi i razrada", () => {
  it("T11: stornirana uplata se ne broji; Remaining = 750 − 300 = 450, Partially Paid, dospelo", () => {
    expect(byId.PV.balance).toMatchObject({ total: 750, paid: 300, remaining: 450, status: "partially_paid", overdue: true, paymentCount: 1 });
    expect(byId.PV.status).toBe("partially_paid");
    expect(byId.PV.payeeName).toBe("QA Vendor d.o.o.");
  });

  it("nacrt i otkazana obaveza imaju svoj status, ne status isplate", () => {
    expect(byId.PD.status).toBe("draft");
    expect(byId.PX.status).toBe("cancelled");
    expect(byId.PD.payeeName).toBe("Ana Direktna");
  });

  it("T12: obaveza Vendoru ima dva radnika, 64 h, projekte iz labor linija", () => {
    expect(byId.PV).toMatchObject({ workerCount: 2, hours: 64, projectIds: ["P1"], employeeIds: ["S1", "S2"] });
    expect(workerBreakdown(byId.PV, EMPLOYEES)).toEqual([
      { employeeId: "S1", name: "Bojan Prvi", hours: 40, labor: 480, adjustments: -18, total: 462, projects: [{ projectId: "P1", assignmentId: "A2", hours: 40, amount: 480 }] },
      { employeeId: "S2", name: "Ceca Druga", hours: 24, labor: 288, adjustments: 0, total: 288, projects: [{ projectId: "P1", assignmentId: "A3", hours: 24, amount: 288 }] },
    ].sort((a, b) => a.name.localeCompare(b.name)));
  });
});

describe("filterPayableRows — period, projekat, radnik, vendor, status, dospelost", () => {
  it("otkazane se ne prikazuju bez izričitog filtera", () => {
    expect(filterPayableRows(rows, {}).map((r) => r.id)).toEqual(["PV", "PD"]);
    expect(filterPayableRows(rows, { status: "cancelled" }).map((r) => r.id)).toEqual(["PX"]);
  });
  it("period = preklapanje", () => {
    expect(filterPayableRows(rows, { from: "2036-01-15", to: "2036-01-20", includeCancelled: true }).map((r) => r.id)).toEqual(["PX"]);
    expect(filterPayableRows(rows, { from: "2036-02-10", to: "2036-03-10" }).map((r) => r.id)).toEqual(["PV", "PD"]);
  });
  it("projekat, radnik (i radnik Vendora), vendor", () => {
    expect(filterPayableRows(rows, { projectId: "P2" }).map((r) => r.id)).toEqual(["PD"]);
    expect(filterPayableRows(rows, { employeeId: "S2" }).map((r) => r.id)).toEqual(["PV"]);
    expect(filterPayableRows(rows, { vendorId: "V1" }).map((r) => r.id)).toEqual(["PV"]);
  });
  it("status isplate i 'otvoreno' (unpaid + partially paid)", () => {
    expect(filterPayableRows(rows, { status: "open" }).map((r) => r.id)).toEqual(["PV"]);
    expect(filterPayableRows(rows, { status: "draft" }).map((r) => r.id)).toEqual(["PD"]);
    expect(filterPayableRows(rows, { status: "paid" })).toEqual([]);
  });
  it("dospelost: overdue, due_soon (7 dana), no_due_date", () => {
    expect(dueState(byId.PV, "2036-03-20")).toBe("overdue");
    expect(dueState(byId.PV, "2036-03-10")).toBe("due_soon");
    expect(dueState(byId.PV, "2036-03-01")).toBe("not_due");
    expect(dueState(byId.PD, "2036-03-01")).toBe("no_due_date");
    expect(filterPayableRows(rows, { due: "overdue", today: "2036-03-20" }).map((r) => r.id)).toEqual(["PV"]);
  });
});

describe("sortiranje, mesec i poređenje sa neto", () => {
  it("sortiranje po ostatku", () => {
    expect(sortPayableRows(rows, { key: "remaining", dir: "desc" }).map((r) => r.id)).toEqual(["PV", "PD", "PX"]);
  });
  it("monthRange / periodMonth (prestupna godina)", () => {
    expect(monthRange("2036-02")).toEqual({ from: "2036-02-01", to: "2036-02-29" });
    expect(periodMonth(PAYABLES[0])).toBe("2036-02-01");
    expect(periodMonth({ period_start: "2036-02-04", period_end: "2036-02-08" })).toBeNull();
  });
  it("direktni radnik: obaveza po B2C prema iznosu za isplatu iz mesečnog obračuna", () => {
    const runs = [{ id: "R2", month: "2036-02-01", status: "approved" }];
    const payslips = [{ run_id: "R2", employee_id: "D1", neto: 380.5, payout: 380.5 }];
    expect(netComparison(byId.PD, { runs, payslips })).toEqual({ month: "2036-02-01", runStatus: "approved", neto: 380.5, payout: 380.5, payable: 400, difference: 19.5 });
    expect(netComparison(byId.PD, { runs: [], payslips: [] })).toMatchObject({ runStatus: null, neto: null, difference: null });
    expect(netComparison(byId.PV, { runs, payslips })).toBeNull();
  });
});

describe("T26 izvoz", () => {
  it("bez payroll.view izvoz je prazan; sa pravom ceo skup sa Calculated/Paid/Remaining", () => {
    expect(payableExportRows(rows, ["costs.view"])).toEqual([]);
    const out = payableExportRows([byId.PV], ["payroll.view"]);
    expect(out).toEqual([{
      payee: "QA Vendor d.o.o.", payee_type: "vendor", period_start: "2036-02-01", period_end: "2036-02-29", workers: 2, hours: 64,
      calculated: 768, adjustments: -18, total: 750, paid: 300, remaining: 450, currency: "EUR", due_date: "2036-03-15",
      status: "partially_paid", overdue: true, payments: 1,
    }]);
  });
});
