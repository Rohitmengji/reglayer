"use client";

import { FeatureGate } from "@/components/ui/feature-gate";
/**
 * RegLayer — AI Insights Page
 *
 * WHY: Raw violation data isn't actionable enough. AI explains WHY issues matter.
 * WHAT: AI-generated explanations, fix suggestions, and pattern analysis for scan results.
 * HOW: Fetches /api/scans/:id/insights. Calls AI explainer for each violation. Shows impact on real users.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoading } from "@/components/ui/page-loading";
import { PageError } from "@/components/ui/page-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  Users,
  Wrench,
  Code2,
  Gauge,
  Sparkles,
} from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";

interface Insight {
  explanation: string | object;
  userImpact: string | object;
  fixStrategy: string | object;
  codeExample: string | object;
  effort: string | object;
  priority: string | object;
  /** false when AI was unavailable and this is the rule-based fallback. */
  aiGenerated?: boolean;
}

function str(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.join("\n");
  return JSON.stringify(val, null, 2);
}

function codeStr(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if ("before" in obj && "after" in obj) {
      return `// Before:\n${obj.before}\n\n// After:\n${obj.after}`;
    }
  }
  return JSON.stringify(val, null, 2);
}

interface InsightEntry {
  violationId: string;
  ruleId: string;
  impact: string;
  insight: Insight;
  cached: boolean;
}

interface InsightsData {
  scanId: string;
  url: string;
  score: number;
  insights: InsightEntry[];
}

function InsightsPageInner() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <PageLoading message="Generating insights..." />
        </AppShell>
      }
    >
      <InsightsContent />
    </Suspense>
  );
}

function InsightsContent() {
  const searchParams = useSearchParams();
  const scanId = searchParams.get("scan");
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    let cancelled = false;
    function doFetch(id: string) {
      fetch(`/api/scans/${id}/insights`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d.error) {
            handleUpgradeResponse(d);
            setError(d.error);
          } else {
            setData(d);
          }
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setError("Failed to generate insights");
            setLoading(false);
          }
        });
    }

    if (!scanId) {
      fetch("/api/scans?limit=1")
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (d.scans?.[0]) {
            doFetch(d.scans[0].id);
          } else {
            setError("No scans found. Run a scan first.");
            setLoading(false);
          }
        });
    } else {
      doFetch(scanId);
    }
    return () => { cancelled = true; };
  }, [scanId]);

  if (loading) {
    return (
      <AppShell>
        <PageLoading message="Generating insights..." />
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageError
          title="Couldn\u2019t load insights"
          message="We need scan data to generate insights. Run a scan first, then come back here."
          fallbackHref="/dashboard"
          fallbackLabel="Run a Scan"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-purple-500" />
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("insights.title")}</h1>
          </div>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Deep analysis of {data.insights.length} violations on{" "}
            <span className="font-medium">{data.url}</span>
          </p>
        </div>

        {/* Insights */}
        <div className="space-y-6">
          {data.insights.map((entry) => (
            <Card key={entry.violationId} className="overflow-hidden">
              <CardHeader className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.impact as "critical" | "serious" | "moderate" | "minor"}>
                      {entry.impact}
                    </Badge>
                    <CardTitle className="text-sm">{entry.ruleId}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Honest labeling: don't pass off the rule-based fallback as AI. */}
                    {entry.insight.aiGenerated === false && (
                      <span className="text-xs rounded-full bg-neutral-100 dark:bg-neutral-700 px-2 py-0.5 text-neutral-500 dark:text-neutral-400">
                        Rule-based (AI unavailable)
                      </span>
                    )}
                    {entry.cached && (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">cached</span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {/* Explanation */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    <p className="text-xs font-semibold text-purple-600 uppercase">{t("insights.explanation")}</p>
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
                    {str(entry.insight.explanation)}
                  </p>
                </div>

                {/* User Impact */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <p className="text-xs font-semibold text-blue-600 uppercase">{t("insights.userImpact")}</p>
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed">
                    {str(entry.insight.userImpact)}
                  </p>
                </div>

                {/* Fix Strategy */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-green-500" />
                    <p className="text-xs font-semibold text-green-600 uppercase">{t("insights.fixStrategy")}</p>
                  </div>
                  <p className="text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed whitespace-pre-line">
                    {str(entry.insight.fixStrategy)}
                  </p>
                </div>

                {/* Code Example */}
                {entry.insight.codeExample && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 className="h-4 w-4 text-orange-500" />
                      <p className="text-xs font-semibold text-orange-600 uppercase">{t("insights.codeExample")}</p>
                    </div>
                    <pre className="rounded-lg bg-neutral-900 p-4 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
                      {codeStr(entry.insight.codeExample)}
                    </pre>
                  </div>
                )}

                {/* Effort & Priority */}
                <div className="flex items-center gap-6 pt-3 border-t border-neutral-100 dark:border-neutral-700">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{t("insights.effort")}</span>
                    <Badge variant="secondary">{str(entry.insight.effort)}</Badge>
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 italic flex-1">
                    {str(entry.insight.priority)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default function InsightsPage() {
  return <FeatureGate feature="analysis"><InsightsPageInner /></FeatureGate>;
}
