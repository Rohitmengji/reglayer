"use client";

/**
 * RegLayer — WCAG Compliance Matrix Component
 *
 * WHY: Compliance officers need a visual grid showing pass/fail per WCAG criterion.
 * WHAT: Table/grid of all WCAG 2.1 AA criteria with pass/fail status from latest scan.
 * HOW: Fetches /api/scans/:id/wcag-matrix, renders colored cells (green=pass, red=fail, gray=N/A).
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModernSelect } from "@/components/ui/modern-select";
import { CheckCircle2, XCircle, Minus, Loader2, Grid3X3, UserCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface MatrixEntry {
  criterion: string;
  level: string;
  principle: string;
  title: string;
  status: "pass" | "fail" | "not-tested";
  violations: string[];
  impact: string | null;
  humanVerdict?: "pass" | "fail" | "na" | null;
}

interface MatrixData {
  scanId: string;
  url: string;
  score: number;
  matrix: MatrixEntry[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    notTested: number;
    humanVerified?: { total: number; pass: number; fail: number; na: number };
  };
}

interface ScanOption {
  id: string;
  url: string;
  status: string;
  score: number | null;
  createdAt: string;
}

export default function CompliancePage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex-1 flex items-center justify-center">
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
  const router = useRouter();
  const scanId = searchParams.get("scan");
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pass" | "fail" | "not-tested">("all");
  const [scans, setScans] = useState<ScanOption[]>([]);
  const [activeScanId, setActiveScanId] = useState<string | null>(scanId);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const { t } = useI18n();

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      try {
        const response = await fetch("/api/scans?limit=50", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Scan list unavailable");
        const payload = await response.json();
        if (!Array.isArray(payload.scans)) throw new Error("Invalid scan list");
        const completed = (payload.scans as ScanOption[]).filter(scan => scan.status === "COMPLETED");
        const selected = scanId || completed[0]?.id;
        if (disposed) return;
        setScans(completed);
        setActiveScanId(selected ?? null);
        if (!selected) return;
        const matrixResponse = await fetch(`/api/scans/${encodeURIComponent(selected)}/wcag-matrix`, { signal: controller.signal, cache: "no-store" });
        if (!matrixResponse.ok) throw new Error("Matrix unavailable");
        const matrix = await matrixResponse.json();
        if (!matrix.summary || !Array.isArray(matrix.matrix)) throw new Error("Invalid matrix");
        if (!disposed) setData(matrix);
      } catch {
        if (!disposed) setError("Could not load the compliance matrix. Check your access or try again.");
      } finally {
        clearTimeout(timeout);
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [scanId, retry]);

  if (loading) {
    return (
      <AppShell>
        <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm text-neutral-600 dark:text-neutral-300">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Loading compliance matrix...
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <Grid3X3 className="h-12 w-12 text-neutral-200 mx-auto mb-4" />
          {error ? <>
            <p role="alert" className="text-neutral-700 dark:text-neutral-200">{error}</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 min-h-11 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700">{t("common.retry")}</button>
          </> : <>
            <p className="font-medium text-neutral-800 dark:text-neutral-100">No completed scans available</p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">Run a scan, then review its automated coverage and remaining manual checks here.</p>
            <Link href="/dashboard" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline dark:text-blue-300">Run a scan</Link>
          </>}
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Grid3X3 className="h-5 w-5 text-indigo-500" />
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("compliance.title")}</h1>
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("compliance.subtitle", { url: data.url })}
            </p>
          </div>

          {/* Scan Selector */}
          {scans.length > 1 && (
            <ModernSelect
              options={scans.map((s) => ({
                value: s.id,
                label: `${new URL(s.url).hostname} — ${new Date(s.createdAt).toLocaleDateString()} (${s.score ?? "?"}%)`,
              }))}
              value={activeScanId || ""}
              onChange={(value) => router.push(`/compliance?tab=matrix&scan=${encodeURIComponent(value)}`)}
              label="Completed scan"
              className="w-full sm:w-auto sm:max-w-65"
            />
          )}
        </div>

        {/* Compliance Progress Gauge */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Automated criteria pass rate</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {data.summary.passed} of {data.summary.passed + data.summary.failed} testable criteria passing
              </p>
            </div>
            <div className={`text-3xl font-bold tabular-nums ${passRate >= 80 ? "text-green-600" : passRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {data.summary.passed + data.summary.failed > 0 ? `${passRate}%` : "Not assessed"}
            </div>
          </div>
          <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${passRate >= 80 ? "bg-green-500" : passRate >= 50 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${passRate}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-neutral-500 dark:text-neutral-400">
            <span>0%</span>
            <span>{data.summary.passed + data.summary.failed > 0 ? "Automated checks only" : "No automated criteria assessed"}</span>
            <span>100%</span>
          </div>
          <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">Passing automated checks is not proof of WCAG conformance. Review not-tested criteria and complete manual testing.</p>
        </div>

        {data.summary.humanVerified && data.summary.humanVerified.total > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2.5 text-[12px] text-neutral-700 dark:text-neutral-200">
            <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <div>
              <p>{t("compliance.humanVerifiedSummary", { count: data.summary.humanVerified.total, total: data.summary.total })}</p>
              <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">{t("compliance.humanVerifiedNote")}</p>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "all" ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold tabular-nums">{data.summary.total}</p>
            <p className="text-xs">Total</p>
          </button>
          <button
            onClick={() => setFilter("pass")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "pass" ? "border-green-600 bg-green-600 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold tabular-nums">{data.summary.passed}</p>
            <p className="text-xs">Passed</p>
          </button>
          <button
            onClick={() => setFilter("fail")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "fail" ? "border-red-600 bg-red-600 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold tabular-nums">{data.summary.failed}</p>
            <p className="text-xs">Failed</p>
          </button>
          <button
            onClick={() => setFilter("not-tested")}
            className={`rounded-xl border p-3 text-center transition-colors ${filter === "not-tested" ? "border-neutral-500 bg-neutral-500 text-white" : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"}`}
          >
            <p className="text-xl font-bold tabular-nums">{data.summary.notTested}</p>
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
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.criterion}
                      className={`flex items-center gap-2 sm:gap-3 rounded-lg border p-2 sm:p-3 ${
                        entry.status === "pass"
                          ? "border-green-100 dark:border-green-800 bg-green-50 dark:bg-green-950"
                          : entry.status === "fail"
                          ? "border-red-100 dark:border-red-800 bg-red-50 dark:bg-red-950"
                          : "border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
                      }`}
                    >
                      {entry.status === "pass" && <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />}
                      {entry.status === "fail" && <XCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />}
                      {entry.status === "not-tested" && <Minus className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold text-neutral-700 dark:text-neutral-200">{entry.criterion}</span>
                          <Badge variant="secondary" className="text-[8px] px-1 py-0">
                            {entry.level}
                          </Badge>
                          {entry.humanVerdict && (() => {
                            // Verdict carried by icon + text + color (not color alone — SC 1.4.1),
                            // and labeled "Tester: …" so a human verdict that differs from the
                            // automated cell reads as an attestation, not a bug.
                            const v = entry.humanVerdict;
                            const VIcon = v === "pass" ? CheckCircle2 : v === "fail" ? XCircle : Minus;
                            const label = v === "pass" ? t("compliance.humanPass") : v === "fail" ? t("compliance.humanFail") : t("compliance.humanNa");
                            return (
                              <Badge
                                variant={v === "pass" ? "success" : v === "fail" ? "critical" : "secondary"}
                                className="text-[8px] px-1 py-0 inline-flex items-center gap-0.5"
                                title={label}
                              >
                                <VIcon className="h-2.5 w-2.5" aria-hidden="true" />
                                {label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{entry.title}</p>
                        {entry.violations.length > 0 && (
                          <p className="text-[9px] text-red-600 mt-0.5 truncate">
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
