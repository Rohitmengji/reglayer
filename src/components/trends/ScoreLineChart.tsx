"use client";

/**
 * RegLayer — AIS Score Line Chart (Hand-rolled SVG)
 *
 * WHY: Users need to visually track their AIS score improving over time.
 *      No external charting lib — hand-rolled SVG matches existing patterns.
 *
 * WHAT: Responsive SVG line chart with:
 *   - Smooth bezier curve
 *   - Gradient fill under the line
 *   - Hover tooltip (date + score + "view scan →")
 *   - Threshold line at 700 (configurable)
 *   - X-axis dates, Y-axis 0–850
 *   - ResizeObserver for responsiveness
 *   - Empty state for < 2 data points
 *   - Screen reader accessible (aria-label + hidden data table)
 *
 * HOW: Computes SVG geometry from data points with useMemo.
 *      Uses cubic bezier for smooth curves. ResizeObserver tracks container width.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { ScoreTrendPoint } from "@/lib/analytics/trends";

interface ScoreLineChartProps {
  data: ScoreTrendPoint[];
  threshold?: number;
  height?: number;
}

const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };
const Y_MIN = 0;
const Y_MAX = 850;
const Y_GRIDLINES = [200, 400, 600, 800];

export function ScoreLineChart({ data, threshold = 700, height = 280 }: ScoreLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Responsive width via ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    setWidth(container.clientWidth);

    return () => observer.disconnect();
  }, []);

  // Chart geometry
  const chartWidth = width - PADDING.left - PADDING.right;
  const chartHeight = height - PADDING.top - PADDING.bottom;

  const points = useMemo(() => {
    if (data.length < 2) return [];
    return data.map((d, i) => ({
      x: PADDING.left + (i / (data.length - 1)) * chartWidth,
      y: PADDING.top + chartHeight - ((d.score - Y_MIN) / (Y_MAX - Y_MIN)) * chartHeight,
      ...d,
    }));
  }, [data, chartWidth, chartHeight]);

  // Smooth bezier path
  const linePath = useMemo(() => {
    if (points.length < 2) return "";
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return path;
  }, [points]);

  // Gradient fill area path
  const areaPath = useMemo(() => {
    if (points.length < 2) return "";
    const bottom = PADDING.top + chartHeight;
    let path = `M ${points[0].x} ${bottom} L ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    path += ` L ${points[points.length - 1].x} ${bottom} Z`;
    return path;
  }, [points, chartHeight]);

  // Threshold Y position
  const thresholdY = useMemo(
    () => PADDING.top + chartHeight - ((threshold - Y_MIN) / (Y_MAX - Y_MIN)) * chartHeight,
    [threshold, chartHeight]
  );

  // X-axis labels (show max 6-8)
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
      if (points.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // Find closest point
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dist = Math.abs(points[i].x - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      setHoveredIndex(closest);
    },
    [points]
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
          Not enough data — run at least 2 scans to see trends
        </p>
      </div>
    );
  }

  const hovered = hoveredIndex !== null ? points[hoveredIndex] : null;

  return (
    <div ref={containerRef} className="w-full relative">
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        aria-label={`AIS Score trend chart showing ${data.length} data points from ${new Date(data[0].date).toLocaleDateString()} to ${new Date(data[data.length - 1].date).toLocaleDateString()}`}
        role="img"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        <defs>
          <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis gridlines */}
        {Y_GRIDLINES.map((val) => {
          const y = PADDING.top + chartHeight - ((val - Y_MIN) / (Y_MAX - Y_MIN)) * chartHeight;
          return (
            <g key={val}>
              <line
                x1={PADDING.left}
                y1={y}
                x2={width - PADDING.right}
                y2={y}
                stroke="currentColor"
                className="text-neutral-200 dark:text-neutral-700"
                strokeWidth="1"
              />
              <text
                x={PADDING.left - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-neutral-400"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Threshold line */}
        <line
          x1={PADDING.left}
          y1={thresholdY}
          x2={width - PADDING.right}
          y2={thresholdY}
          stroke="#10b981"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.6"
        />
        <text
          x={width - PADDING.right + 4}
          y={thresholdY + 3}
          className="text-[9px] fill-emerald-500 font-medium"
        >
          Target
        </text>

        {/* Gradient fill */}
        <path d={areaPath} fill="url(#scoreGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hoveredIndex === i ? 5 : 3}
            fill={hoveredIndex === i ? "#2563eb" : "#3b82f6"}
            stroke="white"
            strokeWidth="2"
            className="transition-all duration-150"
          />
        ))}

        {/* X-axis labels */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={l.x}
            y={height - 8}
            textAnchor="middle"
            className="text-[10px] fill-neutral-400"
          >
            {l.label}
          </text>
        ))}

        {/* Hover crosshair */}
        {hovered && (
          <line
            x1={hovered.x}
            y1={PADDING.top}
            x2={hovered.x}
            y2={PADDING.top + chartHeight}
            stroke="#3b82f6"
            strokeWidth="1"
            strokeDasharray="2 2"
            opacity="0.5"
          />
        )}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg px-3 py-2 text-xs z-10"
          style={{
            left: Math.min(hovered.x, width - 160),
            top: hovered.y - 60,
          }}
        >
          <p className="font-medium text-neutral-900 dark:text-white">
            Score: {hovered.score}
          </p>
          <p className="text-neutral-500">
            {new Date(hovered.date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
      )}

      {/* Screen reader accessible data table (visually hidden) */}
      <table className="sr-only" aria-label="AIS Score data table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={i}>
              <td>{new Date(d.date).toLocaleDateString()}</td>
              <td>{d.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
