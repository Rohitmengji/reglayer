"use client";

/**
 * RegLayer — Dashboard Analytics Charts (Recharts)
 *
 * WHY: Visual data storytelling. Users should FEEL their compliance
 *      improving. Charts give immediate emotional feedback.
 *
 * WHAT: Violations breakdown (bar chart by severity).
 *
 * HOW: recharts library with custom theme colors matching our design system.
 *      Loaded via next/dynamic from the dashboard so recharts stays out of
 *      the page's initial bundle.
 */

import {
  BarChart, Bar, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { useI18n } from "@/components/i18n-provider";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Theme                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
const chartTheme = {
  critical: "#ef4444",
  serious: "#f59e0b",
  moderate: "#3b82f6",
  minor: "#94a3b8",
  grid: "rgba(0,0,0,0.04)",
  gridDark: "rgba(255,255,255,0.06)",
  text: "#6b7280",
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Custom Tooltip                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3.5 py-2.5 shadow-xl shadow-neutral-200/50 dark:shadow-neutral-900/50">
      <p className="text-[11px] font-semibold text-neutral-900 dark:text-white mb-1.5">{label}</p>
      {payload.filter(e => e.value > 0).map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{entry.name}</span>
          </div>
          <span className="text-[11px] font-bold tabular-nums text-neutral-900 dark:text-white">{entry.value}</span>
        </div>
      ))}
      {payload.length > 1 && (
        <div className="mt-1.5 pt-1.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
          <span className="text-[10px] text-neutral-400">Total</span>
          <span className="text-[11px] font-bold tabular-nums text-neutral-900 dark:text-white">{total}</span>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Violations Breakdown Bar Chart                                              */
/* ─────────────────────────────────────────────────────────────────────────── */
interface ViolationData {
  category: string;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export function ViolationsChart({ data }: { data: ViolationData[] }) {
  const { t } = useI18n();
  if (!data.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{t("charts.violationsByCategory")}</h3>
          <p className="text-xs text-muted mt-0.5">{t("charts.groupedBySeverity")}</p>
        </div>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {data.reduce((sum, d) => sum + d.critical + d.serious + d.moderate + d.minor, 0)}
          {/* This sums only the categories charted (the dashboard feeds the top issue
              groups), which can be fewer than the headline "Violations Found" total —
              so label it "shown", not "total". */}
          <span className="text-xs font-normal text-muted ml-1">shown</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }} barCategoryGap="25%">
          <defs>
            <linearGradient id="criticalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.critical} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.critical} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="seriousGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.serious} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.serious} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="moderateGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.moderate} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.moderate} stopOpacity={0.7} />
            </linearGradient>
            <linearGradient id="minorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.minor} stopOpacity={1} />
              <stop offset="100%" stopColor={chartTheme.minor} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
          <XAxis dataKey="category" tick={{ fontSize: 11, fill: chartTheme.text, fontWeight: 500 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fontSize: 10, fill: chartTheme.text }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", paddingTop: "12px" }} />
          <Bar dataKey="critical" name="Critical" fill="url(#criticalGrad)" stackId="a" radius={[0, 0, 0, 0]} />
          <Bar dataKey="serious" name="Serious" fill="url(#seriousGrad)" stackId="a" radius={[0, 0, 0, 0]} />
          <Bar dataKey="moderate" name="Moderate" fill="url(#moderateGrad)" stackId="a" radius={[0, 0, 0, 0]} />
          <Bar dataKey="minor" name="Minor" fill="url(#minorGrad)" stackId="a" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

