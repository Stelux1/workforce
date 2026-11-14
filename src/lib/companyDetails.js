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

// Zaglavlje firme za PDF (platni listić, satnica) — samo uneta polja, bez izmišljenih vrednosti (D18).
// Prazni podaci firme → null: PDF tada nema zaglavlje firme.
export function companyHeader(row) {
  if (companyIsEmpty(row)) return null;
  const name = clean(row.name);
  const place = [clean(row.address), clean(row.city)].filter(Boolean).join(", ");
  const ids = [clean(row.pib) && `PIB: ${clean(row.pib)}`, clean(row.registration_number) && `MB: ${clean(row.registration_number)}`]
    .filter(Boolean)
    .join("  ·  ");
  return {
    name,
    city: clean(row.city),
    lines: [place, ids].filter(Boolean),
    footer: [name, place, ids].filter(Boolean).join("  ·  "),
    logoUrl: clean(row.logo_url) || null,
  };
}

// Tip slike po prvim bajtovima: "image/png" | "image/jpeg" | null.
export function imageTypeOfBytes(b) {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length >= 8 && png.every((x, i) => b[i] === x)) return "image/png";
  return null;
}

// Logotip: samo PNG ili JPG, prema sadržaju (prvi bajtovi), ne prema nazivu ni tipu koji javlja pregledač.
export async function sniffLogoType(file) {
  return imageTypeOfBytes(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
}

// Vraća null ako je logotip u redu, inače ključ greške: "tooBig" | "type".
export async function logoProblem(file) {
  if (file.size > LOGO_MAX_BYTES) return "tooBig";
  return (await sniffLogoType(file)) ? null : "type";
}
