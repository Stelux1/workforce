// Podešavanja → „Korisnici": pomoćne funkcije za prikaz. Pravila sprovodi baza — profil, prava i projekte korisnika
// menja ko ima users.manage (RLS, migracija 20261125020000), ulogu admin daje samo admin (guard_profile_change),
// override nad adminom se odbija (guard_permission_override), a poslednji aktivan admin ne može da se deaktivira ni
// da izgubi ulogu (guard_last_admin). Ovde se samo odlučuje šta stranica prikazuje i kada pita za potvrdu.
import { ROLES as PERMISSION_ROLES, effectivePermissions } from "@/lib/permissions";

export const ROLES = PERMISSION_ROLES;

export const isActiveAdmin = (profile) => profile?.role === "admin" && profile?.active === true;

export const activeAdminCount = (profiles = []) => profiles.filter(isActiveAdmin).length;

// Jedini aktivan admin (baza mu ne dozvoljava deaktivaciju ni promenu uloge).
export const isLastActiveAdmin = (profiles = [], id) => {
  const admins = profiles.filter(isActiveAdmin);
  return admins.length === 1 && admins[0].id === id;
};

// Izmena koja aktivnom adminu oduzima admin pristup (deaktivacija ili druga uloga).
export function removesAdminAccess(profile, patch = {}) {
  if (!isActiveAdmin(profile)) return false;
  const role = "role" in patch ? patch.role : profile.role;
  const active = "active" in patch ? patch.active : profile.active;
  return role !== "admin" || active !== true;
}

// Admin koji sebi oduzima pristup dok postoji drugi aktivan admin dobija pitanje za potvrdu (posle toga ne vidi
// ovu stranicu). Poslednjem aktivnom adminu se ne pita ništa — izmena ide u bazu i baza je odbija sa porukom.
export function needsSelfConfirm(profiles, profile, patch, myId) {
  return Boolean(myId) && profile?.id === myId && removesAdminAccess(profile, patch) && activeAdminCount(profiles) > 1;
}

// Podrazumevana prava uloge iz baze (role_permissions redovi) → { role: [kodovi] }.
export function roleDefaultsFrom(rows = []) {
  const out = {};
  for (const r of rows) (out[r.role] ||= []).push(r.permission);
  return out;
}

// Stanje jednog prava za korisnika: šta daje uloga, da li postoji override i šta je na kraju.
export function permissionState(code, roleDefaults = [], overrides = []) {
  const byRole = roleDefaults.includes(code);
  const o = overrides.find((x) => x.permission === code);
  return { byRole, override: o ? o.granted : null, effective: o ? o.granted : byRole };
}

// Šta upisati kad korisnik uključi/isključi pravo: isto kao uloga → obrisati override; drugačije → override.
export function overrideChange(code, wanted, roleDefaults = []) {
  const byRole = roleDefaults.includes(code);
  return wanted === byRole ? { action: "delete", permission: code } : { action: "upsert", permission: code, granted: wanted };
}

// Efektivna prava korisnika za prikaz (admin = sva).
export const userPermissions = (profile, overrides = [], roleDefaults) =>
  effectivePermissions(profile?.role, overrides.filter((o) => o.user_id === profile?.id), roleDefaults);
