// Client Billing Overview — stanje internog obračuna i uplata klijenta (spec §9, data model §2.9, T16, T17).
// Čiste funkcije, ništa se ne čita iz baze. Teamora NE izdaje fakture: ovde nema broja fakture ni stavki računa (T29).
//
//   calculated      — interni B2B obračun (Approved Hours × B2B × Client Coef), zamrznut van `in_preparation`;
//   invoiced        — ručno evidentiran iznos eksterne fakture (ext_invoice_amount) ili null;
//   received        — zbir ne-storniranih uplata klijenta vezanih za pregled;
//   outstanding     — invoiced − received, SAMO kad je invoiced evidentiran (inače null);
//   estimatedUnpaid — calculated − received, SAMO kad invoiced NIJE evidentiran (procena, ne potraživanje).

import { round2 } from "../payroll/money.js";
import { normalizeCurrency, sortCurrencies } from "./currency.js";
import { SIDES, sideAmount, sumHours } from "./laborLines.js";
import { paymentStatus } from "./payables.js";

export const BILLING_STATUS = Object.freeze({
  IN_PREPARATION: "in_preparation",
  READY_FOR_ACCOUNTING: "ready_for_accounting",
  SENT_TO_ACCOUNTING: "sent_to_accounting",
  INVOICED_EXTERNALLY: "invoiced_externally",
});
export const BILLING_STATUS_ORDER = Object.freeze(Object.values(BILLING_STATUS));

const cents = (v) => Math.round(round2(Number(v) || 0) * 100);
const fromCents = (c) => (c === 0 ? 0 : c / 100);
const has = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);

/** Valuta pregleda za uplate: valuta eksterne fakture kad postoji, inače valuta obračuna. */
export const billingCurrency = (summary) => normalizeCurrency(summary?.ext_invoice_currency || summary?.currency);

/** Uplate klijenta koje važe za pregled: vezane (`billing_summary_id`) i ne-stornirane. */
export function activeClientPayments(summary, clientPayments = []) {
  return (clientPayments || []).filter((p) => p && !p.voided_at && (!summary?.id || p.billing_summary_id === summary.id));
}

/**
 * Stanje jednog Billing Summary-ja.
 * @param {object} summary red `billing_summaries`
 * @param {object[]} clientPayments redovi `client_payments`
 * @param {{calculatedAmount?: number, today?: string}} opts calculatedAmount — živi obračun za `in_preparation`
 *   (kad zamrznut `calculated_amount` još ne postoji); today za `overdue`
 * @returns {{calculated:number|null, invoiced:number|null, received:number, outstanding:number|null,
 *   estimatedUnpaid:number|null, status, currency, overdue:boolean, paymentCount:number}}
 */
export function billingBalance(summary, clientPayments = [], { calculatedAmount = null, today = null } = {}) {
  const calculated = has(summary?.calculated_amount) ? round2(summary.calculated_amount) : has(calculatedAmount) ? round2(calculatedAmount) : null;
  const invoiced = has(summary?.ext_invoice_amount) ? round2(summary.ext_invoice_amount) : null;
  const list = activeClientPayments(summary, clientPayments);
  const receivedCents = list.reduce((acc, p) => acc + cents(p.amount), 0);
  const received = fromCents(receivedCents);
  const outstanding = invoiced === null ? null : fromCents(cents(invoiced) - receivedCents);
  const estimatedUnpaid = invoiced === null && calculated !== null ? fromCents(cents(calculated) - receivedCents) : null;
  const base = invoiced ?? calculated ?? 0;
  const due = dateOnly(summary?.ext_due_date);
  return {
    calculated,
    invoiced,
    received,
    outstanding,
    estimatedUnpaid,
    status: paymentStatus(base, received),
    currency: billingCurrency(summary),
    overdue: Boolean(today && due && outstanding !== null && due < dateOnly(today) && outstanding > 0),
    paymentCount: list.length,
  };
}

/** Da li pregled pokriva liniju: isti klijent, projekat (null = svi projekti klijenta), valuta prihoda i datum u periodu. */
export function summaryCoversLine(summary, line) {
  if (!summary || summary.client_id !== line.clientId) return false;
  if (summary.project_id && summary.project_id !== line.projectId) return false;
  const d = line.date;
  if (!d || d < dateOnly(summary.period_start) || d > dateOnly(summary.period_end)) return false;
  return normalizeCurrency(summary.currency) === normalizeCurrency(line.clientCurrency);
}

/**
 * Prihod odobrenih sati koji nije ni u jednom Billing Summary-ju (bilo kog statusa).
 * Linije moraju imati `clientId` (laborDayLines sa `projects`). Iznos po pravilu zaokruživanja iz laborLines.js.
 * @returns {{hours:number, revenue:Record<string, number>, lineCount:number, missingRate:number, withoutClient:number}}
 *   withoutClient — linije projekta bez klijenta (ne mogu se obračunati; prikazuju se kao upozorenje).
 */
export function unbilledRevenue(laborLines = [], summaries = []) {
  const active = (summaries || []).filter(Boolean);
  const open = [];
  let withoutClient = 0;
  for (const line of laborLines || []) {
    if (!line.clientId) {
      withoutClient += 1;
      continue;
    }
    if (!active.some((s) => summaryCoversLine(s, line))) open.push(line);
  }
  const rev = sideAmount(open, SIDES.REVENUE);
  return { hours: sumHours(open), revenue: rev.byCurrency, lineCount: open.length, missingRate: rev.missing.length, withoutClient };
}

/**
 * Zbir stanja više pregleda po valuti (Dashboard „Client Unpaid", Financial Report).
 * outstanding se sabira samo za preglede sa evidentiranim eksternim iznosom, estimatedUnpaid samo za ostale.
 */
export function billingTotals(summaries = [], clientPayments = [], { today = null } = {}) {
  const acc = {};
  for (const s of summaries || []) {
    if (!s) continue;
    const b = billingBalance(s, clientPayments, { today });
    const t = (acc[b.currency] ||= { count: 0, calculated: 0, invoiced: 0, received: 0, outstanding: 0, estimatedUnpaid: 0, overdue: 0 });
    t.count += 1;
    if (b.calculated !== null) t.calculated += cents(b.calculated);
    if (b.invoiced !== null) t.invoiced += cents(b.invoiced);
    t.received += cents(b.received);
    if (b.outstanding !== null) t.outstanding += cents(b.outstanding);
    if (b.estimatedUnpaid !== null) t.estimatedUnpaid += cents(b.estimatedUnpaid);
    if (b.overdue) t.overdue += cents(b.outstanding);
  }
  const out = {};
  for (const cur of sortCurrencies(Object.keys(acc))) {
    const t = acc[cur];
    out[cur] = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, k === "count" ? v : fromCents(v)]));
  }
  return out;
}
