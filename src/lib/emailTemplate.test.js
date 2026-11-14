import { describe, expect, it } from "vitest";
import { COMPANY_NAME_MISSING, companyNameOf, fillEmailTemplate } from "./emailTemplate.js";

describe("fillEmailTemplate", () => {
  const text = "Poštovani {employee_name},\n{week_start}\nSrdačno,\n{company_name}";
  it("uzima naziv firme iz podataka firme, ne iz koda", () => {
    const out = fillEmailTemplate(text, { employeeName: "Petar Petrović", companyName: "  Moja Firma DOO " });
    expect(out).toBe("Poštovani Petar Petrović,\n{week_start}\nSrdačno,\nMoja Firma DOO");
    expect(out).not.toContain("Stelux");
  });
  it("prazan naziv firme daje vidljivu oznaku, ne izmišljen naziv", () => {
    for (const name of ["", "   ", null, undefined]) {
      const out = fillEmailTemplate("{company_name}", { companyName: name });
      expect(out).toBe(COMPANY_NAME_MISSING);
    }
  });
  it("menja sve pojave i ne dira ostale oznake", () => {
    expect(fillEmailTemplate("{company_name} / {company_name} / {amount}", { companyName: "X" })).toBe("X / X / {amount}");
  });
  it("$ u nazivu se ne tumači kao specijalni obrazac", () => {
    expect(fillEmailTemplate("{company_name}", { companyName: "A$&B" })).toBe("A$&B");
  });
  it("bez primaoca {employee_name} ostaje u pregledu", () => {
    expect(fillEmailTemplate("{employee_name}", { companyName: "X" })).toBe("{employee_name}");
  });
  it("companyNameOf čita name iz reda", () => {
    expect(companyNameOf({ name: " Firma " })).toBe("Firma");
    expect(companyNameOf(null)).toBe("");
  });
});
