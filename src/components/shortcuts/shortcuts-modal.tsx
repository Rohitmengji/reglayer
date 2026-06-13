"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Keyboard shortcuts help modal
 * ---------------------------------------------------------
 *
 * WHY: Only ⌘K existed and it was undiscoverable. A "?" overlay makes the
 * keyboard surface legible to everyone.
 *
 * WHAT: Press "?" anywhere (outside a text field) to open a grouped list of
 * shortcuts; Esc closes it. Reuses the command palette's backdrop/dialog/kbd
 * styling for visual consistency.
 *
 * HOW: A self-contained global keydown listener. "?" is a printable key, so it
 * is suppressed while typing via isTypingTarget().
 * ---------------------------------------------------------
 */

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import {
  SHORTCUTS,
  SHORTCUT_GROUP_ORDER,
  SHORTCUT_GROUP_LABEL,
  isTypingTarget,
} from "@/lib/shortcuts/catalog";

export function ShortcutsModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      // "?" toggles — but never while typing, and never with modifiers held.
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("reglayer:open-shortcuts", onOpenEvent);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("reglayer:open-shortcuts", onOpenEvent);
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-9999 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-10000 flex items-start justify-center pt-[15vh] px-4">
        <div
          className="w-full max-w-140 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 animate-in slide-in-from-top-2 fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label={t("shortcuts.title")}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3.5 dark:border-neutral-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                <Keyboard className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {t("shortcuts.title")}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("shortcuts.subtitle")}
                </div>
              </div>
            </div>
            <kbd className="inline-flex h-5 items-center rounded border border-neutral-200 bg-neutral-50 px-1.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              ESC
            </kbd>
          </div>

          {/* Groups */}
          <div className="max-h-90 overflow-y-auto overscroll-contain p-2">
            {SHORTCUT_GROUP_ORDER.map((group) => {
              const items = SHORTCUTS.filter((s) => s.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="mb-1">
                  <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {t(SHORTCUT_GROUP_LABEL[group])}
                  </div>
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                    >
                      <span className="text-sm text-neutral-700 dark:text-neutral-200">
                        {t(s.labelKey)}
                      </span>
                      <span className="flex items-center gap-1">
                        {s.keys.map((key, i) => (
                          <kbd
                            key={i}
                            className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-1.5 text-[11px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                          >
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
