// Koje stranice korisnik vidi, po pravima (spec v1.4 §15.02, docs/TEAMORA-DATA-MODEL.md §4).
// Baza ionako ne vraća podatke bez prava (RLS, RPC); ovo samo sklanja stranice koje bi bez tih podataka bile prazne
// ili zbunjujuće, i prikazuje jasno „nemate pravo" kad se adresa otvori direktno.
import { can, PERMISSIONS as P } from "@/lib/permissions";

// Prefiks adrese → pravo (ili niz: dovoljno je jedno). Najduži prefiks pobeđuje; adresa bez unosa je za svakog
// aktivnog korisnika. Druge trake dodaju po jedan red za svoje stranice.
export const ROUTE_PERMISSIONS = {
  "/payroll": P.PAYROLL_VIEW, // Payroll Dashboard, Monthly Payroll, Payroll Reports
  "/timesheet-dashboard": [P.RATES_VIEW_B2B, P.RATES_VIEW_B2C],
  "/project-costs": P.COSTS_VIEW,
  "/rates": [P.RATES_VIEW_B2B, P.RATES_VIEW_B2C, P.RATES_MANAGE],
  "/email-notifications": P.SETTINGS_MANAGE,
  "/settings": P.SETTINGS_MANAGE,
  "/settings/users": P.USERS_MANAGE,
};

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

// Pravo koje stranica traži (null = bez posebnog prava).
export function requiredPermission(path) {
  const p = normalizePath(path);
  let best = null;
  for (const prefix of Object.keys(ROUTE_PERMISSIONS)) {
    if ((p === prefix || p.startsWith(prefix + "/")) && (!best || prefix.length > best.length)) best = prefix;
  }
  return best ? ROUTE_PERMISSIONS[best] : null;
}

export function canAccessPath(path, perms) {
  return can(perms, requiredPermission(path));
}

export function visibleNavItems(items, perms) {
  return (items || []).filter((item) => canAccessPath(item.path, perms));
}
