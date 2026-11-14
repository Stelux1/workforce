import { createContext, useContext, useState } from "react";

const AppSettingsContext = createContext({});

export function AppSettingsProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem("app_lang") || "EN");
  const [currency, setCurrency] = useState(() => localStorage.getItem("app_currency") || "EUR");

  const updateLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem("app_lang", lang);
  };

  const updateCurrency = (cur) => {
    setCurrency(cur);
    localStorage.setItem("app_currency", cur);
  };

  return (
    <AppSettingsContext.Provider value={{ language, currency, updateLanguage, updateCurrency }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  return useContext(AppSettingsContext);
}