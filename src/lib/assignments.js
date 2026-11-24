// Angažman (project_assignments) — jedna evidencija za Project Workers, Project Assignments, Timesheets, Workforce,
// Onboarding, Payables i Billing (docs/TEAMORA-DATA-MODEL.md §2.4). Čiste funkcije; W2-K ovde dodaje filtere, KPI i izvoz.

export const ASSIGNMENT_STATUSES = Object.freeze(["active", "upcoming", "ending_soon", "completed"]);
const ENDING_SOON_DAYS = 30;

const day = (v) => (v ? String(v).slice(0, 10) : "");

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Prikazni status na dan `today` (§4.4; isto kao SQL assignment_display_status). Četiri statusa su međusobno
 * isključiva; `cancelled` je van njih (poništena dodela, nikad ne važi).
 * @param {{status?: string, start_date: string, end_date?: string|null}} a
 * @param {string} today "YYYY-MM-DD" (u vremenskoj zoni projekta)
 * @returns {"cancelled"|"completed"|"upcoming"|"ending_soon"|"active"}
 */
export function assignmentStatus(a, today) {
  const t = day(today);
  if (a?.status === "cancelled") return "cancelled";
  const end = day(a?.end_date);
  if (end && end < t) return "completed";
  if (day(a?.start_date) > t) return "upcoming";
  if (end && end <= addDays(t, ENDING_SOON_DAYS)) return "ending_soon";
  return "active";
}
