// Ulaz za izbor tarife i razvrstavanje sati, sveže iz baze (stranica Satnice). Sve ide kroz sloj podataka (D15);
// formule su u src/lib/payroll/timesheetRow.js (rates.js + hours.js), iznose u bazi računa guard_timesheet (D16).
import { addDays, format, parseISO } from "date-fns";
import { base44 } from "@/api/base44Client";
import { dailyThresholdOf } from "@/lib/payroll/timesheetRow";

const unique = (values) => [...new Set(values.filter(Boolean))];

/**
 * Sve što izbor tarife (resolveRates) traži za date redove, jednim učitavanjem.
 * Admin dobija i Tarife i profil radnika. Operateru ih baza ne vraća (D3), pa njegov nacrt dobija tarifu samo iz
 * dodele/projekta — admin je pri odobravanju bira ponovo, iz svih nivoa.
 * @param {Array<{ employee_id, project_id, week_start }>} rows
 * @returns {Promise<(row) => object>} ulaz za draftRates / approvalPayload jednog reda
 */
export async function loadRateInputs(rows, { isAdmin }) {
  const E = base44.entities;
  const employeeIds = unique(rows.map((r) => r.employee_id));
  const projectIds = unique(rows.map((r) => r.project_id));
  const [assignments, projects, rates, employees] = await Promise.all([
    employeeIds.length ? E.ProjectAssignment.filter({ employee_id: employeeIds }) : [],
    projectIds.length ? E.Project.filter({ id: projectIds }) : [],
    isAdmin ? E.Rate.list("-effective_from") : [],
    isAdmin && employeeIds.length ? E.Employee.filter({ id: employeeIds }) : [],
  ]);
  return (row) => ({
    date: row.week_start,
    employeeId: row.employee_id,
    project: projects.find((p) => p.id === row.project_id),
    assignments,
    rates,
    employeePrivate: employees.find((e) => e.id === row.employee_id) || null,
  });
}

/** Koeficijenti, dnevni prag i praznici za nedelje datih redova — sveže, da odobravanje ne radi sa starim podacima. */
export async function loadHourRules(rows) {
  const weeks = unique(rows.map((r) => r.week_start)).sort();
  if (!weeks.length) return { hourTypes: [], holidays: [], dailyThreshold: dailyThresholdOf(null) };
  const to = format(addDays(parseISO(weeks[weeks.length - 1]), 6), "yyyy-MM-dd");
  const E = base44.entities;
  const [hourTypes, holidays, workRules] = await Promise.all([
    E.HourType.list("sort", 20),
    E.Holiday.filter({ date: { $gte: weeks[0], $lte: to } }, "date"),
    E.WorkRules.list(null, 1),
  ]);
  return { hourTypes, holidays, dailyThreshold: dailyThresholdOf(workRules) };
}
