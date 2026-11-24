import { describe, expect, it } from "vitest";
import { NAV_LABELS, NAV_SECTIONS } from "@/components/layout/navConfig";
import { pageTitle } from "@/lib/pageTitles";

describe("naslovi stranica prate meni", () => {
  it("vraća naziv iz menija za svaki jezik", () => {
    expect(pageTitle("Timesheet Dashboard", "en")).toBe("Timesheet Overview");
    expect(pageTitle("Projects", "en")).toBe("Project Overview");
    expect(pageTitle("Projects", "rs")).toBe("Pregled projekata");
    expect(pageTitle("Projects", "sk")).toBe("Prehľad projektov");
  });
  it("svaka stavka menija ima naziv u sva tri jezika", () => {
    for (const s of NAV_SECTIONS) for (const it of s.items) for (const l of ["en", "rs", "sk"]) expect(NAV_LABELS[l][it.label], `${l}:${it.label}`).toBeTruthy();
  });
});
