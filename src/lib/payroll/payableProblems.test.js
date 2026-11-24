import { describe, expect, it } from "vitest";
import { laborProblemText } from "./payableProblems";

describe("laborProblemText (Payables → Needs attention)", () => {
  it("no_snapshot nije sirova šifra, nego uputstvo na sva tri jezika", () => {
    for (const lang of ["en", "rs", "sk"]) {
      const t = laborProblemText("no_snapshot", lang);
      expect(t).not.toContain("no_snapshot");
      expect(t.length).toBeGreaterThan(30);
    }
    expect(laborProblemText("no_snapshot", "en")).toMatch(/return it to draft/);
  });
  it("missing_rate / missing_coef prevode vrste sati", () => {
    expect(laborProblemText("missing_rate: vikend, praznik_vikend", "en")).toContain("weekend, holiday on weekend");
    expect(laborProblemText("missing_coef: prekovremeni", "sk")).toContain("nadčas");
    expect(laborProblemText("missing_coef: prekovremeni", "rs")).toContain("Koeficijenti i praznici");
  });
  it("sve šifre iz labor_day_problems imaju tekst; nepoznata ostaje vidljiva uz uputstvo", () => {
    for (const code of ["no_project", "no_snapshot", "snapshot_mismatch", "missing_rate", "missing_coef"]) {
      expect(laborProblemText(code, "en")).not.toMatch(/calculation problem/);
    }
    expect(laborProblemText("novo_pravilo", "en")).toBe("calculation problem (novo_pravilo) — open the timesheet and check the rates and hours");
  });
});
