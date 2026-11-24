// Prazno polje = null (D5: bez koeficijenta nema obračuna, nikad tihi 1,00). Vraća { value, error }.
export function parseCoef(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "") return { value: null, error: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { value: null, error: true };
  return { value: n, error: false };
}

// Koeficijenti se na ekranu unose u procentima (spec §5: 100% / 150% / 200%), a u bazi su 1.0 / 1.5 / 2.0
// (hour_types.worker_coef/client_coef, numeric(6,4), 0 < k ≤ 10). Zato procenat ima najviše 2 decimale
// (150,25% = 1,5025) i najviše 1000% — više decimala ili veći broj je greška, ne tiho zaokruživanje.
export const MAX_COEF_PERCENT = 1000;
const PERCENT_RE = /^\d+(?:\.\d{1,2})?$/;

/**
 * Procenat sa ekrana → koeficijent. „150" → 1.5, „150,5" → 1.505, „100 %" → 1.
 * Prazno = { value: null, error: false } (D5: blokira obračun, nikad 100%). 0, negativno, tekst,
 * više od 2 decimale ili više od 1000% = { value: null, error: true }.
 */
export function parsePercentCoef(text) {
  const t = String(text ?? "").trim().replace(/\s*%$/, "").replace(",", ".");
  if (t === "") return { value: null, error: false };
  if (!PERCENT_RE.test(t)) return { value: null, error: true };
  const n = Number(t);
  if (!(n > 0) || n > MAX_COEF_PERCENT) return { value: null, error: true };
  // Celobrojno u stotim delovima procenta, da 150.5 / 100 ne da 1.5050000000000001.
  return { value: Math.round(n * 100) / 10000, error: false };
}

/** Koeficijent iz baze → tekst procenta za polje: 1.5 → "150", 1.505 → "150.5", null → "". */
export function coefToPercentText(coef) {
  if (coef === null || coef === undefined || coef === "") return "";
  const n = Number(coef);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 10000) / 100);
}

export function parseDailyHours(text) {
  const n = Number(String(text ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
}
