// Konstante tarifa i angažovanja (zaposlenje po datumu). Samo izbor tarife je u src/lib/payroll/rates.js (D4) —
// stari resolveRate/computeAmount su uklonjeni posle pregleda koda 14.11.2026 da ne postoje dva obračuna.

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
  sk: {
    hourly: "Za hodinu", daily: "Za deň", weekly: "Za týždeň", monthly: "Za mesiac",
    cost: "Náklad", revenue: "Tržba",
    assignment: "Sadzba pridelenia", project: "Sadzba projektu / roly", employee: "Predvolená sadzba zamestnanca",
    missing_rate: "Žiadna použiteľná sadzba",
    conflict: "Konfliktné sadzby na rovnakej úrovni",
  },
};

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
