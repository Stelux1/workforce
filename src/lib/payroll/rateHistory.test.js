// Izbor tarife v2 i istorija tarifa (src/lib/payroll/rates.js, docs/TEAMORA-DATA-MODEL.md §2.5, spec §5).
// Primer „T07" ima iste podatke kao supabase/tests/23_tarife_istorija.test.sql (resolve_rate u bazi).
import { describe, expect, it } from "vitest";
import { MissingRateError } from "./monthly.js";
import {
  RATE_ORDER, RATE_SOURCES, RateUnitError, coveringAssignment, currentRate, rateLevel, resolveRates, resolveSideRate,
} from "./rates.js";

const S = RATE_SOURCES;
const E = "e-1";
const P = "p-1";
const ROLE = "role-zavarivac";
const DAN = "2033-03-07";

const row = (o) => ({
  scope: "employee", kind: "cost", unit: "hourly", amount: 10, currency: "EUR", employee_id: null, project_id: null,
  project_role_id: null, position: null, assignment_id: null, effective_from: "2033-01-01", effective_to: null,
  status: "active", created_date: "2033-01-01T00:00:00Z", ...o,
});
const dodela = { id: "a-1", employee_id: E, project_id: P, project_role_id: ROLE, position: "Zavarivač", start_date: "2033-01-01", end_date: null, status: "active" };

const ulaz = () => ({
  date: DAN,
  employeeId: E,
  projectId: P,
  assignments: [{ ...dodela }],
  rates: [
    row({ id: "r-asg-c", scope: "assignment", kind: "cost", amount: 15, assignment_id: "a-1", employee_id: E, project_id: P }),
    row({ id: "r-asg-r", scope: "assignment", kind: "revenue", amount: 30, assignment_id: "a-1", employee_id: E, project_id: P }),
    row({ id: "r-role-c", scope: "project", kind: "cost", amount: 13, project_id: P, project_role_id: ROLE, position: "Zavarivač" }),
    row({ id: "r-role-r", scope: "project", kind: "revenue", amount: 22, project_id: P, project_role_id: ROLE, position: "Zavarivač" }),
    row({ id: "r-prj-c", scope: "project", kind: "cost", amount: 12, project_id: P }),
    row({ id: "r-prj-r", scope: "project", kind: "revenue", amount: 27, project_id: P }),
    row({ id: "r-emp-c", scope: "employee", kind: "cost", amount: 16, employee_id: E }),
    row({ id: "r-emp-r", scope: "employee", kind: "revenue", amount: 29, employee_id: E }),
  ],
});
const ukloni = {
  [S.ASSIGNMENT_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "assignment"); },
  [S.ROLE_RATE]: (u) => { u.rates = u.rates.filter((r) => !r.project_role_id); },
  [S.PROJECT_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "project" || r.project_role_id); },
  [S.EMPLOYEE_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "employee"); },
};
const uhvati = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("očekivana greška");
};
const lanac = (nivoi) => nivoi.map(([source, rate, ref], i) => ({ source, rate, ref, iznad: nivoi.slice(0, i).map((n) => n[0]) }));

describe("izbor tarife v2 (rates.js)", () => {
  it("redosled je isti za radnika i klijenta: angažman → Job Role → projekat → radnik", () => {
    expect(RATE_ORDER.worker).toEqual([S.ASSIGNMENT_RATE, S.ROLE_RATE, S.PROJECT_RATE, S.EMPLOYEE_RATE]);
    expect(RATE_ORDER.client).toEqual(RATE_ORDER.worker);
  });

  it.each(lanac([[S.ASSIGNMENT_RATE, 15, "r-asg-c"], [S.ROLE_RATE, 13, "r-role-c"], [S.PROJECT_RATE, 12, "r-prj-c"], [S.EMPLOYEE_RATE, 16, "r-emp-c"]]))(
    "radnik (B2C): $source pobeđuje niže nivoe",
    ({ source, rate, ref, iznad }) => {
      const u = ulaz();
      for (const s of iznad) ukloni[s](u);
      expect(resolveSideRate("worker", u)).toMatchObject({ rate, source, ref, currency: "EUR", conflict: false });
    }
  );

  it.each(lanac([[S.ASSIGNMENT_RATE, 30, "r-asg-r"], [S.ROLE_RATE, 22, "r-role-r"], [S.PROJECT_RATE, 27, "r-prj-r"], [S.EMPLOYEE_RATE, 29, "r-emp-r"]]))(
    "klijent (B2B): $source pobeđuje niže nivoe",
    ({ source, rate, ref, iznad }) => {
      const u = ulaz();
      for (const s of iznad) ukloni[s](u);
      expect(resolveSideRate("client", u)).toMatchObject({ rate, source, ref, currency: "EUR" });
    }
  );

  it("resolveRates vraća obe strane sa valutom, izvorom, dodelom i Job Role", () => {
    expect(resolveRates(ulaz())).toEqual({
      worker: { rate: 15, currency: "EUR", source: S.ASSIGNMENT_RATE, ref: "r-asg-c", conflict: false, assignmentId: "a-1", projectRoleId: ROLE },
      client: { rate: 30, currency: "EUR", source: S.ASSIGNMENT_RATE, ref: "r-asg-r", conflict: false, assignmentId: "a-1", projectRoleId: ROLE },
    });
  });

  it("spisak radnika projekta, zanimanja i profil više nisu izvor tarife", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: { id: P, assigned_employees: [{ employee_id: E, b2c_rate: 18, b2b_rate: 24 }], job_roles: [{ title: "Zavarivač", b2b_rate: 22 }] },
      assignments: [],
      rates: [],
      employeePrivate: { b2c_hourly_rate: 14, b2b_hourly_rate: 20 },
    };
    const err = uhvati(() => resolveRates(u));
    expect(err).toBeInstanceOf(MissingRateError);
    expect(err.missing).toEqual([
      { field: "workerRate", key: `${E}|${P}`, date: DAN },
      { field: "clientRate", key: `${E}|${P}`, date: DAN },
    ]);
  });

  it("valuta je dozvoljena (K3): tarifa u GBP se vraća sa valutom, ne kao greška", () => {
    const u = ulaz();
    u.rates = u.rates.map((r) => (r.id === "r-asg-c" ? { ...r, currency: "GBP", amount: 11.5 } : r));
    expect(resolveSideRate("worker", u)).toMatchObject({ rate: 11.5, currency: "GBP", source: S.ASSIGNMENT_RATE });
  });

  it("pobednik koji nije po satu → RateUnitError, bez tihog prelaska na sledeći nivo", () => {
    const u = ulaz();
    u.rates = u.rates.map((r) => (r.id === "r-asg-r" ? { ...r, unit: "daily" } : r));
    expect(uhvati(() => resolveSideRate("client", u))).toMatchObject({ name: "RateUnitError", side: "client", source: S.ASSIGNMENT_RATE, unit: "daily" });
    expect(uhvati(() => resolveRates(u))).toBeInstanceOf(RateUnitError);
  });

  it("Job Role tarifa važi samo za ulogu dodele; tarifa za ceo projekat ne uzima tuđu ulogu ni staru poziciju", () => {
    const u = ulaz();
    ukloni[S.ASSIGNMENT_RATE](u);
    u.assignments = [{ ...dodela, project_role_id: "role-monter" }];
    u.rates.push(row({ id: "stara-poz", scope: "project", kind: "cost", amount: 99, project_id: P, position: "Monter" }));
    expect(resolveSideRate("worker", u)).toMatchObject({ source: S.PROJECT_RATE, ref: "r-prj-c", rate: 12 });
  });

  it("bez dodele tog dana nema tarife angažmana ni Job Role — ide se na projekat i radnika", () => {
    const u = ulaz();
    const sa = (izmena) => resolveSideRate("worker", { ...u, assignments: [{ ...dodela, ...izmena }] }).source;
    expect(sa({ end_date: "2033-03-06" })).toBe(S.PROJECT_RATE);
    expect(sa({ start_date: "2033-03-08" })).toBe(S.PROJECT_RATE);
    expect(sa({ status: "cancelled" })).toBe(S.PROJECT_RATE);
    expect(sa({ status: "completed", end_date: DAN })).toBe(S.ASSIGNMENT_RATE);
  });

  it("dodela: zadata (assignmentId) ima prednost, inače najnoviji početak", () => {
    const a1 = { ...dodela, id: "a-1", start_date: "2033-01-01" };
    const a2 = { ...dodela, id: "a-2", start_date: "2033-02-01" };
    const input = { date: DAN, employeeId: E, projectId: P, assignments: [a1, a2] };
    expect(coveringAssignment(input).id).toBe("a-2");
    expect(coveringAssignment({ ...input, assignmentId: "a-1" }).id).toBe("a-1");
    expect(coveringAssignment({ ...input, assignmentId: "a-tudja" }).id).toBe("a-2");
  });

  it("neaktivna, 0, istekla i buduća tarifa ne važe; kraj važenja je uključen", () => {
    const u = { date: DAN, employeeId: E, rates: [
      row({ id: "neaktivna", employee_id: E, amount: 50, effective_from: "2033-03-01", status: "inactive" }),
      row({ id: "nula", employee_id: E, amount: 0, effective_from: "2033-03-02" }),
      row({ id: "istekla", employee_id: E, amount: 40, effective_from: "2033-02-01", effective_to: "2033-03-06" }),
      row({ id: "buduca", employee_id: E, amount: 30, effective_from: "2033-03-08" }),
      row({ id: "vazi", employee_id: E, amount: 14, effective_from: "2033-01-10", effective_to: DAN }),
    ] };
    expect(resolveSideRate("worker", u)).toMatchObject({ rate: 14, ref: "vazi", source: S.EMPLOYEE_RATE });
    expect(resolveSideRate("worker", { ...u, date: "2033-03-08" })).toMatchObject({ ref: "buduca", rate: 30 });
  });

  it("tarife drugog radnika ili projekta se ne mešaju", () => {
    const u = { date: DAN, employeeId: E, projectId: P, assignments: [], rates: [
      row({ id: "tudja", employee_id: "e-2", amount: 50 }),
      row({ id: "drugi-projekat", scope: "project", project_id: "p-2", amount: 40 }),
      row({ id: "drugi-radnik", scope: "project", project_id: P, employee_id: "e-2", amount: 45 }),
    ] };
    expect(uhvati(() => resolveSideRate("worker", u))).toBeInstanceOf(MissingRateError);
  });

  it("bez ispravnog datuma rada nema izbora tarife", () => {
    expect(() => resolveRates({ ...ulaz(), date: "" })).toThrow("datum");
    expect(() => resolveRates({ ...ulaz(), date: "10.11.2026." })).toThrow("datum");
  });

  it("rateLevel i currentRate za prikaz istorije", () => {
    const u = ulaz();
    expect(u.rates.map(rateLevel)).toEqual([S.ASSIGNMENT_RATE, S.ASSIGNMENT_RATE, S.ROLE_RATE, S.ROLE_RATE, S.PROJECT_RATE, S.PROJECT_RATE, S.EMPLOYEE_RATE, S.EMPLOYEE_RATE]);
    expect(currentRate(u.rates, (r) => r.project_role_id === ROLE && r.kind === "revenue", DAN)?.id).toBe("r-role-r");
    expect(currentRate(u.rates, (r) => r.project_role_id === "nema", DAN)).toBeNull();
  });
});

// PARITET SA BAZOM: isti podaci i očekivanja kao „T07" u supabase/tests/23_tarife_istorija.test.sql.
describe("T07 — tarifa se menja od 15. u mesecu (isti primer kao pgTAP 23)", () => {
  const E1 = "d2300000-0000-4000-8000-0000000000d1";
  const P1 = "b2300000-0000-4000-8000-0000000000b1";
  const A1 = "a2300000-0000-4000-8000-0000000000a1";
  const R1 = "r2300000-0000-4000-8000-0000000000r1";
  // Stanje posle change_rate(stara, '2033-03-15', 50, 'EUR', …): stara se zatvara 14., nova važi od 15.
  const rates = [
    row({ id: "e2300000-0000-4000-8000-000000000001", scope: "assignment", kind: "cost", amount: 45, assignment_id: A1, employee_id: E1, project_id: P1,
      effective_from: "2033-03-01", effective_to: "2033-03-14", superseded_by: "e2300000-0000-4000-8000-000000000003" }),
    row({ id: "e2300000-0000-4000-8000-000000000002", scope: "project", kind: "revenue", amount: 60, project_id: P1, project_role_id: R1, effective_from: "2033-03-01" }),
    row({ id: "e2300000-0000-4000-8000-000000000003", scope: "assignment", kind: "cost", amount: 50, assignment_id: A1, employee_id: E1, project_id: P1,
      effective_from: "2033-03-15", change_reason: "T07 nova tarifa od 15." }),
  ];
  const assignments = [{ id: A1, employee_id: E1, project_id: P1, project_role_id: R1, start_date: "2033-03-01", end_date: null, status: "active" }];
  const na = (date) => resolveRates({ date, employeeId: E1, projectId: P1, assignments, rates });

  it("T07: 14. važi stara tarifa (45), 15. nova (50); B2B Job Role (60) važi oba dana", () => {
    expect(na("2033-03-14").worker).toMatchObject({ rate: 45, ref: "e2300000-0000-4000-8000-000000000001", source: S.ASSIGNMENT_RATE });
    expect(na("2033-03-15").worker).toMatchObject({ rate: 50, ref: "e2300000-0000-4000-8000-000000000003", source: S.ASSIGNMENT_RATE });
    expect(na("2033-03-14").client).toMatchObject({ rate: 60, source: S.ROLE_RATE });
    expect(na("2033-03-15").client).toMatchObject({ rate: 60, source: S.ROLE_RATE });
  });

  it("T07: pre početka dodele i tarifa nema tarife radnika (vidljiva greška, nikad 0)", () => {
    expect(uhvati(() => na("2033-02-28"))).toBeInstanceOf(MissingRateError);
  });
});
