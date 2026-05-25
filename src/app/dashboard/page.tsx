"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScoreCard } from "@/components/dashboard/score-card";
import { ViolationCard } from "@/components/scanner/violation-card";
import type { ScanResult, ComplianceReport } from "@/lib/types";

interface ScanResponse {
  scan: ScanResult;
  compliance: ComplianceReport;
}

export default function DashboardPage() {
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);

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

        {/* Scan Form */}
        <ScanForm onScanComplete={(result) => setScanResult(result as ScanResponse)} />

        {/* Results */}
        {scanResult && (
          <div className="space-y-6">
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
