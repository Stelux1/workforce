import { describe, expect, it } from "vitest";
import { allocate, round2, sum2 } from "./money.js";
import { PARAMS_2026_RSD, paramsFromRow, paramsInEur, paramsRowForMonth } from "./params.js";
import { fromGross, fromNet } from "./serbianPayroll.js";
import { computeWorkerMonth, MissingRateError, projectMargin } from "./monthly.js";
import { totalHours, validRate } from "./timesheet.js";
import { RATE_SOURCES, RateUnitError, resolveRates, resolveSideRate } from "./rates.js";
import { classifyWeek, HOUR_TYPES, MissingCoefficientError, timesheetAmountsByType } from "./hours.js";
import { costInEur, rsdToEur, sumCostsEur, validExchangeRate } from "./costs.js";
import {
  approvalPayload, dailyThresholdOf, DAY_FIELDS, dayHours, draftRates, hoursByTypeOf, isMoneyError, overtimeHours, previewAmounts,
} from "./timesheetRow.js";
import {
  buildMonthPayroll, collectMonth, draftPayload, monthEnd, monthStart, nextMonthStart, PAYSLIP_WARNINGS, PROBLEM,
  problemMessage, projectTotals, staleEmployees, timesheetMonthLines, timesheetWeekRange,
} from "./payrollMonth.js";

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

// Osnovni pomoćnici reda satnice (zbir i tarifa > 0). Iznosi su od Faze 2 po vrsti sati (hours.js, timesheetRow.js).
describe("satnica (zbir sati i tarifa)", () => {
  it("zbir sati po danima; prazno polje = 0", () => {
    const row = { mon_hours: 8, tue_hours: 8, wed_hours: 8, thu_hours: 8, fri_hours: 8, sat_hours: 6, sun_hours: "" };
    expect(totalHours(row)).toBe(46);
    expect(totalHours({ mon_hours: "7.5", tue_hours: null })).toBe(7.5);
  });

  it("tarifa koja fali je null, nikad 0 (D4/D11)", () => {
    expect(validRate(0)).toBeNull();
    expect(validRate("")).toBeNull();
    expect(validRate(null)).toBeNull();
    expect(validRate("12.5")).toBe(12.5);
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

// PARITET SA BAZOM: isti podaci, koraci i očekivani brojevi kao „lanac nivoa" u
// supabase/tests/04_tarifa_pri_odobravanju.test.sql (resolve_timesheet_rate, provera tarife pri odobravanju).
// Ako se promeni jedan fajl, mora i drugi — rates.js i baza moraju da izaberu istu tarifu, inače odobravanje puca.
describe("isti primer kao pgTAP 04 (rates.js = resolve_timesheet_rate)", () => {
  const S = RATE_SOURCES;
  const D = "2033-03-07"; // week_start satnice
  const E1 = "d7000000-0000-4000-8000-0000000000d1";
  const P1 = "b7000000-0000-4000-8000-0000000000b1";
  const A1 = "a7000000-0000-4000-8000-0000000000a1";
  const POS = "QA-4 Zavarivač";
  const rid = (n) => `e7000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
  const tarifa = (o) => ({
    scope: "employee", kind: "cost", unit: "hourly", currency: "EUR", employee_id: null, project_id: null, position: null,
    assignment_id: null, effective_from: "2033-01-01", effective_to: null, status: "active", created_date: "2033-01-01T00:00:00+00:00", ...o,
  });
  const pocetak = () => ({
    date: D,
    employeeId: E1,
    project: {
      id: P1,
      job_roles: [{ title: POS, b2b_rate: 22 }],
      assigned_employees: [{ employee_id: E1, position: POS, b2c_rate: 18, b2b_rate: 24 }],
    },
    assignments: [{ id: A1, employee_id: E1, project_id: P1, position: POS, start_date: "2033-01-01", end_date: null, status: "active" }],
    rates: [
      tarifa({ id: rid(1), scope: "assignment", kind: "cost", amount: 15, employee_id: E1, project_id: P1, assignment_id: A1 }),
      tarifa({ id: rid(2), scope: "assignment", kind: "revenue", amount: 30, employee_id: E1, project_id: P1, assignment_id: A1 }),
      tarifa({ id: rid(3), scope: "project", kind: "cost", amount: 12, project_id: P1 }),
      tarifa({ id: rid(4), scope: "project", kind: "revenue", amount: 27, project_id: P1 }),
      tarifa({ id: rid(5), scope: "employee", kind: "cost", amount: 16, employee_id: E1 }),
      tarifa({ id: rid(6), scope: "employee", kind: "revenue", amount: 29, employee_id: E1 }),
    ],
    employeePrivate: { b2c_hourly_rate: 14, b2b_hourly_rate: 20 },
  });
  const naProjektu = `project:${P1}:employee:${E1}`;
  const izProfila = `employee:${E1}:profile`;
  const izmeniTarife = (u, uslov, izmena) => { u.rates = u.rates.map((r) => (uslov(r) ? { ...r, ...izmena } : r)); };
  const ishod = (side, u) => {
    try {
      const { rate, source, ref } = resolveSideRate(side, u);
      return { rate, source, ref };
    } catch (e) {
      if (e instanceof MissingRateError) return { error: "missing" };
      if (e instanceof RateUnitError) return { error: "unit", source: e.source, ref: e.ref, amount: e.amount, currency: e.currency, unit: e.unit };
      throw e;
    }
  };

  // [korak, izmena (kumulativno, isto kao update u pgTAP), očekivano za radnika, očekivano za klijenta (undefined = ne proverava se)]
  const KORACI = [
    ["početak", () => {}, { rate: 15, source: S.ASSIGNMENT_RATE, ref: rid(1) }, { rate: 30, source: S.ASSIGNMENT_RATE, ref: rid(2) }],
    ["otkazana dodela", (u) => { u.assignments[0].status = "cancelled"; },
      { rate: 18, source: S.PROJECT_EMPLOYEE, ref: naProjektu }, { rate: 24, source: S.PROJECT_EMPLOYEE, ref: naProjektu }],
    ["0 i prazno na projektu", (u) => { u.project.assigned_employees = [{ employee_id: E1, position: POS, b2c_rate: 0, b2b_rate: "" }]; },
      { rate: 12, source: S.PROJECT_RATE, ref: rid(3) }, { rate: 27, source: S.PROJECT_RATE, ref: rid(4) }],
    ["tarifa pozicije (starija) i tuđe pozicije", (u) => {
      u.rates.push(tarifa({ id: rid(7), scope: "project", kind: "cost", amount: 13, project_id: P1, position: POS, effective_from: "2032-06-01" }));
      u.rates.push(tarifa({ id: rid(8), scope: "project", kind: "cost", amount: 19, project_id: P1, position: "QA-4 Električar", effective_from: "2033-02-01" }));
    }, { rate: 13, source: S.PROJECT_RATE, ref: rid(7) }, undefined],
    ["kraj važenja uključen", (u) => izmeniTarife(u, (r) => r.scope === "project", { effective_to: D }),
      { rate: 13, source: S.PROJECT_RATE, ref: rid(7) }, undefined],
    ["istekle tarife projekta", (u) => izmeniTarife(u, (r) => r.scope === "project", { effective_to: "2033-03-06" }),
      { rate: 16, source: S.EMPLOYEE_RATE, ref: rid(5) }, { rate: 22, source: S.JOB_ROLE, ref: `project:${P1}:job_role:${POS}` }],
    ["bez zanimanja", (u) => { u.project.job_roles = []; }, undefined, { rate: 29, source: S.EMPLOYEE_RATE, ref: rid(6) }],
    ["neaktivna i buduća tarifa radnika", (u) => {
      izmeniTarife(u, (r) => r.id === rid(5), { status: "inactive" });
      izmeniTarife(u, (r) => r.id === rid(6), { effective_from: "2033-03-08" });
    }, { rate: 14, source: S.PROFILE, ref: izProfila }, { rate: 20, source: S.PROFILE, ref: izProfila }],
    ["bez profila", (u) => { u.employeePrivate = { b2c_hourly_rate: null, b2b_hourly_rate: null }; }, { error: "missing" }, { error: "missing" }],
    ["pobednik u RSD", (u) => { u.rates.push(tarifa({ id: rid(9), amount: 1500, currency: "RSD", employee_id: E1 })); },
      { error: "unit", source: S.EMPLOYEE_RATE, ref: rid(9), amount: 1500, currency: "RSD", unit: "hourly" }, undefined],
  ];

  it("svaki korak daje isti izvor, oznaku i tarifu kao baza", () => {
    const u = pocetak();
    for (const [korak, izmena, radnik, klijent] of KORACI) {
      izmena(u);
      if (radnik) expect(ishod("worker", u), `${korak} (radnik)`).toEqual(radnik);
      if (klijent) expect(ishod("client", u), `${korak} (klijent)`).toEqual(klijent);
    }
  });

  it("odobravanje na početku šalje 15 / 30, kao red koji baza odobrava u pgTAP 04", () => {
    const TYPES = [{ code: "redovni", worker_coef: 1, client_coef: 1 }];
    const r = approvalPayload({
      ...pocetak(), row: { employee_id: E1, project_id: P1, week_start: D, mon_hours: 8 }, hourTypes: TYPES, holidays: [], dailyThreshold: 8,
    });
    expect(r.data).toEqual({ approval_status: "approved", b2c_rate: 15, b2b_rate: 30 });
    expect([r.amounts.worker_cost, r.amounts.client_revenue]).toEqual([120, 240]);
  });
});

describe("vrste sati (hours.js)", () => {
  // 2026-11-09 je ponedeljak; 2026-11-11 (sreda) je Dan primirja; 2026-11-14 je subota.
  const MON = "2026-11-09";
  const week = (mon = 0, sat = 0, rest = {}) => ({ mon_hours: mon, sat_hours: sat, ...rest });
  const TYPES = [
    { code: "redovni", worker_coef: 1, client_coef: 1 },
    { code: "prekovremeni", worker_coef: 1.26, client_coef: 1.5 },
    { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
    { code: "praznik", worker_coef: 2.1, client_coef: 2 },
  ];

  it("Accept: pon 10h + sub 8h uz prag 8h = 8 redovno + 2 prekovremeno + 8 vikend", () => {
    expect(classifyWeek({ weekStart: MON, dayHours: week(10, 8), holidays: [], dailyThreshold: 8 })).toEqual({
      redovni: 8,
      prekovremeni: 2,
      vikend: 8,
      praznik: 0,
      praznik_vikend: 0,
    });
  });

  it("prima i niz od 7 dana; prag je podrazumevano 8h", () => {
    expect(classifyWeek({ weekStart: MON, dayHours: [10, 0, 0, 0, 7.5, 8, 0] })).toEqual({
      redovni: 15.5,
      prekovremeni: 2,
      vikend: 8,
      praznik: 0,
      praznik_vikend: 0,
    });
  });

  it("praznik u subotu je posebna vrsta „praznik vikendom\" (jedna konačna vrsta, ne i praznik i vikend)", () => {
    const r = classifyWeek({ weekStart: MON, dayHours: week(0, 8, { sun_hours: 4 }), holidays: ["2026-11-14"], dailyThreshold: 8 });
    expect(r).toEqual({ redovni: 0, prekovremeni: 0, vikend: 4, praznik: 0, praznik_vikend: 8 });
  });

  it("staro pravilo (snimci odobreni pre 24.11.2026): praznik u subotu je praznik", () => {
    const r = classifyWeek({
      weekStart: MON, dayHours: week(0, 8, { sun_hours: 4 }), holidays: ["2026-11-14"], dailyThreshold: 8, holidayWeekend: false,
    });
    expect(r).toEqual({ redovni: 0, prekovremeni: 0, vikend: 4, praznik: 8, praznik_vikend: 0 });
  });

  it("praznik radnim danom: ceo dan je praznik, bez podele na prekovremeno", () => {
    const r = classifyWeek({
      weekStart: MON,
      dayHours: week(9, 0, { wed_hours: 11 }),
      holidays: [{ date: "2026-11-11", name: "Dan primirja" }],
      dailyThreshold: 8,
    });
    expect(r).toEqual({ redovni: 8, prekovremeni: 1, vikend: 0, praznik: 11, praznik_vikend: 0 });
  });

  it("odbija nedelju koja ne počinje ponedeljkom i neispravne sate", () => {
    expect(() => classifyWeek({ weekStart: "2026-11-10", dayHours: week(8) })).toThrow(/ponedeljkom/);
    expect(() => classifyWeek({ weekStart: MON, dayHours: week(-1) })).toThrow();
    expect(() => classifyWeek({ weekStart: MON, dayHours: week(25) })).toThrow();
  });

  it("iznos = sati × tarifa × koeficijent, po vrsti pa zbir", () => {
    const hoursByType = classifyWeek({ weekStart: MON, dayHours: week(10, 8), holidays: [], dailyThreshold: 8 });
    const r = timesheetAmountsByType({ hoursByType, workerRate: 10, clientRate: 20, hourTypes: TYPES });
    // radnik: 8×10 = 80; 2×10×1,26 = 25,20; 8×10×1,3 = 104 → 209,20
    // klijent: 8×20 = 160; 2×20×1,5 = 60; 8×20×1,4 = 224 → 444
    expect(r.lines.map((l) => [l.code, l.worker_cost, l.client_revenue])).toEqual([
      ["redovni", 80, 160],
      ["prekovremeni", 25.2, 60],
      ["vikend", 104, 224],
    ]);
    expect(r.worker_cost).toBe(209.2);
    expect(r.client_revenue).toBe(444);
    expect(r.profit).toBe(234.8);
  });

  it("prima tarife iz resolveRates ({ rate }) i hour_types kao objekat po šifri", () => {
    const byCode = Object.fromEntries(TYPES.map((t) => [t.code, t]));
    const r = timesheetAmountsByType({
      hoursByType: { redovni: 8 },
      workerRate: { rate: 12.5, source: RATE_SOURCES.PROFILE },
      clientRate: { rate: 18 },
      hourTypes: byCode,
    });
    expect(r.worker_cost).toBe(100);
    expect(r.client_revenue).toBe(144);
  });

  it("koeficijent koji fali za vrstu sa satima → MissingCoefficientError sa šifrom", () => {
    const types = TYPES.map((t) => (t.code === "vikend" ? { ...t, worker_coef: null } : t));
    let err;
    try {
      timesheetAmountsByType({ hoursByType: { redovni: 8, vikend: 8 }, workerRate: 10, clientRate: 20, hourTypes: types });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingCoefficientError);
    expect(err).toBeInstanceOf(MissingRateError); // D11: i dalje „tarifa ili koeficijent koji fali"
    expect(err.codes).toEqual([HOUR_TYPES.WEEKEND]);
    expect(err.message).toMatch(/vikend \(radnik\)/);
  });

  it("vrsta bez reda u hour_types takođe blokira obračun (nema tihog 1,00)", () => {
    expect(() =>
      timesheetAmountsByType({ hoursByType: { praznik: 4 }, workerRate: 10, clientRate: 20, hourTypes: TYPES.slice(0, 3) })
    ).toThrow(MissingCoefficientError);
  });

  it("koeficijent koji fali za vrstu sa 0 sati ne baca grešku", () => {
    const seed = [
      { code: "redovni", worker_coef: 1, client_coef: 1 },
      { code: "prekovremeni", worker_coef: null, client_coef: null },
      { code: "vikend", worker_coef: null, client_coef: null },
      { code: "praznik", worker_coef: null, client_coef: null },
    ];
    const r = timesheetAmountsByType({
      hoursByType: { redovni: 40, prekovremeni: 0, vikend: 0, praznik: 0 },
      workerRate: 10,
      clientRate: 20,
      hourTypes: seed,
    });
    expect(r.lines.map((l) => l.code)).toEqual(["redovni"]);
    expect(r.worker_cost).toBe(400);
  });

  it("posebna satnica radnika ima prednost nad koeficijentom i pokriva koeficijent radnika koji fali", () => {
    const types = TYPES.map((t) => (t.code === "prekovremeni" ? { ...t, worker_coef: null } : t));
    const r = timesheetAmountsByType({
      hoursByType: { redovni: 8, prekovremeni: 2, vikend: 8 },
      workerRate: 10,
      clientRate: 20,
      hourTypes: types,
      employeePrivate: { overtime_rate: 15, weekend_rate: 14, holiday_rate: 0 },
    });
    const ot = r.lines.find((l) => l.code === "prekovremeni");
    const we = r.lines.find((l) => l.code === "vikend");
    expect(ot).toMatchObject({ worker_source: "special", worker_rate: 15, worker_coef: null, worker_cost: 30, client_revenue: 60 });
    // vikend: 8 × 14 = 112 umesto 8 × 10 × 1,3 = 104; klijent i dalje 8 × 20 × 1,4
    expect(we).toMatchObject({ worker_source: "special", worker_cost: 112, client_revenue: 224 });
    expect(r.worker_cost).toBe(222);
  });

  it("posebna satnica ne pokriva koeficijent klijenta", () => {
    const types = TYPES.map((t) => (t.code === "praznik" ? { ...t, client_coef: null } : t));
    expect(() =>
      timesheetAmountsByType({
        hoursByType: { praznik: 8 },
        workerRate: 10,
        clientRate: 20,
        hourTypes: types,
        employeePrivate: { holiday_rate: 25 },
      })
    ).toThrow(/praznik \(klijent\)/);
  });

  it("tarifa koja fali → MissingRateError, ne 0", () => {
    expect(() => timesheetAmountsByType({ hoursByType: { redovni: 8 }, workerRate: null, clientRate: 20, hourTypes: TYPES })).toThrow(
      MissingRateError
    );
    expect(() => timesheetAmountsByType({ hoursByType: { redovni: 8 }, workerRate: 10, clientRate: 0, hourTypes: TYPES })).toThrow(
      MissingRateError
    );
  });

  // Spec §5: dan koji je i praznik i vikend dobija VEĆI koeficijent, posebno za radnika i za klijenta — bez sabiranja
  // i bez dvostrukog množenja. Isti primeri su u supabase/tests/14_praznik_vikendom.test.sql.
  describe("praznik vikendom: veći od koeficijenata praznika i vikenda", () => {
    const coefs = (holiday, weekend) => [
      { code: "redovni", worker_coef: 1, client_coef: 1 },
      { code: "vikend", worker_coef: weekend[0], client_coef: weekend[1] },
      { code: "praznik", worker_coef: holiday[0], client_coef: holiday[1] },
    ];
    const amounts = (types, employeePrivate) =>
      timesheetAmountsByType({ hoursByType: { praznik_vikend: 8 }, workerRate: 10, clientRate: 20, hourTypes: types, employeePrivate });

    it("praznik 150%, vikend 200% → 2,0 za obe strane (vikend)", () => {
      const r = amounts(coefs([1.5, 1.5], [2, 2]));
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatchObject({
        code: "praznik_vikend", hours: 8, worker_coef: 2, worker_from: "vikend", client_coef: 2, client_from: "vikend",
        worker_cost: 160, client_revenue: 320,
      });
    });

    it("praznik 200%, vikend 150% → 2,0 za obe strane (praznik), ne 3,0 ni 1,5 × 2,0", () => {
      const r = amounts(coefs([2, 2], [1.5, 1.5]));
      expect(r.lines[0]).toMatchObject({ worker_coef: 2, worker_from: "praznik", client_coef: 2, client_from: "praznik" });
      expect(r.worker_cost).toBe(160); // 8 × 10 × 2 — ne 8 × 10 × 3 (zbir) ni 8 × 10 × 3 (proizvod)
      expect(r.client_revenue).toBe(320);
    });

    it("strane se biraju posebno: radniku veći praznik, klijentu veći vikend", () => {
      const r = amounts(coefs([2.1, 1.8], [1.3, 2.4]));
      expect(r.lines[0]).toMatchObject({ worker_coef: 2.1, worker_from: "praznik", client_coef: 2.4, client_from: "vikend" });
      expect(r.worker_cost).toBe(168); // 8 × 10 × 2,1
      expect(r.client_revenue).toBe(384); // 8 × 20 × 2,4
    });

    it("jednaki koeficijenti → praznik", () => {
      const r = amounts(coefs([1.5, 1.5], [1.5, 1.5]));
      expect(r.lines[0]).toMatchObject({ worker_from: "praznik", client_from: "praznik", worker_cost: 120 });
    });

    it("posebna satnica iz profila se poredi sa tarifom × koeficijentom druge vrste", () => {
      // vikend: posebna satnica 25 €/h > praznik 10 × 2 = 20 → 8 × 25 = 200
      const a = amounts(coefs([2, 2], [1.5, 1.5]), { weekend_rate: 25 });
      expect(a.lines[0]).toMatchObject({ worker_source: "special", worker_rate: 25, worker_coef: null, worker_from: "vikend", worker_cost: 200 });
      // vikend: posebna satnica 18 €/h < praznik 10 × 2 = 20 → 8 × 10 × 2 = 160
      const b = amounts(coefs([2, 2], [1.5, 1.5]), { weekend_rate: 18 });
      expect(b.lines[0]).toMatchObject({ worker_source: "coef", worker_rate: 10, worker_coef: 2, worker_from: "praznik", worker_cost: 160 });
    });

    it("prazan koeficijent praznika ili vikenda blokira, i kad je drugi upisan (nema tihog izbora)", () => {
      let err;
      try {
        amounts(coefs([2, null], [1.5, 1.5]));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(MissingCoefficientError);
      expect(err.coefficients).toEqual([{ code: "praznik", side: "client" }]);
    });

    it("cela nedelja: praznik u subotu ide u „praznik vikendom\", nedelja ostaje vikend", () => {
      const hoursByType = classifyWeek({ weekStart: MON, dayHours: week(8, 8, { sun_hours: 4 }), holidays: ["2026-11-14"] });
      const r = timesheetAmountsByType({ hoursByType, workerRate: 10, clientRate: 20, hourTypes: TYPES });
      // TYPES: vikend 1,3 / 1,4; praznik 2,1 / 2 → praznik vikendom = 2,1 / 2
      expect(r.lines.map((l) => [l.code, l.hours, l.worker_cost, l.client_revenue])).toEqual([
        ["redovni", 8, 80, 160],
        ["vikend", 4, 52, 112],
        ["praznik_vikend", 8, 168, 320],
      ]);
    });
  });

  it("zaokružuje po vrsti na cent (pola od nule), pa sabira", () => {
    // redovni: 7,5 × 19,99 = 149,925 → 149,93; prekovremeni: 0,25 × 19,99 × 1,26 = 6,29685 → 6,30
    const r = timesheetAmountsByType({
      hoursByType: { redovni: 7.5, prekovremeni: 0.25 },
      workerRate: 19.99,
      clientRate: 19.99,
      hourTypes: TYPES,
    });
    expect(r.lines.map((l) => l.worker_cost)).toEqual([149.93, 6.3]);
    expect(r.worker_cost).toBe(156.23);
    // klijent: 149,93 + 0,25 × 19,99 × 1,5 = 7,49625 → 7,50
    expect(r.client_revenue).toBe(157.43);
    expect(r.profit).toBe(1.2);
  });
});

// Red satnice na ekranu Satnice (timesheetRow.js). Brojevi su isti kao u supabase/tests/03_vrste_sati.test.sql —
// ekran i baza (guard_timesheet) moraju da daju isti obračun.
describe("red satnice (timesheetRow.js)", () => {
  const MON = "2032-03-08"; // ponedeljak
  const E = "emp-qa";
  const PRJ = "prj-qa";
  const project = { id: PRJ, job_roles: [], assigned_employees: [{ employee_id: E, b2c_rate: 12, b2b_rate: 20 }] };
  const TYPES = [
    { code: "redovni", worker_coef: 1, client_coef: 1 },
    { code: "prekovremeni", worker_coef: 1.5, client_coef: 1.6 },
    { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
    { code: "praznik", worker_coef: 2, client_coef: 2.2 },
  ];
  const row = (o) => ({ employee_id: E, project_id: PRJ, week_start: MON, mon_hours: 10, sat_hours: 8, ...o });
  const ulaz = (o) => ({ row: row(), project, assignments: [], rates: [], employeePrivate: {}, hourTypes: TYPES, holidays: [], dailyThreshold: 8, ...o });

  it("prazno polje dana = 0 (ne NaN, ne null)", () => {
    expect(dayHours({ mon_hours: "", tue_hours: null, wed_hours: "7.5", thu_hours: "abc", fri_hours: 8 })).toEqual({
      mon_hours: 0, tue_hours: 0, wed_hours: 7.5, thu_hours: 0, fri_hours: 8, sat_hours: 0, sun_hours: 0,
    });
  });

  it("dnevni prag iz work_rules, bez reda 8h", () => {
    expect(dailyThresholdOf([{ daily_regular_hours: "7.50" }])).toBe(7.5);
    expect(dailyThresholdOf([])).toBe(8);
    expect(dailyThresholdOf(null)).toBe(8);
  });

  it("vrste sati: pon 10h + sub 8h = 8 + 2 prekovremeno + 8 vikend; neispravan unos → null (prikaz ne puca)", () => {
    expect(hoursByTypeOf(row(), { holidays: [], dailyThreshold: 8 })).toEqual({ redovni: 8, prekovremeni: 2, vikend: 8, praznik: 0, praznik_vikend: 0 });
    expect(hoursByTypeOf(row({ mon_hours: 25 }), {})).toBeNull();
  });

  it("prekovremeno za prikaz: hours_by_type iz baze, odobren stari red zadržava broj, nacrt — pregled po danu (ne preko 40h)", () => {
    const rules = { holidays: [], dailyThreshold: 8 };
    // stari red po pravilu „preko 40h" (overtime_hours 4) koji je baza već preračunala
    expect(overtimeHours({ ...row(), hours_by_type: { redovni: 8, prekovremeni: 2, vikend: 8, praznik: 0, praznik_vikend: 0 }, overtime_hours: 4 }, rules)).toBe(2);
    expect(overtimeHours({ ...row({ sat_hours: 0 }), approval_status: "approved", hours_by_type: null, overtime_hours: 4 }, rules)).toBe(4);
    const week44 = row({ mon_hours: 8.8, tue_hours: 8.8, wed_hours: 8.8, thu_hours: 8.8, fri_hours: 8.8, sat_hours: 0 });
    expect(overtimeHours({ ...week44, approval_status: "draft", hours_by_type: null }, rules)).toBe(4);
    expect(overtimeHours({ ...row({ mon_hours: 9 }), approval_status: "draft", hours_by_type: null }, rules)).toBe(1);
    expect(overtimeHours({ ...row({ mon_hours: 30 }), hours_by_type: null }, rules)).toBeNull();
  });

  it("tarife nacrta: svaka strana posebno; tarifa koja fali je null uz problem, nikad 0", () => {
    const input = { date: MON, employeeId: E, project, assignments: [], rates: [], employeePrivate: null };
    expect(draftRates(input)).toEqual({ b2c_rate: 12, b2b_rate: 20, problems: [] });
    const bezRadnika = draftRates({ ...input, project: { ...project, assigned_employees: [{ employee_id: E, b2b_rate: 20 }] } });
    expect(bezRadnika.b2c_rate).toBeNull();
    expect(bezRadnika.b2b_rate).toBe(20);
    expect(bezRadnika.problems).toHaveLength(1);
    expect(bezRadnika.problems[0]).toBeInstanceOf(MissingRateError);
    const rsd = draftRates({
      ...input,
      rates: [{ id: "r-rsd", scope: "employee", kind: "cost", unit: "hourly", amount: 1500, currency: "RSD", employee_id: E, effective_from: "2032-01-01", status: "active" }],
      project: { ...project, assigned_employees: [{ employee_id: E, b2b_rate: 20 }] },
    });
    expect(rsd.b2c_rate).toBeNull();
    expect(rsd.problems[0]).toBeInstanceOf(RateUnitError);
  });

  it("odobravanje: tarife iz jedinstvenog izbora (snimak i izvor tarife upisuje baza), iznos kao baza (256,80 / 448)", () => {
    const r = approvalPayload(ulaz());
    expect(r.data).toEqual({ approval_status: "approved", b2c_rate: 12, b2b_rate: 20 });
    expect(r.hoursByType).toEqual({ redovni: 8, prekovremeni: 2, vikend: 8, praznik: 0, praznik_vikend: 0 });
    expect([r.amounts.worker_cost, r.amounts.client_revenue, r.amounts.profit]).toEqual([256.8, 448, 191.2]);
  });

  it("odobravanje: posebna satnica za prekovremeni ima prednost (126 / 224, kao baza)", () => {
    const r = approvalPayload(ulaz({ row: row({ sat_hours: 0 }), employeePrivate: { overtime_rate: 15 } }));
    expect([r.amounts.worker_cost, r.amounts.client_revenue, r.amounts.profit]).toEqual([126, 224, 98]);
  });

  it("odobravanje bez tarife, sa tarifom u RSD ili bez koeficijenta → greška (ništa se ne šalje)", () => {
    const bezTarife = { ...project, assigned_employees: [] };
    expect(() => approvalPayload(ulaz({ project: bezTarife }))).toThrow(MissingRateError);
    const rsd = [{ id: "r-rsd", scope: "employee", kind: "cost", unit: "hourly", amount: 1500, currency: "RSD", employee_id: E, effective_from: "2032-01-01", status: "active" }];
    expect(() => approvalPayload(ulaz({ project: { ...project, assigned_employees: [{ employee_id: E, b2b_rate: 20 }] }, rates: rsd }))).toThrow(RateUnitError);
    const bezKoef = TYPES.map((t) => (t.code === "vikend" ? { ...t, worker_coef: null } : t));
    let err;
    try {
      approvalPayload(ulaz({ hourTypes: bezKoef }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(MissingCoefficientError);
    expect(isMoneyError(err)).toBe(true);
    expect(isMoneyError(new Error("x"))).toBe(false);
  });

  it("pregled iznosa ne baca: koeficijent koji fali je `error`; zaokruživanje isto kao baza (191,43 / 309,85)", () => {
    const seed = TYPES.map((t) => (t.code === "redovni" ? t : { ...t, worker_coef: null, client_coef: null }));
    const fali = previewAmounts({ row: row(), workerRate: 12, clientRate: 20, hourTypes: seed, holidays: [], dailyThreshold: 8 });
    expect(fali.amounts).toBeNull();
    expect(fali.error).toBeInstanceOf(MissingCoefficientError);
    expect(fali.hoursByType.prekovremeni).toBe(2);

    const ok = previewAmounts({
      row: row({ mon_hours: 8, tue_hours: 7.5, sat_hours: 0 }), workerRate: 12.35, clientRate: 19.99, hourTypes: seed, holidays: [], dailyThreshold: 8,
    });
    expect([ok.amounts.worker_cost, ok.amounts.client_revenue, ok.amounts.profit]).toEqual([191.43, 309.85, 118.42]);

    expect(previewAmounts({ row: row({ mon_hours: 25 }), workerRate: 12, clientRate: 20, hourTypes: TYPES })).toEqual({
      hoursByType: null, amounts: null, error: null,
    });
  });
});

// ───────────────────────── mesečni obračun (payrollMonth.js, Faza 3, D17) ─────────────────────────
// Odobrena satnica nosi snimak (rate_snapshot) kakav upisuje guard_timesheet: dnevni prag, praznike te nedelje i
// linije po vrsti sati sa tarifama i koeficijentima. Ovde se pravi istim funkcijama kao pri odobravanju.
const KOEF = [
  { code: "redovni", worker_coef: 1, client_coef: 1 },
  { code: "prekovremeni", worker_coef: 1.5, client_coef: 1.6 },
  { code: "vikend", worker_coef: 1.3, client_coef: 1.4 },
  { code: "praznik", worker_coef: 2, client_coef: 2.2 },
];
// staroPravilo: snimak odobren pre 24.11.2026, kad je praznik vikendom bio „praznik" (D10 — mora ostati isti).
function odobrena({ id, employee_id = "E1", project_id = "PA", week_start, days: pocetak, b2c = 12, b2b = 20, threshold = 8, holidays = [], employeePrivate, staroPravilo = false }) {
  const days = Array.from({ length: 7 }, (_, i) => pocetak[i] ?? 0); // pon–ned, dani koji nisu navedeni = 0
  const row = {
    id, employee_id, project_id, week_start, approval_status: "approved", b2c_rate: b2c, b2b_rate: b2b,
    ...Object.fromEntries(DAY_FIELDS.map((f, i) => [f, days[i] ?? 0])),
  };
  const hbt = classifyWeek({ weekStart: week_start, dayHours: days, holidays, dailyThreshold: threshold, holidayWeekend: !staroPravilo });
  if (staroPravilo) delete hbt.praznik_vikend; // stari hours_by_type nije imao tu vrstu
  const a = timesheetAmountsByType({ hoursByType: hbt, workerRate: b2c, clientRate: b2b, hourTypes: KOEF, employeePrivate });
  row.hours_by_type = hbt;
  row.worker_cost = a.worker_cost;
  row.client_revenue = a.client_revenue;
  row.rate_snapshot = {
    worker: { rate: b2c }, client: { rate: b2b }, daily_regular_hours: threshold, holidays,
    lines: a.lines.map((l) => ({ ...l, special_rate: l.worker_source === "special" ? l.worker_rate : null })),
  };
  return row;
}
const RADNICI = [
  { id: "E1", first_name: "QA", last_name: "Zaposleni", rate_basis: "neto", work_fraction: 1 },
  { id: "E2", first_name: "QA", last_name: "Podizvođač", rate_basis: "neto", work_fraction: 1 },
  { id: "E3", first_name: "QA", last_name: "Bruto", rate_basis: "bruto", work_fraction: 0.5 },
  { id: "E4", first_name: "QA", last_name: "Bez angažmana" },
];
const ANGAZMANI = [
  { id: "H1", employee_id: "E1", engagement_type: "direct_employee", vendor_id: null, start_date: "2026-01-01", end_date: null },
  { id: "H2", employee_id: "E2", engagement_type: "subcontractor_worker", vendor_id: "V1", vendor_name: "QA dobavljač", start_date: "2026-01-01" },
  { id: "H3", employee_id: "E3", engagement_type: "direct_employee", vendor_id: null, start_date: "2025-06-01" },
];
const MART = "2026-03-01";
const mesec = (o) =>
  buildMonthPayroll({ month: MART, eurRsdRate: TEST_KURS, params: P, employees: RADNICI, employmentHistory: ANGAZMANI, ...o });
const poVrsti = (lines) => lines.reduce((acc, l) => ({ ...acc, [l.hourType]: round2((acc[l.hourType] || 0) + l.hours) }), {});

describe("mesečni obračun: meseci i nedelje (payrollMonth.js)", () => {
  it("prvi i poslednji dan meseca; satnice koje zalaze u mesec počinju do 6 dana ranije", () => {
    expect(monthStart("2026-03-17")).toBe("2026-03-01");
    expect(monthStart("2026-03")).toBe("2026-03-01");
    expect(nextMonthStart("2026-12-01")).toBe("2027-01-01");
    expect(monthEnd("2026-02-01")).toBe("2026-02-28");
    expect(monthEnd("2028-02-01")).toBe("2028-02-29");
    expect(timesheetWeekRange("2026-03-01")).toEqual({ from: "2026-02-23", to: "2026-03-31" });
    expect(() => monthStart("2026-13")).toThrow("mesec");
  });
});

describe("mesečni obračun: deljenje nedelje po danu (payrollMonth.js)", () => {
  it("Accept: nedelja 30.3.–5.4. se deli po danu — sati i iznosi; praznik i prag iz snimka", () => {
    // pon 8, uto 10, sre 10 (1.4. je praznik u snimku), čet 8; prag 8.
    // Cela nedelja: 24 redovno + 2 prekovremeno + 10 praznik → 24×12 + 2×12×1,5 + 10×12×2 = 288 + 36 + 240 = 564.
    const r = odobrena({ id: "T1", week_start: "2026-03-30", days: [8, 10, 10, 8, 0, 0, 0], holidays: ["2026-04-01"] });
    expect(r.worker_cost).toBe(564);

    const mart = timesheetMonthLines(r, MART);
    expect(mart.days).toEqual(["2026-03-30", "2026-03-31"]);
    expect(poVrsti(mart.lines)).toEqual({ redovni: 16, prekovremeni: 2 });
    const april = timesheetMonthLines(r, "2026-04-01");
    expect(april.days).toEqual(["2026-04-01", "2026-04-02"]);
    expect(poVrsti(april.lines)).toEqual({ praznik: 10, redovni: 8 });

    const m = mesec({ timesheets: [r] }).payslips[0];
    const a = mesec({ month: "2026-04-01", timesheets: [r] }).payslips[0];
    // mart: 16×12 + 2×12×1,5 = 228 (neto); prihod 16×20 + 2×20×1,6 = 384
    expect([m.basis_amount, m.projects[0].revenue, m.total_hours]).toEqual([228, 384, 18]);
    expect(m.hours_by_type).toEqual({ redovni: 16, prekovremeni: 2 });
    // april: 10×12×2 + 8×12 = 336; prihod 10×20×2,2 + 8×20 = 600
    expect([a.basis_amount, a.projects[0].revenue, a.total_hours]).toEqual([336, 600, 18]);
    // dva meseca zajedno = odobrena satnica (ništa se ne gubi ni ne duplira na granici)
    expect(round2(m.basis_amount + a.basis_amount)).toBe(r.worker_cost);
    expect(round2(m.projects[0].revenue + a.projects[0].revenue)).toBe(r.client_revenue);
  });

  it("nedelja iz februara: samo nedelja 1.3. ulazi u mart (vikend iz snimka)", () => {
    const r = odobrena({ id: "T2", week_start: "2026-02-23", days: [0, 0, 0, 0, 8, 0, 4] });
    const mart = timesheetMonthLines(r, MART);
    expect(mart.days).toEqual(["2026-03-01"]);
    expect(poVrsti(mart.lines)).toEqual({ vikend: 4 });
    // 4 × 12 × 1,3 = 62,40
    expect(mesec({ timesheets: [r] }).payslips[0].basis_amount).toBe(62.4);
  });

  it("prag iz snimka važi, ne podrazumevani (prag 10h: pon 10h je sve redovno)", () => {
    const r = odobrena({ id: "T3", week_start: "2026-03-02", days: [10, 0, 0, 0, 0, 0, 0], threshold: 10 });
    expect(poVrsti(timesheetMonthLines(r, MART).lines)).toEqual({ redovni: 10 });
    expect(mesec({ timesheets: [r] }).payslips[0].basis_amount).toBe(120);
  });

  it("posebna satnica radnika iz snimka ima prednost nad koeficijentom: pon 10h = 8×12 + 2×15", () => {
    const r = odobrena({ id: "T4", week_start: "2026-03-02", days: [10, 0, 0, 0, 0, 0, 0], employeePrivate: { overtime_rate: 15 } });
    const ot = timesheetMonthLines(r, MART).lines.find((l) => l.hourType === "prekovremeni");
    expect([ot.workerRate, ot.workerCoef, ot.clientRate, ot.clientCoef]).toEqual([15, 1, 20, 1.6]);
    expect(mesec({ timesheets: [r] }).payslips[0].basis_amount).toBe(126);
  });

  it("praznik vikendom: veći koeficijent iz snimka; nedelja preko granice meseca deli i tu vrstu po danu", () => {
    // 2026-04-04 je subota i praznik u snimku. KOEF: praznik 2 / 2,2 > vikend 1,3 / 1,4 → 8 × 12 × 2 = 192.
    const r = odobrena({ id: "T6", week_start: "2026-03-30", days: [8, 0, 0, 0, 0, 8, 0], holidays: ["2026-04-04"] });
    expect(r.hours_by_type).toMatchObject({ redovni: 8, vikend: 0, praznik: 0, praznik_vikend: 8 });
    expect(r.worker_cost).toBe(96 + 192);
    expect(poVrsti(timesheetMonthLines(r, MART).lines)).toEqual({ redovni: 8 });
    const april = timesheetMonthLines(r, "2026-04-01").lines;
    expect(april.map((l) => [l.hourType, l.hours, l.workerRate, l.workerCoef, l.clientRate, l.clientCoef])).toEqual([
      ["praznik_vikend", 8, 12, 2, 20, 2.2],
    ]);
    const a = mesec({ month: "2026-04-01", timesheets: [r] }).payslips[0];
    expect(a.hours_by_type).toEqual({ praznik_vikend: 8 });
    expect([a.basis_amount, a.projects[0].revenue]).toEqual([192, 352]);
  });

  it("praznik vikendom: posebna satnica vikenda iz snimka je veća od tarife × koef. praznika", () => {
    // vikend 30 €/h > praznik 12 × 2 = 24 €/h → 8 × 30 = 240; klijent i dalje veći koeficijent (praznik 2,2)
    const r = odobrena({ id: "T7", week_start: "2026-03-02", days: [0, 0, 0, 0, 0, 8, 0], holidays: ["2026-03-07"], employeePrivate: { weekend_rate: 30 } });
    const [l] = timesheetMonthLines(r, MART).lines;
    expect([l.hourType, l.workerRate, l.workerCoef, l.clientCoef]).toEqual(["praznik_vikend", 30, 1, 2.2]);
    expect(mesec({ timesheets: [r] }).payslips[0].basis_amount).toBe(240);
  });

  it("D10: snimak odobren po starom pravilu (praznik vikendom = praznik) ostaje isti, bez greške „snimak ne odgovara\"", () => {
    const r = odobrena({ id: "T8", week_start: "2026-03-02", days: [0, 0, 0, 0, 0, 8, 0], holidays: ["2026-03-07"], staroPravilo: true });
    expect(r.rate_snapshot.lines.map((l) => l.code)).toEqual(["praznik"]);
    const m = timesheetMonthLines(r, MART);
    expect(m.problems).toEqual([]);
    expect(poVrsti(m.lines)).toEqual({ praznik: 8 });
    expect(mesec({ timesheets: [r] }).payslips[0].basis_amount).toBe(r.worker_cost); // 8 × 12 × 2 = 192, kao pri odobravanju
  });

  it("samo odobrene satnice ulaze u obračun", () => {
    const ok = odobrena({ id: "T5", week_start: "2026-03-02", days: [8] });
    const rows = ["draft", "submitted", "rejected"].map((s, i) => ({ ...odobrena({ id: `N${i}`, project_id: `P${i}`, week_start: "2026-03-02", days: [8] }), approval_status: s }));
    const m = mesec({ timesheets: [ok, ...rows] });
    expect(m.payslips).toHaveLength(1);
    expect(m.payslips[0].total_hours).toBe(8);
  });
});

describe("mesečni obračun: neto, bruto, porez, doprinosi, bruto 2", () => {
  it("zaposleni sa neto satnicom: 16 h × 12 € = 192 € neto (ručno izračunato)", () => {
    // Kurs 117,2: najniža osnovica 51.297 / 117,2 = 437,69 €, neoporezivo 34.221 / 117,2 = 291,99 €.
    // Doprinosi radnika na najnižu osnovicu: 61,28 + 22,54 + 3,28 = 87,10; bruto = 192 + 87,10 = 279,10 (< neoporezivo → porez 0).
    // Poslodavac: 43,77 + 22,54 = 66,31 → bruto 2 = 345,41.
    const s = mesec({ timesheets: [odobrena({ id: "T1", week_start: "2026-03-02", days: [8, 8] })] }).payslips[0];
    expect([s.neto, s.bruto, s.tax, s.emp_pio, s.emp_health, s.emp_unemployment, s.er_pio, s.er_health, s.total_cost, s.payout])
      .toEqual([192, 279.1, 0, 61.28, 22.54, 3.28, 43.77, 22.54, 345.41, 192]);
    expect(s.warnings).toEqual([PAYSLIP_WARNINGS.BELOW_MIN_BASE]);
    expect(s.engagement_type).toBe("direct_employee");
  });

  // ── Forma/CSV uvoz bez Rate Basis i Work Fraction (Teamora, zahtev 3) ──
  it("radnik bez rate_basis/work_fraction u profilu (npr. uvezen kao operater) = neto i ceo udeo", () => {
    const ts = [odobrena({ id: "T1", week_start: "2026-03-02", days: [8, 8] })];
    const bez = { id: "E1", first_name: "QA", last_name: "Bez profila" }; // nema employee_private reda
    const nule = { id: "E1", first_name: "QA", last_name: "Null profil", rate_basis: null, work_fraction: null };
    const ref = mesec({ timesheets: ts }).payslips[0];
    for (const emp of [bez, nule]) {
      const s = mesec({ timesheets: ts, employees: [emp] }).payslips[0];
      expect([s.rate_basis, s.work_fraction, s.neto, s.bruto, s.total_cost]).toEqual(["neto", 1, ref.neto, ref.bruto, ref.total_cost]);
    }
  });

  it("zaposleni sa bruto satnicom i pola radnog vremena: bruto = zarada, osnovice srazmerno", () => {
    const s = mesec({ timesheets: [odobrena({ id: "T1", employee_id: "E3", week_start: "2026-03-02", days: [8, 8, 8, 8, 8] })] }).payslips[0];
    const ref = fromGross(480, PE, { fraction: 0.5 });
    expect([s.bruto, s.neto, s.tax, s.total_cost, s.payout, s.work_fraction]).toEqual([480, ref.neto, ref.tax, ref.totalCost, ref.neto, 0.5]);
    expect(s.total_cost).toBe(round2(s.bruto + s.er_pio + s.er_health));
  });

  it("podizvođač: isplata = trošak = iznos sati, bez poreza i doprinosa", () => {
    const s = mesec({ timesheets: [odobrena({ id: "T1", employee_id: "E2", week_start: "2026-03-02", days: [8, 8, 8, 8, 8], b2c: 15 })] }).payslips[0];
    expect([s.payout, s.total_cost, s.bruto, s.neto, s.tax, s.engagement_type, s.vendor_id]).toEqual([600, 600, null, null, null, "subcontractor_worker", "V1"]);
  });
});

describe("mesečni obračun: raspodela troška po projektima", () => {
  const redovi = () => [
    odobrena({ id: "A1", employee_id: "E1", project_id: "PA", week_start: "2026-03-02", days: [7.33, 6.67, 8, 0, 5.5], b2c: 13.37, b2b: 21.11 }),
    odobrena({ id: "A2", employee_id: "E1", project_id: "PB", week_start: "2026-03-09", days: [3.25, 0, 7.75, 8], b2c: 12.99, b2b: 19.95 }),
    odobrena({ id: "A3", employee_id: "E1", project_id: "PC", week_start: "2026-03-16", days: [0, 1.1, 0, 0, 2.2], b2c: 17.01, b2b: 29.29 }),
    odobrena({ id: "A4", employee_id: "E2", project_id: "PA", week_start: "2026-03-23", days: [8, 8, 8, 8, 6.66], b2c: 15.55, b2b: 24.4 }),
    odobrena({ id: "A5", employee_id: "E3", project_id: "PB", week_start: "2026-03-30", days: [9.5, 7.77, 8, 8], b2c: 11.11, b2b: 18.88 }),
    // subota 28.2. je februar, nedelja 1.3. je mart (vikend)
    odobrena({ id: "A6", employee_id: "E3", project_id: "PC", week_start: "2026-02-23", days: [0, 0, 0, 0, 0, 4, 3.3], b2c: 11.11, b2b: 18.88 }),
  ];

  it("Accept: zbir troška po projektima = zbir bruto 2 (trošak) na cent — po listiću i za ceo mesec", () => {
    const m = mesec({ timesheets: redovi() });
    expect(m.problems).toEqual([]);
    expect(m.payslips).toHaveLength(3);
    for (const s of m.payslips) {
      expect(sum2(s.projects.map((p) => p.labor_cost))).toBe(s.total_cost);
      expect(sum2(s.projects.map((p) => p.worker_amount))).toBe(s.basis_amount);
      expect(sum2(s.projects.map((p) => p.hours))).toBe(s.total_hours);
      if (s.engagement_type === "direct_employee") expect(s.total_cost).toBe(round2(s.bruto + s.er_pio + s.er_health));
    }
    expect(m.totals.allocated).toBe(m.totals.totalCost);
    expect(sum2(projectTotals(m.payslips).map((p) => p.labor_cost))).toBe(m.totals.totalCost);
    expect(sum2(m.projects.map((p) => p.labor_cost))).toBe(m.totals.totalCost);
    // A5: uto 31.3. je mart, sre/čet su april → u martu samo pon 9,5 (8 + 1,5 prekovremeno) i uto 7,77
    expect(m.payslips.find((s) => s.employee_id === "E3").hours_by_type).toEqual({ redovni: 15.77, prekovremeni: 1.5, vikend: 3.3 });
  });

  it("ostatak centa ide po stabilnom redosledu projekata (najmanji ID), ne po redosledu učitavanja", () => {
    // Ista zarada (8 h × 12 €) na tri projekta: neto 288 → bruto 384,33 (porez 9,23) → bruto 2 = 450,64 €.
    // 45.064 centa / 3 = 15.021,33 → jedan cent viška ide projektu PA (najveći ostatak, pa redosled projekata).
    const rows = ["PC", "PA", "PB"].map((p, i) =>
      odobrena({ id: `R${i}`, project_id: p, week_start: "2026-03-09", days: [0, 1, 2].map((j) => (j === i ? 8 : 0)) })
    );
    const a = mesec({ timesheets: rows }).payslips[0];
    const b = mesec({ timesheets: [...rows].reverse() }).payslips[0];
    expect([a.bruto, a.tax, a.total_cost]).toEqual([384.33, 9.23, 450.64]);
    expect(a.projects.map((p) => [p.project_id, p.labor_cost])).toEqual([["PA", 150.22], ["PB", 150.21], ["PC", 150.21]]);
    expect(b).toEqual(a);
  });

  it("redosled satnica ne menja nijedan broj obračuna", () => {
    const a = mesec({ timesheets: redovi() });
    const b = mesec({ timesheets: [...redovi()].reverse() });
    expect(b.payslips).toEqual(a.payslips);
    expect(b.totals).toEqual(a.totals);
  });
});

describe("mesečni obračun: šta blokira obračun (nikad tiho 0 ili 1,00)", () => {
  it("Accept: bez kursa nema obračuna — ni sa 0, praznim poljem ni bez parametara", () => {
    const rows = [odobrena({ id: "T1", week_start: "2026-03-02", days: [8] })];
    for (const kurs of [undefined, null, "", 0, -117.2, "abc"]) {
      expect(() => mesec({ timesheets: rows, eurRsdRate: kurs })).toThrow("Kurs EUR/RSD za mesec nije unet");
    }
    expect(() => mesec({ timesheets: rows, params: null })).toThrow("parametara");
  });

  it("satnica odobrena bez snimka (pre Faze 2): problem sa radnikom, nedeljom i projektom; radnik nema listić", () => {
    const stara = { ...odobrena({ id: "S1", week_start: "2026-02-23", days: [0, 0, 0, 0, 8, 0, 4] }), rate_snapshot: null };
    const druga = odobrena({ id: "S2", employee_id: "E2", week_start: "2026-03-02", days: [8] });
    const m = mesec({ timesheets: [stara, druga], projects: [{ id: "PA", name: "QA Projekat A" }] });
    expect(m.payslips.map((s) => s.employee_id)).toEqual(["E2"]);
    expect(m.problems).toHaveLength(1);
    expect(m.problems[0].code).toBe(PROBLEM.NO_SNAPSHOT);
    expect(problemMessage(m.problems[0])).toBe(
      "QA Zaposleni, nedelja od 23.02.2026 (QA Projekat A): satnica je odobrena bez snimka tarifa i koeficijenata (pre razvrstavanja po vrstama sati) — vratite je u nacrt i odobrite ponovo"
    );
    expect(problemMessage(m.problems[0], "en")).toMatch(/^QA Zaposleni, week of 23\.02\.2026 \(QA Projekat A\): the timesheet was approved without/);
  });

  it("koeficijent ili tarifa koja fali u snimku → problem sa vrstom i stranom", () => {
    const r = odobrena({ id: "K1", week_start: "2026-03-02", days: [0, 0, 0, 0, 0, 6] });
    r.rate_snapshot.lines = r.rate_snapshot.lines.map((l) => (l.code === "vikend" ? { ...l, client_coef: null, worker_rate: 0 } : l));
    const m = mesec({ timesheets: [r] });
    expect(m.payslips).toEqual([]);
    expect(m.problems.map((p) => p.code)).toEqual([PROBLEM.MISSING_RATE, PROBLEM.MISSING_COEF]);
    expect(problemMessage(m.problems[0])).toContain("nedostaje tarifa radnika (vikend)");
    expect(problemMessage(m.problems[1])).toContain("nedostaje koeficijent klijenta (vikend)");
  });

  it("sati koji ne odgovaraju snimku → problem (snimak nije snimak ovih sati)", () => {
    const r = { ...odobrena({ id: "M1", week_start: "2026-03-02", days: [8] }), mon_hours: 9 };
    expect(mesec({ timesheets: [r] }).problems.map((p) => p.code)).toEqual([PROBLEM.SNAPSHOT_MISMATCH]);
  });

  it("radnik bez angažmana ili sa promenom angažmana u toku meseca → problem sa datumom", () => {
    const bez = odobrena({ id: "G1", employee_id: "E4", week_start: "2026-03-09", days: [0, 8] });
    const m = mesec({ timesheets: [bez] });
    expect(m.payslips).toEqual([]);
    expect(problemMessage(m.problems[0])).toBe(
      "QA Bez angažmana: nema angažman (zaposlen ili preko podizvođača) za 10.03.2026 — upišite ga u profilu radnika (Angažman)"
    );

    const istorija = [
      { employee_id: "E1", engagement_type: "direct_employee", start_date: "2026-01-01", end_date: "2026-03-15" },
      { employee_id: "E1", engagement_type: "subcontractor_worker", vendor_id: "V1", start_date: "2026-03-16" },
    ];
    const rows = [odobrena({ id: "G2", week_start: "2026-03-09", days: [8] }), odobrena({ id: "G3", week_start: "2026-03-16", days: [8] })];
    const p = mesec({ timesheets: rows, employmentHistory: istorija }).problems;
    expect(p.map((x) => [x.code, x.date])).toEqual([[PROBLEM.ENGAGEMENT_CHANGES, "2026-03-16"]]);
  });

  it("problemi se vide i bez kursa (collectMonth)", () => {
    const stara = { ...odobrena({ id: "S1", week_start: "2026-03-02", days: [8] }), rate_snapshot: null };
    expect(collectMonth({ month: MART, timesheets: [stara], employees: RADNICI, employmentHistory: ANGAZMANI }).problems.map((p) => p.code))
      .toEqual([PROBLEM.NO_SNAPSHOT]);
  });
});

describe("mesečni obračun: parametri, nacrt i zastareo nacrt", () => {
  it("parametri iz baze (payroll_params) daju isto što i PARAMS_2026_RSD; važi najnoviji red do prvog dana meseca", () => {
    const red = {
      valid_from: "2026-01-01", tax_rate: "0.1000", non_taxable_rsd: "34221.00", min_base_rsd: "51297.00", max_base_rsd: "732820.00",
      emp_pio: "0.1400", emp_health: "0.0515", emp_unemployment: "0.0075", er_pio: "0.1000", er_health: "0.0515",
    };
    expect(paramsFromRow(red)).toEqual(PARAMS_2026_RSD);
    const novi = { ...red, valid_from: "2026-04-01", non_taxable_rsd: 40000 };
    expect(paramsRowForMonth([novi, red], "2026-03-01")).toBe(red);
    expect(paramsRowForMonth([red, novi], "2026-04-01")).toBe(novi);
    expect(() => paramsRowForMonth([novi], "2026-03-01")).toThrow("Nema obračunskih parametara");
    expect(() => paramsFromRow({ ...red, tax_rate: null, er_health: "" })).toThrow("tax_rate, er_health");
  });

  it("nacrt za bazu nema polja samo za prikaz; zastareo nacrt se prepoznaje po radniku", () => {
    const m = mesec({ timesheets: [odobrena({ id: "T1", week_start: "2026-03-02", days: [8, 8] }), odobrena({ id: "T2", employee_id: "E2", week_start: "2026-03-02", days: [8] })] });
    const payload = draftPayload(m);
    expect(payload[0]).not.toHaveProperty("vendor_name");
    expect(payload[0]).not.toHaveProperty("revenue");
    expect(payload[0].projects[0]).toEqual(m.payslips[0].projects[0]);

    expect(staleEmployees(m.payslips, m.payslips)).toEqual([]);
    const izmenjen = m.payslips.map((s) => (s.employee_id === "E1" ? { ...s, projects: [{ ...s.projects[0], labor_cost: s.projects[0].labor_cost + 0.01 }] } : s));
    expect(staleEmployees(izmenjen, m.payslips)).toEqual(["QA Zaposleni"]);
    expect(staleEmployees([m.payslips[0]], m.payslips)).toEqual(["QA Zaposleni"]);
  });
});

// Isti primer kao pgTAP 05 (supabase/tests/05_mesecni_obracun.test.sql): listići u testu baze su ovi brojevi.
// Ako se promeni jedan fajl, mora i drugi.
describe("isti primer kao pgTAP 05 (mart 2034)", () => {
  it("zaposleni na dva projekta (nedelja 27.2.–5.3. deli se po danu) i podizvođač", () => {
    const emps = [
      { id: "Z", first_name: "QA-5", last_name: "Zaposleni", rate_basis: "neto", work_fraction: 1 },
      { id: "S", first_name: "QA-5", last_name: "Podizvođač" },
    ];
    const hist = [
      { employee_id: "Z", engagement_type: "direct_employee", start_date: "2034-01-01" },
      { employee_id: "S", engagement_type: "subcontractor_worker", vendor_id: "V", start_date: "2034-01-01" },
    ];
    const rows = [
      odobrena({ id: "1", employee_id: "Z", project_id: "P1", week_start: "2034-02-27", days: [8, 8, 8, 8] }),
      odobrena({ id: "2", employee_id: "Z", project_id: "P2", week_start: "2034-03-27", days: [8, 0, 0, 0, 6], b2c: 14, b2b: 25 }),
      odobrena({ id: "3", employee_id: "S", project_id: "P1", week_start: "2034-03-06", days: [8, 8, 8, 8, 8], b2c: 15, b2b: 24 }),
    ];
    const m = buildMonthPayroll({ month: "2034-03-01", eurRsdRate: TEST_KURS, params: P, timesheets: rows, employees: emps, employmentHistory: hist });
    const z = m.payslips.find((s) => s.employee_id === "Z");
    // P1: 16 h (1.3. i 2.3.) × 12 = 192; P2: 14 h × 14 = 196 → neto 388.
    // bruto 511,85 (iznad najniže osnovice): doprinosi 71,66 + 26,36 + 3,84; porez (511,85 − 291,99) × 10% = 21,99;
    // poslodavac 51,19 + 26,36 → bruto 2 = 589,40 → P1 291,66 / P2 297,74.
    expect([z.total_hours, z.basis_amount, z.bruto, z.neto, z.tax, z.emp_pio, z.emp_health, z.emp_unemployment, z.er_pio, z.er_health, z.total_cost])
      .toEqual([30, 388, 511.85, 388, 21.99, 71.66, 26.36, 3.84, 51.19, 26.36, 589.4]);
    expect(z.projects).toEqual([
      { project_id: "P1", hours: 16, worker_amount: 192, labor_cost: 291.66, revenue: 320 },
      { project_id: "P2", hours: 14, worker_amount: 196, labor_cost: 297.74, revenue: 350 },
    ]);
    const s = m.payslips.find((x) => x.employee_id === "S");
    expect([s.total_hours, s.basis_amount, s.total_cost, s.payout, s.projects[0].revenue]).toEqual([40, 600, 600, 600, 960]);
    expect(m.totals.allocated).toBe(1189.4);
    expect(m.totals.totalCost).toBe(1189.4);
  });
});

// ── Izveštaji po ID-u: Kontrolna tabla, Izveštaji o platama, Klijenti (Faza 4) ──
import { clientIdOf, projectCostTotals, projectFinancials, projectSummary, timesheetTotals, totalsByClient, totalsByWorker } from "./reports.js";

describe("izveštaji: grupisanje po project_id / client_id, ne po imenu", () => {
  const clients = [
    { id: "C1", name: "QA-Klijent A" },
    { id: "C2", name: "QA-Klijent B" },
  ];
  const projects = [
    { id: "P1", name: "QA-Most", client_id: "C1", client_name: "QA-Klijent A" },
    { id: "P2", name: "QA-Hala", client_id: "C1", client_name: "QA-Klijent A" },
    { id: "P3", name: "QA-Put", client_id: "C2", client_name: "QA-Klijent B" },
    { id: "P4", name: "QA-Bez klijenta", client_id: null, client_name: null },
  ];
  // Iznose računa baza (D16); ovde su upisani kao u bazi. t2: 7,5 h × 19,99 = 149,925 → 149,93.
  const ts = (id, employee_id, employee_name, project_id, project, client_name, total_hours, worker_cost, client_revenue) => ({
    id, employee_id, employee_name, project_id, project, client_name, total_hours, worker_cost, client_revenue,
    profit: round2(client_revenue - worker_cost),
  });
  const timesheets = [
    ts("t1", "E1", "QA-Marko", "P1", "QA-Most", "QA-Klijent A", 40, 480, 800),
    ts("t2", "E1", "QA-Marko", "P2", "QA-Hala", "QA-Klijent A", 7.5, 149.93, 187.5),
    // Zastareli snimak imena u redu: klijent je i dalje C2 po projektu.
    ts("t3", "E2", "QA-Marko", "P3", "QA-Put", "QA-Stari naziv", 0.1, 0.1, 0.2),
    ts("t4", "E2", "QA-Marko", "P3", "QA-Put", "QA-Klijent B", 0.2, 0.2, 0.1),
    // Projekat bez klijenta, iako je u redu upisano ime klijenta A — ne sme da uđe u A.
    ts("t5", "E3", "QA-Ana", "P4", "QA-Bez klijenta", "QA-Klijent A", 8, 96, 160),
    // Stari ručno uneti projekat (bez project_id) sa imenom klijenta A — poseban red, ne spaja se po imenu.
    ts("t6", "E3", "QA-Ana", null, "QA-Ručni projekat", "QA-Klijent A", 4, 48, 80),
  ];
  const costs = [
    { project_id: "P1", amount: 100.1, currency: "EUR" },
    { project_id: "P1", amount: 0.2 }, // bez valute = EUR
    { project_id: "P1", amount: 5000, currency: "RSD" }, // RSD nema kurs — ne ulazi u ostaje nama (D2)
    { project_id: "P3", amount: 50, currency: "EUR" },
  ];
  const numbersOnly = (rows) => rows.map(({ name, snapshotNames, ...rest }) => rest);

  it("zbir satnica ide u centima", () => {
    expect(timesheetTotals(timesheets.slice(2, 4))).toEqual({ hours: 0.3, cost: 0.3, revenue: 0.3, profit: 0, count: 2 });
    expect(timesheetTotals([{ total_hours: null, worker_cost: undefined }])).toEqual({ hours: 0, cost: 0, revenue: 0, profit: 0, count: 1 });
  });

  it("klijent satnice je klijent njenog projekta po ID-u", () => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    expect(timesheets.map((t) => clientIdOf(t, byId))).toEqual(["C1", "C1", "C2", "C2", null, null]);
  });

  it("po klijentu: C1 = P1 + P2, C2 = P3 (i sa zastarelim snimkom), bez klijenta posebno", () => {
    const rows = totalsByClient(timesheets, projects, clients);
    expect(rows.map((r) => [r.key, r.name, r.hours, r.cost, r.revenue, r.profit, r.count])).toEqual([
      ["C1", "QA-Klijent A", 47.5, 629.93, 987.5, 357.57, 2],
      ["C2", "QA-Klijent B", 0.3, 0.3, 0.3, 0, 2],
      ["bez-id", null, 12, 144, 240, 96, 2],
    ]);
    expect(rows[0].avgRate).toBe(20.79); // 987,5 / 47,5
    expect(rows[2]).toMatchObject({ id: null, unassigned: true, snapshotNames: ["QA-Klijent A"] });
  });

  it("Accept: preimenovanje klijenta (isti id, novo ime) ne menja nijednu brojku", () => {
    const before = totalsByClient(timesheets, projects, clients);
    const rename = (name) => (n) => (n === "QA-Klijent A" ? name : n);
    const to = rename("QA-Klijent A (novo ime)");
    // 1) kao posle triggera propagate_client_rename: novo ime u clients, projects.client_name i timesheets.client_name
    const renamedClients = clients.map((c) => ({ ...c, name: to(c.name) }));
    const renamedProjects = projects.map((p) => ({ ...p, client_name: p.client_id === "C1" ? to(p.client_name) : p.client_name }));
    const renamedTs = timesheets.map((t) => ({ ...t, client_name: projects.find((p) => p.id === t.project_id)?.client_id === "C1" ? to(t.client_name) : t.client_name }));
    const after = totalsByClient(renamedTs, renamedProjects, renamedClients);
    expect(numbersOnly(after)).toEqual(numbersOnly(before));
    expect(after[0].name).toBe("QA-Klijent A (novo ime)");
    // 2) stranica još drži stare satnice/projekte u kešu, a klijent je već preimenovan
    expect(numbersOnly(totalsByClient(timesheets, projects, renamedClients))).toEqual(numbersOnly(before));
    // 3) drugi klijent dobije isto ime kao prvi — i dalje dve odvojene grupe, iste brojke
    const sameName = clients.map((c) => ({ ...c, name: "QA-Isto ime" }));
    expect(numbersOnly(totalsByClient(timesheets, projects, sameName))).toEqual(numbersOnly(before));
    // Isto i za pregled projekata i radnike.
    const sumBefore = projectSummary({ timesheets, projects, costs });
    expect(numbersOnly(projectSummary({ timesheets: renamedTs, projects: renamedProjects, costs }))).toEqual(numbersOnly(sumBefore));
    expect(totalsByWorker(renamedTs)).toEqual(totalsByWorker(timesheets));
  });

  it("preimenovanje projekta ne menja pregled projekata", () => {
    const before = projectSummary({ timesheets, projects, costs });
    const renamedProjects = projects.map((p) => (p.id === "P1" ? { ...p, name: "QA-Most (novo)" } : p));
    const renamedTs = timesheets.map((t) => (t.project_id === "P1" ? { ...t, project: "QA-Most (novo)" } : t));
    const after = projectSummary({ timesheets: renamedTs, projects: renamedProjects, costs });
    expect(numbersOnly(after)).toEqual(numbersOnly(before));
    expect(after.find((r) => r.id === "P1").name).toBe("QA-Most (novo)");
  });

  it("pregled projekata: ostaje nama = prihod − trošak − EUR troškovi (D8), ručno uneto posebno", () => {
    const rows = projectSummary({ timesheets, projects, costs });
    expect(rows.map((r) => [r.key, r.name, r.hours, r.revenue, r.workerCost, r.costsEUR, r.costsRSD, r.profit])).toEqual([
      ["P1", "QA-Most", 40, 800, 480, 100.3, 5000, 219.7],
      ["P2", "QA-Hala", 7.5, 187.5, 149.93, 0, 0, 37.57],
      ["P4", "QA-Bez klijenta", 8, 160, 96, 0, 0, 64],
      ["bez-id", null, 4, 80, 48, 0, 0, 32],
      ["P3", "QA-Put", 0.3, 0.3, 0.3, 50, 0, -50],
    ]);
    expect(rows.find((r) => r.unassigned).snapshotNames).toEqual(["QA-Ručni projekat"]);
    // Projekat bez sati i bez EUR troškova se ne prikazuje; satnica čiji projekat nije na listi dobija svoj red.
    const extra = projectSummary({ timesheets: [ts("t7", "E1", "QA-Marko", "P9", "QA-Nepoznat", null, 1, 10, 20)], projects, costs: [] });
    expect(extra.map((r) => [r.key, r.name, r.profit])).toEqual([["P9", "QA-Nepoznat", 10]]);
    expect(projectCostTotals(costs)).toEqual({ eur: 150.3, rsd: 5000 });
    // RSD trošak sa kursom ulazi u EUR (D19); bez kursa ostaje posebno i ne ulazi u zbir.
    expect(projectCostTotals([...costs, { project_id: "P1", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100 }]))
      .toEqual({ eur: 250.3, rsd: 5000 });
    expect(projectFinancials([], [])).toMatchObject({ hours: 0, revenue: 0, profit: 0, marginPct: null });
  });

  it("po radniku: po employee_id — dva radnika istog imena ostaju odvojena", () => {
    const rows = totalsByWorker(timesheets);
    expect(rows.map((r) => [r.key, r.name, r.hours, r.cost, r.revenue, r.profit, r.avgRate])).toEqual([
      ["E1", "QA-Marko", 47.5, 629.93, 987.5, 357.57, 13.26],
      ["E2", "QA-Marko", 0.3, 0.3, 0.3, 0, 1],
      ["E3", "QA-Ana", 12, 144, 240, 96, 12],
    ]);
  });
});

// Troškovi projekta u EUR (costs.js, D2). Isti primeri kao pgTAP 06 (supabase/tests/06_troskovi_kurs.test.sql):
// 11.720 RSD po kursu 117,2 = 100 €; 131,85 RSD po 117,2 = tačno 1,125 € → 1,13 € (pola od nule); 131,84 RSD → 1,12 €;
// 10.000 RSD po 117,1234 = 85,38 €. Ako se promeni jedan fajl, mora i drugi.
describe("troškovi projekta u EUR (isti primer kao pgTAP 06)", () => {
  it("RSD se preračunava po kursu kao baza: round(iznos / kurs, 2), pola od nule", () => {
    expect(rsdToEur(11720, 117.2)).toBe(100);
    expect(rsdToEur(131.85, 117.2)).toBe(1.13);
    expect(rsdToEur(131.84, 117.2)).toBe(1.12);
    expect(rsdToEur(10000, 117.1234)).toBe(85.38);
    expect(rsdToEur(2500.5, "117.175")).toBe(21.34);
  });
  it("bez kursa > 0 nema EUR iznosa — null, nikad 0", () => {
    for (const r of [null, undefined, "", 0, -117.2, "abc"]) expect(rsdToEur(1000, r)).toBeNull();
    expect(validExchangeRate("117.2")).toBe(117.2);
    expect(validExchangeRate(" 117,2 ")).toBe(117.2);
    expect(validExchangeRate(0)).toBeNull();
  });
  it("costInEur: EUR je iznos, RSD je EUR iznos iz baze, a bez njega iz kursa", () => {
    expect(costInEur({ amount: 250.5, currency: "EUR" })).toBe(250.5);
    expect(costInEur({ amount: 40 })).toBe(40); // prazna valuta = EUR
    expect(costInEur({ amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: "100.00" })).toBe(100);
    // Važi iznos koji je izračunala baza (ovde namerno drugačiji od iznos / kurs).
    expect(costInEur({ amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 99.99 })).toBe(99.99);
    expect(costInEur({ amount: 131.85, currency: "RSD", eur_rsd_rate: 117.2 })).toBe(1.13); // pregled u formi pre čuvanja
    expect(costInEur({ amount: 12000, currency: "RSD", eur_rsd_rate: null, eur_amount: null })).toBeNull();
  });
  it("zbir u EUR uključuje RSD troškove po unetom kursu; RSD bez kursa se vraća posebno (ni kao 0, ni kao RSD u EUR)", () => {
    const costs = [
      { id: "1", amount: 300, currency: "EUR", eur_amount: 300 },
      { id: "2", amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100 },
      { id: "3", amount: 131.85, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 1.13 },
      { id: "4", amount: 12000, currency: "RSD", eur_rsd_rate: null, eur_amount: null },
      { id: "5", amount: 0.1, currency: "EUR" },
      { id: "6", amount: 0.2, currency: "EUR" },
    ];
    const s = sumCostsEur(costs);
    expect(s.total).toBe(401.43); // 300 + 100 + 1,13 + 0,1 + 0,2 — bez 12.000 RSD
    expect(s.counted).toBe(5);
    expect(s.missingRate.map((c) => c.id)).toEqual(["4"]);
    expect(s.missingByCurrency).toEqual({ RSD: 12000 });
    expect(s.converted).toEqual({ RSD: { amount: 11851.85, eur: 101.13 } });
  });
  it("prazan spisak: zbir 0, ništa ne fali", () => {
    expect(sumCostsEur([])).toEqual({ total: 0, counted: 0, missingRate: [], missingByCurrency: {}, converted: {} });
  });
  it("ostaje nama (D8) oduzima troškove u EUR, uključujući preračunate RSD", () => {
    const s = sumCostsEur([
      { amount: 300, currency: "EUR" },
      { amount: 11720, currency: "RSD", eur_rsd_rate: 117.2, eur_amount: 100 },
    ]);
    expect(projectMargin({ revenue: 1000, laborCost: 450.5, otherCosts: s.total }).remaining).toBe(149.5);
  });
});

import {
  amountsByDay, changePct, cumulativeSeries, dashboardPeriod, filterTimesheets, overduePayrollMonths, periodKpis, topLists, upcomingPayrollDate,
} from "./dashboard.js";

describe("kontrolna tabla", () => {
  const ts = (over) => ({
    approval_status: "approved", week_start: "2026-11-02", mon_hours: 8, tue_hours: 8, wed_hours: 0, thu_hours: 0,
    fri_hours: 0, sat_hours: 0, sun_hours: 0, total_hours: 16, client_revenue: 400, worker_cost: 240, profit: 160, ...over,
  });

  it("periodi i prethodni period", () => {
    expect(dashboardPeriod("month", "2026-11-24")).toEqual({ from: "2026-11-01", to: "2026-11-30", prevFrom: "2026-10-01", prevTo: "2026-10-31" });
    expect(dashboardPeriod("last_month", "2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31", prevFrom: "2025-11-01", prevTo: "2025-11-30" });
    expect(dashboardPeriod("quarter", "2026-11-24")).toEqual({ from: "2026-10-01", to: "2026-12-31", prevFrom: "2026-07-01", prevTo: "2026-09-30" });
    expect(dashboardPeriod("year", "2026-11-24")).toEqual({ from: "2026-01-01", to: "2026-12-31", prevFrom: "2025-01-01", prevTo: "2025-12-31" });
  });

  it("iznosi nedelje idu po danima srazmerno satima i zbir je tačan", () => {
    const byDay = amountsByDay([ts()], "2026-11-01", "2026-11-30");
    expect(byDay.get("2026-11-02")).toEqual({ revenue: 200, cost: 120, hours: 8 });
    expect(byDay.get("2026-11-03")).toEqual({ revenue: 200, cost: 120, hours: 8 });
    expect(byDay.size).toBe(2);
    expect(periodKpis(byDay)).toEqual({ revenue: 400, cost: 240, profit: 160, marginPct: 40, hours: 16 });
  });

  it("nedelja preko granice perioda ulazi samo danima u periodu; neodobrene se ne računaju", () => {
    const row = ts({ week_start: "2026-10-26", mon_hours: 8, tue_hours: 0, wed_hours: 0, thu_hours: 0, fri_hours: 8, sat_hours: 0, sun_hours: 0, total_hours: 16 });
    const byDay = amountsByDay([row, ts({ approval_status: "submitted" })], "2026-11-01", "2026-11-30");
    expect(byDay.size).toBe(0);
    const edge = amountsByDay([ts({ week_start: "2026-10-26", thu_hours: 0, fri_hours: 0, mon_hours: 0, tue_hours: 0, sun_hours: 8, total_hours: 8, client_revenue: 100, worker_cost: 60 })], "2026-11-01", "2026-11-30");
    expect(periodKpis(edge)).toMatchObject({ revenue: 100, cost: 60, profit: 40 });
  });

  it("bez podataka su sve nule, marža je null, promena bez osnovice je null", () => {
    expect(periodKpis(new Map())).toEqual({ revenue: 0, cost: 0, profit: 0, marginPct: null, hours: 0 });
    expect(changePct(10, 0)).toBeNull();
    expect(changePct(112.4, 100)).toBe(12.4);
    expect(changePct(50, 100)).toBe(-50);
  });

  it("kumulativni niz po danima", () => {
    const s = cumulativeSeries(amountsByDay([ts()], "2026-11-01", "2026-11-04"), "2026-11-01", "2026-11-04");
    expect(s.map((r) => r.revenue)).toEqual([0, 200, 400, 400]);
    expect(s[3]).toMatchObject({ cost: 240, profit: 160 });
  });

  it("top liste po zaradi, klijent preko projekta", () => {
    const rows = [
      ts({ project_id: "p1", employee_id: "e1" }),
      ts({ project_id: "p2", employee_id: "e1", client_revenue: 1000, worker_cost: 500, total_hours: 20 }),
      ts({ project_id: "p3", employee_id: "e2", client_revenue: 100, worker_cost: 90, total_hours: 4 }),
      ts({ project_id: null, employee_id: "e3" }),
    ];
    const projects = [{ id: "p1", client_id: "c1" }, { id: "p2", client_id: "c1" }, { id: "p3", client_id: "c2" }];
    const top = topLists(rows, projects, 2);
    expect(top.projects.map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(top.projects[0]).toMatchObject({ revenue: 1000, profit: 500, marginPct: 50 });
    expect(top.clients.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(top.clients[0]).toMatchObject({ revenue: 1400, profit: 660 });
    expect(top.workers[0]).toMatchObject({ id: "e1", hours: 36, profit: 660 });
  });

  it("sledeći rok isplate je kraj tekućeg meseca, nikad datum iz prošlosti", () => {
    const runs = [{ status: "approved", month: "2026-10-01" }, { status: "approved", month: "2026-03-01" }];
    expect(upcomingPayrollDate(runs, "2026-11-24")).toBe("2026-11-30");
    expect(upcomingPayrollDate([], "2026-11-24")).toBe("2026-11-30");
    expect(upcomingPayrollDate(runs, "2026-11-30")).toBe("2026-11-30");
  });

  it("zakasnele isplate: odobren a neisplaćen obračun iz prošlih meseci, najstariji prvi", () => {
    const runs = [
      { status: "approved", month: "2026-10-01" },
      { status: "approved", month: "2026-03-01" },
      { status: "approved", month: "2026-11-01" },
      { status: "paid", month: "2026-02-01" },
    ];
    expect(overduePayrollMonths(runs, "2026-11-24")).toEqual(["2026-03-01", "2026-10-01"]);
    expect(overduePayrollMonths([], "2026-11-24")).toEqual([]);
  });

  it("filter po projektu i klijentu", () => {
    const projects = [{ id: "p1", client_id: "c1" }, { id: "p2", client_id: "c1" }, { id: "p3", client_id: "c2" }];
    const rows = [{ project_id: "p1" }, { project_id: "p2" }, { project_id: "p3" }, { project_id: null }];
    expect(filterTimesheets(rows, projects, {})).toHaveLength(4);
    expect(filterTimesheets(rows, projects, { projectId: "all", clientId: "all" })).toHaveLength(4);
    expect(filterTimesheets(rows, projects, { clientId: "c1" }).map((r) => r.project_id)).toEqual(["p1", "p2"]);
    expect(filterTimesheets(rows, projects, { projectId: "p3" })).toHaveLength(1);
    expect(filterTimesheets(rows, projects, { projectId: "p1", clientId: "c2" })).toHaveLength(0);
  });
});
