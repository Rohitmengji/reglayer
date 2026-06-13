"use client";

/**
 * RegLayer — Onboarding Flow Component
 *
 * WHY: New users are lost without guidance. A step-by-step wizard
 *      helps them run their first scan and understand the platform.
 *
 * WHAT: Multi-step overlay that guides users through:
 *   1. Welcome + set display name
 *   2. Enter a URL to scan
 *   3. Review scan results
 *   4. Explore next steps
 *
 * HOW: Shown on dashboard when user has 0 scans. Dismissed via localStorage.
 */

import { useState } from "react";
import {
  Rocket,
  ArrowRight,
  Globe,
  CheckCircle2,
  Sparkles,
  Target,
  BookOpen,
  BarChart3,
  X,
} from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface OnboardingProps {
  userName?: string | null;
  onComplete: () => void;
  onStartScan: (url: string) => void;
}

export function OnboardingFlow({ userName, onComplete, onStartScan }: OnboardingProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [url, setUrl] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem("reglayer_onboarding_dismissed", "true");
    setDismissed(true);
    onComplete();
  }

  function handleScan() {
    if (!url.trim()) return;
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }
    onStartScan(normalizedUrl);
    handleDismiss();
  }

  const steps = [
    // Step 0: Welcome
    <div key="welcome" className="space-y-6 text-center">
      <div className="flex items-center justify-center">
        <div className="relative">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-linear-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/30 dark:to-violet-900/30">
            <Rocket className="h-9 w-9 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center ring-4 ring-white dark:ring-neutral-900">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t("onboarding.welcome", { name: userName ? `, ${userName}` : "" })}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-sm mx-auto">
          {t("onboarding.welcomeDesc")}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto">
        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 p-3 text-center">
          <Target className="h-5 w-5 text-blue-500 mx-auto mb-1" />
          <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300">{t("onboarding.scan")}</p>
        </div>
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 p-3 text-center">
          <BarChart3 className="h-5 w-5 text-amber-500 mx-auto mb-1" />
          <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">{t("onboarding.analyze")}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 p-3 text-center">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
          <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">{t("onboarding.fix")}</p>
        </div>
      </div>
      <button
        onClick={() => setStep(1)}
        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
      >
        {t("onboarding.getStarted")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>,

    // Step 1: First Scan
    <div key="scan" className="space-y-6">
      <div className="text-center">
        <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 mx-auto mb-4">
          <Globe className="h-7 w-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          {t("onboarding.firstScanTitle")}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {t("onboarding.firstScanDesc")}
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 pl-10 pr-3 py-3 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleScan()}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {["https://google.com", "https://github.com", "https://wikipedia.org"].map((example) => (
            <button
              key={example}
              onClick={() => setUrl(example)}
              className="text-[11px] px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
            >
              {example.replace("https://", "")}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleScan}
          disabled={!url.trim()}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
            url.trim()
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 cursor-not-allowed"
          }`}
        >
          <Target className="h-4 w-4" />
          {t("onboarding.scanNow")}
        </button>
      </div>

      <p className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center">
        {t("onboarding.scanTiming")}
      </p>
    </div>,

    // Step 2: What's Next
    <div key="next" className="space-y-6 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 mx-auto">
        <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
          {t("onboarding.allSet")}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          {t("onboarding.allSetDesc")}
        </p>
      </div>
      <div className="space-y-2.5 text-left max-w-sm mx-auto">
        {[
          { icon: BarChart3, label: t("onboarding.viewHistory"), desc: t("onboarding.viewHistoryDesc"), color: "text-blue-500" },
          { icon: Target, label: t("onboarding.fixViolations"), desc: t("onboarding.fixViolationsDesc"), color: "text-amber-500" },
          { icon: BookOpen, label: t("onboarding.learnA11y"), desc: t("onboarding.learnA11yDesc"), color: "text-emerald-500" },
          { icon: Sparkles, label: t("onboarding.trackSkill"), desc: t("onboarding.trackSkillDesc"), color: "text-violet-500" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/30 px-3 py-2.5">
            <item.icon className={`h-4 w-4 ${item.color} shrink-0`} />
            <div>
              <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{item.label}</p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={handleDismiss}
        className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
      >
        {t("onboarding.startExploring")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>,
  ];

  return (
    <div className="relative rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 bg-linear-to-br from-white via-indigo-50/20 to-violet-50/20 dark:from-neutral-900 dark:via-indigo-950/10 dark:to-violet-950/10 p-8 shadow-lg">
      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute top-4 right-4 p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Skip onboarding"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[0, 1, 2].map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step
                ? "w-6 bg-indigo-500"
                : s < step
                  ? "w-1.5 bg-indigo-300 dark:bg-indigo-700"
                  : "w-1.5 bg-neutral-200 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>

      {steps[step]}
    </div>
  );
}
