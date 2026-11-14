// Prazno polje = null (D5: bez koeficijenta nema obračuna, nikad tihi 1,00). Vraća { value, error }.
export function parseCoef(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (t === "") return { value: null, error: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { value: null, error: true };
  return { value: n, error: false };
}

export function parseDailyHours(text) {
  const n = Number(String(text ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
}
