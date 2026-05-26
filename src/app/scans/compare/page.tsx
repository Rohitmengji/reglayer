"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import Link from "next/link";

interface ComparisonData {
  base: { id: string; url: string; score: number; totalViolations: number; scannedAt: string };
  head: { id: string; url: string; score: number; totalViolations: number; scannedAt: string };
  delta: { score: number; compliance: number; violations: number };
  regressions: Array<{ ruleId: string; impact: string; description: string; help: string }>;
  fixes: Array<{ ruleId: string; impact: string; description: string; help: string }>;
  persistent: Array<{ ruleId: string; impact: string; description: string }>;
  summary: {
    totalFixed: number;
    totalIntroduced: number;
    totalPersistent: number;
    improved: boolean;
    regressed: boolean;
  };
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
          </div>
        </AppShell>
      }
    >
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const baseId = searchParams.get("base");
  const headId = searchParams.get("head");

  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseId || !headId) {
      const t = setTimeout(() => {
        setError("Both base and head scan IDs are required");
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }

    fetch(`/api/scans/compare?base=${baseId}&head=${headId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setComparison(data.comparison);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to fetch comparison");
        setLoading(false);
      });
  }, [baseId, headId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (error || !comparison) {
    return (
      <AppShell>
        <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-8 text-center">
          <XCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-lg font-medium text-red-800">{error || "Comparison failed"}</p>
          <Link href="/scans" className="text-sm text-red-600 hover:underline mt-2 inline-block">
            ← Back to Scans
          </Link>
        </div>
      </AppShell>
    );
  }

  const { base, head, delta, regressions, fixes, persistent, summary } = comparison;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Scan Comparison</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            See what changed between two scans.
          </p>
        </div>

        {/* Score Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          {/* Base */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 text-center">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">BASE (Before)</p>
            <p className="text-4xl font-black text-neutral-700 dark:text-neutral-200">{Math.round(base.score)}</p>
            <p className="text-xs text-neutral-400 mt-2 truncate">{base.url}</p>
            <p className="text-xs text-neutral-300">
              {new Date(base.scannedAt).toLocaleDateString()}
            </p>
          </div>

          {/* Delta */}
          <div className="flex flex-col items-center justify-center gap-2">
            <ArrowRight className="h-6 w-6 text-neutral-300 hidden md:block" />
            <div
              className={`rounded-full px-4 py-2 text-lg font-bold ${
                delta.score > 0
                  ? "bg-green-100 text-green-700"
                  : delta.score < 0
                  ? "bg-red-100 text-red-700"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300"
              }`}
            >
              {delta.score > 0 ? "+" : ""}
              {delta.score.toFixed(1)}
            </div>
            <p className="text-xs text-neutral-400">score change</p>
          </div>

          {/* Head */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 text-center">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">HEAD (After)</p>
            <p className={`text-4xl font-black ${
              delta.score > 0 ? "text-green-600" : delta.score < 0 ? "text-red-600" : "text-neutral-700 dark:text-neutral-200"
            }`}>
              {Math.round(head.score)}
            </p>
            <p className="text-xs text-neutral-400 mt-2 truncate">{head.url}</p>
            <p className="text-xs text-neutral-300">
              {new Date(head.scannedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4 text-center">
            <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700">{summary.totalFixed}</p>
            <p className="text-xs text-green-600">Fixed</p>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 text-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-700">{summary.totalIntroduced}</p>
            <p className="text-xs text-red-600">New Regressions</p>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-4 text-center">
            <p className="text-2xl font-bold text-neutral-700 dark:text-neutral-200 mt-6">{summary.totalPersistent}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Unchanged</p>
          </div>
        </div>

        {/* Regressions (New violations) */}
        {regressions.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              New Regressions ({regressions.length})
            </h2>
            {regressions.map((v) => (
              <div key={v.ruleId} className="rounded-xl border border-red-100 dark:border-red-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={v.impact as "critical" | "serious" | "moderate" | "minor"}>
                    {v.impact}
                  </Badge>
                  <code className="text-xs text-neutral-500 dark:text-neutral-400">{v.ruleId}</code>
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{v.help}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{v.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Fixes */}
        {fixes.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-green-700 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Fixed ({fixes.length})
            </h2>
            {fixes.map((v) => (
              <div key={v.ruleId} className="rounded-xl border border-green-100 dark:border-green-800 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="success">fixed</Badge>
                  <code className="text-xs text-neutral-500 dark:text-neutral-400">{v.ruleId}</code>
                </div>
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{v.help}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{v.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Persistent */}
        {persistent.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-neutral-600 dark:text-neutral-300">
              Unchanged ({persistent.length})
            </h2>
            {persistent.map((v) => (
              <div key={v.ruleId} className="rounded-xl border border-neutral-100 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary">{v.impact}</Badge>
                  <code className="text-xs text-neutral-500 dark:text-neutral-400">{v.ruleId}</code>
                </div>
                <p className="text-sm text-neutral-700 dark:text-neutral-200">{v.description}</p>
              </div>
            ))}
          </div>
        )}

        {/* Back */}
        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-700">
          <Link href="/scans" className="text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:text-white">
            ← Back to Scan History
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
