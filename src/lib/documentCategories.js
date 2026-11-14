// Single bilingual source for document category names (Documents, Dashboard).
export const DOCUMENT_CATEGORIES = [
  { value: "id_card", en: "ID Card", rs: "Lična karta" },
  { value: "passport", en: "Passport", rs: "Pasoš" },
  { value: "work_permit", en: "Work Permit", rs: "Radna dozvola" },
  { value: "contract", en: "Contract", rs: "Ugovor" },
  { value: "certificate", en: "Certificate", rs: "Sertifikat" },
  { value: "diploma", en: "Diploma", rs: "Diploma" },
  { value: "training_certificate", en: "Training Certificate", rs: "Potvrda o obuci" },
  { value: "driver_license", en: "Driver's License", rs: "Vozačka dozvola" },
  { value: "insurance", en: "Insurance", rs: "Osiguranje" },
  { value: "medical_certificate", en: "Medical Certificate", rs: "Lekarsko uverenje" },
  { value: "safety_certificate", en: "Safety Certificate", rs: "Potvrda o bezbednosti" },
  { value: "other", en: "Other", rs: "Ostalo" },
];

export function documentCategoryLabel(value, lang) {
  const c = DOCUMENT_CATEGORIES.find((x) => x.value === value);
  if (c) return lang === "rs" ? c.rs : c.en;
  return (value || "").replace(/_/g, " ");
}
