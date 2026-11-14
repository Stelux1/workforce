import { describe, expect, it } from "vitest";
import { isAdminOnlyPath, normalizePath, visibleNavItems } from "./access";

describe("isAdminOnlyPath", () => {
  it("štiti novčane stranice", () => {
    for (const p of ["/payroll", "/payroll/weekly", "/payroll/reports", "/rates", "/project-costs",
      "/timesheet-dashboard", "/email-notifications", "/settings/departments", "/settings/cost-categories"]) {
      expect(isAdminOnlyPath(p)).toBe(true);
    }
  });

  it("ne može da se zaobiđe velikim slovima, kodiranjem ni kosim crtama (QA 14.11.2026)", () => {
    for (const p of ["/Payroll", "/PAYROLL/Weekly", "/Rates", "/SETTINGS/departments", "/Email-Notifications",
      "/%70ayroll/weekly", "/%2Fpayroll", "//payroll", "/payroll/", "/Project-Costs/"]) {
      expect(isAdminOnlyPath(p)).toBe(true);
    }
  });

  it("ne dira stranice dostupne operateru", () => {
    for (const p of ["/", "/employees", "/timesheets", "/clients", "/projects", "/projects/abc", "/payrollx", "/rates-info"]) {
      expect(isAdminOnlyPath(p)).toBe(false);
    }
  });

  it("normalizePath", () => {
    expect(normalizePath("/Payroll//Weekly/")).toBe("/payroll/weekly");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/%E0%A4%A")).toBe("/%e0%a4%a");
  });

  it("meni operatera ne sadrži admin stavke", () => {
    const items = [{ path: "/" }, { path: "/payroll" }, { path: "/timesheets" }, { path: "/settings/departments" }];
    expect(visibleNavItems(items, false).map((i) => i.path)).toEqual(["/", "/timesheets"]);
    expect(visibleNavItems(items, true)).toHaveLength(4);
  });
});
