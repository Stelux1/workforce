import { describe, expect, it } from "vitest";
import { canRecordPayment, payableBalance, payablesTotals, payableTotal, paymentStatus } from "./payables.js";

const OBAVEZA = { id: "PY1", status: "confirmed", currency: "EUR", calculated_amount: 1000, adjustments_amount: 0, due_date: "2026-11-20" };

describe("payables — obaveza i isplate (spec §7)", () => {
  it("T11: 1000 − 300 − 200 → remaining 500, partially_paid", () => {
    const payments = [{ payable_id: "PY1", amount: 300 }, { payable_id: "PY1", amount: 200 }];
    expect(payableBalance(OBAVEZA, payments)).toEqual({
      total: 1000, paid: 500, remaining: 500, status: "partially_paid", currency: "EUR", overdue: false, paymentCount: 2,
    });
  });

  it("stornirane i tuđe uplate se ne broje; uplata do kraja → paid", () => {
    const payments = [
      { payable_id: "PY1", amount: 300 },
      { payable_id: "PY1", amount: 999, voided_at: "2026-11-10T10:00:00Z", void_reason: "pogrešan iznos" },
      { payable_id: "PY2", amount: 50 },
      { payable_id: "PY1", amount: 700 },
    ];
    expect(payableBalance(OBAVEZA, payments)).toMatchObject({ paid: 1000, remaining: 0, status: "paid", paymentCount: 2 });
    expect(payableBalance(OBAVEZA, [])).toMatchObject({ paid: 0, remaining: 1000, status: "unpaid" });
  });

  it("ukupno = obračunato + korekcije (adjustment); dospelost samo uz preostali dug", () => {
    const sa = { ...OBAVEZA, adjustments_amount: -50.5 };
    expect(payableTotal(sa)).toBe(949.5);
    expect(payableTotal({ ...sa, total_amount: "949.50" })).toBe(949.5);
    expect(payableBalance(sa, [{ payable_id: "PY1", amount: 100 }], { today: "2026-11-24" })).toMatchObject({ remaining: 849.5, overdue: true });
    expect(payableBalance(sa, [{ payable_id: "PY1", amount: 949.5 }], { today: "2026-11-24" }).overdue).toBe(false);
  });

  it("status: unpaid (0), partially_paid (0 < paid < total), paid (paid ≥ total)", () => {
    expect(paymentStatus(100, 0)).toBe("unpaid");
    expect(paymentStatus(100, 0.01)).toBe("partially_paid");
    expect(paymentStatus(100, 100)).toBe("paid");
  });

  it("canRecordPayment: kao guard_payment — bez preplate, ista valuta, samo potvrđena obaveza", () => {
    const b = payableBalance(OBAVEZA, [{ payable_id: "PY1", amount: 600 }]);
    expect(canRecordPayment(b, 400)).toEqual({ ok: true, reason: null, maxAmount: 400 });
    expect(canRecordPayment(b, "400,01")).toMatchObject({ ok: false, reason: "overpayment" });
    expect(canRecordPayment(b, 0)).toMatchObject({ ok: false, reason: "invalid_amount" });
    expect(canRecordPayment(b, "abc")).toMatchObject({ ok: false, reason: "invalid_amount" });
    expect(canRecordPayment(b, 10, { currency: "RSD" })).toMatchObject({ ok: false, reason: "currency_mismatch" });
    expect(canRecordPayment(b, 10, { payableStatus: "draft" })).toMatchObject({ ok: false, reason: "not_confirmed" });
  });

  it("payablesTotals: po valuti; nacrt je obračunat ali nije dug; otkazane se ne broje", () => {
    const list = [
      OBAVEZA,
      { id: "PY2", status: "draft", currency: "EUR", calculated_amount: 250, adjustments_amount: 0 },
      { id: "PY3", status: "cancelled", currency: "EUR", calculated_amount: 777, adjustments_amount: 0 },
      { id: "PY4", status: "confirmed", currency: "RSD", calculated_amount: 50000, adjustments_amount: 0, due_date: "2026-12-31" },
    ];
    const payments = [{ payable_id: "PY1", amount: 300 }, { payable_id: "PY1", amount: 200 }, { payable_id: "PY4", amount: 10000 }];
    expect(payablesTotals(list, payments, { today: "2026-11-24" })).toEqual({
      EUR: { count: 2, draftCount: 1, calculated: 1250, confirmed: 1000, paid: 500, remaining: 500, overdue: 500 },
      RSD: { count: 1, draftCount: 0, calculated: 50000, confirmed: 50000, paid: 10000, remaining: 40000, overdue: 0 },
    });
  });

  it("payablesTotals prima i redove view-a payable_balances (paid_amount)", () => {
    const list = [{ ...OBAVEZA, total_amount: 1000, paid_amount: 450 }];
    expect(payablesTotals(list).EUR).toMatchObject({ paid: 450, remaining: 550 });
  });
});
