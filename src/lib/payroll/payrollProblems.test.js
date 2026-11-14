// Isplata koju mesečni obračun ne pravi (QA 14.11.2026, P1): isplata manja od nule i bruto satnica ispod najniže
// osnovice — dok knjigovođa ne potvrdi pravilo za deo meseca (srazmerna osnovica). Ista pravila proverava baza
// (payroll_run_problems, migracija 20261114250000); isti primeri su u supabase/tests/09_angazman_isplata_nalozi.test.sql.
import { describe, expect, it } from "vitest";
import { PARAMS_2026_RSD, paramsInEur } from "./params.js";
import { computeWorkerMonth, ENGAGEMENT } from "./monthly.js";
import { classifyWeek, timesheetAmountsByType } from "./hours.js";
import { DAY_FIELDS } from "./timesheetRow.js";
import { buildMonthPayroll, PAYSLIP_WARNINGS, PROBLEM, payoutProblems, problemMessage } from "./payrollMonth.js";

const P = PARAMS_2026_RSD;
const TEST_KURS = 117.2; // samo za testove, nije zvanični kurs NBS — najniža osnovica 51.297 / 117,2 = 437,69 €
const PE = paramsInEur(P, TEST_KURS);
const KOEF = [
  { code: "redovni", worker_coef: 1, client_coef: 1 },
  { code: "prekovremeni", worker_coef: 1.5, client_coef: 1.6 },
  { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
  { code: "praznik", worker_coef: 2, client_coef: 2.2 },
];

// Odobrena satnica sa snimkom kakav upisuje guard_timesheet (isto kao u payroll.test.js).
function odobrena({ id, employee_id, project_id = "P1", week_start, days: pocetak, b2c, b2b = 20, threshold = 8 }) {
  const days = Array.from({ length: 7 }, (_, i) => pocetak[i] ?? 0);
  const row = {
    id, employee_id, project_id, week_start, approval_status: "approved", b2c_rate: b2c, b2b_rate: b2b,
    ...Object.fromEntries(DAY_FIELDS.map((f, i) => [f, days[i]])),
  };
  const hbt = classifyWeek({ weekStart: week_start, dayHours: days, holidays: [], dailyThreshold: threshold });
  const a = timesheetAmountsByType({ hoursByType: hbt, workerRate: b2c, clientRate: b2b, hourTypes: KOEF });
  row.hours_by_type = hbt;
  row.rate_snapshot = {
    worker: { rate: b2c }, client: { rate: b2b }, daily_regular_hours: threshold, holidays: [],
    lines: a.lines.map((l) => ({ ...l, special_rate: null })),
  };
  return row;
}

const RADNICI = [
  { id: "B1", first_name: "QA", last_name: "Bruto", rate_basis: "bruto", work_fraction: 1 },
  { id: "B2", first_name: "QA", last_name: "Bruto pola", rate_basis: "bruto", work_fraction: 0.4 },
  { id: "N1", first_name: "QA", last_name: "Neto", rate_basis: "neto", work_fraction: 1 },
  { id: "S1", first_name: "QA", last_name: "Podizvođač" },
];
const ANGAZMANI = [
  { employee_id: "B1", engagement_type: "direct_employee", start_date: "2026-01-01" },
  { employee_id: "B2", engagement_type: "direct_employee", start_date: "2026-01-01" },
  { employee_id: "N1", engagement_type: "direct_employee", start_date: "2026-01-01" },
  { employee_id: "S1", engagement_type: "subcontractor_worker", vendor_id: "V1", start_date: "2026-01-01" },
];
const mesec = (timesheets) =>
  buildMonthPayroll({ month: "2026-03-01", eurRsdRate: TEST_KURS, params: P, timesheets, employees: RADNICI, employmentHistory: ANGAZMANI });

describe("isplata se ne pravi: negativna ili bruto ispod najniže osnovice (QA P1)", () => {
  it("8 h × 6 € bruto: isplata bi bila −39,10 € → problem, radnik nema listić", () => {
    // Bruto 48 €; doprinosi radnika na najnižu osnovicu 437,69 €: 61,28 + 22,54 + 3,28 = 87,10 → neto 48 − 87,10 = −39,10.
    const m = mesec([odobrena({ id: "T1", employee_id: "B1", week_start: "2026-03-02", days: [8], b2c: 6 })]);
    expect(m.payslips).toEqual([]);
    expect(m.problems.map((p) => [p.code, p.employeeId, p.payout])).toEqual([
      [PROBLEM.NEGATIVE_PAYOUT, "B1", -39.1],
      [PROBLEM.GROSS_BELOW_MIN_BASE, "B1", -39.1],
    ]);
    expect(m.problems.map((p) => problemMessage(p))).toEqual([
      "QA Bruto: isplata bi bila negativna (-39,10 €) — iznos manji od nule se ne isplaćuje",
      "QA Bruto: zarada po bruto satnici (48,00 €) je ispod najniže osnovice (437,69 €), a doprinosi na najnižu osnovicu bi isplatu sveli na -39,10 € — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate",
    ]);
    expect(problemMessage(m.problems[0], "en")).toBe("QA Bruto: the payout would be negative (€-39.10) — an amount below zero is not paid");
    expect(problemMessage(m.problems[1], "en")).toMatch(/^QA Bruto: pay at the gross rate \(€48\.00\) is below the minimum base \(€437\.69\).*accountant must confirm/);
  });

  it("16 h × 12 € bruto (deo meseca): bruto 192 € ispod osnovice, isplata bi bila 104,90 € → problem dok knjigovođa ne potvrdi", () => {
    const m = mesec([odobrena({ id: "T1", employee_id: "B1", week_start: "2026-03-02", days: [8, 8], b2c: 12 })]);
    expect(m.payslips).toEqual([]);
    expect(m.problems).toHaveLength(1);
    expect(m.problems[0]).toMatchObject({ code: PROBLEM.GROSS_BELOW_MIN_BASE, employeeId: "B1", bruto: 192, minBase: 437.69, payout: 104.9 });
    expect(problemMessage(m.problems[0])).toBe(
      "QA Bruto: zarada po bruto satnici (192,00 €) je ispod najniže osnovice (437,69 €), a doprinosi na najnižu osnovicu bi isplatu sveli na 104,90 € — knjigovođa mora da potvrdi pravilo (srazmerna osnovica za deo meseca); do tada nema isplate"
    );
  });

  it("normalan slučaj i dalje prolazi: 40 h × 12 € bruto (iznad osnovice) → listić bez problema", () => {
    // Bruto 480 €: doprinosi 67,20 + 24,72 + 3,60; porez (480 − 291,99) × 10% = 18,80 → neto 365,68; bruto 2 = 480 + 48 + 24,72.
    const m = mesec([odobrena({ id: "T1", employee_id: "B1", week_start: "2026-03-02", days: [8, 8, 8, 8, 8], b2c: 12 })]);
    expect(m.problems).toEqual([]);
    const s = m.payslips[0];
    expect([s.bruto, s.neto, s.tax, s.emp_pio, s.emp_health, s.emp_unemployment, s.er_pio, s.er_health, s.total_cost, s.payout, s.warnings])
      .toEqual([480, 365.68, 18.8, 67.2, 24.72, 3.6, 48, 24.72, 552.72, 365.68, []]);
  });

  it("osnovica se srazmerava udelu radnog vremena iz profila: 16 h × 12 € uz udeo 0,4 (osnovica 175,08 €) prolazi", () => {
    const m = mesec([odobrena({ id: "T1", employee_id: "B2", week_start: "2026-03-02", days: [8, 8], b2c: 12 })]);
    expect(m.problems).toEqual([]);
    expect([m.payslips[0].bruto, m.payslips[0].work_fraction, m.payslips[0].warnings]).toEqual([192, 0.4, []]);
  });

  it("neto satnica ispod osnovice ostaje samo upozorenje — radnik dobija dogovoreni neto", () => {
    const m = mesec([odobrena({ id: "T1", employee_id: "N1", week_start: "2026-03-02", days: [8, 8], b2c: 12 })]);
    expect(m.problems).toEqual([]);
    expect([m.payslips[0].payout, m.payslips[0].warnings]).toEqual([192, [PAYSLIP_WARNINGS.BELOW_MIN_BASE]]);
  });

  it("radnik sa problemom ne zaustavlja listiće ostalih (nacrt se čuva, baza ne odobrava bez njegovog listića)", () => {
    const m = mesec([
      odobrena({ id: "T1", employee_id: "B1", week_start: "2026-03-02", days: [8], b2c: 6 }),
      odobrena({ id: "T2", employee_id: "N1", week_start: "2026-03-02", days: [8, 8, 8, 8, 8], b2c: 12 }),
      odobrena({ id: "T3", employee_id: "S1", week_start: "2026-03-02", days: [8], b2c: 15 }),
    ]);
    expect(m.payslips.map((s) => s.employee_id).sort()).toEqual(["N1", "S1"]);
    expect([...new Set(m.problems.map((p) => p.employeeId))]).toEqual(["B1"]);
  });

  it("payoutProblems: isplata manja od nule je problem za svaki angažman", () => {
    expect(payoutProblems({ engagement: ENGAGEMENT.SUBCONTRACTOR, rateBasis: "neto", payout: -0.01, calc: null }))
      .toEqual([{ code: PROBLEM.NEGATIVE_PAYOUT, payout: -0.01 }]);
    expect(payoutProblems({ engagement: ENGAGEMENT.SUBCONTRACTOR, rateBasis: "bruto", payout: 0, calc: null })).toEqual([]);
  });
});

// Isti primer kao pgTAP 09 (supabase/tests/09_angazman_isplata_nalozi.test.sql): brojevi listića u testu baze su ovi.
// Ako se promeni jedan fajl, mora i drugi.
describe("isti primer kao pgTAP 09 (bruto satnica, kurs 117,2)", () => {
  const listic = (hours, rate) => {
    const line = { projectId: "P", hourType: "redovni", hours, workerRate: rate, workerCoef: 1, clientRate: 20, clientCoef: 1, date: "2035-03-05" };
    const m = computeWorkerMonth({ engagement: ENGAGEMENT.EMPLOYEE, rateBasis: "bruto", lines: [line], params: PE });
    const c = m.calc;
    return {
      row: [m.basisAmount, c.bruto, c.neto, c.tax, c.employee.pio, c.employee.health, c.employee.unemployment, c.employer.pio, c.employer.health, m.laborCost, m.payout, m.revenue],
      problems: payoutProblems(m).map((p) => p.code),
    };
  };

  it("mart 2035: 8 h × 6 € → isplata −39,10 € (dva problema)", () => {
    const { row, problems } = listic(8, 6);
    expect(row).toEqual([48, 48, -39.1, 0, 61.28, 22.54, 3.28, 43.77, 22.54, 114.31, -39.1, 160]);
    expect(problems).toEqual([PROBLEM.NEGATIVE_PAYOUT, PROBLEM.GROSS_BELOW_MIN_BASE]);
  });

  it("april 2035: 16 h × 12 € → bruto 192 € ispod najniže osnovice 437,69 €", () => {
    const { row, problems } = listic(16, 12);
    expect(row).toEqual([192, 192, 104.9, 0, 61.28, 22.54, 3.28, 43.77, 22.54, 258.31, 104.9, 320]);
    expect(problems).toEqual([PROBLEM.GROSS_BELOW_MIN_BASE]);
  });

  it("maj 2035: 40 h × 12 € → odobrava se", () => {
    const { row, problems } = listic(40, 12);
    expect(row).toEqual([480, 480, 365.68, 18.8, 67.2, 24.72, 3.6, 48, 24.72, 552.72, 365.68, 800]);
    expect(problems).toEqual([]);
  });
});
