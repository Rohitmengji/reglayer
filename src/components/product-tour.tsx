"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, ArrowRight, Sparkles } from "lucide-react";

interface TourStep {
  target: string; // CSS selector
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "[data-tour='scan-input']",
    title: "Try a free scan",
    description: "Paste any URL and get an instant accessibility report — no sign-up needed.",
    position: "top",
  },
  {
    target: "[data-tour='features']",
    title: "Powerful features",
    description: "Deep WCAG scanning, AI fixes, monitoring, and audit-ready reports.",
    position: "top",
  },
  {
    target: "[data-tour='get-started']",
    title: "Ready to start?",
    description: "Create a free account to unlock dashboards, scheduling, and team features.",
    position: "top",
  },
];

const STORAGE_KEY = "reglayer_tour_completed";

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});
  const [arrowDirection, setArrowDirection] = useState<"top" | "bottom">("top");
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Show tour only for first-time visitors (after a short delay)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed) return;

    const timer = setTimeout(() => setActive(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const completeTour = useCallback(() => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const nextStep = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      completeTour();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, completeTour]);

  // Position tooltip relative to target element
  useEffect(() => {
    if (!active) return;

    const position = () => {
      const currentStep = TOUR_STEPS[step];
      const el = document.querySelector(currentStep.target);
      if (!el) {
        // If element not visible, skip to next or complete
        if (step < TOUR_STEPS.length - 1) setStep(step + 1);
        else completeTour();
        return;
      }

      const rect = el.getBoundingClientRect();
      const tooltipWidth = 280;
      const gap = 12;

      // Scroll element into view if needed
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        rafRef.current = requestAnimationFrame(position);
        return;
      }

      let top: number;
      let left: number;
      let direction: "top" | "bottom";

      // Determine if tooltip goes above or below
      const spaceBelow = window.innerHeight - rect.bottom;
      if (currentStep.position === "bottom" || spaceBelow < 200) {
        // Place above the element
        top = rect.top - gap;
        direction = "bottom"; // arrow points down
      } else {
        // Place below the element
        top = rect.bottom + gap;
        direction = "top"; // arrow points up
      }

      // Center horizontally on the element
      left = rect.left + rect.width / 2 - tooltipWidth / 2;

      // Clamp to viewport
      left = Math.max(16, Math.min(left, window.innerWidth - tooltipWidth - 16));

      setArrowDirection(direction);
      setTooltipStyle({
        position: "fixed",
        top: direction === "bottom" ? undefined : `${top}px`,
        bottom: direction === "bottom" ? `${window.innerHeight - top}px` : undefined,
        left: `${left}px`,
        width: `${tooltipWidth}px`,
      });

      // Arrow position
      const arrowLeft = rect.left + rect.width / 2 - left - 6;
      setArrowStyle({ left: `${Math.max(12, Math.min(arrowLeft, tooltipWidth - 24))}px` });
    };

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      cancelAnimationFrame(rafRef.current);
    };
  }, [active, step, completeTour]);

  // Highlight the target element
  useEffect(() => {
    if (!active) return;
    const currentStep = TOUR_STEPS[step];
    const el = document.querySelector(currentStep.target) as HTMLElement | null;
    if (!el) return;

    // Find any ancestor with a stacking context (sticky/fixed headers) and elevate it
    const stickyAncestor = el.closest("[class*='sticky'], [class*='fixed']") as HTMLElement | null;
    if (stickyAncestor && stickyAncestor !== el) {
      stickyAncestor.style.zIndex = "70";
    }

    el.style.position = "relative";
    el.style.zIndex = "70";
    el.style.borderRadius = "12px";
    el.style.boxShadow = "0 0 0 4000px rgba(0,0,0,0.4), 0 0 0 4px rgba(59,130,246,0.5)";
    el.style.transition = "box-shadow 0.3s ease";

    return () => {
      if (stickyAncestor && stickyAncestor !== el) {
        stickyAncestor.style.zIndex = "";
      }
      el.style.position = "";
      el.style.zIndex = "";
      el.style.boxShadow = "";
      el.style.borderRadius = "";
      el.style.transition = "";
    };
  }, [active, step]);

  if (!active) return null;

  const currentStep = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Backdrop — click to dismiss */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={completeTour}
        aria-hidden="true"
      />

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        className="fixed z-[80] animate-in fade-in slide-in-from-bottom-2 duration-200"
      >
        {/* Arrow */}
        {arrowDirection === "top" && (
          <div style={arrowStyle} className="absolute -top-1.5 w-3 h-3 rotate-45 bg-white dark:bg-neutral-800 border-t border-l border-neutral-200 dark:border-neutral-700" />
        )}

        <div className="rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-[0_4px_24px_rgba(0,0,0,0.12)] p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{currentStep.title}</h3>
            </div>
            <button
              onClick={completeTour}
              className="rounded-md p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
              aria-label="Close tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {currentStep.description}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-700">
            {/* Progress dots */}
            <div className="flex items-center gap-1">
              {TOUR_STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === step ? "w-4 bg-blue-500" : i < step ? "w-1.5 bg-blue-300" : "w-1.5 bg-neutral-200 dark:bg-neutral-600"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={completeTour}
                className="text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={nextStep}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-900 dark:bg-white px-2.5 py-1 text-[11px] font-medium text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                {isLast ? "Got it" : "Next"}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Arrow bottom */}
        {arrowDirection === "bottom" && (
          <div style={arrowStyle} className="absolute -bottom-1.5 w-3 h-3 rotate-45 bg-white dark:bg-neutral-800 border-b border-r border-neutral-200 dark:border-neutral-700" />
        )}
      </div>
    </>
  );
}
