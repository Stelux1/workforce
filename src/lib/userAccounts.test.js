import { describe, expect, it } from "vitest";
import {
  activeAdminCount, isLastActiveAdmin, needsSelfConfirm, overrideChange, permissionState, removesAdminAccess, roleDefaultsFrom,
  userPermissions, ROLES,
} from "./userAccounts";

const admin = { id: "a", role: "admin", active: true };
const admin2 = { id: "b", role: "admin", active: true };
const inactiveAdmin = { id: "c", role: "admin", active: false };
const operater = { id: "d", role: "hr", active: true }; // bivši operater (D30 K1)

describe("userAccounts", () => {
  it("broji samo aktivne admine", () => {
    expect(activeAdminCount([admin, admin2, inactiveAdmin, operater])).toBe(2);
    expect(activeAdminCount([])).toBe(0);
  });

  it("poslednji aktivan admin", () => {
    expect(isLastActiveAdmin([admin, inactiveAdmin, operater], "a")).toBe(true);
    expect(isLastActiveAdmin([admin, admin2], "a")).toBe(false);
    expect(isLastActiveAdmin([admin, operater], "d")).toBe(false);
  });

  it("izmena koja oduzima admin pristup", () => {
    expect(removesAdminAccess(admin, { active: false })).toBe(true);
    expect(removesAdminAccess(admin, { role: "hr" })).toBe(true);
    expect(removesAdminAccess(admin, { role: "admin" })).toBe(false);
    expect(removesAdminAccess(inactiveAdmin, { role: "hr" })).toBe(false);
    expect(removesAdminAccess(operater, { active: false })).toBe(false);
  });

  it("potvrda samo kad admin sebi oduzima pristup, a ostaje drugi aktivan admin", () => {
    expect(needsSelfConfirm([admin, admin2], admin, { active: false }, "a")).toBe(true);
    expect(needsSelfConfirm([admin, admin2], admin, { role: "hr" }, "a")).toBe(true);
    // poslednji aktivan admin: bez pitanja, baza odbija izmenu
    expect(needsSelfConfirm([admin, operater], admin, { active: false }, "a")).toBe(false);
    // tuđi nalog i izmena koja ne oduzima pristup
    expect(needsSelfConfirm([admin, admin2], admin2, { active: false }, "a")).toBe(false);
    expect(needsSelfConfirm([admin, admin2], operater, { role: "admin" }, "a")).toBe(false);
  });

  it("četiri uloge (D30 K1/K2)", () => {
    expect(ROLES).toEqual(["admin", "project_manager", "hr", "finance"]);
    expect(removesAdminAccess(admin, { role: "finance" })).toBe(true);
  });

  it("override: stanje prava i šta se upisuje", () => {
    const hrDefaults = ["employees.manage", "documents.manage"];
    expect(permissionState("employees.manage", hrDefaults, [])).toEqual({ byRole: true, override: null, effective: true });
    expect(permissionState("employees.manage", hrDefaults, [{ permission: "employees.manage", granted: false }]))
      .toEqual({ byRole: true, override: false, effective: false });
    expect(permissionState("costs.view", hrDefaults, [{ permission: "costs.view", granted: true }]).effective).toBe(true);
    // isto kao uloga → briše se override; drugačije → upisuje se
    expect(overrideChange("employees.manage", true, hrDefaults)).toEqual({ action: "delete", permission: "employees.manage" });
    expect(overrideChange("employees.manage", false, hrDefaults)).toEqual({ action: "upsert", permission: "employees.manage", granted: false });
    expect(overrideChange("costs.view", true, hrDefaults)).toEqual({ action: "upsert", permission: "costs.view", granted: true });
  });

  it("prava uloge iz baze i efektivna prava korisnika", () => {
    const defaults = roleDefaultsFrom([{ role: "hr", permission: "a" }, { role: "hr", permission: "b" }, { role: "finance", permission: "c" }]);
    expect(defaults).toEqual({ hr: ["a", "b"], finance: ["c"] });
    const set = userPermissions(operater, [{ user_id: "d", permission: "b", granted: false }, { user_id: "x", permission: "a", granted: false }], defaults.hr);
    expect([...set]).toEqual(["a"]);
    expect(userPermissions(admin, [], []).has("users.manage")).toBe(true);
  });
});
