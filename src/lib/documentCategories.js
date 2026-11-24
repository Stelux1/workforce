// Vrste dokumenata: izvor je tabela `document_types` (Settings → Document types, settings.manage; model §2.10).
// Za 12 početnih vrsta postoje prevodi ovde; vrsta koju korisnik doda prikazuje svoj naziv iz baze.
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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

export function documentCategoryLabel(value, lang, types) {
  const c = DOCUMENT_CATEGORIES.find((x) => x.value === value);
  if (c) return lang === "rs" ? c.rs : lang === "sk" ? c.sk : c.en;
  const t = (types || []).find((x) => x.code === value);
  if (t?.name) return t.name;
  return (value || "").replace(/_/g, " ");
}

// Opcije za izbor vrste: aktivne vrste po redosledu; `keep` zadržava trenutno izabranu i kad je neaktivna.
// Dok se `document_types` ne učita (ili ako tabela još ne postoji), koriste se početne vrste.
export function documentTypeOptions(types, lang, keep) {
  const list = types?.length
    ? [...types].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code))
    : DOCUMENT_CATEGORIES.map((c, i) => ({ code: c.value, sort: i, active: true }));
  return list
    .filter((t) => t.active !== false || t.code === keep)
    .map((t) => ({ value: t.code, label: documentCategoryLabel(t.code, lang, types), sensitive: Boolean(t.sensitive), active: t.active !== false }));
}

export function useDocumentTypes() {
  return useQuery({
    queryKey: ["document-types"],
    queryFn: () => base44.entities.DocumentType.list("sort"),
    staleTime: 5 * 60 * 1000,
  });
}

// Prava prijavljenog korisnika: iz AuthContext-a (`permissions`, T-B) kad postoji, inače iz baze (my_permissions).
// UI samo sakriva akcije — pravo uvek proverava baza (RLS, storage politike, RPC).
export function useMyPermissions(auth) {
  const fromAuth = Array.isArray(auth?.permissions) ? auth.permissions : null;
  const q = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => base44.rpc("my_permissions"),
    enabled: !fromAuth,
    staleTime: 60 * 1000,
  });
  const list = fromAuth || q.data || [];
  return { can: (code) => list.includes(code), loading: !fromAuth && q.isLoading };
}
