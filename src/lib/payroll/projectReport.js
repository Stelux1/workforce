// Finansijski izveštaj jednog projekta po mesecima (Faza 4; D8, D9, D16, D17, D19). Čiste funkcije — ništa se ne
// čita iz baze.
//
// Projekat je samo `project_id`: satnice, troškovi i redovi obračuna se biraju po ID-u. Ime projekta (ni trenutno
// ni snimak u satnici `timesheets.project`) se ne koristi, pa preimenovanje projekta ne menja nijednu brojku.
//
// Prihod = odobrene satnice (`client_revenue`, D9). Nedelja u jednom mesecu ide cela, iznosima koje je izračunala
// baza (D16). Nedelja koja prelazi u drugi mesec deli se PO DANU istom funkcijom kao mesečni obračun
// (`timesheetMonthLines`, tarife i koeficijenti iz snimka odobravanja, D17), pa zbir dva meseca može da odstupi od
// satnice za cent (isto kao u obračunu).
//
// Trošak radnika po mesecu (D8):
//   - mesec sa ODOBRENIM ili ISPLAĆENIM obračunom → bruto 2 raspodeljen na ovaj projekat (`payslip_projects.labor_cost`);
//   - svi ostali meseci (bez obračuna ili samo nacrt) → PROCENA: iznos sati iz odobrenih satnica (`worker_cost` =
//     sati × satnica radnika, bez poreza i doprinosa), podeljen po danu kao prihod. Ekran je obavezno označava
//     kao „procena".
// Troškovi projekta nemaju datum, pa se oduzimaju od ukupnog iznosa projekta (EUR, uključeni preračunati RSD —
// `sumCostsEur`, D19). Ostaje nama = projectMargin(prihod, trošak radnika, troškovi projekta).

import { allocate, round2, sum2 } from "./money.js";
import { computeWorkerMonth, ENGAGEMENT, projectMargin } from "./monthly.js";
import { formatDay, monthStart, problemMessage, timesheetMonthLines } from "./payrollMonth.js";
import { sumCostsEur } from "./costs.js";
import { UNASSIGNED_KEY } from "./reports.js";
import { DAY_FIELDS } from "./timesheetRow.js";

/** Statusi obračuna čiji je trošak konačan (bruto 2 iz obračuna). Nacrt se može ponovo generisati → procena. */
export const FINAL_RUN_STATUSES = Object.freeze(["approved", "paid"]);

/** Odakle je trošak radnika za mesec. */
export const LABOR_SOURCE = Object.freeze({ PAYROLL: "obracun", ESTIMATE: "procena" });

export const REPORT_PROBLEM = Object.freeze({
  /** Nedelja preko granice meseca bez ispravnog snimka: podeljena srazmerno satima po danu (procena). */
  SPLIT_BY_HOURS: "split_by_hours",
  /** Sati ovog projekta u odobrenom obračunu ne odgovaraju odobrenim satnicama meseca. */
  PAYROLL_HOURS_MISMATCH: "payroll_hours_mismatch",
});

// Prazan iznos (null) sabira se kao 0 — sum2 bi inače bacio grešku na undefined (isto kao reports.js).
const amount = (v) => (v === null || v === undefined || v === "" ? 0 : v);
const day = (v) => (v ? String(v).slice(0, 10) : "");

/** "YYYY-MM-DD" + n dana, u UTC da vremenska zona ne pomeri dan (isto kao payrollMonth.js). */
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sati satnice po mesecu (datum rada = week_start + dan u nedelji), samo dani sa satima > 0. */
function hoursByMonth(row) {
  const weekStart = day(row?.week_start);
  const parts = new Map();
  if (!weekStart) return new Map();
  DAY_FIELDS.forEach((field, i) => {
    const n = Number.parseFloat(row?.[field]);
    if (!Number.isFinite(n) || !(round2(n) > 0)) return;
    const month = monthStart(addDays(weekStart, i));
    parts.set(month, [...(parts.get(month) || []), round2(n)]);
  });
  return new Map([...parts.entries()].map(([m, list]) => [m, sum2(list)]));
}

/**
 * Iznos sati iz linija meseca (timesheetMonthLines) — isto sabiranje i zaokruživanje kao obračun
 * (computeWorkerMonth: sati po vrsti, tarifi i koeficijentu, pa množenje). Računa se kao „bez poreza i doprinosa"
 * (podizvođač), jer je procena troška = iznos sati, a ne bruto 2.
 */
function linesAmounts(lines) {
  const m = computeWorkerMonth({ engagement: ENGAGEMENT.SUBCONTRACTOR, lines });
  return { hours: m.totalHours, revenue: m.revenue, cost: m.basisAmount };
}

/**
 * Delovi jedne odobrene satnice po mesecu: { month, hours, revenue, cost } (cost = procena troška, iznos sati).
 * @returns {{ parts: Array, problem: object|null }}
 */
function timesheetParts(row) {
  const byMonth = hoursByMonth(row);
  const whole = { hours: amount(row.total_hours), revenue: amount(row.client_revenue), cost: amount(row.worker_cost) };
  if (byMonth.size <= 1) {
    const month = byMonth.size ? [...byMonth.keys()][0] : monthStart(row.week_start);
    return { parts: [{ month, hours: round2(whole.hours), revenue: round2(whole.revenue), cost: round2(whole.cost) }], problem: null };
  }

  const months = [...byMonth.keys()].sort();
  const split = months.map((month) => ({ month, r: timesheetMonthLines(row, month) }));
  const bad = split.find((s) => s.r.problems.length);
  if (!bad) {
    return { parts: split.map(({ month, r }) => ({ month, ...linesAmounts(r.lines) })), problem: null };
  }

  // Bez ispravnog snimka nedelja ne može da se podeli po vrsti sati i tarifi dana. Da se iznos ne izgubi ni ne
  // duplira, deli se srazmerno satima po danu (zbir tačan na cent) i prijavljuje kao problem — nikad tiho.
  const weights = months.map((m) => byMonth.get(m));
  const revenue = allocate(whole.revenue, weights);
  const cost = allocate(whole.cost, weights);
  return {
    parts: months.map((month, i) => ({ month, hours: byMonth.get(month), revenue: revenue[i], cost: cost[i] })),
    problem: { code: REPORT_PROBLEM.SPLIT_BY_HOURS, cause: bad.r.problems[0], months },
  };
}

const push = (map, key, init) => {
  let v = map.get(key);
  if (!v) {
    v = init();
    map.set(key, v);
  }
  return v;
};

/**
 * Finansijski izveštaj projekta.
 * @param {object} input
 * @param {string} input.projectId
 * @param {Array}  input.timesheets       satnice (neodobrene i satnice drugih projekata se ne računaju u novac)
 * @param {Array}  [input.costs]          project_costs (samo redovi sa ovim project_id)
 * @param {Array}  [input.runs]           payroll_runs { id, month, status }
 * @param {Array}  [input.payslips]       payslips { id, run_id, employee_id, employee_name }
 * @param {Array}  [input.payslipProjects] payslip_projects { payslip_id, project_id, hours, labor_cost }
 * @returns {{ months: Array, employees: Array, totals: object, costs: object, pending: object, problems: Array }}
 */
export function projectFinancialReport({ projectId, timesheets, costs, runs, payslips, payslipProjects }) {
  const own = (timesheets || []).filter((ts) => ts && ts.project_id != null && ts.project_id === projectId);
  const approved = own.filter((ts) => ts.approval_status === "approved");
  const notApproved = own.filter((ts) => ts.approval_status !== "approved");

  // Status obračuna po mesecu (bilo koji status — za prikaz); konačan trošak samo iz odobrenog/isplaćenog.
  const runStatus = new Map((runs || []).filter((r) => r?.month).map((r) => [monthStart(r.month), r.status]));
  const finalRunMonth = new Map(
    (runs || []).filter((r) => r?.month && FINAL_RUN_STATUSES.includes(r.status)).map((r) => [r.id, monthStart(r.month)])
  );
  const slipById = new Map((payslips || []).filter((s) => s?.id != null).map((s) => [s.id, s]));

  const months = new Map(); // month → { hours[], revenue[], estimate[], payrollCost[], payrollHours[] }
  const employees = new Map(); // employee_id → { name, hours[], revenue[], cost[], estimate }
  const problems = [];
  const monthOf = (m) => push(months, m, () => ({ hours: [], revenue: [], estimate: [], payrollCost: [], payrollHours: [], payroll: false }));
  const workerOf = (id, name) => {
    const w = push(employees, id ?? null, () => ({ name: null, hours: [], revenue: [], cost: [], estimate: false }));
    if (!w.name && name) w.name = name;
    return w;
  };

  // Odobreni obračuni: bruto 2 na ovaj projekat, po mesecu i radniku.
  for (const pp of payslipProjects || []) {
    if (!pp || pp.project_id !== projectId) continue;
    const slip = slipById.get(pp.payslip_id);
    const month = slip ? finalRunMonth.get(slip.run_id) : null;
    if (!month) continue; // nacrt ili listić koji nije učitan
    const m = monthOf(month);
    m.payroll = true;
    m.payrollCost.push(amount(pp.labor_cost));
    m.payrollHours.push(amount(pp.hours));
    workerOf(slip.employee_id, slip.employee_name).cost.push(amount(pp.labor_cost));
  }
  const isFinal = (month) => months.get(month)?.payroll === true || FINAL_RUN_STATUSES.includes(runStatus.get(month));

  for (const ts of approved) {
    const { parts, problem } = timesheetParts(ts);
    if (problem) {
      problems.push({ ...problem, timesheetId: ts.id, weekStart: day(ts.week_start), employeeId: ts.employee_id ?? null, employeeName: ts.employee_name || "" });
    }
    const w = workerOf(ts.employee_id, ts.employee_name);
    for (const p of parts) {
      const m = monthOf(p.month);
      m.hours.push(p.hours);
      m.revenue.push(p.revenue);
      w.hours.push(p.hours);
      w.revenue.push(p.revenue);
      if (!isFinal(p.month)) {
        m.estimate.push(p.cost);
        w.cost.push(p.cost);
        w.estimate = true;
      }
    }
  }

  const monthRows = [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => {
      const final = isFinal(month);
      const hours = sum2(m.hours);
      const revenue = sum2(m.revenue);
      const laborCost = final ? sum2(m.payrollCost) : sum2(m.estimate);
      if (final) {
        const payrollHours = sum2(m.payrollHours);
        if (payrollHours !== hours) problems.push({ code: REPORT_PROBLEM.PAYROLL_HOURS_MISMATCH, month, payrollHours, timesheetHours: hours });
      }
      return {
        month,
        runStatus: runStatus.get(month) || null,
        laborSource: final ? LABOR_SOURCE.PAYROLL : LABOR_SOURCE.ESTIMATE,
        estimate: !final,
        hours,
        revenue,
        laborCost,
        difference: projectMargin({ revenue, laborCost }).remaining,
      };
    });

  const employeeRows = [...employees.entries()]
    .map(([id, w]) => ({
      id,
      key: id ?? UNASSIGNED_KEY,
      name: w.name,
      hours: sum2(w.hours),
      revenue: sum2(w.revenue),
      laborCost: sum2(w.cost),
      estimate: w.estimate,
    }))
    .sort((a, b) => b.hours - a.hours || String(a.name || "").localeCompare(String(b.name || ""), "sr"));

  const ownCosts = (costs || []).filter((c) => c && c.project_id === projectId);
  const c = sumCostsEur(ownCosts);
  const payrollLaborCost = sum2(monthRows.filter((r) => !r.estimate).map((r) => r.laborCost));
  const estimatedLaborCost = sum2(monthRows.filter((r) => r.estimate).map((r) => r.laborCost));
  const revenue = sum2(monthRows.map((r) => r.revenue));
  const laborCost = sum2([payrollLaborCost, estimatedLaborCost]);
  const margin = projectMargin({ revenue, laborCost, otherCosts: c.total });

  return {
    months: monthRows,
    employees: employeeRows,
    totals: {
      hours: sum2(monthRows.map((r) => r.hours)),
      count: approved.length,
      revenue: margin.revenue,
      laborCost: margin.laborCost,
      payrollLaborCost,
      estimatedLaborCost,
      hasEstimate: monthRows.some((r) => r.estimate), // bar jedan mesec bez odobrenog obračuna → ukupno je procena
      otherCosts: margin.otherCosts,
      laborDifference: projectMargin({ revenue, laborCost }).remaining, // prihod − trošak radnika (pre troškova projekta)
      remaining: margin.remaining,
      marginPct: margin.marginPct,
    },
    costs: {
      count: ownCosts.length,
      eur: c.total,
      fromRsd: c.converted.RSD || { amount: 0, eur: 0 },
      missingRsd: c.missingByCurrency.RSD || 0, // RSD bez kursa: NIJE oduzet (ni kao 0 ni kao RSD), prikazuje se posebno
    },
    pending: { count: notApproved.length, hours: sum2(notApproved.map((ts) => amount(ts.total_hours))) },
    problems,
  };
}

/** "MM.YYYY" za poruke. */
const formatMonth = (month) => formatDay(month).slice(3);

/** Poruka problema izveštaja na izabranom jeziku. */
export function reportProblemMessage(p, lang = "rs") {
  const en = lang === "en";
  if (p.code === REPORT_PROBLEM.SPLIT_BY_HOURS) {
    const cause = problemMessage({ ...p.cause, employeeName: p.employeeName, weekStart: p.weekStart }, lang);
    const months = (p.months || []).map(formatMonth).join(en ? " and " : " i ");
    return en
      ? `${cause}. The week spans ${months}, so its amounts are split by hours per day (estimate).`
      : `${cause}. Nedelja prelazi ${months}, pa su iznosi podeljeni srazmerno satima po danu (procena).`;
  }
  if (p.code === REPORT_PROBLEM.PAYROLL_HOURS_MISMATCH) {
    return en
      ? `${formatMonth(p.month)}: approved payroll has ${p.payrollHours} h on this project, approved timesheets ${p.timesheetHours} h.`
      : `${formatMonth(p.month)}: odobren obračun ima ${p.payrollHours} h na ovom projektu, odobrene satnice ${p.timesheetHours} h.`;
  }
  return p.code;
}
