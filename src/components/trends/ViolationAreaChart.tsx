"use client";

/**
 * RegLayer — Violations Stacked Area Chart (Hand-rolled SVG)
 *
 * WHY: Users need to see violation composition changing over time —
 *      are critical issues shrinking while moderate ones stay flat?
 *
 * WHAT: Stacked area chart by impact level (critical, serious, moderate, minor).
 *       Same X-axis as score chart, hover tooltip with breakdown.
 *
 * HOW: Computes stacked Y coordinates for each layer. Renders filled paths
 *      with opacity. Shares the same data time axis as ScoreLineChart.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { ViolationTrendPoint } from "@/lib/analytics/trends";

interface ViolationAreaChartProps {
  data: ViolationTrendPoint[];
  height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };

const LAYERS: Array<{ key: keyof ViolationTrendPoint; color: string; label: string }> = [
  { key: "critical", color: "#dc2626", label: "Critical" },
  { key: "serious", color: "#ea580c", label: "Serious" },
  { key: "moderate", color: "#ca8a04", label: "Moderate" },
  { key: "minor", color: "#6b7280", label: "Minor" },
];

export function ViolationAreaChart({ data, height = 220 }: ViolationAreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Responsive width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(container);
    setWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  // Max Y value (sum of all impacts at peak)
  const maxY = useMemo(() => {
    if (data.length === 0) return 10;
    return Math.max(10, ...data.map((d) => d.total));
  }, [data]);

  // Compute stacked areas
  const stackedPaths = useMemo(() => {
    if (data.length < 2) return [];

    const xScale = (i: number) => PADDING.left + (i / (data.length - 1)) * chartWidth;
    const yScale = (val: number) => PADDING.top + chartHeight - (val / maxY) * chartHeight;

    // Build cumulative stack from bottom to top
    const paths: Array<{ path: string; color: string; label: string }> = [];
    const cumulativeBottom: number[] = new Array(data.length).fill(0);

    for (const layer of [...LAYERS].reverse()) {
      const topValues = data.map((d, i) => cumulativeBottom[i] + (d[layer.key] as number));

      // Build area path
      let path = `M ${xScale(0)} ${yScale(cumulativeBottom[0])}`;
      // Top line (left to right)
      for (let i = 0; i < data.length; i++) {
        path += ` L ${xScale(i)} ${yScale(topValues[i])}`;
      }
      // Bottom line (right to left)
      for (let i = data.length - 1; i >= 0; i--) {
        path += ` L ${xScale(i)} ${yScale(cumulativeBottom[i])}`;
      }
      path += " Z";

      paths.push({ path, color: layer.color, label: layer.label });

      // Update cumulative for next layer
      for (let i = 0; i < data.length; i++) {
        cumulativeBottom[i] = topValues[i];
      }
    }

    return paths.reverse(); // Render critical on top
  }, [data, chartWidth, chartHeight, maxY]);

  // X-axis labels
  const xLabels = useMemo(() => {
    if (data.length === 0) return [];
    const step = Math.max(1, Math.floor(data.length / 6));
    const labels: Array<{ x: number; label: string }> = [];
    for (let i = 0; i < data.length; i += step) {
      const date = new Date(data[i].date);
      labels.push({
        x: PADDING.left + (i / (data.length - 1)) * chartWidth,
        label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
    return labels;
  }, [data, chartWidth]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (data.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - PADDING.left;
      const index = Math.round((mouseX / chartWidth) * (data.length - 1));
      setHoveredIndex(Math.max(0, Math.min(data.length - 1, index)));
    },
    [data.length, chartWidth]
  );

  // Empty state
  if (data.length < 2) {
    return (
      <div
        ref={containerRef}
        className="w-full flex items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
        style={{ height }}
      >
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Not enough data to show violation trends
        </p>
      </div>
    );
  }

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null
    ? PADDING.left + (hoveredIndex / (data.length - 1)) * chartWidth
    : 0;

  return (
    <div ref={containerRef} className="w-full relative overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 px-1">
        {LAYERS.map((layer) => (
          <div key={layer.key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: layer.color }} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{layer.label}</span>
          </div>
        ))}
      </div>

      <svg
        width={width}
        height={height}
        className="overflow-visible"
        aria-label={`Violations trend chart showing ${data.length} data points`}
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Y-axis gridlines */}
        {[...Array(4)].map((_, i) => {
          const val = Math.round((maxY / 4) * (i + 1));
          const y = PADDING.top + chartHeight - (val / maxY) * chartHeight;
          return (
            <g key={i}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={width - PADDING.right}
                y2={y}
                stroke="currentColor"
                className="text-neutral-200 dark:text-neutral-700"
                strokeWidth="1"
              />
              <text x={PADDING.left - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-neutral-400">
                {val}
              </text>
            </g>
          );
        })}

        {/* Stacked areas */}
        {stackedPaths.map((layer, i) => (
          <path key={i} d={layer.path} fill={layer.color} opacity="0.6" />
        ))}

        {/* Hover crosshair */}
        {hoveredIndex !== null && (
          <line
            x1={hoveredX}
            y1={PADDING.top}
            x2={hoveredX}
            y2={PADDING.top + chartHeight}
            stroke="#6b7280"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text key={i} x={l.x} y={height - 8} textAnchor="middle" className="text-[10px] fill-neutral-400">
            {l.label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg px-3 py-2 text-xs z-10"
          style={{
            left: Math.min(hoveredX, width - 160),
            top: 30,
          }}
        >
          <p className="font-medium text-neutral-900 dark:text-white mb-1">
            {new Date(hovered.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <div className="space-y-0.5">
            <p><span className="inline-block w-2 h-2 rounded-sm bg-red-600 mr-1.5" />Critical: {hovered.critical}</p>
            <p><span className="inline-block w-2 h-2 rounded-sm bg-orange-600 mr-1.5" />Serious: {hovered.serious}</p>
            <p><span className="inline-block w-2 h-2 rounded-sm bg-yellow-600 mr-1.5" />Moderate: {hovered.moderate}</p>
            <p><span className="inline-block w-2 h-2 rounded-sm bg-neutral-500 mr-1.5" />Minor: {hovered.minor}</p>
          </div>
          <p className="mt-1 pt-1 border-t border-neutral-100 dark:border-neutral-700 font-medium">
            Total: {hovered.total}
          </p>
        </div>
      )}

      {/* Screen reader table */}
      <table className="sr-only" aria-label="Violations breakdown over time">
        <thead>
          <tr><th>Date</th><th>Critical</th><th>Serious</th><th>Moderate</th><th>Minor</th><th>Total</th></tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{new Date(d.date).toLocaleDateString()}</td>
              <td>{d.critical}</td>
              <td>{d.serious}</td>
              <td>{d.moderate}</td>
              <td>{d.minor}</td>
              <td>{d.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
