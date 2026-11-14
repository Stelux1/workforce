// Podaci firme: provere unosa (iste kao CHECK u bazi, migracija 20261114210000_podaci_firme.sql) i logotip.
// Prazno polje je dozvoljeno — podaci firme se unose naknadno, a do tada PDF nema zaglavlje firme.

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

// PIB: tačno 9 cifara (ako je popunjen).
export function pibValid(value) {
  const v = clean(value);
  return v === "" || /^[0-9]{9}$/.test(v);
}

// Matični broj: tačno 8 cifara (ako je popunjen).
export function registrationNumberValid(value) {
  const v = clean(value);
  return v === "" || /^[0-9]{8}$/.test(v);
}

export const COMPANY_FIELDS = ["name", "pib", "registration_number", "address", "city", "bank_account"];

// Prazno polje se čuva kao null (ne kao ""), da „popunjeno" ima jedno značenje.
export function normalizeCompany(form) {
  const out = {};
  for (const f of COMPANY_FIELDS) out[f] = clean(form?.[f]) || null;
  return out;
}

// Greške po polju (ključ = polje, vrednost = "pib" | "registration_number").
export function companyErrors(form) {
  const errors = {};
  if (!pibValid(form?.pib)) errors.pib = "pib";
  if (!registrationNumberValid(form?.registration_number)) errors.registration_number = "registration_number";
  return errors;
}

// Da li je ijedno polje popunjeno (logo se računa) — za napomenu „PDF nema zaglavlje firme".
export function companyIsEmpty(row) {
  return ![...COMPANY_FIELDS, "logo_url"].some((f) => clean(row?.[f]) !== "");
}

// Logotip: samo PNG ili JPG, prema sadržaju (prvi bajtovi), ne prema nazivu ni tipu koji javlja pregledač.
export async function sniffLogoType(file) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((x, i) => b[i] === x)) return "image/png";
  return null;
}

// Vraća null ako je logotip u redu, inače ključ greške: "tooBig" | "type".
export async function logoProblem(file) {
  if (file.size > LOGO_MAX_BYTES) return "tooBig";
  return (await sniffLogoType(file)) ? null : "type";
}
