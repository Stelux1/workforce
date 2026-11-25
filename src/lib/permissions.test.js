import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS, MATRIX_CODES, PERMISSION_MATRIX, VIEW_ONLY_CODES, diffFromRole, presetCodes, PERMISSION_LABELS, PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, ROLES,
  SECTION_PERMISSIONS, can, canAll, effectivePermissions, permissionLabel, roleLabel,
} from "./permissions";

describe("katalog prava (§2.1)", () => {
  it("30 kodova + 13 sekcija + 4 izmene (D31); svaki kod tačno jednom u matrici, sa nazivom na tri jezika", () => {
    expect(ALL_PERMISSIONS).toHaveLength(47);
    expect(SECTION_PERMISSIONS).toHaveLength(13);
    expect(new Set(MATRIX_CODES)).toEqual(new Set(ALL_PERMISSIONS));
    expect(MATRIX_CODES).toHaveLength(ALL_PERMISSIONS.length);
    for (const g of PERMISSION_MATRIX) for (const a of g.areas) {
      expect(a.label.en && a.label.rs && a.label.sk).toBeTruthy();
      for (const e of a.extra) expect(e.label.en && e.label.rs && e.label.sk).toBeTruthy();
    }
    for (const code of ALL_PERMISSIONS) {
      expect(PERMISSION_LABELS[code]?.en && PERMISSION_LABELS[code]?.rs && PERMISSION_LABELS[code]?.sk).toBeTruthy();
    }
  });

  it("četiri uloge sa nazivima", () => {
    expect(ROLES).toEqual(["admin", "project_manager", "hr", "finance"]);
    for (const r of ROLES) expect(ROLE_LABELS[r].rs).toBeTruthy();
    expect(roleLabel("project_manager", "rs")).toBe("Projekt menadžer");
    expect(roleLabel("nepoznata", "rs")).toBe("nepoznata");
    expect(permissionLabel("rates.manage", "en")).toBe("Enter and change rates");
  });

  it("sve uloge podrazumevano vide sve sekcije (isto kao seed u migraciji 20261125190000)", () => {
    for (const codes of Object.values(ROLE_DEFAULTS)) for (const c of SECTION_PERMISSIONS) expect(codes).toContain(c);
  });

  it("presetovi: samo pregled nema nijednu izmenu ni odobravanje; „kao uloga\" vraća podrazumevana", () => {
    const view = presetCodes("viewAll");
    expect(view).toEqual(VIEW_ONLY_CODES);
    for (const c of view) expect(c).not.toMatch(/manage|edit|approve|record|correct|export/);
    expect(view).toContain("view.employees");
    expect(view).toContain("payroll.view");
    expect(view).toContain("rates.view_b2c");
    expect(presetCodes("role", ROLE_DEFAULTS.hr)).toEqual([...ROLE_DEFAULTS.hr]);
    expect(presetCodes("none")).toEqual([]);
    const all = presetCodes("all");
    expect(all).not.toContain("users.manage");
    expect(all).toContain("payroll.manage");
  });

  it("diffFromRole: šta se dodaje i oduzima u odnosu na ulogu", () => {
    expect(diffFromRole(["a", "c"], ["a", "b"])).toEqual({ granted: ["c"], denied: ["b"] });
    expect(diffFromRole(["a"], ["a"])).toEqual({ granted: [], denied: [] });
  });

  it("podrazumevana prava koriste samo kodove iz kataloga", () => {
    for (const codes of Object.values(ROLE_DEFAULTS)) for (const c of codes) expect(ALL_PERMISSIONS).toContain(c);
  });

  it("matrica §2.1: ključna razgraničenja", () => {
    const { project_manager: pm, hr, finance: fin } = ROLE_DEFAULTS;
    expect(hr).not.toContain(PERMISSIONS.RATES_VIEW_B2B); // HR bez novca (D30 K1)
    expect(hr).not.toContain(PERMISSIONS.RATES_VIEW_B2C);
    expect(hr).not.toContain(PERMISSIONS.COSTS_VIEW);
    expect(pm).toContain(PERMISSIONS.RATES_VIEW_B2B);
    expect(pm).not.toContain(PERMISSIONS.RATES_VIEW_B2C); // T26: PM ne vidi trošak rada
    expect(pm).toContain(PERMISSIONS.LEAVE_APPROVE_SHORTAGE); // T24
    expect(hr).not.toContain(PERMISSIONS.LEAVE_APPROVE_SHORTAGE);
    expect(hr).toContain(PERMISSIONS.DOCUMENTS_VIEW_SENSITIVE); // T19
    expect(pm).not.toContain(PERMISSIONS.DOCUMENTS_VIEW_SENSITIVE);
    expect(fin).toContain(PERMISSIONS.TIMESHEETS_CORRECT);
    for (const codes of [pm, hr, fin]) {
      expect(codes).not.toContain(PERMISSIONS.USERS_MANAGE);
      expect(codes).not.toContain(PERMISSIONS.SETTINGS_MANAGE);
    }
  });
});

describe("can / canAll", () => {
  it("jedno pravo, bar jedno od niza, bez zahteva", () => {
    const perms = ["costs.view", "projects.manage"];
    expect(can(perms, "costs.view")).toBe(true);
    expect(can(perms, "costs.manage")).toBe(false);
    expect(can(perms, ["rates.view_b2b", "costs.view"])).toBe(true);
    expect(can(perms, ["rates.view_b2b"])).toBe(false);
    expect(can(perms, null)).toBe(true);
    expect(can(perms, [])).toBe(true);
    expect(can(new Set(perms), "projects.manage")).toBe(true);
    expect(can(undefined, "costs.view")).toBe(false);
    expect(canAll(perms, ["costs.view", "projects.manage"])).toBe(true);
    expect(canAll(perms, ["costs.view", "rates.manage"])).toBe(false);
  });
});

describe("effectivePermissions (isto kao has_permission u bazi)", () => {
  it("override granted=false oduzima, granted=true dodaje", () => {
    const set = effectivePermissions("hr", [
      { permission: "employees.manage", granted: false },
      { permission: "costs.view", granted: true },
    ]);
    expect(set.has("employees.manage")).toBe(false);
    expect(set.has("costs.view")).toBe(true);
    expect(set.has("documents.manage")).toBe(true);
  });

  it("admin ima sva prava i override mu ne oduzima", () => {
    const set = effectivePermissions("admin", [{ permission: "users.manage", granted: false }]);
    expect(set.size).toBe(ALL_PERMISSIONS.length);
    expect(set.has("users.manage")).toBe(true);
  });

  it("prava uloge iz baze imaju prednost nad seed-om", () => {
    expect(effectivePermissions("finance", [], ["costs.view"])).toEqual(new Set(["costs.view"]));
    expect(effectivePermissions("nepoznata").size).toBe(0);
  });
});
