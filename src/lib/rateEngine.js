// Effective-dated rate resolution. Pure functions, no side effects.
// Precedence: assignment rate > project/role rate > employee default rate.
// Rates are resolved for the WORK DATE, so later rate changes never rewrite history.

export const RATE_UNITS = ["hourly", "daily", "weekly", "monthly"];
export const RATE_KINDS = ["cost", "revenue"];
export const CURRENCIES = ["EUR", "RSD", "GBP", "USD"];

export const RATE_LABELS = {
  en: {
    hourly: "Hourly", daily: "Daily", weekly: "Weekly", monthly: "Monthly",
    cost: "Cost", revenue: "Revenue",
    assignment: "Assignment rate", project: "Project / role rate", employee: "Employee default rate",
    missing_rate: "No applicable rate",
    conflict: "Conflicting rates at the same level",
  },
  rs: {
    hourly: "Po satu", daily: "Po danu", weekly: "Po nedelji", monthly: "Mesečno",
    cost: "Trošak", revenue: "Prihod",
    assignment: "Tarifa sa dodjele", project: "Tarifa projekta / radnog mesta", employee: "Podrazumevana tarifa zaposlenog",
    missing_rate: "Nema primenjive tarife",
    conflict: "Konfliktne tarife na istom nivou",
  },
};

const SCOPE_LEVEL = { assignment: 1, project: 2, employee: 3 };

export const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// A rate is applicable on `date` when active and inside its effective window (both ends inclusive).
export function isRateEffective(rate, date) {
  if (!rate || !rate.effective_from || !date) return false;
  if (rate.status && rate.status !== "active") return false;
  if (date < rate.effective_from) return false;
  if (rate.effective_to && date > rate.effective_to) return false;
  return true;
}

/**
 * Resolve the rate that applies to a work date.
 * Returns { rate, level, reason, conflict } — never falls back to zero when nothing matches.
 */
export function resolveRate({ rates = [], kind, employeeId, projectId, position, assignmentId, date }) {
  const candidates = (rates || []).filter((rate) => {
    if ((rate.kind || "cost") !== kind) return false;
    if (!isRateEffective(rate, date)) return false;
    if (rate.employee_id && rate.employee_id !== employeeId) return false;

    const scope = rate.scope || "employee";
    if (scope === "assignment") return !!assignmentId && rate.assignment_id === assignmentId;
    if (scope === "project") {
      if (!projectId || rate.project_id !== projectId) return false;
      return !rate.position || rate.position === position;
    }
    return !!employeeId && rate.employee_id === employeeId;
  });

  if (!candidates.length) return { rate: null, level: null, reason: "missing_rate", conflict: false };

  candidates.sort((a, b) => {
    const la = SCOPE_LEVEL[a.scope || "employee"] ?? 9;
    const lb = SCOPE_LEVEL[b.scope || "employee"] ?? 9;
    if (la !== lb) return la - lb;
    // A role-specific rate beats a project-wide rate on the same level.
    const pa = a.position ? 1 : 0;
    const pb = b.position ? 1 : 0;
    if (pa !== pb) return pb - pa;
    // Otherwise the most recently effective rate wins.
    return (b.effective_from || "").localeCompare(a.effective_from || "");
  });

  const best = candidates[0];
  const bestLevel = SCOPE_LEVEL[best.scope || "employee"] ?? 9;
  const conflict = candidates.some(
    (r) =>
      r !== best &&
      (SCOPE_LEVEL[r.scope || "employee"] ?? 9) === bestLevel &&
      r.effective_from === best.effective_from &&
      Number(r.amount) !== Number(best.amount)
  );

  return {
    rate: best,
    level: bestLevel,
    levelName: best.scope || "employee",
    reason: null,
    conflict,
  };
}

/** The affiliation (engagement) in force on a given date. */
export function resolveAffiliation({ history = [], employeeId, date }) {
  if (!employeeId || !date) return null;
  const hits = (history || [])
    .filter(
      (h) =>
        h.employee_id === employeeId &&
        h.start_date &&
        h.start_date <= date &&
        (!h.end_date || h.end_date >= date)
    )
    .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  return hits[0] || null;
}

/** Overlapping affiliations for the same employee — blocked under one-active-affiliation model. */
export function findOverlappingAffiliations(history = [], { employeeId, start, end, excludeId }) {
  if (!employeeId || !start) return [];
  const from = start;
  const to = end || "9999-12-31";
  return (history || []).filter(
    (h) =>
      h.employee_id === employeeId &&
      h.id !== excludeId &&
      h.start_date &&
      h.start_date <= to &&
      (!h.end_date || h.end_date >= from)
  );
}

/** Amount for a resolved rate and a quantity map, e.g. { hourly: 42 } or { monthly: 1 }. */
export function computeAmount(rate, quantities = {}) {
  if (!rate || rate.amount === null || rate.amount === undefined || !rate.unit) {
    return { amount: null, missing: true, unit: null, unitAmount: null, qty: 0 };
  }
  const qty = Number(quantities[rate.unit] ?? 0) || 0;
  return {
    amount: round2(Number(rate.amount) * qty),
    missing: false,
    unit: rate.unit,
    unitAmount: Number(rate.amount),
    qty,
  };
}

export function activeAssignments(assignments = [], { employeeId, projectId, date }) {
  return (assignments || []).filter(
    (a) =>
      (!employeeId || a.employee_id === employeeId) &&
      (!projectId || a.project_id === projectId) &&
      (!a.status || a.status === "active" || a.status === "planned") &&
      (!date || (a.start_date <= date && (!a.end_date || a.end_date >= date)))
  );
}