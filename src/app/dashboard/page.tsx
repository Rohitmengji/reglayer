"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Dashboard Page
 * ---------------------------------------------------------
 *
 * WHY: The main authenticated user hub. First page after login.
 *
 * WHAT:
 * - Scan form to initiate new accessibility scans
 * - Stats cards (total scans, avg score, violations, sites monitored)
 * - AI credits usage display
 * - Compliance trend chart (score over time)
 * - Recent scans list with quick actions
 * - Scan results display when a new scan completes
 *
 * HOW:
 * - "use client" — needs interactivity (forms, state, effects)
 * - Fetches /api/dashboard/stats and /api/credits on mount
 * - ScanForm POSTs to /api/scan, passes result via callback
 * - Stores scan results in Zustand (persists to localStorage)
 * - PDF export via /api/reports endpoint
 * ---------------------------------------------------------
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { AppShell } from "@/components/layout/app-shell";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScoreCard } from "@/components/dashboard/score-card";
import { ViolationCard } from "@/components/scanner/violation-card";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { SinceLastVisit } from "@/components/dashboard/since-last-visit";
import { RoleOnboarding } from "@/components/onboarding/role-onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useScanStore } from "@/stores/scanStore";
import { useI18n } from "@/components/i18n-provider";
import { Download, Activity, Target, AlertTriangle, Globe, TrendingUp, TrendingDown, Sparkles, Zap, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { ScanResult, ComplianceReport } from "@/lib/types";

// Heavy components lazy-loaded to keep initial dashboard bundle lean.
const DashboardAnalytics = dynamic(
  () => import("@/components/dashboard/dashboard-analytics").then((m) => m.DashboardAnalytics),
  { ssr: false, loading: () => null }
);

// Charts pull in recharts (~100KB gz) — load them lazily so the dashboard's
// initial bundle stays lean. Both render null while empty, so a null loading
// state introduces no layout shift.
const ComplianceTrend = dynamic(
  () => import("@/components/charts/compliance-trend").then((m) => m.ComplianceTrend),
  { ssr: false, loading: () => null }
);

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
  const router = useRouter();
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const [statsReloadKey, setStatsReloadKey] = useState(0);
  const [credits, setCredits] = useState<{ used: number; limit: number; totalAvailable: number; remaining: number; daysUntilReset: number; unlimited: boolean } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showRoleOnboarding, setShowRoleOnboarding] = useState(false);
  const { setScanResult: persistResult } = useScanStore();
  const { t } = useI18n();
  const { data: session } = useSession();

  useEffect(() => {
    const controller = new AbortController();

    // Fetch onboarding status from server (authoritative source)
    fetch("/api/onboarding/status", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((onboarding) => {
        if (!onboarding) return;
        // Show role picker ONLY if:
        // - User has no persona set (server-side)
        // - User has fewer than 3 scans (genuinely new, not a veteran on a new browser)
        if (!onboarding.persona && onboarding.totalScans < 3 && !localStorage.getItem("reglayer_persona_skipped")) {
          setShowRoleOnboarding(true);
          // Sync localStorage for fast subsequent loads
          localStorage.removeItem("reglayer_persona");
        } else if (onboarding.persona) {
          // Seed localStorage from server (handles new device scenario)
          localStorage.setItem("reglayer_persona", onboarding.persona);
        }
      })
      .catch(() => {});

    fetch("/api/dashboard/stats", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d) => {
        setStats(d);
        // Show onboarding if user has no scans and hasn't dismissed
        if (d.totalScans === 0 && !localStorage.getItem("reglayer_onboarding_dismissed")) {
          setShowOnboarding(true);
        }
      })
      // Surface a load failure (with retry) instead of silently showing nothing —
      // the scan form above stays usable regardless.
      .catch(() => { if (!controller.signal.aborted) setStatsError(true); })
      .finally(() => {
        if (!controller.signal.aborted) setStatsLoading(false);
      });

    fetch("/api/credits", { signal: controller.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setCredits(d.credits))
      .catch(() => {});

    return () => controller.abort();
  }, [statsReloadKey]);

  function handleScanComplete(result: unknown) {
    const data = result as ScanResponse;
    setScanResult(data);
    persistResult(data.scan, data.compliance);
    // Navigate to scan detail — stats will refresh on next dashboard visit
    if (data.scan?.id) {
      router.push(`/scans/${data.scan.id}`);
    }
  }

  async function handleExportPDF() {
    if (!scanResult) return;

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanResult),
      });

      if (!response.ok) {
        toast.error("Failed to generate PDF report");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reglayer-report-${scanResult.scan.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Network error — unable to export PDF");
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

        {/* What changed since the user was last here (read-only, dismissible) */}
        <SinceLastVisit />

        {/* Onboarding Flow — shown for new users */}
        {showOnboarding && (
          <OnboardingFlow
            userName={session?.user?.name}
            onComplete={() => setShowOnboarding(false)}
            onStartScan={(url) => {
              setShowOnboarding(false);
              // Trigger scan form with the URL — set it in sessionStorage for ScanForm to pick up
              sessionStorage.setItem("reglayer_onboarding_url", url);
              window.dispatchEvent(new Event("onboarding-scan"));
            }}
          />
        )}

        {/* Role-based onboarding — shown once on first visit */}
        {showRoleOnboarding && (
          <RoleOnboarding
            userName={session?.user?.name}
            onComplete={() => setShowRoleOnboarding(false)}
            onSkip={() => {
              localStorage.setItem("reglayer_persona_skipped", "1");
              setShowRoleOnboarding(false);
            }}
          />
        )}

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
        {!statsLoading && statsError && (
          <div className="flex flex-col gap-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("common.loadErrorBody")}
            </div>
            <button
              onClick={() => { setStatsLoading(true); setStatsError(false); setStatsReloadKey((k) => k + 1); }}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-amber-300 dark:border-amber-800 bg-white/60 dark:bg-neutral-900/40 px-3 py-1.5 text-sm font-medium text-amber-800 dark:text-amber-300 hover:bg-white dark:hover:bg-neutral-900 transition-colors sm:self-auto"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t("common.retry")}
            </button>
          </div>
        )}
        {!statsLoading && stats && stats.totalScans > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.totalScans")}
              value={stats.totalScans.toString()}
              icon={<Activity className="h-4 w-4 text-blue-500" />}
              delay={0}
            />
            <StatCard
              label={t("dashboard.avgScore")}
              value={stats.avgScore.toString()}
              icon={<Target className="h-4 w-4 text-green-500" />}
              trend={stats.trend}
              delay={75}
            />
            <StatCard
              label={t("dashboard.violationsFound")}
              value={stats.totalViolations.toString()}
              icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
              delay={150}
            />
            <StatCard
              label={t("dashboard.sitesMonitored")}
              value={stats.sitesMonitored.toString()}
              icon={<Globe className="h-4 w-4 text-purple-500" />}
              delay={225}
            />
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
                  {t("dashboard.creditsUsed", { used: credits.used, limit: credits.totalAvailable })}
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    credits.remaining <= 5
                      ? "bg-red-500"
                      : credits.remaining <= credits.totalAvailable * 0.2
                      ? "bg-amber-500"
                      : "bg-violet-500"
                  }`}
                  style={{ width: `${Math.min(100, (credits.used / credits.totalAvailable) * 100)}%` }}
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
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-3">{t("dashboard.recentScans")}</h3>
              <div className="space-y-2">
                {stats.recentScans.slice(0, 5).map((scan) => (
                  <Link
                    key={scan.id}
                    href={`/report/${scan.id}`}
                    className="flex items-center justify-between rounded-lg p-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900/40 transition-all cursor-pointer"
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
        )}

        {/* Compliance Trend */}
        <ComplianceTrend />

        {/* Analytics Charts */}
        {!statsLoading && stats && stats.totalScans > 0 && (
          <DashboardAnalytics topViolations={stats.topViolations} />
        )}

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
                  <ViolationCard key={violation.id} violation={violation} scanId={scanResult.scan.id} />
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

function StatCard({ label, value, icon, trend, delay = 0 }: { label: string; value: string; icon: React.ReactNode; trend?: number; delay?: number }) {
  const numericValue = parseInt(value, 10);
  const isNumeric = !isNaN(numericValue);
  const animatedValue = useAnimatedNumber(isNumeric ? numericValue : 0, 900);

  return (
    <div
      className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-both"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-2">
        {icon}
        {trend !== undefined && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend > 0 ? "+" : ""}{Math.abs(Math.round(trend * 10) / 10)}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-white">
        {isNumeric ? animatedValue.toLocaleString() : value}
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{label}</p>
    </div>
  );
}

