import { describe, expect, it } from "vitest";
import { allocate, round2, sum2 } from "./money.js";
import { PARAMS_2026_RSD, paramsInEur } from "./params.js";
import { fromGross, fromNet } from "./serbianPayroll.js";
import { computeWorkerMonth, MissingRateError, projectMargin } from "./monthly.js";
import { resolveTimesheetRates, timesheetAmounts, totalHours, validRate } from "./timesheet.js";

// Primeri u RSD su izračunati ručno (vidi komentare) — ne iz ovog koda.
const P = PARAMS_2026_RSD;
const TEST_KURS = 117.2; // samo za testove, nije zvanični kurs NBS
const PE = paramsInEur(P, TEST_KURS);

describe("money", () => {
  it("zaokružuje pola naviše bez float grešaka", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(sum2([0.1, 0.2])).toBe(0.3);
  });
  it("raspodela uvek sabira tačno ukupan iznos", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33.34, 33.33, 33.33]);
    const parts = allocate(1234.57, [3, 7, 11, 0.5]);
    expect(sum2(parts)).toBe(1234.57);
  });
  it("odbija nulte težine sa iznosom različitim od nule", () => {
    expect(() => allocate(10, [0, 0])).toThrow();
  });
});

describe("bruto → neto (RSD, parametri 2026)", () => {
  it("bruto 100.000", () => {
    // doprinosi 19,9% = 19.900; porez (100.000 − 34.221) × 10% = 6.577,90
    const r = fromGross(100000, P);
    expect(r.employeeTotal).toBe(19900);
    expect(r.tax).toBe(6577.9);
    expect(r.neto).toBe(73522.1);
    expect(r.employerTotal).toBe(15150);
    expect(r.totalCost).toBe(115150);
  });
  it("ispod najniže osnovice — doprinosi na 51.297", () => {
    // 7.181,58 + 2.641,80 + 384,73 = 10.208,11; porez 577,90
    const r = fromGross(40000, P);
    expect(r.contributionBase).toBe(51297);
    expect(r.employeeTotal).toBe(10208.11);
    expect(r.neto).toBe(29213.99);
    expect(r.belowMinBase).toBe(true);
  });
  it("iznad najviše osnovice — doprinosi na 732.820", () => {
    // 102.594,80 + 37.740,23 + 5.496,15 = 145.831,18; porez 96.577,90
    const r = fromGross(1000000, P);
    expect(r.employeeTotal).toBe(145831.18);
    expect(r.neto).toBe(757590.92);
    expect(r.employerTotal).toBe(111022.23);
    expect(r.totalCost).toBe(1111022.23);
    expect(r.aboveMaxBase).toBe(true);
  });
  it("nula sati = nula svega", () => {
    const r = fromGross(0, P);
    expect(r.neto).toBe(0);
    expect(r.totalCost).toBe(0);
  });
});

describe("neto → bruto", () => {
  it("neto 100.000 RSD daje bruto 137.771,62 i tačan neto", () => {
    // formula (100.000 − 3.422,10) / 0,701 = 137.771,68; posle zaokruživanja stavki tačan neto daje 137.771,62
    const r = fromNet(100000, P);
    expect(r.bruto).toBe(137771.62);
    expect(r.neto).toBe(100000);
    expect(r.exactNet).toBe(true);
  });
  it("povratni obračun se slaže za širok raspon iznosa u EUR", () => {
    for (let net = 50; net <= 9000; net += 37.13) {
      const target = round2(net);
      const r = fromNet(target, PE);
      expect(Math.abs(round2(r.neto - target))).toBeLessThanOrEqual(0.01);
      expect(fromGross(r.bruto, PE).neto).toBe(r.neto);
      expect(r.totalCost).toBeGreaterThan(r.bruto);
    }
  });
  it("nepun mesec srazmerno smanjuje neoporezivi iznos i osnovice", () => {
    const full = fromNet(300, PE);
    const half = fromNet(300, PE, { fraction: 0.5 });
    // pun mesec: bruto ispod najniže osnovice → doprinosi na najnižu osnovicu
    expect(full.belowMinBase).toBe(true);
    expect(full.contributionBase).toBe(round2(PE.minBase));
    // pola meseca: osnovica je prepolovljena pa je bruto iznad nje; neoporezivi iznos je takođe pola
    expect(half.belowMinBase).toBe(false);
    expect(half.contributionBase).toBe(half.bruto);
    expect(half.taxBase).toBe(round2(half.bruto - PE.nonTaxable / 2));
    expect(half.neto).toBe(300);
  });
});

describe("parametri", () => {
  it("bez kursa obračun ne kreće", () => {
    expect(() => paramsInEur(P, undefined)).toThrow("Kurs");
    expect(() => paramsInEur(P, 0)).toThrow("Kurs");
  });
});

const line = (o) => ({ projectId: "A", hourType: "redovni", workerRate: 12, workerCoef: 1, clientRate: 20, clientCoef: 1, ...o });

describe("mesečni obračun radnika", () => {
  it("168h redovno + 10h prekovremeno (koef. 1,26), neto satnica 12 €", () => {
    const m = computeWorkerMonth({
      engagement: "zaposleni",
      rateBasis: "neto",
      params: PE,
      lines: [line({ hours: 168 }), line({ hourType: "prekovremeni", hours: 10, workerCoef: 1.26, clientCoef: 1.26 })],
    });
    // 168 × 12 + 10 × 12 × 1,26 = 2.016 + 151,20
    expect(m.basisAmount).toBe(2167.2);
    expect(m.payout).toBe(2167.2);
    expect(m.calc.exactNet).toBe(true);
    // 168 × 20 + 10 × 20 × 1,26 = 3.360 + 252
    expect(m.revenue).toBe(3612);
    expect(m.laborCost).toBe(m.calc.totalCost);
    expect(m.hoursByType).toEqual({ redovni: 168, prekovremeni: 10 });
  });
  it("dnevni unosi daju isto što i jedan zbirni", () => {
    const daily = Array.from({ length: 21 }, () => line({ hours: 8 }));
    const a = computeWorkerMonth({ engagement: "zaposleni", params: PE, lines: daily });
    const b = computeWorkerMonth({ engagement: "zaposleni", params: PE, lines: [line({ hours: 168 })] });
    expect(a.payout).toBe(b.payout);
    expect(a.laborCost).toBe(b.laborCost);
  });
  it("trošak radnika na dva projekta se raspodeljuje bez gubitka centa", () => {
    const m = computeWorkerMonth({
      engagement: "zaposleni",
      params: PE,
      lines: [line({ hours: 100 }), line({ projectId: "B", hours: 77, workerRate: 13.5, clientRate: 22 })],
    });
    expect(m.projects).toHaveLength(2);
    expect(sum2(m.projects.map((p) => p.laborCost))).toBe(m.laborCost);
  });
  it("podizvođač: plaćamo iznos sati bez poreza", () => {
    const m = computeWorkerMonth({ engagement: "podizvodjac", lines: [line({ hours: 160, workerRate: 15 })] });
    expect(m.payout).toBe(2400);
    expect(m.laborCost).toBe(2400);
    expect(m.calc).toBeNull();
  });
  it("tarifa ili koeficijent koji fali prekida obračun (nikad 0)", () => {
    expect(() =>
      computeWorkerMonth({ engagement: "zaposleni", params: PE, lines: [line({ hours: 8, workerRate: null })] })
    ).toThrow(MissingRateError);
    expect(() =>
      computeWorkerMonth({ engagement: "zaposleni", params: PE, lines: [line({ hours: 8, clientCoef: undefined })] })
    ).toThrow(MissingRateError);
  });
});

describe("marža projekta", () => {
  it("prihod − radnici − ostali troškovi", () => {
    expect(projectMargin({ revenue: 3612, laborCost: 2500.5, otherCosts: 300 })).toEqual({
      revenue: 3612,
      laborCost: 2500.5,
      otherCosts: 300,
      remaining: 811.5,
      marginPct: 22.47,
    });
  });
});

// Satnica po današnjem pravilu ekrana (QA 14.11.2026): iste brojke kao baza (guard_timesheet).
describe("satnica (iznosi i tarife)", () => {
  it("46 h × 12/20 = 552 / 920 / 368, prekovremeno 6 (primer iz QA tabele)", () => {
    const row = { mon_hours: 8, tue_hours: 8, wed_hours: 8, thu_hours: 8, fri_hours: 8, sat_hours: 6, sun_hours: "" };
    const h = totalHours(row);
    expect(h).toBe(46);
    expect(timesheetAmounts(h, 12, 20)).toEqual({ worker_cost: 552, client_revenue: 920, profit: 368, overtime_hours: 6 });
  });

  it("tarifa koja fali daje null, nikad 0 (D4/D11)", () => {
    expect(timesheetAmounts(8, null, 20)).toEqual({ worker_cost: null, client_revenue: 160, profit: null, overtime_hours: 0 });
    expect(timesheetAmounts(8, 0, 20).worker_cost).toBeNull();
    expect(validRate(0)).toBeNull();
    expect(validRate("")).toBeNull();
    expect(validRate("12.5")).toBe(12.5);
  });

  it("tarifa: prvo dodela na projektu, pa profil radnika; bez obe → missing", () => {
    expect(resolveTimesheetRates({ b2c_rate: 12, b2b_rate: 20 }, { b2c_hourly_rate: 10 })).toEqual({ b2c: 12, b2b: 20, missing: [] });
    expect(resolveTimesheetRates({ b2b_rate: 20 }, { b2c_hourly_rate: 10 })).toEqual({ b2c: 10, b2b: 20, missing: [] });
    expect(resolveTimesheetRates({ b2b_rate: 20 }, {})).toEqual({ b2c: null, b2b: 20, missing: ["b2c"] });
    expect(resolveTimesheetRates(undefined, undefined).missing).toEqual(["b2c", "b2b"]);
  });

  it("decimalni sati se zaokružuju na cent", () => {
    expect(timesheetAmounts(7.5, 12.35, 19.99)).toEqual({ worker_cost: 92.63, client_revenue: 149.93, profit: 57.3, overtime_hours: 0 });
  });
});
