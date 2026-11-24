import { jmbgValid } from "@/lib/jmbg";

export const RATE_FIELDS = ["b2c_hourly_rate", "b2b_hourly_rate", "overtime_rate", "weekend_rate", "holiday_rate"];
// Polja obračuna iz profila koja se više ne unose kroz formu radnika (Teamora, zahtev 3): tarife se vode po
// projektu (Tarife / satnica na projektu). Kolone ostaju u `employee_private` i i dalje ulaze u obračun (D4, D5, D17).
export const PROFILE_PAYROLL_FIELDS = [...RATE_FIELDS, "rate_basis", "work_fraction"];

const blank = (v) => v === null || v === undefined || v === "";

// Vraća listu ključeva grešaka (prevodi ih forma preko T). Prazna lista = može da se čuva.
// Proverava samo polja koja forma još prikazuje.
export function privateFieldErrors(form) {
  const errors = [];
  if (!jmbgValid(String(form.jmbg ?? "").trim())) errors.push("JMBG must be 13 digits with a valid check digit");
  return errors;
}

// Priprema vrednosti za upis (samo admin).
// Novi radnik: podrazumevano neto i ceo udeo radnog vremena (isto kao default kolona), bez tarifa iz profila.
// Postojeći radnik: tarife, osnova i udeo iz profila se NE šalju — ostaju kakve jesu u bazi (forma ih ne prikazuje,
// pa bi slanje vratilo samo staru vrednost ili, gore, obrisalo je).
export function normalizePrivate(form, { isNew = false } = {}) {
  const out = { ...form };
  out.jmbg = String(form.jmbg ?? "").trim() || null;
  for (const k of PROFILE_PAYROLL_FIELDS) delete out[k];
  if (isNew) {
    out.rate_basis = "neto";
    out.work_fraction = 1;
  }
  return out;
}

// Stare vrednosti iz profila koje i dalje utiču na obračun, a forma ih više ne prikazuje.
// Vraća samo ono što odstupa od podrazumevanog (tarife koje postoje, bruto osnova, udeo ≠ 1).
export function legacyProfilePayroll(emp) {
  if (!emp) return [];
  const out = [];
  const labels = {
    b2c_hourly_rate: "B2C Rate", b2b_hourly_rate: "B2B Rate", overtime_rate: "Overtime Rate",
    weekend_rate: "Weekend Rate", holiday_rate: "Holiday Rate",
  };
  for (const k of RATE_FIELDS) {
    if (!blank(emp[k])) out.push({ field: k, label: labels[k], value: Number(emp[k]), kind: "rate" });
  }
  if (emp.rate_basis === "bruto") out.push({ field: "rate_basis", label: "Rate Basis", value: "bruto", kind: "basis" });
  if (!blank(emp.work_fraction) && Number(emp.work_fraction) !== 1) {
    out.push({ field: "work_fraction", label: "Work Fraction", value: Number(emp.work_fraction), kind: "fraction" });
  }
  return out;
}
