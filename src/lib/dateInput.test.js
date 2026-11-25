import { describe, expect, it } from "vitest";
import { displayToIso, isoToDisplay, maskDateTyping } from "./dateInput";

describe("dateInput", () => {
  it("prikazuje ISO kao dd-mm-yyyy", () => {
    expect(isoToDisplay("2026-11-05")).toBe("05-11-2026");
    expect(isoToDisplay("2026-11-05T10:00:00Z")).toBe("05-11-2026");
    expect(isoToDisplay("")).toBe("");
    expect(isoToDisplay(null)).toBe("");
  });

  it("čita dd-mm-yyyy i slične zapise", () => {
    expect(displayToIso("05-11-2026")).toBe("2026-11-05");
    expect(displayToIso("5.1.2026.")).toBe("2026-01-05");
    expect(displayToIso("29/02/2024")).toBe("2024-02-29");
  });

  it("odbija nevažeće i nepotpune datume", () => {
    expect(displayToIso("31-02-2026")).toBeNull();
    expect(displayToIso("29-02-2025")).toBeNull();
    expect(displayToIso("12-13-2026")).toBeNull();
    expect(displayToIso("05-11-20")).toBeNull();
    expect(displayToIso("")).toBeNull();
  });

  it("dodaje crtice dok se kucaju cifre", () => {
    expect(maskDateTyping("25")).toBe("25");
    expect(maskDateTyping("2511")).toBe("25-11");
    expect(maskDateTyping("25112026")).toBe("25-11-2026");
    expect(maskDateTyping("251120261")).toBe("25-11-2026");
    expect(maskDateTyping("25-11-2026")).toBe("25-11-2026");
  });
});
