import { describe, expect, it } from "vitest";
import { pick } from "./translations";
import { SK } from "./translations.sk";
import { NATIONALITY_SK, COUNTRY_SK } from "./geoNames.sk";
import { normalizeLanguage } from "./AppSettingsContext";
import { formatDate, intlLocale } from "./dateFormat";

describe("pick (en / rs / sk)", () => {
  it("vraća tekst za izabrani jezik", () => {
    expect(pick("en", "Save", "Sačuvaj", "Uložiť")).toBe("Save");
    expect(pick("rs", "Save", "Sačuvaj", "Uložiť")).toBe("Sačuvaj");
    expect(pick("sk", "Save", "Sačuvaj", "Uložiť")).toBe("Uložiť");
  });
  it("slovački bez trećeg argumenta traži rečnik, pa pada na engleski", () => {
    expect(pick("sk", "Employees", "Zaposleni")).toBe(SK["Employees"]);
    expect(pick("sk", "Text without translation", "Tekst")).toBe("Text without translation");
  });
});

describe("jezik aplikacije", () => {
  it("nepoznat jezik postaje engleski", () => {
    expect(normalizeLanguage("SK")).toBe("sk");
    expect(normalizeLanguage("rs")).toBe("rs");
    expect(normalizeLanguage("de")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });
  it("datumi i locale prate jezik", () => {
    const d = new Date(2026, 10, 24);
    expect(formatDate(d, "d. MMM", "sk")).toBe("24. nov");
    expect(formatDate(d, "MMM d", "en")).toBe("Nov 24");
    expect(intlLocale("sk")).toBe("sk-SK");
  });
});

describe("slovački rečnik", () => {
  it("nema praznih vrednosti", () => {
    for (const [k, v] of Object.entries({ ...SK, ...NATIONALITY_SK, ...COUNTRY_SK })) {
      expect(typeof v === "string" && v.trim().length > 0, k).toBe(true);
    }
  });
});
