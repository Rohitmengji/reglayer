/**
 * RegLayer — Internationalization (i18n) Framework
 * 
 * Supports EN, DE, FR, ES, IT, NL, PT for EU market coverage.
 * Interpolation: Use {variable} in translation strings.
 * Example: t("dashboard.resetsIn", { days: 5 }) → "Resets in 5 day(s)"
 */

import { en } from "./en";
import { de } from "./de";
import { fr } from "./fr";
import { es } from "./es";
import { it } from "./it";
import { nl } from "./nl";
import { pt } from "./pt";

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

const translations: Record<Locale, Record<string, string>> = { en, de, fr, es, it, nl, pt };

export type TranslationKey = keyof typeof en;

export function getTranslation(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const raw = translations[locale]?.[key as string] ?? translations.en[key as string] ?? (key as string);
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
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
