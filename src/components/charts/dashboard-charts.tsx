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

/* ─────────────────────────────────────────────────────────────────────────── */
/* Theme                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
const chartTheme = {
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  grid: "rgba(255,255,255,0.06)",
  text: "#8b8b99",
};

/* ─────────────────────────────────────────────────────────────────────────── */
/* Custom Tooltip                                                              */
/* ─────────────────────────────────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-[10px] font-medium text-muted mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
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
  if (!data.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Violations by Category</h3>
          <p className="text-xs text-muted mt-0.5">Grouped by severity</p>
        </div>
        <span className="text-lg font-bold tabular-nums text-foreground">
          {data.reduce((sum, d) => sum + d.critical + d.serious + d.moderate + d.minor, 0)}
          <span className="text-xs font-normal text-muted ml-1">total</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
          <XAxis dataKey="category" tick={{ fontSize: 10, fill: chartTheme.text }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: chartTheme.text }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "10px", paddingTop: "8px" }} />
          <Bar dataKey="critical" name="Critical" fill={chartTheme.danger} radius={[3, 3, 0, 0]} />
          <Bar dataKey="serious" name="Serious" fill={chartTheme.warning} radius={[3, 3, 0, 0]} />
          <Bar dataKey="moderate" name="Moderate" fill={chartTheme.info} radius={[3, 3, 0, 0]} />
          <Bar dataKey="minor" name="Minor" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

