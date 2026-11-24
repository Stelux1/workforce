// Single bilingual source for document category names (Documents, Dashboard).
export const DOCUMENT_CATEGORIES = [
  { value: "id_card", en: "ID Card", rs: "Lična karta", sk: "Občiansky preukaz" },
  { value: "passport", en: "Passport", rs: "Pasoš", sk: "Pas" },
  { value: "work_permit", en: "Work Permit", rs: "Radna dozvola", sk: "Pracovné povolenie" },
  { value: "contract", en: "Contract", rs: "Ugovor", sk: "Zmluva" },
  { value: "certificate", en: "Certificate", rs: "Sertifikat", sk: "Certifikát" },
  { value: "diploma", en: "Diploma", rs: "Diploma", sk: "Diplom" },
  { value: "training_certificate", en: "Training Certificate", rs: "Potvrda o obuci", sk: "Osvedčenie o školení" },
  { value: "driver_license", en: "Driver's License", rs: "Vozačka dozvola", sk: "Vodičský preukaz" },
  { value: "insurance", en: "Insurance", rs: "Osiguranje", sk: "Poistenie" },
  { value: "medical_certificate", en: "Medical Certificate", rs: "Lekarsko uverenje", sk: "Lekárske potvrdenie" },
  { value: "safety_certificate", en: "Safety Certificate", rs: "Potvrda o bezbednosti", sk: "Osvedčenie o bezpečnosti" },
  { value: "other", en: "Other", rs: "Ostalo", sk: "Iné" },
];

export function documentCategoryLabel(value, lang) {
  const c = DOCUMENT_CATEGORIES.find((x) => x.value === value);
  if (c) return lang === "rs" ? c.rs : lang === "sk" ? c.sk : c.en;
  return (value || "").replace(/_/g, " ");
}
