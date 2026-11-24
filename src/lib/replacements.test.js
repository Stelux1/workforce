import { describe, expect, it } from "vitest";
import { coverage } from "./workforce";
import {
  leaveShortage, locationMatch, normalizeSourceImpact, rankCandidates, replacementImpact, replacementNeeds, shortageTotals,
  simulateReplacement, snapshotRows, sourceNeedsAck, suggestedRange,
} from "./replacements";

// Isti primer kao supabase/tests/30_odsustva_zamene.test.sql (paritet JS/SQL).
// P1 traži 2 zavarivača u jutarnjoj smeni; e1 i e2 su tamo po podrazumevanoj smeni; e1 traži odmor 15.–16.
// P2 traži 1 zavarivača ujutru (e4) i 1 popodne (e3, e5).
const J = { id: "J", project_id: null, start_time: "06:00", end_time: "14:00" };
const P = { id: "P", project_id: null, start_time: "14:00", end_time: "22:00" };
const shifts = [J, P];
const projects = [
  { id: "P1", name: "Rafinerija", city: "Bratislava" },
  { id: "P2", name: "Most", city: "Košice" },
];
const projectRoles = [
  { id: "R1", project_id: "P1", title: "Zavarivač", title_key: "zavarivač" },
  { id: "R2", project_id: "P2", title: "Zavarivač", title_key: "zavarivač" },
  { id: "R3", project_id: "P2", title: "Kranista", title_key: "kranista" },
];
const requirements = [
  { project_id: "P1", project_role_id: "R1", shift_id: "J", date_from: "2033-03-01", date_to: "2033-03-31", required_count: 2 },
  { project_id: "P2", project_role_id: "R2", shift_id: "J", date_from: "2033-03-01", date_to: "2033-03-31", required_count: 1 },
  { project_id: "P2", project_role_id: "R2", shift_id: "P", date_from: "2033-03-01", date_to: "2033-03-31", required_count: 1 },
];
const a = (id, employee_id, project_id, project_role_id, default_shift_id, start_date = "2033-03-01", end_date = null) =>
  ({ id, employee_id, project_id, project_role_id, default_shift_id, start_date, end_date, status: "active" });
const assignments = [
  a("A1", "e1", "P1", "R1", "J"),
  a("A2", "e2", "P1", "R1", "J"),
  a("A3", "e3", "P2", "R2", "P"),
  a("A4", "e4", "P2", "R2", "J"),
  a("A5", "e5", "P2", "R2", "P"),
  a("A6", "e6", "P2", "R3", "P"),
  a("A7", "e7", "P1", "R1", null, "2033-01-01", "2033-02-28"), // istorija na ulozi, sada standby
];
const employees = [
  { id: "e1", first_name: "Ana", last_name: "Odmor", status: "active" },
  { id: "e2", first_name: "Bojan", last_name: "Jutro", status: "active" },
  { id: "e3", first_name: "Ceca", last_name: "Popodne", status: "active", city: "Bratislava" },
  { id: "e4", first_name: "Dejan", last_name: "Most", status: "active", city: "Košice" },
  { id: "e5", first_name: "Ema", last_name: "Delimično", status: "active" },
  { id: "e6", first_name: "Filip", last_name: "Kranista", status: "active" },
  { id: "e7", first_name: "Goran", last_name: "Rezerva", status: "active", work_location: "Bratislava" },
  { id: "e8", first_name: "Hana", last_name: "Bivša", status: "terminated" },
];
const schedules = [
  { id: "S7a", employee_id: "e7", project_id: "P1", assignment_id: null, shift_id: "J", date: "2033-03-15", status: "standby" },
  { id: "S7b", employee_id: "e7", project_id: "P1", assignment_id: null, shift_id: "J", date: "2033-03-16", status: "standby" },
];
const leaves = [
  { id: "L1", employee_id: "e1", leave_type: "vacation", start_date: "2033-03-15", end_date: "2033-03-16", status: "pending" },
  { id: "L5", employee_id: "e5", leave_type: "sick", start_date: "2033-03-16", end_date: "2033-03-16", status: "approved" },
];
const documentTypes = [{ code: "certificate", sensitive: false }, { code: "medical_certificate", sensitive: true }];
const requiredDocuments = [
  { id: "Q1", project_id: "P1", project_role_id: "R1", document_type: "certificate", mandatory: true, validity_rule: "assignment_period", expiring_soon_days: 30 },
  { id: "Q2", project_id: "P1", project_role_id: null, document_type: "medical_certificate", mandatory: true, validity_rule: "assignment_period", expiring_soon_days: 30 },
];
const documents = [
  { id: "D7c", employee_id: "e7", category: "certificate", expiration_date: "2034-01-01", file_url: "storage://files/x" },
  { id: "D7m", employee_id: "e7", category: "medical_certificate", expiration_date: "2034-01-01", file_url: "storage://files/y" },
  { id: "D3m", employee_id: "e3", category: "medical_certificate", expiration_date: "2034-01-01", file_url: "storage://files/z" },
];
const rates = [
  { id: "RC1", scope: "project", kind: "cost", project_id: "P1", project_role_id: "R1", amount: 12, currency: "EUR", unit: "hourly", effective_from: "2033-01-01", status: "active" },
];

const need = { projectId: "P1", projectRoleId: "R1", shiftId: "J", from: "2033-03-15", to: "2033-03-16" };
const ctx = { employees, assignments, schedules, leaves, shifts, documents, requiredDocuments, documentTypes, projects, projectRoles, requirements, today: "2033-03-01" };
const byId = (list) => Object.fromEntries(list.map((c) => [c.employeeId, c]));

describe("leaveShortage (§14.1)", () => {
  const range = { from: "2033-03-14", to: "2033-03-17" };
  const base = coverage({ requirements, assignments, schedules, leaves, shifts, ...range });
  const sim = coverage({ requirements, assignments, schedules, leaves, shifts, ...range, simulateLeaveId: "L1" });

  it("T21: odsustvo e1 obara jutarnju smenu P1 tačno za 1 radnika 15. i 16.", () => {
    const rows = leaveShortage(base, sim);
    expect(rows.map((r) => [r.projectId, r.projectRoleId, r.shiftId, r.date, r.required, r.available, r.deficit, r.deficitBefore])).toEqual([
      ["P1", "R1", "J", "2033-03-15", 2, 1, 1, 0],
      ["P1", "R1", "J", "2033-03-16", 2, 1, 1, 0],
    ]);
    expect(shortageTotals(rows)).toEqual({ rows: 2, missing: 2, added: 2, maxDeficit: 1, projects: 1 });
    expect(shortageTotals([{ deficit: 3, deficitBefore: 2, projectId: 'X' }]).added).toBe(1);
  });

  it("T21: postojeći manjak na kome radnik nije planiran nije posledica odsustva (P2 popodne 16.)", () => {
    expect(base.find((r) => r.projectId === "P2" && r.shiftId === "P" && r.date === "2033-03-16").deficit).toBe(0);
    expect(leaveShortage(base, sim).some((r) => r.projectId === "P2")).toBe(false);
  });

  it("prima i redove iz RPC-a workforce_coverage (snake_case) i snimak iz baze", () => {
    const snake = (rows) => rows.map((r) => ({ project_id: r.projectId, project_role_id: r.projectRoleId, shift_id: r.shiftId, work_date: r.date,
      required: r.required, planned: r.planned, absent: r.absent, available: r.available, deficit: r.deficit, surplus: r.surplus }));
    expect(leaveShortage(snake(base), snake(sim))).toEqual(leaveShortage(base, sim));
    const snap = [{ project_id: "P1", project_role_id: "R1", shift_id: "J", date: "2033-03-15", required: 2, available: 1, deficit: 1, deficit_before: 0 }];
    expect(snapshotRows(snap)[0]).toMatchObject({ projectId: "P1", date: "2033-03-15", deficit: 1, deficitBefore: 0 });
    expect(snapshotRows(null)).toEqual([]);
  });

  it("uzastopni dani se spajaju u jednu potrebu za zamenu", () => {
    expect(replacementNeeds(leaveShortage(base, sim))).toEqual([
      { projectId: "P1", projectRoleId: "R1", shiftId: "J", from: "2033-03-15", to: "2033-03-16", days: 2, deficit: 1 },
    ]);
  });
});

describe("rankCandidates (§14.2)", () => {
  const list = rankCandidates({ need, ...ctx, excludeEmployeeIds: ["e1"] });
  const c = byId(list);

  it("radnik na odsustvu se ne predlaže sam sebi", () => {
    expect(c.e1).toBeUndefined();
  });

  it("T22: slobodan kvalifikovan radnik je Full Match; standby je prvi", () => {
    expect(c.e7.category).toBe("full_match");
    expect(c.e7.standby).toBe(true);
    expect(c.e3.category).toBe("full_match"); // radi popodne na P2, jutro je slobodan (T05)
    expect(list[0].employeeId).toBe("e7");
    expect(list.findIndex((x) => x.employeeId === "e7")).toBeLessThan(list.findIndex((x) => x.employeeId === "e3"));
  });

  it("T22: delimično dostupan radnik je Partial Availability uz objašnjenje", () => {
    expect(c.e5.category).toBe("partial_availability");
    expect(c.e5.freeDays).toBe(1);
    expect(c.e5.reasons).toEqual(expect.arrayContaining([{ code: "free_some_days", free: 1, total: 2 }, { code: "leave_days", days: 1 }]));
    expect(suggestedRange(c.e5, need)).toEqual({ from: "2033-03-15", to: "2033-03-15" });
  });

  it("zauzet kvalifikovan radnik je Transfer Required, sa izvornom dodelom", () => {
    expect(c.e4.category).toBe("transfer_required");
    expect(c.e4.sourceAssignmentId).toBe("A4");
    expect(c.e4.busyDays).toBe(2);
  });

  it("T23: transfer pokazuje manjak na izvornom projektu", () => {
    expect(c.e4.sourceImpact.missing).toBe(2);
    expect(c.e4.sourceImpact.rows.map((r) => [r.projectId, r.shiftId, r.date, r.deficitBefore, r.deficit])).toEqual([
      ["P2", "J", "2033-03-15", 0, 1],
      ["P2", "J", "2033-03-16", 0, 1],
    ]);
    expect(c.e4.reasons).toEqual(expect.arrayContaining([{ code: "source_shortage", missing: 2, projectIds: ["P2"] }]));
  });

  it("Not Eligible: druga uloga, neaktivan, ili već pokriva istu smenu", () => {
    expect(c.e6.category).toBe("not_eligible");
    expect(c.e6.reasons[0]).toEqual({ code: "role_mismatch" });
    expect(c.e8.category).toBe("not_eligible");
    expect(c.e2.category).toBe("not_eligible");
    expect(c.e2.reasons).toEqual(expect.arrayContaining([{ code: "already_covering", days: 2 }]));
    expect(list.slice(-3).every((x) => x.category === "not_eligible")).toBe(true);
  });

  it("dokumenta koja nedostaju se prikazuju i ne skrivaju kandidata", () => {
    expect(c.e3.certificatesOk).toBe(false);
    expect(c.e3.missingDocuments).toEqual([{ documentType: "certificate", status: "missing", expirationDate: null, roleSpecific: true }]);
    expect(c.e7.readinessOk).toBe(true);
    expect(c.e4.missingDocuments.map((m) => m.documentType).sort()).toEqual(["certificate", "medical_certificate"]);
  });

  it("lokacija je kriterijum kad je poznata", () => {
    expect(c.e3.location).toBe("match");
    expect(c.e4.location).toBe("different");
    expect(c.e5.location).toBe("unknown");
    expect(locationMatch({ work_location: "Bratislava – Ružinov" }, { city: "Bratislava" })).toBe("match");
  });

  it("B2C trošak samo uz pravo rates.view_b2c", () => {
    expect(c.e3.b2c).toBeNull();
    expect(c.e3.reasons.some((r) => r.code === "b2c")).toBe(false);
    const withRates = byId(rankCandidates({ need, ...ctx, rates, canViewB2C: true, excludeEmployeeIds: ["e1"] }));
    expect(withRates.e3.b2c).toEqual({ rate: 12, currency: "EUR", source: "role_rate" });
  });
});

describe("replacementImpact / simulateReplacement (isto kao assign_replacement)", () => {
  it("T23: transfer e4 popunjava P1 (deficit 0) i ostavlja P2 bez jednog radnika", () => {
    const sim = coverage({ requirements, assignments, schedules, leaves: leaves.map((l) => (l.id === "L1" ? { ...l, status: "approved" } : l)), shifts, from: "2033-03-15", to: "2033-03-16" });
    expect(sim.filter((r) => r.projectId === "P1").map((r) => r.deficit)).toEqual([1, 1]);
    const approvedLeaves = leaves.map((l) => (l.id === "L1" ? { ...l, status: "approved" } : l));
    const impact = replacementImpact({ employeeId: "e4", need, from: need.from, to: need.to, requirements, assignments, schedules, leaves: approvedLeaves, shifts });
    expect(impact.targetDeficitAfter).toBe(0);
    expect(impact.sourceMissing).toBe(2);
    expect(impact.released.map((r) => [r.project_id, r.date, r.status])).toEqual([["P2", "2033-03-15", "released"], ["P2", "2033-03-16", "released"]]);
  });

  it("slobodan radnik sa angažmanom u drugoj smeni ne pravi manjak na svom projektu", () => {
    const approvedLeaves = leaves.map((l) => (l.id === "L1" ? { ...l, status: "approved" } : l));
    const impact = replacementImpact({ employeeId: "e3", need, from: need.from, to: need.to, requirements, assignments, schedules, leaves: approvedLeaves, shifts });
    expect(impact.sourceShortage).toEqual([]);
    expect(impact.targetDeficitAfter).toBe(0);
    const { schedules: next } = simulateReplacement({ employeeId: "e3", need, from: need.from, to: need.to, assignments, schedules, shifts });
    expect(next.filter((s) => s.employee_id === "e3").map((s) => [s.project_id, s.shift_id, s.date, s.status])).toEqual([
      ["P2", "P", "2033-03-15", "assigned"],
      ["P1", "J", "2033-03-15", "replacement"],
      ["P2", "P", "2033-03-16", "assigned"],
      ["P1", "J", "2033-03-16", "replacement"],
    ]);
  });

  // Isti primer kao supabase/tests/36_zamena_izvorni_projekat.test.sql: PM ne vidi izvorni projekat (P2), pa u
  // pregledaču nema njegovih redova — lokalni izračun ne vidi manjak; odgovor baze (svi projekti) je izvor istine.
  const serverP2 = {
    missing: 2,
    rows: [
      { project_id: "P2", project_role_id: "R2", shift_id: "J", date: "2033-03-15", required: 1, available_before: 1, available: 0,
        deficit_before: 0, deficit: 1, project_name: "Most", role_title: "Zavarivač", shift_name: "Jutro 06:00–14:00", visible: false },
      { project_id: "P2", project_role_id: "R2", shift_id: "J", date: "2033-03-16", required: 1, available_before: 1, available: 0,
        deficit_before: 0, deficit: 1, project_name: "Most", role_title: "Zavarivač", shift_name: "Jutro 06:00–14:00", visible: false },
    ],
    hidden_projects: [{ project_id: "P2", project_name: "Most" }],
  };

  it("T23: projekat koji korisnik ne vidi — manjak i nazivi dolaze iz baze, potvrda se traži", () => {
    const approvedLeaves = leaves.map((l) => (l.id === "L1" ? { ...l, status: "approved" } : l));
    const visible = (r) => r.project_id !== "P2";
    const local = replacementImpact({ employeeId: "e4", need, from: need.from, to: need.to, requirements: requirements.filter(visible),
      assignments: assignments.filter(visible), schedules, leaves: approvedLeaves, shifts });
    expect(local.sourceMissing).toBe(0); // bez baze upozorenje bi izostalo
    expect(sourceNeedsAck(local)).toBe(false);
    const merged = replacementImpact({ employeeId: "e4", need, from: need.from, to: need.to, requirements: requirements.filter(visible),
      assignments: assignments.filter(visible), schedules, leaves: approvedLeaves, shifts, serverSource: serverP2 });
    expect(merged.sourceFromServer).toBe(true);
    expect(merged.sourceMissing).toBe(2);
    expect(merged.sourceShortage.map((r) => [r.projectName, r.roleTitle, r.date, r.required, r.available, r.deficit, r.hidden])).toEqual([
      ["Most", "Zavarivač", "2033-03-15", 1, 0, 1, true],
      ["Most", "Zavarivač", "2033-03-16", 1, 0, 1, true],
    ]);
    expect(merged.hiddenProjects).toEqual([{ projectId: "P2", projectName: "Most" }]);
    expect(merged.targetDeficitAfter).toBe(0); // ciljna potreba i dalje iz lokalnog izračuna
    expect(sourceNeedsAck(merged)).toBe(true);
  });

  it("normalizeSourceImpact: DETAIL greške (JSON tekst), prazan odgovor i nevažeći ulaz", () => {
    expect(normalizeSourceImpact(JSON.stringify(serverP2)).missing).toBe(2);
    const empty = normalizeSourceImpact({ missing: 0, rows: [], hidden_projects: [] });
    expect(empty).toEqual({ missing: 0, rows: [], hiddenProjects: [] });
    expect(sourceNeedsAck({ sourceShortage: [], hiddenProjects: [{ projectId: "X", projectName: "Skriveni" }] })).toBe(true);
    expect(normalizeSourceImpact("nije json")).toBeNull();
    expect(normalizeSourceImpact({ missing: 1 })).toBeNull();
    expect(normalizeSourceImpact(null)).toBeNull();
  });

  it("standby red se oslobađa (released) pre zamene", () => {
    const { schedules: next } = simulateReplacement({ employeeId: "e7", need, from: need.from, to: need.to, assignments, schedules, shifts });
    expect(next.filter((s) => s.employee_id === "e7").map((s) => s.status)).toEqual(["released", "released", "replacement", "replacement"]);
    expect(schedules.every((s) => s.status === "standby")).toBe(true); // ulaz se ne menja
  });
});
