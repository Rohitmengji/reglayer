"use client";

/**
 * RegLayer — Trends Dashboard Page
 *
 * WHY: Users need to SEE that their fixing efforts matter. This page answers:
 *      "Am I getting better?" with visual evidence of score progression.
 *
 * WHAT: Trend dashboard with:
 *   - Delta cards (score change, violations, critical, streak)
 *   - AIS score over time chart
 *   - Violations over time chart
 *   - Time range selector (7D, 30D, 90D, All)
 *   - Scan history table
 *
 * HOW: Fetches /api/trends?url=<url> then applies client-side time range filtering.
 *      Uses existing chart components (ScoreLineChart, ViolationAreaChart).
 */

import { useState, useEffect, useMemo } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeltaCards } from "@/components/trends/DeltaCards";
import { ScoreLineChart } from "@/components/trends/ScoreLineChart";
import { ViolationAreaChart } from "@/components/trends/ViolationAreaChart";
import {
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Calendar,
  BarChart3,
} from "lucide-react";
import type {
  ScoreTrendPoint,
  ViolationTrendPoint,
  StreakData,
  ScoreDelta,
  TrendSummary,
} from "@/lib/analytics/trends";

type TimeRange = "7D" | "30D" | "90D" | "ALL";

const TIME_RANGES: Array<{ key: TimeRange; label: string }> = [
  { key: "7D", label: "7D" },
  { key: "30D", label: "30D" },
  { key: "90D", label: "90D" },
  { key: "ALL", label: "All Time" },
];

interface TrendsApiResponse {
  url: string;
  scoreTrend: ScoreTrendPoint[];
  violationTrend: ViolationTrendPoint[];
  streak: StreakData;
  delta: ScoreDelta | null;
  summary: TrendSummary | null;
}

export default function TrendsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const url = searchParams.get("url") ?? "";

  const [data, setData] = useState<TrendsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("ALL");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  // Fetch URL for latest scan if not provided
  const [autoResolvedUrl, setAutoResolvedUrl] = useState("");
  const resolvedUrl = url || autoResolvedUrl;

  useEffect(() => {
    if (url) return;
    // Auto-resolve from latest scan
    fetch("/api/scans?limit=1")
      .then((resp) => {
        if (!resp.ok) throw new Error("No scans found. Run a scan first to see trends.");
        return resp.json();
      })
      .then((json) => {
        if (json?.scans?.[0]?.url) {
          setAutoResolvedUrl(json.scans[0].url);
        } else {
          setError("No scans found. Run a scan first to see trends.");
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load scan data.");
        setLoading(false);
      });
  }, [url]);

  // Fetch trend data
  useEffect(() => {
    if (!resolvedUrl) return;
    const params = new URLSearchParams({ url: resolvedUrl });
    fetch(`/api/trends?${params}`)
      .then((resp) => {
        if (!resp.ok) return resp.json().catch(() => ({ message: "Failed to load trends" })).then((e) => { throw new Error(e.message ?? `Error ${resp.status}`); });
        return resp.json();
      })
      .then((result: TrendsApiResponse) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trends"))
      .finally(() => setLoading(false));
  }, [resolvedUrl]);

  // Compute cutoff date for time filtering
  const [now] = useState(() => Date.now());

  // Time-filtered data
  const filteredScoreTrend = useMemo(() => {
    if (!data) return [];
    if (timeRange === "ALL") return data.scoreTrend;
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    return data.scoreTrend.filter((p) => p.date >= cutoff);
  }, [data, timeRange, now]);

  const filteredViolationTrend = useMemo(() => {
    if (!data) return [];
    if (timeRange === "ALL") return data.violationTrend;
    const days = timeRange === "7D" ? 7 : timeRange === "30D" ? 30 : 90;
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    return data.violationTrend.filter((p) => p.date >= cutoff);
  }, [data, timeRange, now]);

  // Scan history table
  const scanHistory = useMemo(() => {
    if (!data) return [];
    return [...data.scoreTrend].reverse();
  }, [data]);

  const historyPages = Math.ceil(scanHistory.length / HISTORY_PER_PAGE);
  const paginatedHistory = scanHistory.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE
  );

  // ─────────────── Render ───────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-neutral-600 dark:text-neutral-300 font-medium">
              {error || "No trend data available"}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
              Run multiple scans of the same URL to see trends over time.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6 overflow-x-hidden">
        {/* Page Header */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {t("trends.title")}
              </h1>
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-blue-600 inline-flex items-center gap-1 mt-1 max-w-full"
                >
                  <span className="truncate">{resolvedUrl}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              )}
              {data.summary && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {data.summary.totalScans} scan{data.summary.totalScans !== 1 ? "s" : ""} since{" "}
                  {new Date(data.summary.firstScanAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1 shrink-0">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.key}
                  onClick={() => setTimeRange(tr.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    timeRange === tr.key
                      ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                      : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Delta Cards */}
        <DeltaCards
          delta={data.delta}
          streak={data.streak}
          // Pass the CURRENT counts (latest point) — without these the Violations
          // card showed the delta (not the count) and Critical Issues showed 0.
          currentViolations={data.violationTrend.at(-1)?.total ?? 0}
          currentCritical={data.violationTrend.at(-1)?.critical ?? 0}
        />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score Over Time */}
          <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Score Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredScoreTrend.length > 1 ? (
                <ScoreLineChart data={filteredScoreTrend} />
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-neutral-500 dark:text-neutral-400">
                  Need 2+ scans to show trend chart
                </div>
              )}
            </CardContent>
          </Card>

          {/* Violations Over Time */}
          <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Violations Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredViolationTrend.length > 1 ? (
                <ViolationAreaChart data={filteredViolationTrend} />
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-neutral-500 dark:text-neutral-400">
                  Need 2+ scans to show violation trends
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scan History Table */}
        {scanHistory.length > 0 && (
          <Card className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                Scan History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-neutral-800">
                      <th className="text-left py-2 pr-4 font-medium text-neutral-500">Date</th>
                      <th className="text-right py-2 px-4 font-medium text-neutral-500">Score</th>
                      <th className="text-right py-2 px-4 font-medium text-neutral-500">Change</th>
                      <th className="text-right py-2 pl-4 font-medium text-neutral-500">Scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistory.map((point, idx) => {
                      const globalIdx = scanHistory.indexOf(point);
                      const prevPoint = globalIdx < scanHistory.length - 1 ? scanHistory[globalIdx + 1] : null;
                      const change = prevPoint ? point.score - prevPoint.score : 0;
                      return (
                        <tr
                          key={point.scanId}
                          className="border-b border-neutral-50 dark:border-neutral-800/50 last:border-0"
                        >
                          <td className="py-2 pr-4 text-neutral-700 dark:text-neutral-300">
                            {new Date(point.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-2 px-4 text-right font-medium text-neutral-900 dark:text-white">
                            {point.score.toFixed(1)}
                          </td>
                          <td className="py-2 px-4 text-right">
                            {idx === paginatedHistory.length - 1 && historyPage === historyPages ? (
                              <span className="text-neutral-500 dark:text-neutral-400">—</span>
                            ) : change > 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-green-600">
                                <TrendingUp className="h-3 w-3" />+{change.toFixed(1)}
                              </span>
                            ) : change < 0 ? (
                              <span className="inline-flex items-center gap-0.5 text-red-600">
                                <TrendingDown className="h-3 w-3" />{change.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-neutral-500 dark:text-neutral-400">0</span>
                            )}
                          </td>
                          <td className="py-2 pl-4 text-right">
                            <a
                              href={`/report/${point.scanId}`}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              {historyPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                  <p className="text-xs text-neutral-500">
                    Page {historyPage} of {historyPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoryPage((p) => Math.min(historyPages, p + 1))}
                      disabled={historyPage >= historyPages}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
