// Koje stranice vidi samo admin (D3). Baza ionako ne vraća novčane podatke operateru (RLS);
// ovo samo sklanja stranice koje bi bez tih podataka bile prazne ili zbunjujuće.
export const ADMIN_ONLY_PREFIXES = [
  "/payroll", // obračun, nedeljni obračun, izveštaji o platama
  "/timesheet-dashboard",
  "/project-costs",
  "/rates",
  "/email-notifications",
  "/settings",
];

// Ruter ne razlikuje velika i mala slova i dekodira %xx, pa i provera mora isto:
// „/Payroll", „/%70ayroll" i „//payroll/" su ista stranica kao „/payroll" (QA 14.11.2026).
export function normalizePath(path) {
  let p = String(path || "/");
  try {
    p = decodeURIComponent(p);
  } catch {
    // neispravno kodiranje ostaje kakvo jeste
  }
  p = p.toLowerCase().replace(/\/{2,}/g, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

export function isAdminOnlyPath(path) {
  const p = normalizePath(path);
  return ADMIN_ONLY_PREFIXES.some((prefix) => p === prefix || p.startsWith(prefix + "/"));
}

export function visibleNavItems(items, isAdmin) {
  return isAdmin ? items : items.filter((item) => !isAdminOnlyPath(item.path));
}
