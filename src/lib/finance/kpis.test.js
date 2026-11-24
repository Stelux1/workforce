import { describe, expect, it } from "vitest";
import { kpisByCurrency, laborMargin, netProfit, profitMargin } from "./kpis.js";
import { financialSummary } from "./summary.js";
import { payablesTotals } from "./payables.js";
import { billingBalance } from "./billing.js";
import { v2Timesheet } from "./testFixtures.js";

const NOV = { from: "2026-11-01", to: "2026-11-30" };
const PROJECTS = [{ id: "P1", client_id: "C1" }, { id: "P2", client_id: "C1" }];

describe("KPI formule (spec §10)", () => {
  it("§5 primer: 8 × B2C 45 × 1.0 = 360 trošak; 8 × B2B 50 × 1.0 = 400 prihod", () => {
    const ts = [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8, w: 45, wc: 1, c: 50, cc: 1 }] })];
    const s = financialSummary({ timesheets: ts, range: NOV, projects: PROJECTS });
    expect(s.approvedHours).toBe(8);
    expect(s.byCurrency.EUR).toEqual({
      laborRevenue: 400, payrollCost: 360, laborMargin: 40, additionalCosts: 0, netProfit: 40, profitMargin: 10,
    });
  });

  it("Net Profit = prihod − payroll cost − dodatni troškovi; billable se ne izdvaja iz troška (T15)", () => {
    const ts = [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }, { i: 1, hours: 8 }] })]; // 800 / 720
    const costs = [
      { id: "K1", project_id: "P1", cost_date: "2026-11-05", amount: 30, currency: "EUR", billable: true },
      { id: "K2", project_id: "P1", cost_date: "2026-11-06", amount: 20, currency: "EUR" },
      { id: "K3", project_id: "P1", cost_date: "2026-12-01", amount: 999, currency: "EUR" }, // van perioda
      { id: "K4", project_id: "P1", cost_date: "2026-11-07", amount: 2344, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 20, fx_rate_date: "2026-11-07" },
    ];
    const s = financialSummary({ timesheets: ts, costs, range: NOV, projects: PROJECTS });
    expect(s.byCurrency.EUR).toEqual({ laborRevenue: 800, payrollCost: 720, laborMargin: 80, additionalCosts: 50, netProfit: 30, profitMargin: 3.75 });
    // RSD trošak ostaje u svojoj valuti (T28) — nije sabran sa EUR
    expect(s.byCurrency.RSD).toEqual({ laborRevenue: 0, payrollCost: 0, laborMargin: 0, additionalCosts: 2344, netProfit: -2344, profitMargin: null });
    expect(s.currencies).toEqual(["EUR", "RSD"]);
  });

  it("Profit Margin je null kad je prihod 0 (ne 0 i ne beskonačno)", () => {
    expect(profitMargin(-100, 0)).toBeNull();
    expect(profitMargin(0, 0)).toBeNull();
    expect(profitMargin(10, -5)).toBeNull();
    expect(profitMargin(1, 3)).toBe(33.33);
    const s = financialSummary({ timesheets: [], costs: [{ project_id: "P1", cost_date: "2026-11-02", amount: 100, currency: "EUR" }], range: NOV });
    expect(s.byCurrency.EUR).toMatchObject({ laborRevenue: 0, netProfit: -100, profitMargin: null });
  });

  it("formule po valuti ne mešaju valute", () => {
    expect(laborMargin({ EUR: 400 }, { EUR: 360, RSD: 1000 })).toEqual({ EUR: 40, RSD: -1000 });
    expect(netProfit({ EUR: 400 }, { EUR: 360 }, { EUR: 15.5 })).toEqual({ EUR: 24.5 });
    expect(kpisByCurrency({ revenue: { GBP: 10 } }).GBP).toEqual({ laborRevenue: 10, payrollCost: 0, laborMargin: 10, additionalCosts: 0, netProfit: 10, profitMargin: 100 });
  });

  it("procena (submitted) je odvojena i nije u konačnim KPI-jevima (T09)", () => {
    const ts = [
      v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }] }),
      v2Timesheet({ id: "T2", status: "submitted", estimate: true, days: [{ i: 1, hours: 4 }] }),
    ];
    const s = financialSummary({ timesheets: ts, range: NOV });
    expect(s.approvedHours).toBe(8);
    expect(s.byCurrency.EUR.laborRevenue).toBe(400);
    expect(s.pendingEstimate).toEqual({ hours: 4, laborRevenue: { EUR: 200 }, payrollCost: { EUR: 180 }, problems: [] });
  });

  it("filter Job Role: troškovi se ne pripisuju ulozi", () => {
    const ts = [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }] })];
    const costs = [{ project_id: "P1", cost_date: "2026-11-02", amount: 100, currency: "EUR" }];
    const s = financialSummary({ timesheets: ts, costs, range: NOV, filters: { projectRoleId: "R1" }, assignments: [{ id: "A1", project_role_id: "R1" }] });
    expect(s.costsNotAttributable).toBe(true);
    expect(s.byCurrency.EUR).toMatchObject({ laborRevenue: 400, additionalCosts: 0 });
  });

  it("„Prikaži u EUR\": kurs i datum se vraćaju; bez kursa profit je null, ne netačan broj (T28)", () => {
    const ts = [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }, { i: 1, hours: 8, w: 5000, wCur: "RSD" }] })];
    const costs = [{ id: "K1", project_id: "P1", cost_date: "2026-11-03", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100, fx_rate_date: "2026-11-03" }];
    const rates = [{ rate_date: "2026-11-01", currency: "RSD", units_per_eur: 117.2, source: "NBS" }];
    const sa = financialSummary({ timesheets: ts, costs, range: NOV, exchangeRates: rates });
    // prihod 800 EUR; trošak 360 EUR + 40000 RSD (= 341.30 EUR); trošak projekta 100 EUR po kursu sa troška
    expect(sa.converted).toMatchObject({ to: "EUR", date: "2026-11-30", laborRevenue: 800, payrollCost: 701.3, laborMargin: 98.7, additionalCosts: 100, netProfit: -1.3, missing: [] });
    expect(sa.converted.used).toEqual(expect.arrayContaining([
      { currency: "RSD", unitsPerEur: 117.2, rateDate: "2026-11-01", source: "NBS" },
      { costId: "K1", currency: "RSD", unitsPerEur: 117.2, rateDate: "2026-11-03", source: "project_cost" },
    ]));
    const bez = financialSummary({ timesheets: ts, costs, range: NOV, exchangeRates: [] });
    expect(bez.converted).toMatchObject({ laborRevenue: 800, payrollCost: null, laborMargin: null, netProfit: null, profitMargin: null, missing: ["RSD"] });
    // originalni iznosi ostaju po valuti
    expect(bez.byCurrency.RSD.payrollCost).toBe(40000);
  });
});

describe("T17: obračun se ne meša sa fakturisanim, uplaćenim i isplaćenim", () => {
  it("financialSummary nema polja uplata/isplata/fakturisanog", () => {
    const s = financialSummary({ timesheets: [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }] })], range: NOV });
    const keys = JSON.stringify(Object.keys(s)) + JSON.stringify(Object.keys(s.byCurrency.EUR));
    expect(keys).not.toMatch(/paid|payment|invoic|received|outstanding|remaining|cash/i);
  });

  it("na istom primeru profit, fakturisano, uplaćeno i isplaćeno su četiri različite vrednosti", () => {
    // 20 h: prihod 20 × 50 = 1000, trošak 20 × 45 = 900, dodatni trošak 40 → profit 60
    const ts = [v2Timesheet({ id: "T1", days: [{ i: 0, hours: 10 }, { i: 1, hours: 10 }] })];
    const s = financialSummary({ timesheets: ts, costs: [{ project_id: "P1", cost_date: "2026-11-04", amount: 40, currency: "EUR" }], range: NOV });
    const summary = { id: "B1", calculated_amount: 1000, ext_invoice_amount: 950, currency: "EUR" };
    const billing = billingBalance(summary, [{ billing_summary_id: "B1", amount: 700 }]);
    const payables = payablesTotals([{ id: "PY1", status: "confirmed", currency: "EUR", total_amount: 900 }], [{ payable_id: "PY1", amount: 500 }]);
    const vrednosti = [s.byCurrency.EUR.netProfit, billing.invoiced, billing.received, payables.EUR.paid];
    expect(vrednosti).toEqual([60, 950, 700, 500]);
    expect(new Set(vrednosti).size).toBe(4);
    // Payroll Cost (obračun) ≠ isplaćeno; interni B2B obračun ≠ eksterno fakturisano
    expect(s.byCurrency.EUR.payrollCost).toBe(900);
    expect(payables.EUR.remaining).toBe(400);
    expect(billing.calculated).toBe(1000);
  });
});
