import { describe, expect, it } from "vitest";
import { parseCoef, parseDailyHours } from "./coefficientInput";

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
