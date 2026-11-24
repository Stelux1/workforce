import { describe, expect, it } from "vitest";
import { coefToPercentText, parseCoef, parseDailyHours, parsePercentCoef } from "./coefficientInput";

describe("unos koeficijenata", () => {
  it("prazno polje je null (blokira obračun), nikad 1", () => {
    expect(parseCoef("")).toEqual({ value: null, error: false });
    expect(parseCoef("  ")).toEqual({ value: null, error: false });
  });
  it("prihvata zarez i tačku", () => {
    expect(parseCoef("1,5").value).toBe(1.5);
    expect(parseCoef("2.00").value).toBe(2);
  });
  it("nula, negativno i tekst su greška", () => {
    for (const v of ["0", "-1", "abc"]) expect(parseCoef(v).error).toBe(true);
  });
  it("dnevni prag: 0 < x <= 24", () => {
    expect(parseDailyHours("8")).toBe(8);
    expect(parseDailyHours("7,5")).toBe(7.5);
    for (const v of ["0", "25", "", "x"]) expect(parseDailyHours(v)).toBeNull();
  });
});

describe("koeficijent u procentima (spec §5)", () => {
  it("procenat → koeficijent", () => {
    expect(parsePercentCoef("100")).toEqual({ value: 1, error: false });
    expect(parsePercentCoef("150")).toEqual({ value: 1.5, error: false });
    expect(parsePercentCoef("200")).toEqual({ value: 2, error: false });
    expect(parsePercentCoef("150,5")).toEqual({ value: 1.505, error: false });
    expect(parsePercentCoef("150.25")).toEqual({ value: 1.5025, error: false });
    expect(parsePercentCoef(" 125 % ")).toEqual({ value: 1.25, error: false });
    expect(parsePercentCoef("50")).toEqual({ value: 0.5, error: false });
    expect(parsePercentCoef("1000")).toEqual({ value: 10, error: false });
  });
  it("prazno je null bez greške (D5: blokira obračun, nikad 100%)", () => {
    expect(parsePercentCoef("")).toEqual({ value: null, error: false });
    expect(parsePercentCoef("   ")).toEqual({ value: null, error: false });
    expect(parsePercentCoef(null)).toEqual({ value: null, error: false });
  });
  it("nula, negativno, tekst, previše decimala i preko 1000% su greška", () => {
    for (const v of ["0", "-150", "abc", "150,555", "1000.01", "1,5,0", "1e3"]) {
      expect(parsePercentCoef(v)).toEqual({ value: null, error: true });
    }
  });
  it("koeficijent → tekst procenta", () => {
    expect(coefToPercentText(1)).toBe("100");
    expect(coefToPercentText(1.5)).toBe("150");
    expect(coefToPercentText("1.5050")).toBe("150.5");
    expect(coefToPercentText(2)).toBe("200");
    expect(coefToPercentText(null)).toBe("");
    expect(coefToPercentText(undefined)).toBe("");
  });
  it("tekst → koeficijent → tekst je isti broj", () => {
    for (const v of ["100", "150", "150.5", "137.25", "0.01"]) {
      expect(coefToPercentText(parsePercentCoef(v).value)).toBe(v);
    }
  });
});
