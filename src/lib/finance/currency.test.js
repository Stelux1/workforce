import { describe, expect, it } from "vitest";
import { addByCurrency, convertTotals, costEurAmount, money, normalizeCurrency, rateFor, subtractByCurrency, sumByCurrency } from "./currency.js";

const KURSEVI = [
  { rate_date: "2026-10-31", currency: "RSD", units_per_eur: 117.2, source: "NBS" },
  { rate_date: "2026-11-15", currency: "RSD", units_per_eur: 117.4, source: "NBS" },
  { rate_date: "2026-11-15", currency: "GBP", units_per_eur: 0.85, source: "ECB" },
];

describe("currency — valute bez mešanja (K3)", () => {
  it("money zaokružuje pola od nule i proverava valutu", () => {
    expect(money(1.005, "eur")).toEqual({ amount: 1.01, currency: "EUR" });
    expect(money(-2.345)).toEqual({ amount: -2.35, currency: "EUR" });
    expect(normalizeCurrency("")).toBe("EUR");
    expect(() => normalizeCurrency("CHF")).toThrow(/Nepoznata valuta/);
  });

  it("sumByCurrency sabira u centima, po valuti, a prazan iznos preskače", () => {
    const items = [
      { amount: 0.1, currency: "EUR" }, { amount: 0.2, currency: "EUR" }, { amount: 1000, currency: "RSD" },
      { amount: null, currency: "EUR" }, { amount: 5 },
    ];
    expect(sumByCurrency(items)).toEqual({ EUR: 5.3, RSD: 1000 });
    expect(sumByCurrency([{ v: 7.5 * 19.99, c: "GBP" }], { amountOf: (i) => i.v, currencyOf: (i) => i.c })).toEqual({ GBP: 149.93 });
    expect(addByCurrency({ EUR: 1 }, { EUR: 2, RSD: 3 })).toEqual({ EUR: 3, RSD: 3 });
    expect(subtractByCurrency({ EUR: 10 }, { EUR: 4, RSD: 100 })).toEqual({ EUR: 6, RSD: -100 });
  });

  it("T28: EUR + RSD bez kursa → dva zbira, RSD nije u EUR totalu", () => {
    const zbir = sumByCurrency([{ amount: 400, currency: "EUR" }, { amount: 11720, currency: "RSD" }]);
    expect(zbir).toEqual({ EUR: 400, RSD: 11720 });
    const bez = convertTotals(zbir, [], { to: "EUR", date: "2026-11-30" });
    expect(bez.total).toBe(400);
    expect(bez.missing).toEqual(["RSD"]);
    expect(bez.used).toEqual([]);
  });

  it("T28: sa kursom → total uz used[{rateDate}] (kurs na datum, ne posle)", () => {
    const zbir = { EUR: 400, RSD: 11720 };
    const r = convertTotals(zbir, KURSEVI, { to: "EUR", date: "2026-11-10" });
    expect(r.total).toBe(500); // 11720 / 117.2 = 100
    expect(r.missing).toEqual([]);
    expect(r.used).toEqual([{ currency: "RSD", unitsPerEur: 117.2, rateDate: "2026-10-31", source: "NBS" }]);
    const kasnije = convertTotals(zbir, KURSEVI, { date: "2026-11-20" });
    expect(kasnije.used[0].rateDate).toBe("2026-11-15");
    expect(kasnije.total).toBe(499.83); // 11720 / 117.4 = 99.829 → 99.83
  });

  it("konverzija u drugu valutu ide preko EUR i prikazuje oba kursa", () => {
    const r = convertTotals({ EUR: 100 }, KURSEVI, { to: "GBP", date: "2026-11-20" });
    expect(r.total).toBe(85);
    expect(r.used).toEqual([{ currency: "GBP", unitsPerEur: 0.85, rateDate: "2026-11-15", source: "ECB" }]); // EUR je osnova
    const r2 = convertTotals({ RSD: 11740 }, KURSEVI, { to: "GBP", date: "2026-11-20" });
    expect(r2.total).toBe(85);
    expect(r2.used.map((u) => u.currency)).toEqual(["RSD", "GBP"]);
    expect(rateFor("USD", KURSEVI, "2026-11-20")).toBeNull();
  });

  it("T28 troškovi: ne-EUR trošak ulazi u EUR samo uz datum kursa", () => {
    expect(costEurAmount({ amount: 50, currency: "EUR" })).toMatchObject({ eur: 50, reason: null });
    expect(costEurAmount({ amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100, fx_rate_date: "2026-11-03" }))
      .toEqual({ eur: 100, currency: "RSD", unitsPerEur: 117.2, rateDate: "2026-11-03", reason: null });
    expect(costEurAmount({ amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100 }))
      .toMatchObject({ eur: null, reason: "rate_without_date" });
    expect(costEurAmount({ amount: 11720, currency: "RSD" })).toMatchObject({ eur: null, reason: "missing_rate" });
  });
});
