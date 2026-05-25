"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { type Locale, type TranslationKey, getTranslation, detectLocale, DEFAULT_LOCALE } from "@/lib/i18n/translations";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectLocale());
  }, []);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    localStorage.setItem("reglayer-locale", newLocale);
    document.documentElement.lang = newLocale;
  }

  function t(key: TranslationKey): string {
    return getTranslation(locale, key);
  }

  return (
    <I18nContext value={{ locale, setLocale, t }}>
      {children}
    </I18nContext>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
