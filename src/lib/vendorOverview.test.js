import { describe, expect, it } from "vitest";
import {
  contractPayload, contractState, currentContract, overlappingContract, sortContracts, validateContract,
  vendorPayablesSummary, vendorPayablesUrl, vendorWorkers, workerCountMap,
} from "./vendorOverview.js";
import { payableRows } from "./payroll/payablesList.js";
import { readListParams } from "./listLinks.js";

const V = "v-1";
const TODAY = "2036-05-15";

describe("Vendors §11 — ugovorni periodi", () => {
  const contracts = [
    { id: "c1", vendor_id: V, reference: "2035", start_date: "2035-01-01", end_date: "2035-12-31", status: "ended" },
    { id: "c2", vendor_id: V, reference: "2036", start_date: "2036-01-01", end_date: "2036-12-31", status: "active" },
    { id: "c3", vendor_id: V, reference: "2037", start_date: "2037-01-01", end_date: null, status: "active" },
    { id: "c4", vendor_id: V, reference: "staro", start_date: "2034-01-01", end_date: "2034-06-30", status: "active" },
  ];

  it("stanje ugovora na dan", () => {
    expect(contractState(contracts[1], TODAY)).toBe("active");
    expect(contractState(contracts[2], TODAY)).toBe("upcoming");
    expect(contractState(contracts[3], TODAY)).toBe("expired");
    expect(contractState(contracts[0], TODAY)).toBe("ended");
    expect(contractState({ ...contracts[1], status: "cancelled" }, TODAY)).toBe("cancelled");
    expect(currentContract(contracts, TODAY)?.id).toBe("c2");
    expect(currentContract(contracts, "2033-01-01")).toBeNull();
    expect(sortContracts(contracts).map((c) => c.id)).toEqual(["c3", "c2", "c1", "c4"]);
  });

  it("preklapanje aktivnih perioda istog vendora (kao vendor_contracts_no_overlap)", () => {
    const draft = { vendor_id: V, reference: "x", start_date: "2036-06-01", end_date: "2037-02-01", status: "active", currency: "EUR" };
    expect(overlappingContract(contracts, draft)?.id).toBe("c2");
    expect(validateContract(draft, contracts)).toEqual(["overlap"]);
    // završen period se ne proverava, otkazan nacrt ne blokira, izmena istog ugovora ne preklapa samu sebe
    expect(overlappingContract(contracts, { ...draft, start_date: "2035-03-01", end_date: "2035-04-01" })).toBeNull();
    expect(overlappingContract(contracts, { ...draft, status: "cancelled" })).toBeNull();
    expect(overlappingContract(contracts, { ...contracts[1], end_date: "2036-11-30" })).toBeNull();
    // otvoren kraj (null) se preklapa sa svim kasnijim aktivnim
    expect(overlappingContract(contracts, { ...draft, start_date: "2038-01-01", end_date: null })?.id).toBe("c3");
    // drugi vendor ne smeta
    expect(overlappingContract(contracts, { ...draft, vendor_id: "v-2" })).toBeNull();
  });

  it("provera forme i red za upis", () => {
    expect(validateContract({ vendor_id: V, reference: " ", start_date: "" })).toEqual(["reference", "start_date"]);
    expect(validateContract({ vendor_id: V, reference: "a", start_date: "2036-05-01", end_date: "2036-04-01" })).toEqual(["end_before_start"]);
    expect(validateContract({ vendor_id: V, reference: "a", start_date: "2036-05-01", payment_terms_days: 400 })).toEqual(["payment_terms_days"]);
    expect(validateContract({ vendor_id: V, reference: "a", start_date: "2036-05-01", currency: "CHF" })).toEqual(["currency"]);
    expect(validateContract({ vendor_id: V, reference: "a", start_date: "2040-05-01", payment_terms_days: "30" })).toEqual([]);
    expect(contractPayload({ vendor_id: V, reference: "  UG-1 ", start_date: "2036-01-01", end_date: "", payment_terms_days: "30", notes: " " }))
      .toEqual({ vendor_id: V, reference: "UG-1", start_date: "2036-01-01", end_date: null, payment_terms_days: 30, currency: "EUR", status: "active", notes: null });
  });
});

describe("Vendors §11 — povezani radnici", () => {
  const history = [
    { employee_id: "e1", vendor_id: V, start_date: "2036-01-01", end_date: null, status: "active" },
    { employee_id: "e2", vendor_id: V, start_date: "2035-01-01", end_date: "2035-12-31", status: "ended" },
    { employee_id: "e2", vendor_id: V, start_date: "2036-05-01", end_date: "2036-05-31", status: "active" },
    { employee_id: "e3", vendor_id: V, start_date: "2034-01-01", end_date: "2034-12-31", status: "ended" },
    { employee_id: "e4", vendor_id: V, start_date: "2036-06-01", end_date: null, status: "active" },
    { employee_id: "e5", vendor_id: "v-2", start_date: "2036-01-01", end_date: null, status: "active" },
    { employee_id: "e6", vendor_id: V, start_date: "2036-01-01", end_date: null, status: "ended" },
  ];

  it("aktivni danas, budući i bivši; radnik se broji jednom", () => {
    const r = vendorWorkers(history, V, { employees: [{ id: "e1", first_name: "Ana" }], today: TODAY });
    expect(r.activeCount).toBe(2);
    expect(r.totalCount).toBe(5);
    expect(r.workers.map((w) => w.employeeId)).toEqual(["e2", "e1", "e4", "e6", "e3"]);
    expect(r.workers.find((w) => w.employeeId === "e2")).toMatchObject({ active: true, start: "2036-05-01", end: "2036-05-31" });
    expect(r.workers.find((w) => w.employeeId === "e4")).toMatchObject({ active: false, upcoming: true });
    expect(r.workers.find((w) => w.employeeId === "e1").employee.first_name).toBe("Ana");
  });

  it("kolona Active Workers čita broj iz view-a vendor_worker_counts", () => {
    const m = workerCountMap([{ vendor_id: V, active_workers: 2, total_workers: 5 }, { vendor_id: "v-2", active_workers: "1" }, null]);
    expect(m.get(V)).toBe(2);
    expect(m.get("v-2")).toBe(1);
    expect(m.get("v-3")).toBeUndefined();
  });
});

describe("Vendors §11 — obaveze plaćanja", () => {
  const payables = [
    { id: "p1", payee_type: "vendor", vendor_id: V, currency: "EUR", calculated_amount: 1000, adjustments_amount: 0, total_amount: 1000,
      status: "confirmed", period_start: "2036-03-01", period_end: "2036-03-31", due_date: "2036-04-15" },
    { id: "p2", payee_type: "vendor", vendor_id: V, currency: "EUR", calculated_amount: 800, adjustments_amount: -50, total_amount: 750,
      status: "confirmed", period_start: "2036-04-01", period_end: "2036-04-30", due_date: "2036-05-30" },
    { id: "p3", payee_type: "vendor", vendor_id: V, currency: "RSD", calculated_amount: 50000, adjustments_amount: 0, total_amount: 50000,
      status: "confirmed", period_start: "2036-04-01", period_end: "2036-04-30", due_date: null },
    { id: "p4", payee_type: "vendor", vendor_id: V, currency: "EUR", calculated_amount: 500, adjustments_amount: 0, total_amount: 500,
      status: "confirmed", period_start: "2036-02-01", period_end: "2036-02-29", due_date: "2036-03-15" },
    { id: "p5", payee_type: "vendor", vendor_id: V, currency: "EUR", calculated_amount: 900, adjustments_amount: 0, total_amount: 900,
      status: "draft", period_start: "2036-05-01", period_end: "2036-05-31", due_date: null },
    { id: "p6", payee_type: "vendor", vendor_id: V, currency: "EUR", calculated_amount: 300, adjustments_amount: 0, total_amount: 300,
      status: "cancelled", period_start: "2036-01-01", period_end: "2036-01-31", due_date: "2036-02-15" },
  ];
  const payments = [
    { payable_id: "p1", amount: 400, payment_date: "2036-04-20", voided_at: null },
    { payable_id: "p1", amount: 600, payment_date: "2036-04-21", voided_at: "2036-04-22" },
    { payable_id: "p4", amount: 500, payment_date: "2036-03-10", voided_at: null },
  ];
  const rows = payableRows(payables, { payments, today: TODAY });

  it("preostalo i dospelo po valuti; nacrt, plaćeno i otkazano nisu dug", () => {
    const s = vendorPayablesSummary(rows, TODAY);
    expect(s.byCurrency).toEqual([
      { currency: "EUR", open: 2, remaining: 1350, overdue: 600, overdueCount: 1 },
      { currency: "RSD", open: 1, remaining: 50000, overdue: 0, overdueCount: 0 },
    ]);
    expect(s.openCount).toBe(3);
    expect(s.overdueCount).toBe(1);
    expect(s.draftCount).toBe(1);
    expect(s.nextDue).toBe("2036-05-30");
  });

  it("link na Payables nosi vendora, period obaveza i status open (čita ga ista funkcija)", () => {
    const s = vendorPayablesSummary(rows, TODAY);
    const url = vendorPayablesUrl(V, s.openRows);
    expect(url).toBe("/payroll/payables?from=2036-03-01&to=2036-04-30&status=open&vendor=v-1");
    const lp = readListParams(new URLSearchParams(url.split("?")[1]));
    expect(lp).toMatchObject({ vendor: V, from: "2036-03-01", to: "2036-04-30", status: "open" });
    expect(vendorPayablesUrl(V, [])).toBe("/payroll/payables?status=open&vendor=v-1");
  });
});
