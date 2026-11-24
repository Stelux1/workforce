// Client Billing Overview (spec §9, data model §2.9, W2-F) — čiste funkcije za ekran i izvoz obračuna.
// Teamora NE izdaje fakture (T29): ovde nema broja fakture ni stavki računa, samo interni obračun
// (Approved Hours × B2B × Client Coef) i operativni pregled uplata.
//
// Formule su iz src/lib/finance (T-E): laborDayLines → linije, aggregateLabor/sideAmount → pravilo zaokruživanja
// (grupa = projekat, radnik, vrsta sati, tarifa, koeficijent, valuta), billingBalance → stanje uplata.
// Ekran i izvoz koriste ISTE redove iz `summaryCalculation`, pa je zbir ekrana uvek jednak zbiru izvoza.
// Billable troškovi su uvek odvojeni od B2B obračuna i ne uvećavaju calculated (T15).

import { aggregateLabor } from "./finance/laborLines.js";
import { BILLING_STATUS, BILLING_STATUS_ORDER, billingBalance, summaryCoversLine, unbilledRevenue } from "./finance/billing.js";
import { normalizeCurrency, sortCurrencies, sumByCurrency } from "./finance/currency.js";

const cents = (v) => Math.round((Number(v) || 0) * 100);
const fromCents = (c) => (c === 0 ? 0 : c / 100);
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
const safeCurrency = (c) => {
  try {
    return normalizeCurrency(c);
  } catch {
    return String(c || "").toUpperCase() || null;
  }
};

/** Da li je obračun još u pripremi (iznos se računa živo iz odobrenih sati). */
export const isPreparation = (summary) => !summary || summary.status === BILLING_STATUS.IN_PREPARATION;

/** Sledeći status (jedan korak napred) ili null. */
export function nextBillingStatus(status) {
  const i = BILLING_STATUS_ORDER.indexOf(status);
  return i >= 0 && i < BILLING_STATUS_ORDER.length - 1 ? BILLING_STATUS_ORDER[i + 1] : null;
}

/** Vraćanje u pripremu: samo iz Ready for Accounting i samo dok nema eksternog računa (isto pravilo kao baza). */
export function canReturnToPreparation(summary) {
  return summary?.status === BILLING_STATUS.READY_FOR_ACCOUNTING && !hasExternalInvoice(summary);
}

export const hasExternalInvoice = (summary) =>
  [summary?.ext_invoice_reference, summary?.ext_invoice_date, summary?.ext_invoice_amount, summary?.ext_due_date]
    .some((v) => v !== null && v !== undefined && v !== "");

/**
 * Redovi obračuna iz dnevnih linija: jedan red po grupi pravila zaokruživanja (prihodna strana).
 * Iznos reda = aggregateLabor (round2(Σh × B2B × client coef)); red bez tarife ima amount null i missingRate.
 * @returns {Array<{key, projectId, employeeId, projectRoleId, hourType, hours, clientRate, clientCoef, amount, currency, missingRate}>}
 */
export function summaryRowsFromLines(lines = []) {
  const groups = new Map();
  for (const l of lines || []) {
    if (!(Number(l?.hours) > 0)) continue;
    const currency = safeCurrency(l.clientCurrency);
    const parts = [l.projectId ?? null, l.employeeId ?? null, l.hourType ?? null, num(l.clientRate), num(l.clientCoef), currency];
    const key = JSON.stringify(parts);
    const g = groups.get(key) || { key, parts, lines: [] };
    g.lines.push(l);
    groups.set(key, g);
  }
  const rows = [...groups.values()].map((g) => {
    const [projectId, employeeId, hourType, clientRate, clientCoef, currency] = g.parts;
    const [agg] = aggregateLabor(g.lines, null);
    const roles = [...new Set(g.lines.map((l) => l.projectRoleId ?? null))];
    const missingRate = clientRate === null || clientCoef === null;
    return {
      key: g.key,
      projectId,
      employeeId,
      projectRoleId: roles.length === 1 ? roles[0] : null,
      hourType,
      hours: agg.hours,
      clientRate,
      clientCoef,
      amount: missingRate ? null : agg.revenue[currency] ?? 0,
      currency,
      missingRate,
    };
  });
  return sortRows(rows);
}

/** Redovi zamrznutog obračuna (billing_summary_lines) u istom obliku. */
export function summaryRowsFromDb(dbLines = [], summaryId) {
  const rows = (dbLines || [])
    .filter((l) => l && (!summaryId || l.summary_id === summaryId))
    .map((l) => ({
      key: l.id,
      projectId: l.project_id ?? null,
      employeeId: l.employee_id ?? null,
      projectRoleId: l.project_role_id ?? null,
      hourType: l.hour_type ?? null,
      hours: Number(l.hours) || 0,
      clientRate: num(l.client_rate),
      clientCoef: num(l.client_coef),
      amount: num(l.amount),
      currency: safeCurrency(l.currency),
      missingRate: false,
    }));
  return sortRows(rows);
}

function sortRows(rows) {
  const s = (v) => (v === null || v === undefined ? "" : String(v));
  return rows.sort((a, b) => s(a.projectId).localeCompare(s(b.projectId)) || s(a.employeeId).localeCompare(s(b.employeeId))
    || s(a.hourType).localeCompare(s(b.hourType)) || (a.clientRate ?? 0) - (b.clientRate ?? 0));
}

/** Zbir redova: sati i iznos po valuti (u centima, bez float greške); redovi bez tarife se broje u missingRate. */
export function rowsTotals(rows = []) {
  let hours = 0;
  let missingRate = 0;
  const acc = {};
  for (const r of rows || []) {
    hours += cents(r.hours);
    if (r.amount === null || r.amount === undefined) {
      missingRate += 1;
      continue;
    }
    acc[r.currency] = (acc[r.currency] || 0) + cents(r.amount);
  }
  const byCurrency = {};
  for (const cur of sortCurrencies(Object.keys(acc))) byCurrency[cur] = fromCents(acc[cur]);
  return { hours: fromCents(hours), byCurrency, missingRate, rowCount: (rows || []).length };
}

const BREAKDOWN_FIELD = { employee: "employeeId", role: "projectRoleId", project: "projectId", hourType: "hourType" };

/**
 * Razrada obračuna po radniku / ulozi / projektu / vrsti sati. Redovi su grupe zaokruživanja, pa je zbir razrade
 * tačno zbir obračuna (nema odstupanja za cent).
 * @returns {Array<{key, hours, amount: Record<string, number>}>}
 */
export function breakdownRows(rows = [], dim = "employee") {
  const field = BREAKDOWN_FIELD[dim];
  if (!field) throw new Error(`Nepoznata dimenzija razrade: ${dim}`);
  const buckets = new Map();
  for (const r of rows || []) {
    const key = r[field] ?? null;
    const b = buckets.get(key) || { key, hours: 0, amount: {} };
    b.hours += cents(r.hours);
    if (r.amount !== null && r.amount !== undefined) b.amount[r.currency] = (b.amount[r.currency] || 0) + cents(r.amount);
    buckets.set(key, b);
  }
  return [...buckets.values()].map((b) => ({
    key: b.key,
    hours: fromCents(b.hours),
    amount: Object.fromEntries(sortCurrencies(Object.keys(b.amount)).map((c) => [c, fromCents(b.amount[c])])),
  }));
}

/**
 * Obračun jednog Billing Summary-ja: u pripremi živo iz odobrenih linija, van pripreme iz zamrznutih linija baze.
 * Za zamrznut obračun vraća i `live` (današnji obračun istih sati) da ekran upozori kad se satnice promene.
 * @param {object} summary red billing_summaries
 * @param {{laborLines?: object[], dbLines?: object[]}} data laborLines iz laborDayLines (sa clientId)
 */
export function summaryCalculation(summary, { laborLines = [], dbLines = [] } = {}) {
  const covered = (laborLines || []).filter((l) => summaryCoversLine(summary, l));
  const liveRows = summaryRowsFromLines(covered);
  const liveTotals = rowsTotals(liveRows);
  const currency = safeCurrency(summary?.currency);
  if (isPreparation(summary)) {
    return { frozen: false, rows: liveRows, totals: liveTotals, currency, amount: liveTotals.byCurrency[currency] ?? 0, live: null };
  }
  const rows = summaryRowsFromDb(dbLines, summary?.id);
  const totals = rowsTotals(rows);
  const amount = num(summary?.calculated_amount) ?? totals.byCurrency[currency] ?? 0;
  const liveAmount = liveTotals.byCurrency[currency] ?? 0;
  return {
    frozen: true,
    rows,
    totals,
    currency,
    amount,
    live: { amount: liveAmount, hours: liveTotals.hours, differs: cents(liveAmount) !== cents(amount) || cents(liveTotals.hours) !== cents(totals.hours) },
  };
}

/** Stanje uplata pregleda (billingBalance), sa živim obračunom dok je u pripremi. */
export function summaryBalance(summary, clientPayments, calc, today) {
  return billingBalance(summary, clientPayments, { calculatedAmount: calc ? calc.amount : null, today });
}

// ───────────────────────── billable troškovi (T15) ─────────────────────────

function projectIndex(projects) {
  const m = new Map();
  for (const p of projects || []) if (p?.id) m.set(p.id, p);
  return m;
}

/** Troškovi vezani za pregled (billing_summary_costs → project_costs). */
export function linkedCosts(summary, links = [], costs = []) {
  const ids = new Set((links || []).filter((l) => l.summary_id === summary?.id).map((l) => l.project_cost_id));
  return (costs || []).filter((c) => ids.has(c.id));
}

/**
 * Kandidati za eventualni dodatni eksterni obračun: billable troškovi u opsegu (klijent, projekat, period) koji još
 * nisu ni u jednom pregledu. Isti trošak se ne može pojaviti u dva pregleda (baza: unique).
 */
export function billableCostCandidates(costs = [], { links = [], projects = [], clientId = null, projectId = null, from = null, to = null } = {}) {
  const linked = new Set((links || []).map((l) => l.project_cost_id));
  const byId = projectIndex(projects);
  const f = dateOnly(from);
  const t = dateOnly(to);
  return (costs || []).filter((c) => {
    if (!c?.billable || linked.has(c.id)) return false;
    const d = dateOnly(c.cost_date);
    if ((f && (!d || d < f)) || (t && (!d || d > t))) return false;
    if (projectId && c.project_id !== projectId) return false;
    if (clientId && byId.get(c.project_id)?.client_id !== clientId) return false;
    return true;
  });
}

/** Zbir troškova po valuti (nikad jedan broj iz više valuta, T28). */
export const costTotals = (costs = []) => sumByCurrency(costs, { amountOf: (c) => c?.amount, currencyOf: (c) => c?.currency });

// ───────────────────────── pregled po klijentu / projektu ─────────────────────────

/**
 * Obračun po klijentu i projektu za period: sati, B2B prihod po valuti i deo koji nije ni u jednom pregledu.
 * @returns {Array<{clientId, projectId, hours, revenue, unbilled, unbilledHours, missingRate}>}
 */
export function overviewByProject(laborLines = [], summaries = []) {
  const withClient = (laborLines || []).filter((l) => l.clientId);
  return aggregateLabor(withClient, ["client", "project"]).map((row) => {
    const [clientId, projectId] = row.key;
    const lines = withClient.filter((l) => l.clientId === clientId && l.projectId === projectId);
    const open = unbilledRevenue(lines, summaries);
    return {
      clientId,
      projectId,
      hours: row.hours,
      revenue: row.revenue,
      unbilled: open.revenue,
      unbilledHours: open.hours,
      missingRate: row.missingRevenueRate,
    };
  });
}

/** Da li bi nov pregled preklopio postojeći (isti klijent i valuta, preklopljen period, ceo klijent ↔ projekat). */
export function findOverlap(draft, summaries = []) {
  const s0 = dateOnly(draft?.period_start);
  const e0 = dateOnly(draft?.period_end);
  if (!draft?.client_id || !s0 || !e0) return null;
  const cur = safeCurrency(draft.currency);
  return (summaries || []).find((s) => s && s.id !== draft.id && s.client_id === draft.client_id
    && safeCurrency(s.currency) === cur
    && dateOnly(s.period_start) <= e0 && dateOnly(s.period_end) >= s0
    && (!s.project_id || !draft.project_id || s.project_id === draft.project_id)) || null;
}

// ───────────────────────── izvoz (isti redovi kao ekran) ─────────────────────────

/**
 * Podaci za izvoz obračuna (CSV / Excel / PDF). Redovi i zbir su ISTI kao na ekranu (summaryCalculation), billable
 * troškovi su posebna tabela sa svojim zbirom i ne ulaze u obračun (T15).
 * @param {object} lookup { clientName(id), projectName(id), employeeName(id), roleName(id), hourTypeName(code) }
 */
export function billingExportData(summary, calc, { costs = [], balance = null, lookup = {} } = {}) {
  const name = (fn, id) => (fn && id ? fn(id) : "") || "";
  const rows = (calc?.rows || []).map((r) => ({
    project: name(lookup.projectName, r.projectId),
    employee: name(lookup.employeeName, r.employeeId),
    role: name(lookup.roleName, r.projectRoleId),
    hourType: name(lookup.hourTypeName, r.hourType) || r.hourType || "",
    hours: r.hours,
    rate: r.clientRate,
    coef: r.clientCoef,
    amount: r.amount,
    currency: r.currency,
  }));
  const totals = rowsTotals(calc?.rows || []);
  const costRows = (costs || []).map((c) => ({
    date: dateOnly(c.cost_date),
    project: name(lookup.projectName, c.project_id),
    category: [c.category, c.subcategory].filter(Boolean).join(" / "),
    description: c.description || c.notes || "",
    amount: num(c.amount),
    currency: safeCurrency(c.currency),
  }));
  return {
    header: {
      client: name(lookup.clientName, summary?.client_id),
      project: summary?.project_id ? name(lookup.projectName, summary.project_id) : null,
      periodStart: dateOnly(summary?.period_start),
      periodEnd: dateOnly(summary?.period_end),
      currency: safeCurrency(summary?.currency),
      status: summary?.status || null,
      frozen: Boolean(calc?.frozen),
      calculatedAt: summary?.calculated_at || null,
      extInvoiceReference: summary?.ext_invoice_reference || null,
      extInvoiceDate: dateOnly(summary?.ext_invoice_date),
      extInvoiceAmount: num(summary?.ext_invoice_amount),
      extInvoiceCurrency: summary?.ext_invoice_currency || null,
      extDueDate: dateOnly(summary?.ext_due_date),
    },
    rows,
    totals,
    costs: costRows,
    costTotals: costTotals(costs),
    balance,
  };
}
