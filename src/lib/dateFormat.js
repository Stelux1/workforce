import { format } from "date-fns";
import { srLatn, sk } from "date-fns/locale";

/**
 * date-fns `format` that follows the app language ("rs" -> Serbian Latin, "sk" -> Slovak, otherwise English).
 * Use for user-visible dates only; dates sent to the database stay on plain `format`.
 */
export function formatDate(date, pattern, lang) {
  if (lang === "rs") return format(date, pattern, { locale: srLatn });
  if (lang === "sk") return format(date, pattern, { locale: sk });
  return format(date, pattern);
}

/** Locale za Intl / toLocaleString prema jeziku aplikacije (sk -> sk-SK, rs -> sr-Latn-RS, inače en-GB). */
export function intlLocale(lang) {
  if (lang === "sk") return "sk-SK";
  if (lang === "rs") return "sr-Latn-RS";
  return "en-GB";
}

// Common display patterns (English: "Nov 14" / "Nov 14, 2026"; Serbian: "14. nov" / "14. nov 2026."; Slovak: "14. nov" / "14. nov 2026").
export const shortDatePattern = (lang) => (lang === "rs" ? "d. MMM" : lang === "sk" ? "d. MMM" : "MMM d");
export const longDatePattern = (lang) => (lang === "rs" ? "d. MMM yyyy." : lang === "sk" ? "d. MMM yyyy" : "MMM d, yyyy");

/** Prikaz ISO datuma (yyyy-MM-dd) po jeziku: en "Jan 1, 2026", rs "01.01.2026.", sk "1. 1. 2026". Prazno ili neispravno vraća ulaz. */
export function formatIsoDate(iso, lang) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return String(iso ?? "");
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1) return String(iso);
  if (lang === "rs") return format(date, "dd.MM.yyyy.");
  if (lang === "sk") return format(date, "d. M. yyyy");
  return format(date, "MMM d, yyyy");
}
