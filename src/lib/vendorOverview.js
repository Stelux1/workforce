// Vendors (spec §11, 11.02): ugovorni periodi, povezani radnici i obaveze plaćanja jednog podizvođača.
// Čiste funkcije — stranica Vendors i detalj vendora ih samo prikazuju. Pravila u bazi:
// migracija 20261125180000_ugovori_vendora.sql (vendor_contracts, vendor_worker_counts), payables (§7).

import { listUrl } from "./listLinks.js";
import { round2 } from "./payroll/money.js";
import { DISPLAY_STATUS, dueState } from "./payroll/payablesList.js";

const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const CONTRACT_CURRENCIES = Object.freeze(["EUR", "RSD", "GBP", "USD"]);
export const CONTRACT_STATUSES = Object.freeze(["active", "ended", "cancelled"]);

// ───────────────────────── ugovorni periodi ─────────────────────────

/**
 * Stanje ugovora na dan: active (važi danas) | upcoming (počinje kasnije) | expired (aktivan, ali je prošao kraj) |
 * ended | cancelled.
 */
export function contractState(contract, today) {
  if (!contract) return null;
  if (contract.status === "cancelled") return "cancelled";
  if (contract.status === "ended") return "ended";
  const t = dateOnly(today);
  const start = dateOnly(contract.start_date);
  const end = dateOnly(contract.end_date);
  if (t && start > t) return "upcoming";
  if (t && end && end < t) return "expired";
  return "active";
}

/** Ugovor koji važi danas (aktivan i pokriva dan) ili null. */
export function currentContract(contracts = [], today) {
  return (contracts || []).find((c) => contractState(c, today) === "active") || null;
}

/** Redosled za prikaz: najnoviji početak prvi. */
export function sortContracts(contracts = []) {
  return [...(contracts || [])].sort((a, b) => dateOnly(b.start_date).localeCompare(dateOnly(a.start_date))
    || String(a.reference || "").localeCompare(String(b.reference || "")));
}

const overlaps = (a, b) => {
  const aStart = dateOnly(a.start_date);
  const bStart = dateOnly(b.start_date);
  const aEnd = dateOnly(a.end_date) || "9999-12-31";
  const bEnd = dateOnly(b.end_date) || "9999-12-31";
  return aStart <= bEnd && bStart <= aEnd;
};

/**
 * Aktivni ugovor istog vendora sa kojim bi se `draft` preklopio (isto pravilo kao exclusion constraint
 * vendor_contracts_no_overlap: proveravaju se samo aktivni). Vraća taj ugovor ili null.
 */
export function overlappingContract(contracts = [], draft) {
  if (!draft || (draft.status || "active") !== "active") return null;
  return (contracts || []).find((c) => c.id !== draft.id && c.vendor_id === draft.vendor_id
    && c.status === "active" && overlaps(c, draft)) || null;
}

/**
 * Provera forme ugovora pre slanja (baza proverava isto). Vraća listu ključeva grešaka:
 * reference | start_date | end_before_start | payment_terms_days | currency | status | overlap.
 */
export function validateContract(draft, contracts = []) {
  const errors = [];
  if (!String(draft?.reference || "").trim()) errors.push("reference");
  const start = dateOnly(draft?.start_date);
  const end = dateOnly(draft?.end_date);
  if (!ISO.test(start)) errors.push("start_date");
  if (end && (!ISO.test(end) || (ISO.test(start) && end < start))) errors.push("end_before_start");
  const terms = draft?.payment_terms_days;
  if (terms !== null && terms !== undefined && terms !== "") {
    const n = Number(terms);
    if (!Number.isInteger(n) || n < 0 || n > 365) errors.push("payment_terms_days");
  }
  if (!CONTRACT_CURRENCIES.includes(draft?.currency || "EUR")) errors.push("currency");
  if (!CONTRACT_STATUSES.includes(draft?.status || "active")) errors.push("status");
  if (!errors.length && overlappingContract(contracts, draft)) errors.push("overlap");
  return errors;
}

/** Red za upis (prazni stringovi → null, rok kao broj, referenca bez razmaka na krajevima). */
export function contractPayload(draft) {
  const terms = draft?.payment_terms_days;
  return {
    ...(draft?.id ? { id: draft.id } : {}),
    vendor_id: draft.vendor_id,
    reference: String(draft.reference || "").trim(),
    start_date: dateOnly(draft.start_date),
    end_date: dateOnly(draft.end_date) || null,
    payment_terms_days: terms === null || terms === undefined || terms === "" ? null : Number(terms),
    currency: draft.currency || "EUR",
    status: draft.status || "active",
    notes: String(draft.notes || "").trim() || null,
  };
}

// ───────────────────────── povezani radnici ─────────────────────────

/** Angažman pokriva dan i ima status active. */
export function engagementActiveOn(h, today) {
  const t = dateOnly(today);
  if (!h || h.status !== "active" || !t) return false;
  return dateOnly(h.start_date) <= t && (!h.end_date || dateOnly(h.end_date) >= t);
}

/**
 * Radnici povezani sa vendorom preko employment_history (engagement_type subcontractor_worker). Po radniku
 * poslednji angažman; `active` = angažman koji važi danas (isto pravilo kao view vendor_worker_counts).
 * @returns {{ workers: Array<{employeeId, employee, start, end, active, upcoming}>, activeCount, totalCount }}
 */
export function vendorWorkers(history = [], vendorId, { employees = [], today } = {}) {
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const byEmployee = new Map();
  for (const h of history || []) {
    if (!h || h.vendor_id !== vendorId || !h.employee_id) continue;
    const list = byEmployee.get(h.employee_id) || [];
    list.push(h);
    byEmployee.set(h.employee_id, list);
  }
  const t = dateOnly(today);
  const workers = [...byEmployee.entries()].map(([employeeId, list]) => {
    const current = list.find((h) => engagementActiveOn(h, today));
    const latest = current || [...list].sort((a, b) => dateOnly(b.start_date).localeCompare(dateOnly(a.start_date)))[0];
    return {
      employeeId,
      employee: empById.get(employeeId) || null,
      start: dateOnly(latest.start_date),
      end: dateOnly(latest.end_date),
      active: Boolean(current),
      upcoming: !current && latest.status === "active" && Boolean(t) && dateOnly(latest.start_date) > t,
    };
  });
  workers.sort((a, b) => Number(b.active) - Number(a.active) || Number(b.upcoming) - Number(a.upcoming)
    || b.start.localeCompare(a.start));
  return { workers, activeCount: workers.filter((w) => w.active).length, totalCount: workers.length };
}

/** Mapa vendor_id → broj aktivnih radnika iz redova view-a vendor_worker_counts. */
export function workerCountMap(rows = []) {
  return new Map((rows || []).filter((r) => r?.vendor_id).map((r) => [r.vendor_id, Number(r.active_workers) || 0]));
}

// ───────────────────────── obaveze plaćanja ─────────────────────────

const OPEN = new Set([DISPLAY_STATUS.UNPAID, DISPLAY_STATUS.PARTIALLY_PAID]);

/**
 * Pregled obaveza vendora po valuti iz redova payableRows (src/lib/payroll/payablesList.js). Otkazane se ne broje,
 * nacrt nije dug (kao Payroll Due): `remaining` i `overdue` su samo potvrđene obaveze sa ostatkom.
 * @returns {{ byCurrency: Array<{currency, open, remaining, overdue, overdueCount}>, openCount, overdueCount, draftCount,
 *   nextDue: string|null, openRows }}
 */
export function vendorPayablesSummary(rows = [], today) {
  const acc = new Map();
  let draftCount = 0;
  const openRows = [];
  for (const r of rows || []) {
    if (!r || r.status === DISPLAY_STATUS.CANCELLED) continue;
    if (r.status === DISPLAY_STATUS.DRAFT) { draftCount += 1; continue; }
    if (!OPEN.has(r.status)) continue;
    openRows.push(r);
    const cur = acc.get(r.currency) || { currency: r.currency, open: 0, remaining: 0, overdue: 0, overdueCount: 0 };
    cur.open += 1;
    cur.remaining = round2(cur.remaining + r.balance.remaining);
    if (dueState(r, today) === "overdue") {
      cur.overdue = round2(cur.overdue + r.balance.remaining);
      cur.overdueCount += 1;
    }
    acc.set(r.currency, cur);
  }
  const t = dateOnly(today);
  const upcoming = openRows.map((r) => r.dueDate).filter((d) => d && (!t || d >= t)).sort();
  const byCurrency = [...acc.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return {
    byCurrency,
    openCount: openRows.length,
    overdueCount: byCurrency.reduce((s, c) => s + c.overdueCount, 0),
    draftCount,
    nextDue: upcoming[0] || null,
    openRows,
  };
}

/**
 * Link na Payables filtriran na vendora. Period pokriva sve prikazane obaveze (inače Payables otvara tekući mesec);
 * `open` = samo neplaćene/delimično plaćene.
 */
export function vendorPayablesUrl(vendorId, rows = [], { onlyOpen = true } = {}) {
  const list = (rows || []).filter(Boolean);
  const from = list.map((r) => r.periodStart).filter(Boolean).sort()[0] || "";
  const to = list.map((r) => r.periodEnd).filter(Boolean).sort().at(-1) || "";
  return listUrl("/payroll/payables", { vendor: vendorId, from, to, status: onlyOpen ? "open" : "" });
}
