import { describe, it, expect } from "vitest";
import {
  detectDelimiter, parseCsv, normalizeHeader, mapColumns, rowToObject, parseDate, csvCell, toCsv, buildTemplate,
} from "./csvImport";

describe("detectDelimiter", () => {
  it("zarez", () => expect(detectDelimiter("a,b,c\n1,2,3")).toBe(","));
  it("tačka-zarez", () => expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";"));
  it("ignoriše separator unutar navodnika", () => expect(detectDelimiter('"a,b,c";d;e\n')).toBe(";"));
  it("tab", () => expect(detectDelimiter("a\tb\n")).toBe("\t"));
});

describe("parseCsv", () => {
  it("BOM, CRLF, navodnici sa \"\" i prelomom reda u polju", () => {
    const text = '﻿Ime;Napomena\r\nMarko;"kaže ""zdravo""; ok"\r\nAna;"prvi\nred"\r\n';
    expect(parseCsv(text)).toEqual({
      headers: ["Ime", "Napomena"],
      rows: [["Marko", 'kaže "zdravo"; ok'], ["Ana", "prvi\nred"]],
      delimiter: ";",
    });
  });
  it("preskače prazne redove i trimuje ćelije", () => {
    expect(parseCsv("a,b\n\n , \n x ,2\n").rows).toEqual([["x", "2"]]);
  });
  it("UTF-8 dijakritici ostaju", () => {
    expect(parseCsv("Ime;Prezime\nĐorđe;Šćepanović").rows[0]).toEqual(["Đorđe", "Šćepanović"]);
  });
  it("izričit separator", () => expect(parseCsv("a;b,c", ",").headers).toEqual(["a;b", "c"]));
});

describe("mapiranje kolona", () => {
  const fields = [
    { key: "first_name", label: "First Name", aliases: ["Ime"] },
    { key: "last_name", label: "Last Name", aliases: ["Prezime"] },
    { key: "date_of_birth", label: "Date of Birth", aliases: ["Datum rođenja"] },
  ];
  it("normalizeHeader uklanja dijakritike, razmake i interpunkciju", () => {
    expect(normalizeHeader("Datum rođenja")).toBe("datumrodjenja");
    expect(normalizeHeader(" First_Name ")).toBe("firstname");
  });
  it("EN, SR (sa i bez dijakritika) i ključ polja", () => {
    expect(mapColumns(["IME", "last_name", "Datum rodjenja", "Nepoznato"], fields))
      .toEqual({ first_name: 0, last_name: 1, date_of_birth: 2 });
  });
  it("rowToObject", () => {
    expect(rowToObject(["Marko", "x", "Petrović"], { first_name: 0, last_name: 2 }))
      .toEqual({ first_name: "Marko", last_name: "Petrović" });
  });
});

describe("parseDate", () => {
  it.each([
    ["25.09.1996", "1996-09-25"],
    ["25.09.1996.", "1996-09-25"],
    ["5.9.1996", "1996-09-05"],
    ["25/09/1996", "1996-09-25"],
    ["25-09-1996", "1996-09-25"],
    ["1996-09-25", "1996-09-25"],
    ["29.02.2024", "2024-02-29"],
  ])("%s → %s", (input, out) => expect(parseDate(input)).toBe(out));
  it.each(["", "31.04.2026", "29.02.2026", "13/13/2026", "2026-13-01", "abc", "25.09.96"])(
    "neispravno ili prazno: %s", (input) => expect(parseDate(input)).toBeNull(),
  );
});

describe("izvoz CSV-a i šablon", () => {
  it("csvCell escapuje separator, navodnike i prelom; štiti od formula", () => {
    expect(csvCell('k"x')).toBe('"k""x"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell("-5")).toBe("-5");
  });
  it("toCsv ima BOM i CRLF", () => expect(toCsv([["a", "b"]], ";")).toBe("﻿a;b\r\n"));
  it("šablon se parsira nazad", () => {
    const fields = [{ key: "first_name", label: "First Name" }, { key: "email", label: "Email" }];
    const parsed = parseCsv(buildTemplate(fields, [["Marko", "m@x.rs"]]));
    expect(parsed.headers).toEqual(["First Name", "Email"]);
    expect(parsed.rows).toEqual([["Marko", "m@x.rs"]]);
  });
});
