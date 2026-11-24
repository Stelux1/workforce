// Jedan red nedeljne satnice (stranica Satnice): sati po danu, vrste sati i prikaz onoga što je baza izračunala.
// Phase 7 (T-A2): ekran više ne šalje tarife ni iznose. Tarifu po datumu rada (K12), procenu (`estimate_days`),
// probleme obračuna (`calc_problems`) i snimak pri odobravanju računa baza (guard_timesheet v4); iznose vidi samo
// korisnik sa pravom (`timesheet_money`, T26). Ovde su samo čiste funkcije za prikaz — ništa se ne čita iz baze.

import { round2, sum2 } from "./money.js";
import { classifyWeek } from "./hours.js";
import { DAY_FIELDS } from "./timesheetDays.js";

export { DAY_FIELDS };
const DEFAULT_DAILY_THRESHOLD = 8; // isto kao work_rules.daily_regular_hours default i hours.js

/** Sati po danima kao brojevi; prazno polje (ili nešto što nije broj) = 0. Opseg 0–24 proverava baza. */
export function dayHours(row) {
  return Object.fromEntries(
    DAY_FIELDS.map((f) => {
      const n = Number.parseFloat(row?.[f]);
      return [f, Number.isFinite(n) ? round2(n) : 0];
    })
  );
}

/** Dnevni prag iz work_rules (red ili niz redova); bez reda → 8, kao baza. */
export function dailyThresholdOf(workRules) {
  const row = Array.isArray(workRules) ? workRules[0] : workRules;
  const n = Number(row?.daily_regular_hours);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_THRESHOLD;
}

/**
 * Vrste sati reda po classifyWeek (pregled na ekranu; u bazi isto računa guard_timesheet).
 * Neispravan unos (npr. 25 sati u danu, nedelja bez ponedeljka) → null umesto greške, da prikaz ne pukne.
 */
export function hoursByTypeOf(row, { holidays, dailyThreshold } = {}) {
  try {
    return classifyWeek({ weekStart: row?.week_start, dayHours: dayHours(row), holidays, dailyThreshold });
  } catch {
    return null;
  }
}

/**
 * Prekovremeni sati za prikaz (više nije „preko 40h"): hours_by_type koji je izračunala baza; odobren red bez
 * hours_by_type (odobren pre Faze 2) zadržava upisan broj; ostalo pregled po classifyWeek. Neispravan unos → null.
 */
export function overtimeHours(row, rules) {
  const stored = row?.hours_by_type?.prekovremeni;
  if (stored !== undefined && stored !== null && Number.isFinite(Number(stored))) return Number(stored);
  if (row?.approval_status === "approved") return Number(row.overtime_hours) || 0;
  return hoursByTypeOf(row, rules)?.prekovremeni ?? null;
}

// ───────────────────────── problemi obračuna reda (calc_problems iz baze) ─────────────────────────
/** Šifre koje upisuje guard_timesheet (bez iznosa — vidljive i korisniku bez prava na novac). */
export const CALC_PROBLEM = Object.freeze({
  NO_PROJECT: "no_project",
  ASSIGNMENT_MISSING: "assignment_missing",
  ASSIGNMENT_AMBIGUOUS: "assignment_ambiguous",
  OUTSIDE_ASSIGNMENT: "outside_assignment",
  RATE_MISSING: "rate_missing",
  RATE_UNIT: "rate_unit",
  COEF_MISSING: "coef_missing",
  MIXED_CURRENCY: "mixed_currency",
});

/** Problemi koji sprečavaju Submit (bez dodele ili dan van dodele); ostali sprečavaju samo odobravanje. */
export const SUBMIT_BLOCKERS = Object.freeze([
  CALC_PROBLEM.NO_PROJECT, CALC_PROBLEM.ASSIGNMENT_MISSING, CALC_PROBLEM.ASSIGNMENT_AMBIGUOUS, CALC_PROBLEM.OUTSIDE_ASSIGNMENT,
]);

const problemsOf = (row) => (Array.isArray(row?.calc_problems) ? row.calc_problems.filter(Boolean) : []);

/** Da li red sme da se pošalje (Submit): ima dodelu i svi dani su u njenom opsegu. */
export const canSubmit = (row) => !problemsOf(row).some((p) => SUBMIT_BLOCKERS.includes(p.code));

/** Da li red sme da se odobri: nema nijednog problema obračuna. */
export const canApprove = (row) => problemsOf(row).length === 0;

/**
 * Problemi reda grupisani za prikaz: ista šifra i strana jednom, sa spiskom datuma.
 * @returns {Array<{ code, side?, detail?, dates: string[] }>}
 */
export function groupedProblems(row) {
  const map = new Map();
  for (const p of problemsOf(row)) {
    const key = `${p.code}|${p.side || ""}|${p.detail || ""}`;
    const g = map.get(key) || { code: p.code, side: p.side || null, detail: p.detail || null, dates: [] };
    if (p.date && !g.dates.includes(p.date)) g.dates.push(String(p.date).slice(0, 10));
    map.set(key, g);
  }
  return [...map.values()].map((g) => ({ ...g, dates: g.dates.sort() }));
}

/**
 * Procena iznosa neodobrenog reda iz `estimate_days` (spec §6.04: samo prikaz, nikad u konačnim KPI-jevima).
 * Vraća null kad korisnik nema pravo (maska baze daje null tarife) ili procene nema.
 * @returns {{ workerCost: number|null, clientRevenue: number|null, workerCurrency: string|null, clientCurrency: string|null } | null}
 */
export function estimateTotals(row) {
  const days = Array.isArray(row?.estimate_days) ? row.estimate_days : null;
  if (!days || !days.length) return null;
  const side = (key, amountKey) => {
    const amounts = days.map((d) => d?.[amountKey]);
    if (amounts.some((a) => a === null || a === undefined)) return { amount: null, currency: null };
    const currencies = [...new Set(days.map((d) => d?.[key]?.currency).filter(Boolean))];
    return { amount: sum2(amounts), currency: currencies.length === 1 ? currencies[0] : null };
  };
  const w = side("worker", "worker_cost");
  const c = side("client", "client_revenue");
  if (w.amount === null && c.amount === null) return null;
  return { workerCost: w.amount, clientRevenue: c.amount, workerCurrency: w.currency, clientCurrency: c.currency };
}

/**
 * Tarife po danu iz snimka ili procene — za prikaz promene tarife u toku nedelje (T07).
 * @returns {Array<{ date, code, hours, workerRate, workerCurrency, clientRate, clientCurrency }>}
 */
export function rateDays(row) {
  const days = row?.approval_status === "approved" ? row?.rate_snapshot?.days : row?.estimate_days;
  if (!Array.isArray(days)) return [];
  return days.map((d) => ({
    date: String(d?.date || "").slice(0, 10),
    code: d?.code,
    hours: round2(Number(d?.hours || 0)),
    workerRate: d?.worker?.rate ?? null,
    workerCurrency: d?.worker?.currency ?? null,
    clientRate: d?.client?.rate ?? null,
    clientCurrency: d?.client?.currency ?? null,
  }));
}

const HOUR_TYPE_TEXT = {
  rs: { redovni: "redovni", prekovremeni: "prekovremeni", vikend: "vikend", praznik: "praznik", praznik_vikend: "praznik vikendom" },
  sk: { redovni: "bežné", prekovremeni: "nadčas", vikend: "víkend", praznik: "sviatok", praznik_vikend: "sviatok cez víkend" },
  en: { redovni: "regular", prekovremeni: "overtime", vikend: "weekend", praznik: "holiday", praznik_vikend: "holiday on weekend" },
};
const SIDE_TEXT = {
  rs: { worker: "radnika (B2C)", client: "klijenta (B2B)" },
  sk: { worker: "zamestnanca (B2C)", client: "klienta (B2B)" },
  en: { worker: "worker (B2C)", client: "client (B2B)" },
};
const dmy = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

const CALC_TEXT = {
  rs: {
    no_project: () => "satnica nije vezana za projekat sa liste",
    assignment_missing: () => "radnik nema dodelu na projektu koja pokriva sve dane sa satima — dodajte je u Angažmani na projektima",
    assignment_ambiguous: () => "više dodela pokriva ove dane — izaberite dodelu",
    outside_assignment: (g) => `dani van perioda dodele: ${g.dates.map(dmy).join(", ")}`,
    rate_missing: (g) => `nema tarife ${SIDE_TEXT.rs[g.side] || ""} za ${g.dates.map(dmy).join(", ")} — Finance je upisuje u Rate History`,
    rate_unit: (g) => `tarifa ${SIDE_TEXT.rs[g.side] || ""} nije po satu (${g.detail}) za ${g.dates.map(dmy).join(", ")}`,
    coef_missing: (g) => `nedostaje koeficijent ${SIDE_TEXT.rs[g.side] || ""} za ${HOUR_TYPE_TEXT.rs[g.detail] || g.detail} — Podešavanja → Koeficijenti i praznici`,
    mixed_currency: (g) => `tarife ${SIDE_TEXT.rs[g.side] || ""} u ovoj nedelji su u različitim valutama — podelite satnicu ili ispravite tarifu`,
  },
  sk: {
    no_project: () => "výkaz nie je prepojený s projektom zo zoznamu",
    assignment_missing: () => "zamestnanec nemá na projekte pridelenie, ktoré pokrýva všetky dni s hodinami — pridajte ho v Pridelenia na projektoch",
    assignment_ambiguous: () => "tieto dni pokrýva viac pridelení — vyberte pridelenie",
    outside_assignment: (g) => `dni mimo obdobia pridelenia: ${g.dates.map(dmy).join(", ")}`,
    rate_missing: (g) => `chýba sadzba ${SIDE_TEXT.sk[g.side] || ""} pre ${g.dates.map(dmy).join(", ")} — Finance ju zadá v Rate History`,
    rate_unit: (g) => `sadzba ${SIDE_TEXT.sk[g.side] || ""} nie je hodinová (${g.detail}) pre ${g.dates.map(dmy).join(", ")}`,
    coef_missing: (g) => `chýba koeficient ${SIDE_TEXT.sk[g.side] || ""} pre ${HOUR_TYPE_TEXT.sk[g.detail] || g.detail} — Nastavenia → Koeficienty a sviatky`,
    mixed_currency: (g) => `sadzby ${SIDE_TEXT.sk[g.side] || ""} v tomto týždni sú v rôznych menách — rozdeľte výkaz alebo opravte sadzbu`,
  },
  en: {
    no_project: () => "the timesheet is not linked to a project from the list",
    assignment_missing: () => "the employee has no assignment on the project covering all days with hours — add it in Project Assignments",
    assignment_ambiguous: () => "several assignments cover these days — choose the assignment",
    outside_assignment: (g) => `days outside the assignment period: ${g.dates.map(dmy).join(", ")}`,
    rate_missing: (g) => `no ${SIDE_TEXT.en[g.side] || ""} rate for ${g.dates.map(dmy).join(", ")} — Finance enters it in Rate History`,
    rate_unit: (g) => `the ${SIDE_TEXT.en[g.side] || ""} rate is not hourly (${g.detail}) for ${g.dates.map(dmy).join(", ")}`,
    coef_missing: (g) => `missing ${SIDE_TEXT.en[g.side] || ""} coefficient for ${HOUR_TYPE_TEXT.en[g.detail] || g.detail} — Settings → Coefficients & Holidays`,
    mixed_currency: (g) => `the ${SIDE_TEXT.en[g.side] || ""} rates in this week are in different currencies — split the timesheet or fix the rate`,
  },
};

/** Tekst jednog grupisanog problema (groupedProblems) za korisnika — bez iznosa. */
export function calcProblemText(group, lang = "rs") {
  const T = CALC_TEXT[lang] || CALC_TEXT.rs;
  return (T[group?.code] || (() => group?.code || ""))(group);
}
