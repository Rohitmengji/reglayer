/**
 * RegLayer — Executive Dashboard
 *
 * WHY: Portfolio managers, VPs, and compliance officers need a single view
 *      of accessibility health across ALL monitored properties.
 * WHAT: Aggregated KPIs, site rankings, compliance distribution, trend charts,
 *       and violation breakdown — all without touching individual scan details.
 * HOW: Fetches /api/executive, renders cards + tables + visual indicators.
 */

"use client";

import { useState, useEffect } from "react";
import { useI18n } from "@/components/i18n-provider";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Shield,
  AlertTriangle,
  Globe,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

interface PortfolioMetrics {
  totalSites: number;
  totalScans: number;
  avgScore: number;
  totalViolations: number;
  complianceBuckets: {
    critical: number;
    needsWork: number;
    passing: number;
    excellent: number;
  };
}

interface SiteRanking {
  hostname: string;
  latestScore: number;
  avgScore: number;
  trend: number;
  scanCount: number;
  totalViolations: number;
  lastScanned: string;
  url: string;
}

interface WeeklyPoint {
  week: string;
  avgScore: number;
  scanCount: number;
}

interface TopViolation {
  ruleId: string;
  impact: string;
  count: number;
}

interface ExecutiveData {
  portfolio: PortfolioMetrics;
  siteRankings: SiteRanking[];
  weeklyTrend: WeeklyPoint[];
  topViolations: TopViolation[];
  impactDistribution: Record<string, number>;
}

export default function ExecutiveDashboardPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    fetch("/api/executive")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [session]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900 dark:border-white" />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
          <p className="text-red-700 dark:text-red-300">{error || "No data available"}</p>
        </div>
      </AppShell>
    );
  }

  const { portfolio, siteRankings, weeklyTrend, topViolations, impactDistribution } = data;
  const totalImpact = Object.values(impactDistribution).reduce((a, b) => a + b, 0) || 1;

  function getScoreColor(score: number) {
    if (score >= 90) return "text-green-600 dark:text-green-400";
    if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
    if (score >= 50) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  }

  function getScoreBg(score: number) {
    if (score >= 90) return "bg-green-500";
    if (score >= 70) return "bg-yellow-500";
    if (score >= 50) return "bg-orange-500";
    return "bg-red-500";
  }

  function getImpactColor(impact: string) {
    switch (impact) {
      case "critical": return "bg-red-500";
      case "serious": return "bg-orange-500";
      case "moderate": return "bg-yellow-500";
      case "minor": return "bg-blue-400";
      default: return "bg-neutral-400";
    }
  }

  function getImpactBadge(impact: string) {
    switch (impact) {
      case "critical": return "destructive" as const;
      case "serious": return "default" as const;
      default: return "secondary" as const;
    }
  }

  const handleExport = () => {
    window.open("/api/export/violations?format=csv", "_blank");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header — stack on mobile so the title doesn't crowd the export button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("nav.executive")}</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Portfolio-level accessibility compliance overview
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} className="shrink-0 self-start sm:self-auto">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export All
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Portfolio Score</p>
                  <p className={`text-3xl font-bold mt-1 ${getScoreColor(portfolio.avgScore)}`}>
                    {portfolio.avgScore}
                  </p>
                  {/* Clarify scope: this is the all-time average, distinct from the 12-week trend chart below. */}
                  <p className="text-[11px] text-neutral-400 mt-0.5">All-time average across all scans</p>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${portfolio.avgScore >= 70 ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                  <Shield className={`h-6 w-6 ${portfolio.avgScore >= 70 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Sites Monitored</p>
                  <p className="text-3xl font-bold mt-1 text-neutral-900 dark:text-white">{portfolio.totalSites}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                  <Globe className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Violations</p>
                  <p className="text-3xl font-bold mt-1 text-neutral-900 dark:text-white">{portfolio.totalViolations}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-900/30">
                  <AlertTriangle className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Total Scans</p>
                  <p className="text-3xl font-bold mt-1 text-neutral-900 dark:text-white">{portfolio.totalScans}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                  <BarChart3 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Compliance Distribution + Impact Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compliance Buckets */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Compliance Distribution</CardTitle>
              <CardDescription>Sites grouped by their compliance score</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Critical (&lt;50)</span>
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">{portfolio.complianceBuckets.critical}</span>
                    </div>
                    <div className="mt-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-red-500 rounded-full" style={{ width: `${portfolio.totalSites ? (portfolio.complianceBuckets.critical / portfolio.totalSites) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Needs Work (50-69)</span>
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">{portfolio.complianceBuckets.needsWork}</span>
                    </div>
                    <div className="mt-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500 rounded-full" style={{ width: `${portfolio.totalSites ? (portfolio.complianceBuckets.needsWork / portfolio.totalSites) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Passing (70-89)</span>
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">{portfolio.complianceBuckets.passing}</span>
                    </div>
                    <div className="mt-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${portfolio.totalSites ? (portfolio.complianceBuckets.passing / portfolio.totalSites) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">Excellent (90+)</span>
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">{portfolio.complianceBuckets.excellent}</span>
                    </div>
                    <div className="mt-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${portfolio.totalSites ? (portfolio.complianceBuckets.excellent / portfolio.totalSites) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Impact Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Violation Severity</CardTitle>
              <CardDescription>Distribution of violations by impact level</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {(["critical", "serious", "moderate", "minor"] as const).map((impact) => {
                  const count = impactDistribution[impact] || 0;
                  const pct = Math.round((count / totalImpact) * 100);
                  return (
                    <div key={impact} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getImpactColor(impact)}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm capitalize text-neutral-700 dark:text-neutral-300">{impact}</span>
                          <span className="text-sm font-medium text-neutral-900 dark:text-white">{count} ({pct}%)</span>
                        </div>
                        <div className="mt-1 h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${getImpactColor(impact)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Score Trend (12 Weeks)</CardTitle>
            <CardDescription>Average accessibility score over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {weeklyTrend.map((point, i) => {
                const height = point.avgScore ? `${point.avgScore}%` : "2%";
                const isActive = point.scanCount > 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full relative group">
                      <div
                        className={`w-full rounded-t transition-all ${isActive ? getScoreBg(point.avgScore) : "bg-neutral-200 dark:bg-neutral-700"}`}
                        style={{ height }}
                        title={`${point.week}: ${point.avgScore} avg (${point.scanCount} scans)`}
                      />
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                        <div className="bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs rounded px-2 py-1 whitespace-nowrap">
                          {point.avgScore} • {point.scanCount} scans
                        </div>
                      </div>
                    </div>
                    {i % 3 === 0 && (
                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate w-full text-center">
                        {new Date(point.week).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Site Rankings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Site Rankings</CardTitle>
                <CardDescription>
                  {/* API returns the lowest-scoring 20; show the true total honestly. */}
                  {portfolio.totalSites > siteRankings.length
                    ? `Showing the ${siteRankings.length} lowest-scoring of ${portfolio.totalSites} monitored sites`
                    : "All monitored sites ranked by compliance score"}
                </CardDescription>
              </div>
              <Badge variant="secondary">{portfolio.totalSites} sites</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {siteRankings.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">No scans yet. Run your first scan to see data here.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="text-left py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Site</th>
                      <th className="text-center py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Score</th>
                      <th className="text-center py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Trend</th>
                      <th className="text-center py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Violations</th>
                      <th className="text-center py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Scans</th>
                      <th className="text-right py-2 px-2 font-medium text-neutral-600 dark:text-neutral-400">Last Scanned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteRankings.map((site) => (
                      <tr key={site.hostname} className="border-b border-neutral-100 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getScoreBg(site.latestScore)}`} />
                            <span className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-50">
                              {site.hostname}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`font-bold ${getScoreColor(site.latestScore)}`}>
                            {site.latestScore}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                            site.trend > 0
                              ? "text-green-600 dark:text-green-400"
                              : site.trend < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-neutral-500 dark:text-neutral-400"
                          }`}>
                            {site.trend > 0 ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : site.trend < 0 ? (
                              <ArrowDownRight className="h-3 w-3" />
                            ) : (
                              <Minus className="h-3 w-3" />
                            )}
                            {site.trend > 0 ? "+" : ""}{site.trend}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center text-neutral-600 dark:text-neutral-400">
                          {site.totalViolations}
                        </td>
                        <td className="py-2.5 px-2 text-center text-neutral-500">{site.scanCount}</td>
                        <td className="py-2.5 px-2 text-right text-neutral-500 text-xs">
                          {new Date(site.lastScanned).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Violations */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top Violations Across Portfolio</CardTitle>
            <CardDescription>Most frequently occurring accessibility issues</CardDescription>
          </CardHeader>
          <CardContent>
            {topViolations.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">No violations recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {topViolations.map((v, i) => {
                  const maxCount = topViolations[0].count;
                  const pct = Math.round((v.count / maxCount) * 100);
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <Badge variant={getImpactBadge(v.impact)} className="w-20 justify-center text-xs">
                        {v.impact}
                      </Badge>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <code className="text-xs font-mono text-neutral-700 dark:text-neutral-300">{v.ruleId}</code>
                          <span className="text-xs text-neutral-500">{v.count}×</span>
                        </div>
                        <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${getImpactColor(v.impact)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
