"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight, Scan, BarChart3, Rocket } from "lucide-react";

interface TourStep {
  icon: typeof Scan;
  title: string;
  description: string;
  action?: { label: string; scroll: string };
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: Scan,
    title: "Try a free scan",
    description: "Paste any URL in the box above to get an instant accessibility report — no sign-up needed.",
    action: { label: "Show me", scroll: "[data-tour='scan-input']" },
  },
  {
    icon: BarChart3,
    title: "Explore features",
    description: "Deep WCAG scanning, AI-powered fixes, continuous monitoring, and audit-ready reports — all in one platform.",
    action: { label: "See features", scroll: "[data-tour='features']" },
  },
  {
    icon: Rocket,
    title: "Create your account",
    description: "Sign up free to unlock dashboards, scheduled scans, team collaboration, and compliance certificates.",
    action: { label: "Get started", scroll: "[data-tour='get-started']" },
  },
];

const STORAGE_KEY = "reglayer_tour_completed";

export function ProductTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed) return;
    const timer = setTimeout(() => setActive(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setActive(false);
      localStorage.setItem(STORAGE_KEY, "true");
    }, 200);
  }, []);

  const nextStep = useCallback(() => {
    if (step >= TOUR_STEPS.length - 1) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, dismiss]);

  const handleAction = useCallback(() => {
    const current = TOUR_STEPS[step];
    if (current.action?.scroll) {
      const el = document.querySelector(current.action.scroll);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    // Auto-advance after a short delay
    setTimeout(nextStep, 600);
  }, [step, nextStep]);

  if (!active) return null;

  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div
      className={`fixed bottom-5 right-5 z-50 w-[300px] transition-all duration-200 ${
        exiting ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
      }`}
      style={{ animation: exiting ? undefined : "slideUp 0.3s ease-out" }}
    >
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] overflow-hidden">
        {/* Progress bar */}
        <div className="h-0.5 bg-neutral-100 dark:bg-neutral-700">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-blue-50 dark:bg-blue-950/40">
                <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-[13px] font-semibold text-neutral-900 dark:text-white">{current.title}</h3>
            </div>
            <button
              onClick={dismiss}
              className="rounded-md p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              aria-label="Dismiss tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed pl-8">
            {current.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between mt-3.5 pl-8">
            {/* Step indicator */}
            <span className="text-[10px] text-neutral-400 font-medium tabular-nums">
              {step + 1} of {TOUR_STEPS.length}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={dismiss}
                className="rounded-md px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Skip
              </button>
              {current.action && (
                <button
                  onClick={handleAction}
                  className="rounded-md px-2.5 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                >
                  {current.action.label}
                </button>
              )}
              <button
                onClick={nextStep}
                className="inline-flex items-center gap-0.5 rounded-md bg-neutral-900 dark:bg-white px-2.5 py-1 text-[11px] font-medium text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                {isLast ? "Done" : "Next"}
                {!isLast && <ArrowRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
