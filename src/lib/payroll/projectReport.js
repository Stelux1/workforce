// Financial Reports (spec §10, §2.2 Financial Report; D30 K3/K4; docs/TEAMORA-DATA-MODEL.md §3.3–3.4, W2-J).
// Čiste funkcije — ništa se ne čita iz baze.
//
// Ovo je samo OMOTAČ oko jednog obračunskog servisa (`financialSummary` iz src/lib/finance): isti KPI-jevi, isto
// pravilo zaokruživanja i isti filteri kao Dashboard, Billing i Payables (T27). Ovde nema nijedne sopstvene formule
// za prihod, trošak ili profit:
//   Labor Revenue = Σ grupa(Approved × B2B × Client Coef)
//   Payroll Cost  = Σ grupa(Approved × B2C × Worker Coef) — obračun, NIJE isplaćeno i NIJE srpski bruto 2 (K4)
//   Net Profit    = Labor Revenue − Payroll Cost − Additional Project Costs; Profit Margin null kad prihod nije > 0.
//
// Novčani tokovi (T17) su ODVOJENE sekcije i nikad se ne mešaju sa obračunom:
//   - billing:  interni B2B obračun klijentu (billing_summaries), ručno evidentiran eksterni račun, primljene uplate;
//   - payables: obaveze prema radnicima/vendorima i stvarne isplate (payments).
// Kad tabela još ne postoji ili korisnik nema pravo, sekcija je `null` (ekran: „nema podataka" / „nemate pravo").
//
// Valute (K3, T28): sve je po valuti. Jedan broj u EUR postoji samo kad korisnik izabere konverziju, uz kurs i datum
// (`summary.converted`); valuta bez kursa i trošak sa kursom bez datuma su izdvojeni i NISU u zbiru.
// Projekat i klijent su samo ID-jevi (T25): ime se nigde ne koristi za spajanje ni filtriranje.

import {
  aggregateLabor, billingBalance, billingTotals, costEurAmount, filterAdditionalCosts, financialSummary,
  laborDayLines, normalizeCurrency, payableBalance, payablesTotals, sortCurrencies, sumByCurrency, unbilledRevenue,
} from "../finance/index.js";
import { costsByCategory, hasPerm, uniqueCosts } from "../projectCosts.js";

const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
const asList = (v) => (v === null || v === undefined || v === "" || v === "all" ? null : Array.isArray(v) ? (v.length ? v : null) : [v]);

/** Period [aStart, aEnd] seče izabrani period [from, to] (prazna granica = otvoreno). */
function overlaps(aStart, aEnd, from, to) {
  const s = dateOnly(aStart);
  const e = dateOnly(aEnd) ?? s;
  if (from && e && e < from) return false;
  if (to && s && s > to) return false;
  return true;
}
const inRange = (d, from, to) => {
  const x = dateOnly(d);
  if (!x) return !from && !to;
  return (!from || x >= from) && (!to || x <= to);
};

/** Čisti filtere: prazno i "all" = bez filtera; ostaje samo ono što obračunski servis zna. */
export function normalizeFilters(filters = {}) {
  const out = {};
  for (const key of ["projectId", "clientId", "employeeId", "projectRoleId", "costCategoryId"]) {
    const list = asList(filters?.[key]);
    if (list) out[key] = list;
  }
  return out;
}

// ───────────────────────── prava (T26) ─────────────────────────

const P = Object.freeze({
  B2B: "rates.view_b2b",
  B2C: "rates.view_b2c",
  COSTS: "costs.view",
  BILLING: "billing.view",
  PAYROLL: "payroll.view",
});

/**
 * Koje vrednosti korisnik sme da vidi i izveze. Iste provere važe za ekran i za CSV/PDF (druga linija odbrane —
 * server te vrednosti ionako ne vraća: timesheet_money maskira tarife, RLS sakriva billing/payables).
 */
export function reportVisibility(perms) {
  const b2b = hasPerm(perms, P.B2B);
  const b2c = hasPerm(perms, P.B2C);
  return {
    laborRevenue: b2b,
    payrollCost: b2c,
    laborMargin: b2b && b2c,
    additionalCosts: hasPerm(perms, P.COSTS),
    netProfit: b2b && b2c && hasPerm(perms, P.COSTS),
    profitMargin: b2b && b2c && hasPerm(perms, P.COSTS),
    billing: hasPerm(perms, P.BILLING),
    payables: hasPerm(perms, P.PAYROLL) && b2c,
  };
}

// ───────────────────────── novčani tokovi (odvojeno, T17) ─────────────────────────

/**
 * Billing Summary-ji, eksterni račun i uplate klijenta za obuhvat izveštaja.
 * - Pregled „ceo klijent" (project_id null) se ne pripisuje jednom projektu: kod filtera po projektu ide u
 *   `clientWide` (prikaz uz napomenu), ne u zbir projekta.
 * - Filter po radniku ili ulozi: pregled se ne može razdvojiti → `notAttributable`.
 * - `unbilled` = prihod odobrenih sati u obuhvatu koji nije ni u jednom pregledu (bilo kog statusa).
 */
export function billingSection(data, { from = null, to = null, filters = {}, projects = [], lines = [], today = null } = {}) {
  if (!data) return null;
  const summaries = (data.summaries || []).filter(Boolean);
  const clientPayments = (data.clientPayments || []).filter(Boolean);
  const unbilled = unbilledRevenue(lines, summaries);
  if (filters.employeeId || filters.projectRoleId) {
    return { notAttributable: true, rows: [], clientWide: [], totals: {}, clientWideTotals: {}, unlinkedReceived: {}, unlinkedCount: 0, unbilled };
  }
  const projectIds = filters.projectId || null;
  const clientIds = filters.clientId || null;
  const clientOfProject = new Map((projects || []).map((p) => [p.id, p.client_id ?? null]));
  const projectClients = projectIds ? new Set(projectIds.map((id) => clientOfProject.get(id)).filter(Boolean)) : null;

  const own = [];
  const clientWide = [];
  for (const s of summaries) {
    if (!overlaps(s.period_start, s.period_end, from, to)) continue;
    if (clientIds && !clientIds.includes(s.client_id)) continue;
    if (projectIds) {
      if (s.project_id) {
        if (projectIds.includes(s.project_id)) own.push(s);
      } else if (projectClients.has(s.client_id)) {
        clientWide.push(s);
      }
      continue;
    }
    own.push(s);
  }
  const row = (s) => ({ summary: s, balance: billingBalance(s, clientPayments, { today }) });

  // Uplate bez veze sa pregledom: prikazuju se kao „primljeno, nepovezano" — nikad kao smanjenje obračuna.
  const unlinked = clientPayments.filter((p) => {
    if (p.voided_at || p.billing_summary_id) return false;
    if (!inRange(p.payment_date, from, to)) return false;
    if (clientIds && !clientIds.includes(p.client_id)) return false;
    if (projectIds && !projectIds.includes(p.project_id)) return false;
    return true;
  });

  return {
    notAttributable: false,
    rows: own.map(row),
    clientWide: clientWide.map(row),
    totals: billingTotals(own, clientPayments, { today }),
    clientWideTotals: billingTotals(clientWide, clientPayments, { today }),
    unlinkedReceived: sumByCurrency(unlinked, { amountOf: (p) => p.amount, currencyOf: (p) => p.currency }),
    unlinkedCount: unlinked.length,
    unbilled,
  };
}

/**
 * Payroll obaveze (payables) i stvarne isplate (payments) za obuhvat izveštaja.
 * Obaveza pripada primaocu (radnik ili vendor), ne projektu: kod filtera po projektu/klijentu/radniku ulaze obaveze
 * koje imaju bar jednu liniju u obuhvatu; `scopeShare` je zbir tih linija po valuti, a `totals` (plaćeno, ostatak)
 * su iznosi CELIH obaveza — `spansOtherScope` kaže da obaveza obuhvata i rad van filtera (isplata se ne deli).
 */
export function payablesSection(data, { from = null, to = null, filters = {}, projects = [], today = null } = {}) {
  if (!data) return null;
  if (filters.projectRoleId) return { notAttributable: true, rows: [], totals: {}, scopeShare: null, spansOtherScope: false };
  const payables = (data.payables || []).filter((p) => p && p.status !== "cancelled" && overlaps(p.period_start, p.period_end, from, to));
  const payments = (data.payments || []).filter(Boolean);
  const lines = (data.payableLines || []).filter(Boolean);
  const scoped = Boolean(filters.projectId || filters.clientId || filters.employeeId);

  let included = payables;
  let scopeShare = null;
  let spansOtherScope = false;
  if (scoped) {
    const clientOf = new Map((projects || []).map((p) => [p.id, p.client_id ?? null]));
    const match = (l) =>
      (!filters.projectId || filters.projectId.includes(l.project_id))
      && (!filters.clientId || filters.clientId.includes(clientOf.get(l.project_id) ?? null))
      && (!filters.employeeId || filters.employeeId.includes(l.employee_id));
    const ids = new Set(payables.map((p) => p.id));
    const own = lines.filter((l) => ids.has(l.payable_id));
    const hit = own.filter(match);
    const hitIds = new Set(hit.map((l) => l.payable_id));
    included = payables.filter((p) => hitIds.has(p.id));
    spansOtherScope = own.some((l) => hitIds.has(l.payable_id) && !match(l));
    scopeShare = sumByCurrency(hit, { amountOf: (l) => l.amount, currencyOf: (l) => l.currency });
  }
  return {
    notAttributable: false,
    rows: included.map((p) => ({ payable: p, balance: payableBalance(p, payments, { today }) })),
    totals: payablesTotals(included, payments, { today }),
    scopeShare,
    spansOtherScope,
  };
}

// ───────────────────────── izveštaj ─────────────────────────

/** Status kursa troškova (T28): ne-EUR trošak bez datuma kursa ili bez kursa — po valuti, odvojeno od zbira u EUR. */
function costRateIssues(costs) {
  const withoutRateDate = [];
  const missingRate = [];
  for (const c of costs) {
    const r = costEurAmount(c);
    if (r.reason === "rate_without_date") withoutRateDate.push(c);
    else if (r.reason === "missing_rate") missingRate.push(c);
  }
  const by = (list) => sumByCurrency(list, { amountOf: (c) => c.amount, currencyOf: (c) => c.currency });
  return { withoutRateDate: by(withoutRateDate), withoutRateDateCount: withoutRateDate.length, missingRate: by(missingRate), missingRateCount: missingRate.length };
}

/**
 * Financial Report (centralni ili projekta).
 * @param {object} input
 * @param {object[]} input.timesheets  satnice (samo odobrene ulaze u obračun; submitted je odvojena procena)
 * @param {object[]} [input.costs]     project_costs
 * @param {object[]} [input.projects]  za klijenta linije/troška (po ID-u)
 * @param {object[]} [input.assignments] za Job Role linije
 * @param {object[]} [input.categories] cost_categories (naziv kategorije)
 * @param {object[]|null} [input.exchangeRates] kursevi; niz = korisnik je izabrao konverziju u `convertTo`
 * @param {{from?:string,to?:string}} [input.range]
 * @param {object} [input.filters] { projectId, clientId, employeeId, projectRoleId, costCategoryId }
 * @param {{summaries, clientPayments}|null} [input.billing]   null = nema tabele ili prava
 * @param {{payables, payableLines, payments}|null} [input.payables]
 * @returns {{summary, breakdown, costs, billing, payables, filters}}
 */
export function financialReport({
  timesheets = [],
  costs = [],
  projects = [],
  assignments = [],
  categories = [],
  exchangeRates = null,
  convertTo = "EUR",
  rateDate = null,
  range = {},
  filters = {},
  billing = null,
  payables = null,
  today = null,
  dayLinesOf,
} = {}) {
  const f = normalizeFilters(filters);
  const from = dateOnly(range?.from);
  const to = dateOnly(range?.to);
  const uniq = uniqueCosts(costs); // isti trošak stigao dvaput se broji jednom (T13/T14)

  const summary = financialSummary({ timesheets, costs: uniq, range: { from, to }, filters: f, projects, assignments, exchangeRates, convertTo, rateDate, dayLinesOf });
  // Iste linije kao u summary-ju (ista funkcija, isti ulaz) — za razradu po dimenzijama.
  const { lines } = laborDayLines(timesheets, { from, to, filters: f, projects, assignments, dayLinesOf });
  const additional = filterAdditionalCosts(uniq, { from, to, filters: f, projects });

  const byProjectCosts = new Map();
  for (const c of additional.costs) byProjectCosts.set(c.project_id ?? null, [...(byProjectCosts.get(c.project_id ?? null) || []), c]);
  const projectRows = aggregateLabor(lines, "project").map((r) => ({ ...r, additionalCosts: sumByCurrency(byProjectCosts.get(r.key) || []) }));
  // Projekat sa troškom a bez odobrenih sati u periodu ima svoj red (trošak se ne gubi iz razrade).
  for (const [projectId, list] of byProjectCosts) {
    if (!projectRows.some((r) => r.key === projectId)) {
      projectRows.push({ key: projectId, hours: 0, revenue: {}, cost: {}, missingRevenueRate: 0, missingCostRate: 0, additionalCosts: sumByCurrency(list) });
    }
  }

  return {
    filters: f,
    range: { from, to },
    summary,
    breakdown: {
      project: projectRows,
      client: aggregateLabor(lines, "client"),
      employee: aggregateLabor(lines, "employee"),
      role: aggregateLabor(lines, "role"),
    },
    costs: {
      count: additional.costs.length,
      notAttributable: additional.notAttributable,
      byCurrency: sumByCurrency(additional.costs),
      byCategory: costsByCategory(additional.costs, categories),
      ...costRateIssues(additional.costs),
    },
    billing: billingSection(billing, { from, to, filters: f, projects, lines, today }),
    payables: payablesSection(payables, { from, to, filters: f, projects, today }),
  };
}

/** Financial Report jednog projekta: isti izveštaj sa filterom `projectId` (po ID-u — preimenovanje ne menja ništa, T25). */
export function projectFinancialReport({ projectId, filters = {}, ...rest } = {}) {
  return financialReport({ ...rest, filters: { ...filters, projectId } });
}

/** Valute koje izveštaj ima u bilo kojoj sekciji obračuna (za kolone po valuti). */
export function reportCurrencies(report) {
  const s = report?.summary;
  return sortCurrencies([...(s?.currencies || []), ...Object.keys(s?.pendingEstimate?.laborRevenue || {}), ...Object.keys(s?.pendingEstimate?.payrollCost || {})].map(normalizeCurrency));
}

// ───────────────────────── izvoz (CSV/PDF), T26 ─────────────────────────

/**
 * Redovi izvoza u „dugom" obliku: { section, item, metric, currency, value }. Vrednost za koju korisnik nema pravo se
 * NE pojavljuje (ni kao prazno polje) — isti `reportVisibility` kao na ekranu. Ništa se ne sabira kroz valute;
 * konverzija je poseban odeljak uz kurs i datum.
 * @param {object} report rezultat financialReport
 * @param {*} perms Set/niz prava ili funkcija can()
 * @param {{names?: {project?:Map, client?:Map, employee?:Map, role?:Map, category?:Map}}} [opts] imena po ID-u (samo prikaz)
 */
export function financialReportExportRows(report, perms, { names = {} } = {}) {
  const v = reportVisibility(perms);
  const rows = [];
  const push = (section, item, metric, currency, value) => {
    if (value === null || value === undefined) return;
    rows.push({ section, item: item ?? "", metric, currency: currency ?? "", value });
  };
  const s = report.summary;

  push("summary", "", "approvedHours", "", s.approvedHours);
  for (const cur of Object.keys(s.byCurrency)) {
    const k = s.byCurrency[cur];
    for (const m of ["laborRevenue", "payrollCost", "laborMargin", "additionalCosts", "netProfit", "profitMargin"]) {
      if (v[m]) push("summary", "", m, cur, k[m]);
    }
  }
  if (s.pendingEstimate?.hours) {
    push("estimate", "", "pendingHours", "", s.pendingEstimate.hours);
    if (v.laborRevenue) for (const [cur, x] of Object.entries(s.pendingEstimate.laborRevenue)) push("estimate", "", "laborRevenue", cur, x);
    if (v.payrollCost) for (const [cur, x] of Object.entries(s.pendingEstimate.payrollCost)) push("estimate", "", "payrollCost", cur, x);
  }
  if (s.converted) {
    const c = s.converted;
    for (const m of ["laborRevenue", "payrollCost", "laborMargin", "additionalCosts", "netProfit", "profitMargin"]) {
      if (v[m]) push("converted", `${c.to} @ ${c.date || ""}`, m, c.to, c[m]);
    }
    for (const u of c.used) push("converted", `${u.currency} ${u.rateDate || ""}`.trim(), "unitsPerEur", u.currency, u.unitsPerEur);
    for (const cur of c.missing) push("converted", cur, "missingRate", cur, cur);
  }

  const dims = [["project", "project"], ["client", "client"], ["employee", "employee"], ["role", "role"]];
  for (const [dim, nameKey] of dims) {
    for (const r of report.breakdown[dim] || []) {
      const item = names[nameKey]?.get(r.key) ?? r.key ?? "";
      push(dim, item, "approvedHours", "", r.hours);
      if (v.laborRevenue) for (const [cur, x] of Object.entries(r.revenue)) push(dim, item, "laborRevenue", cur, x);
      if (v.payrollCost) for (const [cur, x] of Object.entries(r.cost)) push(dim, item, "payrollCost", cur, x);
      if (v.additionalCosts && r.additionalCosts) for (const [cur, x] of Object.entries(r.additionalCosts)) push(dim, item, "additionalCosts", cur, x);
    }
  }

  if (v.additionalCosts) {
    for (const c of report.costs.byCategory) {
      const item = c.name ?? names.category?.get(c.key) ?? c.key;
      for (const [cur, x] of Object.entries(c.byCurrency)) push("costs", item, "additionalCosts", cur, x);
    }
    for (const [cur, x] of Object.entries(report.costs.withoutRateDate)) push("costs", "", "rateWithoutDate", cur, x);
    for (const [cur, x] of Object.entries(report.costs.missingRate)) push("costs", "", "missingRate", cur, x);
  }

  if (v.billing && report.billing && !report.billing.notAttributable) {
    for (const [cur, t] of Object.entries(report.billing.totals)) {
      for (const m of ["calculated", "invoiced", "received", "outstanding", "estimatedUnpaid", "overdue"]) push("billing", "", m, cur, t[m]);
    }
    for (const [cur, x] of Object.entries(report.billing.unlinkedReceived)) push("billing", "", "receivedUnlinked", cur, x);
    if (v.laborRevenue) for (const [cur, x] of Object.entries(report.billing.unbilled.revenue)) push("billing", "", "unbilledRevenue", cur, x);
  }
  if (v.payables && report.payables && !report.payables.notAttributable) {
    for (const [cur, t] of Object.entries(report.payables.totals)) {
      for (const m of ["calculated", "confirmed", "paid", "remaining", "overdue"]) push("payables", "", m, cur, t[m]);
    }
    for (const [cur, x] of Object.entries(report.payables.scopeShare || {})) push("payables", "", "scopeShare", cur, x);
  }
  return rows;
}
