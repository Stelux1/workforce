// Troškovi projekta u EUR (D2: sve u EUR). Čiste funkcije, ništa se ne čita iz baze.
//
// Trošak u RSD nosi kurs koji admin unese uz trošak (`eur_rsd_rate` = koliko RSD vredi 1 EUR) i EUR iznos
// (`eur_amount`) koji računa baza — trigger guard_project_cost u
// supabase/migrations/20261114220000_troskovi_kurs.sql: round(amount / kurs, 2), pola od nule, kao round2.
// Isti primeri su u payroll.test.js („isti primer kao pgTAP 06") i u supabase/tests/06_troskovi_kurs.test.sql.
//
// Trošak u RSD bez kursa (stari red, pre migracije) NEMA EUR iznos: ne računa se kao 0 i ne sabira se kao RSD
// u EUR — zbir ga vraća u `missingRate`, a ekran ga prikazuje kao „nedostaje kurs".
//
// K3 / T28 (migracija 20261125050000_troskovi_c1.sql): trošak van EUR ulazi u EUR zbir samo uz kurs I datum kursa
// (`fx_rate_date`). Stari red sa kursom, ali bez datuma, NIJE u zbiru: vraća se u `undatedRate` („datum kursa nije
// evidentiran"), a radi postojećih ekrana i u `missingRate`/`missingByCurrency` (oni znaju samo „nije u zbiru").
// Valute su EUR, RSD, GBP, USD; kurs je uvek „jedinica valute za 1 EUR".

import { round2, sum2 } from "./money.js";
import { CURRENCIES, costEurAmount } from "../finance/currency.js";

export const COST_CURRENCIES = CURRENCIES;

/** Valuta troška; prazna valuta je EUR (podrazumevana vrednost kolone u bazi). */
export const costCurrency = (cost) => cost?.currency || "EUR";

/** Kurs > 0 kao broj (prima i decimalni zarez: „117,2"), ili null (prazno, 0, negativno, tekst). */
export function validExchangeRate(rate) {
  const t = String(rate ?? "").trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Iznos u RSD preračunat u EUR po kursu (RSD za 1 EUR) — isto kao baza. Bez kursa > 0 → null, nikad 0. */
export function rsdToEur(amount, rate) {
  const r = validExchangeRate(rate);
  if (r === null) return null;
  return round2(Number(amount) / r);
}

/**
 * EUR iznos troška ili null kad trošak nije u EUR i nema kurs ili datum kursa (K3).
 * Važi iznos koji je izračunala baza (`eur_amount`); samo kad ga nema računa se iz iznosa i kursa po istom pravilu.
 * Pregled u formi pre čuvanja (kurs bez datuma) ide kroz `rsdToEur`, ne kroz ovu funkciju.
 */
export function costInEur(cost) {
  return costEurAmount({ ...cost, currency: costCurrency(cost) }).eur;
}

/**
 * Zbir troškova u EUR (u centima, bez float greške).
 *   total       — EUR troškovi + troškovi u drugoj valuti preračunati po svom kursu i datumu kursa;
 *   missingRate — troškovi koji nisu u EUR i nemaju kurs ILI datum kursa: NISU u `total` (ekran mora da ih prikaže);
 *   missingByCurrency — njihov iznos u originalnoj valuti (npr. { RSD: 12000 }), samo za prikaz;
 *   undatedRate / undatedByCurrency — podskup: imaju kurs, ali nemaju datum kursa (stari redovi, R9);
 *   converted   — po valuti koja nije EUR: originalni iznos i EUR iznos uračunatih troškova (npr. { RSD: { amount, eur } }).
 */
export function sumCostsEur(costs = []) {
  const eurParts = [];
  const missingRate = [];
  const undatedRate = [];
  const missingAmounts = {};
  const undatedAmounts = {};
  const convertedAmounts = {};
  for (const cost of costs || []) {
    const currency = costCurrency(cost);
    const conv = costEurAmount({ ...cost, currency });
    const eur = conv.eur;
    if (eur === null) {
      missingRate.push(cost);
      (missingAmounts[currency] ||= []).push(cost?.amount ?? 0);
      if (conv.reason === "rate_without_date") {
        undatedRate.push(cost);
        (undatedAmounts[currency] ||= []).push(cost?.amount ?? 0);
      }
      continue;
    }
    eurParts.push(eur);
    if (currency !== "EUR") {
      const c = (convertedAmounts[currency] ||= { amount: [], eur: [] });
      c.amount.push(cost?.amount ?? 0);
      c.eur.push(eur);
    }
  }
  const missingByCurrency = Object.fromEntries(Object.entries(missingAmounts).map(([cur, list]) => [cur, sum2(list)]));
  const undatedByCurrency = Object.fromEntries(Object.entries(undatedAmounts).map(([cur, list]) => [cur, sum2(list)]));
  const converted = Object.fromEntries(
    Object.entries(convertedAmounts).map(([cur, c]) => [cur, { amount: sum2(c.amount), eur: sum2(c.eur) }])
  );
  return { total: sum2(eurParts), counted: eurParts.length, missingRate, missingByCurrency, undatedRate, undatedByCurrency, converted };
}
