import { describe, expect, it } from "vitest";
import { allocate, round2, sum2 } from "./money.js";
import { PARAMS_2026_RSD, paramsInEur } from "./params.js";
import { fromGross, fromNet } from "./serbianPayroll.js";
import { computeWorkerMonth, MissingRateError, projectMargin } from "./monthly.js";
import { resolveTimesheetRates, timesheetAmounts, totalHours, validRate } from "./timesheet.js";
import { RATE_SOURCES, RateUnitError, resolveRates, resolveSideRate } from "./rates.js";

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

// Jedan izbor tarife (D4, rates.js). Iznosi po nivoima namerno nisu ni rastući ni opadajući —
// testovi dokazuju redosled nivoa, a ne „najveća" ili „najmanja" tarifa.
describe("izbor tarife (rates.js)", () => {
  const S = RATE_SOURCES;
  const DAN = "2026-11-10";
  const E = "emp-1";
  const PRJ = "prj-1";
  const row = (o) => ({
    scope: "employee", kind: "cost", unit: "hourly", amount: 10, currency: "EUR", employee_id: E, project_id: null,
    position: null, assignment_id: null, effective_from: "2026-01-01", effective_to: null, status: "active", ...o,
  });
  const dodela = { id: "asg-1", employee_id: E, project_id: PRJ, position: "Zavarivač", start_date: "2026-01-01", end_date: null, status: "active" };
  const ulaz = () => ({
    date: DAN,
    employeeId: E,
    project: {
      id: PRJ,
      job_roles: [{ title: "Zavarivač", b2b_rate: 22 }],
      assigned_employees: [{ employee_id: E, position: "Zavarivač", b2c_rate: 18, b2b_rate: 24 }],
    },
    assignments: [{ ...dodela }],
    rates: [
      row({ id: "r-asg-c", scope: "assignment", kind: "cost", amount: 15, assignment_id: "asg-1", project_id: PRJ }),
      row({ id: "r-asg-r", scope: "assignment", kind: "revenue", amount: 30, assignment_id: "asg-1", project_id: PRJ }),
      row({ id: "r-prj-c", scope: "project", kind: "cost", amount: 12, employee_id: null, project_id: PRJ }),
      row({ id: "r-prj-r", scope: "project", kind: "revenue", amount: 27, employee_id: null, project_id: PRJ }),
      row({ id: "r-emp-c", scope: "employee", kind: "cost", amount: 16 }),
      row({ id: "r-emp-r", scope: "employee", kind: "revenue", amount: 29 }),
    ],
    employeePrivate: { b2c_hourly_rate: 14, b2b_hourly_rate: 20 },
  });
  const POLJE = { worker: { projekat: "b2c_rate", profil: "b2c_hourly_rate" }, client: { projekat: "b2b_rate", profil: "b2b_hourly_rate" } };
  const ukloni = {
    [S.ASSIGNMENT_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "assignment"); },
    [S.PROJECT_EMPLOYEE]: (u, strana) => {
      u.project.assigned_employees = u.project.assigned_employees.map((e) => ({ ...e, [POLJE[strana].projekat]: null }));
    },
    [S.PROJECT_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "project"); },
    [S.JOB_ROLE]: (u) => { u.project.job_roles = []; },
    [S.EMPLOYEE_RATE]: (u) => { u.rates = u.rates.filter((r) => r.scope !== "employee"); },
    [S.PROFILE]: (u, strana) => { u.employeePrivate = { ...u.employeePrivate, [POLJE[strana].profil]: null }; },
  };
  // Svaki korak uklanja sve nivoe iznad, a svi nivoi ispod i dalje imaju tarifu — pa pobednik dokazuje da je ispred njih.
  const lanac = (nivoi) => nivoi.map(([source, rate, ref], i) => ({ source, rate, ref, iznad: nivoi.slice(0, i).map((n) => n[0]) }));
  const uhvati = (fn) => {
    try {
      fn();
    } catch (e) {
      return e;
    }
    throw new Error("očekivana greška");
  };

  const RADNIK = [
    [S.ASSIGNMENT_RATE, 15, "r-asg-c"],
    [S.PROJECT_EMPLOYEE, 18, `project:${PRJ}:employee:${E}`],
    [S.PROJECT_RATE, 12, "r-prj-c"],
    [S.EMPLOYEE_RATE, 16, "r-emp-c"],
    [S.PROFILE, 14, `employee:${E}:profile`],
  ];
  it.each(lanac(RADNIK))("radnik: $source pobeđuje sledeće nivoe", ({ source, rate, ref, iznad }) => {
    const u = ulaz();
    for (const s of iznad) ukloni[s](u, "worker");
    expect(resolveSideRate("worker", u)).toEqual({ rate, source, ref, conflict: false });
  });

  const KLIJENT = [
    [S.ASSIGNMENT_RATE, 30, "r-asg-r"],
    [S.PROJECT_EMPLOYEE, 24, `project:${PRJ}:employee:${E}`],
    [S.PROJECT_RATE, 27, "r-prj-r"],
    [S.JOB_ROLE, 22, `project:${PRJ}:job_role:Zavarivač`],
    [S.EMPLOYEE_RATE, 29, "r-emp-r"],
    [S.PROFILE, 20, `employee:${E}:profile`],
  ];
  it.each(lanac(KLIJENT))("klijent: $source pobeđuje sledeće nivoe", ({ source, rate, ref, iznad }) => {
    const u = ulaz();
    for (const s of iznad) ukloni[s](u, "client");
    expect(resolveSideRate("client", u)).toEqual({ rate, source, ref, conflict: false });
  });

  it("resolveRates vraća obe strane sa izvorom i referencom", () => {
    expect(resolveRates(ulaz())).toEqual({
      worker: { rate: 15, source: S.ASSIGNMENT_RATE, ref: "r-asg-c", conflict: false },
      client: { rate: 30, source: S.ASSIGNMENT_RATE, ref: "r-asg-r", conflict: false },
    });
  });

  it("nema tarife ni na jednom nivou → MissingRateError za obe strane (nikad 0)", () => {
    const err = uhvati(() => resolveRates({ date: DAN, employeeId: E, project: { id: PRJ }, assignments: [], rates: [], employeePrivate: null }));
    expect(err).toBeInstanceOf(MissingRateError);
    expect(err.missing).toEqual([
      { field: "workerRate", key: `${E}|${PRJ}`, date: DAN },
      { field: "clientRate", key: `${E}|${PRJ}`, date: DAN },
    ]);
  });

  it("fali samo tarifa radnika → greška navodi samo radnika", () => {
    const u = ulaz();
    for (const [s] of RADNIK) ukloni[s](u, "worker");
    expect(() => resolveSideRate("worker", u)).toThrow(MissingRateError);
    expect(uhvati(() => resolveRates(u)).missing).toEqual([{ field: "workerRate", key: `${E}|${PRJ}`, date: DAN }]);
  });

  it("0 i prazno polje nisu tarifa — ide se na sledeći nivo", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: { id: PRJ, assigned_employees: [{ employee_id: E, b2c_rate: 0, b2b_rate: "" }] },
      assignments: [dodela],
      rates: [
        row({ id: "nula", scope: "assignment", assignment_id: "asg-1", project_id: PRJ, amount: 0 }),
        row({ id: "nula-novija", amount: 0, effective_from: "2026-10-01" }),
        row({ id: "starija", amount: 13, effective_from: "2026-02-01" }),
      ],
      employeePrivate: { b2c_hourly_rate: 14, b2b_hourly_rate: 0 },
    };
    expect(resolveSideRate("worker", u)).toEqual({ rate: 13, source: S.EMPLOYEE_RATE, ref: "starija", conflict: false });
    expect(uhvati(() => resolveSideRate("client", u))).toBeInstanceOf(MissingRateError);
  });

  it("tarifa za poziciju radnika pobeđuje tarifu za ceo projekat, i kad je starija", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: { id: PRJ },
      assignments: [dodela],
      rates: [
        row({ id: "ceo", scope: "project", employee_id: null, project_id: PRJ, amount: 12, effective_from: "2026-06-01" }),
        row({ id: "poz", scope: "project", employee_id: null, project_id: PRJ, amount: 13, position: "Zavarivač" }),
        row({ id: "tudja-poz", scope: "project", employee_id: null, project_id: PRJ, amount: 19, position: "Električar" }),
      ],
    };
    expect(resolveSideRate("worker", u)).toEqual({ rate: 13, source: S.PROJECT_RATE, ref: "poz", conflict: false });
    // druga pozicija → tarifa za ceo projekat, nikad tarifa tuđe pozicije
    expect(resolveSideRate("worker", { ...u, assignments: [{ ...dodela, position: "Monter" }] })).toMatchObject({ ref: "ceo", rate: 12 });
  });

  it("pozicija dolazi iz dodele, a bez dodele iz spiska radnika na projektu", () => {
    const project = {
      id: PRJ,
      job_roles: [{ title: "Zavarivač", b2b_rate: 22 }, { title: "Monter", b2b_rate: 26 }],
      assigned_employees: [{ employee_id: E, position: "Zavarivač" }],
    };
    const base = { date: DAN, employeeId: E, project, rates: [], employeePrivate: {} };
    expect(resolveSideRate("client", { ...base, assignments: [] })).toMatchObject({ source: S.JOB_ROLE, rate: 22 });
    expect(resolveSideRate("client", { ...base, assignments: [{ ...dodela, position: "Monter" }] })).toMatchObject({ source: S.JOB_ROLE, rate: 26 });
  });

  it("zanimanje na projektu važi samo za klijenta", () => {
    const u = ulaz();
    for (const s of [S.ASSIGNMENT_RATE, S.PROJECT_EMPLOYEE, S.PROJECT_RATE]) ukloni[s](u, "worker");
    u.project.job_roles = [{ title: "Zavarivač", b2b_rate: 22, b2c_rate: 99 }];
    expect(resolveSideRate("worker", u)).toMatchObject({ source: S.EMPLOYEE_RATE, rate: 16 });
  });

  it("važi samo aktivna tarifa u roku (oba kraja uključena); najnovija pobeđuje", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: null,
      employeePrivate: {},
      rates: [
        row({ id: "stara", amount: 10, effective_from: "2025-01-01" }),
        row({ id: "istekla", amount: 11, effective_from: "2026-03-01", effective_to: "2026-11-09" }),
        row({ id: "neaktivna", amount: 12, effective_from: "2026-05-01", status: "inactive" }),
        row({ id: "buduca", amount: 13, effective_from: "2026-11-11" }),
        row({ id: "vazi", amount: 14, effective_from: "2026-02-01", effective_to: DAN }),
      ],
    };
    expect(resolveSideRate("worker", u)).toEqual({ rate: 14, source: S.EMPLOYEE_RATE, ref: "vazi", conflict: false });
    expect(resolveSideRate("worker", { ...u, date: "2026-11-11" })).toMatchObject({ ref: "buduca", rate: 13 });
  });

  it("tarifa angažmana važi samo dok dodela traje i nije otkazana", () => {
    const u = ulaz();
    const sa = (izmena) => resolveSideRate("worker", { ...u, assignments: [{ ...dodela, ...izmena }] }).source;
    expect(sa({ end_date: "2026-11-09" })).toBe(S.PROJECT_EMPLOYEE);
    expect(sa({ start_date: "2026-11-11" })).toBe(S.PROJECT_EMPLOYEE);
    expect(sa({ status: "cancelled" })).toBe(S.PROJECT_EMPLOYEE);
    expect(sa({ employee_id: "emp-2" })).toBe(S.PROJECT_EMPLOYEE);
    expect(sa({ status: "completed", end_date: DAN })).toBe(S.ASSIGNMENT_RATE);
  });

  it("tarife drugog radnika ili drugog projekta se ne mešaju", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: { id: PRJ },
      assignments: [],
      employeePrivate: {},
      rates: [
        row({ id: "tudja", employee_id: "emp-2", amount: 50 }),
        row({ id: "drugi-projekat", scope: "project", employee_id: null, project_id: "prj-2", amount: 40 }),
        row({ id: "drugi-radnik", scope: "project", employee_id: "emp-2", project_id: PRJ, amount: 45 }),
        row({ id: "prihod", kind: "revenue", amount: 30 }),
      ],
    };
    expect(uhvati(() => resolveSideRate("worker", u))).toBeInstanceOf(MissingRateError);
  });

  it("dve tarife istog nivoa sa istim datumom i različitim iznosom → konflikt; pobednik ne zavisi od redosleda", () => {
    const u = {
      date: DAN,
      employeeId: E,
      project: null,
      employeePrivate: {},
      rates: [row({ id: "a", amount: 14, effective_from: "2026-02-01" }), row({ id: "b", amount: 15, effective_from: "2026-02-01" })],
    };
    const r = resolveSideRate("worker", u);
    expect(r.conflict).toBe(true);
    expect(resolveSideRate("worker", { ...u, rates: [...u.rates].reverse() })).toEqual(r);
    expect(resolveSideRate("worker", { ...u, rates: [row({ id: "a", amount: 14 }), row({ id: "b", amount: 14 })] }).conflict).toBe(false);
  });

  it("pobednik u RSD ili po danu → RateUnitError, bez tihog prelaska na sledeći nivo", () => {
    const rsd = ulaz();
    rsd.rates = rsd.rates.map((r) => (r.id === "r-asg-c" ? { ...r, currency: "RSD", amount: 1500 } : r));
    const err = uhvati(() => resolveRates(rsd));
    expect(err).toBeInstanceOf(RateUnitError);
    expect(err).toMatchObject({ side: "worker", source: S.ASSIGNMENT_RATE, ref: "r-asg-c", currency: "RSD", unit: "hourly" });
    // klijent ima svoju (EUR) tarifu i dalje
    expect(resolveSideRate("client", rsd)).toMatchObject({ rate: 30, source: S.ASSIGNMENT_RATE });

    const poDanu = ulaz();
    for (const s of [S.ASSIGNMENT_RATE, S.PROJECT_EMPLOYEE]) ukloni[s](poDanu, "client");
    poDanu.rates = poDanu.rates.map((r) => (r.id === "r-prj-r" ? { ...r, unit: "daily" } : r));
    // zanimanje (22 €/h) postoji ispod, ali se ne koristi — tarifa po danu mora da se ispravi
    expect(uhvati(() => resolveSideRate("client", poDanu))).toMatchObject({ name: "RateUnitError", side: "client", source: S.PROJECT_RATE, unit: "daily" });
  });

  it("bez ispravnog datuma rada nema izbora tarife", () => {
    expect(() => resolveRates({ ...ulaz(), date: "" })).toThrow("datum");
    expect(() => resolveRates({ ...ulaz(), date: "10.11.2026." })).toThrow("datum");
  });
});
