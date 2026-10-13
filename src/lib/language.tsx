import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Language, Localized } from "../types";

const LanguageContext = createContext({
  language: "en" as Language,
  setLanguage: (_value: Language) => {},
  t: (value: Localized) => value.en,
});
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  useEffect(() => {
    try {
      if (localStorage.getItem("academic-language") === "zh") setLanguage("zh");
    } catch {
      /* Storage can be disabled. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  function changeLanguage(value: Language) {
    setLanguage(value);
    try {
      localStorage.setItem("academic-language", value);
    } catch {
      /* Language still works without persistence. */
    }
  }
  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: changeLanguage,
        t: (value) => value[language],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  return useContext(LanguageContext);
}
