import { describe, expect, it } from "vitest";
import { canAccessPath, normalizePath, requiredPermission, visibleNavItems } from "./access";
import { ALL_PERMISSIONS, ROLE_DEFAULTS, effectivePermissions } from "./permissions";

const ADMIN = ALL_PERMISSIONS;
const PM = ROLE_DEFAULTS.project_manager;
const HR = ROLE_DEFAULTS.hr;
const FIN = ROLE_DEFAULTS.finance;

// Meni Teamora (src/components/layout/navConfig.js) — adrese koje se proveravaju.
const NAV = ["/", "/employees", "/vendors", "/documents", "/attendance", "/schedule", "/tasks", "/leave-requests",
  "/notifications", "/reports", "/projects", "/project-costs", "/rates", "/payroll", "/timesheets",
  "/timesheet-dashboard", "/payroll/monthly", "/clients", "/payroll/reports", "/email-notifications",
  "/settings/departments", "/settings/cost-categories", "/settings/coefficients", "/settings/company",
  "/settings/users", "/settings/general"].map((path) => ({ path }));
const menu = (perms) => visibleNavItems(NAV, perms).map((i) => i.path);

describe("ROUTE_PERMISSIONS / canAccessPath", () => {
  it("novčane stranice traže pravo", () => {
    expect(requiredPermission("/payroll/monthly")).toBe("payroll.view");
    expect(requiredPermission("/project-costs")).toBe("costs.view");
    expect(requiredPermission("/settings/users")).toBe("users.manage");
    expect(requiredPermission("/settings/departments")).toBe("settings.manage");
    expect(requiredPermission("/employees")).toBe("view.employees");
    expect(requiredPermission("/employees/abc")).toBe("view.employees");
    expect(requiredPermission("/timesheet-dashboard")).toEqual(["rates.view_b2b", "rates.view_b2c"]);
    expect(requiredPermission("/")).toBeNull();
    expect(requiredPermission("/notifications")).toBeNull();
  });

  it("ne može da se zaobiđe velikim slovima, kodiranjem ni kosim crtama (QA 14.11.2026)", () => {
    for (const p of ["/Payroll", "/PAYROLL/Monthly", "/Rates", "/SETTINGS/departments", "/Email-Notifications",
      "/%70ayroll/monthly", "/%2Fpayroll", "//payroll", "/payroll/", "/Project-Costs/"]) {
      expect(canAccessPath(p, HR)).toBe(false);
      expect(canAccessPath(p, ADMIN)).toBe(true);
    }
  });

  it("sličan prefiks nije ista stranica", () => {
    for (const p of ["/payrollx", "/rates-info", "/settingsx"]) expect(canAccessPath(p, [])).toBe(true);
  });

  it("normalizePath", () => {
    expect(normalizePath("/Payroll//Weekly/")).toBe("/payroll/weekly");
    expect(normalizePath("")).toBe("/");
    expect(normalizePath("/%E0%A4%A")).toBe("/%e0%a4%a");
  });

  it("bez prava (neaktivan / prazan spisak) vide se samo početna i obaveštenja", () => {
    expect(menu([])).toEqual(["/", "/notifications"]);
  });

  it("sakrivena sekcija (override view.* = false) nestaje iz menija i adresa se ne otvara (D31)", () => {
    const perms = effectivePermissions("hr", [
      { permission: "view.tasks", granted: false },
      { permission: "view.projects", granted: false },
    ]);
    expect(menu(perms)).not.toContain("/tasks");
    expect(menu(perms)).not.toContain("/projects");
    expect(menu(perms)).toContain("/employees");
    expect(canAccessPath("/projects/123", perms)).toBe(false);
    expect(canAccessPath("/Tasks", perms)).toBe(false);
  });
});

describe("meni po ulozi (T26 osnova, §4)", () => {
  it("admin vidi sve", () => {
    expect(menu(ADMIN)).toHaveLength(NAV.length);
  });

  it("HR: radnici, projekti, satnice; bez novca i podešavanja", () => {
    const m = menu(HR);
    for (const p of ["/employees", "/documents", "/projects", "/timesheets", "/clients", "/leave-requests"]) expect(m).toContain(p);
    for (const p of ["/payroll", "/payroll/monthly", "/project-costs", "/rates", "/timesheet-dashboard",
      "/settings/users", "/settings/company", "/email-notifications"]) expect(m).not.toContain(p);
  });

  it("PM: troškovi i tarife (B2B), bez obračuna i podešavanja", () => {
    const m = menu(PM);
    for (const p of ["/projects", "/project-costs", "/rates", "/timesheets", "/timesheet-dashboard"]) expect(m).toContain(p);
    for (const p of ["/payroll", "/payroll/monthly", "/settings/users", "/settings/coefficients"]) expect(m).not.toContain(p);
  });

  it("Finance: obračun, tarife, troškovi; bez Users i podešavanja", () => {
    const m = menu(FIN);
    for (const p of ["/payroll", "/payroll/monthly", "/payroll/reports", "/project-costs", "/rates"]) expect(m).toContain(p);
    for (const p of ["/settings/users", "/settings/company", "/email-notifications"]) expect(m).not.toContain(p);
  });

  it("override: Users bez settings.manage otvara samo /settings/users", () => {
    const perms = [...HR, "users.manage"];
    expect(canAccessPath("/settings/users", perms)).toBe(true);
    expect(canAccessPath("/settings/company", perms)).toBe(false);
  });
});
