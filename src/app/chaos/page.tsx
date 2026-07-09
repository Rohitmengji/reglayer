/**
 * RegLayer — Accessibility Chaos Engineering Page
 *
 * Simulates accessibility regressions to test your monitoring resilience.
 * Shows which scenarios your monitors would catch, and which gaps to fix.
 */
"use client";

import { useState, useEffect } from "react";
import {
  Flame,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Eye,
  EyeOff,
  Target,
  Activity,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  category: "perceivable" | "operable" | "understandable" | "robust";
  severity: "critical" | "serious" | "moderate";
  commonCause: string;
  simulatedImpact: {
    scoreDropRange: [number, number];
    newViolations: number;
    newCritical: number;
    affectedCriteria: string[];
    affectedRules: string[];
  };
}

interface ChaosResult {
  scenario: ChaosScenario;
  detected: boolean;
  detectedBy: string[];
  gaps: string[];
  recommendation: string;
}

interface ChaosReport {
  detectionScore: number;
  scenariosRun: number;
  scenariosDetected: number;
  scenariosMissed: number;
  results: ChaosResult[];
  coverageByCategory: Record<string, { total: number; detected: number }>;
  topRecommendations: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  perceivable: "Perceivable",
  operable: "Operable",
  understandable: "Understandable",
  robust: "Robust",
};

const CATEGORY_COLORS: Record<string, string> = {
  perceivable: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  operable: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  understandable: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  robust: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  serious: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ChaosPage() {
  const [report, setReport] = useState<ChaosReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "detected" | "missed">("all");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/chaos");
        if (res.ok) {
          const data = await res.json();
          setReport(data);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredResults = report?.results.filter((r) => {
    if (filter === "detected") return r.detected;
    if (filter === "missed") return !r.detected;
    return true;
  });

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Flame className="h-6 w-6 text-orange-500" />
            Chaos Engineering
          </h1>
          <p className="text-neutral-500 dark:text-neutral-400 mt-1">
            Simulate accessibility regressions to test your monitoring resilience
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          </div>
        ) : report ? (
          <>
            {/* Detection Score Hero */}
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 bg-white dark:bg-neutral-900 text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <DetectionIcon score={report.detectionScore} />
                <span className="text-5xl font-bold">
                  {report.detectionScore}
                  <span className="text-2xl text-neutral-400">%</span>
                </span>
              </div>
              <p className="text-lg font-medium">Detection Score</p>
              <p className="text-sm text-neutral-500 mt-1">
                {report.scenariosDetected} of {report.scenariosRun} simulated regressions would be caught by your monitors
              </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                label="Scenarios Run"
                value={String(report.scenariosRun)}
                icon={<Activity className="h-5 w-5 text-violet-500" />}
              />
              <StatCard
                label="Detected"
                value={String(report.scenariosDetected)}
                icon={<Eye className="h-5 w-5 text-emerald-500" />}
              />
              <StatCard
                label="Missed"
                value={String(report.scenariosMissed)}
                icon={<EyeOff className="h-5 w-5 text-red-500" />}
              />
              <StatCard
                label="Coverage"
                value={`${report.detectionScore}%`}
                icon={<Target className="h-5 w-5 text-blue-500" />}
              />
            </div>

            {/* Coverage by WCAG Principle */}
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
              <h2 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Coverage by WCAG Principle
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(report.coverageByCategory).map(([cat, stats]) => (
                  <div key={cat} className="text-center">
                    <div className="relative w-16 h-16 mx-auto mb-2">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-neutral-200 dark:text-neutral-700" />
                        <circle
                          cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                          strokeDasharray={`${(stats.detected / stats.total) * 94} 94`}
                          className={stats.detected === stats.total ? "stroke-emerald-500" : "stroke-amber-500"}
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                        {stats.detected}/{stats.total}
                      </span>
                    </div>
                    <p className="text-xs font-medium">{CATEGORY_LABELS[cat] || cat}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Recommendations */}
            {report.topRecommendations.length > 0 && (
              <div className="border border-amber-200 dark:border-amber-800 rounded-xl p-4 bg-amber-50 dark:bg-amber-900/20">
                <h2 className="font-semibold mb-2 flex items-center gap-2 text-amber-800 dark:text-amber-300">
                  <Zap className="h-4 w-4" />
                  Top Recommendations
                </h2>
                <ul className="space-y-1.5">
                  {report.topRecommendations.map((rec, i) => (
                    <li key={i} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scenario Results */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Scenario Results</h2>
                <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
                  {(["all", "detected", "missed"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        filter === f
                          ? "bg-white dark:bg-neutral-700 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-700"
                      }`}
                    >
                      {f === "all" ? "All" : f === "detected" ? "Detected" : "Missed"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredResults?.map((result) => (
                  <ScenarioCard
                    key={result.scenario.id}
                    result={result}
                    expanded={expanded === result.scenario.id}
                    onToggle={() => setExpanded(expanded === result.scenario.id ? null : result.scenario.id)}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-neutral-500">
            Failed to load chaos simulation results.
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function DetectionIcon({ score }: { score: number }) {
  if (score >= 80) return <ShieldCheck className="h-10 w-10 text-emerald-500" />;
  if (score >= 50) return <ShieldAlert className="h-10 w-10 text-amber-500" />;
  return <ShieldX className="h-10 w-10 text-red-500" />;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 bg-white dark:bg-neutral-900">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ScenarioCard({
  result,
  expanded,
  onToggle,
}: {
  result: ChaosResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { scenario, detected, detectedBy, gaps, recommendation } = result;

  return (
    <div
      className={`border rounded-xl overflow-hidden transition-colors ${
        detected
          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
          : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
      }`}
    >
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-3">
          {detected ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{scenario.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${SEVERITY_STYLES[scenario.severity]}`}>
                {scenario.severity}
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${CATEGORY_COLORS[scenario.category]}`}>
                {CATEGORY_LABELS[scenario.category]}
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">{scenario.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-3">
          <span className="text-xs text-neutral-500 whitespace-nowrap hidden sm:inline">
            -{scenario.simulatedImpact.scoreDropRange[0]} to -{scenario.simulatedImpact.scoreDropRange[1]} pts
          </span>
          {expanded ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-neutral-200/50 dark:border-neutral-700/50">
          {/* Impact details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-neutral-500">Score Drop</span>
              <p className="font-medium">{scenario.simulatedImpact.scoreDropRange[0]}-{scenario.simulatedImpact.scoreDropRange[1]} pts</p>
            </div>
            <div>
              <span className="text-neutral-500">New Violations</span>
              <p className="font-medium">{scenario.simulatedImpact.newViolations}</p>
            </div>
            <div>
              <span className="text-neutral-500">New Critical</span>
              <p className="font-medium">{scenario.simulatedImpact.newCritical}</p>
            </div>
            <div>
              <span className="text-neutral-500">Common Cause</span>
              <p className="font-medium">{scenario.commonCause}</p>
            </div>
          </div>

          {/* Detection status */}
          {detected ? (
            <div className="bg-emerald-100/50 dark:bg-emerald-900/20 rounded-lg p-2.5">
              <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Detected by: {detectedBy.join(", ")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {gaps.length > 0 && (
                <div className="bg-red-100/50 dark:bg-red-900/20 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Detection Gaps:</p>
                  <ul className="space-y-0.5">
                    {gaps.map((gap, i) => (
                      <li key={i} className="text-xs text-red-600 dark:text-red-400">• {gap}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="bg-amber-100/50 dark:bg-amber-900/20 rounded-lg p-2.5">
                <p className="text-sm text-amber-700 dark:text-amber-400">{recommendation}</p>
              </div>
            </div>
          )}

          {/* Affected criteria */}
          <div className="flex flex-wrap gap-1">
            {scenario.simulatedImpact.affectedCriteria.map((c) => (
              <span key={c} className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
