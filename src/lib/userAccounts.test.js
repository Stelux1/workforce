import { describe, expect, it } from "vitest";
import { activeAdminCount, isLastActiveAdmin, needsSelfConfirm, removesAdminAccess } from "./userAccounts";

const admin = { id: "a", role: "admin", active: true };
const admin2 = { id: "b", role: "admin", active: true };
const inactiveAdmin = { id: "c", role: "admin", active: false };
const operater = { id: "d", role: "operater", active: true };

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
    expect(removesAdminAccess(admin, { role: "operater" })).toBe(true);
    expect(removesAdminAccess(admin, { role: "admin" })).toBe(false);
    expect(removesAdminAccess(inactiveAdmin, { role: "operater" })).toBe(false);
    expect(removesAdminAccess(operater, { active: false })).toBe(false);
  });

  it("potvrda samo kad admin sebi oduzima pristup, a ostaje drugi aktivan admin", () => {
    expect(needsSelfConfirm([admin, admin2], admin, { active: false }, "a")).toBe(true);
    expect(needsSelfConfirm([admin, admin2], admin, { role: "operater" }, "a")).toBe(true);
    // poslednji aktivan admin: bez pitanja, baza odbija izmenu
    expect(needsSelfConfirm([admin, operater], admin, { active: false }, "a")).toBe(false);
    // tuđi nalog i izmena koja ne oduzima pristup
    expect(needsSelfConfirm([admin, admin2], admin2, { active: false }, "a")).toBe(false);
    expect(needsSelfConfirm([admin, admin2], operater, { role: "admin" }, "a")).toBe(false);
  });
});
