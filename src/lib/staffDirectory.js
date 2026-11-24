// Imena osoblja za „ko i kada" (spec §6 odobrio, §7 evidentirao, §9 promenio status, §14 odlučio).
// Izvor je RPC `staff_directory()` (id, ime, uloga — samo za aktivno osoblje), jer RLS na `profiles` daje tuđe
// redove samo uz users.manage. Ovde je samo čisto pretraživanje, hook je u `src/hooks/useStaffDirectory.js`.

/** Lookup iz redova `staff_directory()`: `name(id)` → ime ili null (nepoznat/sistemski korisnik), `role(id)`. */
export function staffLookup(rows = [], { self = null } = {}) {
  const byId = new Map();
  for (const r of rows || []) if (r?.id) byId.set(r.id, r);
  if (self?.id && !byId.has(self.id)) byId.set(self.id, { id: self.id, full_name: self.full_name || self.email || null, role: self.role || null });
  return {
    name: (id) => (id && byId.get(id)?.full_name) || null,
    role: (id) => (id && byId.get(id)?.role) || null,
    size: byId.size,
  };
}

/** „datum · ime" (ili samo jedno od dva) za redove istorije; prazni delovi se izostavljaju. */
export function whoWhen(when, who) {
  return [when, who].filter(Boolean).join(" · ");
}
