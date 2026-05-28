"use client";

/**
 * RegLayer — Scan Detail Page
 *
 * WHY: Users need to drill into individual scan results for detailed violation analysis.
 * WHAT: Score hero, violation list (filterable by severity), affected elements, AI explanations, export options.
 * HOW: Fetches /api/scans/:id. Dynamic route [id] param. Renders ViolationCard for each issue.
 */

import { use, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useScanStore } from "@/stores/scanStore";
import { ScoreCard } from "@/components/dashboard/score-card";
import { ViolationCard } from "@/components/scanner/violation-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Download, Clock, Globe, Cpu } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";

export default function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { t } = useI18n();
  const { getScanById } = useScanStore();
  const storeEntry = getScanById(id);
  const [entry, setEntry] = useState(storeEntry || null);
  const [loading, setLoading] = useState(!storeEntry);

  useEffect(() => {
    if (storeEntry || entry) return;
    // Fallback: fetch from API/DB
    fetch(`/api/scans/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        if (data.scan) {
          setEntry({ scan: data.scan, compliance: data.compliance || null });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, storeEntry, entry]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (!entry) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Link href="/scans">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("scanDetail.backToScans")}
            </Button>
          </Link>
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <p className="text-sm text-neutral-500">
              {t("scanDetail.notFound")}
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const { scan, compliance } = entry;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/scans">
              <Button variant="ghost" size="sm" className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("scanDetail.backToScans")}
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
              {scan.metadata.pageTitle || t("scanDetail.results")}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">{scan.url}</p>
          </div>
          <a href={`/api/reports/${scan.id}/pdf`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              {t("scanDetail.exportPdf")}
            </Button>
          </a>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <MetaCard icon={Globe} label={t("scanDetail.url")} value={scan.url} />
          <MetaCard
            icon={Clock}
            label={t("scanDetail.scanned")}
            value={new Date(scan.timestamp).toLocaleString()}
          />
          <MetaCard
            icon={Cpu}
            label={t("scanDetail.duration")}
            value={`${scan.metadata.scanDuration}ms`}
          />
          <MetaCard
            icon={Cpu}
            label={t("scanDetail.compliance")}
            value={`${compliance.overallCompliance}%`}
          />
        </div>

        {/* Score */}
        <ScoreCard summary={scan.summary} />

        {/* Compliance Rules */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {t("scanDetail.ruleResults")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {compliance.ruleResults.map((result) => (
                <div
                  key={result.rule.id}
                  className="flex items-center justify-between rounded-md border border-neutral-100 dark:border-neutral-700 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">
                      {result.rule.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {result.rule.regulation} — {result.rule.wcagCriteria.join(", ")}
                    </p>
                  </div>
                  <Badge variant={result.passed ? "success" : "critical"}>
                    {result.passed ? t("scanDetail.pass") : t("scanDetail.fail")}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Violations */}
        {scan.violations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {t("scanDetail.violations", { count: String(scan.violations.length) })}
            </h2>
            {scan.violations.map((violation) => (
              <ViolationCard key={violation.id} violation={violation} />
            ))}
          </div>
        )}

        {scan.violations.length === 0 && (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-6 text-center">
            <p className="text-lg font-medium text-green-800 dark:text-green-200">
              {t("scanDetail.noViolations")}
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-neutral-400" />
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
