import { jmbgValid } from "@/lib/jmbg";

export const RATE_FIELDS = ["b2c_hourly_rate", "b2b_hourly_rate", "overtime_rate", "weekend_rate", "holiday_rate"];

const blank = (v) => v === null || v === undefined || v === "";

// Vraća listu ključeva grešaka (prevodi ih forma preko T). Prazna lista = može da se čuva.
export function privateFieldErrors(form) {
  const errors = [];
  if (!jmbgValid(String(form.jmbg ?? "").trim())) errors.push("JMBG must be 13 digits with a valid check digit");
  if (!blank(form.work_fraction)) {
    const f = Number(form.work_fraction);
    if (!(f > 0 && f <= 1)) errors.push("Work fraction must be between 0.01 and 1");
  }
  if (RATE_FIELDS.some((k) => !blank(form[k]) && !(Number(form[k]) > 0))) {
    errors.push("Rates must be greater than 0 (leave empty if none)");
  }
  return errors;
}

// Priprema vrednosti za upis (samo admin): brojevi umesto stringova, podrazumevane vrednosti kao u bazi.
export function normalizePrivate(form) {
  const out = { ...form };
  out.jmbg = String(form.jmbg ?? "").trim() || null;
  out.rate_basis = form.rate_basis === "bruto" ? "bruto" : "neto";
  out.work_fraction = blank(form.work_fraction) ? 1 : Number(form.work_fraction);
  for (const k of RATE_FIELDS) out[k] = blank(form[k]) ? null : Number(form[k]);
  return out;
}
