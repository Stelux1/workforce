// Podešavanja → „Korisnici": pomoćne funkcije za prikaz. Pravila sprovodi baza — profil menja samo aktivan admin
// (RLS `profiles_update`), a poslednji aktivan admin ne može da se deaktivira ni da izgubi ulogu
// (`guard_last_admin`, migracija 20261114260000). Ovde se samo odlučuje šta stranica prikazuje i kada pita za potvrdu.

export const ROLES = ["admin", "operater"];

export const isActiveAdmin = (profile) => profile?.role === "admin" && profile?.active === true;

export const activeAdminCount = (profiles = []) => profiles.filter(isActiveAdmin).length;

// Jedini aktivan admin (baza mu ne dozvoljava deaktivaciju ni promenu uloge).
export const isLastActiveAdmin = (profiles = [], id) => {
  const admins = profiles.filter(isActiveAdmin);
  return admins.length === 1 && admins[0].id === id;
};

// Izmena koja aktivnom adminu oduzima admin pristup (deaktivacija ili uloga operater).
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
