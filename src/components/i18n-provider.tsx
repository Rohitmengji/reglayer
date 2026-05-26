"use client";

import { createContext, useContext, useCallback, useSyncExternalStore } from "react";
import { type Locale, type TranslationKey, getTranslation, detectLocale, DEFAULT_LOCALE } from "@/lib/i18n/translations";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key as string,
});

let currentLocale: Locale = typeof window !== "undefined" ? detectLocale() : DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Locale {
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLocale = useCallback((newLocale: Locale) => {
    currentLocale = newLocale;
    localStorage.setItem("reglayer-locale", newLocale);
    document.documentElement.lang = newLocale;
    listeners.forEach((l) => l());
  }, []);

  const t = useCallback((key: TranslationKey, params?: Record<string, string | number>): string => {
    return getTranslation(locale, key, params);
  }, [locale]);

  return (
    <I18nContext value={{ locale, setLocale, t }}>
      {children}
    </I18nContext>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
