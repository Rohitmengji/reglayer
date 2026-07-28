"use client";

/**
 * RegLayer — AI Cost Dashboard
 *
 * Production-grade AI spend analytics. Shows cost trends, model efficiency,
 * feature-level breakdown, period-over-period deltas, and projected monthly spend.
 *
 * Architecture:
 * - Fetches /api/ai/usage with time range
 * - Recharts for area/bar charts (lazy-loaded to keep bundle lean)
 * - Delta indicators compare current vs previous period
 * - Cost projection extrapolates daily average to 30-day forecast
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import * as Sentry from "@sentry/nextjs";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  DollarSign,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Sparkles,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  successRate: number;
}

interface FeatureCost {
  feature: string;
  cost: number;
  requests: number;
}

interface ModelCost {
  model: string;
  provider: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  avgLatencyMs: number;
}

interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface UsageData {
  summary: UsageSummary;
  prevSummary: UsageSummary;
  byFeature: FeatureCost[];
  byModel: ModelCost[];
  daily: DailyUsage[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const FEATURE_LABELS: Record<string, string> = {
  chat: "AI Chat",
  "violation-explainer": "Violation Explainer",
  "visual-scan": "Visual Scan",
  "page-summary": "Page Summary",
  "insights-analysis": "Insights Analysis",
  "priority-ranking": "Priority Ranking",
  "compliance-assessment": "Compliance Assessment",
  "manual-test-guidance": "Manual Test Guidance",
  "fix-suggestion": "Fix Suggestion",
};

const MODEL_COLORS: Record<string, string> = {
  "gpt-4o-mini": "#10b981",
  "gpt-4o": "#3b82f6",
  "gpt-4.1-mini": "#14b8a6",
  "gpt-4.1": "#6366f1",
  "claude-haiku": "#f59e0b",
  "claude-sonnet": "#8b5cf6",
  "claude-opus": "#ec4899",
};

const FEATURE_COLORS = [
  "#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#ec4899", "#14b8a6", "#6366f1", "#f97316",
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function AICostDashboard() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/usage?days=${days}`);
      if (!res.ok) throw new Error(res.status === 429 ? "Rate limited — try again shortly." : "Could not load AI cost data.");
      setData(await res.json());
      setError(null);
    } catch (err) {
      Sentry.captureException(err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  // Fetch data on mount and when days changes — setState in effect is intentional
  // (data fetching pattern, not a synchronous state cascade).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchData(); }, [fetchData]);

  // Projected monthly cost (extrapolate daily average × 30)
  const projectedMonthlyCost = useMemo(() => {
    if (!data?.daily.length) return 0;
    const totalCost = data.daily.reduce((sum, d) => sum + d.cost, 0);
    const dailyAvg = totalCost / data.daily.length;
    return dailyAvg * 30;
  }, [data]);

  // Cost per request
  const costPerRequest = useMemo(() => {
    if (!data?.summary.totalRequests) return 0;
    return data.summary.totalCostUsd / data.summary.totalRequests;
  }, [data]);

  return (
    <AppShell>
      <div className="space-y-8 p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">AI Costs</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-11">
              Track spending, token consumption, and model efficiency across your workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border bg-card p-0.5 shadow-sm">
              {TIME_RANGES.map((range) => (
                <button
                  key={range.days}
                  onClick={() => setDays(range.days)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    days === range.days
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={fetchData}
              disabled={loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Loading State ───────────────────────────────────────────────── */}
        {loading && !data && <LoadingSkeleton />}

        {/* ── Error State ─────────────────────────────────────────────────── */}
        {!loading && error && !data && (
          <Card className="border-dashed border-red-200 dark:border-red-900">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center" role="alert">
              <AlertCircle className="h-10 w-10 text-red-400 mb-3" aria-hidden="true" />
              <h3 className="font-medium">Couldn&apos;t load AI cost data</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={fetchData}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Main Content ────────────────────────────────────────────────── */}
        {data && (
          <>
            {/* KPI Cards with Delta */}
            <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              <KPICard
                icon={DollarSign}
                label="Total Spend"
                value={formatCost(data.summary.totalCostUsd)}
                delta={computeDelta(data.summary.totalCostUsd, data.prevSummary.totalCostUsd)}
                invertDelta
                color="emerald"
              />
              <KPICard
                icon={TrendingUp}
                label="Projected / mo"
                value={formatCost(projectedMonthlyCost)}
                sublabel="based on daily avg"
                color="blue"
              />
              <KPICard
                icon={Zap}
                label="Requests"
                value={data.summary.totalRequests.toLocaleString()}
                delta={computeDelta(data.summary.totalRequests, data.prevSummary.totalRequests)}
                color="violet"
              />
              <KPICard
                icon={Cpu}
                label="Tokens"
                value={formatTokens(data.summary.totalTokens)}
                delta={computeDelta(data.summary.totalTokens, data.prevSummary.totalTokens)}
                color="sky"
              />
              <KPICard
                icon={Clock}
                label="Avg Latency"
                value={`${data.summary.avgLatencyMs}ms`}
                delta={computeDelta(data.summary.avgLatencyMs, data.prevSummary.avgLatencyMs)}
                invertDelta
                color="amber"
              />
              <KPICard
                icon={data.summary.successRate >= 0.95 ? CheckCircle2 : AlertCircle}
                label="Success Rate"
                value={`${(data.summary.successRate * 100).toFixed(1)}%`}
                sublabel={`$${costPerRequest.toFixed(4)}/req`}
                color={data.summary.successRate >= 0.95 ? "green" : "red"}
              />
            </div>

            {/* ── Charts Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Cost Trend (2/3 width) */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Cost Trend</CardTitle>
                      <CardDescription>Daily spend over the selected period</CardDescription>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {formatCost(data.daily.reduce((s, d) => s + d.cost, 0))} total
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.daily.length > 0 ? (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d: string) => d.slice(5)}
                            tick={{ fontSize: 11, fill: "#9ca3af" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
                            tick={{ fontSize: 11, fill: "#9ca3af" }}
                            axisLine={false}
                            tickLine={false}
                            width={55}
                          />
                          <Tooltip content={<CostTooltip />} />
                          <Area
                            type="monotone"
                            dataKey="cost"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            fill="url(#costGradient)"
                            dot={false}
                            activeDot={{ r: 4, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>

              {/* Requests per day (1/3 width) */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Daily Requests</CardTitle>
                  <CardDescription>Volume over time</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  {data.daily.length > 0 ? (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickFormatter={(d: string) => d.slice(8)}
                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: "#9ca3af" }}
                            axisLine={false}
                            tickLine={false}
                            width={35}
                          />
                          <Tooltip content={<RequestTooltip />} />
                          <Bar dataKey="requests" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyChart />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Breakdown Tables ────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Model Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Cost by Model</CardTitle>
                  <CardDescription>Which models are consuming your budget</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byModel.length > 0 ? (
                    <div className="space-y-0 divide-y divide-border">
                      {data.byModel.map((item) => {
                        const pct = data.summary.totalCostUsd > 0
                          ? (item.cost / data.summary.totalCostUsd) * 100 : 0;
                        const color = MODEL_COLORS[item.model] ?? "#6b7280";
                        return (
                          <div key={item.model} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                <span className="text-sm font-medium">{item.model}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                  {item.provider}
                                </Badge>
                              </div>
                              <span className="text-sm font-bold tabular-nums">
                                {formatCost(item.cost)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-1.5">
                              <span>{item.requests.toLocaleString()} req</span>
                              <span>{formatTokens(item.inputTokens + item.outputTokens)} tokens</span>
                              <span>{item.avgLatencyMs}ms avg</span>
                              <span className="ml-auto font-medium">{pct.toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState message="No model data yet" />
                  )}
                </CardContent>
              </Card>

              {/* Feature Breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Cost by Feature</CardTitle>
                  <CardDescription>Where AI spend is allocated across product features</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.byFeature.length > 0 ? (
                    <div className="space-y-0 divide-y divide-border">
                      {data.byFeature.map((item, idx) => {
                        const pct = data.summary.totalCostUsd > 0
                          ? (item.cost / data.summary.totalCostUsd) * 100 : 0;
                        const color = FEATURE_COLORS[idx % FEATURE_COLORS.length];
                        return (
                          <div key={item.feature} className="py-3 first:pt-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                                <span className="text-sm font-medium">
                                  {FEATURE_LABELS[item.feature] ?? item.feature}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-muted-foreground">
                                  {item.requests} req
                                </span>
                                <span className="text-sm font-bold tabular-nums">
                                  {formatCost(item.cost)}
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <EmptyState message="No feature data yet" />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Cost Efficiency Table ──────────────────────────────────── */}
            {data.byModel.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Model Efficiency</CardTitle>
                  <CardDescription>
                    Cost per 1K tokens and cost per request — identifies optimization targets
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs">Model</th>
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs text-right">Cost/1K in</th>
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs text-right">Cost/1K out</th>
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs text-right">Cost/req</th>
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs text-right">Avg tok/req</th>
                          <th className="pb-2.5 font-medium text-muted-foreground text-xs text-right">Latency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.byModel.map((m) => {
                          const totalTokens = m.inputTokens + m.outputTokens;
                          const tokensPerReq = m.requests > 0 ? Math.round(totalTokens / m.requests) : 0;
                          const costPerReq = m.requests > 0 ? m.cost / m.requests : 0;
                          const inputShare = totalTokens > 0 ? m.inputTokens / totalTokens : 0.5;
                          const costPer1kIn = m.inputTokens > 0 ? (m.cost * inputShare) / (m.inputTokens / 1000) : 0;
                          const costPer1kOut = m.outputTokens > 0 ? (m.cost * (1 - inputShare)) / (m.outputTokens / 1000) : 0;
                          return (
                            <tr key={m.model} className="hover:bg-muted/50 transition-colors">
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: MODEL_COLORS[m.model] ?? "#6b7280" }} />
                                  <span className="font-medium">{m.model}</span>
                                </div>
                              </td>
                              <td className="py-2.5 text-right font-mono text-xs">${costPer1kIn.toFixed(4)}</td>
                              <td className="py-2.5 text-right font-mono text-xs">${costPer1kOut.toFixed(4)}</td>
                              <td className="py-2.5 text-right font-mono text-xs">${costPerReq.toFixed(4)}</td>
                              <td className="py-2.5 text-right font-mono text-xs">{tokensPerReq.toLocaleString()}</td>
                              <td className="py-2.5 text-right">
                                <Badge variant={m.avgLatencyMs > 2000 ? "destructive" : "secondary"} className="text-[10px] px-1.5">
                                  {m.avgLatencyMs}ms
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── Global Empty State ──────────────────────────────────────────── */}
        {!loading && data && data.summary.totalRequests === 0 && (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-violet-50 dark:bg-violet-900/20 mb-4">
                <Activity className="h-8 w-8 text-violet-500" />
              </div>
              <h3 className="text-lg font-semibold">No AI usage recorded yet</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-md">
                Cost data appears here once AI features are used — the chat assistant,
                violation explainer, visual scan, or any feature powered by the AI gateway.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KPICard({
  icon: Icon,
  label,
  value,
  delta,
  sublabel,
  invertDelta,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  delta?: number | null;
  sublabel?: string;
  invertDelta?: boolean;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20",
    sky: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
    green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  };

  const isUp = delta !== undefined && delta !== null && delta > 0;
  const isDown = delta !== undefined && delta !== null && delta < 0;
  const isGood = invertDelta ? isDown : isUp;
  const isBad = invertDelta ? isUp : isDown;

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-md ${colorMap[color] ?? colorMap.violet}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
        </div>
        <div className="text-xl font-bold tracking-tight tabular-nums">{value}</div>
        {delta !== undefined && delta !== null && (
          <div className={`flex items-center gap-1 mt-1 text-[11px] font-medium ${
            isGood ? "text-green-600 dark:text-green-400" :
            isBad ? "text-red-600 dark:text-red-400" :
            "text-muted-foreground"
          }`}>
            {isUp ? <ArrowUpRight className="h-3 w-3" /> : isDown ? <ArrowDownRight className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{Math.abs(delta).toFixed(1)}% vs prev period</span>
          </div>
        )}
        {sublabel && !delta && (
          <div className="text-[11px] text-muted-foreground mt-1">{sublabel}</div>
        )}
      </CardContent>
    </Card>
  );
}

function CostTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <p className="text-muted-foreground mt-0.5">
        Cost: <span className="font-bold text-foreground">{formatCost(payload[0].value)}</span>
      </p>
    </div>
  );
}

function RequestTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: DailyUsage }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        <p>Requests: <span className="font-bold text-foreground">{d.requests}</span></p>
        <p>Tokens: <span className="font-bold text-foreground">{formatTokens(d.tokens)}</span></p>
        <p>Cost: <span className="font-bold text-foreground">{formatCost(d.cost)}</span></p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-muted-foreground">
      No data for this period
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">{message}</div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 h-[320px]">
          <CardContent className="p-6">
            <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
            <div className="h-[240px] bg-muted/50 animate-pulse rounded" />
          </CardContent>
        </Card>
        <Card className="h-[320px]">
          <CardContent className="p-6">
            <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
            <div className="h-[240px] bg-muted/50 animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function computeDelta(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return 100;
  return ((current - previous) / previous) * 100;
}
