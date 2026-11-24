// Prikaz iznosa na kontrolnoj tabli. Sve je u EUR (D2); od 1.000 naviše bez centi („€124,560"), ispod sa centima.
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatEur(value) {
  const n = Number(value) || 0;
  const body = Math.abs(n) >= 1000 ? WHOLE.format(Math.abs(n)) : CENTS.format(Math.abs(n));
  return `${n < 0 ? "-" : ""}€${body}`;
}

/** Marža u %, jedna decimala; bez prihoda nema marže pa se prikazuje 0%. */
export const formatPct = (pct) => `${(Number(pct) || 0).toFixed(1)}%`;

export const CHART_COLORS = Object.freeze({ revenue: "#6D28D9", cost: "#C4B5FD", profit: "#16A34A" });

const SYMBOLS = { EUR: "€", GBP: "£", USD: "$" };

/** Iznos u zadatoj valuti: „€124,560", „RSD 1,200,000". Valute se nikad ne sabiraju (T28) — svaka ide svojim redom. */
export function formatMoney(value, currency = "EUR") {
  const n = Number(value) || 0;
  const body = Math.abs(n) >= 1000 ? WHOLE.format(Math.abs(n)) : CENTS.format(Math.abs(n));
  const symbol = SYMBOLS[currency];
  return `${n < 0 ? "-" : ""}${symbol ?? `${currency} `}${body}`;
}

/** Procenat ili „—" kad ga nema (marža bez prihoda nije 0%, nego nema vrednosti). */
export const formatMargin = (pct) => (pct === null || pct === undefined ? "—" : `${Number(pct).toFixed(1)}%`);
