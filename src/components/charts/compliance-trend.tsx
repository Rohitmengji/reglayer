"use client";

/**
 * RegLayer — Compliance Trend Chart
 *
 * WHY: Users need to visualize their compliance score over time.
 * WHAT: Line chart showing score history with trend indicator (improving/declining).
 * HOW: Recharts area chart with gradient fill, custom tooltip, and responsive sizing.
 */

import { useScanStore } from "@/stores/scanStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const color = score >= 90 ? "text-emerald-600" : score >= 70 ? "text-green-600" : score >= 50 ? "text-amber-600" : "text-red-600";
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 shadow-xl shadow-neutral-200/50 dark:shadow-neutral-900/50">
      <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{score}<span className="text-xs font-normal text-neutral-400 ml-0.5">/100</span></p>
    </div>
  );
}

export function ComplianceTrend() {
  const { scanHistory } = useScanStore();
  const { t } = useI18n();

  if (scanHistory.length < 2) {
    return null;
  }

  // Get last 20 scans in chronological order
  const dataPoints = scanHistory
    .slice(0, 20)
    .reverse()
    .map((entry) => ({
      score: entry.scan.summary.score,
      date: new Date(entry.scan.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      url: entry.scan.url,
    }));

  const latestScore = dataPoints[dataPoints.length - 1]?.score ?? 0;
  const previousScore = dataPoints[dataPoints.length - 2]?.score ?? latestScore;
  const trend = latestScore - previousScore;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-neutral-900 dark:text-white">
              {t("complianceTrend.title")}
            </CardTitle>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
              {dataPoints.length} scans over {dataPoints[0]?.date} — {dataPoints[dataPoints.length - 1]?.date}
            </p>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-white">
              {latestScore}
            </span>
            <span
              className={`ml-2 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                trend > 0
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : trend < 0
                  ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {trend > 0 ? <TrendingUp className="h-3 w-3" /> : trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
              {trend > 0 ? "+" : ""}{trend.toFixed(1)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={dataPoints} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#6366f1" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#9ca3af", fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              interval={Math.max(0, Math.floor(dataPoints.length / 5) - 1)}
            />
            <YAxis
              domain={["dataMin - 10", 100]}
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              width={40}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#6366f1", strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#6366f1"
              strokeWidth={2.5}
              fill="url(#trendGradient)"
              dot={false}
              activeDot={{ r: 7, fill: "#6366f1", strokeWidth: 3, stroke: "#ffffff", filter: "url(#glow)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
