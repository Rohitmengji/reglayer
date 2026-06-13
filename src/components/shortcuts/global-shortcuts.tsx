"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Global navigation shortcuts
 * ---------------------------------------------------------
 *
 * WHY: Power users want to jump around without reaching for the mouse or
 * even opening the command palette.
 *
 * WHAT: Registers the navigable shortcuts declared in the shortcuts catalog —
 * "g" then a letter (g d → dashboard), and single-key actions (n → new scan).
 * Does NOT touch ⌘K (the command palette owns it) or "?" (the help modal owns it).
 *
 * HOW: A single keydown listener mirroring the command palette's pattern.
 * Sequences are tracked with a short-lived "pending g" ref. Printable keys are
 * suppressed while typing in a field via isTypingTarget().
 * ---------------------------------------------------------
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SHORTCUTS, isTypingTarget } from "@/lib/shortcuts/catalog";

const SEQUENCE_TIMEOUT_MS = 1000;

// Derive lookup maps from the catalog so behavior stays in sync with display.
const gMap = new Map<string, string>(); // "g" + key → path
const singleMap = new Map<string, string>(); // key → path
for (const s of SHORTCUTS) {
  if (!s.path) continue;
  if (s.keys.length === 2 && s.keys[0] === "g") {
    gMap.set(s.keys[1].toLowerCase(), s.path);
  } else if (s.keys.length === 1 && /^[a-z]$/i.test(s.keys[0])) {
    singleMap.set(s.keys[0].toLowerCase(), s.path);
  }
}

export function GlobalShortcuts() {
  const router = useRouter();
  const pendingG = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function clearPending() {
      pendingG.current = false;
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Ignore when modifiers are held (those belong to other handlers) or
      // when the user is typing into a field.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();

      if (pendingG.current) {
        clearPending();
        const path = gMap.get(key);
        if (path) {
          e.preventDefault();
          router.push(path);
        }
        return;
      }

      if (key === "g") {
        pendingG.current = true;
        timer.current = setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
        return;
      }

      const path = singleMap.get(key);
      if (path) {
        e.preventDefault();
        router.push(path);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, [router]);

  return null;
}
