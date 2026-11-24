import { describe, expect, it } from "vitest";
import { financialSummary } from "../finance/index.js";
import { v2Timesheet } from "../finance/testFixtures.js";
import {
  billingSection, financialReport, financialReportExportRows, normalizeFilters, payablesSection, projectFinancialReport,
  reportVisibility,
} from "./projectReport.js";
import { payrollDue } from "./reports.js";

// Odobrena satnica v2 (snimak po danu): 8 h ponedeljak, B2C 45, B2B 50, koeficijenti 1.0 — primer iz spec-a §5.
const projects = [
  { id: "P1", name: "Hala A", client_id: "C1", client_name: "Klijent A" },
  { id: "P2", name: "Hala B", client_id: "C1", client_name: "Klijent A" },
  { id: "P3", name: "Most", client_id: "C2", client_name: "Klijent B" },
];
const assignments = [{ id: "A1", project_role_id: "R-WELD" }, { id: "A2", project_role_id: "R-FIT" }];
const T1 = v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }] });
const ALL = ["rates.view_b2b", "rates.view_b2c", "costs.view", "billing.view", "payroll.view", "reports.financial"];
const base = { projects, assignments };

describe("Financial Report — omotač oko financialSummary (§10, K4)", () => {
  it("§5 primer: 8 × 45 × 1.0 = 360 Payroll Cost; 8 × 50 × 1.0 = 400 Labor Revenue", () => {
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1] });
    expect(r.summary.approvedHours).toBe(8);
    expect(r.summary.byCurrency.EUR).toEqual({ laborRevenue: 400, payrollCost: 360, laborMargin: 40, additionalCosts: 0, netProfit: 40, profitMargin: 10 });
  });

  it("jedan obračunski servis: summary je tačno financialSummary za isti ulaz (nema paralelne formule)", () => {
    const T2 = v2Timesheet({ id: "T2", employee_id: "E2", project_id: "P3", assignment_id: "A2", days: [{ i: 1, hours: 10, code: "prekovremeni", wc: 1.5, cc: 1.6 }] });
    const costs = [{ id: "K1", project_id: "P1", cost_date: "2026-11-03", amount: 25, currency: "EUR" }];
    const input = { timesheets: [T1, T2], costs, range: { from: "2026-11-01", to: "2026-11-30" }, projects, assignments };
    expect(financialReport(input).summary).toEqual(financialSummary(input));
  });

  it("Profit Margin je null kad je Labor Revenue 0 (nije 0 ni ∞)", () => {
    // samo trošak projekta, bez odobrenih sati: prihod 0, profit −120, marža null
    const r = projectFinancialReport({ ...base, projectId: "P1", costs: [{ id: "K1", project_id: "P1", cost_date: "2026-11-02", amount: 120, currency: "EUR" }] });
    expect(r.summary.byCurrency.EUR).toEqual({ laborRevenue: 0, payrollCost: 0, laborMargin: 0, additionalCosts: 120, netProfit: -120, profitMargin: null });
    const empty = projectFinancialReport({ ...base, projectId: "P1" });
    expect(empty.summary.byCurrency).toEqual({});
    expect(empty.summary.approvedHours).toBe(0);
  });

  it("K4: srpski bruto 2 nije Payroll Cost — izveštaj ga ne prima i ne menja broj", () => {
    const withPayroll = projectFinancialReport({
      ...base, projectId: "P1", timesheets: [T1],
      runs: [{ id: "R1", month: "2026-11-01", status: "approved" }],
      payslipProjects: [{ payslip_id: "S1", project_id: "P1", hours: 8, labor_cost: 589.12 }],
    });
    expect(withPayroll.summary.byCurrency.EUR.payrollCost).toBe(360);
  });

  it("T09: submitted i rejected ne ulaze u konačne brojke; submitted je odvojena procena", () => {
    const sub = v2Timesheet({ id: "S", status: "submitted", estimate: true, days: [{ i: 2, hours: 4 }] });
    const rej = { ...v2Timesheet({ id: "X", days: [{ i: 3, hours: 6 }] }), approval_status: "rejected" };
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1, sub, rej] });
    expect(r.summary.approvedHours).toBe(8);
    expect(r.summary.pendingEstimate.hours).toBe(4);
    expect(r.summary.pendingEstimate.laborRevenue).toEqual({ EUR: 200 });
  });

  it("razrada po projektu, klijentu, radniku i ulozi sabira se tačno u zbir (po valuti)", () => {
    const T2 = v2Timesheet({ id: "T2", employee_id: "E2", project_id: "P2", assignment_id: "A2", days: [{ i: 0, hours: 5 }] });
    const T3 = v2Timesheet({ id: "T3", employee_id: "E3", project_id: "P3", assignment_id: "A2", days: [{ i: 0, hours: 2 }] });
    const r = financialReport({ ...base, timesheets: [T1, T2, T3] });
    const total = r.summary.byCurrency.EUR.laborRevenue;
    for (const dim of ["project", "client", "employee", "role"]) {
      expect(r.breakdown[dim].reduce((a, x) => a + (x.revenue.EUR || 0), 0)).toBe(total);
    }
    expect(r.breakdown.client.map((x) => [x.key, x.hours])).toEqual([["C1", 13], ["C2", 2]]);
    expect(r.breakdown.role.map((x) => [x.key, x.hours])).toEqual([["R-FIT", 7], ["R-WELD", 8]]);
  });

  it("filteri Client / Employee / Job Role / Cost Category idu kroz isti servis", () => {
    const T2 = v2Timesheet({ id: "T2", employee_id: "E2", project_id: "P3", assignment_id: "A2", days: [{ i: 0, hours: 5 }] });
    const costs = [
      { id: "K1", project_id: "P1", cost_date: "2026-11-02", amount: 30, currency: "EUR", cost_category_id: "cat-acc" },
      { id: "K2", project_id: "P1", cost_date: "2026-11-02", amount: 70, currency: "EUR", cost_category_id: "cat-misc" },
    ];
    const run = (filters) => financialReport({ ...base, timesheets: [T1, T2], costs, filters });
    expect(run({ clientId: "C2" }).summary.approvedHours).toBe(5);
    expect(run({ employeeId: "E1" }).summary.approvedHours).toBe(8);
    expect(run({ projectRoleId: "R-FIT" }).summary.approvedHours).toBe(5);
    expect(run({ projectRoleId: "R-FIT" }).costs.notAttributable).toBe(true);
    expect(run({ costCategoryId: "cat-acc" }).summary.byCurrency.EUR.additionalCosts).toBe(30);
    expect(normalizeFilters({ projectId: "all", clientId: "", employeeId: ["E1"] })).toEqual({ employeeId: ["E1"] });
  });
});

describe("T14 — Cost sa Category/Subcategory i povezanim radnikom ulazi jednom u projektni profit", () => {
  const cost = { id: "W1", project_id: "P1", cost_date: "2026-11-04", amount: 250, currency: "EUR", cost_category_id: "cat-acc", category: "Accommodation", subcategory: "Utilities", employee_id: "E1" };
  it("isti red stigao dvaput se oduzima jednom", () => {
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1], costs: [cost, { ...cost }], categories: [{ id: "cat-acc", name: "Accommodation" }] });
    expect(r.costs.count).toBe(1);
    expect(r.summary.byCurrency.EUR).toMatchObject({ additionalCosts: 250, netProfit: 400 - 360 - 250 });
    expect(r.costs.byCategory).toEqual([{ key: "cat-acc", name: "Accommodation", count: 1, byCurrency: { EUR: 250 } }]);
    // razrada po projektu nosi isti trošak jednom
    expect(r.breakdown.project).toEqual([expect.objectContaining({ key: "P1", additionalCosts: { EUR: 250 } })]);
  });
  it("filter po radniku: trošak vezan za tog radnika ulazi jednom, tuđi ne", () => {
    const other = { ...cost, id: "W2", employee_id: "E9", amount: 99 };
    const r = financialReport({ ...base, timesheets: [T1], costs: [cost, other], filters: { employeeId: "E1" } });
    expect(r.summary.byCurrency.EUR.additionalCosts).toBe(250);
  });
  it("trošak projekta bez sati u periodu ima svoj red u razradi (ne gubi se)", () => {
    const r = financialReport({ ...base, timesheets: [T1], costs: [{ ...cost, project_id: "P2" }] });
    expect(r.breakdown.project.map((x) => [x.key, x.hours, x.additionalCosts])).toEqual([["P1", 8, {}], ["P2", 0, { EUR: 250 }]]);
  });
});

describe("T25 — promena naziva projekta ili klijenta ne menja izveštaj", () => {
  it("isti ID, novo ime → isti brojevi; drugi projekat sa starim imenom se ne spaja", () => {
    const costs = [{ id: "K1", project_id: "P1", cost_date: "2026-11-02", amount: 40, currency: "EUR" }];
    const before = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1], costs });
    const renamed = projects.map((p) => (p.id === "P1" ? { ...p, name: "Hala A — novo ime", client_name: "Klijent A d.o.o." } : p));
    const sameOldName = v2Timesheet({ id: "TX", project_id: "P3", assignment_id: "A2", days: [{ i: 0, hours: 8 }] });
    const after = projectFinancialReport({
      projects: [...renamed, { id: "P9", name: "Hala A", client_id: "C1" }], assignments, projectId: "P1",
      timesheets: [{ ...T1, project: "Hala A — novo ime", client_name: "Klijent A d.o.o." }, { ...sameOldName, project: "Hala A" }], costs,
    });
    expect(after).toEqual(before);
  });
});

describe("T17 — obračun je odvojen od fakturisanog, uplaćenog i isplaćenog", () => {
  const summaries = [
    { id: "B1", client_id: "C1", project_id: "P1", period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR", status: "invoiced_externally", calculated_amount: 400, ext_invoice_amount: 1000, ext_due_date: "2026-11-20" },
    { id: "B2", client_id: "C1", project_id: null, period_start: "2026-10-01", period_end: "2026-10-31", currency: "EUR", status: "sent_to_accounting", calculated_amount: 800 },
  ];
  const clientPayments = [
    { id: "CP1", client_id: "C1", billing_summary_id: "B1", payment_date: "2026-11-21", amount: 400, currency: "EUR" },
    { id: "CP2", client_id: "C1", billing_summary_id: "B1", payment_date: "2026-11-22", amount: 300, currency: "EUR" },
    { id: "CP3", client_id: "C1", billing_summary_id: "B1", payment_date: "2026-11-23", amount: 999, currency: "EUR", voided_at: "2026-11-24", void_reason: "pogrešan unos" },
    { id: "CP4", client_id: "C1", project_id: "P1", billing_summary_id: null, payment_date: "2026-11-25", amount: 50, currency: "EUR" },
  ];
  const payables = [
    { id: "PY1", payee_type: "employee", employee_id: "E1", period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR", status: "confirmed", calculated_amount: 360, adjustments_amount: 0 },
    { id: "PY2", payee_type: "vendor", vendor_id: "V1", period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR", status: "confirmed", calculated_amount: 500, adjustments_amount: 0 },
  ];
  const payableLines = [
    { payable_id: "PY1", kind: "labor", employee_id: "E1", project_id: "P1", amount: 360, currency: "EUR" },
    { payable_id: "PY2", kind: "labor", employee_id: "E5", project_id: "P1", amount: 200, currency: "EUR" },
    { payable_id: "PY2", kind: "labor", employee_id: "E6", project_id: "P3", amount: 300, currency: "EUR" },
  ];
  const payments = [{ id: "PM1", payable_id: "PY1", amount: 100, currency: "EUR", payment_date: "2026-11-28" }];
  const input = {
    ...base, projectId: "P1", timesheets: [T1], range: { from: "2026-11-01", to: "2026-11-30" }, today: "2026-11-24",
    billing: { summaries, clientPayments }, payables: { payables, payableLines, payments },
  };

  it("summary nema polja fakturisanog, uplata ni isplata; uplate ne menjaju profit", () => {
    const r = projectFinancialReport(input);
    const noFlows = projectFinancialReport({ ...input, billing: null, payables: null });
    expect(r.summary).toEqual(noFlows.summary);
    expect(Object.keys(r.summary.byCurrency.EUR).sort()).toEqual(["additionalCosts", "laborMargin", "laborRevenue", "netProfit", "payrollCost", "profitMargin"]);
  });

  it("billing: eksterni 1000 + uplate 400 + 300 → outstanding 300; storno se ne broji; pregled celog klijenta odvojeno", () => {
    const r = projectFinancialReport(input).billing;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].balance).toMatchObject({ calculated: 400, invoiced: 1000, received: 700, outstanding: 300, status: "partially_paid", overdue: true });
    expect(r.totals.EUR).toMatchObject({ calculated: 400, invoiced: 1000, received: 700, outstanding: 300, estimatedUnpaid: 0 });
    // B2 je za oktobar (van perioda) — ne ulazi ni u clientWide
    expect(r.clientWide).toHaveLength(0);
    expect(r.unlinkedReceived).toEqual({ EUR: 50 });
    // svi odobreni sati P1 u novembru su u B1 → nefakturisano 0
    expect(r.unbilled.revenue).toEqual({});
  });

  it("billing: pregled celog klijenta se ne pripisuje projektu", () => {
    const r = billingSection({ summaries, clientPayments }, { filters: normalizeFilters({ projectId: "P1" }), projects });
    expect(r.rows.map((x) => x.summary.id)).toEqual(["B1"]);
    expect(r.clientWide.map((x) => x.summary.id)).toEqual(["B2"]);
    expect(r.clientWideTotals.EUR).toMatchObject({ calculated: 800, estimatedUnpaid: 800 });
    expect(billingSection({ summaries, clientPayments }, { filters: { employeeId: ["E1"] } }).notAttributable).toBe(true);
  });

  it("payables: Payroll Cost (obračun) ≠ isplaćeno; obaveza vendora sa radom i van projekta je označena", () => {
    const r = projectFinancialReport(input);
    expect(r.summary.byCurrency.EUR.payrollCost).toBe(360);
    expect(r.payables.totals.EUR).toMatchObject({ confirmed: 860, paid: 100, remaining: 760 });
    expect(r.payables.scopeShare).toEqual({ EUR: 560 });
    expect(r.payables.spansOtherScope).toBe(true);
    const all = payablesSection({ payables, payableLines, payments }, {});
    expect(all.scopeShare).toBeNull();
    expect(all.rows.map((x) => [x.payable.id, x.balance.status])).toEqual([["PY1", "partially_paid"], ["PY2", "unpaid"]]);
  });

  it("sekcija bez podataka (tabela ne postoji / nema prava) je null — ekran kaže „nema podataka“", () => {
    const r = projectFinancialReport({ ...input, billing: null, payables: null });
    expect(r.billing).toBeNull();
    expect(r.payables).toBeNull();
  });
});

describe("T28 — nijedan agregat ne sabira EUR i drugu valutu bez kursa i datuma", () => {
  const gbp = v2Timesheet({ id: "G1", employee_id: "E2", days: [{ i: 1, hours: 10, w: 30, wCur: "GBP", c: 40, cCur: "GBP" }] });
  const costs = [
    { id: "R1", project_id: "P1", cost_date: "2026-11-03", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100, fx_rate_date: "2026-11-01" },
    { id: "R2", project_id: "P1", cost_date: "2026-11-03", amount: 5000, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 42.66 },
    { id: "R3", project_id: "P1", cost_date: "2026-11-03", amount: 3000, currency: "USD" },
  ];
  it("po valuti: EUR i GBP odvojeno, RSD/USD troškovi u svojoj valuti", () => {
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1, gbp], costs });
    expect(r.summary.currencies).toEqual(["EUR", "RSD", "GBP", "USD"]);
    expect(r.summary.byCurrency.EUR).toMatchObject({ laborRevenue: 400, payrollCost: 360 });
    expect(r.summary.byCurrency.GBP).toMatchObject({ laborRevenue: 400, payrollCost: 300, profitMargin: 25 });
    expect(r.summary.byCurrency.RSD).toMatchObject({ laborRevenue: 0, additionalCosts: 16720, profitMargin: null });
    expect(r.costs.withoutRateDate).toEqual({ RSD: 5000 });
    expect(r.costs.missingRate).toEqual({ USD: 3000 });
    expect(r.summary.converted).toBeNull();
  });
  it("konverzija bez kursa za GBP: GBP je u `missing`, zbir prihoda nije izračunat (ne tiho izostavljen)", () => {
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1, gbp], costs, exchangeRates: [], rateDate: "2026-11-30" });
    expect(r.summary.converted.missing).toContain("GBP");
    expect(r.summary.converted.laborRevenue).toBeNull();
    expect(r.summary.converted.netProfit).toBeNull();
    expect(r.summary.converted.costsWithoutRateDate.map((c) => c.id)).toEqual(["R2"]);
  });
  it("konverzija sa kursom: prikazuje kurs i datum kursa", () => {
    const rates = [{ currency: "GBP", units_per_eur: 0.8, rate_date: "2026-11-15" }];
    const r = projectFinancialReport({ ...base, projectId: "P1", timesheets: [T1, gbp], exchangeRates: rates, rateDate: "2026-11-30" });
    expect(r.summary.converted.laborRevenue).toBe(900); // 400 EUR + 400 GBP / 0,8
    expect(r.summary.converted.used).toEqual([{ currency: "GBP", unitsPerEur: 0.8, rateDate: "2026-11-15", source: null }]);
    expect(r.summary.converted.missing).toEqual([]);
  });
});

describe("T26 — izvoz bez B2C za korisnika bez prava", () => {
  const costs = [{ id: "K1", project_id: "P1", cost_date: "2026-11-02", amount: 40, currency: "EUR", cost_category_id: "cat-acc", category: "Accommodation" }];
  const payables = { payables: [{ id: "PY1", payee_type: "employee", employee_id: "E1", period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR", status: "confirmed", calculated_amount: 360 }], payableLines: [], payments: [] };
  const report = financialReport({ ...base, timesheets: [T1], costs, payables, billing: { summaries: [], clientPayments: [] } });
  const metrics = (rows) => [...new Set(rows.map((r) => r.metric))].sort();

  it("pun pristup: izvoz ima prihod, payroll cost, profit i obaveze; zbir izvoza = zbir ekrana", () => {
    const rows = financialReportExportRows(report, new Set(ALL));
    expect(metrics(rows)).toEqual(expect.arrayContaining(["laborRevenue", "payrollCost", "laborMargin", "netProfit", "profitMargin", "additionalCosts", "remaining"]));
    const s = (m) => rows.find((r) => r.section === "summary" && r.metric === m && r.currency === "EUR").value;
    expect([s("laborRevenue"), s("payrollCost"), s("netProfit")]).toEqual([400, 360, 0]);
  });

  it("bez rates.view_b2c: nema Payroll Cost, marže, profita ni obaveza — ni u jednom odeljku", () => {
    const noB2C = ALL.filter((p) => p !== "rates.view_b2c");
    const rows = financialReportExportRows(report, noB2C);
    for (const m of ["payrollCost", "laborMargin", "netProfit", "profitMargin", "remaining", "paid", "confirmed", "scopeShare"]) {
      expect(rows.some((r) => r.metric === m)).toBe(false);
    }
    expect(rows.some((r) => r.section === "payables")).toBe(false);
    expect(rows.some((r) => r.metric === "laborRevenue")).toBe(true);
    expect(reportVisibility(noB2C)).toMatchObject({ payrollCost: false, payables: false, laborRevenue: true });
  });

  it("bez B2B i B2C (npr. HR): samo sati i troškovi", () => {
    const rows = financialReportExportRows(report, ["costs.view"]);
    expect(metrics(rows)).toEqual(["additionalCosts", "approvedHours"]);
  });
});

describe("Payroll Due iz mesečnog obračuna (reports.js → payrollDue)", () => {
  const runs = [
    { id: "R4", month: "2026-04-01", status: "approved" },
    { id: "R2", month: "2026-02-01", status: "paid" },
    { id: "R5", month: "2026-05-01", status: "draft" },
    { id: "R3", month: "2026-03-01", status: "approved" },
  ];
  const payslips = [
    { run_id: "R3", payout: 650.1 },
    { run_id: "R3", payout: 420.25 },
    { run_id: "R4", payout: 1000 },
    { run_id: "R2", payout: 999 },
    { run_id: "R5", payout: 555 },
  ];
  it("za isplatu = zbir „za isplatu“ odobrenih, a neisplaćenih obračuna, po mesecu od najstarijeg", () => {
    expect(payrollDue(runs, payslips)).toEqual({
      total: 2070.35,
      workers: 3,
      months: [
        { runId: "R3", month: "2026-03-01", payout: 1070.35, workers: 2 },
        { runId: "R4", month: "2026-04-01", payout: 1000, workers: 1 },
      ],
    });
  });
  it("nema odobrenog neisplaćenog obračuna → 0", () => {
    expect(payrollDue(runs.filter((r) => r.status !== "approved"), payslips)).toEqual({ total: 0, workers: 0, months: [] });
    expect(payrollDue([], [])).toEqual({ total: 0, workers: 0, months: [] });
  });
});
