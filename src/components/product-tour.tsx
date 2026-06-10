"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight } from "lucide-react";

interface TourStep {
  target: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='scan-input']",
    title: "Scan any website",
    description: "Paste a URL here to get a free accessibility report — instant results, no sign-up.",
  },
  {
    target: "[data-tour='features']",
    title: "Built for compliance teams",
    description: "WCAG scanning, AI fixes, monitoring, and audit-ready reports in one platform.",
  },
  {
    target: "[data-tour='get-started']",
    title: "Create your free account",
    description: "Unlock dashboards, scheduled scans, team collaboration, and certificates.",
  },
];

const STORAGE_KEY = "reglayer_tour_completed";

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ top: number; left: number; placement: "above" | "below" } | null>(null);

  // Show tour for first-time visitors after delay
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setActive(true), 1200);
    return () => clearTimeout(t);
  }, []);

  const dismiss = useCallback(() => {
    setActive(false);
    setRect(null);
    setTooltip(null);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const next = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) dismiss();
    else setStep((s) => s + 1);
  }, [step, dismiss]);

  // Position highlight + tooltip on the target element
  useEffect(() => {
    if (!active) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    let positioned = false;

    const position = () => {
      const el = document.querySelector(TOUR_STEPS[step].target) as HTMLElement | null;
      if (!el) { setRect(null); setTooltip(null); return; }

      const r = el.getBoundingClientRect();

      // If element is off-screen, scroll to it and reposition after scroll
      if (!positioned && (r.top < 60 || r.bottom > window.innerHeight - 60)) {
        positioned = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        scrollTimeout = setTimeout(position, 500);
        return;
      }
      positioned = true;

      // Highlight rect (fixed position = viewport coords)
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });

      // Tooltip placement
      const tooltipH = 140;
      const tooltipW = 280;
      const spaceBelow = window.innerHeight - r.bottom;
      const placement = spaceBelow > tooltipH + 16 ? "below" : "above";

      let left = r.left + r.width / 2 - tooltipW / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));

      const top = placement === "below" ? r.bottom + 14 : r.top - tooltipH - 14;
      setTooltip({ top, left, placement });
    };

    // Reset positioning flag on step change
    positioned = false;
    position();

    const onScroll = () => requestAnimationFrame(position);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", position);
      clearTimeout(scrollTimeout);
    };
  }, [active, step]);

  if (!active || !rect || !tooltip) return null;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Highlight ring around target — fixed position */}
      <div
        className="fixed z-9998 rounded-xl pointer-events-none border-2 border-blue-500/70 transition-all duration-300 ease-out"
        style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
      >
        <div className="absolute -inset-1 rounded-xl border border-blue-400/30 animate-pulse" />
      </div>

      {/* Tooltip — fixed position */}
      <div
        className="fixed z-9999 w-70"
        style={{ top: tooltip.top, left: tooltip.left }}
        key={step}
        role="region"
        aria-label={`Product tour: ${current.title}`}
      >
        {/* Arrow pointing to element */}
        {tooltip.placement === "below" && (
          <div className="flex justify-center -mb-1.5 relative z-10">
            <div className="w-3 h-3 rotate-45 bg-white dark:bg-neutral-800 border-t border-l border-neutral-200 dark:border-neutral-700" />
          </div>
        )}

        <div className="rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] p-3.5">
          {/* Step + dismiss */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
              Step {step + 1} of {TOUR_STEPS.length}
            </span>
            <button
              onClick={dismiss}
              className="p-0.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              aria-label="Close tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-white leading-tight">{current.title}</h3>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-1">{current.description}</p>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-700/60">
            {/* Progress dots */}
            <div className="flex gap-1">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? "w-4 bg-blue-500" : i < step ? "w-1.5 bg-blue-300 dark:bg-blue-600" : "w-1.5 bg-neutral-200 dark:bg-neutral-600"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={dismiss}
                className="text-[11px] px-2 py-0.5 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={next}
                className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1 text-[11px] font-medium text-white transition-colors"
              >
                {isLast ? "Got it!" : "Next"}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Arrow pointing to element (when above) */}
        {tooltip.placement === "above" && (
          <div className="flex justify-center -mt-1.5 relative z-10">
            <div className="w-3 h-3 rotate-45 bg-white dark:bg-neutral-800 border-b border-r border-neutral-200 dark:border-neutral-700" />
          </div>
        )}
      </div>
    </>
  );
}
