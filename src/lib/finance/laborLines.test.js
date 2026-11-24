import { describe, expect, it } from "vitest";
import { aggregateLabor, estimateDayLines, laborDayLines, SIDES, sideAmount, sumHours } from "./laborLines.js";
import { v2Timesheet } from "./testFixtures.js";

const PROJECTS = [{ id: "P1", client_id: "C1" }, { id: "P2", client_id: "C2" }];
const ASSIGNMENTS = [{ id: "A1", project_role_id: "R-WELDER" }, { id: "A2", project_role_id: "R-FITTER" }];

describe("laborDayLines — samo odobreni sati, po datumu rada", () => {
  it("T09: submitted i rejected nisu u konačnim linijama; approved jeste", () => {
    const rows = [
      v2Timesheet({ id: "T1", days: [{ i: 0, hours: 8 }] }),
      v2Timesheet({ id: "T2", status: "submitted", estimate: true, days: [{ i: 1, hours: 8 }] }),
      v2Timesheet({ id: "T3", status: "rejected", days: [{ i: 2, hours: 8 }] }),
      v2Timesheet({ id: "T4", status: "draft", days: [{ i: 3, hours: 8 }] }),
    ];
    const { lines, problems } = laborDayLines(rows);
    expect(lines.map((l) => l.timesheetId)).toEqual(["T1"]);
    expect(problems).toEqual([]);
    const est = estimateDayLines(rows);
    expect(est.lines.map((l) => [l.timesheetId, l.estimate])).toEqual([["T2", true]]);
  });

  it("nedelja preko granice meseca deli se po datumu rada", () => {
    // nedelja 26.10.–1.11.2026: pet–ned (30., 31. okt i 1. nov)
    const row = v2Timesheet({ id: "T1", week_start: "2026-10-26", days: [{ i: 4, hours: 8 }, { i: 5, hours: 4, code: "vikend", wc: 1.5, cc: 1.5 }, { i: 6, hours: 4, code: "vikend", wc: 1.5, cc: 1.5 }] });
    const nov = laborDayLines([row], { from: "2026-11-01", to: "2026-11-30" });
    expect(nov.lines.map((l) => l.date)).toEqual(["2026-11-01"]);
    const okt = laborDayLines([row], { from: "2026-10-01", to: "2026-10-31" });
    expect(sumHours(okt.lines)).toBe(12);
  });

  it("filteri: projekat, klijent (preko projekta), radnik i Job Role (preko dodele)", () => {
    const rows = [
      v2Timesheet({ id: "T1", project_id: "P1", assignment_id: "A1", days: [{ i: 0, hours: 8 }] }),
      v2Timesheet({ id: "T2", project_id: "P2", assignment_id: "A2", employee_id: "E2", days: [{ i: 0, hours: 6 }] }),
    ];
    const opts = { projects: PROJECTS, assignments: ASSIGNMENTS };
    expect(laborDayLines(rows, { ...opts, filters: { clientId: "C2" } }).lines.map((l) => l.timesheetId)).toEqual(["T2"]);
    expect(laborDayLines(rows, { ...opts, filters: { projectRoleId: "R-WELDER" } }).lines.map((l) => l.timesheetId)).toEqual(["T1"]);
    expect(laborDayLines(rows, { ...opts, filters: { employeeId: ["E1", "E2"], projectId: "P1" } }).lines).toHaveLength(1);
    const [line] = laborDayLines(rows, opts).lines;
    expect(line).toMatchObject({ clientId: "C1", projectRoleId: "R-WELDER", workerCurrency: "EUR" });
  });

  it("satnica sa problemom nema linija (D11), a problem se vraća sa radnikom i nedeljom", () => {
    const bezSnimka = { ...v2Timesheet({ id: "T9", days: [{ i: 0, hours: 8 }] }), rate_snapshot: null };
    const { lines, problems } = laborDayLines([bezSnimka]);
    expect(lines).toEqual([]);
    expect(problems).toEqual([{ timesheetId: "T9", employeeId: "E1", projectId: "P1", weekStart: "2026-11-02", code: "no_snapshot" }]);
  });

  it("dayLinesOf: radi i nad fixture-om istog oblika kao timesheetDayLines", () => {
    const fake = () => ({ lines: [{ date: "2026-11-03", projectId: "P1", employeeId: "E1", hourType: "redovni", hours: 2, workerRate: 10, workerCoef: 1, workerCurrency: "EUR", clientRate: 20, clientCoef: 1, clientCurrency: "EUR" }], problems: [] });
    const { lines } = laborDayLines([{ id: "X", approval_status: "approved" }], { dayLinesOf: fake });
    expect(sideAmount(lines, SIDES.REVENUE).byCurrency).toEqual({ EUR: 40 });
  });
});

describe("pravilo zaokruživanja: grupa (projekat, radnik, vrsta, tarifa, koef, valuta), isto kao SQL", () => {
  it("iznos grupe = round2(Σsati × tarifa × koef), ne zbir zaokruženih dana", () => {
    // 3 dana × 1,5 h × 19,99 × 1,5: po danu 44,9775 → 44,98 (×3 = 134,94); po grupi 4,5 × 19,99 × 1,5 = 134,9325 → 134,93
    const row = v2Timesheet({ id: "T1", days: [0, 1, 2].map((i) => ({ i, hours: 1.5, code: "prekovremeni", w: 19.99, wc: 1.5, c: 19.99, cc: 1.5 })) });
    const { lines } = laborDayLines([row]);
    expect(sideAmount(lines, SIDES.COST).byCurrency).toEqual({ EUR: 134.93 });
  });

  it("različite tarife (promena od datuma, T07) i valute su posebne grupe; valute se ne sabiraju", () => {
    const row = v2Timesheet({ id: "T1", days: [
      { i: 0, hours: 8, w: 45, c: 50 }, { i: 1, hours: 8, w: 45, c: 50 },
      { i: 2, hours: 8, w: 47, c: 52 }, // nova tarifa od srede
      { i: 3, hours: 8, w: 5000, wCur: "RSD", c: 50 },
    ] });
    const { lines } = laborDayLines([row]);
    expect(sideAmount(lines, SIDES.COST).byCurrency).toEqual({ EUR: 1096, RSD: 40000 });
    expect(sideAmount(lines, SIDES.REVENUE).byCurrency).toEqual({ EUR: 1616 });
  });

  it("aggregateLabor po projektu i radniku: zbir redova = zbir perioda", () => {
    const rows = [
      v2Timesheet({ id: "T1", project_id: "P1", days: [{ i: 0, hours: 8 }] }),
      v2Timesheet({ id: "T2", project_id: "P2", assignment_id: "A2", days: [{ i: 1, hours: 4, c: 60 }] }),
      v2Timesheet({ id: "T3", project_id: "P1", employee_id: "E2", assignment_id: "A3", days: [{ i: 0, hours: 2 }] }),
    ];
    const { lines } = laborDayLines(rows, { projects: PROJECTS });
    expect(aggregateLabor(lines, "project")).toEqual([
      { key: "P1", hours: 10, revenue: { EUR: 500 }, cost: { EUR: 450 }, missingRevenueRate: 0, missingCostRate: 0 },
      { key: "P2", hours: 4, revenue: { EUR: 240 }, cost: { EUR: 180 }, missingRevenueRate: 0, missingCostRate: 0 },
    ]);
    expect(aggregateLabor(lines, ["client", "employee"]).map((r) => r.key)).toEqual([["C1", "E1"], ["C1", "E2"], ["C2", "E1"]]);
    const [ukupno] = aggregateLabor(lines);
    expect(ukupno).toMatchObject({ key: null, hours: 14, revenue: { EUR: 740 }, cost: { EUR: 630 } });
  });

  it("linija bez tarife (skrivena pravom) ne ulazi u iznos i broji se kao nedostajuća", () => {
    const line = { projectId: "P1", employeeId: "E1", hourType: "redovni", hours: 8, workerRate: null, workerCoef: null, clientRate: 50, clientCoef: 1, clientCurrency: "EUR" };
    const cost = sideAmount([line], SIDES.COST);
    expect(cost.byCurrency).toEqual({});
    expect(cost.missing).toHaveLength(1);
  });
});
