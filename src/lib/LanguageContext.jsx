import { createContext, useContext, useMemo } from "react";
import { useAppSettings } from "@/lib/AppSettingsContext";

// Jezik cele aplikacije ("en" | "sk" | "rs") dolazi iz podešavanja (AppSettingsContext); menja ga samo admin
// u Podešavanjima → Jezik i valuta. `setLang` postoji zbog starog koda i čuva u bazu samo ako je korisnik admin.
const LanguageContext = createContext({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }) {
  const { language, saveSettings } = useAppSettings();
  const value = useMemo(
    () => ({ lang: language, setLang: (l) => saveSettings({ language: l }) }),
    [language, saveSettings]
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  return useContext(LanguageContext);
}
