import { describe, expect, it } from "vitest";
import { billingBalance, billingTotals, summaryCoversLine, unbilledRevenue } from "./billing.js";
import { laborDayLines } from "./laborLines.js";
import { v2Timesheet } from "./testFixtures.js";

const PREGLED = {
  id: "B1", client_id: "C1", project_id: null, period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR",
  status: "invoiced_externally", calculated_amount: 980, ext_invoice_reference: "2026-0042", ext_invoice_amount: 1000,
  ext_invoice_currency: "EUR", ext_due_date: "2026-12-15",
};

describe("billing — interni obračun i uplate klijenta (spec §9)", () => {
  it("T16: invoiced 1000, uplate 400 + 300 → outstanding 300, partially_paid", () => {
    const uplate = [{ billing_summary_id: "B1", amount: 400 }, { billing_summary_id: "B1", amount: 300 }];
    expect(billingBalance(PREGLED, uplate)).toEqual({
      calculated: 980, invoiced: 1000, received: 700, outstanding: 300, estimatedUnpaid: null,
      status: "partially_paid", currency: "EUR", overdue: false, paymentCount: 2,
    });
  });

  it("T16: bez eksternog iznosa → estimatedUnpaid, outstanding null", () => {
    const bez = { ...PREGLED, ext_invoice_amount: null, ext_invoice_currency: null, status: "ready_for_accounting" };
    expect(billingBalance(bez, [{ billing_summary_id: "B1", amount: 400 }])).toMatchObject({
      calculated: 980, invoiced: null, received: 400, outstanding: null, estimatedUnpaid: 580, status: "partially_paid",
    });
  });

  it("stornirana uplata se ne broji; in_preparation koristi živi obračun; dospelost samo uz eksterni dug", () => {
    const priprema = { ...PREGLED, calculated_amount: null, ext_invoice_amount: null, status: "in_preparation" };
    const uplate = [{ billing_summary_id: "B1", amount: 100, voided_at: "2026-11-20T08:00:00Z", void_reason: "duplikat" }];
    expect(billingBalance(priprema, uplate, { calculatedAmount: 1234.5 })).toMatchObject({ calculated: 1234.5, received: 0, estimatedUnpaid: 1234.5, status: "unpaid", overdue: false });
    expect(billingBalance(PREGLED, [], { today: "2026-12-16" }).overdue).toBe(true);
    expect(billingBalance(PREGLED, [{ billing_summary_id: "B1", amount: 1000 }], { today: "2026-12-16" })).toMatchObject({ status: "paid", overdue: false, outstanding: 0 });
  });

  it("valuta uplata = valuta eksterne fakture kad postoji", () => {
    expect(billingBalance({ ...PREGLED, ext_invoice_currency: "RSD" }, []).currency).toBe("RSD");
  });

  it("billingTotals po valuti: outstanding samo za fakturisane, estimatedUnpaid samo za ostale", () => {
    const drugi = { ...PREGLED, id: "B2", calculated_amount: 500, ext_invoice_amount: null, ext_invoice_currency: null };
    const uplate = [{ billing_summary_id: "B1", amount: 400 }, { billing_summary_id: "B2", amount: 100 }];
    expect(billingTotals([PREGLED, drugi], uplate)).toEqual({
      EUR: { count: 2, calculated: 1480, invoiced: 1000, received: 500, outstanding: 600, estimatedUnpaid: 400, overdue: 0 },
    });
  });

  it("unbilledRevenue: prihod odobrenih sati van svih pregleda (klijent, projekat, period, valuta)", () => {
    const projects = [{ id: "P1", client_id: "C1" }, { id: "P2", client_id: "C1" }, { id: "P3", client_id: null }];
    const ts = [
      v2Timesheet({ id: "T1", project_id: "P1", week_start: "2026-11-02", days: [{ i: 0, hours: 8 }] }),          // u pregledu P1
      v2Timesheet({ id: "T2", project_id: "P2", week_start: "2026-11-02", days: [{ i: 0, hours: 4 }] }),          // nije
      v2Timesheet({ id: "T3", project_id: "P1", week_start: "2026-12-07", days: [{ i: 0, hours: 2 }] }),          // van perioda
      v2Timesheet({ id: "T4", project_id: "P3", week_start: "2026-11-02", days: [{ i: 0, hours: 1 }] }),          // bez klijenta
      v2Timesheet({ id: "T5", project_id: "P1", week_start: "2026-11-02", days: [{ i: 1, hours: 3, c: 6000, cCur: "RSD" }] }), // druga valuta
    ];
    const { lines } = laborDayLines(ts, { projects });
    const pregled = { ...PREGLED, project_id: "P1" };
    expect(summaryCoversLine(pregled, lines.find((l) => l.timesheetId === "T1"))).toBe(true);
    expect(unbilledRevenue(lines, [pregled])).toEqual({ hours: 9, revenue: { EUR: 300, RSD: 18000 }, lineCount: 3, missingRate: 0, withoutClient: 1 });
    // pregled za sve projekte klijenta pokriva i P2
    expect(unbilledRevenue(lines, [PREGLED]).revenue).toEqual({ EUR: 100, RSD: 18000 });
  });
});
