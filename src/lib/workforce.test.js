import { describe, it, expect } from "vitest";
import {
  absenceKind,
  addDaysIso,
  availableWorkers,
  coverage,
  eachDay,
  ganttCell,
  intervalsOverlap,
  shiftInterval,
  shortageProjects,
  workerIsFree,
} from "./workforce";

// Isti primeri su u supabase/tests/27_workforce.test.sql (paritet JS/SQL).
const P = "p1";
const R = "role-welder";
const MORNING = "sh-morning"; // 06:00–14:00
const AFTERNOON = "sh-afternoon"; // 14:00–22:00
const NIGHT = "sh-night"; // 22:00–06:00 (prelazi ponoć)
const EARLY = "sh-early"; // 04:00–12:00

const shifts = [
  { id: MORNING, project_id: null, start_time: "06:00:00", end_time: "14:00:00" },
  { id: AFTERNOON, project_id: null, start_time: "14:00", end_time: "22:00" },
  { id: NIGHT, project_id: null, start_time: "22:00", end_time: "06:00" },
  { id: EARLY, project_id: null, start_time: "04:00", end_time: "12:00" },
];
const projectRoles = [
  { id: R, project_id: P, title_key: "welder", department_position: "Welding" },
  { id: "role-other", project_id: "p2", title_key: "welder", department_position: null },
  { id: "role-crane", project_id: "p2", title_key: "crane operator", department_position: "Cranes" },
];
const assign = (id, employee, role, shift, extra = {}) => ({
  id,
  employee_id: employee,
  project_id: extra.project_id || P,
  project_role_id: role,
  default_shift_id: shift,
  start_date: "2033-03-01",
  end_date: null,
  status: "active",
  ...extra,
});
const assignments = [
  assign("a1", "e1", R, MORNING),
  assign("a2", "e2", R, MORNING),
  assign("a3", "e3", R, AFTERNOON),
];

describe("shiftInterval / intervalsOverlap", () => {
  it("smena preko ponoći završava sutradan, uzastopne smene se ne preklapaju", () => {
    const night = shiftInterval(shifts[2], "2033-03-03");
    expect(night.end - night.start).toBe(8 * 3_600_000);
    expect(intervalsOverlap(night, shiftInterval(shifts[0], "2033-03-04"))).toBe(false); // 06:00 = kraj noćne
    expect(intervalsOverlap(night, shiftInterval(shifts[3], "2033-03-04"))).toBe(true); // 04:00 zalazi u noćnu
    expect(intervalsOverlap(shiftInterval(shifts[0], "2033-03-04"), shiftInterval(shifts[1], "2033-03-04"))).toBe(false);
  });
  it("dani", () => {
    expect(addDaysIso("2033-02-28", 1)).toBe("2033-03-01");
    expect(eachDay("2033-03-30", "2033-04-01")).toEqual(["2033-03-30", "2033-03-31", "2033-04-01"]);
  });
});

describe("coverage", () => {
  const req = (from, to, count) => ({ project_id: P, project_role_id: R, shift_id: MORNING, date_from: from, date_to: to, required_count: count });

  it("dva potrebna, dva planirana po podrazumevanoj smeni: bez deficita", () => {
    const rows = coverage({ requirements: [req("2033-03-01", "2033-03-31", 2)], assignments, shifts, from: "2033-03-04", to: "2033-03-04" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ required: 2, planned: 2, absent: 0, available: 2, deficit: 0, surplus: 0, coveringEmployeeIds: ["e1", "e2"], missing: [] });
  });

  it("T20: potreban broj se menja od 10. i deficit prati promenu samo od tog dana", () => {
    const requirements = [req("2033-03-01", "2033-03-09", 2), req("2033-03-10", "2033-03-31", 3)];
    const rows = coverage({ requirements, assignments, shifts, from: "2033-03-08", to: "2033-03-11" });
    expect(rows.map((r) => [r.date, r.required, r.deficit])).toEqual([
      ["2033-03-08", 2, 0],
      ["2033-03-09", 2, 0],
      ["2033-03-10", 3, 1],
      ["2033-03-11", 3, 1],
    ]);
  });

  it("T21: simulirani odmor jednog od dva potrebna daje deficit 1; bez simulacije (zahtev na čekanju) deficita nema", () => {
    const leaves = [{ id: "l1", employee_id: "e1", leave_type: "vacation", start_date: "2033-03-15", end_date: "2033-03-16", status: "pending" }];
    const requirements = [req("2033-03-01", "2033-03-31", 2)];
    const base = { requirements, assignments, leaves, shifts, from: "2033-03-14", to: "2033-03-16" };
    expect(coverage(base).map((r) => r.deficit)).toEqual([0, 0, 0]);
    const sim = coverage({ ...base, simulateLeaveId: "l1" });
    expect(sim.map((r) => [r.date, r.planned, r.absent, r.available, r.deficit])).toEqual([
      ["2033-03-14", 2, 0, 2, 0],
      ["2033-03-15", 2, 1, 1, 1],
      ["2033-03-16", 2, 1, 1, 1],
    ]);
    expect(sim[1].missing).toEqual(["e1"]);
    expect(sim[1].coveringEmployeeIds).toEqual(["e2"]);
    expect(shortageProjects(sim)).toBe(1);
  });

  it("odobreno odsustvo se računa bez simulacije; višak kad je više dostupnih nego potrebnih", () => {
    const leaves = [{ id: "l2", employee_id: "e2", leave_type: "sick", start_date: "2033-03-05", end_date: "2033-03-05", status: "approved" }];
    const rows = coverage({ requirements: [req("2033-03-01", "2033-03-31", 1)], assignments, leaves, shifts, from: "2033-03-04", to: "2033-03-05" });
    expect(rows.map((r) => [r.available, r.deficit, r.surplus])).toEqual([[2, 0, 1], [1, 0, 0]]);
  });

  it("red rasporeda zamenjuje podrazumevanu smenu: released uklanja radnika, replacement ga dodaje na drugoj ulozi/projektu", () => {
    const schedules = [
      { employee_id: "e1", project_id: P, assignment_id: "a1", shift_id: MORNING, date: "2033-03-04", status: "released" },
      { employee_id: "e3", project_id: P, assignment_id: "a3", shift_id: MORNING, date: "2033-03-04", status: "replacement" },
    ];
    const rows = coverage({ requirements: [req("2033-03-04", "2033-03-04", 2)], assignments, schedules, shifts, from: "2033-03-04", to: "2033-03-04" });
    expect(rows[0].coveringEmployeeIds).toEqual(["e2", "e3"]);
    expect(rows[0]).toMatchObject({ planned: 2, deficit: 0 });
  });

  it("otkazana dodela i dodela van perioda ne računaju; filter po projektu", () => {
    const list = [assign("a9", "e9", R, MORNING, { status: "cancelled" }), assign("a8", "e8", R, MORNING, { end_date: "2033-03-02" }), ...assignments];
    const rows = coverage({ requirements: [req("2033-03-01", "2033-03-31", 2)], assignments: list, shifts, from: "2033-03-04", to: "2033-03-04" });
    expect(rows[0].planned).toBe(2);
    expect(coverage({ requirements: [req("2033-03-01", "2033-03-31", 2)], assignments, shifts, from: "2033-03-04", to: "2033-03-04", projectId: "nema" })).toEqual([]);
  });
});

describe("workerIsFree / availableWorkers", () => {
  const employees = [{ id: "e1" }, { id: "e2" }, { id: "e3" }, { id: "e4" }, { id: "e5", status: "terminated" }];
  const base = { assignments, shifts, schedules: [], leaves: [] };

  it("T05: radnik sa aktivnom dodelom, ali u drugoj smeni, je dostupan; u istoj smeni nije", () => {
    expect(workerIsFree({ ...base, employeeId: "e1", date: "2033-03-04", shiftId: AFTERNOON })).toBe(true);
    expect(workerIsFree({ ...base, employeeId: "e1", date: "2033-03-04", shiftId: MORNING })).toBe(false);
    // preklapanje intervala, ne samo ista smena: 04:00–12:00 zalazi u jutarnju
    expect(workerIsFree({ ...base, employeeId: "e1", date: "2033-03-04", shiftId: EARLY })).toBe(false);
  });

  it("T05: dostupni za jutarnju smenu su oni koji nemaju preklopljenu smenu, odsutni i neaktivni ispadaju", () => {
    const leaves = [{ id: "l3", employee_id: "e3", leave_type: "vacation", start_date: "2033-03-04", end_date: "2033-03-04", status: "approved" }];
    const free = availableWorkers({ date: "2033-03-04", shiftId: MORNING, roleKey: "welder", employees, projectRoles, ...base, leaves });
    expect(free.map((w) => w.employeeId)).toEqual([]); // e1,e2 rade jutro; e3 je na odmoru; e4 nema ulogu; e5 je prekinut
    const afternoon = availableWorkers({ date: "2033-03-04", shiftId: AFTERNOON, roleKey: "welder", employees, projectRoles, ...base });
    expect(afternoon.map((w) => w.employeeId)).toEqual(["e1", "e2"]); // e3 radi popodne
  });

  it("kvalifikacija: ista uloga na drugom projektu (title_key) ili ista pozicija odeljenja; bez roleKey važe svi", () => {
    const other = [...assignments, assign("a4", "e4", "role-other", AFTERNOON, { project_id: "p2", end_date: "2033-02-01", start_date: "2033-01-01" })];
    const ids = (opts) => availableWorkers({ date: "2033-03-04", shiftId: MORNING, employees, projectRoles, shifts, schedules: [], leaves: [], assignments: other, ...opts }).map((w) => w.employeeId);
    expect(ids({ roleKey: "Welder" })).toEqual(["e3", "e4"]); // e3: popodnevna smena ne preklapa jutarnju; e4: istorijska dodela na istom title_key
    expect(ids({ departmentPosition: "welding" })).toEqual(["e3"]); // pozicija odeljenja: e1/e2 rade jutro, e4 nema tu poziciju
    expect(ids({})).toContain("e3");
    expect(ids({ roleKey: "crane operator" })).toEqual([]);
  });

  it("standby ne zauzima smenu i ide prvi; released ne zauzima; assigned zauzima i bez podrazumevane smene", () => {
    const schedules = [
      { employee_id: "e4", project_id: P, shift_id: MORNING, date: "2033-03-04", status: "standby" },
      { employee_id: "e1", project_id: P, assignment_id: "a1", shift_id: MORNING, date: "2033-03-04", status: "released" },
      { employee_id: "e2", project_id: P, assignment_id: "a2", shift_id: NIGHT, date: "2033-03-03", status: "assigned" },
    ];
    const list = availableWorkers({ date: "2033-03-04", shiftId: MORNING, employees: employees.slice(0, 4), projectRoles, shifts, assignments, schedules, leaves: [] });
    // e1 je pušten tog dana (nema više podrazumevane smene), e2 ima podrazumevano jutro (noćni red je od juče), e3 popodne, e4 standby
    expect(list.map((w) => [w.employeeId, w.standby])).toEqual([["e4", true], ["e1", false], ["e3", false]]);
    expect(workerIsFree({ employeeId: "e2", date: "2033-03-04", shiftId: EARLY, shifts, assignments, schedules, leaves: [] })).toBe(false); // noćna zalazi u 04:00–06:00
  });

  it("bez smene važi ceo dan", () => {
    expect(workerIsFree({ ...base, employeeId: "e4", date: "2033-03-04" })).toBe(true);
    expect(workerIsFree({ ...base, employeeId: "e1", date: "2033-03-04" })).toBe(false);
  });
});

describe("ganttCell / absenceKind", () => {
  const base = { assignments, shifts, schedules: [], leaves: [] };
  it("absenceKind", () => {
    expect(["vacation", "personal", "unpaid"].map(absenceKind)).toEqual(["leave", "leave", "leave"]);
    expect(absenceKind("sick")).toBe("sick_leave");
    expect(["maternity", "paternity", "other"].map(absenceKind)).toEqual(["other_absence", "other_absence", "other_absence"]);
  });
  it("statusi ćelije", () => {
    expect(ganttCell({ ...base, employeeId: "e1", date: "2033-03-04", projectId: P })).toBe("assigned");
    expect(ganttCell({ ...base, employeeId: "e4", date: "2033-03-04", projectId: P })).toBe("available");
    const leaves = [{ id: "l", employee_id: "e1", leave_type: "sick", start_date: "2033-03-04", end_date: "2033-03-04", status: "approved" }];
    expect(ganttCell({ ...base, leaves, employeeId: "e1", date: "2033-03-04", projectId: P })).toBe("sick_leave");
    const schedules = [
      { employee_id: "e4", project_id: P, shift_id: MORNING, date: "2033-03-04", status: "standby" },
      { employee_id: "e3", project_id: P, shift_id: MORNING, date: "2033-03-04", status: "replacement" },
      { employee_id: "e2", project_id: P, shift_id: MORNING, date: "2033-03-04", status: "released" },
    ];
    expect(ganttCell({ ...base, schedules, employeeId: "e4", date: "2033-03-04", projectId: P })).toBe("standby");
    expect(ganttCell({ ...base, schedules, employeeId: "e3", date: "2033-03-04", projectId: P })).toBe("replacement");
    expect(ganttCell({ ...base, schedules, employeeId: "e2", date: "2033-03-04", projectId: P })).toBe("available");
  });
});
