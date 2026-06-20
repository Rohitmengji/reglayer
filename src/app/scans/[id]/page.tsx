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
import { PageLoading } from "@/components/ui/page-loading";
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
  const [visualLoading, setVisualLoading] = useState(false);
  const [visualFindings, setVisualFindings] = useState<
    Array<{ category: string; issue: string; severity: string; confidence: number }> | null
  >(null);
  const [visualMsg, setVisualMsg] = useState<string | null>(null);

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
        <PageLoading message="Loading scan details..." />
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

  // Generate the PDF via POST /api/reports (the one working PDF path, shared with
  // the dashboard) and download the returned blob. The previous `<a href>` pointed
  // at GET /api/reports/:id/pdf, which does not exist (404).
  async function handleExportPdf() {
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan, compliance }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reglayer-report-${scan.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // network failure — no-op (matches the dashboard's export UX)
    }
  }

  // Run the on-demand AI Visual Review: screenshots the page and asks a vision
  // model for visually-apparent issues axe can't see (AI-suggested, plan-gated).
  async function runVisualReview() {
    setVisualLoading(true);
    setVisualMsg(null);
    try {
      const res = await fetch(`/api/scans/${encodeURIComponent(scan.id)}/visual`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setVisualMsg(data.upgradeRequired ? "AI Visual Review is a Pro feature." : data.error || "Visual review failed.");
        return;
      }
      setVisualFindings(data.findings ?? []);
      if (data.findings?.length === 0) setVisualMsg(data.message || "No visually-apparent issues found.");
    } catch {
      setVisualMsg("Network error — please try again.");
    } finally {
      setVisualLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header — stack on mobile so the title/URL don't shove the export button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Link href="/scans">
              <Button variant="ghost" size="sm" className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("scanDetail.backToScans")}
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white wrap-break-word">
              {scan.metadata.pageTitle || t("scanDetail.results")}
            </h1>
            <p className="mt-1 text-sm text-neutral-500 break-all">{scan.url}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="shrink-0 self-start">
            <Download className="mr-2 h-4 w-4" />
            {t("scanDetail.exportPdf")}
          </Button>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          {compliance && (
            <MetaCard
              icon={Cpu}
              label={t("scanDetail.compliance")}
              value={`${compliance.overallCompliance}%`}
            />
          )}
        </div>

        {/* Score */}
        <ScoreCard summary={scan.summary} />

        {/* Deep Scan report — only when a deep scan ran */}
        {scan.metadata.deepScan?.ran && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Deep Scan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-neutral-600 dark:text-neutral-300">
                Beyond the initial page, revealed{" "}
                <strong>{scan.metadata.deepScan.statesRevealed}</strong> interactive state(s) and re-scanned them
                {scan.metadata.deepScan.revealedViolationCount > 0 ? (
                  <>
                    {" "}— surfacing <strong>{scan.metadata.deepScan.revealedViolationCount}</strong> additional issue(s),
                    now included in the violations above.
                  </>
                ) : (
                  <> — no extra issues were hidden in interactive content.</>
                )}
              </p>

              {scan.metadata.deepScan.keyboardFindings.length > 0 && (
                <div>
                  <p className="font-medium text-neutral-900 dark:text-white">
                    Keyboard reachability ({scan.metadata.deepScan.keyboardFindings.length})
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-1.5">
                    Heuristic checks — reported separately, not folded into the automated score.
                  </p>
                  <ul className="space-y-1">
                    {scan.metadata.deepScan.keyboardFindings.slice(0, 20).map((f, i) => (
                      <li
                        key={`${f.selector}-${i}`}
                        className="rounded-md border border-neutral-100 dark:border-neutral-700 px-2.5 py-1.5"
                      >
                        <code className="text-xs text-neutral-500 dark:text-neutral-400 wrap-break-word">{f.selector}</code>
                        <span className="block text-xs text-neutral-700 dark:text-neutral-300">{f.issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {scan.metadata.deepScan.notes.length > 0 && (
                <ul className="list-disc pl-4 text-xs text-neutral-500 dark:text-neutral-400">
                  {scan.metadata.deepScan.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Visual Review — vision model looks at the page for issues axe can't see */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              AI Visual Review
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              A vision model reviews a screenshot of the page for issues automated scanning can&apos;t see —
              text baked into images, color-only meaning, apparent low contrast, missing focus indicators.
              <span className="block text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                AI-suggested — verify manually. Not part of the automated score.
              </span>
            </p>

            {visualFindings === null && (
              <Button variant="outline" size="sm" onClick={runVisualReview} disabled={visualLoading} className="w-full sm:w-auto">
                {visualLoading ? "Reviewing…" : "Run AI visual review"}
              </Button>
            )}

            {visualMsg && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{visualMsg}</p>
            )}

            {visualFindings && visualFindings.length > 0 && (
              <ul className="space-y-1.5">
                {visualFindings.map((f, i) => (
                  <li
                    key={`${f.category}-${i}`}
                    className="rounded-md border border-neutral-100 dark:border-neutral-700 px-2.5 py-1.5"
                  >
                    <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                      {f.severity} · {f.category} · {Math.round(f.confidence * 100)}%
                    </span>
                    <span className="block text-sm text-neutral-700 dark:text-neutral-300 mt-0.5">{f.issue}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Compliance Rules */}
        {compliance && (
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
        )}

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
        <Icon className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-neutral-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
