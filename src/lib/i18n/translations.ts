/**
 * RegLayer — Internationalization (i18n) Framework
 * 
 * Supports EN, DE, FR, ES, IT, NL, PT for EU market coverage.
 * Interpolation: Use {variable} in translation strings.
 * Example: t("dashboard.resetsIn", { days: 5 }) → "Resets in 5 day(s)"
 */

import { en } from "./en";
import { de } from "./de";

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

// FR, ES, IT, NL, PT: nav keys translated, rest falls back to EN
const fr: Record<string, string> = {
  "nav.dashboard": "Tableau de bord", "nav.scans": "Scans", "nav.compliance": "Conformité",
  "nav.crawl": "Explorer le site", "nav.priorities": "Priorités", "nav.insights": "Analyses IA",
  "nav.analytics": "Statistiques", "nav.compare": "Comparer", "nav.webhooks": "Webhooks",
  "nav.settings": "Paramètres", "nav.statement": "Déclaration", "nav.darkMode": "Mode sombre",
  "nav.team": "Équipe", "nav.auditLog": "Journal d'audit", "nav.notifications": "Notifications",
  "nav.integrations": "Intégrations", "nav.signOut": "Déconnexion", "nav.adminPanel": "Admin",
  "common.loading": "Chargement...", "common.error": "Une erreur est survenue",
  "common.save": "Enregistrer", "common.cancel": "Annuler", "common.delete": "Supprimer",
  "common.copy": "Copier", "common.copied": "Copié !",
};

const es: Record<string, string> = {
  "nav.dashboard": "Panel", "nav.scans": "Escaneos", "nav.compliance": "Conformidad",
  "nav.crawl": "Rastrear sitio", "nav.priorities": "Prioridades", "nav.insights": "Análisis IA",
  "nav.analytics": "Estadísticas", "nav.compare": "Comparar", "nav.webhooks": "Webhooks",
  "nav.settings": "Configuración", "nav.statement": "Declaración", "nav.darkMode": "Modo oscuro",
  "nav.team": "Equipo", "nav.auditLog": "Registro de auditoría", "nav.notifications": "Notificaciones",
  "nav.integrations": "Integraciones", "nav.signOut": "Cerrar sesión", "nav.adminPanel": "Admin",
  "common.loading": "Cargando...", "common.error": "Se produjo un error",
  "common.save": "Guardar", "common.cancel": "Cancelar", "common.delete": "Eliminar",
  "common.copy": "Copiar", "common.copied": "¡Copiado!",
};

const it: Record<string, string> = {
  "nav.dashboard": "Pannello", "nav.scans": "Scansioni", "nav.compliance": "Conformità",
  "nav.crawl": "Esplora sito", "nav.priorities": "Priorità", "nav.insights": "Analisi IA",
  "nav.analytics": "Statistiche", "nav.compare": "Confronta", "nav.webhooks": "Webhooks",
  "nav.settings": "Impostazioni", "nav.statement": "Dichiarazione", "nav.darkMode": "Modalità scura",
  "nav.team": "Team", "nav.auditLog": "Registro audit", "nav.notifications": "Notifiche",
  "nav.integrations": "Integrazioni", "nav.signOut": "Esci", "nav.adminPanel": "Admin",
  "common.loading": "Caricamento...", "common.error": "Si è verificato un errore",
  "common.save": "Salva", "common.cancel": "Annulla", "common.delete": "Elimina",
  "common.copy": "Copia", "common.copied": "Copiato!",
};

const nl: Record<string, string> = {
  "nav.dashboard": "Dashboard", "nav.scans": "Scans", "nav.compliance": "Conformiteit",
  "nav.crawl": "Site crawlen", "nav.priorities": "Prioriteiten", "nav.insights": "AI-inzichten",
  "nav.analytics": "Analyse", "nav.compare": "Vergelijken", "nav.webhooks": "Webhooks",
  "nav.settings": "Instellingen", "nav.statement": "Verklaring", "nav.darkMode": "Donkere modus",
  "nav.team": "Team", "nav.auditLog": "Auditlogboek", "nav.notifications": "Meldingen",
  "nav.integrations": "Integraties", "nav.signOut": "Uitloggen", "nav.adminPanel": "Admin",
  "common.loading": "Laden...", "common.error": "Er is een fout opgetreden",
  "common.save": "Opslaan", "common.cancel": "Annuleren", "common.delete": "Verwijderen",
  "common.copy": "Kopiëren", "common.copied": "Gekopieerd!",
};

const pt: Record<string, string> = {
  "nav.dashboard": "Painel", "nav.scans": "Varreduras", "nav.compliance": "Conformidade",
  "nav.crawl": "Rastrear site", "nav.priorities": "Prioridades", "nav.insights": "Análises IA",
  "nav.analytics": "Estatísticas", "nav.compare": "Comparar", "nav.webhooks": "Webhooks",
  "nav.settings": "Configurações", "nav.statement": "Declaração", "nav.darkMode": "Modo escuro",
  "nav.team": "Equipa", "nav.auditLog": "Registo de auditoria", "nav.notifications": "Notificações",
  "nav.integrations": "Integrações", "nav.signOut": "Sair", "nav.adminPanel": "Admin",
  "common.loading": "Carregando...", "common.error": "Ocorreu um erro",
  "common.save": "Salvar", "common.cancel": "Cancelar", "common.delete": "Excluir",
  "common.copy": "Copiar", "common.copied": "Copiado!",
};

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
