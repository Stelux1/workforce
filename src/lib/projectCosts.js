// Project Costs (spec §8, T13, T14, T15, T28; docs/TEAMORA-DATA-MODEL.md §2.7).
// Čiste funkcije za oba pogleda na ISTI entitet (`project_costs`): Project → Costs kartica i Projects → Project Costs.
// Ništa se ne čita iz baze; pravila forme su ista kao u bazi (guard_project_cost, migracija 20261125050000), a baza je
// ta koja ih sprovodi — ovde služe da korisnik odmah vidi šta fali.
//
// Novac: agregat je UVEK po valuti ({ EUR: 120, RSD: 5000 }) — nikad jedan broj iz više valuta (T28). EUR ekvivalent
// postoji samo kao zaseban red i samo za troškove sa kursom I datumom kursa (`costEurAmount`); ostali su „bez kursa".
// Billable je samo oznaka (T15): ništa u ovom fajlu ne pravi račun, stavku računa ni prihod.

import { sumByCurrency, normalizeCurrency, CURRENCIES, costEurAmount } from "./finance/currency.js";
import { sum2 } from "./payroll/money.js";

/** „Bez razlike u velikim slovima i krajnjim razmacima" — isto kao cost_category_key u bazi. */
export const costKey = (value) => String(value ?? "").trim().toLowerCase();

const isoDay = (value) => (value ? String(value).slice(0, 10) : "");

/** Podkategorija kategorije je objekat { name } ili (stari zapis) string. */
export const subcategoryNames = (category) =>
  (Array.isArray(category?.subcategories) ? category.subcategories : [])
    .map((s) => (typeof s === "string" ? s : s?.name))
    .filter((n) => typeof n === "string" && n.trim() !== "");

export const categoryHasSubcategories = (category) => subcategoryNames(category).length > 0;

/** Trošak koji nije već u EUR i nema valjan kurs sa datumom: 'eur' | 'ok' | 'rate_without_date' | 'missing_rate'. */
export function costFxStatus(cost) {
  const currency = normalizeCurrency(cost?.currency);
  if (currency === "EUR") return "eur";
  const conv = costEurAmount({ ...cost, currency });
  return conv.reason === null ? "ok" : conv.reason;
}

/** Radnik, dobavljač ili nijedno (baza ne dozvoljava oba). */
export const costParty = (cost) => (cost?.employee_id ? "employee" : cost?.vendor_id ? "vendor" : null);

/** Isti trošak ne sme da se pojavi dvaput (T13): zadrži prvi red po id-u. */
export function uniqueCosts(costs = []) {
  const seen = new Set();
  const out = [];
  for (const c of costs || []) {
    if (!c) continue;
    if (c.id !== undefined && c.id !== null) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
    }
    out.push(c);
  }
  return out;
}

/**
 * Filteri centralne tabele i kartice (C1/C2). Prazna vrednost ili "all" = bez filtera.
 * @param {Array} costs
 * @param {{projectId?, clientId?, categoryId?, subcategory?, from?, to?, search?, billable?}} filters
 *   `from`/`to` su datumi (yyyy-MM-dd) uključivo, po `cost_date`; `billable` je "yes" | "no".
 * @param {{projects?: Array, employees?: Array, vendors?: Array}} lookup za filter po klijentu i pretragu po imenima
 */
export function filterCosts(costs = [], filters = {}, lookup = {}) {
  const has = (v) => v !== undefined && v !== null && v !== "" && v !== "all";
  const projectsById = new Map((lookup.projects || []).map((p) => [p.id, p]));
  const employeesById = new Map((lookup.employees || []).map((e) => [e.id, e]));
  const vendorsById = new Map((lookup.vendors || []).map((v) => [v.id, v]));
  const q = costKey(filters.search);
  const from = has(filters.from) ? isoDay(filters.from) : "";
  const to = has(filters.to) ? isoDay(filters.to) : "";

  return (costs || []).filter((c) => {
    if (!c) return false;
    if (has(filters.projectId) && c.project_id !== filters.projectId) return false;
    if (has(filters.clientId) && projectsById.get(c.project_id)?.client_id !== filters.clientId) return false;
    if (has(filters.categoryId)) {
      if (filters.categoryId === "none") {
        if (c.cost_category_id) return false;
      } else if (c.cost_category_id !== filters.categoryId) return false;
    }
    if (has(filters.subcategory) && costKey(c.subcategory) !== costKey(filters.subcategory)) return false;
    const day = isoDay(c.cost_date);
    if (from && (!day || day < from)) return false;
    if (to && (!day || day > to)) return false;
    if (filters.billable === "yes" && !c.billable) return false;
    if (filters.billable === "no" && c.billable) return false;
    if (q) {
      const emp = employeesById.get(c.employee_id);
      const hay = [
        c.description, c.notes, c.category, c.subcategory, c.receipt_name,
        projectsById.get(c.project_id)?.name, projectsById.get(c.project_id)?.client_name,
        emp && `${emp.first_name || ""} ${emp.last_name || ""}`, emp?.employee_id,
        vendorsById.get(c.vendor_id)?.name,
      ].map(costKey).join("\n");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const SORT_VALUE = {
  cost_date: (c) => isoDay(c.cost_date),
  project: (c, ctx) => costKey(ctx.projectName(c)),
  category: (c) => costKey(c.category),
  subcategory: (c) => costKey(c.subcategory),
  amount: (c) => Number(c.amount) || 0,
  currency: (c) => String(c.currency || "EUR"),
};

/** Sortiranje (C2): stabilno, praznine na kraju; `key` je jedan od cost_date, project, category, subcategory, amount, currency. */
export function sortCosts(costs = [], { key = "cost_date", dir = "desc" } = {}, lookup = {}) {
  const read = SORT_VALUE[key] || SORT_VALUE.cost_date;
  const projectsById = new Map((lookup.projects || []).map((p) => [p.id, p]));
  const ctx = { projectName: (c) => projectsById.get(c.project_id)?.name || "" };
  const sign = dir === "asc" ? 1 : -1;
  return (costs || [])
    .map((c, i) => ({ c, i, v: read(c, ctx) }))
    .sort((a, b) => {
      const ae = a.v === "" || a.v === null;
      const be = b.v === "" || b.v === null;
      if (ae !== be) return ae ? 1 : -1;
      if (a.v < b.v) return -sign;
      if (a.v > b.v) return sign;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

/** Zbir po valuti za prikazane troškove (T28). */
export const costTotalsByCurrency = (costs = []) => sumByCurrency(costs, { amountOf: (c) => c?.amount, currencyOf: (c) => c?.currency });

/**
 * EUR ekvivalent za pregled „Prikaži u EUR": samo troškovi sa kursom i datumom kursa; ostali su odvojeno.
 * @returns {{ eur:number, counted:number, rates:[{currency,unitsPerEur,rateDate}], excluded:{missingRate:Array, rateWithoutDate:Array} }}
 */
export function costsEurEquivalent(costs = []) {
  const parts = [];
  const rates = new Map();
  const missingRate = [];
  const rateWithoutDate = [];
  for (const c of costs || []) {
    const conv = costEurAmount({ ...c, currency: normalizeCurrency(c?.currency) });
    if (conv.eur !== null) {
      parts.push(conv.eur);
      if (conv.currency !== "EUR") rates.set(`${conv.currency}|${conv.unitsPerEur}|${conv.rateDate}`, { currency: conv.currency, unitsPerEur: conv.unitsPerEur, rateDate: conv.rateDate });
    } else if (conv.reason === "rate_without_date") rateWithoutDate.push(c);
    else missingRate.push(c);
  }
  return { eur: sum2(parts), counted: parts.length, rates: [...rates.values()], excluded: { missingRate, rateWithoutDate } };
}

/**
 * Analitika po kategorijama (C2): po kategoriji broj troškova i zbir PO VALUTI. Troškovi bez povezane kategorije
 * idu u red `none` (ostaju vidljivi, R9). Redosled: više troškova prvo, pa naziv.
 * @returns {Array<{key, name, count, byCurrency}>}
 */
export function costsByCategory(costs = [], categories = []) {
  const byId = new Map((categories || []).map((c) => [c.id, c]));
  const groups = new Map();
  for (const c of costs || []) {
    const key = c.cost_category_id || "none";
    const g = groups.get(key) || { key, name: key === "none" ? null : byId.get(key)?.name || c.category || null, items: [] };
    g.items.push(c);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ key: g.key, name: g.name, count: g.items.length, byCurrency: costTotalsByCurrency(g.items) }))
    .sort((a, b) => (a.key === "none") - (b.key === "none") || b.count - a.count || String(a.name).localeCompare(String(b.name), "sr"));
}

/** Redovi za jednu valutu (grafikon po kategorijama), od najvećeg iznosa. */
export const categoryRowsForCurrency = (rows = [], currency) =>
  rows.filter((r) => r.byCurrency[currency]).map((r) => ({ ...r, amount: r.byCurrency[currency] })).sort((a, b) => b.amount - a.amount);

export const hasPerm = (perms, code) => {
  if (!perms) return false;
  if (typeof perms === "function") return !!perms(code);
  if (typeof perms.has === "function") return !!perms.has(code);
  if (typeof perms.can === "function") return !!perms.can(code);
  return Array.isArray(perms) && perms.includes(code);
};

/** Kolone izvoza; `labels` po jeziku se dodaju u projectCostsExport.js. */
export const COST_EXPORT_KEYS = Object.freeze([
  "cost_date", "project", "client", "category", "subcategory", "description", "worker", "vendor",
  "amount", "currency", "eur_rsd_rate", "fx_rate_date", "billable", "receipt", "notes",
]);

/**
 * Redovi za izvoz (CSV/Excel/PDF) CELOG filtriranog skupa. Druga linija odbrane: bez prava `costs.view` nema redova
 * (server ih ionako ne vraća). Iznos je izvorni (u svojoj valuti), uz kurs i datum kursa kad postoje; ništa se ne sabira
 * u jednu valutu. Datum ostaje ISO, a link priloga se ne izvozi (potpisan link ističe) — samo naziv fajla.
 */
export function costExportRows(costs = [], perms, lookup = {}) {
  if (!hasPerm(perms, "costs.view")) return [];
  const projectsById = new Map((lookup.projects || []).map((p) => [p.id, p]));
  const employeesById = new Map((lookup.employees || []).map((e) => [e.id, e]));
  const vendorsById = new Map((lookup.vendors || []).map((v) => [v.id, v]));
  return (costs || []).map((c) => {
    const project = projectsById.get(c.project_id);
    const emp = employeesById.get(c.employee_id);
    return {
      cost_date: isoDay(c.cost_date),
      project: project ? (project.project_number ? `${project.project_number} — ${project.name}` : project.name) : "",
      client: project?.client_name || "",
      category: c.category || "",
      subcategory: c.subcategory || "",
      description: c.description || "",
      worker: emp ? `${emp.first_name || ""} ${emp.last_name || ""}`.trim() : "",
      vendor: vendorsById.get(c.vendor_id)?.name || "",
      amount: Number(c.amount) || 0,
      currency: c.currency || "EUR",
      eur_rsd_rate: c.currency && c.currency !== "EUR" && c.eur_rsd_rate !== null && c.eur_rsd_rate !== undefined ? Number(c.eur_rsd_rate) : null,
      fx_rate_date: c.currency && c.currency !== "EUR" ? isoDay(c.fx_rate_date) : "",
      billable: !!c.billable,
      receipt: c.receipt_name || "",
      notes: c.notes || "",
    };
  });
}

/**
 * Mogući duplikat (samo upozorenje): isti projekat, datum, iznos i valuta kao neki drugi trošak.
 * @returns {Array} troškovi koji se poklapaju (prazan niz = nema upozorenja)
 */
export function possibleDuplicate(cost, costs = []) {
  if (!cost?.project_id || !cost?.cost_date || cost.amount === "" || cost.amount === null || cost.amount === undefined) return [];
  const amount = Math.round(Number(cost.amount) * 100);
  if (!Number.isFinite(amount)) return [];
  const currency = cost.currency || "EUR";
  return (costs || []).filter((c) =>
    c && c.id !== cost.id && c.project_id === cost.project_id && isoDay(c.cost_date) === isoDay(cost.cost_date)
    && Math.round(Number(c.amount) * 100) === amount && (c.currency || "EUR") === currency);
}

/**
 * Provera forme pre slanja — ista pravila kao baza (guard_project_cost), da korisnik odmah vidi šta fali.
 * @param {object} form  { project_id, cost_date, amount, currency, cost_category_id, subcategory, eur_rsd_rate, fx_rate_date, employee_id, vendor_id }
 * @param {{categories: Array, original?: object}} ctx  `original` = red koji se menja (stari ne-EUR red bez datuma kursa može da se menja bez promene kursa)
 * @returns {Record<string, string>} polje → šifra greške (prazno = ispravno)
 */
export function validateCostForm(form, { categories = [] } = {}) {
  const errors = {};
  if (!form.project_id) errors.project_id = "required";
  if (!isoDay(form.cost_date)) errors.cost_date = "required";
  const amount = Number(String(form.amount ?? "").replace(",", "."));
  if (form.amount === "" || form.amount === null || form.amount === undefined || !Number.isFinite(amount)) errors.amount = "required";
  else if (amount < 0) errors.amount = "negative";
  const currency = String(form.currency || "").toUpperCase();
  if (!CURRENCIES.includes(currency)) errors.currency = "required";

  const category = (categories || []).find((c) => c.id === form.cost_category_id);
  if (!form.cost_category_id) errors.cost_category_id = "required";
  else if (!category) errors.cost_category_id = "unknown";
  else if (category.payroll_linked) errors.cost_category_id = "payroll_linked";
  else if (categoryHasSubcategories(category)) {
    if (!costKey(form.subcategory)) errors.subcategory = "required";
    else if (!subcategoryNames(category).some((n) => costKey(n) === costKey(form.subcategory))) errors.subcategory = "unknown";
  }

  if (currency && currency !== "EUR" && CURRENCIES.includes(currency)) {
    const rate = Number(String(form.eur_rsd_rate ?? "").replace(",", "."));
    if (!(Number.isFinite(rate) && rate > 0)) errors.eur_rsd_rate = "required";
    if (!isoDay(form.fx_rate_date)) errors.fx_rate_date = "required";
  }
  if (form.employee_id && form.vendor_id) errors.employee_id = "one_party";
  return errors;
}

/** Podaci za upis iz forme (bez polja koja računa baza: eur_amount, category/subcategory snimak se menja po kategoriji). */
export function buildCostPayload(form) {
  const currency = String(form.currency || "EUR").toUpperCase();
  const num = (v) => Number(String(v).replace(",", "."));
  return {
    project_id: form.project_id,
    cost_date: isoDay(form.cost_date),
    amount: num(form.amount),
    currency,
    eur_rsd_rate: currency === "EUR" ? null : num(form.eur_rsd_rate),
    fx_rate_date: currency === "EUR" ? null : isoDay(form.fx_rate_date) || null,
    cost_category_id: form.cost_category_id,
    subcategory: form.subcategory || null,
    employee_id: form.employee_id || null,
    vendor_id: form.vendor_id || null,
    billable: !!form.billable,
    description: String(form.description ?? "").trim() || null,
    notes: String(form.notes ?? "").trim() || null,
  };
}

/** Iznos za prikaz: 1.234,50 EUR po jeziku; valuta uvek uz iznos. */
export function formatMoney(amount, currency, locale = "en-GB") {
  const n = Number(amount);
  const text = (Number.isFinite(n) ? n : 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ${currency || "EUR"}`;
}
