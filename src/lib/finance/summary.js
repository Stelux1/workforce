// Jedan obračunski servis (spec §10: „Izveštaji i Dashboard koriste isti obračunski servis"; data model §3.3).
// Čiste funkcije, ništa se ne čita iz baze.
//
// financialSummary je INTERNI obračun: odobreni sati × tarife × koeficijenti i dodatni troškovi projekta.
// Namerno NE sadrži fakturisano, primljene uplate klijenta ni isplate radnicima/vendorima (T17) — to su novčani
// tokovi iz payables.js i billing.js, koji se prikazuju odvojeno.
// Srpski bruto 2 (payslip_projects.labor_cost) NIJE trošak projekta (K4).

import { round2 } from "../payroll/money.js";
import { BASE_CURRENCY, convertTotals, costEurAmount, normalizeCurrency, sortCurrencies, sumByCurrency } from "./currency.js";
import { estimateDayLines, laborDayLines, SIDES, sideAmount, sumHours } from "./laborLines.js";
import { kpisByCurrency, profitMargin } from "./kpis.js";

const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
const asList = (v) => (v === null || v === undefined || v === "" ? null : Array.isArray(v) ? v : [v]);

/** Datum troška (cost_date; stari red pre migracije 05: datum unosa). */
export const costDate = (cost) => dateOnly(cost?.cost_date ?? cost?.created_date);

/**
 * Dodatni troškovi projekta za period i filtere. `billable` se NE izdvaja iz troška (§8.2.4, T15).
 * Filteri: projectId, clientId (preko projekta), employeeId (samo troškovi vezani za radnika), costCategoryId.
 * Filter projectRoleId: trošak nije vezan za ulogu, pa se ne pripisuje (vraća prazno, `notAttributable: true`).
 */
export function filterAdditionalCosts(costs = [], { from = null, to = null, filters = {}, projects = [] } = {}) {
  if (asList(filters?.projectRoleId)) return { costs: [], notAttributable: true };
  const clientOf = new Map((projects || []).map((p) => [p.id, p.client_id ?? null]));
  const projectIds = asList(filters?.projectId);
  const clientIds = asList(filters?.clientId);
  const employeeIds = asList(filters?.employeeId);
  const categoryIds = asList(filters?.costCategoryId);
  const f = dateOnly(from);
  const t = dateOnly(to);
  const list = (costs || []).filter((c) => {
    const d = costDate(c);
    if (!d || (f && d < f) || (t && d > t)) return false;
    if (projectIds && !projectIds.includes(c.project_id)) return false;
    if (clientIds && !clientIds.includes(clientOf.get(c.project_id) ?? null)) return false;
    if (employeeIds && !employeeIds.includes(c.employee_id)) return false;
    if (categoryIds && !categoryIds.includes(c.cost_category_id)) return false;
    return true;
  });
  return { costs: list, notAttributable: false };
}

/** Konverzija troškova u EUR po kursu sa samog troška (K3/D19): uz datum kursa; ostalo odvojeno. */
function costsInEur(costs) {
  let cents = 0;
  const used = [];
  const withoutRateDate = [];
  const missingRate = [];
  for (const c of costs) {
    const r = costEurAmount(c);
    if (r.reason === "rate_without_date") withoutRateDate.push(c);
    else if (r.reason === "missing_rate") missingRate.push(c);
    else {
      cents += Math.round(r.eur * 100);
      if (r.currency !== BASE_CURRENCY) used.push({ costId: c.id ?? null, currency: r.currency, unitsPerEur: r.unitsPerEur, rateDate: r.rateDate, source: "project_cost" });
    }
  }
  return { total: cents / 100 || 0, used, withoutRateDate, missingRate };
}

/**
 * Finansijski pregled perioda (Dashboard, Financial Report projekta i centralni).
 * @param {{
 *   timesheets: object[], costs?: object[], range?: {from?:string, to?:string}, filters?: object,
 *   projects?: object[], assignments?: object[], exchangeRates?: object[], convertTo?: string, rateDate?: string,
 *   dayLinesOf?: Function
 * }} input  filters: { projectId, clientId, employeeId, projectRoleId, costCategoryId } (vrednost ili niz)
 * @returns {{
 *   range, approvedHours:number, currencies:string[],
 *   byCurrency: Record<string, {laborRevenue, payrollCost, laborMargin, additionalCosts, netProfit, profitMargin}>,
 *   pendingEstimate: {hours:number, laborRevenue:Record<string,number>, payrollCost:Record<string,number>, problems:object[]},
 *   converted: null | {to, date, laborRevenue, payrollCost, laborMargin, additionalCosts, netProfit, profitMargin, used, missing, costsWithoutRateDate, costsMissingRate},
 *   problems: object[], missingRevenueRate:number, missingCostRate:number, costsNotAttributable:boolean, lineCount:number
 * }}
 */
export function financialSummary({
  timesheets = [],
  costs = [],
  range = {},
  filters = {},
  projects = [],
  assignments = [],
  exchangeRates = null,
  convertTo = BASE_CURRENCY,
  rateDate = null,
  dayLinesOf,
} = {}) {
  const from = dateOnly(range?.from);
  const to = dateOnly(range?.to);
  const opts = { from, to, filters, projects, assignments };

  const { lines, problems } = laborDayLines(timesheets, { ...opts, dayLinesOf });
  const revenue = sideAmount(lines, SIDES.REVENUE);
  const cost = sideAmount(lines, SIDES.COST);

  const additional = filterAdditionalCosts(costs, { from, to, filters, projects });
  const additionalByCurrency = sumByCurrency(additional.costs, { amountOf: (c) => c.amount, currencyOf: (c) => c.currency });

  const byCurrency = kpisByCurrency({ revenue: revenue.byCurrency, cost: cost.byCurrency, additional: additionalByCurrency });

  const est = estimateDayLines(timesheets, { ...opts, dayLinesOf });
  const pendingEstimate = {
    hours: sumHours(est.lines),
    laborRevenue: sideAmount(est.lines, SIDES.REVENUE).byCurrency,
    payrollCost: sideAmount(est.lines, SIDES.COST).byCurrency,
    problems: est.problems,
  };

  let converted = null;
  if (Array.isArray(exchangeRates)) {
    const target = normalizeCurrency(convertTo);
    const date = dateOnly(rateDate) ?? to;
    const rev = convertTotals(revenue.byCurrency, exchangeRates, { to: target, date });
    const cst = convertTotals(cost.byCurrency, exchangeRates, { to: target, date });
    // Troškovi u EUR idu po kursu evidentiranom na samom trošku (uz datum kursa, D19); za drugu ciljnu valutu
    // preko tabele kurseva kao i rad.
    let add;
    if (target === BASE_CURRENCY) {
      const e = costsInEur(additional.costs);
      add = { total: e.total, used: e.used, missing: [], withoutRateDate: e.withoutRateDate, missingRate: e.missingRate };
    } else {
      const a = convertTotals(additionalByCurrency, exchangeRates, { to: target, date });
      add = { total: a.total, used: a.used, missing: a.missing, withoutRateDate: [], missingRate: [] };
    }
    const revOk = rev.missing.length === 0;
    const cstOk = cst.missing.length === 0;
    const addOk = add.missing.length === 0 && add.withoutRateDate.length === 0 && add.missingRate.length === 0;
    const profit = revOk && cstOk && addOk ? round2(rev.total - cst.total - add.total) : null;
    converted = {
      to: target,
      date,
      laborRevenue: revOk ? rev.total : null,
      payrollCost: cstOk ? cst.total : null,
      laborMargin: revOk && cstOk ? round2(rev.total - cst.total) : null,
      additionalCosts: addOk ? add.total : null,
      netProfit: profit,
      profitMargin: profit === null ? null : profitMargin(profit, rev.total),
      used: dedupeUsed([...rev.used, ...cst.used, ...add.used]),
      missing: sortCurrencies([...rev.missing, ...cst.missing, ...add.missing]),
      costsWithoutRateDate: add.withoutRateDate,
      costsMissingRate: add.missingRate,
    };
  }

  return {
    range: { from, to },
    approvedHours: sumHours(lines),
    currencies: Object.keys(byCurrency),
    byCurrency,
    pendingEstimate,
    converted,
    problems,
    missingRevenueRate: revenue.missing.length,
    missingCostRate: cost.missing.length,
    costsNotAttributable: additional.notAttributable,
    lineCount: lines.length,
  };
}

function dedupeUsed(list) {
  const seen = new Set();
  return list.filter((u) => {
    const k = `${u.costId ?? ""}|${u.currency}|${u.unitsPerEur}|${u.rateDate}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
