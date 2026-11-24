// Izveštaji o platama iz mesečnog obračuna (Faza 4, D17, D20, D21). Čiste funkcije — ništa se ne čita iz baze.
//
// Izvor su SAČUVANI redovi obračuna: `payroll_runs` (mesec, status), `payslips` (listić po radniku) i
// `payslip_projects` (raspodela bruto 2 po projektu). Iznosi se ne računaju ponovo — samo se sabiraju istim
// funkcijama kao na stranici Mesečni obračun (`payrollTotals`, `projectTotals`), pa su brojke za isti mesec iste
// kao tamo. Stari nedeljni zapisi (`payroll_records`) se ne koriste.
//
// Status: konačan je samo odobren ili isplaćen obračun (`FINAL_RUN_STATUSES`). Nacrt se prikazuje u spisku meseci i
// u pregledu meseca, uvek označen kao „nacrt" (može ponovo da se generiše), ali NE ulazi u zbir konačnih obračuna.

import { sum2 } from "./money.js";
import { monthStart, payrollTotals, projectTotals } from "./payrollMonth.js";

/** Statusi obračuna čiji su iznosi konačni. Nacrt se može ponovo generisati. */
export const FINAL_RUN_STATUSES = Object.freeze(["approved", "paid"]);

/** Da li je obračun konačan (odobren ili isplaćen). Nacrt i nepoznat status nisu. */
export const isFinalRun = (run) => FINAL_RUN_STATUSES.includes(run?.status);

/** Da li je obračun nacrt (prikazuje se sa oznakom „nacrt", ne ulazi u zbir konačnih). */
export const isDraftRun = (run) => run?.status === "draft";

/**
 * Zbirovi koji postoje na samom listiću (bez raspodele po projektima). Prihod i raspodela traže redove
 * `payslip_projects`, pa ih pregled po mesecima ne nosi.
 */
export const SLIP_TOTAL_FIELDS = Object.freeze([
  "hours", "payout", "neto", "bruto", "tax", "employeeContributions", "employerContributions", "totalCost", "basis",
]);

const pick = (totals) => Object.fromEntries(SLIP_TOTAL_FIELDS.map((f) => [f, totals[f]]));

/**
 * Listići sa raspodelom po projektima (`projects`), isto kao sačuvani listići na stranici Mesečni obračun:
 * redovi `payslip_projects` po `payslip_id`, sortirani po `project_id`; listići po imenu radnika.
 * Red raspodele čiji listić nije na listi se ignoriše.
 */
export function payslipsWithProjects(payslips, payslipProjects) {
  const bySlip = new Map();
  for (const p of payslipProjects || []) {
    if (!bySlip.has(p.payslip_id)) bySlip.set(p.payslip_id, []);
    bySlip.get(p.payslip_id).push(p);
  }
  return (payslips || [])
    .map((s) => ({
      ...s,
      projects: [...(bySlip.get(s.id) || [])].sort((a, b) => String(a.project_id).localeCompare(String(b.project_id))),
    }))
    .sort((a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || ""), "sr"));
}

const contributionsOf = (slip, fields) =>
  slip?.[fields[0]] === null || slip?.[fields[0]] === undefined
    ? null
    : sum2(fields.map((f) => (slip[f] === null || slip[f] === undefined ? 0 : slip[f])));

/**
 * Doprinosi jednog listića u centima: radnika (PIO + zdravstvo + nezaposlenost) i poslodavca (PIO + zdravstvo).
 * `null` kad listić nema doprinose (radnik preko podizvođača) — prikazuje se kao „—", ne kao 0.
 */
export function payslipContributions(slip) {
  return {
    employee: contributionsOf(slip, ["emp_pio", "emp_health", "emp_unemployment"]),
    employer: contributionsOf(slip, ["er_pio", "er_health"]),
  };
}

/**
 * Pregled po mesecima: jedan red po obračunu, od najnovijeg meseca. `totals` su zbirovi listića tog obračuna
 * (`payrollTotals`, samo polja iz `SLIP_TOTAL_FIELDS`), `workers` = broj listića.
 * @param {Array} runs      payroll_runs { id, month, status }
 * @param {Array} payslips  payslips { run_id, … } — svi listići (listić drugog obračuna se ne meša)
 */
export function payrollRunRows(runs, payslips) {
  const slipsByRun = new Map();
  for (const s of payslips || []) {
    if (!slipsByRun.has(s.run_id)) slipsByRun.set(s.run_id, []);
    slipsByRun.get(s.run_id).push(s);
  }
  return (runs || [])
    .filter((r) => r?.id && r.month)
    .map((r) => {
      const slips = slipsByRun.get(r.id) || [];
      return {
        runId: r.id,
        month: monthStart(r.month),
        status: r.status,
        final: isFinalRun(r),
        draft: isDraftRun(r),
        workers: slips.length,
        totals: pick(payrollTotals(slips)),
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Zbir SAMO konačnih (odobrenih i isplaćenih) obračuna — nacrt se ne sabira. Isto kao `payrollTotals` nad svim
 * listićima tih obračuna.
 * @returns {{ months: number, workers: number, totals: object }} `workers` = broj listića (radnik × mesec)
 */
export function finalPayrollTotals(runs, payslips) {
  const finalIds = new Set((runs || []).filter(isFinalRun).map((r) => r.id));
  const slips = (payslips || []).filter((s) => finalIds.has(s.run_id));
  return { months: finalIds.size, workers: slips.length, totals: pick(payrollTotals(slips)) };
}

/**
 * Jedan mesec: listići obračuna sa raspodelom po projektima i zbirovi — isti kao na stranici Mesečni obračun
 * (`payrollTotals` za radnike, `projectTotals` za projekte). Listići drugih obračuna se ne uzimaju.
 * `allocationOk` = zbir raspodele po projektima jednak zbiru bruto 2 (trošak), kao provera na toj stranici.
 */
export function monthPayrollReport({ run, payslips, payslipProjects }) {
  if (!run?.id) return null;
  const slips = payslipsWithProjects((payslips || []).filter((s) => s.run_id === run.id), payslipProjects);
  const totals = payrollTotals(slips);
  return {
    runId: run.id,
    month: monthStart(run.month),
    status: run.status,
    final: isFinalRun(run),
    draft: isDraftRun(run),
    payslips: slips,
    totals,
    projects: projectTotals(slips),
    allocationOk: totals.allocated === totals.totalCost,
  };
}
