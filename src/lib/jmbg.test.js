import { describe, it, expect } from "vitest";
import { jmbgValid } from "./jmbg";

describe("jmbgValid", () => {
  it("prihvata ispravan JMBG", () => expect(jmbgValid("0101990710008")).toBe(true));
  it("odbija pogrešnu kontrolnu cifru", () => expect(jmbgValid("0101990710009")).toBe(false));
  it("odbija 12 cifara", () => expect(jmbgValid("010199071000")).toBe(false));
  it("odbija 14 cifara", () => expect(jmbgValid("01019907100080")).toBe(false));
  it("odbija slova", () => expect(jmbgValid("01019907100a8")).toBe(false));
  it("prazno je dozvoljeno", () => {
    expect(jmbgValid("")).toBe(true);
    expect(jmbgValid(null)).toBe(true);
    expect(jmbgValid(undefined)).toBe(true);
  });
});
