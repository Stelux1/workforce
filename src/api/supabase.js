import { createClient } from "@supabase/supabase-js";

// Ključevi dolaze iz .env.local (vidi .env.local.example). Nema podrazumevanih vrednosti:
// ako fale, aplikacija prikazuje ekran „Supabase nije podešen" umesto da tiho radi bez baze.
const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "").trim();

export const supabaseConfigured = Boolean(url && key);

export const supabase = supabaseConfigured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/** Vraća klijent ili baca jasnu grešku — za kod koji ne sme da radi bez baze. */
export function requireSupabase() {
  if (!supabase) throw new Error("Supabase nije podešen: upišite VITE_SUPABASE_URL i VITE_SUPABASE_PUBLISHABLE_KEY u .env.local");
  return supabase;
}
