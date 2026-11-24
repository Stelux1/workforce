// KPI formule (spec §10, §5 primer, D30 K4). Čiste funkcije nad iznosima PO VALUTI — nijedna ne sabira dve valute.
//
//   Labor Revenue   = Σ grupa(Approved Hours × B2B × Client Coefficient)
//   Payroll Cost    = Σ grupa(Approved Hours × B2C × Worker Coefficient)   — obračun, NIJE isplaćeno, NIJE bruto 2 (K4)
//   Labor Margin    = Labor Revenue − Payroll Cost
//   Net Profit      = Labor Revenue − Payroll Cost − Additional Project Costs
//   Profit Margin   = Net Profit / Labor Revenue × 100, samo kad je Labor Revenue > 0 (inače null, ne 0 i ne ∞)
//
// „Grupa" je pravilo zaokruživanja iz laborLines.js (sideAmount).

import { round2 } from "../payroll/money.js";
import { sortCurrencies, subtractByCurrency } from "./currency.js";

/** Labor Margin po valuti. */
export function laborMargin(revenueByCurrency = {}, costByCurrency = {}) {
  return subtractByCurrency(revenueByCurrency, costByCurrency);
}

/** Net Project Profit po valuti. */
export function netProfit(revenueByCurrency = {}, costByCurrency = {}, additionalByCurrency = {}) {
  return subtractByCurrency(subtractByCurrency(revenueByCurrency, costByCurrency), additionalByCurrency);
}

/** Profit Margin u procentima (2 decimale) ili null kad prihod nije > 0. */
export function profitMargin(profit, revenue) {
  const r = Number(revenue);
  const p = Number(profit);
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(p)) return null;
  return round2((p / r) * 100);
}

/**
 * KPI po valuti iz tri ulaza po valuti. Valuta koja postoji u bilo kom ulazu dobija red; nedostajući iznos je 0.
 * @returns {Record<string, {laborRevenue, payrollCost, laborMargin, additionalCosts, netProfit, profitMargin}>}
 */
export function kpisByCurrency({ revenue = {}, cost = {}, additional = {} } = {}) {
  const margin = laborMargin(revenue, cost);
  const profit = netProfit(revenue, cost, additional);
  const out = {};
  for (const cur of sortCurrencies([...Object.keys(revenue), ...Object.keys(cost), ...Object.keys(additional)])) {
    const laborRevenue = revenue[cur] ?? 0;
    out[cur] = {
      laborRevenue,
      payrollCost: cost[cur] ?? 0,
      laborMargin: margin[cur] ?? 0,
      additionalCosts: additional[cur] ?? 0,
      netProfit: profit[cur] ?? 0,
      profitMargin: profitMargin(profit[cur] ?? 0, laborRevenue),
    };
  }
  return out;
}

