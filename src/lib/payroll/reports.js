// Zbirovi odobrenih satnica za Kontrolnu tablu obračuna, Izveštaje o platama i Klijente (Faza 4).
//
// Grupiše se isključivo po ID-u: radnik po `employee_id`, projekat po `project_id`, klijent po `client_id`
// projekta satnice (`project_id` → `projects.client_id`; satnica nema svoj client_id). Ime je samo za prikaz
// i čita se iz trenutnog reda projekta/klijenta po ID-u, pa preimenovanje klijenta ili projekta ne menja
// nijednu brojku. Snimci imena u redu (`timesheets.client_name`, `timesheets.project`) se nikad ne koriste
// za grupisanje.
//
// Satnice bez ID-a (stari ručno uneti projekat, projekat bez klijenta) idu u posebnu grupu `unassigned`
// (`id: null`) — ne spajaju se ni sa kim po imenu.
//
// Iznosi su već izračunati u bazi (D16); ovde se samo sabiraju u centima (`sum2`). Koje satnice ulaze
// (odobrene) bira stranica.

import { round2, sum2 } from "./money.js";
import { projectMargin } from "./monthly.js";
import { sumCostsEur } from "./costs.js";

/** React ključ / oznaka grupe bez ID-a („bez projekta / ručno uneto"). */
export const UNASSIGNED_KEY = "bez-id";

// Prazan iznos (null) sabira se kao 0 — sum2 bi inače bacio grešku na undefined.
const amount = (v) => (v === null || v === undefined || v === "" ? 0 : v);

const byId = (list) => new Map((list || []).filter((x) => x && x.id != null).map((x) => [x.id, x]));

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = keyOf(row) ?? null;
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

const firstValue = (rows, field) => rows.find((r) => r[field])?.[field] ?? null;
const distinctValues = (rows, field) => [...new Set(rows.map((r) => r[field]).filter(Boolean))];
const groupHeader = (id) => ({ id, key: id ?? UNASSIGNED_KEY, unassigned: id === null });

/** Zbir sati, troška radnika, prihoda i zarade za listu satnica (u centima, bez float greške). */
export function timesheetTotals(rows) {
  const list = rows || [];
  return {
    hours: sum2(list.map((r) => amount(r.total_hours))),
    cost: sum2(list.map((r) => amount(r.worker_cost))),
    revenue: sum2(list.map((r) => amount(r.client_revenue))),
    profit: sum2(list.map((r) => amount(r.profit))),
    count: list.length,
  };
}

/** Klijent satnice = klijent njenog projekta po ID-u; null ako satnica nema projekat ili projekat nema klijenta. */
export function clientIdOf(timesheet, projectById) {
  if (!timesheet?.project_id) return null;
  return projectById.get(timesheet.project_id)?.client_id ?? null;
}

/**
 * Po radniku (`employee_id`). Ime je snimak iz prvog reda koji ga ima (stranice čitaju `-week_start`, pa je to
 * najnoviji). `avgRate` = trošak / sati (prosečna satnica, ne tarifa prvog reda).
 */
export function totalsByWorker(timesheets) {
  return [...groupBy(timesheets, (ts) => ts.employee_id).entries()].map(([id, rows]) => {
    const t = timesheetTotals(rows);
    return { ...groupHeader(id), name: firstValue(rows, "employee_name"), ...t, avgRate: t.hours > 0 ? round2(t.cost / t.hours) : 0 };
  });
}

/**
 * Po klijentu (`project_id` → `projects.client_id`). Ime iz trenutnog reda klijenta; ako red klijenta nije
 * učitan, snimak sa projekta (samo za prikaz). `avgRate` = prihod / sati.
 * Grupa bez klijenta (`unassigned`) nosi `snapshotNames` — imena iz redova, samo za prikaz.
 */
export function totalsByClient(timesheets, projects, clients) {
  const projectById = byId(projects);
  const clientById = byId(clients);
  return [...groupBy(timesheets, (ts) => clientIdOf(ts, projectById)).entries()].map(([id, rows]) => {
    const t = timesheetTotals(rows);
    const head = groupHeader(id);
    const name = id === null
      ? null
      : clientById.get(id)?.name ?? rows.map((r) => projectById.get(r.project_id)?.client_name).find(Boolean) ?? null;
    return {
      ...head,
      name,
      ...(head.unassigned ? { snapshotNames: distinctValues(rows, "client_name") } : {}),
      ...t,
      avgRate: t.hours > 0 ? round2(t.revenue / t.hours) : 0,
    };
  });
}

/**
 * Ostali troškovi projekta u EUR (D2, D19): EUR troškovi + troškovi u RSD preračunati po kursu unetom uz trošak
 * (`sumCostsEur`). `rsd` = RSD troškovi BEZ kursa — nisu uračunati ni kao 0 ni kao RSD, ekran ih prikazuje posebno.
 */
export function projectCostTotals(costs) {
  const s = sumCostsEur(costs || []);
  return { eur: s.total, rsd: s.missingByCurrency.RSD || 0 };
}

/** Finansije jednog skupa satnica i troškova: ostaje nama = prihod − trošak radnika − troškovi (EUR), D8. */
export function projectFinancials(timesheets, costs) {
  const t = timesheetTotals(timesheets);
  const c = projectCostTotals(costs);
  const m = projectMargin({ revenue: t.revenue, laborCost: t.cost, otherCosts: c.eur });
  return {
    hours: t.hours,
    count: t.count,
    revenue: m.revenue,
    workerCost: m.laborCost,
    costsEUR: c.eur,
    costsRSD: c.rsd,
    profit: m.remaining,
    marginPct: m.marginPct,
  };
}

/**
 * Pregled svih projekata (po `project_id`), sortiran po prihodu. Projekat bez sati i bez troškova u EUR se ne
 * prikazuje. Satnice čiji projekat nije na listi dobijaju svoj red sa snimkom imena (samo prikaz), a satnice
 * bez projekta jedan red `unassigned` sa `snapshotNames`.
 */
export function projectSummary({ timesheets, projects, costs }) {
  const tsByProject = groupBy(timesheets, (ts) => ts.project_id);
  const costsByProject = groupBy(costs, (c) => c.project_id);
  const rows = (projects || []).map((p) => ({
    ...groupHeader(p.id),
    name: p.name,
    ...projectFinancials(tsByProject.get(p.id), costsByProject.get(p.id)),
  }));
  const known = new Set(rows.map((r) => r.id));
  for (const [id, tsRows] of tsByProject) {
    if (id === null || known.has(id)) continue;
    rows.push({ ...groupHeader(id), name: firstValue(tsRows, "project"), ...projectFinancials(tsRows, costsByProject.get(id)) });
  }
  const manual = tsByProject.get(null);
  if (manual) rows.push({ ...groupHeader(null), name: null, snapshotNames: distinctValues(manual, "project"), ...projectFinancials(manual, []) });
  return rows.filter((r) => r.hours > 0 || r.costsEUR > 0).sort((a, b) => b.revenue - a.revenue);
}
