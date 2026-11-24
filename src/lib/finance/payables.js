// Payroll obaveze i isplate (spec §7, data model §2.8, T11, T17). Čiste funkcije, ništa se ne čita iz baze.
//
// Obračunata obaveza (Calculated/Payable) i stvarni odliv novca (Payment) su ODVOJENI brojevi:
//   Remaining Balance = ukupan iznos obaveze (calculated + adjustments) − zbir vezanih ne-storniranih uplata.
// Status: unpaid (paid = 0), partially_paid (0 < paid < total), paid (paid ≥ total).
// Iznos same obaveze računa baza (generate_payables, pravilo zaokruživanja iz laborLines.js); ovde se samo čita.
// Pravila uplate su ista kao u bazi (guard_payment): ista valuta, obaveza `confirmed`, bez preplate.

import { round2 } from "../payroll/money.js";
import { normalizeCurrency, sortCurrencies } from "./currency.js";

export const PAYMENT_STATUS = Object.freeze({ UNPAID: "unpaid", PARTIALLY_PAID: "partially_paid", PAID: "paid" });
export const PAYABLE_STATUS = Object.freeze({ DRAFT: "draft", CONFIRMED: "confirmed", CANCELLED: "cancelled" });

const cents = (v) => Math.round(round2(Number(v) || 0) * 100);
const fromCents = (c) => (c === 0 ? 0 : c / 100);
const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);

/** Ukupan iznos obaveze: total_amount (generisana kolona) ili calculated + adjustments. */
export function payableTotal(payable) {
  if (payable?.total_amount !== null && payable?.total_amount !== undefined && payable?.total_amount !== "") {
    return round2(payable.total_amount);
  }
  return fromCents(cents(payable?.calculated_amount) + cents(payable?.adjustments_amount));
}

/** Status isplate iz ukupnog i plaćenog iznosa. */
export function paymentStatus(total, paid) {
  const p = cents(paid);
  if (p <= 0) return PAYMENT_STATUS.UNPAID;
  return p >= cents(total) ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.PARTIALLY_PAID;
}

/** Uplate koje važe za obavezu: vezane za nju (`payable_id`) i ne-stornirane. */
export function activePayments(payable, payments = []) {
  return (payments || []).filter((p) => p && !p.voided_at && (!payable?.id || p.payable_id === payable.id));
}

/**
 * Stanje jedne obaveze.
 * @param {object} payable red `payables`
 * @param {object[]} payments redovi `payments` (mogu biti i tuđi — filtrira se po payable_id; stornirane se ne broje)
 * @param {{today?: string}} opts today (YYYY-MM-DD) za `overdue`
 * @returns {{total, paid, remaining, status, currency, overdue, paymentCount}}
 */
export function payableBalance(payable, payments = [], { today = null } = {}) {
  const total = payableTotal(payable);
  const list = activePayments(payable, payments);
  const paidCents = list.reduce((acc, p) => acc + cents(p.amount), 0);
  const remaining = fromCents(cents(total) - paidCents);
  const due = dateOnly(payable?.due_date);
  return {
    total,
    paid: fromCents(paidCents),
    remaining,
    status: paymentStatus(total, fromCents(paidCents)),
    currency: normalizeCurrency(payable?.currency),
    overdue: Boolean(today && due && due < dateOnly(today) && remaining > 0),
    paymentCount: list.length,
  };
}

/**
 * Zbir obaveza po valuti (otkazane se ne broje). Ulaz: redovi `payables` + sve uplate (ili redovi view-a
 * `payable_balances` spojeni u payable kao `paid_amount`).
 * - calculated: zbir ukupnih iznosa svih ne-otkazanih obaveza (i nacrta);
 * - confirmed:  zbir ukupnih iznosa potvrđenih obaveza;
 * - paid:       zbir ne-storniranih uplata;
 * - remaining:  confirmed − paid (Payroll Due — samo potvrđeno; nacrt nije dug);
 * - overdue:    remaining obaveza kojima je prošao rok.
 * @returns {Record<string, {count, calculated, confirmed, paid, remaining, overdue, draftCount}>}
 */
export function payablesTotals(payables = [], payments = [], { today = null } = {}) {
  const acc = {};
  for (const payable of payables || []) {
    if (!payable || payable.status === PAYABLE_STATUS.CANCELLED) continue;
    const cur = normalizeCurrency(payable.currency);
    const t = (acc[cur] ||= { count: 0, draftCount: 0, calculated: 0, confirmed: 0, paid: 0, remaining: 0, overdue: 0 });
    const hasView = payable.paid_amount !== undefined && payable.paid_amount !== null;
    const b = payableBalance(payable, hasView ? [] : payments, { today });
    const paid = hasView ? round2(payable.paid_amount) : b.paid;
    const remaining = hasView ? fromCents(cents(b.total) - cents(paid)) : b.remaining;
    t.count += 1;
    t.calculated += cents(b.total);
    if (payable.status === PAYABLE_STATUS.CONFIRMED) {
      t.confirmed += cents(b.total);
      t.paid += cents(paid);
      t.remaining += cents(remaining);
      const due = dateOnly(payable.due_date);
      if (today && due && due < dateOnly(today) && remaining > 0) t.overdue += cents(remaining);
    } else {
      t.draftCount += 1;
    }
  }
  const out = {};
  for (const cur of sortCurrencies(Object.keys(acc))) {
    const t = acc[cur];
    out[cur] = {
      count: t.count,
      draftCount: t.draftCount,
      calculated: fromCents(t.calculated),
      confirmed: fromCents(t.confirmed),
      paid: fromCents(t.paid),
      remaining: fromCents(t.remaining),
      overdue: fromCents(t.overdue),
    };
  }
  return out;
}

/**
 * Da li se uplata može evidentirati (isto kao guard_payment u bazi — UI proverava pre slanja, baza odlučuje).
 * @param {{remaining, currency}} balance rezultat payableBalance
 * @param {number|string} amount iznos uplate
 * @param {{currency?: string, payableStatus?: string}} opts valuta uplate i status obaveze, kad su poznati
 * @returns {{ok: boolean, reason: null|'invalid_amount'|'currency_mismatch'|'not_confirmed'|'overpayment', maxAmount: number}}
 */
export function canRecordPayment(balance, amount, { currency = null, payableStatus = null } = {}) {
  const maxAmount = Math.max(0, round2(balance?.remaining ?? 0));
  const n = Number(String(amount ?? "").replace(",", "."));
  if (!Number.isFinite(n) || cents(n) <= 0) return { ok: false, reason: "invalid_amount", maxAmount };
  if (payableStatus && payableStatus !== PAYABLE_STATUS.CONFIRMED) return { ok: false, reason: "not_confirmed", maxAmount };
  if (currency && balance?.currency && normalizeCurrency(currency) !== balance.currency) {
    return { ok: false, reason: "currency_mismatch", maxAmount };
  }
  if (cents(n) > cents(maxAmount)) return { ok: false, reason: "overpayment", maxAmount };
  return { ok: true, reason: null, maxAmount };
}
