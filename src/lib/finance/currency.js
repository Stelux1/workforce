// Valute (D30 K3, spec §10, T28). Čiste funkcije, ništa se ne čita iz baze.
//
// Pravilo: iznos uvek nosi valutu, a agregat je UVEK po valuti ({ EUR: 123.45, RSD: 1000 }) — nikad jedan broj
// sabran iz više valuta. Konverzija u jednu valutu postoji samo kao izričit izbor korisnika („Prikaži u EUR")
// i uvek vraća koji kurs i koji datum kursa su korišćeni (`used`); valuta bez kursa ide u `missing` i NIJE u zbiru.
//
// Kurs je svuda „jedinica valute za 1 EUR" (exchange_rates.units_per_eur, project_costs.eur_rsd_rate), uz datum kursa.
// Zaokruživanje je isto kao u bazi: round(numeric, 2), pola od nule (round2 iz payroll/money.js).

import { round2 } from "../payroll/money.js";

/** Dozvoljene valute — iste kao check ograničenja u bazi (rates, timesheets, payables, billing, project_costs). */
export const CURRENCIES = Object.freeze(["EUR", "RSD", "GBP", "USD"]);
export const BASE_CURRENCY = "EUR";

/** Normalizuje oznaku valute; prazna = EUR (podrazumevana vrednost kolona u bazi). Nepoznata valuta je greška. */
export function normalizeCurrency(currency) {
  const c = String(currency ?? "").trim().toUpperCase();
  if (c === "") return BASE_CURRENCY;
  if (!CURRENCIES.includes(c)) throw new Error(`Nepoznata valuta: ${currency}`);
  return c;
}

/** Iznos sa valutom, zaokružen na cent. */
export function money(amount, currency = BASE_CURRENCY) {
  return { amount: round2(amount), currency: normalizeCurrency(currency) };
}

const toCents = (v) => Math.round(round2(v) * 100);

/**
 * Zbir po valuti, u centima (bez float greške). Stavka čiji je iznos null/undefined/"" se preskače (nije 0).
 * @returns {Record<string, number>} npr. { EUR: 123.45, RSD: 1000 } — samo valute koje postoje u stavkama.
 */
export function sumByCurrency(items = [], { amountOf = (i) => i?.amount, currencyOf = (i) => i?.currency } = {}) {
  const cents = {};
  for (const item of items || []) {
    const amount = amountOf(item);
    if (amount === null || amount === undefined || amount === "") continue;
    const cur = normalizeCurrency(currencyOf(item));
    cents[cur] = (cents[cur] || 0) + toCents(amount);
  }
  return fromCents(cents);
}

/** Sabira više mapa po valuti ({EUR:1}+{EUR:2,RSD:3} → {EUR:3,RSD:3}). */
export function addByCurrency(...maps) {
  const cents = {};
  for (const m of maps) {
    for (const [cur, v] of Object.entries(m || {})) {
      if (v === null || v === undefined) continue;
      cents[normalizeCurrency(cur)] = (cents[normalizeCurrency(cur)] || 0) + toCents(v);
    }
  }
  return fromCents(cents);
}

/** a − b po valuti; valuta koja postoji samo u b daje negativan iznos. */
export function subtractByCurrency(a = {}, b = {}) {
  const neg = Object.fromEntries(Object.entries(b || {}).map(([k, v]) => [k, -Number(v)]));
  return addByCurrency(a, neg);
}

function fromCents(cents) {
  const out = {};
  for (const cur of sortCurrencies(Object.keys(cents))) {
    const v = cents[cur] / 100;
    out[cur] = v === 0 ? 0 : v;
  }
  return out;
}

/** Stabilan redosled prikaza: EUR, RSD, GBP, USD. */
export function sortCurrencies(list) {
  return [...new Set(list)].sort((a, b) => CURRENCIES.indexOf(a) - CURRENCIES.indexOf(b));
}

/**
 * Kurs za valutu na datum: red iz exchange_rates sa najkasnijim rate_date ≤ date (bez datuma: najnoviji).
 * EUR je uvek 1. Nema kursa → null.
 * @returns {{currency, unitsPerEur, rateDate, source}|null}
 */
export function rateFor(currency, exchangeRates = [], date = null) {
  const cur = normalizeCurrency(currency);
  if (cur === BASE_CURRENCY) return { currency: cur, unitsPerEur: 1, rateDate: null, source: null };
  let best = null;
  for (const r of exchangeRates || []) {
    if (normalizeCurrency(r?.currency) !== cur) continue;
    const units = Number(r?.units_per_eur);
    if (!Number.isFinite(units) || units <= 0) continue;
    const d = String(r?.rate_date ?? "").slice(0, 10);
    if (!d || (date && d > date)) continue;
    if (!best || d > best.rateDate) best = { currency: cur, unitsPerEur: units, rateDate: d, source: r?.source ?? null };
  }
  return best;
}

/**
 * Konverzija zbira po valuti u jednu valutu (podrazumevano EUR) po kursu na datum.
 * Svaka valuta se preračuna i zaokruži na cent posebno, pa se sabere (kao baza).
 * @returns {{to, date, total:number, used:[{currency, unitsPerEur, rateDate, source}], missing:string[]}}
 *   `total` sadrži samo valute sa kursom; `missing` su valute bez kursa (NISU u `total`, ekran ih mora prikazati).
 */
export function convertTotals(byCurrency = {}, exchangeRates = [], { to = BASE_CURRENCY, date = null } = {}) {
  const target = normalizeCurrency(to);
  const targetRate = rateFor(target, exchangeRates, date);
  const used = [];
  const missing = [];
  let cents = 0;
  let convertedAny = false;
  for (const cur of sortCurrencies(Object.keys(byCurrency || {}).map(normalizeCurrency))) {
    const amount = Number(byCurrency[cur] ?? byCurrency[cur.toLowerCase()]);
    if (!Number.isFinite(amount)) continue;
    if (cur === target) {
      cents += toCents(amount);
      continue;
    }
    const from = rateFor(cur, exchangeRates, date);
    if (!from || !targetRate) {
      missing.push(cur);
      continue;
    }
    // iznos / (jedinica za 1 EUR) = EUR; EUR × (jedinica ciljne za 1 EUR) = ciljna valuta
    cents += toCents((amount / from.unitsPerEur) * targetRate.unitsPerEur);
    convertedAny = true;
    if (from.currency !== BASE_CURRENCY) used.push(from); // EUR je osnova, nema kurs
  }
  if (target !== BASE_CURRENCY && targetRate && convertedAny) used.push(targetRate);
  const total = cents / 100;
  return { to: target, date, total: total === 0 ? 0 : total, used, missing };
}

/**
 * EUR vrednost troška projekta po kursu koji je evidentiran NA SAMOM trošku (D19, §3.1 data modela).
 * EUR trošak → iznos. Ne-EUR trošak ulazi u EUR zbir samo kad ima `fx_rate_date` (datum kursa) i kurs/eur_amount;
 * stari red sa kursom bez datuma vraća `reason:'rate_without_date'` (prikazuje se odvojeno), bez kursa `'missing_rate'`.
 * @returns {{eur:number|null, currency, unitsPerEur:number|null, rateDate:string|null, reason:null|'rate_without_date'|'missing_rate'}}
 */
export function costEurAmount(cost) {
  const currency = normalizeCurrency(cost?.currency);
  const amount = Number(cost?.amount ?? 0);
  if (currency === BASE_CURRENCY) return { eur: round2(amount), currency, unitsPerEur: 1, rateDate: null, reason: null };
  const units = Number(String(cost?.eur_rsd_rate ?? "").replace(",", "."));
  const hasRate = Number.isFinite(units) && units > 0;
  const stored = cost?.eur_amount;
  const hasStored = stored !== null && stored !== undefined && stored !== "" && Number.isFinite(Number(stored));
  if (!hasRate && !hasStored) return { eur: null, currency, unitsPerEur: null, rateDate: null, reason: "missing_rate" };
  const rateDate = cost?.fx_rate_date ? String(cost.fx_rate_date).slice(0, 10) : null;
  if (!rateDate) return { eur: null, currency, unitsPerEur: hasRate ? units : null, rateDate: null, reason: "rate_without_date" };
  const eur = hasStored ? round2(Number(stored)) : round2(amount / units);
  return { eur, currency, unitsPerEur: hasRate ? units : null, rateDate, reason: null };
}
