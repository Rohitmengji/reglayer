"use client";

/**
 * RegLayer — Score Card Component
 *
 * WHY: Dashboard needs compact metric displays (total scans, avg score, etc.).
 * WHAT: Card with large number, label, and optional trend arrow (up/down/neutral).
 * HOW: Receives value, label, trend props. Color-codes trend (green=up, red=down).
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanSummary } from "@/lib/types";
import { ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { InfoHint } from "@/components/ui/info-hint";
import { useAnimatedNumber } from "@/hooks/use-animated-number";

interface ScoreCardProps {
  summary: ScanSummary;
}

export function ScoreCard({ summary }: ScoreCardProps) {
  const scoreColor = getScoreColor(summary.score);
  const { t } = useI18n();
  const animatedScore = useAnimatedNumber(summary.score, 1200);
  const circumference = 2 * Math.PI * 40; // r=40
  const strokeDasharray = `${(animatedScore / 100) * circumference} ${circumference}`;

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {t("scoreCard.title")}
          <InfoHint label={t("scoreCard.bandsLabel")} content={t("scoreCard.bandsExplain")} side="bottom" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Score Circle — animated fill on mount */}
          <div className="relative flex h-28 w-28 items-center justify-center">
            <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="7"
                className="text-neutral-100 dark:text-neutral-800"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={scoreColor}
                strokeWidth="7"
                strokeDasharray={strokeDasharray}
                strokeLinecap="round"
                className="transition-[stroke-dasharray] duration-1000 ease-out"
                style={{ filter: `drop-shadow(0 0 6px ${scoreColor}40)` }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span
                className="text-3xl font-bold tabular-nums"
                style={{ color: scoreColor }}
              >
                {animatedScore}
              </span>
              <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 -mt-0.5">/ 100</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3">
            <SeverityCount
              icon={ShieldAlert}
              label={t("scoreCard.critical")}
              count={summary.critical}
              color="text-red-600"
            />
            <SeverityCount
              icon={AlertTriangle}
              label={t("scoreCard.serious")}
              count={summary.serious}
              color="text-orange-600"
            />
            <SeverityCount
              icon={AlertTriangle}
              label={t("scoreCard.moderate")}
              count={summary.moderate}
              color="text-yellow-600"
            />
            <SeverityCount
              icon={Info}
              label={t("scoreCard.minor")}
              count={summary.minor}
              color="text-blue-600"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SeverityCount({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <p className="text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">{count}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  // Modern band palette: 70–89 is a positive green (not warning amber); amber is
  // reserved for 50–69 "needs work". Kept in sync with report/[id] + scans list.
  if (score >= 90) return "#059669"; // emerald — excellent
  if (score >= 70) return "#22c55e"; // green — good
  if (score >= 50) return "#f59e0b"; // amber — needs work
  return "#ef4444"; // red — poor
}
