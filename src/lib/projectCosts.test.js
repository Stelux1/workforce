import { describe, expect, it } from "vitest";
import {
  buildCostPayload, categoryRowsForCurrency, costExportRows, costFxStatus, costParty, costTotalsByCurrency,
  costsByCategory, costsEurEquivalent, filterCosts, formatMoney, possibleDuplicate, sortCosts, uniqueCosts,
  validateCostForm,
} from "./projectCosts.js";
import { sumCostsEur } from "./payroll/costs.js";
import { projectFinancialReport } from "./payroll/projectReport.js";

const P1 = "p1";
const P2 = "p2";
const projects = [
  { id: P1, name: "Hala A", client_id: "c1", client_name: "Klijent 1", project_number: "P-001" },
  { id: P2, name: "Hala B", client_id: "c2", client_name: "Klijent 2" },
];
const categories = [
  { id: "cat-acc", name: "Accommodation", subcategories: [{ name: "Apartment Rental" }, { name: "Utilities" }] },
  { id: "cat-misc", name: "Miscellaneous Costs", subcategories: [] },
  { id: "cat-labor", name: "Labour", subcategories: [], payroll_linked: true },
];
const cost = (over) => ({
  id: "k1", project_id: P1, cost_date: "2026-11-10", amount: 100, currency: "EUR", cost_category_id: "cat-acc",
  category: "Accommodation", subcategory: "Utilities", billable: false, ...over,
});

describe("T13 — isti trošak u oba pogleda, jednom", () => {
  const all = [cost({ id: "a" }), cost({ id: "b", project_id: P2 })];
  it("trošak dodat u projektu postoji jednom u centralnom spisku i jednom u projektu", () => {
    const central = filterCosts(all, {});
    const inProject = filterCosts(all, { projectId: P1 });
    expect(central.filter((c) => c.id === "a")).toHaveLength(1);
    expect(inProject.map((c) => c.id)).toEqual(["a"]);
  });
  it("isti red stigao dvaput (npr. dva upita) se broji jednom", () => {
    const twice = [...all, { ...all[0] }];
    expect(uniqueCosts(twice)).toHaveLength(2);
    expect(costTotalsByCurrency(uniqueCosts(twice))).toEqual({ EUR: 200 });
  });
});

describe("T14 — trošak sa kategorijom i radnikom ulazi jednom u projektni profit", () => {
  it("izveštaj projekta: jedan trošak sa radnikom = jedan put oduzet", () => {
    const c = cost({ id: "w1", amount: 250, employee_id: "e1" });
    const report = projectFinancialReport({ projectId: P1, timesheets: [], costs: uniqueCosts([c, c]), runs: [], payslips: [], payslipProjects: [] });
    expect(report.costs.count).toBe(1);
    expect(report.costs.eur).toBe(250);
    expect(report.totals.otherCosts).toBe(250);
  });
  it("trošak radnika i dobavljača se ne vezuju zajedno", () => {
    expect(costParty({ employee_id: "e1" })).toBe("employee");
    expect(costParty({ vendor_id: "v1" })).toBe("vendor");
    expect(costParty({})).toBeNull();
    expect(validateCostForm({ ...cost(), employee_id: "e1", vendor_id: "v1" }, { categories }).employee_id).toBe("one_party");
  });
});

describe("T15 — Billable je samo oznaka", () => {
  it("billable ne menja nijedan zbir i ne uvodi nikakav prihod", () => {
    const plain = [cost({ id: "a", amount: 80 }), cost({ id: "b", amount: 20 })];
    const flagged = plain.map((c) => ({ ...c, billable: true }));
    expect(costTotalsByCurrency(flagged)).toEqual(costTotalsByCurrency(plain));
    expect(sumCostsEur(flagged).total).toBe(sumCostsEur(plain).total);
    const report = (costs) => projectFinancialReport({ projectId: P1, timesheets: [], costs, runs: [], payslips: [], payslipProjects: [] });
    expect(report(flagged).totals.revenue).toBe(0);
    expect(report(flagged).totals.otherCosts).toBe(report(plain).totals.otherCosts);
  });
  it("filter po oznaci billable samo izdvaja kandidate", () => {
    const list = [cost({ id: "a", billable: true }), cost({ id: "b" })];
    expect(filterCosts(list, { billable: "yes" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterCosts(list, { billable: "no" }).map((c) => c.id)).toEqual(["b"]);
  });
});

describe("T28 — nema sabiranja valuta bez kursa i datuma", () => {
  const list = [
    cost({ id: "e", amount: 100 }),
    cost({ id: "r1", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100, fx_rate_date: "2026-11-01" }),
    cost({ id: "r2", amount: 5000, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 42.66 }), // kurs bez datuma (stari red)
    cost({ id: "r3", amount: 3000, currency: "RSD" }), // bez kursa
    cost({ id: "g", amount: 50, currency: "GBP", eur_rsd_rate: 0.86, eur_amount: 58.14, fx_rate_date: "2026-11-02" }),
  ];
  it("zbir je po valuti, nikad jedan broj", () => {
    expect(costTotalsByCurrency(list)).toEqual({ EUR: 100, RSD: 19720, GBP: 50 });
  });
  it("RSD bez kursa ili bez datuma kursa nije u EUR zbiru", () => {
    const s = sumCostsEur(list);
    expect(s.total).toBe(258.14); // 100 + 100 + 58,14
    expect(s.missingRate.map((c) => c.id)).toEqual(["r2", "r3"]);
    expect(s.undatedRate.map((c) => c.id)).toEqual(["r2"]);
    expect(s.undatedByCurrency).toEqual({ RSD: 5000 });
  });
  it("EUR ekvivalent navodi kurs i datum i izdvaja isključene", () => {
    const eq = costsEurEquivalent(list);
    expect(eq.eur).toBe(258.14);
    expect(eq.counted).toBe(3);
    expect(eq.rates).toEqual([
      { currency: "RSD", unitsPerEur: 117.2, rateDate: "2026-11-01" },
      { currency: "GBP", unitsPerEur: 0.86, rateDate: "2026-11-02" },
    ]);
    expect(eq.excluded.rateWithoutDate.map((c) => c.id)).toEqual(["r2"]);
    expect(eq.excluded.missingRate.map((c) => c.id)).toEqual(["r3"]);
  });
  it("status kursa po redu", () => {
    expect(list.map(costFxStatus)).toEqual(["eur", "ok", "rate_without_date", "missing_rate", "ok"]);
  });
});

describe("filteri C1/C2", () => {
  const list = [
    cost({ id: "1", cost_date: "2026-11-01", description: "Stan oktobar" }),
    cost({ id: "2", cost_date: "2026-11-15", project_id: P2, cost_category_id: "cat-misc", category: "Miscellaneous Costs", subcategory: null, notes: "Bankarska provizija" }),
    cost({ id: "3", cost_date: "2026-12-01", cost_category_id: null, category: "materials", subcategory: null }),
  ];
  const lookup = { projects, employees: [{ id: "e1", first_name: "Ana", last_name: "Anić" }], vendors: [{ id: "v1", name: "Stan d.o.o." }] };
  it("projekat, klijent, kategorija, potkategorija, datum", () => {
    expect(filterCosts(list, { projectId: P2 }).map((c) => c.id)).toEqual(["2"]);
    expect(filterCosts(list, { clientId: "c1" }, lookup).map((c) => c.id)).toEqual(["1", "3"]);
    expect(filterCosts(list, { categoryId: "cat-acc" }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCosts(list, { categoryId: "none" }).map((c) => c.id)).toEqual(["3"]);
    expect(filterCosts(list, { subcategory: " utilities " }).map((c) => c.id)).toEqual(["1"]);
    expect(filterCosts(list, { from: "2026-11-02", to: "2026-11-30" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterCosts(list, { from: "2026-11-15", to: "2026-11-15" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterCosts(list, { projectId: "all", categoryId: "" })).toHaveLength(3);
  });
  it("pretraga: opis, napomena, projekat, radnik, dobavljač", () => {
    const withParty = [{ ...list[0], employee_id: "e1" }, { ...list[1], vendor_id: "v1" }, list[2]];
    expect(filterCosts(withParty, { search: "oktobar" }, lookup).map((c) => c.id)).toEqual(["1"]);
    expect(filterCosts(withParty, { search: "provizija" }, lookup).map((c) => c.id)).toEqual(["2"]);
    expect(filterCosts(withParty, { search: "anić" }, lookup).map((c) => c.id)).toEqual(["1"]);
    expect(filterCosts(withParty, { search: "stan d.o.o" }, lookup).map((c) => c.id)).toEqual(["2"]);
    expect(filterCosts(withParty, { search: "hala b" }, lookup).map((c) => c.id)).toEqual(["2"]);
  });
  it("sortiranje je stabilno, a praznine idu na kraj", () => {
    expect(sortCosts(list, { key: "cost_date", dir: "asc" }).map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(sortCosts(list, { key: "cost_date", dir: "desc" }).map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(sortCosts(list, { key: "subcategory", dir: "asc" }).map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(sortCosts(list, { key: "project", dir: "asc" }, lookup).map((c) => c.id)).toEqual(["1", "3", "2"]);
  });
});

describe("analitika po kategorijama", () => {
  it("zbir po kategoriji i valuti; bez kategorije ide u poseban red na kraju", () => {
    const list = [
      cost({ id: "1", amount: 100 }), cost({ id: "2", amount: 50 }),
      cost({ id: "3", amount: 1000, currency: "RSD" }),
      cost({ id: "4", amount: 10, cost_category_id: "cat-misc", category: "Miscellaneous Costs" }),
      cost({ id: "5", amount: 7, cost_category_id: null, category: "materials" }),
    ];
    const rows = costsByCategory(list, categories);
    expect(rows.map((r) => [r.key, r.count, r.byCurrency])).toEqual([
      ["cat-acc", 3, { EUR: 150, RSD: 1000 }],
      ["cat-misc", 1, { EUR: 10 }],
      ["none", 1, { EUR: 7 }],
    ]);
    expect(categoryRowsForCurrency(rows, "RSD").map((r) => r.key)).toEqual(["cat-acc"]);
    expect(categoryRowsForCurrency(rows, "EUR").map((r) => r.amount)).toEqual([150, 10, 7]);
  });
  it("preimenovanje kategorije ne menja zbir po cost_category_id", () => {
    const list = [cost({ id: "1", amount: 100 }), cost({ id: "2", amount: 25.5 })];
    const before = costsByCategory(list, categories);
    const renamed = list.map((c) => ({ ...c, category: "Smeštaj" }));
    const after = costsByCategory(renamed, categories.map((c) => (c.id === "cat-acc" ? { ...c, name: "Smeštaj" } : c)));
    expect(after[0].key).toBe(before[0].key);
    expect(after[0].byCurrency).toEqual(before[0].byCurrency);
    expect(after[0].name).toBe("Smeštaj");
  });
});

describe("provera forme (ista pravila kao baza)", () => {
  const ok = { project_id: P1, cost_date: "2026-11-10", amount: "100", currency: "EUR", cost_category_id: "cat-acc", subcategory: "Utilities" };
  it("ispravan EUR trošak", () => {
    expect(validateCostForm(ok, { categories })).toEqual({});
  });
  it("obavezna polja: projekat, datum, iznos, valuta, kategorija", () => {
    const e = validateCostForm({ amount: "", currency: "" }, { categories });
    expect(Object.keys(e).sort()).toEqual(["amount", "cost_category_id", "cost_date", "currency", "project_id"]);
  });
  it("potkategorija je obavezna kad je kategorija ima, i mora postojati; bez podkategorija se ne traži", () => {
    expect(validateCostForm({ ...ok, subcategory: "" }, { categories }).subcategory).toBe("required");
    expect(validateCostForm({ ...ok, subcategory: "Nepostojeća" }, { categories }).subcategory).toBe("unknown");
    expect(validateCostForm({ ...ok, subcategory: "utilities" }, { categories })).toEqual({});
    expect(validateCostForm({ ...ok, cost_category_id: "cat-misc", subcategory: "" }, { categories })).toEqual({});
  });
  it("kategorija koja predstavlja trošak rada se odbija", () => {
    expect(validateCostForm({ ...ok, cost_category_id: "cat-labor" }, { categories }).cost_category_id).toBe("payroll_linked");
  });
  it("ne-EUR traži kurs i datum kursa", () => {
    const rsd = { ...ok, currency: "RSD" };
    expect(validateCostForm(rsd, { categories })).toMatchObject({ eur_rsd_rate: "required", fx_rate_date: "required" });
    expect(validateCostForm({ ...rsd, eur_rsd_rate: "117,2" }, { categories })).toEqual({ fx_rate_date: "required" });
    expect(validateCostForm({ ...rsd, eur_rsd_rate: "117,2", fx_rate_date: "2026-11-01" }, { categories })).toEqual({});
    expect(validateCostForm({ ...rsd, eur_rsd_rate: "0", fx_rate_date: "2026-11-01" }, { categories }).eur_rsd_rate).toBe("required");
  });
  it("negativan iznos nije dozvoljen", () => {
    expect(validateCostForm({ ...ok, amount: "-1" }, { categories }).amount).toBe("negative");
  });
  it("payload: EUR čisti kurs i datum kursa, decimalni zarez se prima", () => {
    expect(buildCostPayload({ ...ok, eur_rsd_rate: "117,2", fx_rate_date: "2026-11-01", amount: "10,5" })).toMatchObject({
      amount: 10.5, currency: "EUR", eur_rsd_rate: null, fx_rate_date: null, billable: false, employee_id: null, vendor_id: null,
    });
    expect(buildCostPayload({ ...ok, currency: "RSD", eur_rsd_rate: "117,2", fx_rate_date: "2026-11-01" })).toMatchObject({
      currency: "RSD", eur_rsd_rate: 117.2, fx_rate_date: "2026-11-01",
    });
  });
});

describe("mogući duplikat", () => {
  const list = [cost({ id: "a" })];
  it("isti projekat, datum, iznos i valuta → upozorenje; ne i sam red", () => {
    expect(possibleDuplicate({ project_id: P1, cost_date: "2026-11-10", amount: "100.00", currency: "EUR" }, list)).toHaveLength(1);
    expect(possibleDuplicate({ ...list[0] }, list)).toHaveLength(0);
    expect(possibleDuplicate({ project_id: P1, cost_date: "2026-11-10", amount: 100, currency: "RSD" }, list)).toHaveLength(0);
    expect(possibleDuplicate({ project_id: P2, cost_date: "2026-11-10", amount: 100, currency: "EUR" }, list)).toHaveLength(0);
    expect(possibleDuplicate({ project_id: P1, cost_date: "2026-11-11", amount: 100, currency: "EUR" }, list)).toHaveLength(0);
  });
});

describe("izvoz", () => {
  const lookup = { projects, employees: [{ id: "e1", first_name: "Ana", last_name: "Anić" }], vendors: [{ id: "v1", name: "Stan d.o.o." }] };
  const list = [
    cost({ id: "1", employee_id: "e1", billable: true, receipt_name: "racun.pdf", receipt_url: "https://signed/x" }),
    cost({ id: "2", currency: "RSD", amount: 11720, eur_rsd_rate: 117.2, fx_rate_date: "2026-11-01", vendor_id: "v1" }),
  ];
  it("bez prava costs.view nema redova", () => {
    expect(costExportRows(list, [], lookup)).toEqual([]);
    expect(costExportRows(list, undefined, lookup)).toEqual([]);
  });
  it("sa pravom: ceo skup, izvorna valuta, kurs i datum, bez linka priloga", () => {
    const rows = costExportRows(list, ["costs.view"], lookup);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ project: "P-001 — Hala A", client: "Klijent 1", worker: "Ana Anić", billable: true, receipt: "racun.pdf", eur_rsd_rate: null, fx_rate_date: "" });
    expect(rows[1]).toMatchObject({ vendor: "Stan d.o.o.", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, fx_rate_date: "2026-11-01" });
    expect(JSON.stringify(rows)).not.toContain("https://signed");
  });
  it("prihvata Set i funkciju kao prava", () => {
    expect(costExportRows(list, new Set(["costs.view"]), lookup)).toHaveLength(2);
    expect(costExportRows(list, (code) => code === "costs.view", lookup)).toHaveLength(2);
  });
});

describe("prikaz iznosa", () => {
  it("iznos uvek ide sa valutom", () => {
    expect(formatMoney(1234.5, "RSD", "en-GB")).toBe("1,234.50 RSD");
    expect(formatMoney(0, undefined, "en-GB")).toBe("0.00 EUR");
  });
});
