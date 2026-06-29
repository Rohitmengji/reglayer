/**
 * RegLayer — Internationalization (i18n) Framework
 * 
 * Supports EN, DE, FR, ES, IT, NL, PT for EU market coverage.
 * Interpolation: Use {variable} in translation strings.
 * Example: t("dashboard.resetsIn", { days: 5 }) → "Resets in 5 day(s)"
 *
 * PERF: Only English is eagerly imported (default locale). Other locales are
 * loaded on-demand via dynamic import to reduce the initial bundle by ~600KB.
 */

import { en } from "./en";

export type Locale = "en" | "de" | "fr" | "es" | "it" | "nl" | "pt";

export const SUPPORTED_LOCALES: { code: Locale; name: string; flag: string }[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "pt", name: "Português", flag: "🇵🇹" },
];

export const DEFAULT_LOCALE: Locale = "en";

// Cache loaded translations to avoid re-importing
const loaded: Partial<Record<Locale, Record<string, string>>> = { en };

const loaders: Record<Locale, () => Promise<{ [key: string]: Record<string, string> }>> = {
  en: () => Promise.resolve({ en }),
  de: () => import("./de"),
  fr: () => import("./fr"),
  es: () => import("./es"),
  it: () => import("./it"),
  nl: () => import("./nl"),
  pt: () => import("./pt"),
};

/** Load a locale's translations (async, cached). */
export async function loadLocale(locale: Locale): Promise<Record<string, string>> {
  if (loaded[locale]) return loaded[locale]!;
  const mod = await loaders[locale]();
  const dict = mod[locale] ?? mod.default ?? Object.values(mod)[0];
  loaded[locale] = dict as Record<string, string>;
  return loaded[locale]!;
}

/** Synchronous access — returns loaded translations or falls back to English. */
export function getLoadedTranslations(locale: Locale): Record<string, string> {
  return loaded[locale] ?? en;
}

export type TranslationKey = keyof typeof en;

export function getTranslation(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const dict = loaded[locale] ?? en;
  const raw = (dict as Record<string, string>)[key as string] ?? (en as Record<string, string>)[key as string] ?? (key as string);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_: string, k: string) => String(params[k] ?? `{${k}}`));
}

export function detectLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  
  const stored = localStorage.getItem("reglayer-locale");
  if (stored && SUPPORTED_LOCALES.some((l) => l.code === stored)) {
    return stored as Locale;
  }
  
  const browserLang = navigator.language.split("-")[0];
  if (SUPPORTED_LOCALES.some((l) => l.code === browserLang)) {
    return browserLang as Locale;
  }
  
  return DEFAULT_LOCALE;
}
