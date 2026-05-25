"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Brain,
  Loader2,
  Users,
  Wrench,
  Code2,
  Gauge,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface Insight {
  explanation: string;
  userImpact: string;
  fixStrategy: string;
  codeExample: string;
  effort: string;
  priority: string;
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

export default function InsightsPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
          </div>
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

  useEffect(() => {
    if (!scanId) {
      // Get latest scan
      fetch("/api/scans?limit=1")
        .then((r) => r.json())
        .then((d) => {
          if (d.scans?.[0]) {
            fetchInsights(d.scans[0].id);
          } else {
            setError("No scans found. Run a scan first.");
            setLoading(false);
          }
        });
    } else {
      fetchInsights(scanId);
    }
  }, [scanId]);

  function fetchInsights(id: string) {
    fetch(`/api/scans/${id}/insights`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
        } else {
          setData(d);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to generate insights");
        setLoading(false);
      });
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-500">Generating AI insights...</p>
          <p className="text-xs text-neutral-400">This may take 10-30 seconds</p>
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <Brain className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-neutral-700">{error || "No data"}</p>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
            Run a scan first
          </Link>
        </div>
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
            <h1 className="text-2xl font-bold text-neutral-900">AI Insights</h1>
          </div>
          <p className="text-sm text-neutral-500">
            Deep analysis of {data.insights.length} violations on{" "}
            <span className="font-medium">{data.url}</span>
          </p>
        </div>

        {/* Insights */}
        <div className="space-y-6">
          {data.insights.map((entry) => (
            <Card key={entry.violationId} className="overflow-hidden">
              <CardHeader className="bg-neutral-50 border-b border-neutral-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={entry.impact as "critical" | "serious" | "moderate" | "minor"}>
                      {entry.impact}
                    </Badge>
                    <CardTitle className="text-sm">{entry.ruleId}</CardTitle>
                  </div>
                  {entry.cached && (
                    <span className="text-xs text-neutral-400">cached</span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-5">
                {/* Explanation */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    <p className="text-xs font-semibold text-purple-600 uppercase">What this means</p>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {entry.insight.explanation}
                  </p>
                </div>

                {/* User Impact */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-blue-500" />
                    <p className="text-xs font-semibold text-blue-600 uppercase">Who is affected</p>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed">
                    {entry.insight.userImpact}
                  </p>
                </div>

                {/* Fix Strategy */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="h-4 w-4 text-green-500" />
                    <p className="text-xs font-semibold text-green-600 uppercase">How to fix</p>
                  </div>
                  <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
                    {entry.insight.fixStrategy}
                  </p>
                </div>

                {/* Code Example */}
                {entry.insight.codeExample && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Code2 className="h-4 w-4 text-orange-500" />
                      <p className="text-xs font-semibold text-orange-600 uppercase">Code fix</p>
                    </div>
                    <pre className="rounded-lg bg-neutral-900 p-4 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
                      {entry.insight.codeExample}
                    </pre>
                  </div>
                )}

                {/* Effort & Priority */}
                <div className="flex items-center gap-6 pt-3 border-t border-neutral-100">
                  <div className="flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-neutral-400" />
                    <span className="text-xs text-neutral-500">Effort:</span>
                    <Badge variant="secondary">{entry.insight.effort}</Badge>
                  </div>
                  <p className="text-xs text-neutral-500 italic flex-1">
                    {entry.insight.priority}
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
