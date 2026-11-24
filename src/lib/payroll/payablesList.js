// Payables (spec §7, docs/TEAMORA-DATA-MODEL.md §2.8): redovi tabele, filteri, poređenje sa srpskim neto iznosom i
// redovi za izvoz. Čiste funkcije, ništa se ne čita iz baze.
// Stanje obaveze (Calculated / Paid / Remaining / status) računa ISKLJUČIVO src/lib/finance/payables.js
// (payableBalance) — ovde se samo spaja sa nazivima i filtrira. Iznos obaveze računa baza (generate_payables).

import { can } from "../permissions.js";
import { PAYABLE_STATUS, PAYMENT_STATUS, payableBalance } from "../finance/payables.js";
import { normalizeCurrency, sortCurrencies } from "../finance/currency.js";
import { round2 } from "./money.js";

/** Prikazni status: nacrt i otkazana su stanja obaveze; potvrđena nosi status isplate. */
export const DISPLAY_STATUS = Object.freeze({
  DRAFT: "draft", CANCELLED: "cancelled",
  UNPAID: PAYMENT_STATUS.UNPAID, PARTIALLY_PAID: PAYMENT_STATUS.PARTIALLY_PAID, PAID: PAYMENT_STATUS.PAID,
});
export const DUE_FILTERS = Object.freeze(["all", "overdue", "due_soon", "not_due", "no_due_date"]);
export const DUE_SOON_DAYS = 7;

const dateOnly = (d) => (d ? String(d).slice(0, 10) : null);
const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
};
const employeeName = (e) => (e ? [e.first_name, e.last_name].filter(Boolean).join(" ").trim() || e.employee_id || null : null);

/** Prvi i poslednji dan meseca (`YYYY-MM` ili `YYYY-MM-DD`). */
export function monthRange(month) {
  const m = /^(\d{4})-(\d{2})/.exec(String(month || ""));
  if (!m) throw new Error(`Neispravan mesec: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return { from: `${m[1]}-${m[2]}-01`, to: `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}` };
}

/** Da li je period tačno jedan kalendarski mesec (tada se poredi sa mesečnim obračunom). */
export function periodMonth(payable) {
  const from = dateOnly(payable?.period_start);
  const to = dateOnly(payable?.period_end);
  if (!from || !to || from.slice(8) !== "01") return null;
  return monthRange(from).to === to ? from : null;
}

export function displayStatus(payable, balance) {
  if (payable?.status === PAYABLE_STATUS.CANCELLED) return DISPLAY_STATUS.CANCELLED;
  if (payable?.status !== PAYABLE_STATUS.CONFIRMED) return DISPLAY_STATUS.DRAFT;
  return balance.status;
}

/**
 * Red tabele po obavezi.
 * @returns {Array<{id, payable, balance, status, payeeType, payeeId, payeeName, periodStart, periodEnd, dueDate,
 *   currency, lines, laborLines, adjustmentLines, payments, employeeIds, projectIds, workerCount, hours}>}
 */
export function payableRows(payables = [], { lines = [], payments = [], employees = [], vendors = [], today = null } = {}) {
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const vendorById = new Map((vendors || []).map((v) => [v.id, v]));
  const linesBy = new Map();
  for (const l of lines || []) {
    if (!linesBy.has(l.payable_id)) linesBy.set(l.payable_id, []);
    linesBy.get(l.payable_id).push(l);
  }
  const paysBy = new Map();
  for (const p of payments || []) {
    if (!paysBy.has(p.payable_id)) paysBy.set(p.payable_id, []);
    paysBy.get(p.payable_id).push(p);
  }
  return (payables || []).filter(Boolean).map((p) => {
    const own = linesBy.get(p.id) || [];
    const pays = (paysBy.get(p.id) || []).slice().sort((a, b) =>
      String(a.payment_date).localeCompare(String(b.payment_date)) || String(a.recorded_at).localeCompare(String(b.recorded_at)));
    const balance = payableBalance(p, pays, { today });
    const labor = own.filter((l) => l.kind === "labor");
    const isVendor = p.payee_type === "vendor";
    const payeeId = isVendor ? p.vendor_id : p.employee_id;
    const employeeIds = [...new Set([...(isVendor ? [] : [p.employee_id]), ...own.map((l) => l.employee_id)].filter(Boolean))];
    return {
      id: p.id,
      payable: p,
      balance,
      status: displayStatus(p, balance),
      payeeType: p.payee_type,
      payeeId,
      payeeName: isVendor ? vendorById.get(p.vendor_id)?.name || null : employeeName(empById.get(p.employee_id)),
      periodStart: dateOnly(p.period_start),
      periodEnd: dateOnly(p.period_end),
      dueDate: dateOnly(p.due_date),
      currency: normalizeCurrency(p.currency),
      lines: own,
      laborLines: labor,
      adjustmentLines: own.filter((l) => l.kind === "adjustment"),
      payments: pays,
      employeeIds,
      projectIds: [...new Set(labor.map((l) => l.project_id).filter(Boolean))],
      workerCount: new Set(labor.map((l) => l.employee_id).filter(Boolean)).size,
      hours: round2(labor.reduce((s, l) => s + (Number(l.hours) || 0), 0)),
    };
  });
}

/** Status dospeća potvrđene obaveze sa ostatkom: overdue | due_soon | not_due | no_due_date | null (nema duga). */
export function dueState(row, today) {
  if (row.status === DISPLAY_STATUS.CANCELLED || row.status === DISPLAY_STATUS.PAID) return null;
  if (!row.dueDate) return "no_due_date";
  const t = dateOnly(today);
  if (!t) return "not_due";
  if (row.dueDate < t) return "overdue";
  if (row.dueDate <= addDays(t, DUE_SOON_DAYS)) return "due_soon";
  return "not_due";
}

/**
 * Filteri (§7): period (preklapanje), projekat, radnik, vendor, status isplate, dospelost.
 * @param {object} f {from, to, projectId, employeeId, vendorId, status, due, payeeType, search, today} — 'all'/'' = bez filtera
 */
export function filterPayableRows(rows = [], f = {}) {
  const on = (v) => v && v !== "all";
  const q = String(f.search || "").trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (f.from && r.periodEnd < f.from) return false;
    if (f.to && r.periodStart > f.to) return false;
    if (on(f.projectId) && !r.projectIds.includes(f.projectId)) return false;
    if (on(f.employeeId) && !r.employeeIds.includes(f.employeeId)) return false;
    if (on(f.vendorId) && !(r.payeeType === "vendor" && r.payeeId === f.vendorId)) return false;
    if (on(f.payeeType) && r.payeeType !== f.payeeType) return false;
    if (on(f.status)) {
      if (f.status === "open") {
        if (r.status !== DISPLAY_STATUS.UNPAID && r.status !== DISPLAY_STATUS.PARTIALLY_PAID) return false;
      } else if (r.status !== f.status) return false;
    } else if (r.status === DISPLAY_STATUS.CANCELLED && !f.includeCancelled) {
      return false;
    }
    if (on(f.due) && dueState(r, f.today) !== f.due) return false;
    if (q && !String(r.payeeName || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

const STATUS_ORDER = { draft: 0, unpaid: 1, partially_paid: 2, paid: 3, cancelled: 4 };
export function sortPayableRows(rows = [], { key = "period", dir = "desc" } = {}) {
  const sign = dir === "asc" ? 1 : -1;
  const val = (r) => {
    switch (key) {
      case "payee": return String(r.payeeName || "").toLowerCase();
      case "total": return r.balance.total;
      case "paid": return r.balance.paid;
      case "remaining": return r.balance.remaining;
      case "due": return r.dueDate || "9999-12-31";
      case "status": return STATUS_ORDER[r.status] ?? 9;
      default: return `${r.periodStart}|${r.periodEnd}`;
    }
  };
  return [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c * sign || String(a.payeeName || "").localeCompare(String(b.payeeName || ""));
  });
}

/**
 * Razrada obaveze po radniku (T12): sati, obračunato (labor) i korekcije vezane za radnika.
 * @returns {Array<{employeeId, name, hours, labor, adjustments, total, projects:[{projectId, assignmentId, hours, amount}]}>}
 */
export function workerBreakdown(row, employees = []) {
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const by = new Map();
  const get = (id) => {
    const k = id || "";
    if (!by.has(k)) by.set(k, { employeeId: id || null, name: id ? employeeName(empById.get(id)) : null, hours: 0, labor: 0, adjustments: 0, projects: [] });
    return by.get(k);
  };
  for (const l of row?.laborLines || []) {
    const w = get(l.employee_id);
    w.hours += Number(l.hours) || 0;
    w.labor += Number(l.amount) || 0;
    w.projects.push({ projectId: l.project_id, assignmentId: l.assignment_id, hours: round2(l.hours), amount: round2(l.amount) });
  }
  for (const l of row?.adjustmentLines || []) get(l.employee_id).adjustments += Number(l.amount) || 0;
  return [...by.values()]
    .map((w) => ({ ...w, hours: round2(w.hours), labor: round2(w.labor), adjustments: round2(w.adjustments), total: round2(w.labor + w.adjustments) }))
    .sort((a, b) => (a.employeeId ? 0 : 1) - (b.employeeId ? 0 : 1) || String(a.name || "").localeCompare(String(b.name || "")));
}

/**
 * Poređenje obaveze direktnom radniku (po B2C) sa neto iznosom iz srpskog mesečnog obračuna (D17/D21):
 * samo za obavezu prema radniku, period = ceo mesec, EUR i postojeći listić. Razliku Finance unosi kao korekciju.
 * @returns {null | {month, runStatus, neto, payout, payable, difference}}
 */
export function netComparison(row, { runs = [], payslips = [] } = {}) {
  if (!row || row.payeeType !== "employee" || row.currency !== "EUR") return null;
  const month = periodMonth(row.payable);
  if (!month) return null;
  const run = (runs || []).find((r) => dateOnly(r.month) === month);
  if (!run) return { month, runStatus: null, neto: null, payout: null, payable: row.balance.total, difference: null };
  const slip = (payslips || []).find((s) => s.run_id === run.id && s.employee_id === row.payeeId);
  if (!slip) return { month, runStatus: run.status, neto: null, payout: null, payable: row.balance.total, difference: null };
  const neto = slip.neto === null || slip.neto === undefined ? null : round2(slip.neto);
  const payout = round2(slip.payout);
  return { month, runStatus: run.status, neto, payout, payable: row.balance.total, difference: round2(row.balance.total - payout) };
}

/** Zbir po valuti za trenutni skup (Calculated/Confirmed/Paid/Remaining/Overdue) — valute se nikad ne sabiraju. */
export function currenciesOf(rows = []) {
  return sortCurrencies([...new Set((rows || []).map((r) => r.currency))]);
}

/**
 * Redovi za izvoz (Excel/CSV): ceo filtrirani skup. Bez prava payroll.view — ništa (druga linija odbrane, T26;
 * baza ionako ne vraća obaveze bez prava).
 */
export function payableExportRows(rows = [], perms = []) {
  if (!can(perms, "payroll.view")) return [];
  return (rows || []).map((r) => ({
    payee: r.payeeName || "",
    payee_type: r.payeeType,
    period_start: r.periodStart,
    period_end: r.periodEnd,
    workers: r.workerCount,
    hours: r.hours,
    calculated: round2(r.payable.calculated_amount),
    adjustments: round2(r.payable.adjustments_amount),
    total: r.balance.total,
    paid: r.balance.paid,
    remaining: r.balance.remaining,
    currency: r.currency,
    due_date: r.dueDate || "",
    status: r.status,
    overdue: r.balance.overdue,
    payments: r.balance.paymentCount,
  }));
}
