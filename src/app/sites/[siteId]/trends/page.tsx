"use client";

/**
 * RegLayer — Site Trends Dashboard Page
 *
 * WHY: Users need PROOF that their fixing efforts matter. This page answers:
 *      "Am I getting better?" with undeniable visual evidence.
 *
 * WHAT: Full trend dashboard with:
 *   - Delta cards (score change, violations, critical, streak)
 *   - AIS score over time chart (SVG line)
 *   - Violations over time chart (SVG stacked area)
 *   - Time range selector (7D, 30D, 90D, All)
 *   - Scan history table (paginated)
 *
 * HOW: Uses useSiteTrends() hook for data. Client-side time filtering.
 *      Charts are hand-rolled SVG (ScoreLineChart, ViolationAreaChart).
 */

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeltaCards } from "@/components/trends/DeltaCards";
import { ScoreLineChart } from "@/components/trends/ScoreLineChart";
import { ViolationAreaChart } from "@/components/trends/ViolationAreaChart";
import { useSiteTrends, type TimeRange } from "@/hooks/use-site-trends";
import {
  ExternalLink,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const TIME_RANGES: Array<{ key: TimeRange; label: string }> = [
  { key: "7D", label: "7D" },
  { key: "30D", label: "30D" },
  { key: "90D", label: "90D" },
  { key: "ALL", label: "All Time" },
];

export default function SiteTrendsPage() {
  const params = useParams();
  const siteId = params.siteId as string;

  const {
    loading,
    error,
    scoreTrend,
    violationTrend,
    streak,
    delta,
    summary,
    siteName,
    siteUrl,
    timeRange,
    setTimeRange,
  } = useSiteTrends(siteId);

  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PER_PAGE = 10;

  // Scan history table data (from score trend, reversed for desc)
  const scanHistory = useMemo(() => {
    return [...scoreTrend].reverse();
  }, [scoreTrend]);

  const historyPages = Math.ceil(scanHistory.length / HISTORY_PER_PAGE);
  const paginatedHistory = scanHistory.slice(
    (historyPage - 1) * HISTORY_PER_PAGE,
    historyPage * HISTORY_PER_PAGE
  );

  // ─────────────── Loading/Error ───────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <p className="text-red-500 font-medium">{error}</p>
            <p className="text-sm text-neutral-500 mt-2">Unable to load trends for this site.</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─────────────── Main Layout ───────────────

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {siteName || "Site Trends"}
              </h1>
              {siteUrl && (
                <a
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-neutral-500 hover:text-blue-600 inline-flex items-center gap-1 mt-1"
                >
                  {siteUrl}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {summary && (
                <p className="text-xs text-neutral-400 mt-1">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {summary.totalScans} scans since {new Date(summary.firstScanAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Delta Cards Row */}
        <div className="mb-8">
          <DeltaCards
            delta={delta}
            streak={streak}
            currentViolations={violationTrend.length > 0 ? violationTrend[violationTrend.length - 1].total : undefined}
            currentCritical={violationTrend.length > 0 ? violationTrend[violationTrend.length - 1].critical : undefined}
          />
        </div>

        {/* Time Range Selector */}
        <div className="flex items-center justify-end mb-4">
          <div className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.key}
                onClick={() => setTimeRange(range.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  timeRange === range.key
                    ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
                }`}
                aria-pressed={timeRange === range.key}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* AIS Score Over Time */}
        <Card className="mb-6 border border-neutral-200 dark:border-neutral-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              AIS Score Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreLineChart data={scoreTrend} threshold={700} />
          </CardContent>
        </Card>

        {/* Violations Over Time */}
        <Card className="mb-8 border border-neutral-200 dark:border-neutral-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Violations Over Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ViolationAreaChart data={violationTrend} />
          </CardContent>
        </Card>

        {/* Scan History Table */}
        <Card className="border border-neutral-200 dark:border-neutral-700">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Scan History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {scanHistory.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">No scan history yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" aria-label="Scan history table">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-700">
                        <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Date</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">AIS Score</th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-neutral-500">Change</th>
                        <th className="text-right py-2 px-3 text-xs font-medium text-neutral-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedHistory.map((scan) => {
                        // Calculate delta from previous (next in reversed array)
                        const globalIndex = scanHistory.indexOf(scan);
                        const prevScan = globalIndex < scanHistory.length - 1 ? scanHistory[globalIndex + 1] : null;
                        const change = prevScan ? scan.score - prevScan.score : null;

                        return (
                          <tr
                            key={scan.scanId}
                            className="border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                          >
                            <td className="py-2.5 px-3 text-neutral-700 dark:text-neutral-300">
                              {new Date(scan.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-neutral-900 dark:text-white">
                              {scan.score}
                            </td>
                            <td className="py-2.5 px-3">
                              {change !== null && change !== 0 ? (
                                <span
                                  className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                                    change > 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  {change > 0 ? (
                                    <TrendingUp className="h-3 w-3" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3" />
                                  )}
                                  {change > 0 ? "+" : ""}
                                  {Math.round(change)}
                                </span>
                              ) : (
                                <span className="text-xs text-neutral-400">—</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <a
                                href={`/scans/${scan.scanId}`}
                                className="text-xs text-blue-600 hover:underline"
                              >
                                View Report
                              </a>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
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
                        className="gap-1"
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHistoryPage((p) => Math.min(historyPages, p + 1))}
                        disabled={historyPage >= historyPages}
                        className="gap-1"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
