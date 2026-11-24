import { describe, expect, it } from "vitest";
import { defaultEuropeanHolidays, missingDefaultHolidays, westernEaster } from "./europeanHolidays";

describe("zapadni Uskrs", () => {
  it("poznati datumi", () => {
    expect(westernEaster(2024)).toBe("2024-03-31");
    expect(westernEaster(2025)).toBe("2025-04-20");
    expect(westernEaster(2026)).toBe("2026-04-05");
    expect(westernEaster(2027)).toBe("2027-03-28");
    expect(westernEaster(2028)).toBe("2028-04-16");
    expect(westernEaster(2038)).toBe("2038-04-25"); // najkasniji mogući
    expect(westernEaster(2285)).toBe("2285-03-22"); // najraniji mogući
  });
  it("neispravna godina je greška", () => {
    for (const y of [1500, 2026.5, "abc", null]) expect(() => westernEaster(y)).toThrow();
  });
});

describe("osnovni evropski praznici", () => {
  it("2026: tačni datumi, sortirano", () => {
    expect(defaultEuropeanHolidays(2026)).toEqual([
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-04-03", name: "Good Friday" },
      { date: "2026-04-06", name: "Easter Monday" },
      { date: "2026-05-01", name: "Labour Day" },
      { date: "2026-05-14", name: "Ascension Day" },
      { date: "2026-05-25", name: "Whit Monday" },
      { date: "2026-12-25", name: "Christmas Day" },
      { date: "2026-12-26", name: "St. Stephen's Day" },
    ]);
  });
  it("2027: pokretni praznici prate Uskrs 28.3.", () => {
    const byName = Object.fromEntries(defaultEuropeanHolidays(2027).map((h) => [h.name, h.date]));
    expect(byName).toMatchObject({
      "Good Friday": "2027-03-26",
      "Easter Monday": "2027-03-29",
      "Ascension Day": "2027-05-06",
      "Whit Monday": "2027-05-17",
    });
  });
  it("preskače datume koji već postoje (i kad je naziv drugačiji)", () => {
    const missing = missingDefaultHolidays(2026, [{ date: "2026-01-01", name: "Nova godina" }, "2026-12-25"]);
    expect(missing.map((h) => h.date)).toEqual([
      "2026-04-03", "2026-04-06", "2026-05-01", "2026-05-14", "2026-05-25", "2026-12-26",
    ]);
    expect(missingDefaultHolidays(2026, defaultEuropeanHolidays(2026))).toEqual([]);
  });
});
