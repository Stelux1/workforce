import { describe, expect, it } from "vitest";
import {
  assignmentKpis, assignmentStatus, byProject, decorateAssignments, endingSoon, exportRows, filterAssignments, percentages,
  insightFilterPatch, sortAssignments, statusBreakdown, todayInZone, workersByProject, workforceInsightUrl,
} from "./assignments.js";
import { readListParams } from "./listLinks.js";
import { ROLE_DEFAULTS, ALL_PERMISSIONS } from "./permissions.js";

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

  it("granice: start = danas, end = danas, end za 30 i 31 dan, bez end", () => {
    expect(assignmentStatus({ start_date: T }, T)).toBe("active");
    expect(assignmentStatus({ start_date: T, end_date: T }, T)).toBe("ending_soon");
    expect(assignmentStatus({ start_date: "2033-03-01", end_date: "2033-04-19" }, T)).toBe("ending_soon"); // +30
    expect(assignmentStatus({ start_date: "2033-03-01", end_date: "2033-04-20" }, T)).toBe("active"); // +31
    expect(assignmentStatus({ start_date: "2033-03-01", end_date: null }, T)).toBe("active");
    expect(assignmentStatus({ start_date: "2033-03-21", end_date: "2033-03-25" }, T)).toBe("upcoming");
  });
});

describe("todayInZone", () => {
  const now = new Date("2033-03-20T23:30:00Z");
  it("dan zavisi od zone projekta", () => {
    expect(todayInZone("Europe/Bratislava", now)).toBe("2033-03-21");
    expect(todayInZone("America/New_York", now)).toBe("2033-03-20");
  });
  it("neispravna zona → zona firme", () => expect(todayInZone("Nije/Zona", now)).toBe("2033-03-21"));
});

const T = "2033-03-20";
const projects = [
  { id: "p1", name: "Riverside", client_id: "c1", client_name: "Riverside Dev" },
  { id: "p2", name: "Lakeside", client_id: "c2", client_name: "Lakeside Holdings" },
  { id: "p3", name: "Harbor", client_id: "c1", client_name: "Riverside Dev" },
];
const employees = [
  { id: "e1", employee_id: "EMP-001", first_name: "Ana", last_name: "Anić" },
  { id: "e2", employee_id: "EMP-002", first_name: "Boris", last_name: "Bor" },
  { id: "e3", employee_id: "EMP-003", first_name: "Ceca", last_name: "Cvet" },
];
const raw = [
  { id: "a1", employee_id: "e1", employee_name: "Anić Ana", project_id: "p1", project_name: "Riverside", position: "Welder", start_date: "2033-01-01", end_date: null },
  { id: "a2", employee_id: "e1", employee_name: "Anić Ana", project_id: "p2", project_name: "Lakeside", position: "Welder", start_date: "2033-02-01", end_date: "2033-03-31" },
  { id: "a3", employee_id: "e2", employee_name: "Bor Boris", project_id: "p1", project_name: "Riverside", position: "Electrician", start_date: "2033-04-01", end_date: null },
  { id: "a4", employee_id: "e3", employee_name: "Cvet Ceca", project_id: "p3", project_name: "Harbor", position: "Plumber", start_date: "2032-01-01", end_date: "2033-03-01" },
  { id: "a5", employee_id: "e2", employee_name: "Bor Boris", project_id: "p2", project_name: "Lakeside", position: "Electrician", start_date: "2033-01-01", status: "cancelled" },
];
const rates = [
  { id: "r1", scope: "assignment", kind: "cost", assignment_id: "a1", amount: 20, currency: "EUR", unit: "hourly", effective_from: "2033-01-01", status: "active" },
  { id: "r2", scope: "assignment", kind: "revenue", assignment_id: "a1", amount: 35, currency: "EUR", unit: "hourly", effective_from: "2033-01-01", status: "active" },
  { id: "r3", scope: "assignment", kind: "cost", assignment_id: "a2", amount: 2500, currency: "RSD", unit: "hourly", effective_from: "2033-02-01", status: "active" },
];
const ADMIN = ALL_PERMISSIONS;
const HR = ROLE_DEFAULTS.hr;
const rows = (perms = ADMIN) => decorateAssignments(raw, { projects, employees, rates, perms, today: T });

describe("decorateAssignments", () => {
  it("status, šifra, klijent i tarife na referentni dan", () => {
    const [a1, a2, a3, a4, a5] = rows();
    expect([a1, a2, a3, a4, a5].map((r) => r.displayStatus)).toEqual(["active", "ending_soon", "upcoming", "completed", "cancelled"]);
    expect(a1).toMatchObject({ employeeCode: "EMP-001", clientName: "Riverside Dev", clientId: "c1", roleKey: "welder" });
    expect(a1.b2c).toMatchObject({ rate: 20, currency: "EUR" });
    expect(a1.b2b).toMatchObject({ rate: 35, currency: "EUR" });
    expect(a2.b2c).toMatchObject({ rate: 2500, currency: "RSD" });
    expect(a2.b2b).toEqual({ error: "missing" });
    expect(a5.b2c).toBeNull();
  });

  it("T26: bez rates.view_b2c / view_b2b tarife se ni ne računaju", () => {
    const hr = rows(HR);
    expect(hr.every((r) => r.b2c === null && r.b2b === null)).toBe(true);
    const pm = rows(ROLE_DEFAULTS.project_manager);
    expect(pm[0].b2c).toBeNull();
    expect(pm[0].b2b).toMatchObject({ rate: 35 });
  });

  it("danas po zoni projekta kad nije zadat", () => {
    const now = new Date("2033-03-31T22:30:00Z"); // Bratislava: 1. april, Njujork: 31. mart
    const [r] = decorateAssignments([raw[1]], {
      projects: [{ ...projects[1], time_zone: "America/New_York" }], now, defaultTimeZone: "Europe/Bratislava",
    });
    expect(r.today).toBe("2033-03-31");
    expect(r.displayStatus).toBe("ending_soon");
    const [r2] = decorateAssignments([raw[1]], { projects, now, defaultTimeZone: "Europe/Bratislava" });
    expect(r2.today).toBe("2033-04-01");
    expect(r2.displayStatus).toBe("completed");
  });
});

describe("T01 — radnik na dva projekta", () => {
  it("dva Assignment reda, 1 Active Worker", () => {
    const list = filterAssignments(rows(), { mode: "all", search: "Anić" });
    expect(list).toHaveLength(2);
    const k = assignmentKpis(list, { today: T });
    expect(k.total).toBe(2);
    expect(k.activeWorkers).toBe(1);
    expect(k.activeProjects).toBe(2);
  });
});

describe("filterAssignments", () => {
  const all = rows();
  it("režim Active = Active + Ending Soon; All = 4 statusa bez poništenih", () => {
    expect(filterAssignments(all, { mode: "active" }).map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(filterAssignments(all, { mode: "all" }).map((r) => r.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(filterAssignments(all, { mode: "all", status: "cancelled" }).map((r) => r.id)).toEqual(["a5"]);
  });
  it("Project, Client, Job Role, Status, pretraga", () => {
    expect(filterAssignments(all, { projectId: "p1" }).map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(filterAssignments(all, { clientId: "c1" }).map((r) => r.id)).toEqual(["a1", "a3", "a4"]);
    expect(filterAssignments(all, { roleKey: "electrician" }).map((r) => r.id)).toEqual(["a3"]);
    expect(filterAssignments(all, { status: "completed" }).map((r) => r.id)).toEqual(["a4"]);
    expect(filterAssignments(all, { search: "emp-003" }).map((r) => r.id)).toEqual(["a4"]);
    expect(filterAssignments(all, { search: "lakeside" }).map((r) => r.id)).toEqual(["a2"]);
    const withStatus = decorateAssignments(raw, { projects: projects.map((p) => ({ ...p, status: p.id === "p3" ? "completed" : "active" })), today: T });
    expect(filterAssignments(withStatus, { mode: "all", projectStatus: "completed" }).map((r) => r.id)).toEqual(["a4"]);
  });
  it("Date Range: preklapanje sa periodom (otvoren kraj traje)", () => {
    expect(filterAssignments(all, { from: "2033-03-05", to: "2033-03-10" }).map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(filterAssignments(all, { from: "2033-05-01" }).map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(filterAssignments(all, { to: "2032-06-30" }).map((r) => r.id)).toEqual(["a4"]);
  });
});

describe("T02 — isti obuhvat za tabelu, KPI, grafike i izvoz", () => {
  it.each([
    [{ mode: "all" }],
    [{ mode: "active" }],
    [{ projectId: "p1" }],
    [{ clientId: "c1", status: "completed" }],
    [{ roleKey: "welder", from: "2033-03-01", to: "2033-03-31" }],
  ])("%o", (f) => {
    const list = sortAssignments(filterAssignments(rows(), f), { key: "end", dir: "desc" });
    const ids = new Set(list.map((r) => r.id));
    const k = assignmentKpis(list, { today: T });
    const donut = statusBreakdown(list, { today: T });
    const bars = byProject(list);
    const exp = exportRows(list, ADMIN);
    expect(k.total).toBe(ids.size);
    expect(donut.total).toBe(list.filter((r) => r.displayStatus !== "cancelled").length);
    expect(bars.reduce((s, b) => s + b.count, 0)).toBe(ids.size);
    expect(exp.rows).toHaveLength(ids.size);
    expect(exp.rows.map((r) => r.employee)).toEqual(list.map((r) => r.employeeName));
  });
});

describe("T03 — donut statusi čine 100%", () => {
  it("bez preklapanja i sa zbirom 100", () => {
    const d = statusBreakdown(filterAssignments(rows(), { mode: "all" }));
    expect(d.items.map((i) => [i.status, i.count])).toEqual([["active", 1], ["upcoming", 1], ["ending_soon", 1], ["completed", 1]]);
    expect(d.items.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 10);
  });
  it.each([[[1, 1, 1]], [[2, 1, 0, 0]], [[75, 18, 7, 28]], [[1, 2, 3, 7]], [[0, 0, 0, 0]]])("percentages(%o)", (counts) => {
    const p = percentages(counts);
    const sum = Math.round(p.reduce((s, x) => s + x, 0) * 10) / 10;
    expect(sum).toBe(counts.some(Boolean) ? 100 : 0);
    counts.forEach((c, i) => c === 0 && expect(p[i]).toBe(0));
  });
});

describe("assignmentKpis — Expiring This Month", () => {
  it("kraj u tekućem mesecu, a nije već završen", () => {
    const list = decorateAssignments([
      { id: "x1", employee_id: "e1", project_id: "p1", start_date: "2033-01-01", end_date: "2033-03-31" }, // da
      { id: "x2", employee_id: "e1", project_id: "p1", start_date: "2033-01-01", end_date: "2033-03-20" }, // danas — da
      { id: "x3", employee_id: "e2", project_id: "p1", start_date: "2033-01-01", end_date: "2033-03-19" }, // završen
      { id: "x4", employee_id: "e2", project_id: "p1", start_date: "2033-03-25", end_date: "2033-03-28" }, // predstoji, ističe u martu — da
      { id: "x5", employee_id: "e3", project_id: "p1", start_date: "2033-01-01", end_date: "2033-04-01" }, // april
      { id: "x6", employee_id: "e3", project_id: "p1", start_date: "2033-01-01", end_date: "2033-03-30", status: "cancelled" },
    ], { today: T });
    const k = assignmentKpis(list, { today: T });
    expect(k.expiringThisMonth).toBe(3);
    expect([k.monthStart, k.monthEnd]).toEqual(["2033-03-01", "2033-03-31"]);
    // klik na karticu → filtrirana lista sa istim brojem
    const filtered = filterAssignments(list, { mode: "all", expiring: "month" });
    expect(filtered.map((r) => r.id)).toEqual(["x1", "x2", "x4"]);
    expect(assignmentKpis(filtered, { today: T }).expiringThisMonth).toBe(3);
  });
});

describe("endingSoon i byProject", () => {
  it("endingSoon(30) = trenutno važeći sa krajem u 30 dana, po datumu kraja", () => {
    expect(endingSoon(rows()).map((r) => r.id)).toEqual(["a2"]);
  });
  it("byProject: najviše prvo", () => {
    expect(byProject(filterAssignments(rows(), { mode: "all" }))).toEqual([
      { projectId: "p1", projectName: "Riverside", count: 2 },
      { projectId: "p3", projectName: "Harbor", count: 1 },
      { projectId: "p2", projectName: "Lakeside", count: 1 },
    ].sort((a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName)));
  });
  it("workersByProject: važeći i predstojeći, jedinstveni radnici", () => {
    const m = workersByProject(raw, T);
    expect(m.get("p1")).toBe(2);
    expect(m.get("p2")).toBe(1);
    expect(m.has("p3")).toBe(false);
  });
});

describe("sortAssignments", () => {
  const all = filterAssignments(rows(), { mode: "all" });
  it("po zaposlenom, pa obrnuto", () => {
    expect(sortAssignments(all, { key: "employee", dir: "asc" }).map((r) => r.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(sortAssignments(all, { key: "employee", dir: "desc" }).map((r) => r.id)).toEqual(["a4", "a3", "a1", "a2"]);
  });
  it("End Date: otvoren kraj je najkasniji", () => {
    expect(sortAssignments(all, { key: "end", dir: "asc" }).map((r) => r.id)).toEqual(["a4", "a2", "a1", "a3"]);
    expect(sortAssignments(all, { key: "end", dir: "desc" }).map((r) => r.id)).toEqual(["a1", "a3", "a2", "a4"]);
  });
  it("B2C: bez tarife na kraju", () => {
    expect(sortAssignments(all, { key: "b2c", dir: "asc" }).map((r) => r.id)).toEqual(["a1", "a2", "a3", "a4"]);
    expect(sortAssignments(all, { key: "b2c", dir: "desc" }).map((r) => r.id).slice(0, 2)).toEqual(["a2", "a1"]);
  });
});

describe("T26 — izvoz bez B2C za korisnika bez prava", () => {
  it("HR: nema B2C ni B2B kolona ni vrednosti", () => {
    const { columns, rows: out } = exportRows(rows(HR), HR);
    expect(columns).not.toContain("b2c_rate");
    expect(columns).not.toContain("b2c_currency");
    expect(columns).not.toContain("b2b_rate");
    expect(out.every((r) => !("b2c_rate" in r) && !("b2b_rate" in r))).toBe(true);
  });
  it("PM: B2B da, B2C ne — čak i kad bi red nosio B2C", () => {
    const leaked = rows(ADMIN); // red sa B2C vrednošću, a izvoz pravi korisnik bez rates.view_b2c
    const { columns, rows: out } = exportRows(leaked, ROLE_DEFAULTS.project_manager);
    expect(columns).toContain("b2b_rate");
    expect(columns).not.toContain("b2c_rate");
    expect(JSON.stringify(out)).not.toContain("2500");
  });
  it("Finance/Admin: obe tarife sa valutom", () => {
    const { columns, rows: out } = exportRows(rows(), ADMIN);
    expect(columns).toEqual(["employee", "employee_code", "project", "client", "job_role", "b2c_rate", "b2c_currency",
      "b2b_rate", "b2b_currency", "start_date", "end_date", "status"]);
    expect(out[1]).toMatchObject({ b2c_rate: 2500, b2c_currency: "RSD", b2b_rate: null, status: "ending_soon" });
  });
});

describe("T27 — isti broj kao Main Dashboard za period", () => {
  it("Active Workers / Active Projects u periodu = assignmentsInPeriod (dashboard.js)", async () => {
    const { activeWorkers, assignmentsInPeriod } = await import("./payroll/dashboard.js");
    const range = { from: "2033-03-01", to: "2033-03-31" };
    const list = filterAssignments(rows(), { mode: "all", from: range.from, to: range.to });
    const k = assignmentKpis(list, { today: T, period: range });
    expect(k.activeWorkers).toBe(activeWorkers(raw, range));
    expect(k.activeProjects).toBe(new Set(assignmentsInPeriod(raw, range).map((a) => a.project_id)).size);
    // bez perioda: trenutno važeći na referentni dan
    expect(assignmentKpis(filterAssignments(rows(), { mode: "all" }), { today: T }).activeWorkers).toBe(1);
  });
  it("Ending Soon = dashboard endingSoon", async () => {
    const { endingSoon: dashEnding } = await import("./payroll/dashboard.js");
    expect(endingSoon(rows()).map((r) => r.id)).toEqual(dashEnding(raw, T).map((a) => a.id));
  });
});


describe("Quick Insights → filtrirane liste (T04)", () => {
  const T = "2033-03-20";
  const rows = [
    { id: "a1", project_id: "p1", projectName: "Alfa", start_date: "2033-01-01", end_date: null },
    { id: "a2", project_id: "p1", projectName: "Alfa", start_date: "2033-01-01", end_date: "2033-04-01" },
    { id: "a3", project_id: "p1", projectName: "Alfa", start_date: "2033-04-01", end_date: null },
    { id: "a4", project_id: "p2", projectName: "Beta", start_date: "2032-01-01", end_date: "2033-02-01" },
    { id: "a5", project_id: "p2", projectName: "Beta", start_date: "2033-03-01", end_date: null },
  ];
  // Kao ProjectAssignmentsPage: zakrpa ide u adresu, filteri se čitaju iz nje i primenjuju na isti skup.
  const apply = (filters, patch) => {
    const next = { ...filters };
    for (const [k, v] of Object.entries(patch)) if (v === "") delete next[k]; else next[k] = v;
    return next;
  };
  const list = (f) => filterAssignments(rows, { projectId: f.project, status: f.status, mode: f.mode || "all", today: T }).map((a) => a.id);

  it("T04 Assignments by Project: klik na traku otvara angažmane tog projekta, drugi klik skida filter", () => {
    const bars = byProject(rows);
    expect(bars.map((b) => [b.projectId, b.count])).toEqual([["p1", 3], ["p2", 2]]);
    const f1 = apply({ mode: "all" }, insightFilterPatch("project", bars[0].projectId, {}));
    expect(f1.project).toBe("p1");
    expect(list(f1)).toEqual(["a1", "a2", "a3"]);
    expect(list(f1)).toHaveLength(bars[0].count);
    const f2 = apply(f1, insightFilterPatch("project", "p1", f1));
    expect(f2.project).toBeUndefined();
    expect(list(f2)).toHaveLength(rows.length);
  });

  it("T04 Quick Insights: status i Ending Soon vode na realnu filtriranu listu sa istim brojem kao kartica", () => {
    const breakdown = statusBreakdown(rows, { today: T });
    for (const item of breakdown.items) {
      const f = apply({ mode: "active" }, insightFilterPatch("status", item.status, {}));
      expect(f.mode).toBe("all");
      expect(list(f)).toHaveLength(item.count);
    }
    expect(insightFilterPatch("status", "completed", { status: "completed" })).toEqual({ status: "" });
    const soon = endingSoon(rows, 30, { today: T });
    const f = apply({ mode: "active" }, insightFilterPatch("ending_soon", null, {}));
    expect(list(f)).toEqual(soon.map((a) => a.id));
  });

  it("T04 Workers Available i Workforce Shortages otvaraju Workforce Planning sa istim projektom, ulogom, danom i smenom", () => {
    const filters = { project: "p1", role: "zavarivač" };
    const available = workforceInsightUrl("available", { date: "2033-03-20", shift: "s-1" }, filters);
    const qa = readListParams(new URLSearchParams(available.split("?")[1]));
    expect(available.startsWith("/workforce?")).toBe(true);
    expect(qa).toMatchObject({ view: "available", date: "2033-03-20", shift: "s-1", project: "p1", role: "zavarivač" });
    const shortages = workforceInsightUrl("shortages", { from: "2033-03-20", to: "2033-04-19" }, {});
    expect(readListParams(new URLSearchParams(shortages.split("?")[1]))).toMatchObject({ view: "shortages", from: "2033-03-20", to: "2033-04-19", project: "", role: "" });
    // ceo dan: bez smene u adresi
    expect(workforceInsightUrl("available", { date: "2033-03-20", shift: "" }, {})).toBe("/workforce?view=available&date=2033-03-20");
  });
});
