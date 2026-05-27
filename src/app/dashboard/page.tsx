"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScoreCard } from "@/components/dashboard/score-card";
import { ViolationCard } from "@/components/scanner/violation-card";
import { ComplianceTrend } from "@/components/charts/compliance-trend";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScanStore } from "@/stores/scanStore";
import { useI18n } from "@/components/i18n-provider";
import { Download, Activity, Target, AlertTriangle, Globe, TrendingUp, TrendingDown, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import type { ScanResult, ComplianceReport } from "@/lib/types";

interface ScanResponse {
  scan: ScanResult;
  compliance: ComplianceReport;
}

interface DashboardStats {
  totalScans: number;
  avgScore: number;
  totalViolations: number;
  sitesMonitored: number;
  trend: number;
  recentScans: Array<{ id: string; url: string; score: number; violations: number; date: string }>;
  topViolations: Array<{ ruleId: string; impact: string; count: number }>;
}

export default function DashboardPage() {
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [credits, setCredits] = useState<{ used: number; limit: number; remaining: number; daysUntilReset: number; unlimited: boolean } | null>(null);
  const { setScanResult: persistResult } = useScanStore();
  const { t } = useI18n();

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    fetch("/api/credits")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setCredits(d.credits))
      .catch(() => {});
  }, []);

  function handleScanComplete(result: unknown) {
    const data = result as ScanResponse;
    setScanResult(data);
    persistResult(data.scan, data.compliance);
    // Refresh stats after successful scan
    fetch("/api/dashboard/stats")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setStats(d))
      .catch(() => {});
  }

  async function handleExportPDF() {
    if (!scanResult) return;

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scanResult),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reglayer-report-${scanResult.scan.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("dashboard.subtitle")}
          </p>
        </div>

        {/* Scan Form */}
        <ScanForm onScanComplete={handleScanComplete} />

        {/* Stats Overview */}
        {statsLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 animate-pulse">
                <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-700 rounded mb-2" />
                <div className="h-7 w-12 bg-neutral-200 dark:bg-neutral-700 rounded" />
              </div>
            ))}
          </div>
        )}
        {!statsLoading && stats && stats.totalScans > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.totalScans")}
              value={stats.totalScans.toString()}
              icon={<Activity className="h-4 w-4 text-blue-500" />}
            />
            <StatCard
              label={t("dashboard.avgScore")}
              value={stats.avgScore.toString()}
              icon={<Target className="h-4 w-4 text-green-500" />}
              trend={stats.trend}
            />
            <StatCard
              label={t("dashboard.violationsFound")}
              value={stats.totalViolations.toString()}
              icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            />
            <StatCard
              label={t("dashboard.sitesMonitored")}
              value={stats.sitesMonitored.toString()}
              icon={<Globe className="h-4 w-4 text-purple-500" />}
            />
          </div>
        )}

        {/* Onboarding: First-time user guide */}
        {!statsLoading && stats && stats.totalScans === 0 && !scanResult && (
          <div className="rounded-xl border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/30 p-6">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">Welcome to RegLayer</h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-4">
              Get started with your first accessibility scan. Here&apos;s what you can do:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-bold text-blue-700 dark:text-blue-300">1</span>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Scan a URL</p>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Enter any URL above to run an accessibility audit powered by axe-core.</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-bold text-blue-700 dark:text-blue-300">2</span>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Review Results</p>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Get a compliance score, violation details, and WCAG criteria mapping.</p>
              </div>
              <div className="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-xs font-bold text-blue-700 dark:text-blue-300">3</span>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Set Up Monitoring</p>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Schedule recurring scans to catch regressions automatically.</p>
              </div>
            </div>
          </div>
        )}

        {/* AI Credits Usage */}
        {credits && !credits.unlimited && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200">{t("dashboard.aiCredits")}</h3>
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("dashboard.resetsIn", { days: credits.daysUntilReset })}
                </span>
              </div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-bold text-neutral-900 dark:text-white">
                  {credits.remaining}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t("dashboard.creditsUsed", { used: credits.used, limit: credits.limit })}
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    credits.remaining <= 5
                      ? "bg-red-500"
                      : credits.remaining <= credits.limit * 0.2
                      ? "bg-amber-500"
                      : "bg-violet-500"
                  }`}
                  style={{ width: `${Math.min(100, (credits.used / credits.limit) * 100)}%` }}
                />
              </div>
              {credits.remaining <= 5 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Zap className="h-3 w-3" />
                  <span>{t("dashboard.creditsLow")}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Recent Activity + Top Issues */}
        {statsLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5 animate-pulse">
                <div className="h-4 w-28 bg-neutral-200 dark:bg-neutral-700 rounded mb-4" />
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="h-3 flex-1 bg-neutral-100 dark:bg-neutral-800 rounded" />
                      <div className="h-5 w-10 bg-neutral-200 dark:bg-neutral-700 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!statsLoading && stats && stats.recentScans.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Scans */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-3">{t("dashboard.recentScans")}</h3>
                <div className="space-y-2">
                  {stats.recentScans.slice(0, 5).map((scan) => (
                    <Link
                      key={scan.id}
                      href={`/report/${scan.id}`}
                      className="flex items-center justify-between rounded-lg p-2 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-800 dark:text-neutral-200 truncate">{scan.url}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">{new Date(scan.date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {scan.violations > 0 && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">{t("dashboard.issues", { count: scan.violations })}</span>
                        )}
                        <span className={`text-sm font-bold ${
                          scan.score >= 90 ? "text-green-600" :
                          scan.score >= 70 ? "text-yellow-600" :
                          "text-red-600"
                        }`}>
                          {scan.score}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Top Violations */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-3">{t("dashboard.topIssues")}</h3>
                <div className="space-y-2">
                  {stats.topViolations.slice(0, 5).map((v) => (
                    <div key={v.ruleId} className="flex items-center justify-between rounded-lg p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={v.impact as "critical" | "serious" | "moderate" | "minor"}>
                          {v.impact}
                        </Badge>
                        <code className="text-xs text-neutral-700 dark:text-neutral-300 truncate">{v.ruleId}</code>
                      </div>
                      <span className="text-xs font-medium text-neutral-500">{v.count}×</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Compliance Trend */}
        <ComplianceTrend />

        {/* Results */}
        {scanResult && (
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <Download className="mr-2 h-4 w-4" />
                {t("dashboard.exportPdf")}
              </Button>
            </div>

            {/* Score Overview */}
            <ScoreCard summary={scanResult.scan.summary} />

            {/* Scan Metadata */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label={t("dashboard.page")}
                value={scanResult.scan.metadata.pageTitle || scanResult.scan.url}
              />
              <MetricCard
                label={t("dashboard.scanDuration")}
                value={`${scanResult.scan.metadata.scanDuration}ms`}
              />
              <MetricCard
                label={t("dashboard.compliance")}
                value={`${scanResult.compliance.overallCompliance}%`}
              />
            </div>

            {/* Screenshot */}
            {scanResult.scan.screenshot && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
                <p className="mb-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {t("dashboard.pageScreenshot")}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${scanResult.scan.screenshot}`}
                  alt="Page screenshot"
                  className="w-full rounded-md border border-neutral-100"
                />
              </div>
            )}

            {/* Violations */}
            {scanResult.scan.violations.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  {t("dashboard.violations", { count: scanResult.scan.violations.length })}
                </h2>
                {scanResult.scan.violations.map((violation) => (
                  <ViolationCard key={violation.id} violation={violation} />
                ))}
              </div>
            )}

            {scanResult.scan.violations.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
                <p className="text-lg font-medium text-green-800">
                  {t("dashboard.noViolationsTitle")}
                </p>
                <p className="mt-1 text-sm text-green-600">
                  {t("dashboard.noViolationsSubtitle")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatCard({ label, value, icon, trend }: { label: string; value: string; icon: React.ReactNode; trend?: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center justify-between mb-2">
        {icon}
        {trend !== undefined && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{label}</p>
    </div>
  );
}
