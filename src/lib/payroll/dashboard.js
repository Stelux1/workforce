// Glavna kontrolna tabla (Teamora): prihod, trošak rada i zarada za izabrani period, po danu i po
// projektu / klijentu / radniku. Čiste funkcije — ništa se ne čita iz baze.
//
// Samo odobrene satnice (D9). Iznose (`client_revenue`, `worker_cost`, `profit`) je izračunala baza (D16); ovde se
// samo sabiraju u centima. Satnica je nedeljna, pa se njeni iznosi raspoređuju po danima SRAZMERNO SATIMA TOG DANA
// (`allocate`, zbir je uvek tačno iznos iz baze). Nedelja koja prelazi granicu perioda ulazi samo delom (danima
// unutar perioda) — kod nedelje preko granice MESECA to može da odstupi od mesečnog obračuna za par centi, jer se
// ne deli po vrsti sati (D17).
//
// Definicije (spec §3.2, §10):
//   Client Revenue = zbir `client_revenue` odobrenih satnica u periodu
//   Payroll Cost   = zbir `worker_cost` (trošak odobrenog rada po tarifi radnika; nije isto što i plaćeno)
//   Gross Profit   = Client Revenue − Payroll Cost (Labor Margin; bez dodatnih troškova projekta)
//   Profit Margin  = Gross Profit / Client Revenue × 100 (null kad je prihod 0)
// Sve je u EUR (D2); dodatni troškovi projekta se ovde ne uračunavaju.

import { allocate, round2, sum2 } from "./money.js";
import { projectMargin } from "./monthly.js";
import { monthEnd, monthStart } from "./payrollMonth.js";
import { DAY_FIELDS } from "./timesheetRow.js";

export const PERIODS = Object.freeze(["month", "last_month", "quarter", "year"]);

const amount = (v) => (v === null || v === undefined || v === "" ? 0 : v);

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

/**
 * Iznosi odobrenih satnica po danu perioda. Dani bez sati nemaju iznos (0).
 * @returns {Map<string, { revenue: number, cost: number, hours: number }>} samo dani unutar [from, to]
 */
export function amountsByDay(timesheets, from, to) {
  const days = new Map();
  for (const ts of timesheets || []) {
    if (!ts || ts.approval_status !== "approved" || !ts.week_start) continue;
    const weekStart = String(ts.week_start).slice(0, 10);
    const hours = DAY_FIELDS.map((f) => {
      const n = Number.parseFloat(ts[f]);
      return Number.isFinite(n) && n > 0 ? round2(n) : 0;
    });
    const hasHours = hours.some((h) => h > 0);
    // Satnica bez ijednog sata (ne bi trebalo) ne gubi iznos: ide na prvi dan nedelje.
    const weights = hasHours ? hours : [1, 0, 0, 0, 0, 0, 0];
    const revenue = allocate(amount(ts.client_revenue), weights);
    const cost = allocate(amount(ts.worker_cost), weights);
    weights.forEach((_, i) => {
      const date = addDays(weekStart, i);
      if ((hasHours && hours[i] === 0) || date < from || date > to) return;
      const d = days.get(date) || { revenue: [], cost: [], hours: [] };
      d.revenue.push(revenue[i]);
      d.cost.push(cost[i]);
      d.hours.push(hasHours ? hours[i] : 0);
      days.set(date, d);
    });
  }
  return new Map([...days].map(([k, d]) => [k, { revenue: sum2(d.revenue), cost: sum2(d.cost), hours: sum2(d.hours) }]));
}

/** KPI perioda iz iznosa po danu: prihod, trošak rada, zarada i marža. */
export function periodKpis(byDay) {
  const list = [...byDay.values()];
  const m = projectMargin({ revenue: sum2(list.map((d) => d.revenue)), laborCost: sum2(list.map((d) => d.cost)) });
  return { revenue: m.revenue, cost: m.laborCost, profit: m.remaining, marginPct: m.marginPct, hours: sum2(list.map((d) => d.hours)) };
}

/** Promena u odnosu na prethodni period u %; null kad nema osnovice (prethodni period je 0) — ne izmišlja se. */
export function changePct(current, previous) {
  const p = Number(previous);
  if (!Number.isFinite(p) || p === 0) return null;
  return round2(((Number(current) - p) / Math.abs(p)) * 100);
}

/**
 * Kumulativni red po danu za grafikon (prihod, trošak rada, zarada). Kumulativno, da linija pokazuje ukupno
 * od početka perioda do tog dana (kao na dizajnu). 
 */
export function cumulativeSeries(byDay, from, to) {
  let revenue = 0;
  let cost = 0;
  const series = [];
  for (const date of daysOf(from, to)) {
    const d = byDay.get(date);
    revenue = sum2([revenue, d?.revenue || 0]);
    cost = sum2([cost, d?.cost || 0]);
    series.push({ date, revenue, cost, profit: round2(revenue - cost) });
  }
  return series;
}

const marginOf = (revenue, profit) => (revenue > 0 ? round2((profit / revenue) * 100) : null);

/** Najbolji po zaradi: grupe po ključu, sortirane po zaradi (opadajuće), najviše `limit`. Grupa bez ključa se preskače. */
function topBy(timesheets, keyOf, limit) {
  const groups = new Map();
  for (const ts of timesheets || []) {
    if (ts?.approval_status !== "approved") continue;
    const key = keyOf(ts);
    if (key === null || key === undefined) continue;
    const g = groups.get(key) || { revenue: [], cost: [], hours: [] };
    g.revenue.push(amount(ts.client_revenue));
    g.cost.push(amount(ts.worker_cost));
    g.hours.push(amount(ts.total_hours));
    groups.set(key, g);
  }
  return [...groups]
    .map(([id, g]) => {
      const revenue = sum2(g.revenue);
      const profit = round2(revenue - sum2(g.cost));
      return { id, revenue, profit, hours: sum2(g.hours), marginPct: marginOf(revenue, profit) };
    })
    .filter((r) => r.revenue > 0 || r.hours > 0)
    .sort((a, b) => b.profit - a.profit || b.revenue - a.revenue)
    .slice(0, limit);
}

/**
 * Najprofitabilniji projekti, klijenti i radnici iz odobrenih satnica PERIODA (cele satnice čiji je početak nedelje
 * u periodu; za ove liste nedelja se ne deli po danu).
 * Klijent je klijent projekta satnice (`project_id` → `projects.client_id`).
 */
export function topLists(timesheets, projects, limit = 5) {
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  return {
    projects: topBy(timesheets, (ts) => ts.project_id ?? null, limit),
    clients: topBy(timesheets, (ts) => (ts.project_id ? projectById.get(ts.project_id)?.client_id ?? null : null), limit),
    workers: topBy(timesheets, (ts) => ts.employee_id ?? null, limit),
  };
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

/**
 * Filter kontrolne table po projektu i/ili klijentu (spec §3.1). Prazan/"all" filter = bez ograničenja.
 * Klijent satnice je klijent njenog projekta (`projects.client_id`).
 */
export function filterTimesheets(timesheets, projects, { projectId = "", clientId = "" } = {}) {
  const pid = projectId && projectId !== "all" ? projectId : "";
  const cid = clientId && clientId !== "all" ? clientId : "";
  if (!pid && !cid) return timesheets || [];
  const projectById = new Map((projects || []).map((p) => [p.id, p]));
  return (timesheets || []).filter((ts) => {
    if (pid && ts.project_id !== pid) return false;
    if (cid && projectById.get(ts.project_id)?.client_id !== cid) return false;
    return true;
  });
}
