"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Internationalization (i18n) Provider
 * ---------------------------------------------------------
 *
 * WHY: EU market requires multi-language support.
 * 7 languages: EN, DE, FR, ES, IT, NL, PT.
 *
 * WHAT:
 * - React context providing: t() function, locale, setLocale()
 * - t() translates a key with optional interpolation params
 * - Auto-detects browser language on first visit
 * - Persists language choice to localStorage
 *
 * HOW:
 * - Uses useSyncExternalStore for localStorage sync
 * - getTranslation() looks up key in locale file, falls back to EN
 * - Interpolation: t("key", { count: 5 }) replaces {count} in string
 * - detectLocale() checks: localStorage → navigator.language → default
 * ---------------------------------------------------------
 */

import { createContext, useContext, useCallback, useEffect, useSyncExternalStore } from "react";
import { type Locale, type TranslationKey, getTranslation, detectLocale, DEFAULT_LOCALE, loadLocale } from "@/lib/i18n/translations";

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

  // Keep <html lang> in sync with the active locale (WCAG 3.1.1, Language of Page).
  // The server renders lang="en"; correct it once the client-detected/selected
  // locale resolves so screen readers use the right pronunciation rules.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // Load translations for the detected locale on mount (non-English locales are lazy-loaded)
  useEffect(() => {
    if (locale !== "en") {
      loadLocale(locale).then(() => listeners.forEach((l) => l()));
    }
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    currentLocale = newLocale;
    localStorage.setItem("reglayer-locale", newLocale);
    document.documentElement.lang = newLocale;
    // Load the locale translations if not already loaded, then notify subscribers
    loadLocale(newLocale).then(() => listeners.forEach((l) => l()));
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
