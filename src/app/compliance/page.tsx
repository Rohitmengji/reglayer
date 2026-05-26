"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Minus, Loader2, Grid3X3 } from "lucide-react";

interface MatrixEntry {
  criterion: string;
  level: string;
  principle: string;
  title: string;
  status: "pass" | "fail" | "not-tested";
  violations: string[];
  impact: string | null;
}

interface MatrixData {
  scanId: string;
  url: string;
  score: number;
  matrix: MatrixEntry[];
  summary: { total: number; passed: number; failed: number; notTested: number };
}

export default function CompliancePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
          </div>
        </AppShell>
      }
    >
      <ComplianceContent />
    </Suspense>
  );
}

function ComplianceContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan");
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "not-tested">("all");

  useEffect(() => {
    let cancelled = false;
    function doFetch(id: string) {
      fetch(`/api/scans/${id}/wcag-matrix`)
        .then((r) => {
          if (!r.ok) throw new Error("Failed");
          return r.json();
        })
        .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
    }

    if (!scanId) {
      fetch("/api/scans?limit=1")
        .then((r) => {
          if (!r.ok) throw new Error("Failed");
          return r.json();
        })
        .then((d) => {
          if (cancelled) return;
          if (d.scans?.[0]) doFetch(d.scans[0].id);
          else setLoading(false);
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    } else {
      doFetch(scanId);
    }
    return () => { cancelled = true; };
  }, [scanId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-300" />
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <Grid3X3 className="h-12 w-12 text-neutral-200 mx-auto mb-4" />
          <p className="text-neutral-600 dark:text-neutral-300">No scan data available. Run a scan first.</p>
        </div>
      </AppShell>
    );
  }

  const principles = ["Perceivable", "Operable", "Understandable", "Robust"];
  const filtered = data.matrix.filter((e) => filter === "all" || e.status === filter);
  const grouped = principles.map((p) => ({
    principle: p,
    entries: filtered.filter((e) => e.principle === p),
  }));

  const passRate = data.summary.total > 0
    ? Math.round((data.summary.passed / (data.summary.passed + data.summary.failed)) * 100) || 0
    : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Grid3X3 className="h-5 w-5 text-indigo-500" />
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">WCAG Compliance Matrix</h1>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            WCAG 2.1 AA criterion status for{" "}
            <span className="font-medium">{data.url}</span>
          </p>
        </div>

        {/* Compliance Progress Gauge */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Overall Compliance</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {data.summary.passed} of {data.summary.passed + data.summary.failed} testable criteria passing
              </p>
            </div>
            <div className={`text-3xl font-bold ${passRate >= 80 ? "text-green-600" : passRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {passRate}%
            </div>
          </div>
          <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${passRate >= 80 ? "bg-green-500" : passRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${passRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-neutral-400">
            <span>0%</span>
            <span>WCAG 2.1 Level AA Target: 100%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "all" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold">{data.summary.total}</p>
            <p className="text-xs">Total</p>
          </button>
          <button
            onClick={() => setFilter("pass")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "pass" ? "border-green-600 bg-green-600 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold">{data.summary.passed}</p>
            <p className="text-xs">Passed</p>
          </button>
          <button
            onClick={() => setFilter("fail")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "fail" ? "border-red-600 bg-red-600 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold">{data.summary.failed}</p>
            <p className="text-xs">Failed</p>
          </button>
          <button
            onClick={() => setFilter("not-tested")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "not-tested" ? "border-neutral-500 bg-neutral-500 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold">{data.summary.notTested}</p>
            <p className="text-xs">Not Tested</p>
          </button>
        </div>

        {/* Matrix by Principle */}
        {grouped.map((group) => (
          group.entries.length > 0 && (
            <Card key={group.principle}>
              <CardHeader>
                <CardTitle className="text-sm">{group.principle}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.criterion}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        entry.status === "pass"
                          ? "border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950"
                          : entry.status === "fail"
                          ? "border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950"
                          : "border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                      }`}
                    >
                      {entry.status === "pass" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                      {entry.status === "fail" && <XCircle className="h-4 w-4 text-red-600 shrink-0" />}
                      {entry.status === "not-tested" && <Minus className="h-4 w-4 text-neutral-400 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-neutral-700 dark:text-neutral-200">{entry.criterion}</span>
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">
                            {entry.level}
                          </Badge>
                        </div>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{entry.title}</p>
                        {entry.violations.length > 0 && (
                          <p className="text-[10px] text-red-600 mt-0.5 truncate">
                            {entry.violations.join(", ")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>
    </AppShell>
  );
}
