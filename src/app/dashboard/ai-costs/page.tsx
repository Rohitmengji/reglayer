"use client";

/**
 * RegLayer — AI Cost Dashboard
 *
 * WHY: Workspace owners need visibility into AI spending, token consumption,
 *      and feature-level cost breakdown to optimize usage and plan budgets.
 *
 * WHAT: Displays usage summary (total cost, tokens, requests, latency, success rate),
 *       daily usage chart, and cost-by-feature breakdown table.
 *
 * HOW: Fetches /api/ai/usage with configurable time range, renders in cards + chart + table.
 */

import { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";
import {
  DollarSign,
  Cpu,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  TrendingUp,
  BarChart3,
} from "lucide-react";

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

interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

interface UsageData {
  summary: UsageSummary;
  byFeature: FeatureCost[];
  daily: DailyUsage[];
}

const TIME_RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

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

export default function AICostDashboard() {
  const { t } = useI18n();
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/usage?days=${days}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchData is reused by refresh button
  useEffect(() => { fetchData(); }, [days]);

  const formatCost = (cost: number) =>
    cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;

  const formatTokens = (tokens: number) =>
    tokens >= 1_000_000
      ? `${(tokens / 1_000_000).toFixed(1)}M`
      : tokens >= 1_000
        ? `${(tokens / 1_000).toFixed(1)}K`
        : tokens.toString();

  const maxDailyCost = data?.daily.length
    ? Math.max(...data.daily.map((d) => d.cost))
    : 0;

  return (
    <AppShell>
      <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">AI Cost Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor AI spending, token usage, and feature-level costs
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Time range selector */}
            <div className="flex bg-muted rounded-lg p-0.5">
              {TIME_RANGES.map((range) => (
                <Button
                  key={range.days}
                  variant={days === range.days ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setDays(range.days)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="h-7"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        {data?.summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard
              icon={DollarSign}
              label="Total Cost"
              value={formatCost(data.summary.totalCostUsd)}
              className="text-emerald-600 dark:text-emerald-400"
            />
            <SummaryCard
              icon={Cpu}
              label="Total Tokens"
              value={formatTokens(data.summary.totalTokens)}
              className="text-blue-600 dark:text-blue-400"
            />
            <SummaryCard
              icon={Zap}
              label="Requests"
              value={data.summary.totalRequests.toLocaleString()}
              className="text-violet-600 dark:text-violet-400"
            />
            <SummaryCard
              icon={Clock}
              label="Avg Latency"
              value={`${data.summary.avgLatencyMs}ms`}
              className="text-amber-600 dark:text-amber-400"
            />
            <SummaryCard
              icon={data.summary.successRate >= 0.95 ? CheckCircle2 : AlertCircle}
              label="Success Rate"
              value={`${(data.summary.successRate * 100).toFixed(1)}%`}
              className={
                data.summary.successRate >= 0.95
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }
            />
          </div>
        )}

        {/* Daily Usage Chart */}
        {data?.daily && data.daily.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                Daily Cost
              </CardTitle>
              <CardDescription>Cost per day over the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-40">
                {data.daily.map((day) => {
                  const height = maxDailyCost > 0 ? (day.cost / maxDailyCost) * 100 : 0;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-1 group relative"
                    >
                      <div
                        className="w-full bg-violet-500/80 dark:bg-violet-400/80 rounded-t transition-all hover:bg-violet-600 dark:hover:bg-violet-300 min-h-[2px]"
                        style={{ height: `${Math.max(height, 2)}%` }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                        <div className="bg-popover border rounded-md shadow-md px-2 py-1 text-xs whitespace-nowrap">
                          <div className="font-medium">{day.date}</div>
                          <div>{formatCost(day.cost)} · {day.requests} req</div>
                          <div>{formatTokens(day.tokens)} tokens</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* X-axis labels (show first, middle, last) */}
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>{data.daily[0]?.date.slice(5)}</span>
                <span>{data.daily[Math.floor(data.daily.length / 2)]?.date.slice(5)}</span>
                <span>{data.daily[data.daily.length - 1]?.date.slice(5)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cost by Feature Table */}
        {data?.byFeature && data.byFeature.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Cost by Feature
              </CardTitle>
              <CardDescription>Breakdown of AI spending across features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.byFeature.map((item) => {
                  const pct =
                    data.summary.totalCostUsd > 0
                      ? (item.cost / data.summary.totalCostUsd) * 100
                      : 0;
                  return (
                    <div key={item.feature} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">
                          {FEATURE_LABELS[item.feature] ?? item.feature}
                        </span>
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <span>{item.requests} requests</span>
                          <Badge variant="secondary" className="font-mono text-xs">
                            {formatCost(item.cost)}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 dark:bg-violet-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && data && data.summary.totalRequests === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Cpu className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <h3 className="font-medium">No AI usage yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                AI costs will appear here once you use features like the AI chat,
                violation explainer, or visual scan.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="h-4 w-16 bg-muted animate-pulse rounded mb-2" />
                  <div className="h-6 w-20 bg-muted animate-pulse rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${className}`} />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className="text-lg font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
