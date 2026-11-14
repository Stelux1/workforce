// Obračunski parametri za zarade u Srbiji.
// Iznosi su u RSD jer ih tako propisuje država. Pre obračuna se preračunavaju u EUR po kursu za taj mesec.
//
// Izvor (proveriti u Službenom glasniku pre zvanične upotrebe):
//  - neoporezivi iznos 34.221 RSD, najniža osnovica 51.297 RSD, najviša osnovica 732.820 RSD (važi od 1.1.2026)
//  - porez na zarade 10%; doprinosi zaposlenog 14% PIO + 5,15% zdravstvo + 0,75% nezaposlenost = 19,9%
//  - doprinosi poslodavca 10% PIO + 5,15% zdravstvo = 15,15%
// U aplikaciji se parametri čuvaju u bazi sa datumom važenja; ovo su samo početne vrednosti.

export const PARAMS_2026_RSD = Object.freeze({
  validFrom: "2026-01-01",
  currency: "RSD",
  taxRate: 0.1,
  nonTaxable: 34221,
  minBase: 51297,
  maxBase: 732820,
  employee: Object.freeze({ pio: 0.14, health: 0.0515, unemployment: 0.0075 }),
  employer: Object.freeze({ pio: 0.1, health: 0.0515 }),
});

// Kolone tabele payroll_params (i snimka u payroll_runs.params) — sve moraju biti upisane, nema podrazumevanih stopa.
const PARAM_COLUMNS = Object.freeze([
  "tax_rate", "non_taxable_rsd", "min_base_rsd", "max_base_rsd",
  "emp_pio", "emp_health", "emp_unemployment", "er_pio", "er_health",
]);

const day = (v) => (v ? String(v).slice(0, 10) : "");

/**
 * Red iz payroll_params (ili snimak payroll_runs.params) → parametri u obliku PARAMS_2026_RSD.
 * Polje koje fali ili nije broj → greška sa spiskom polja (porez i doprinosi se ne izmišljaju).
 */
export function paramsFromRow(row) {
  if (!row || typeof row !== "object") throw new Error("Nema obračunskih parametara (porez i doprinosi)");
  const missing = PARAM_COLUMNS.filter((c) => {
    const v = row[c];
    return v === null || v === undefined || v === "" || !Number.isFinite(Number(v));
  });
  if (missing.length || !day(row.valid_from)) {
    throw new Error(`Obračunski parametri nisu potpuni: ${[...missing, ...(day(row.valid_from) ? [] : ["valid_from"])].join(", ")}`);
  }
  const n = (c) => Number(row[c]);
  return Object.freeze({
    validFrom: day(row.valid_from),
    currency: "RSD",
    taxRate: n("tax_rate"),
    nonTaxable: n("non_taxable_rsd"),
    minBase: n("min_base_rsd"),
    maxBase: n("max_base_rsd"),
    employee: Object.freeze({ pio: n("emp_pio"), health: n("emp_health"), unemployment: n("emp_unemployment") }),
    employer: Object.freeze({ pio: n("er_pio"), health: n("er_health") }),
  });
}

/**
 * Parametri koji važe za mesec: red sa najkasnijim `valid_from` koji nije posle prvog dana meseca.
 * Isto pravilo koristi baza (save_payroll_draft / guard_payroll_run, migracija 20261114200000).
 * @param {Array} rows   redovi payroll_params
 * @param {string} month "YYYY-MM-01"
 * @returns {object} sirov red (za slanje bazi) — u parametre ga pretvara paramsFromRow
 */
export function paramsRowForMonth(rows, month) {
  const m = day(month);
  const hit = (rows || [])
    .filter((r) => r && day(r.valid_from) && day(r.valid_from) <= m)
    .sort((a, b) => day(b.valid_from).localeCompare(day(a.valid_from)))[0];
  if (!hit) {
    throw new Error(`Nema obračunskih parametara (porez i doprinosi) koji važe za mesec ${m.slice(5, 7)}.${m.slice(0, 4)}`);
  }
  return hit;
}

/**
 * Preračunaj parametre iz RSD u EUR po kursu (koliko dinara vredi 1 EUR).
 * Bez kursa obračun ne sme da krene — nema podrazumevane vrednosti.
 */
export function paramsInEur(params, eurRsdRate) {
  const rate = Number(eurRsdRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Kurs EUR/RSD za mesec nije unet");
  }
  if (params.currency === "EUR") return params;
  return Object.freeze({
    ...params,
    currency: "EUR",
    eurRsdRate: rate,
    nonTaxable: params.nonTaxable / rate,
    minBase: params.minBase / rate,
    maxBase: params.maxBase / rate,
  });
}
