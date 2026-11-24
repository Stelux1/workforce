import { describe, expect, it } from "vitest";
import { financialSummary } from "../finance/summary.js";
import { billingTotals, unbilledRevenue } from "../finance/billing.js";
import { payablesTotals } from "../finance/payables.js";
import { laborDayLines } from "../finance/laborLines.js";
import { v2Timesheet } from "../finance/testFixtures.js";
import {
  actionItems, activeProjects, activeWorkers, cumulativeSeries, currencyEntries, dashboardFinance, dashboardPeriod, endingSoon,
  expiringDocuments, hoursInPeriod, marginChangePp, overduePayrollMonths, primaryCurrency, resolveFilters, topLists, upcomingPayrollDate,
  workforceOverview, workforceShortages,
} from "./dashboard.js";
import { changePct } from "./dashboard.js";
import { activeAssignmentsUrl, listUrl, readListParams } from "../listLinks.js";

const PROJECTS = [
  { id: "P1", name: "Alfa", client_id: "C1", status: "active" },
  { id: "P2", name: "Beta", client_id: "C2", status: "completed" },
];
// §5 primer: 8 × 45 = 360 trošak, 8 × 50 = 400 prihod.
const TS = [
  v2Timesheet({ id: "T1", project_id: "P1", employee_id: "E1", week_start: "2026-11-02", days: [{ i: 0, hours: 8 }] }),
  v2Timesheet({ id: "T2", project_id: "P2", employee_id: "E2", week_start: "2026-11-02", days: [{ i: 1, hours: 8, wCur: "RSD", cCur: "RSD", w: 5000, c: 6000 }] }),
  v2Timesheet({ id: "T3", project_id: "P1", employee_id: "E1", week_start: "2026-11-09", status: "submitted", estimate: true, days: [{ i: 0, hours: 4 }] }),
];
const COSTS = [{ id: "K1", project_id: "P1", amount: 50, currency: "EUR", cost_date: "2026-11-05" }];
const RANGE = { from: "2026-11-01", to: "2026-11-30" };

describe("T27 — KPI kartice su isti brojevi kao izvorni modul za isti period i filter", () => {
  it("dashboardFinance = financialSummary (bez filtera i sa filterom projekta/klijenta/statusa)", () => {
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    expect(d.current).toEqual(financialSummary({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, filters: {} }));
    expect(d.current.byCurrency.EUR).toMatchObject({ laborRevenue: 400, payrollCost: 360, laborMargin: 40, additionalCosts: 50, netProfit: -10 });
    expect(d.current.byCurrency.RSD).toMatchObject({ laborRevenue: 48000, payrollCost: 40000 });

    const sel = { projectId: "P1" };
    const filtered = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, selection: sel });
    expect(filtered.current).toEqual(financialSummary({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, filters: { projectId: ["P1"] } }));
    expect(filtered.current.currencies).toEqual(["EUR"]);

    const byStatus = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, selection: { status: "completed" } });
    expect(byStatus.current.byCurrency.EUR).toBeUndefined();
    expect(byStatus.current.byCurrency.RSD.laborRevenue).toBe(48000);
    const byClient = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, selection: { clientId: "C1" } });
    expect(byClient.current.byCurrency.EUR.laborRevenue).toBe(400);
  });

  it("filter bez ijednog projekta ne postaje „bez filtera”", () => {
    const f = resolveFilters(PROJECTS, { clientId: "C1", status: "completed" });
    expect(f.projectIds.size).toBe(0);
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, selection: { clientId: "C1", status: "completed" } });
    expect(d.current.approvedHours).toBe(0);
    expect(d.current.currencies).toEqual([]);
  });

  it("poslednja tačka grafikona je ista kao KPI perioda", () => {
    const { lines, current } = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    const series = cumulativeSeries(lines, RANGE.from, RANGE.to, "EUR");
    expect(series).toHaveLength(30);
    const last = series.at(-1);
    expect(last.revenue).toBe(current.byCurrency.EUR.laborRevenue);
    expect(last.cost).toBe(current.byCurrency.EUR.payrollCost);
    expect(series.find((p) => p.date === "2026-11-01")).toMatchObject({ revenue: 0, cost: 0 });
  });

  it("procena (submitted) nikad ne ulazi u KPI, ali je odvojeno vidljiva", () => {
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    expect(d.current.approvedHours).toBe(16);
    expect(d.current.pendingEstimate.hours).toBe(4);
  });

  it("sati bez novca: isto što i financialSummary kad nema problema; radi i bez snimka tarifa (HR)", () => {
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    expect(hoursInPeriod(TS, "approved", RANGE)).toBe(d.current.approvedHours);
    expect(hoursInPeriod(TS, "submitted", RANGE)).toBe(d.current.pendingEstimate.hours);
    const masked = TS.map(({ rate_snapshot, estimate_days, ...row }) => row); // eslint-disable-line no-unused-vars
    const hr = dashboardFinance({ timesheets: masked, costs: [], projects: PROJECTS, range: RANGE });
    expect(hr.current.approvedHours).toBe(0); // bez snimka nema linija ni iznosa…
    expect(hoursInPeriod(masked, "approved", RANGE)).toBe(16); // …ali sati postoje
    expect(hoursInPeriod(TS, "approved", { ...RANGE, projectIds: new Set(["P1"]) })).toBe(8);
    expect(hoursInPeriod(TS, "approved", { from: "2026-11-03", to: "2026-11-03" })).toBe(8); // samo utorak
  });

  it("prethodni period se računa istim filterima", () => {
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE, prevRange: { from: "2026-10-01", to: "2026-10-31" } });
    expect(d.previous.approvedHours).toBe(0);
    expect(changePct(400, 0)).toBeNull();
    expect(changePct(110, 100)).toBe(10);
    expect(marginChangePp(12.5, 10)).toBe(2.5);
    expect(marginChangePp(null, 10)).toBeNull();
  });
});

describe("T17 — obračunato, fakturisano, uplaćeno i isplaćeno su različite vrednosti", () => {
  it("profit (obračun) ≠ Client Unpaid ≠ Payables ≠ Unbilled na istom primeru", () => {
    const fin = dashboardFinance({ timesheets: [TS[0]], costs: [], projects: PROJECTS, range: RANGE }).current.byCurrency.EUR;
    const summaries = [{
      id: "B1", client_id: "C1", project_id: null, period_start: "2026-11-01", period_end: "2026-11-30", currency: "EUR",
      status: "invoiced_externally", calculated_amount: 400, ext_invoice_amount: 380, ext_invoice_currency: "EUR",
    }];
    const clientPayments = [{ billing_summary_id: "B1", amount: 100 }];
    const unpaid = billingTotals(summaries, clientPayments).EUR;
    const payables = payablesTotals(
      [{ id: "A1", status: "confirmed", currency: "EUR", total_amount: 360 }],
      [{ payable_id: "A1", amount: 60 }],
    ).EUR;
    const unbilled = unbilledRevenue(laborDayLines([TS[0]], { from: RANGE.from, to: RANGE.to, projects: PROJECTS }).lines, []);
    expect(fin.netProfit).toBe(40); // obračun
    expect(unpaid.outstanding).toBe(280); // 380 − 100, ne 400 i ne 40
    expect(payables.remaining).toBe(300); // 360 − 60, ne 360 (Payroll Cost)
    expect(unbilled.revenue.EUR).toBe(400); // nije u nijednom pregledu
    expect(new Set([fin.netProfit, unpaid.outstanding, payables.remaining, fin.payrollCost]).size).toBe(4);
  });
});

describe("T01 — radnik na dva projekta se u Active Workers računa jednom", () => {
  const A = [
    { id: "A1", employee_id: "E1", project_id: "P1", start_date: "2026-10-01", end_date: null, status: "active" },
    { id: "A2", employee_id: "E1", project_id: "P2", start_date: "2026-11-10", end_date: "2026-12-31", status: "active" },
    { id: "A3", employee_id: "E2", project_id: "P2", start_date: "2026-01-01", end_date: "2026-02-01", status: "active" },
    { id: "A4", employee_id: "E3", project_id: "P1", start_date: "2026-11-01", end_date: null, status: "cancelled" },
  ];
  it("dva reda, jedan Active Worker", () => {
    expect(A.filter((a) => a.employee_id === "E1")).toHaveLength(2);
    expect(activeWorkers(A, RANGE)).toBe(1);
  });
  it("poništena i istekla dodela se ne računa; projekat filter sužava", () => {
    expect(activeWorkers(A, { ...RANGE, projectIds: new Set(["P2"]) })).toBe(1);
    expect(activeWorkers(A, { from: "2026-01-01", to: "2026-01-31" })).toBe(1); // samo E2 (E1 počinje u oktobru)
    expect(activeWorkers(A, { from: "2026-10-01", to: "2026-12-31" })).toBe(1); // E1 jednom; E3 poništen; E2 istekao
  });
  it("Active Projects pokazuje obuhvat: status Active i/ili dodela u periodu", () => {
    expect(activeProjects(PROJECTS, A, RANGE)).toEqual({ total: 2, byStatus: 1, byAssignment: 2 });
  });
  it("angažmani koji ističu u 30 dana", () => {
    const list = [{ id: "X", project_id: "P1", start_date: "2026-01-01", end_date: "2026-12-10", status: "active" }, ...A];
    expect(endingSoon(list, "2026-11-24").map((a) => a.id)).toEqual(["X"]);
  });
});

describe("radna snaga i Action Center", () => {
  const employees = [{ id: "E1", status: "active" }, { id: "E2", status: "active" }, { id: "E3", status: "terminated" }];
  const shifts = [{ id: "S1", project_id: null, start_time: "08:00", end_time: "16:00" }];
  const assignments = [
    { id: "A1", employee_id: "E1", project_id: "P1", project_role_id: "R1", default_shift_id: "S1", start_date: "2026-11-01", end_date: null, status: "active" },
  ];
  const projectRoles = [{ id: "R1", project_id: "P1", title: "Welder", title_key: "welder" }];
  it("overview: aktivni, raspoloživi danas, raspodela po projektu i poziciji", () => {
    const o = workforceOverview({ employees, assignments, projectRoles, projects: PROJECTS, shifts, today: "2026-11-24", range: RANGE });
    expect(o.activeWorkers).toBe(1);
    expect(o.activeEmployees).toBe(2);
    expect(o.byProject).toEqual([{ key: "P1", label: "Alfa", workers: 1 }]);
    expect(o.byPosition).toEqual([{ key: "welder", label: "Welder", workers: 1 }]);
    expect(o.availableToday).toBe(1); // E1 je zauzet podrazumevanom smenom, E2 je slobodan, E3 nije aktivan
  });
  it("radnik na odobrenom odsustvu nije raspoloživ", () => {
    const leaves = [{ id: "L1", employee_id: "E2", leave_type: "vacation", start_date: "2026-11-20", end_date: "2026-11-30", status: "approved" }];
    const o = workforceOverview({ employees, assignments: [], leaves, today: "2026-11-24", range: RANGE });
    expect(o.availableToday).toBe(1);
  });
  it("shortages: deficit po projektu iz coverage", () => {
    const requirements = [{ project_id: "P1", project_role_id: "R1", shift_id: "S1", date_from: "2026-11-24", date_to: "2026-11-25", required_count: 2 }];
    const s = workforceShortages({ requirements, assignments, shifts, range: RANGE });
    expect(s).toEqual({ projects: 1, deficit: 2, days: 2 });
    expect(workforceShortages({ requirements, assignments, shifts, range: RANGE, projectIds: new Set(["P2"]) }).projects).toBe(0);
  });
  it("dokumenti koji ističu; actionItems izostavlja nula i nedostupno", () => {
    expect(expiringDocuments([{ expiration_date: "2026-11-01" }, { expiration_date: "2026-12-10" }, { expiration_date: "2027-05-01" }, {}], "2026-11-24")).toEqual({ total: 2, expired: 1 });
    expect(actionItems([{ key: "a", count: 0 }, { key: "b", count: null }, { key: "c", count: 3 }]).map((i) => i.key)).toEqual(["c"]);
  });
});

describe("top liste, valute i period", () => {
  it("top projekti/klijenti/radnici u jednoj valuti; dodatni troškovi umanjuju projekat", () => {
    const { lines } = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    const top = topLists({ lines, costs: COSTS, projects: PROJECTS, range: RANGE, currency: "EUR" });
    expect(top.projects).toEqual([{ id: "P1", revenue: 400, profit: -10, hours: 8, marginPct: -2.5 }]);
    expect(top.clients[0]).toMatchObject({ id: "C1", profit: -10 });
    expect(top.workers[0]).toMatchObject({ id: "E1", profit: 40 });
  });
  it("valute: EUR je primarna, ostale ostaju odvojene", () => {
    expect(primaryCurrency(["RSD", "EUR"])).toBe("EUR");
    expect(primaryCurrency(["RSD"])).toBe("RSD");
    const d = dashboardFinance({ timesheets: TS, costs: COSTS, projects: PROJECTS, range: RANGE });
    expect(currencyEntries(d.current.byCurrency, "laborRevenue")).toEqual([{ currency: "EUR", value: 400 }, { currency: "RSD", value: 48000 }]);
  });
  it("periodi i obaveze", () => {
    expect(dashboardPeriod("month", "2026-11-24")).toEqual({ from: "2026-11-01", to: "2026-11-30", prevFrom: "2026-10-01", prevTo: "2026-10-31" });
    expect(dashboardPeriod("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31", prevFrom: "2025-11-01", prevTo: "2025-11-30" });
    expect(dashboardPeriod("quarter", "2026-11-24")).toEqual({ from: "2026-10-01", to: "2026-12-31", prevFrom: "2026-07-01", prevTo: "2026-09-30" });
    expect(dashboardPeriod("year", "2026-11-24")).toEqual({ from: "2026-01-01", to: "2026-12-31", prevFrom: "2025-01-01", prevTo: "2025-12-31" });
    expect(upcomingPayrollDate([], "2026-11-24")).toBe("2026-11-30");
    expect(overduePayrollMonths([{ status: "approved", month: "2026-09-01" }, { status: "approved", month: "2026-11-01" }, { status: "paid", month: "2026-08-01" }], "2026-11-24")).toEqual(["2026-09-01"]);
  });
});

describe("URL parametri filtrirane liste (ugovor sa ciljnim stranicama)", () => {
  it("listUrl izostavlja prazno i 'all'; readListParams vraća isto", () => {
    const url = listUrl("/timesheets", { status: "approved", from: "2026-11-01", to: "2026-11-30", project: "all", client: "" });
    expect(url).toBe("/timesheets?from=2026-11-01&to=2026-11-30&status=approved");
    const p = readListParams(new URLSearchParams(url.split("?")[1]));
    expect(p).toMatchObject({ from: "2026-11-01", to: "2026-11-30", status: "approved", project: "", client: "", active: true });
  });
  it("neispravne vrednosti se odbacuju", () => {
    expect(readListParams(new URLSearchParams("from=nije&project=a b&status=Approved;x"))).toMatchObject({ from: "", project: "", status: "", active: false });
    expect(listUrl("/x")).toBe("/x");
  });
});

describe("Dashboard → Project Assignments Active (§4.1)", () => {
  it("link ne nosi status=active (Active = Active + Ending Soon), filteri projekta ostaju", () => {
    expect(activeAssignmentsUrl({ status: "active", project: "p1", client: "", pstatus: "active" })).toBe("/assignments?project=p1&pstatus=active");
    expect(activeAssignmentsUrl({})).toBe("/assignments");
  });
  it("novi parametri Workforce linka se čitaju istom funkcijom", () => {
    const p = readListParams(new URLSearchParams("view=available&date=2033-03-12&role=zavarivač&shift=sh-1"));
    expect(p).toMatchObject({ view: "available", date: "2033-03-12", role: "zavarivač", shift: "sh-1", active: true });
    expect(readListParams(new URLSearchParams("role=<script>&date=12.03.")).role).toBe("");
  });
});
