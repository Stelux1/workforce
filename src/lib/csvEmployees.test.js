import { describe, it, expect } from "vitest";
import { parseCsv, mapColumns } from "./csvImport";
import {
  EMPLOYEE_FIELDS, fieldsFor, employeeTemplate, isCommentRow, nextEmployeeId, maxEmployeeNumber, normalizeJmbg,
  validateEmployeeRow, findDuplicates, planImport, errorReportCsv,
} from "./csvEmployees";
import { normalizePrivate, privateFieldErrors, legacyProfilePayroll } from "./employeePrivate";

const DEPTS = [
  { name: "Construction", translation: "Građevina", positions: [{ name: "Welder", translation: "Zavarivač" }, "Mason"] },
  { name: "Office", positions: [] },
];

describe("mapiranje kolona zaposlenih", () => {
  it("EN i SR nazivi kolona", () => {
    const headers = ["Ime", "Prezime", "E-mail", "Datum rođenja", "Odeljenje", "Pozicija", "Matični broj", "Šifra radnika", "Poštanski broj", "Nešto"];
    expect(mapColumns(headers, EMPLOYEE_FIELDS)).toEqual({
      first_name: 0, last_name: 1, email: 2, date_of_birth: 3, department: 4, position: 5, jmbg: 6, employee_id: 7, postal_code: 8,
    });
  });
  it("operater ne vidi privatna polja (D3)", () => {
    expect(fieldsFor(false).some((f) => f.private)).toBe(false);
    expect(fieldsFor(true).map((f) => f.key)).toContain("jmbg");
    expect(mapColumns(["JMBG", "First Name"], fieldsFor(false))).toEqual({ first_name: 1 });
  });
});

describe("šablon", () => {
  it("zaglavlje svih polja; primer je komentar i ne uvozi se", () => {
    const { headers, rows } = parseCsv(employeeTemplate(true, { withExample: true }));
    expect(headers).toEqual(EMPLOYEE_FIELDS.map((f) => f.label));
    expect(rows).toHaveLength(1);
    expect(isCommentRow(rows[0])).toBe(true);
    expect(parseCsv(employeeTemplate(false)).headers).not.toContain("JMBG");
  });
  it("primer reda je ispravan kad se ukloni oznaka", () => {
    const { headers, rows } = parseCsv(employeeTemplate(true, { withExample: true }));
    const raw = Object.fromEntries(headers.map((h, i) => [EMPLOYEE_FIELDS.find((f) => f.label === h).key, rows[0][i]]));
    raw.employee_id = "";
    expect(validateEmployeeRow(raw, { isAdmin: true }).errors).toEqual([]);
  });
});

describe("šifra radnika (kao u formi)", () => {
  it("sledeća posle najveće EMP-xxx", () => {
    expect(nextEmployeeId([])).toBe("EMP-001");
    expect(nextEmployeeId(["EMP-002", "emp-010", "X-99", null])).toBe("EMP-011");
    expect(nextEmployeeId(["EMP-1234"])).toBe("EMP-1235");
    expect(maxEmployeeNumber(["EMP-007"])).toBe(7);
  });
});

describe("validateEmployeeRow", () => {
  const v = (raw, ctx = {}) => validateEmployeeRow(raw, { departments: DEPTS, isAdmin: true, ...ctx });

  it("ispravan red: datumi, email, enum, odeljenje i pozicija po prevodu", () => {
    const r = v({
      first_name: "Đorđe", last_name: "Šćepanović", email: "Dj@X.rs", date_of_birth: "25.09.1996.",
      gender: "Muški", department: "gradjevina", position: "zavarivač", employment_type: "Puno radno vreme",
      start_date: "2026-03-01", status: "Aktivan", jmbg: "0101990710008", iban: "rs35 1234 5678",
    });
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({
      email: "dj@x.rs", date_of_birth: "1996-09-25", gender: "male", department: "Construction", position: "Welder",
      employment_type: "full_time", start_date: "2026-03-01", status: "active", jmbg: "0101990710008", iban: "RS3512345678",
    });
  });
  it("obavezna polja", () => {
    expect(v({ first_name: "", last_name: "X" }).errors).toEqual([{ field: "first_name", key: "Required field is empty" }]);
  });
  it("neispravan email, datum, JMBG, vrednost", () => {
    const keys = v({ first_name: "A", last_name: "B", email: "a@b", start_date: "31.02.2026", jmbg: "0101990710009", gender: "x" })
      .errors.map((e) => e.field);
    expect(keys.sort()).toEqual(["email", "gender", "jmbg", "start_date"]);
  });
  it("Excel je obrisao vodeću nulu iz JMBG-a", () => {
    expect(normalizeJmbg("101990710008")).toBe("0101990710008");
    expect(normalizeJmbg("123456789012")).toBe("123456789012");
    expect(v({ first_name: "A", last_name: "B", jmbg: "101990710008" }).data.jmbg).toBe("0101990710008");
  });
  it("nepoznato odeljenje, pozicija van odeljenja, pozicija bez odeljenja", () => {
    expect(v({ first_name: "A", last_name: "B", department: "Nema" }).errors[0].field).toBe("department");
    expect(v({ first_name: "A", last_name: "B", department: "Construction", position: "Pilot" }).errors[0].field).toBe("position");
    expect(v({ first_name: "A", last_name: "B", position: "Welder" }).errors[0].key).toBe("Position requires a department");
    expect(v({ first_name: "A", last_name: "B", department: "Office", position: "Bilo šta" }).data.position).toBe("Bilo šta");
    expect(v({ first_name: "A", last_name: "B", department: "Construction", position: "mason" }).data.position).toBe("Mason");
  });
  it("bez podešenih odeljenja — slobodan unos kao u formi", () => {
    expect(v({ first_name: "A", last_name: "B", department: "Bilo", position: "Šta" }, { departments: [] }).errors).toEqual([]);
  });
  it("kraj pre početka", () => {
    expect(v({ first_name: "A", last_name: "B", start_date: "02.02.2026", end_date: "01.02.2026" }).errors[0].field).toBe("end_date");
  });
  it("operater: privatna polja se ignorišu uz upozorenje", () => {
    const r = v({ first_name: "A", last_name: "B", jmbg: "0101990710008", iban: "" }, { isAdmin: false });
    expect(r.data.jmbg).toBeUndefined();
    expect(r.warnings).toEqual([{ field: "jmbg", key: "Admin only — value ignored" }]);
  });
  it("podrazumevani status je aktivan", () => expect(v({ first_name: "A", last_name: "B" }).data.status).toBe("active"));
});

describe("duplikati i plan uvoza", () => {
  const existing = [{ first_name: "Filip", last_name: "Stefanović", employee_id: "EMP-001", email: "filip@x.rs", jmbg: "0101990710008" }];
  const row = (line, data, errors = []) => ({ line, data: { first_name: "N", last_name: "N", ...data }, errors, warnings: [] });

  it("u bazi i u fajlu (šifra, email bez obzira na velika slova, JMBG)", () => {
    const rows = [
      row(2, { employee_id: "emp-001" }),
      row(3, { email: "FILIP@x.rs" }),
      row(4, { jmbg: "0101990710008" }),
      row(5, { email: "novi@x.rs" }),
      row(6, { email: "novi@x.rs" }),
    ];
    expect(findDuplicates(rows, existing)).toEqual([
      [{ field: "employee_id", source: "database", ref: "Filip Stefanović" }],
      [{ field: "email", source: "database", ref: "Filip Stefanović" }],
      [{ field: "jmbg", source: "database", ref: "Filip Stefanović" }],
      [],
      [{ field: "email", source: "file", ref: 5 }],
    ]);
  });

  it("plan: greške, duplikati, šifre EMP-xxx posle najveće u bazi i fajlu", () => {
    const rows = [
      row(2, {}),
      row(3, { employee_id: "EMP-005" }),
      row(4, {}, [{ field: "email", key: "Invalid email address" }]),
      row(5, { email: "filip@x.rs" }),
      row(6, {}),
    ];
    const plan = planImport(rows, existing);
    expect(plan.map((p) => p.status)).toEqual(["ok", "ok", "error", "duplicate", "ok"]);
    expect(plan.map((p) => p.data.employee_id)).toEqual(["EMP-006", "EMP-005", undefined, undefined, "EMP-007"]);
  });

  it("bez preskakanja: duplikat emaila se uvozi, duplikat šifre nikad", () => {
    const plan = planImport([row(2, { email: "filip@x.rs" }), row(3, { employee_id: "EMP-001" })], existing, { skipDuplicates: false });
    expect(plan.map((p) => p.status)).toEqual(["ok", "duplicate"]);
  });

  it("izveštaj o greškama sadrži samo neuvezene redove sa brojem reda", () => {
    const csv = errorReportCsv([
      { line: 2, status: "imported", data: { first_name: "A", last_name: "B" } },
      { line: 3, status: "error", data: { first_name: "C", last_name: "D" }, errors: [{ field: "email", key: "Invalid email address" }], duplicates: [] },
      { line: 4, status: "failed", data: { first_name: "E", last_name: "F", employee_id: "EMP-009" }, errors: [], duplicates: [], importError: "Mreža" },
    ]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toEqual([
      "Row;Employee;Employee ID;Result;Details",
      "3;C D;;Error;email: Invalid email address",
      "4;E F;EMP-009;Failed;Mreža",
    ]);
  });
});

describe("employeePrivate (forma bez tarifa iz profila)", () => {
  it("novi radnik: neto, udeo 1, bez tarifa", () => {
    const out = normalizePrivate({ first_name: "A", jmbg: " ", b2c_hourly_rate: "12" }, { isNew: true });
    expect(out).toEqual({ first_name: "A", jmbg: null, rate_basis: "neto", work_fraction: 1 });
  });
  it("postojeći radnik: stare tarife, osnova i udeo se ne šalju (ostaju u bazi)", () => {
    const out = normalizePrivate({ jmbg: "0101990710008", b2c_hourly_rate: 10, rate_basis: "bruto", work_fraction: 0.5 });
    expect(out).toEqual({ jmbg: "0101990710008" });
  });
  it("greške samo za polja iz forme", () => {
    expect(privateFieldErrors({ jmbg: "123", b2c_hourly_rate: 0, work_fraction: 5 })).toEqual(["JMBG must be 13 digits with a valid check digit"]);
    expect(privateFieldErrors({ b2c_hourly_rate: 0 })).toEqual([]);
  });
  it("legacyProfilePayroll: samo vrednosti koje odstupaju od podrazumevanih", () => {
    expect(legacyProfilePayroll({ rate_basis: "neto", work_fraction: 1, b2c_hourly_rate: null })).toEqual([]);
    expect(legacyProfilePayroll({ rate_basis: "bruto", work_fraction: 0.5, b2c_hourly_rate: 12, holiday_rate: 0 }).map((x) => [x.field, x.value]))
      .toEqual([["b2c_hourly_rate", 12], ["holiday_rate", 0], ["rate_basis", "bruto"], ["work_fraction", 0.5]]);
  });
});
