/**
 * RegLayer — Accessibility viewing preferences
 *
 * RegLayer sells accessibility, so it should let users tune how the product
 * itself renders. These preferences are applied as data-attributes on <html>
 * and styled in globals.css. Stored in localStorage; no backend, no migration.
 */

export type ContrastPref = "normal" | "high";
export type MotionPref = "normal" | "reduced";
export type TextPref = "normal" | "large";

export interface ViewingPreferences {
  contrast: ContrastPref;
  motion: MotionPref;
  text: TextPref;
}

export const DEFAULT_PREFERENCES: ViewingPreferences = {
  contrast: "normal",
  motion: "normal",
  text: "normal",
};

const STORAGE_KEY = "reglayer-a11y-prefs";
export const A11Y_CHANGE_EVENT = "reglayer:a11y-change";

export function readPreferences(): ViewingPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<ViewingPreferences>;
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function writePreferences(prefs: ViewingPreferences): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(A11Y_CHANGE_EVENT));
}

/** Reflect preferences onto <html> as data-attributes (or remove when default). */
export function applyPreferences(prefs: ViewingPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  setOrRemove(root, "data-a11y-contrast", prefs.contrast, "high");
  setOrRemove(root, "data-a11y-motion", prefs.motion, "reduced");
  setOrRemove(root, "data-a11y-text", prefs.text, "large");
}

function setOrRemove(root: HTMLElement, attr: string, value: string, activeValue: string) {
  if (value === activeValue) root.setAttribute(attr, value);
  else root.removeAttribute(attr);
}
