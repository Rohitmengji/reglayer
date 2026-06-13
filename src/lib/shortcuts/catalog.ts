/**
 * RegLayer — Keyboard shortcuts catalog.
 *
 * Single source of truth shared by the shortcuts help modal (display) and the
 * global shortcut handler (behavior). Adding a navigable shortcut here with a
 * `path` automatically wires it up in `GlobalShortcuts` and lists it in the
 * help modal — keeping the two in sync.
 */

import type { TranslationKey } from "@/lib/i18n/translations";

export type ShortcutGroup = "general" | "navigation" | "actions";

export interface ShortcutDef {
  id: string;
  /** Display tokens, e.g. ["g", "d"] or ["⌘", "K"]. */
  keys: string[];
  labelKey: TranslationKey;
  group: ShortcutGroup;
  /** When set, GlobalShortcuts navigates here when the combo is pressed. */
  path?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  // General — owned by other components; listed here for discoverability.
  { id: "palette", keys: ["⌘", "K"], labelKey: "shortcuts.commandPalette", group: "general" },
  { id: "help", keys: ["?"], labelKey: "shortcuts.showShortcuts", group: "general" },
  { id: "close", keys: ["Esc"], labelKey: "shortcuts.close", group: "general" },

  // Navigation — "g" then a letter.
  { id: "go-dashboard", keys: ["g", "d"], labelKey: "shortcuts.goDashboard", group: "navigation", path: "/dashboard" },
  { id: "go-scans", keys: ["g", "s"], labelKey: "shortcuts.goScans", group: "navigation", path: "/scans" },
  { id: "go-violations", keys: ["g", "v"], labelKey: "shortcuts.goViolations", group: "navigation", path: "/violations" },
  { id: "go-trends", keys: ["g", "t"], labelKey: "shortcuts.goTrends", group: "navigation", path: "/trends" },

  // Actions — single key.
  { id: "new-scan", keys: ["n"], labelKey: "shortcuts.newScan", group: "actions", path: "/dashboard" },
];

export const SHORTCUT_GROUP_ORDER: ShortcutGroup[] = ["general", "navigation", "actions"];

export const SHORTCUT_GROUP_LABEL: Record<ShortcutGroup, TranslationKey> = {
  general: "shortcuts.group.general",
  navigation: "shortcuts.group.navigation",
  actions: "shortcuts.group.actions",
};

/** Returns true when focus is inside an editable field — used to suppress
 *  printable-key shortcuts so typing "?" or "n" in a form does nothing. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  if (!node || typeof node.tagName !== "string") return false;
  const tag = node.tagName.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true;
}
