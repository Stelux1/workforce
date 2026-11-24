// Glavna kontrolna tabla (Teamora, spec §3): čiste funkcije — ništa se ne čita iz baze.
//
// Sav novac dolazi iz jedinog obračunskog servisa (src/lib/finance, data model §3, D30 K4): `financialSummary` za
// interni obračun (prihod, trošak rada, dodatni troškovi, profit), `payablesTotals` za obaveze radnicima/vendorima,
// `billingTotals`/`unbilledRevenue` za potraživanja od klijenata. Te vrednosti se NE mešaju (T17): obračunato,
// fakturisano, uplaćeno i isplaćeno su odvojene kartice. Svaki iznos je po valuti (T28), nikad zbir dve valute.
// KPI za isti period i filter zato daje isti broj kao izvorni modul (T27).
//
// Period: [from, to] po datumu RADNOG DANA (dnevne linije odobrenih satnica), ne po početku nedelje.

import { SIDES, aggregateLabor, laborDayLines, sideAmount } from "../finance/laborLines.js";
import { filterAdditionalCosts, financialSummary } from "../finance/summary.js";
import { profitMargin } from "../finance/kpis.js";
import { BASE_CURRENCY, sortCurrencies } from "../finance/currency.js";
import { availableWorkers, coverage, shortageProjects } from "../workforce.js";
import { assignmentStatus } from "../assignments.js";
import { round2 } from "./money.js";
import { DAY_FIELDS } from "./timesheetDays.js";
import { monthEnd, monthStart } from "./payrollMonth.js";

export const PERIODS = Object.freeze(["month", "last_month", "quarter", "year"]);

/** "YYYY-MM-DD" + n dana, u UTC da vremenska zona ne pomeri dan. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-MM-01" pomeren za n meseci (može negativno). */
function shiftMonth(first, n) {
  const y = Number(first.slice(0, 4));
  const m = Number(first.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
}

/**
 * Period i prethodni period iste dužine. `today` je "YYYY-MM-DD".
 * month = tekući mesec (prethodni = prošli mesec), last_month = prošli mesec, quarter = tekući kvartal,
 * year = tekuća kalendarska godina.
 * @returns {{ from: string, to: string, prevFrom: string, prevTo: string }}
 */
export function dashboardPeriod(key, today) {
  const cur = monthStart(today);
  let start;
  let months;
  if (key === "last_month") {
    start = shiftMonth(cur, -1);
    months = 1;
  } else if (key === "quarter") {
    const m = Number(cur.slice(5, 7)) - 1;
    start = `${cur.slice(0, 4)}-${String(Math.floor(m / 3) * 3 + 1).padStart(2, "0")}-01`;
    months = 3;
  } else if (key === "year") {
    start = `${cur.slice(0, 4)}-01-01`;
    months = 12;
  } else {
    start = cur;
    months = 1;
  }
  const prevStart = shiftMonth(start, -months);
  return {
    from: start,
    to: monthEnd(shiftMonth(start, months - 1)),
    prevFrom: prevStart,
    prevTo: monthEnd(shiftMonth(prevStart, months - 1)),
  };
}

/** Prvi opseg `week_start` koji treba učitati da bi se pokrili svi dani perioda (nedelja počinje do 6 dana ranije). */
export const weekStartRange = (from, to) => ({ from: addDays(from, -6), to });

/** Svi dani perioda "YYYY-MM-DD". */
export function daysOf(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}


// ───────────────────────────── filteri (spec §3.1) ─────────────────────────────

export const PROJECT_STATUS_FILTERS = Object.freeze(["active", "paused", "completed"]);
const NO_MATCH = "__none__";

/**
 * Izbor Project / Client / Status → filter za finansijsko jezgro. Status je status PROJEKTA. Kad je bar jedan filter
 * postavljen, rezultat je spisak id-jeva projekata koji ga zadovoljavaju (prazan spisak ne sme da postane „bez
 * filtera", pa se šalje nepostojeći id). Prazan/"all" izbor = bez ograničenja.
 * @returns {{ filters: {projectId?: string[]}, projectIds: Set<string>|null, projects: object[] }}
 */
export function resolveFilters(projects = [], { projectId = "", clientId = "", status = "" } = {}) {
  const pid = projectId && projectId !== "all" ? projectId : "";
  const cid = clientId && clientId !== "all" ? clientId : "";
  const st = status && status !== "all" ? status : "";
  if (!pid && !cid && !st) return { filters: {}, projectIds: null, projects };
  const scoped = (projects || []).filter((p) => (!pid || p.id === pid) && (!cid || p.client_id === cid) && (!st || p.status === st));
  const ids = scoped.map((p) => p.id);
  return { filters: { projectId: ids.length ? ids : [NO_MATCH] }, projectIds: new Set(ids), projects: scoped };
}

const inScope = (ids, projectId) => !ids || ids.has(projectId);

// ───────────────────────────── finansije ─────────────────────────────

/**
 * Interni obračun perioda i prethodnog perioda (isti filteri) — samo `financialSummary`.
 * @returns {{ current: object, previous: object|null, filters: object, lines: object[] }}
 */
export function dashboardFinance({ timesheets = [], costs = [], projects = [], assignments = [], range, prevRange = null, selection = {} }) {
  const { filters } = resolveFilters(projects, selection);
  const base = { timesheets, costs, projects, assignments, filters };
  const current = financialSummary({ ...base, range });
  const previous = prevRange ? financialSummary({ ...base, range: prevRange }) : null;
  const { lines } = laborDayLines(timesheets, { from: range.from, to: range.to, filters, projects, assignments });
  return { current, previous, filters, lines };
}

/**
 * Sati satnica datog statusa u periodu (po datumu radnog dana), BEZ novca: radi i za korisnika koji ne vidi tarife
 * (HR) — njemu snimak tarifa (`rate_snapshot`) nije dostupan pa `financialSummary` ne može da napravi linije, a sati
 * ipak postoje. Za korisnika sa pravom i bez problema u obračunu daje isto što i `financialSummary.approvedHours`.
 * @param {string} status "approved" (Approved Hours) ili "submitted" (sati na čekanju — procena, odvojeno)
 */
export function hoursInPeriod(timesheets = [], status, { from, to, projectIds = null }) {
  let cents = 0;
  for (const ts of timesheets || []) {
    if (!ts || ts.approval_status !== status || !inScope(projectIds, ts.project_id) || !ts.week_start) continue;
    const weekStart = String(ts.week_start).slice(0, 10);
    DAY_FIELDS.forEach((field, i) => {
      const date = addDays(weekStart, i);
      const h = Number.parseFloat(ts[field]);
      if (date >= from && date <= to && Number.isFinite(h) && h > 0) cents += Math.round(h * 100);
    });
  }
  return cents / 100;
}

/** Primarna valuta za prikaz: EUR kad postoji u podacima, inače prva po redosledu. */
export function primaryCurrency(currencies = []) {
  const list = sortCurrencies(currencies);
  return list.includes(BASE_CURRENCY) ? BASE_CURRENCY : list[0] ?? BASE_CURRENCY;
}

/** Vrednost polja iz `byCurrency` za sve valute: [{currency, value}], primarna prva. */
export function currencyEntries(byCurrency = {}, field) {
  const primary = primaryCurrency(Object.keys(byCurrency));
  return sortCurrencies(Object.keys(byCurrency))
    .sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0))
    .map((currency) => ({ currency, value: byCurrency[currency]?.[field] ?? null }));
}

/** Iznos po valuti iz mape {CUR: x} → isti oblik kao currencyEntries (za Payables/Unpaid/Unbilled). */
export function mapEntries(map = {}, pick = (v) => v) {
  const primary = primaryCurrency(Object.keys(map));
  return sortCurrencies(Object.keys(map))
    .sort((a, b) => (a === primary ? -1 : b === primary ? 1 : 0))
    .map((currency) => ({ currency, value: pick(map[currency]) }));
}

/** Promena u odnosu na prethodni period u %; null kad nema osnovice (prethodni period je 0) — ne izmišlja se. */
export function changePct(current, previous) {
  const p = Number(previous);
  if (!Number.isFinite(p) || p === 0) return null;
  return round2(((Number(current) - p) / Math.abs(p)) * 100);
}

/** Razlika marže u procentnim poenima; null kad jedna od marži ne postoji. */
export function marginChangePp(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  return round2(current - previous);
}

/**
 * Kumulativni red po danu za grafikon u jednoj valuti: prihod, trošak rada i zarada (prihod − trošak rada, bez dodatnih
 * troškova). Poslednja tačka je ISTA kao KPI perioda jer se svaki dan računa pravilom zaokruživanja iz sideAmount nad
 * svim linijama do tog dana. Za dugačke periode tačke su nedeljne (poslednji dan uvek ulazi).
 */
export function cumulativeSeries(lines = [], from, to, currency) {
  const days = daysOf(from, to);
  const step = days.length > 92 ? 7 : 1;
  const sorted = [...lines].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const seen = [];
  let i = 0;
  const out = [];
  days.forEach((date, idx) => {
    while (i < sorted.length && sorted[i].date <= date) seen.push(sorted[i++]);
    if (idx % step !== 0 && idx !== days.length - 1) return;
    const revenue = sideAmount(seen, SIDES.REVENUE).byCurrency[currency] ?? 0;
    const cost = sideAmount(seen, SIDES.COST).byCurrency[currency] ?? 0;
    out.push({ date, revenue, cost, profit: round2(revenue - cost) });
  });
  return out;
}

/**
 * Najbolji po zaradi u jednoj valuti: projekti i klijenti (prihod − trošak rada − dodatni troškovi projekta),
 * radnici (prihod − trošak rada; dodatni troškovi nisu vezani za radnika). Sortirano po zaradi, najviše `limit`.
 * Dodatni troškovi se uzimaju istim pravilom kao u financialSummary (filterAdditionalCosts).
 */
export function topLists({ lines = [], costs = [], projects = [], range, filters = {}, currency, limit = 5 }) {
  const additional = filterAdditionalCosts(costs, { from: range.from, to: range.to, filters, projects }).costs
    .filter((c) => (c.currency || BASE_CURRENCY) === currency);
  const projectOf = new Map((projects || []).map((p) => [p.id, p]));
  const costBy = (keyOf) => {
    const m = new Map();
    for (const c of additional) {
      const k = keyOf(c);
      if (k) m.set(k, round2((m.get(k) || 0) + Number(c.amount || 0)));
    }
    return m;
  };
  const build = (dimension, extraCosts, withExtra) =>
    aggregateLabor(lines, dimension)
      .filter((r) => r.key && (r.revenue[currency] !== undefined || r.cost[currency] !== undefined))
      .map((r) => {
        const revenue = r.revenue[currency] ?? 0;
        const profit = round2(revenue - (r.cost[currency] ?? 0) - (withExtra ? extraCosts.get(r.key) || 0 : 0));
        return { id: r.key, revenue, profit, hours: r.hours, marginPct: profitMargin(profit, revenue) };
      })
      .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
      .slice(0, limit);
  return {
    projects: build("project", costBy((c) => c.project_id), true),
    clients: build("client", costBy((c) => projectOf.get(c.project_id)?.client_id ?? null), true),
    workers: build("employee", new Map(), false),
  };
}

// ───────────────────────────── radna snaga (spec §3.2, §3.3) ─────────────────────────────

const day = (v) => (v ? String(v).slice(0, 10) : "");
const overlapsPeriod = (a, from, to) => day(a.start_date) <= to && (!day(a.end_date) || day(a.end_date) >= from);

/** Dodele koje važe u periodu: nisu poništene, preklapaju [from, to] i projekat je u izboru filtera. */
export function assignmentsInPeriod(assignments = [], { from, to, projectIds = null }) {
  return (assignments || []).filter((a) => a && a.status !== "cancelled" && overlapsPeriod(a, from, to) && inScope(projectIds, a.project_id));
}

/** Active Workers: jedinstveni radnici sa aktivnom dodelom u periodu (isti radnik na više projekata = 1, T01). */
export function activeWorkers(assignments, range) {
  return new Set(assignmentsInPeriod(assignments, range).map((a) => a.employee_id).filter(Boolean)).size;
}

/**
 * Active Projects (obuhvat se prikazuje): projekti sa statusom Active I/ILI aktivnom dodelom u periodu.
 * @returns {{ total:number, byStatus:number, byAssignment:number }}
 */
export function activeProjects(projects = [], assignments = [], { from, to, projectIds = null }) {
  const byStatus = new Set((projects || []).filter((p) => p.status === "active" && inScope(projectIds, p.id)).map((p) => p.id));
  const byAssignment = new Set(assignmentsInPeriod(assignments, { from, to, projectIds }).map((a) => a.project_id));
  return { total: new Set([...byStatus, ...byAssignment]).size, byStatus: byStatus.size, byAssignment: byAssignment.size };
}

/**
 * Workforce Overview: aktivni radnici, raspoloživi radnici danas i raspodela po projektima i pozicijama.
 * Raspodela broji jedinstvene radnike sa dodelom u periodu; pozicija je naziv Job Role (project_roles.title).
 */
export function workforceOverview({ employees = [], assignments = [], schedules = [], leaves = [], shifts = [], projectRoles = [], projects = [], today, range, projectIds = null }) {
  const list = assignmentsInPeriod(assignments, { from: range.from, to: range.to, projectIds });
  const roleOf = new Map((projectRoles || []).map((r) => [r.id, r]));
  const projectName = new Map((projects || []).map((p) => [p.id, p.name]));
  const group = (keyOf, labelOf) => {
    const m = new Map();
    for (const a of list) {
      const k = keyOf(a);
      if (!k) continue;
      const g = m.get(k) || { key: k, label: labelOf(a, k), workers: new Set() };
      g.workers.add(a.employee_id);
      m.set(k, g);
    }
    return [...m.values()]
      .map((g) => ({ key: g.key, label: g.label, workers: g.workers.size }))
      .sort((a, b) => b.workers - a.workers || String(a.label).localeCompare(String(b.label)));
  };
  const activeEmployees = (employees || []).filter((e) => e.status === "active");
  const free = availableWorkers({ date: today, employees: activeEmployees, assignments, schedules, leaves, shifts, projectRoles });
  return {
    activeWorkers: new Set(list.map((a) => a.employee_id).filter(Boolean)).size,
    availableToday: free.length,
    activeEmployees: activeEmployees.length,
    byProject: group((a) => a.project_id, (a, k) => projectName.get(k) || "—"),
    byPosition: group(
      (a) => {
        const r = roleOf.get(a.project_role_id);
        return r ? String(r.title_key ?? r.title ?? "").trim().toLowerCase() || null : null;
      },
      (a) => roleOf.get(a.project_role_id)?.title || "—"
    ),
  };
}

/** Workforce Shortages u periodu: projekti sa deficitom, ukupan deficit (osoba-smena-dan) i broj dana. */
export function workforceShortages({ requirements = [], assignments = [], schedules = [], leaves = [], shifts = [], range, projectIds = null }) {
  const rows = coverage({ requirements, assignments, schedules, leaves, shifts, from: range.from, to: range.to })
    .filter((r) => inScope(projectIds, r.projectId));
  const short = rows.filter((r) => r.deficit > 0);
  return { projects: shortageProjects(rows), deficit: short.reduce((sum, r) => sum + r.deficit, 0), days: new Set(short.map((r) => r.date)).size };
}

/** Dodele koje ističu u narednih 30 dana (status ending_soon, §4.4) u izboru filtera. */
export function endingSoon(assignments = [], today, projectIds = null) {
  return (assignments || []).filter((a) => a && inScope(projectIds, a.project_id) && assignmentStatus(a, today) === "ending_soon");
}

// ───────────────────────────── Action Center ─────────────────────────────

/** Broj dokumenata koji ističu u 30 dana ili su istekli (zaposleni) — kao ranije upozorenje na početnoj. */
export function expiringDocuments(documents = [], today) {
  const limit = addDays(today, 30);
  const list = (documents || []).filter((d) => d?.expiration_date && day(d.expiration_date) <= limit);
  return { total: list.length, expired: list.filter((d) => day(d.expiration_date) < today).length };
}

/**
 * Stavke Action Centera iz već izračunatih brojeva. Stavka sa `count === null` (podatak nedostupan / bez prava) se ne
 * prikazuje; stavka sa 0 se izostavlja (nema upozorenja). Redosled je redosled važnosti.
 * @param {Array<{key:string, count:number|null, tone?:string, to:string, detail?:string}>} items
 */
export function actionItems(items = []) {
  return items.filter((i) => i && typeof i.count === "number" && i.count > 0);
}

/**
 * Sledeći rok isplate: kraj tekućeg meseca (nikad datum iz prošlosti). Zakasnele isplate (odobren a neisplaćen
 * obračun čiji je mesec već prošao) se ne prikazuju kao „sledeći“ rok nego preko `overduePayrollMonths`.
 */
export function upcomingPayrollDate(_approvedRuns, today) {
  return monthEnd(monthStart(today));
}

/** Meseci (prvi dan) odobrenih a neisplaćenih obračuna čiji je kraj meseca pre `today`; najstariji prvi. */
export function overduePayrollMonths(approvedRuns, today) {
  const cur = monthStart(today);
  return (approvedRuns || [])
    .filter((r) => r?.status === "approved" && r.month)
    .map((r) => monthStart(r.month))
    .filter((m) => m < cur)
    .sort();
}
