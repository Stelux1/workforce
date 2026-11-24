import { describe, it, expect } from "vitest";
import { buildGantt, coverageDetail, coverageTotals, dayBars, moveAnchor, qualifiedEmployeeIds, requirementRows, viewRange, workforceRankInput, workforceStartState, roleIdsForKey } from "./workforceUi";
import { rankCandidates } from "./replacements";
import { coverage } from "./workforce";

const P = "p1";
const R = "role-welder";
const MORNING = "sh-morning"; // 06:00–14:00
const AFTERNOON = "sh-afternoon"; // 14:00–22:00
const shifts = [
  { id: MORNING, project_id: null, start_time: "06:00", end_time: "14:00" },
  { id: AFTERNOON, project_id: null, start_time: "14:00", end_time: "22:00" },
];
const projects = [{ id: P, name: "Hala A" }];
const projectRoles = [{ id: R, project_id: P, title: "Welder", title_key: "welder", department_position: null, sort: 0 }];
const employees = ["e1", "e2", "e3"].map((id, i) => ({ id, first_name: `Radnik${i + 1}`, last_name: "Test", status: "active" }));
const asg = (id, employee, shift, extra = {}) => ({
  id, employee_id: employee, project_id: P, project_role_id: R, default_shift_id: shift,
  start_date: "2033-03-01", end_date: null, status: "active", ...extra,
});
const assignments = [asg("a1", "e1", MORNING), asg("a2", "e2", MORNING), asg("a3", "e3", AFTERNOON)];
const req = (count, extra = {}) => ({ id: "q1", project_id: P, project_role_id: R, shift_id: MORNING, date_from: "2033-03-01", date_to: "2033-03-31", required_count: count, ...extra });

describe("viewRange / moveAnchor", () => {
  it("dan, nedelja (pon–ned) i mesec", () => {
    expect(viewRange("day", "2033-03-09")).toEqual({ from: "2033-03-09", to: "2033-03-09" });
    expect(viewRange("week", "2033-03-09")).toEqual({ from: "2033-03-07", to: "2033-03-13" }); // sreda
    expect(viewRange("week", "2033-03-13")).toEqual({ from: "2033-03-07", to: "2033-03-13" }); // nedelja
    expect(viewRange("month", "2033-02-15")).toEqual({ from: "2033-02-01", to: "2033-02-28" });
  });
  it("pomeranje po koraku prikaza", () => {
    expect(moveAnchor("day", "2033-03-01", -1)).toBe("2033-02-28");
    expect(moveAnchor("week", "2033-03-09", 1)).toBe("2033-03-16");
    expect(moveAnchor("month", "2033-12-15", 1)).toBe("2034-01-01");
  });
});

describe("T20 — izmena potrebnog broja menja manjak u tabeli i na Gantt-u", () => {
  const run = (count) => {
    const requirements = [req(count)];
    const rows = coverage({ requirements, assignments, schedules: [], leaves: [], shifts, from: "2033-03-07", to: "2033-03-08" });
    const gantt = buildGantt({ projects, roles: projectRoles, assignments, shifts, employees, requirements, coverageRows: rows, from: "2033-03-07", to: "2033-03-08" });
    return { rows, gantt };
  };
  it("potrebno 2, dostupno 2 → bez manjka; potrebno 3 → manjak 1 svuda", () => {
    const before = run(2);
    expect(before.rows.every((r) => r.deficit === 0)).toBe(true);
    expect(before.gantt[0].roles[0].summary.every((s) => s.deficit === 0 && s.required === 2)).toBe(true);
    const after = run(3);
    expect(after.rows.map((r) => r.deficit)).toEqual([1, 1]);
    expect(after.gantt[0].roles[0].summary.map((s) => s.deficit)).toEqual([1, 1]);
    expect(coverageTotals(after.rows)).toMatchObject({ required: 6, available: 4, deficit: 2, deficitCells: 2, shortageProjects: 1 });
  });
});

describe("Gantt redovi i statusi", () => {
  const leaves = [{ id: "l1", employee_id: "e1", leave_type: "sick", start_date: "2033-03-08", end_date: "2033-03-08", status: "approved" }];
  const requirements = [req(2)];
  const rows = coverage({ requirements, assignments, schedules: [], leaves, shifts, from: "2033-03-07", to: "2033-03-09" });
  const gantt = buildGantt({ projects, roles: projectRoles, assignments, leaves, shifts, employees, requirements, coverageRows: rows, from: "2033-03-07", to: "2033-03-09" });
  const workers = gantt[0].roles[0].workers;

  it("grupisano po projektu i ulozi, radnik red po angažmanu", () => {
    expect(gantt).toHaveLength(1);
    expect(gantt[0].roles[0].role.id).toBe(R);
    expect(workers.map((w) => w.assignment.id)).toEqual(["a1", "a2", "a3"]);
  });
  it("bolovanje ima prednost, ostali dani su raspoređeni", () => {
    expect(workers[0].cells.map((c) => c.status)).toEqual(["assigned", "sick_leave", "assigned"]);
  });
  it("manjak na dan bolovanja: potrebno 2, dostupan 1", () => {
    const day = gantt[0].roles[0].summary.find((s) => s.date === "2033-03-08");
    expect(day).toMatchObject({ required: 2, planned: 2, absent: 1, available: 1, deficit: 1 });
  });
  it("angažman koji ne važi tog dana daje praznu ćeliju", () => {
    const g = buildGantt({ projects, roles: projectRoles, assignments: [asg("a9", "e1", MORNING, { start_date: "2033-03-08" })], shifts, employees, requirements: [], coverageRows: [], from: "2033-03-07", to: "2033-03-08" });
    expect(g[0].roles[0].workers[0].cells.map((c) => c.status)).toEqual([null, "assigned"]);
  });
  it("uloga bez potrebe i bez angažmana se ne prikazuje; izabrani projekat bez uloga ostaje prazan", () => {
    const g = buildGantt({ projects, roles: projectRoles, assignments: [], shifts, employees, requirements: [], coverageRows: [], from: "2033-03-07", to: "2033-03-08", projectId: P });
    expect(g).toHaveLength(1);
    expect(g[0].roles).toEqual([]);
    expect(buildGantt({ projects, roles: projectRoles, assignments: [], shifts, employees, requirements: [], coverageRows: [], from: "2033-03-07", to: "2033-03-08" })).toEqual([]);
  });
});

describe("dayBars", () => {
  it("podrazumevana smena, raspored i odsustvo", () => {
    const a = assignments[0];
    expect(dayBars({ date: "2033-03-08", assignment: a, projectId: P, shifts })).toEqual([{ startH: 6, endH: 14, status: "assigned", shiftId: MORNING }]);
    const sched = [{ employee_id: "e1", project_id: P, date: "2033-03-08", shift_id: AFTERNOON, status: "standby" }];
    expect(dayBars({ date: "2033-03-08", assignment: a, projectId: P, schedules: sched, shifts })).toEqual([{ startH: 14, endH: 22, status: "standby", shiftId: AFTERNOON }]);
    const leaves = [{ employee_id: "e1", leave_type: "vacation", start_date: "2033-03-08", end_date: "2033-03-08", status: "approved" }];
    expect(dayBars({ date: "2033-03-08", assignment: a, projectId: P, leaves, shifts })).toEqual([{ startH: 0, endH: 24, status: "leave" }]);
  });
});

describe("requirementRows", () => {
  it("broji dane sa manjkom u opsegu", () => {
    const requirements = [req(3)];
    const cov = coverage({ requirements, assignments, schedules: [], leaves: [], shifts, from: "2033-03-07", to: "2033-03-09" });
    const [row] = requirementRows({ requirements, coverageRows: cov, from: "2033-03-07", to: "2033-03-09" });
    expect(row).toMatchObject({ deficitDays: 3, maxDeficit: 1, surplusDays: 0, coveredDays: 3 });
  });
});

describe("T05 — detalj pokrivenosti: slobodni radnici", () => {
  it("radnik sa aktivnim angažmanom u drugoj smeni je slobodan za jutarnju, odsutni i već planirani nisu", () => {
    const requirements = [req(3)];
    const leaves = [{ id: "l2", employee_id: "e2", leave_type: "vacation", start_date: "2033-03-08", end_date: "2033-03-08", status: "approved" }];
    const [d] = coverageDetail({ projectId: P, projectRoleId: R, date: "2033-03-08", requirements, assignments, schedules: [], leaves, shifts, employees, projectRoles });
    expect(d).toMatchObject({ required: 3, available: 1, deficit: 2 });
    expect(d.covering.map((e) => e.id)).toEqual(["e1"]);
    expect(d.absentWorkers).toEqual([expect.objectContaining({ kind: "leave", leaveType: "vacation" })]);
    expect(d.free.map((f) => f.employeeId)).toEqual(["e3"]); // e3 radi popodne: slobodan ujutru
  });
  it("qualifiedEmployeeIds po title_key", () => {
    const roles = [...projectRoles, { id: "r2", project_id: "p2", title_key: "welder", department_position: null }, { id: "r3", project_id: "p2", title_key: "fitter" }];
    const a = [...assignments, { id: "x", employee_id: "e9", project_role_id: "r2", status: "active" }, { id: "y", employee_id: "e8", project_role_id: "r3", status: "active" }];
    expect(qualifiedEmployeeIds({ role: roles[0], assignments: a, projectRoles: roles }).sort()).toEqual(["e1", "e2", "e3", "e9"]);
  });
});

describe("workforceRankInput → rankCandidates (Workforce Planning predlozi zamena, §14.2)", () => {
  // e1 i e2 rade jutarnju smenu na P/R; e3 radi popodne. Potreba: jutarnja smena 2033-03-10 (e1 odsutan).
  const need = { projectId: P, projectRoleId: R, roleKey: "welder", shiftId: MORNING, from: "2033-03-10", to: "2033-03-10" };
  const leaves = [{ id: "l1", employee_id: "e1", leave_type: "vacation", start_date: "2033-03-10", end_date: "2033-03-10", status: "approved" }];
  const data = { projects, roles: projectRoles, shifts, employees, assignments, requirements: [], schedules: [], leaves };

  it("T22: kvalifikovan radnik iz druge smene nije not_eligible (uloga se prepoznaje preko projectRoles)", () => {
    const rows = rankCandidates(workforceRankInput({ need, data, excludeEmployeeIds: ["e1"] }));
    const e3 = rows.find((c) => c.employeeId === "e3");
    expect(e3.roleMatch).toBe("exact");
    expect(e3.category).not.toBe("not_eligible");
    expect(rows.some((c) => c.employeeId === "e1")).toBe(false);
  });

  it("bez Job Roles (stari poziv) svi su not_eligible — zato helper uvek prosleđuje data.roles", () => {
    const input = workforceRankInput({ need, data });
    expect(input.projectRoles).toBe(projectRoles);
    const broken = rankCandidates({ ...input, projectRoles: [] });
    expect(broken.every((c) => c.category === "not_eligible")).toBe(true);
  });

  it("tarife ulaze u rangiranje samo uz rates.view_b2c", () => {
    const rates = [{ id: "rc", scope: "project", kind: "cost", project_id: P, project_role_id: R, amount: 14, currency: "EUR", unit: "hourly", effective_from: "2033-01-01", status: "active" }];
    expect(workforceRankInput({ need, data, rates, canViewB2C: false }).rates).toBeNull();
    const rows = rankCandidates(workforceRankInput({ need, data, rates, canViewB2C: true, excludeEmployeeIds: ["e1"] }));
    expect(rows.find((c) => c.employeeId === "e3").b2c).toMatchObject({ rate: 14, currency: "EUR" });
  });

  it("candidateIds sužava listu radnika, today podrazumevano = prvi dan potrebe", () => {
    const input = workforceRankInput({ need, data, candidateIds: ["e3"] });
    expect(input.employees.map((e) => e.id)).toEqual(["e3"]);
    expect(input.today).toBe("2033-03-10");
  });
});

describe("workforceStartState / roleIdsForKey (linkovi na /workforce)", () => {
  const today = "2033-03-10";
  it("view=available otvara dan iz date (Quick Insights Available workers)", () => {
    expect(workforceStartState({ view: "available", date: "2033-03-12", today })).toEqual({ view: "day", anchor: "2033-03-12", tab: "gantt", coverageFilter: "all", availableDate: "2033-03-12" });
    expect(workforceStartState({ view: "available", today }).anchor).toBe(today);
  });
  it("view=shortages otvara Coverage samo sa manjkom, prikaz po opsegu", () => {
    expect(workforceStartState({ view: "shortages", from: "2033-03-10", to: "2033-03-24", today })).toMatchObject({ view: "month", anchor: "2033-03-10", tab: "coverage", coverageFilter: "deficit" });
    expect(workforceStartState({ view: "shortages", from: "2033-03-10", to: "2033-03-16", today })).toMatchObject({ view: "week", tab: "coverage" });
  });
  it("samo from/to: jedan dan → dan, bez parametara → nedelja danas", () => {
    expect(workforceStartState({ from: "2033-03-11", to: "2033-03-11", today })).toMatchObject({ view: "day", anchor: "2033-03-11", tab: "gantt" });
    expect(workforceStartState({ today })).toMatchObject({ view: "week", anchor: today });
  });
  it("roleIdsForKey: ključ uloge → id-jevi uloga svih projekata; prazno → bez filtera", () => {
    const roles = [{ id: "r1", title_key: "welder" }, { id: "r2", title: "Welder" }, { id: "r3", title_key: "crane" }];
    expect([...roleIdsForKey(roles, "welder")]).toEqual(["r1", "r2"]);
    expect(roleIdsForKey(roles, "")).toBeNull();
  });
});
