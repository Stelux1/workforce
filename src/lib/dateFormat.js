import { format } from "date-fns";
import { srLatn } from "date-fns/locale";

/**
 * date-fns `format` that follows the app language ("rs" -> Serbian Latin, otherwise English).
 * Use for user-visible dates only; dates sent to the database stay on plain `format`.
 */
export function formatDate(date, pattern, lang) {
  return lang === "rs" ? format(date, pattern, { locale: srLatn }) : format(date, pattern);
}

// Common display patterns (English: "Nov 14" / "Nov 14, 2026"; Serbian: "14. nov" / "14. nov 2026.").
export const shortDatePattern = (lang) => (lang === "rs" ? "d. MMM" : "MMM d");
export const longDatePattern = (lang) => (lang === "rs" ? "d. MMM yyyy." : "MMM d, yyyy");
