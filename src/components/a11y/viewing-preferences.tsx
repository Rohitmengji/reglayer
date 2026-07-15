"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Accessibility viewing-preferences widget
 * ---------------------------------------------------------
 *
 * WHY: An accessibility product should be exemplary about its own a11y. This
 * gives every user high-contrast, reduced-motion, and larger-text controls.
 *
 * WHAT: A floating button (bottom-right) that opens a small panel of toggles.
 * Preferences persist in localStorage and apply instantly via <html> data-attrs.
 *
 * HOW: Mounted once in Providers. Applies stored prefs on mount and whenever
 * they change (including via the command-palette dispatching A11Y_CHANGE_EVENT).
 * ---------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import { Accessibility, Contrast, Eye, Type, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/components/i18n-provider";
import {
  readPreferences,
  writePreferences,
  applyPreferences,
  A11Y_CHANGE_EVENT,
  type ViewingPreferences,
} from "@/lib/a11y/preferences";
import { useChatStore } from "@/stores/chatStore";

export function ViewingPreferences() {
  const { t } = useI18n();
  const chatPanelOpen = useChatStore((s) => s.panelOpen);
  const [prefs, setPrefs] = useState<ViewingPreferences>(readPreferences);
  const [open, setOpen] = useState(false);
  const [scrolling, setScrolling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply on mount + whenever another surface changes prefs.
  useEffect(() => {
    applyPreferences(readPreferences());
    function onChange() {
      const next = readPreferences();
      setPrefs(next);
      applyPreferences(next);
    }
    window.addEventListener(A11Y_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(A11Y_CHANGE_EVENT, onChange);
  }, []);

  // Hide while user is scrolling, reappear after 800ms idle.
  useEffect(() => {
    const mainEl = document.getElementById("main-content");
    if (!mainEl) return;
    function onScroll() {
      setScrolling(true);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
      scrollTimer.current = setTimeout(() => setScrolling(false), 800);
    }
    mainEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", onScroll);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    };
  }, []);

  // Close panel on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function update(partial: Partial<ViewingPreferences>) {
    const next = { ...prefs, ...partial };
    setPrefs(next);
    applyPreferences(next);
    writePreferences(next);
  }

  const anyActive =
    prefs.contrast !== "normal" || prefs.motion !== "normal" || prefs.text !== "normal";

  return (
    <div ref={ref} className={`fixed bottom-20 right-6 z-9998 print:hidden transition-opacity duration-200${chatPanelOpen || scrolling ? " opacity-0 pointer-events-none" : ""}`}>
      {open && (
        <div className="absolute bottom-14 right-0 w-72 rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900 animate-in slide-in-from-bottom-2 fade-in duration-150">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <p className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("a11y.title")}
            </p>
            <button
              onClick={() => setOpen(false)}
              aria-label={t("a11y.close")}
              className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2">
            <Toggle
              icon={Contrast}
              label={t("a11y.highContrast")}
              active={prefs.contrast === "high"}
              onClick={() => update({ contrast: prefs.contrast === "high" ? "normal" : "high" })}
            />
            <Toggle
              icon={Eye}
              label={t("a11y.reducedMotion")}
              active={prefs.motion === "reduced"}
              onClick={() => update({ motion: prefs.motion === "reduced" ? "normal" : "reduced" })}
            />
            <Toggle
              icon={Type}
              label={t("a11y.largerText")}
              active={prefs.text === "large"}
              onClick={() => update({ text: prefs.text === "large" ? "normal" : "large" })}
            />
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("a11y.title")}
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors",
          "bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50",
          "dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
        )}
      >
        <Accessibility className="h-5 w-5" />
        {anyActive && (
          <span
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-white dark:ring-neutral-900"
            aria-hidden
          />
        )}
      </button>
    </div>
  );
}

function Toggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={active}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          active
            ? "bg-accent text-white"
            : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
        {label}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          active ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-700"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
            active ? "left-[1.125rem]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
