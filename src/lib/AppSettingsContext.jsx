import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/lib/AuthContext";

// Jezik i valuta su podešavanje cele aplikacije (tabela app_settings, jedan red): čitaju svi prijavljeni,
// menja samo admin (RLS). localStorage je samo keš da se stranica ne bi prvo prikazala na pogrešnom jeziku.
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "sk", label: "Slovenčina" },
  { code: "rs", label: "Srpski" },
];
export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_CURRENCY = "EUR";
// D2: svi iznosi su u EUR i nema konverzije, pa je EUR jedina valuta koja se može izabrati.
export const CURRENCIES = ["EUR"];

const LANG_CODES = LANGUAGES.map((l) => l.code);

export function normalizeLanguage(value) {
  const l = String(value || "").toLowerCase();
  return LANG_CODES.includes(l) ? l : DEFAULT_LANGUAGE;
}

function readCache(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // keš nije obavezan
  }
}

const AppSettingsContext = createContext({
  language: DEFAULT_LANGUAGE,
  currency: DEFAULT_CURRENCY,
  loaded: false,
  canEdit: false,
  saveSettings: async () => ({ error: null }),
});

export function AppSettingsProvider({ children }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const [language, setLanguage] = useState(() => normalizeLanguage(readCache("app_lang")));
  const [currency, setCurrency] = useState(() => (readCache("app_currency") === "EUR" ? "EUR" : DEFAULT_CURRENCY));
  const [loaded, setLoaded] = useState(false);

  // Posle prijave učitaj podešavanja iz baze (baza je izvor istine, keš samo sprečava treptanje).
  useEffect(() => {
    if (!isAuthenticated || !supabase) return undefined;
    let alive = true;
    supabase
      .from("app_settings")
      .select("language, currency")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data) {
          const l = normalizeLanguage(data.language);
          setLanguage(l);
          writeCache("app_lang", l);
          setCurrency(DEFAULT_CURRENCY);
          writeCache("app_currency", DEFAULT_CURRENCY);
        }
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  const saveSettings = useCallback(
    async ({ language: nextLanguage, currency: nextCurrency }) => {
      if (!isAdmin) return { error: new Error("Only an admin can change the language and currency.") };
      const patch = {};
      if (nextLanguage !== undefined) patch.language = normalizeLanguage(nextLanguage);
      if (nextCurrency !== undefined) patch.currency = nextCurrency;
      const { error } = await supabase.from("app_settings").update(patch).eq("id", true);
      if (error) return { error };
      if (patch.language) {
        setLanguage(patch.language);
        writeCache("app_lang", patch.language);
      }
      if (patch.currency) {
        setCurrency(patch.currency);
        writeCache("app_currency", patch.currency);
      }
      return { error: null };
    },
    [isAdmin]
  );

  const value = useMemo(
    () => ({
      language, currency, loaded, canEdit: Boolean(isAdmin), saveSettings,
    }),
    [language, currency, loaded, isAdmin, saveSettings]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}
