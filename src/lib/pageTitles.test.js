import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NAV_LABELS, NAV_SECTIONS } from "@/components/layout/navConfig";
import { pageTitle } from "@/lib/pageTitles";

const src = (p) => readFileSync(resolve(__dirname, "..", p), "utf8");

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
  it("nove stavke (spec §2.1): Project Assignments, Workforce Planning, Payables, Payroll Reports — isto ime u meniju i naslovu", () => {
    const want = {
      "Project Assignments": ["Project Assignments", "Angažmani na projektima", "Pridelenia na projektoch"],
      "Workforce Planning": ["Workforce Planning", "Planiranje radne snage", "Plánovanie pracovnej sily"],
      "Payables": ["Payables & Payments", "Obaveze i isplate", "Záväzky a výplaty"],
      "Payroll Reports": ["Payroll Reports", "Finansijski izveštaji", "Finančné prehľady"],
    };
    for (const [key, names] of Object.entries(want)) {
      ["en", "rs", "sk"].forEach((l, i) => expect(pageTitle(key, l), `${l}:${key}`).toBe(names[i]));
    }
  });
  it("stranice čitaju naslov iz menija (pageTitle), ne iz posebnog teksta", () => {
    const pages = {
      "pages/assignments/ProjectAssignmentsPage.jsx": "Project Assignments",
      "pages/workforce/WorkforcePlanningPage.jsx": "Workforce Planning",
      "pages/payroll/Payables.jsx": "Payables",
      "pages/payroll/PayrollReports.jsx": "Payroll Reports",
      "pages/payroll/Clients.jsx": "Clients",
      "pages/payroll/Timesheets.jsx": "Timesheets",
      "pages/LeaveRequests.jsx": "Leave Requests",
      "pages/Notifications.jsx": "Notifications",
      "pages/projects/ProjectCostsPage.jsx": "Project Costs",
    };
    for (const [file, key] of Object.entries(pages)) expect(src(file), file).toContain(`pageTitle("${key}", lang)`);
  });
  it("u tekstovima nema starog naziva Rates & Assignments", () => {
    for (const file of ["api/errors.js", "pages/payroll/Timesheets.jsx"]) {
      expect(src(file), file).not.toMatch(/Rates & Assignments|Tarife i angažmani|Tarifama i angažmanima|Sadzby a pridelenia/);
    }
  });
});
