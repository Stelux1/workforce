// Jedno mesto koje korisniku prikazuje svaku grešku sloja podataka (D15).
// Stranice iz Base44 izvoza nemaju sopstvenu obradu grešaka, pa bez ovoga neuspelo čuvanje izgleda kao da se ništa nije desilo.
import { toast } from "sonner";
import { describeError } from "@/api/errors";

const shown = new WeakSet();

export function showError(error, prefix) {
  if (!error || (typeof error === "object" && shown.has(error))) return;
  if (typeof error === "object") shown.add(error);
  // Greške iz sloja podataka već imaju poruku za korisnika; ostale (mreža, neočekivane) se opisuju ovde.
  const text = error?.isDataError ? error.message : describeError(error).text;
  toast.error(prefix ? `${prefix}: ${text}` : text, { duration: 8000 });
}

// Pozivi koje stranice šalju direktno (bez useMutation) i ne hvataju — npr. otpremanje fajla ili masovna izmena.
export function installGlobalErrorToasts() {
  if (typeof window === "undefined" || window.__radniciErrorToasts) return;
  window.__radniciErrorToasts = true;
  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    if (error?.isDataError || (error?.name === "TypeError" && /fetch/i.test(error?.message || ""))) {
      showError(error);
    }
  });
}
