"use client";

/**
 * RegLayer — Role-Based Onboarding Flow
 *
 * WHY: Different roles have different priorities. A developer wants
 *      code fixes, a legal person wants compliance reports, an executive
 *      wants dashboards and risk scores.
 *
 * WHAT: "What's your role?" → Developer/Designer/Legal/Executive
 *       → Tailors dashboard layout, default views, and guidance.
 *
 * HOW: Full-screen overlay on first login (no role stored yet).
 *      Stores selection in localStorage + persists to API.
 *      Each role maps to a persona with specific dashboard config.
 */

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import {
  Code2, Palette, Scale, Briefcase, ArrowRight, Sparkles, Shield,
  BarChart3, FileText, Wrench, Eye, Target, CheckCircle2,
} from "lucide-react";

export type UserPersona = "developer" | "designer" | "legal" | "executive";

interface PersonaOption {
  id: UserPersona;
  title: string;
  subtitle: string;
  icon: typeof Code2;
  color: string;
  bg: string;
  ring: string;
  features: string[];
}

const personas: PersonaOption[] = [
  {
    id: "developer",
    title: "Developer",
    subtitle: "I build and fix web applications",
    icon: Code2,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    ring: "ring-blue-200 dark:ring-blue-800",
    features: ["Code-level fix suggestions", "CI/CD integration guidance", "ARIA pattern library", "Keyboard nav testing"],
  },
  {
    id: "designer",
    title: "Designer",
    subtitle: "I design interfaces and experiences",
    icon: Palette,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/40",
    ring: "ring-violet-200 dark:ring-violet-800",
    features: ["Color contrast checker", "Focus indicator audit", "Component pattern review", "Motion accessibility"],
  },
  {
    id: "legal",
    title: "Legal / Compliance",
    subtitle: "I manage regulatory risk",
    icon: Scale,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    ring: "ring-amber-200 dark:ring-amber-800",
    features: ["VPAT generation", "Compliance scorecards", "Litigation risk analysis", "Regulation tracking"],
  },
  {
    id: "executive",
    title: "Executive / Manager",
    subtitle: "I need the big picture",
    icon: Briefcase,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    ring: "ring-emerald-200 dark:ring-emerald-800",
    features: ["Risk dashboard", "Trend visualizations", "Team progress tracking", "ROI reporting"],
  },
];

interface RoleOnboardingProps {
  userName?: string | null;
  onComplete: (persona: UserPersona) => void;
}

export function RoleOnboarding({ userName, onComplete }: RoleOnboardingProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<UserPersona | null>(null);
  const [step, setStep] = useState<"role" | "confirm">("role");

  function handleContinue() {
    if (!selected) return;
    if (step === "role") {
      setStep("confirm");
      return;
    }
    // Persist to localStorage
    localStorage.setItem("reglayer_persona", selected);
    // Persist to API (fire-and-forget)
    fetch("/api/onboarding/persona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: selected }),
    }).catch(() => {});
    onComplete(selected);
  }

  const selectedPersona = personas.find((p) => p.id === selected);

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="w-full max-w-2xl px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {step === "role" ? (
          <>
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent/10 mb-4">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {t("onboarding.welcome").replace("{name}", userName ? `, ${userName}` : "")}
              </h1>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
                {t("onboarding.roleTitle")}
              </p>
            </div>

            {/* Role Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {personas.map((persona) => {
                const isSelected = selected === persona.id;
                return (
                  <button
                    key={persona.id}
                    onClick={() => setSelected(persona.id)}
                    className={`relative flex items-start gap-3.5 rounded-xl border-2 p-4 text-left transition-all duration-200 ${
                      isSelected
                        ? `border-accent ${persona.bg} ring-2 ${persona.ring} shadow-sm`
                        : "border-neutral-100 dark:border-neutral-800 hover:border-neutral-200 dark:hover:border-neutral-700 hover:shadow-sm"
                    }`}
                    aria-pressed={isSelected}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${persona.bg}`}>
                      <persona.icon className={`h-5 w-5 ${persona.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {persona.title}
                      </div>
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {persona.subtitle}
                      </div>
                    </div>
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Continue */}
            <div className="mt-8 text-center">
              <button
                onClick={handleContinue}
                disabled={!selected}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("onboarding.continue")}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          /* Confirmation / Preview Step */
          <>
            <div className="text-center mb-8">
              <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${selectedPersona?.bg} mb-4`}>
                {selectedPersona && <selectedPersona.icon className={`h-7 w-7 ${selectedPersona.color}`} />}
              </div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                Your {selectedPersona?.title} Dashboard
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                Here&apos;s what we&apos;ll prioritize for you:
              </p>
            </div>

            {/* Features Preview */}
            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-8">
              {selectedPersona?.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">{feature}</span>
                </div>
              ))}
            </div>

            {/* Dashboard Preview Cards */}
            <div className="rounded-xl border border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 max-w-md mx-auto">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-3">
                Dashboard Preview
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selected === "developer" && (
                  <>
                    <PreviewCard icon={Wrench} label="Fix Queue" value="12 issues" />
                    <PreviewCard icon={Code2} label="Code Fixes" value="Auto-gen" />
                    <PreviewCard icon={Target} label="WCAG Score" value="87%" />
                    <PreviewCard icon={Shield} label="CI Status" value="Passing" />
                  </>
                )}
                {selected === "designer" && (
                  <>
                    <PreviewCard icon={Eye} label="Contrast" value="4 issues" />
                    <PreviewCard icon={Palette} label="Colors" value="Audited" />
                    <PreviewCard icon={Target} label="Focus" value="3 missing" />
                    <PreviewCard icon={Shield} label="Motion" value="Safe" />
                  </>
                )}
                {selected === "legal" && (
                  <>
                    <PreviewCard icon={Scale} label="Risk Level" value="Medium" />
                    <PreviewCard icon={FileText} label="VPAT" value="Draft" />
                    <PreviewCard icon={Shield} label="Compliance" value="72%" />
                    <PreviewCard icon={BarChart3} label="Trend" value="↑ 8%" />
                  </>
                )}
                {selected === "executive" && (
                  <>
                    <PreviewCard icon={BarChart3} label="Overview" value="3 sites" />
                    <PreviewCard icon={Target} label="Avg Score" value="84%" />
                    <PreviewCard icon={Shield} label="Risk" value="Low" />
                    <PreviewCard icon={Briefcase} label="ROI" value="$42k saved" />
                  </>
                )}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                onClick={() => setStep("role")}
                className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleContinue}
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-6 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
              >
                Start Using RegLayer
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PreviewCard({ icon: Icon, label, value }: { icon: typeof Code2; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white dark:bg-neutral-800 border border-neutral-100 dark:border-neutral-700 p-3">
      <Icon className="h-3.5 w-3.5 text-neutral-400 mb-1.5" />
      <div className="text-[10px] text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="text-xs font-semibold text-neutral-900 dark:text-white">{value}</div>
    </div>
  );
}
