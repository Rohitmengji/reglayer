"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScoreCard } from "@/components/dashboard/score-card";
import { ViolationCard } from "@/components/scanner/violation-card";
import { ComplianceTrend } from "@/components/charts/compliance-trend";
import { Button } from "@/components/ui/button";
import { useScanStore } from "@/stores/scanStore";
import { Download } from "lucide-react";
import type { ScanResult, ComplianceReport } from "@/lib/types";

interface ScanResponse {
  scan: ScanResult;
  compliance: ComplianceReport;
}

export default function DashboardPage() {
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const { setScanResult: persistResult } = useScanStore();

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
