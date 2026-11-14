import { describe, expect, it } from "vitest";
import { resolveRange } from "./timesheetReport";

describe("resolveRange — ručni opseg", () => {
  const base = { periodType: "custom", year: 2026, weekFrom: 1, weekTo: 1, month: 0 };
  it("obrnut opseg se okreće", () => {
    const r = resolveRange({ ...base, dateFrom: "2026-11-30", dateTo: "2026-11-01" });
    expect(r.start.getDate()).toBe(1);
    expect(r.end.getDate()).toBe(30);
  });
  it("obrisan datum ne ruši (koristi drugi datum)", () => {
    const r = resolveRange({ ...base, dateFrom: "", dateTo: "2026-11-30" });
    expect(Number.isNaN(r.start.getTime())).toBe(false);
    expect(r.start.getTime()).toBe(r.end.getTime());
  });
  it("bez oba datuma → tekući mesec", () => {
    const r = resolveRange({ ...base, dateFrom: "", dateTo: "" });
    expect(r.start.getDate()).toBe(1);
    expect(Number.isNaN(r.end.getTime())).toBe(false);
  });
});
