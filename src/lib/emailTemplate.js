// Popunjavanje oznaka u Email porukama. Naziv firme dolazi iz „Podaci firme" (company_settings, D18) — nikad upisan u
// kodu. Ako naziv nije unet, na njegovo mesto ide vidljiva oznaka (ne izmišlja se naziv).

export const COMPANY_NAME_MISSING = "[naziv firme nije unet]";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

/** Naziv firme iz reda company_settings; prazno → "". */
export const companyNameOf = (row) => clean(row?.name);

/**
 * Menja samo {employee_name} i {company_name} (i u naslovu i u telu). Ostale oznake ostaju netaknute.
 * Prazan naziv firme → COMPANY_NAME_MISSING. `employeeName` se izostavlja (null) u pregledu bez primaoca.
 */
export function fillEmailTemplate(text, { employeeName = null, companyName = "" } = {}) {
  let out = String(text ?? "");
  if (employeeName !== null) out = out.replace(/{employee_name}/g, () => employeeName);
  return out.replace(/{company_name}/g, () => clean(companyName) || COMPANY_NAME_MISSING);
}
