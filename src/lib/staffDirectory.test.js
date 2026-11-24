import { describe, expect, it } from "vitest";
import { staffLookup, whoWhen } from "./staffDirectory";

describe("staffLookup (staff_directory, ko i kada)", () => {
  const rows = [{ id: "u1", full_name: "Ana Admin", role: "admin" }, { id: "u2", full_name: "Pera PM", role: "project_manager" }];

  it("vraća ime i ulogu po id-u, null za nepoznat ili prazan id", () => {
    const s = staffLookup(rows);
    expect(s.name("u2")).toBe("Pera PM");
    expect(s.role("u1")).toBe("admin");
    expect(s.name("nema")).toBeNull();
    expect(s.name(null)).toBeNull();
  });

  it("dopunjuje sopstveni nalog iz sesije kad RPC još nije stigao ili je pao", () => {
    const s = staffLookup([], { self: { id: "me", full_name: "", email: "me@firma.rs", role: "hr" } });
    expect(s.name("me")).toBe("me@firma.rs");
    expect(staffLookup(rows, { self: { id: "u1", full_name: "Drugo" } }).name("u1")).toBe("Ana Admin");
  });

  it("whoWhen spaja datum i ime bez praznih delova", () => {
    expect(whoWhen("12.03.2033.", "Ana Admin")).toBe("12.03.2033. · Ana Admin");
    expect(whoWhen("12.03.2033.", null)).toBe("12.03.2033.");
  });
});
