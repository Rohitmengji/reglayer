"use client";

/**
 * RegLayer — Dashboard Analytics Charts (Recharts)
 *
 * WHY: Visual data storytelling. Users should FEEL their compliance
 *      improving. Charts give immediate emotional feedback.
 *
 * WHAT:
 * - Score trend area chart (compliance over time)
 * - Violations breakdown (bar chart by severity)
 * - Category distribution (radar chart)
 * - Scan activity heatmap-style display
 *
 * HOW: recharts library with custom theme colors matching our design system.
 */

import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

/* ─────────────────────────────────────────────────────────────────────────── */
/* Theme                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */
const chartTheme = {
  accent: "#6366f1",
  accentLight: "#818cf8",
  success: "#34d399",
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
/* Score Trend Chart                                                           */
/* ─────────────────────────────────────────────────────────────────────────── */
interface TrendDataPoint {
  date: string;
  score: number;
}

export function ScoreTrendChart({ data }: { data: TrendDataPoint[] }) {
  if (data.length < 2) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Compliance Score</h3>
          <p className="text-xs text-muted mt-0.5">Trend over time</p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-bold text-foreground tabular-nums">{data[data.length - 1]?.score}%</span>
          {data.length >= 2 && (() => {
            const diff = (data[data.length - 1]?.score ?? 0) - (data[data.length - 2]?.score ?? 0);
            return (
              <span className={`block text-xs font-medium ${diff >= 0 ? "text-success" : "text-danger"}`}>
                {diff >= 0 ? "↑" : "↓"} {Math.abs(diff).toFixed(1)}%
              </span>
            );
          })()}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartTheme.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={chartTheme.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chartTheme.text }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: chartTheme.text }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            name="Score"
            stroke={chartTheme.accent}
            strokeWidth={2}
            fill="url(#scoreGrad)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, fill: chartTheme.accent }}
          />
        </AreaChart>
      </ResponsiveContainer>
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

/* ─────────────────────────────────────────────────────────────────────────── */
/* Category Radar Chart                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */
interface RadarDataPoint {
  subject: string;
  score: number;
  fullMark: number;
}

export function CategoryRadar({ data }: { data: RadarDataPoint[] }) {
  if (!data.length) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">WCAG Coverage</h3>
        <p className="text-xs text-muted mt-0.5">Score by principle</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke={chartTheme.grid} />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: chartTheme.text }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: chartTheme.text }} axisLine={false} />
          <Radar name="Score" dataKey="score" stroke={chartTheme.accent} fill={chartTheme.accent} fillOpacity={0.2} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */
/* Scan Activity (mini heatmap)                                                */
/* ─────────────────────────────────────────────────────────────────────────── */
interface ActivityData {
  day: string;
  scans: number;
}

export function ScanActivity({ data }: { data: ActivityData[] }) {
  const maxScans = Math.max(...data.map((d) => d.scans), 1);
  const totalScans = data.reduce((sum, d) => sum + d.scans, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Scan Activity</h3>
          <p className="text-xs text-muted mt-0.5">Last 30 days</p>
        </div>
        <span className="text-lg font-bold tabular-nums text-foreground">{totalScans}<span className="text-xs font-normal text-muted ml-1">scans</span></span>
      </div>
      <div className="grid grid-cols-10 gap-1.5">
        {data.map((d, i) => {
          const intensity = d.scans / maxScans;
          return (
            <div
              key={i}
              className="aspect-square rounded-sm transition-colors cursor-default"
              style={{
                backgroundColor: d.scans === 0
                  ? "var(--border)"
                  : `rgba(99, 102, 241, ${0.2 + intensity * 0.8})`,
              }}
              title={`${d.day}: ${d.scans} scan${d.scans !== 1 ? "s" : ""}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="text-[10px] text-muted">Less</span>
        <div className="flex gap-0.5">
          {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
            <div key={o} className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: `rgba(99, 102, 241, ${o})` }} />
          ))}
        </div>
        <span className="text-[10px] text-muted">More</span>
      </div>
    </div>
  );
}
