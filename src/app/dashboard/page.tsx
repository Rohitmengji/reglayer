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
import { Download, Activity, Target, AlertTriangle, Globe, TrendingUp, TrendingDown } from "lucide-react";
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
  const { setScanResult: persistResult } = useScanStore();

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {});
  }, []);

  function handleScanComplete(result: unknown) {
    const data = result as ScanResponse;
    setScanResult(data);
    persistResult(data.scan, data.compliance);
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
          <h1 className="text-2xl font-bold text-neutral-900">Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Scan websites for accessibility compliance issues.
          </p>
        </div>

        {/* Stats Overview */}
        {stats && stats.totalScans > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Scans"
              value={stats.totalScans.toString()}
              icon={<Activity className="h-4 w-4 text-blue-500" />}
            />
            <StatCard
              label="Avg Score"
              value={stats.avgScore.toString()}
              icon={<Target className="h-4 w-4 text-green-500" />}
              trend={stats.trend}
            />
            <StatCard
              label="Violations Found"
              value={stats.totalViolations.toString()}
              icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            />
            <StatCard
              label="Sites Monitored"
              value={stats.sitesMonitored.toString()}
              icon={<Globe className="h-4 w-4 text-purple-500" />}
            />
          </div>
        )}

        {/* Recent Activity + Top Issues */}
        {stats && stats.recentScans.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Scans */}
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-neutral-700 mb-3">Recent Scans</h3>
                <div className="space-y-2">
                  {stats.recentScans.slice(0, 5).map((scan) => (
                    <Link
                      key={scan.id}
                      href={`/report/${scan.id}`}
                      className="flex items-center justify-between rounded-lg p-2 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-800 truncate">{scan.url}</p>
                        <p className="text-xs text-neutral-400">{new Date(scan.date).toLocaleDateString()}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {scan.violations > 0 && (
                          <span className="text-xs text-neutral-400">{scan.violations} issues</span>
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
                <h3 className="text-sm font-semibold text-neutral-700 mb-3">Top Issues</h3>
                <div className="space-y-2">
                  {stats.topViolations.slice(0, 5).map((v) => (
                    <div key={v.ruleId} className="flex items-center justify-between rounded-lg p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant={v.impact as "critical" | "serious" | "moderate" | "minor"}>
                          {v.impact}
                        </Badge>
                        <code className="text-xs text-neutral-700 truncate">{v.ruleId}</code>
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

        {/* Scan Form */}
        <ScanForm onScanComplete={handleScanComplete} />

        {/* Results */}
        {scanResult && (
          <div className="space-y-6">
            {/* Actions */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={handleExportPDF}>
                <Download className="mr-2 h-4 w-4" />
                Export PDF Report
              </Button>
            </div>

            {/* Score Overview */}
            <ScoreCard summary={scanResult.scan.summary} />

            {/* Scan Metadata */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                label="Page"
                value={scanResult.scan.metadata.pageTitle || scanResult.scan.url}
              />
              <MetricCard
                label="Scan Duration"
                value={`${scanResult.scan.metadata.scanDuration}ms`}
              />
              <MetricCard
                label="Compliance"
                value={`${scanResult.compliance.overallCompliance}%`}
              />
            </div>

            {/* Screenshot */}
            {scanResult.scan.screenshot && (
              <div className="rounded-lg border border-neutral-200 bg-white p-4">
                <p className="mb-2 text-xs font-medium text-neutral-500">
                  Page Screenshot
                </p>
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
                <h2 className="text-lg font-semibold text-neutral-900">
                  Violations ({scanResult.scan.violations.length})
                </h2>
                {scanResult.scan.violations.map((violation) => (
                  <ViolationCard key={violation.id} violation={violation} />
                ))}
              </div>
            )}

            {scanResult.scan.violations.length === 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
                <p className="text-lg font-medium text-green-800">
                  No violations found!
                </p>
                <p className="mt-1 text-sm text-green-600">
                  This page passes all automated accessibility checks.
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
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-900">
        {value}
      </p>
    </div>
  );
}

function StatCard({ label, value, icon, trend }: { label: string; value: string; icon: React.ReactNode; trend?: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        {icon}
        {trend !== undefined && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? "text-green-600" : "text-red-600"}`}>
            {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}
