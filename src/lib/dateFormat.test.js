import { describe, expect, it } from "vitest";
import { formatIsoDate } from "@/lib/dateFormat";

describe("formatIsoDate", () => {
  it("prikazuje datum po jeziku", () => {
    expect(formatIsoDate("2026-01-01", "en")).toBe("Jan 1, 2026");
    expect(formatIsoDate("2026-01-01", "rs")).toBe("01.01.2026.");
    expect(formatIsoDate("2026-01-01", "sk")).toBe("1. 1. 2026");
    expect(formatIsoDate("2026-12-25", "sk")).toBe("25. 12. 2026");
  });
  it("neispravan ulaz vraća nepromenjen", () => {
    expect(formatIsoDate("", "en")).toBe("");
    expect(formatIsoDate(null, "rs")).toBe("");
    expect(formatIsoDate("2026-02-31", "en")).toBe("2026-02-31");
  });
});
