"use client";

/**
 * RegLayer — InfoHint
 *
 * WHY: The app uses domain jargon (score bands, "remediation", VPAT, landmarks…).
 *      A small, consistent "?" affordance lets users get a plain-English
 *      explanation without cluttering the UI — so nothing feels senseless.
 * WHAT: An accessible info tooltip. Shows on hover AND keyboard focus; the trigger
 *       is a real button with an aria-label, and the tooltip text is linked via
 *       aria-describedby so screen readers announce it.
 * HOW: CSS-driven visibility (group-hover + group-focus-within) — no JS state,
 *       no portal — and it respects prefers-reduced-motion via the global rules.
 */

import { useId } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface InfoHintProps {
  /** Plain-English explanation shown in the tooltip + announced to screen readers. */
  content: React.ReactNode;
  /** Accessible name for the trigger button (e.g. "What this score means"). */
  label: string;
  /** Tooltip placement relative to the trigger. */
  side?: "top" | "bottom";
  className?: string;
}

export function InfoHint({ content, label, side = "top", className }: InfoHintProps) {
  const id = useId();
  return (
    <span className={cn("group relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label={label}
        aria-describedby={id}
        className="inline-flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 transition-colors"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-neutral-900 dark:bg-neutral-800 px-2.5 py-1.5 text-left text-xs font-normal leading-relaxed text-white shadow-lg ring-1 ring-black/5",
          "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
        )}
      >
        {content}
      </span>
    </span>
  );
}
