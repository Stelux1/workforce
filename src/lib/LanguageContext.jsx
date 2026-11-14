import { createContext, useContext, useState } from "react";

const LanguageContext = createContext({ lang: "en", setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => (localStorage.getItem("app_lang") || "en").toLowerCase());

  const changeLang = (l) => {
    setLang(l);
    localStorage.setItem("app_lang", l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: changeLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}