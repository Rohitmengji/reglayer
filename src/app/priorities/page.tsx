"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  Clock,
  TrendingUp,
  Target,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";

interface PrioritizedFix {
  rank: number;
  ruleId: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string | null;
  affectedElementCount: number;
  estimatedScoreUplift: number;
  fixDifficulty: "trivial" | "easy" | "moderate" | "complex";
  estimatedMinutes: number;
  wcagLevel: string;
  category: string;
  quickWin: boolean;
  recurrenceRate: number;
}

interface PriorityReport {
  scanId: string;
  currentScore: number;
  projectedScoreAfterAll: number;
  totalEstimatedMinutes: number;
  quickWins: PrioritizedFix[];
  highImpact: PrioritizedFix[];
  allFixes: PrioritizedFix[];
}

export default function PrioritiesPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex-1 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
          </div>
        </AppShell>
      }
    >
      <PrioritiesContent />
    </Suspense>
  );
}

function PrioritiesContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan");
  const [report, setReport] = useState<PriorityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function doFetch(id: string) {
      fetch(`/api/scans/${id}/priorities`)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            handleUpgradeResponse(data);
            setError(data.error);
          } else {
            setReport(data);
          }
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Failed to load priorities");
            setLoading(false);
          }
        });
    }

    if (!scanId) {
      fetch("/api/scans?limit=1")
        .then((r) => {
          if (!r.ok) throw new Error("Failed");
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          if (data.scans?.[0]) {
            doFetch(data.scans[0].id);
          } else {
            setError("No scans found");
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("Failed to load scans");
            setLoading(false);
          }
        });
    } else {
      doFetch(scanId);
    }
    return () => { cancelled = true; };
  }, [scanId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (error || !report) {
    return (
      <AppShell>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
          <p className="text-lg font-medium text-neutral-700 dark:text-neutral-200">{error || "No data"}</p>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
            Run a scan first
          </Link>
        </div>
      </AppShell>
    );
  }

  const hours = Math.floor(report.totalEstimatedMinutes / 60);
  const mins = report.totalEstimatedMinutes % 60;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Fix Priorities</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Optimal fix order to maximize your accessibility score improvement.
          </p>
        </div>

        {/* Score Projection */}
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
            <div className="text-center">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Current Score</p>
              <p className="text-4xl font-black text-neutral-700 dark:text-neutral-200">{Math.round(report.currentScore)}</p>
            </div>
            <div className="text-center">
              <ArrowUpRight className="h-8 w-8 text-green-500 mx-auto" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">After All Fixes</p>
              <p className="text-4xl font-black text-green-600">{Math.round(report.projectedScoreAfterAll)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">Estimated Effort</p>
              <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                {hours > 0 ? `${hours}h ` : ""}{mins}m
              </p>
              <p className="text-xs text-neutral-400">{report.allFixes.length} fixes total</p>
            </div>
          </div>
        </div>

        {/* Quick Wins */}
        {report.quickWins.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-yellow-500" />
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Quick Wins</h2>
              <Badge variant="secondary">{report.quickWins.length}</Badge>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              High-impact fixes that take minimal effort. Fix these first.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.quickWins.map((fix) => (
                <FixCard key={fix.ruleId} fix={fix} variant="quickwin" />
              ))}
            </div>
          </div>
        )}

        {/* High Impact */}
        {report.highImpact.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">High Impact</h2>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              These fixes will give you the biggest score improvement.
            </p>
            <div className="space-y-3">
              {report.highImpact.map((fix) => (
                <FixCard key={fix.ruleId} fix={fix} variant="high" />
              ))}
            </div>
          </div>
        )}

        {/* All Fixes (Ranked) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">All Fixes (Ranked)</h2>
          </div>
          <div className="space-y-2">
            {report.allFixes.map((fix) => (
              <FixCard key={fix.ruleId} fix={fix} variant="full" />
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function FixCard({ fix, variant }: { fix: PrioritizedFix; variant: "quickwin" | "high" | "full" }) {
  const difficultyColors: Record<string, string> = {
    trivial: "text-green-600 bg-green-50 dark:bg-green-950",
    easy: "text-blue-600 bg-blue-50 dark:bg-blue-950",
    moderate: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950",
    complex: "text-red-600 bg-red-50 dark:bg-red-950",
  };

  if (variant === "quickwin") {
    return (
      <div className="rounded-xl border border-yellow-100 dark:border-yellow-800 bg-yellow-50/30 dark:bg-yellow-950/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={fix.impact as "critical" | "serious" | "moderate" | "minor"}>
                {fix.impact}
              </Badge>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{fix.category}</span>
            </div>
            <p className="text-sm font-medium text-neutral-900 dark:text-white">{fix.help}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-green-500" />
                +{fix.estimatedScoreUplift.toFixed(1)} pts
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fix.estimatedMinutes}min
              </span>
            </div>
          </div>
          {fix.helpUrl && (
            <a href={fix.helpUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">
              Fix guide →
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-4">
        {/* Rank */}
        <span className="text-lg font-bold text-neutral-300 w-8 text-center">
          #{fix.rank}
        </span>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge variant={fix.impact as "critical" | "serious" | "moderate" | "minor"}>
              {fix.impact}
            </Badge>
            <code className="text-xs text-neutral-500 dark:text-neutral-400">{fix.ruleId}</code>
            <span className="text-xs text-neutral-400">{fix.category}</span>
          </div>
          <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{fix.help}</p>
          <div className="flex items-center gap-4 mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{fix.affectedElementCount} element(s)</span>
            <span>WCAG {fix.wcagLevel}</span>
            {fix.recurrenceRate > 50 && (
              <span className="text-orange-600">⚠ Recurring ({fix.recurrenceRate}%)</span>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-center">
            <p className="text-sm font-bold text-green-600">+{fix.estimatedScoreUplift.toFixed(1)}</p>
            <p className="text-xs text-neutral-400">pts</p>
          </div>
          <div className="text-center">
            <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${difficultyColors[fix.fixDifficulty]}`}>
              {fix.fixDifficulty}
            </span>
            <p className="text-xs text-neutral-400 mt-0.5">{fix.estimatedMinutes}m</p>
          </div>
        </div>
      </div>
    </div>
  );
}
