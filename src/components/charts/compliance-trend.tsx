"use client";

/**
 * RegLayer — Compliance Trend Chart
 *
 * WHY: Users need to visualize their compliance score over time.
 * WHAT: Line chart showing score history with trend indicator (improving/declining).
 * HOW: Receives data points array, renders SVG/canvas chart with hover tooltips.
 */

import { useScanStore } from "@/stores/scanStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n-provider";

/**
 * Compliance Trend Chart
 *
 * Displays score history over time as a simple sparkline chart.
 * Uses scan history from the store to show compliance trends.
 */
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
      timestamp: entry.scan.timestamp,
      url: entry.scan.url,
    }));

  const maxScore = 100;
  const minScore = 0;
  const chartHeight = 120;
  const chartWidth = 600;
  const padding = 20;

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

  // Gradient fill path
  const fillD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  const latestScore = dataPoints[dataPoints.length - 1]?.score ?? 0;
  const previousScore = dataPoints[dataPoints.length - 2]?.score ?? latestScore;
  const trend = latestScore - previousScore;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-neutral-600">
            {t("complianceTrend.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-neutral-900">
              {latestScore}
            </span>
            <span
              className={`text-sm font-medium ${
                trend > 0
                  ? "text-green-600"
                  : trend < 0
                  ? "text-red-600"
                  : "text-neutral-500"
              }`}
            >
              {trend > 0 ? "↑" : trend < 0 ? "↓" : "→"}{" "}
              {Math.abs(trend).toFixed(1)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-32"
          preserveAspectRatio="none"
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y =
              chartHeight -
              padding -
              ((val - minScore) / (maxScore - minScore)) *
                (chartHeight - padding * 2);
            return (
              <line
                key={val}
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Gradient fill */}
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fillD} fill="url(#scoreGradient)" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke="#16a34a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3"
              fill="white"
              stroke="#16a34a"
              strokeWidth="2"
            />
          ))}
        </svg>

        <div className="mt-2 flex justify-between text-xs text-neutral-400">
          <span>
            {new Date(dataPoints[0].timestamp).toLocaleDateString()}
          </span>
          <span>{dataPoints.length} scans</span>
          <span>
            {new Date(
              dataPoints[dataPoints.length - 1].timestamp
            ).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
