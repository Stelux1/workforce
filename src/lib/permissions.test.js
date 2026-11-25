import { describe, expect, it } from "vitest";
import {
  ALL_PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS, PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, ROLES,
  SECTION_PERMISSIONS, can, canAll, effectivePermissions, permissionLabel, roleLabel,
} from "./permissions";

describe("katalog prava (§2.1)", () => {
  it("30 kodova + 13 sekcija (D31), svi u grupama i sa nazivom na tri jezika", () => {
    expect(ALL_PERMISSIONS).toHaveLength(43);
    expect(SECTION_PERMISSIONS).toHaveLength(13);
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.codes);
    expect(new Set(grouped)).toEqual(new Set(ALL_PERMISSIONS));
    expect(grouped).toHaveLength(ALL_PERMISSIONS.length);
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
