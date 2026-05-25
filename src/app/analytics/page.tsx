"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Clock,
  AlertTriangle,
  BarChart3,
  Activity,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AnalyticsData {
  period: { start: string; end: string; days: number };
  overview: {
    totalScans: number;
    uniqueUrls: number;
    averageScore: number;
    medianScore: number;
    bestScore: number;
    worstScore: number;
    totalViolationsFound: number;
    averageViolationsPerScan: number;
  };
  trend: {
    direction: "improving" | "declining" | "stable";
    changePerWeek: number;
    dataPoints: Array<{ date: string; score: number; scans: number }>;
  };
  forecast: {
    nextWeekScore: number;
    nextMonthScore: number;
    weeksTo90: number | null;
    confidence: number;
  };
  topViolations: Array<{
    ruleId: string;
    count: number;
    impact: string;
    avgAffectedElements: number;
    trend: "increasing" | "decreasing" | "stable";
  }>;
  velocityMetrics: {
    scansPerDay: number;
    newViolationsPerWeek: number;
    netChangePerWeek: number;
  };
  urlBreakdown: Array<{
    url: string;
    scans: number;
    latestScore: number;
    trend: "improving" | "declining" | "stable";
  }>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/analytics?days=${period}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 dark:border-neutral-600 border-t-neutral-900 dark:border-t-white" />
        </div>
      </AppShell>
    );
  }

  if (!data || data.overview.totalScans === 0) {
    return (
      <AppShell>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Analytics</h1>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-12 text-center">
            <BarChart3 className="h-12 w-12 text-neutral-300 mx-auto mb-4" />
            <p className="text-lg font-medium text-neutral-700 dark:text-neutral-200">No data yet</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Run some scans to see analytics and trends.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Analytics</h1>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Accessibility intelligence and trend analysis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setPeriod(d)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  period === d
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Overview Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Average Score"
            value={data.overview.averageScore.toString()}
            icon={<Target className="h-4 w-4 text-blue-500" />}
            subtitle={`Best: ${data.overview.bestScore}`}
          />
          <MetricCard
            label="Trend"
            value={`${data.trend.changePerWeek > 0 ? "+" : ""}${data.trend.changePerWeek}/wk`}
            icon={
              data.trend.direction === "improving" ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : data.trend.direction === "declining" ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-neutral-400" />
              )
            }
            subtitle={data.trend.direction}
          />
          <MetricCard
            label="Total Scans"
            value={data.overview.totalScans.toString()}
            icon={<Activity className="h-4 w-4 text-purple-500" />}
            subtitle={`${data.overview.uniqueUrls} unique URLs`}
          />
          <MetricCard
            label="Violations Found"
            value={data.overview.totalViolationsFound.toString()}
            icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
            subtitle={`${data.overview.averageViolationsPerScan} avg/scan`}
          />
        </div>

        {/* Trend Chart */}
        {data.trend.dataPoints.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Score Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TrendChart dataPoints={data.trend.dataPoints} />
            </CardContent>
          </Card>
        )}

        {/* Forecast */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-blue-100 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-blue-600" />
                <p className="text-xs font-medium text-blue-600">FORECAST</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Next Week</p>
                  <p className="text-2xl font-bold text-neutral-900 dark:text-white">{data.forecast.nextWeekScore}</p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Next Month</p>
                  <p className="text-2xl font-bold text-neutral-900 dark:text-white">{data.forecast.nextMonthScore}</p>
                </div>
                {data.forecast.weeksTo90 && (
                  <div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">Weeks to Score 90</p>
                    <p className="text-2xl font-bold text-green-700">{data.forecast.weeksTo90}</p>
                  </div>
                )}
                <p className="text-xs text-neutral-400">
                  Confidence: {Math.round(data.forecast.confidence * 100)}%
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Velocity */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-purple-600" />
                <p className="text-xs font-medium text-purple-600">VELOCITY</p>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Scans / Day</p>
                  <p className="text-2xl font-bold text-neutral-900 dark:text-white">
                    {data.velocityMetrics.scansPerDay}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">New Violations / Week</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {data.velocityMetrics.newViolationsPerWeek}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Score Distribution */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">DISTRIBUTION</p>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Best</span>
                  <span className="text-sm font-bold text-green-600">{data.overview.bestScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Median</span>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white">{data.overview.medianScore}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Worst</span>
                  <span className="text-sm font-bold text-red-600">{data.overview.worstScore}</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden mt-2">
                  <div
                    className="h-full bg-linear-to-r from-red-400 via-yellow-400 to-green-400"
                    style={{ width: `${data.overview.averageScore}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Violations Table */}
        {data.topViolations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                Most Common Violations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.topViolations.map((v, i) => (
                  <div
                    key={v.ruleId}
                    className="flex items-center gap-4 rounded-lg p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <span className="text-sm font-bold text-neutral-400 w-6">
                      #{i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-medium text-neutral-900 dark:text-white">{v.ruleId}</code>
                        <Badge variant={v.impact as "critical" | "serious" | "moderate" | "minor"}>
                          {v.impact}
                        </Badge>
                        {v.trend === "increasing" && (
                          <TrendingUp className="h-3 w-3 text-red-500" />
                        )}
                        {v.trend === "decreasing" && (
                          <TrendingDown className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Avg {v.avgAffectedElements} elements affected
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-neutral-900 dark:text-white">{v.count}</p>
                      <p className="text-xs text-neutral-400">occurrences</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* URL Breakdown */}
        {data.urlBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                URL Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.urlBreakdown.map((u) => (
                  <div
                    key={u.url}
                    className="flex items-center gap-4 rounded-lg p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-neutral-900 dark:text-white truncate">{u.url}</p>
                      <p className="text-xs text-neutral-400">{u.scans} scans</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.trend === "improving" && <TrendingUp className="h-4 w-4 text-green-500" />}
                      {u.trend === "declining" && <TrendingDown className="h-4 w-4 text-red-500" />}
                      <span
                        className={`text-lg font-bold ${
                          u.latestScore >= 90
                            ? "text-green-600"
                            : u.latestScore >= 70
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {Math.round(u.latestScore)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function MetricCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
      <p className="text-2xl font-bold text-neutral-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-xs text-neutral-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function TrendChart({
  dataPoints,
}: {
  dataPoints: Array<{ date: string; score: number; scans: number }>;
}) {
  const chartWidth = 700;
  const chartHeight = 180;
  const padding = 30;

  const scores = dataPoints.map((d) => d.score);
  const minScore = Math.max(0, Math.min(...scores) - 10);
  const maxScore = Math.min(100, Math.max(...scores) + 10);

  const pointSpacing =
    (chartWidth - padding * 2) / Math.max(dataPoints.length - 1, 1);

  const points = dataPoints.map((dp, i) => ({
    x: padding + i * pointSpacing,
    y:
      chartHeight -
      padding -
      ((dp.score - minScore) / (maxScore - minScore)) *
        (chartHeight - padding * 2),
    ...dp,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const fillD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-48">
        {/* Y-axis labels */}
        {[minScore, (minScore + maxScore) / 2, maxScore].map((val) => {
          const y =
            chartHeight -
            padding -
            ((val - minScore) / (maxScore - minScore)) * (chartHeight - padding * 2);
          return (
            <g key={val}>
              <line x1={padding} y1={y} x2={chartWidth - padding} y2={y} stroke="#f3f4f6" strokeWidth="1" />
              <text x={padding - 5} y={y + 4} textAnchor="end" className="text-[10px]" fill="#9ca3af">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="analyticsGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={fillD} fill="url(#analyticsGradient)" />
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke="#3b82f6" strokeWidth="2" />
        ))}
      </svg>

      <div className="flex justify-between text-xs text-neutral-400 px-7 mt-1">
        <span>{dataPoints[0]?.date}</span>
        <span>{dataPoints[dataPoints.length - 1]?.date}</span>
      </div>
    </div>
  );
}
