/**
 * RegLayer — Risk Score Badge (SVG Gauge)
 *
 * WHY: Visual indicator of litigation risk that executives understand instantly.
 * WHAT: Circular gauge showing 0-100 score with color-coded tier.
 */

"use client";

interface RiskScoreBadgeProps {
  score: number;
  tier: string;
  size?: number;
}

const TIER_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MODERATE: "#eab308",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

const TIER_LABELS: Record<string, string> = {
  LOW: "Low Risk",
  MODERATE: "Moderate Risk",
  HIGH: "High Risk",
  CRITICAL: "Critical Risk",
};

export function RiskScoreBadge({ score, tier, size = 180 }: RiskScoreBadgeProps) {
  const color = TIER_COLORS[tier] || TIER_COLORS.MODERATE;
  const label = TIER_LABELS[tier] || tier;
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
        role="img"
        aria-label={`Litigation risk score: ${Math.round(score)} out of 100, ${label}`}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-zinc-200 dark:text-zinc-700"
        />
        {/* Progress arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${color}40)` }}
        />
        {/* Score text */}
        <text
          x={center}
          y={center - 5}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-zinc-900 dark:fill-zinc-100 text-3xl font-bold"
          style={{ fontSize: size * 0.2 }}
          transform={`rotate(90, ${center}, ${center})`}
        >
          {Math.round(score)}
        </text>
        <text
          x={center}
          y={center + size * 0.13}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          style={{ fontSize: size * 0.08 }}
          className="font-semibold uppercase tracking-wide"
          transform={`rotate(90, ${center}, ${center})`}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}
