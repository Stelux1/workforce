import { describe, expect, it } from "vitest";
import { payablesDue } from "./reports.js";

describe("payablesDue — Payroll Due iz obaveza (§7, T17)", () => {
  const payables = [
    { id: "A", status: "confirmed", currency: "EUR", calculated_amount: 768, adjustments_amount: -18, due_date: "2036-03-15" },
    { id: "B", status: "confirmed", currency: "EUR", calculated_amount: 400, adjustments_amount: 0, due_date: null },
    { id: "C", status: "draft", currency: "EUR", calculated_amount: 999, adjustments_amount: 0 },
    { id: "D", status: "confirmed", currency: "RSD", calculated_amount: 50000, adjustments_amount: 0, due_date: "2036-04-01" },
  ];
  const payments = [
    { payable_id: "A", amount: 300 },
    { payable_id: "A", amount: 200, voided_at: "2036-03-13T00:00:00Z" },
    { payable_id: "D", amount: 50000 },
  ];
  it("T11/T17: Σ remaining potvrđenih po valuti; nacrt nije dug; dospele prve", () => {
    const due = payablesDue(payables, payments, { today: "2036-03-20" });
    expect(due.byCurrency).toEqual({
      EUR: { confirmed: 1150, paid: 300, remaining: 850, overdue: 450 },
      RSD: { confirmed: 50000, paid: 50000, remaining: 0, overdue: 0 },
    });
    expect(due.openCount).toBe(2);
    expect(due.open.map((x) => x.payable.id)).toEqual(["A", "B"]);
  });
});
