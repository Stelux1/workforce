import { describe, expect, it } from "vitest";
import { assignmentStatus } from "./assignments.js";

describe("assignmentStatus (isto kao SQL assignment_display_status)", () => {
  const T = "2033-03-20";
  it.each([
    [{ status: "cancelled", start_date: "2033-01-01" }, "cancelled"],
    [{ start_date: "2033-01-01", end_date: "2033-03-19" }, "completed"],
    [{ start_date: "2033-03-21" }, "upcoming"],
    [{ start_date: "2033-01-01", end_date: "2033-03-20" }, "ending_soon"],
    [{ start_date: "2033-01-01", end_date: "2033-04-19" }, "ending_soon"],
    [{ start_date: "2033-01-01", end_date: "2033-04-20" }, "active"],
    [{ start_date: "2033-01-01", end_date: null }, "active"],
  ])("%o → %s", (a, expected) => expect(assignmentStatus(a, T)).toBe(expected));
});
