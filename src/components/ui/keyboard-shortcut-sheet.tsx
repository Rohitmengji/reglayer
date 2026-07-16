"use client";

/**
 * Keyboard Shortcut Reference Sheet
 *
 * WHY: Power users need discoverability. Figma shows all shortcuts with ?.
 * WHAT: Modal overlay showing all available keyboard shortcuts.
 * HOW: Triggered by ? key (when not in input), shows categorized shortcut list.
 */

import { useState, useEffect, useCallback } from "react";
import { X, Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Shortcut[];
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl";

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: [mod, "K"], description: "Open command palette" },
      { keys: ["G", "D"], description: "Go to dashboard" },
      { keys: ["G", "S"], description: "Go to scans" },
      { keys: ["G", "V"], description: "Go to violations" },
      { keys: ["G", "T"], description: "Go to settings" },
    ],
  },
  {
    title: "AI Assistant",
    shortcuts: [
      { keys: [mod, "J"], description: "Toggle AI chat panel" },
      { keys: ["Esc"], description: "Close chat panel" },
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "New line in message" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: [mod, "Enter"], description: "Submit current form" },
      { keys: [mod, "S"], description: "Save changes" },
      { keys: [mod, "Z"], description: "Undo last action" },
      { keys: ["?"], description: "Show this shortcut sheet" },
    ],
  },
  {
    title: "Scanning",
    shortcuts: [
      { keys: [mod, "Shift", "S"], description: "Start new scan" },
      { keys: [mod, "Shift", "R"], description: "Re-run last scan" },
    ],
  },
];

export function KeyboardShortcutSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }

      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" onClick={close} aria-hidden />
      <div
        className="fixed inset-0 z-[91] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div className="w-full max-w-lg rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl animate-scale-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2.5">
              <Keyboard className="h-5 w-5 text-neutral-500" />
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Keyboard Shortcuts</h2>
            </div>
            <button
              onClick={close}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Shortcut list */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-5">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2">
                  {group.title}
                </h3>
                <div className="space-y-1">
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.description} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className="min-w-[24px] px-1.5 py-0.5 text-center text-[11px] font-mono rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30">
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 text-center">
              Press <kbd className="px-1 py-0.5 text-[10px] font-mono rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">?</kbd> anytime to toggle this sheet
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
