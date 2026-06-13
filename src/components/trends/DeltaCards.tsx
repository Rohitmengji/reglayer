"use client";

/**
 * RegLayer — Delta Cards Row
 *
 * WHY: Users need instant "at a glance" metrics — is my score going up or down?
 *
 * WHAT: 4 cards showing: AIS Score Change, Total Violations, Critical Issues, Streak.
 *       Each shows current value + delta (green up / red down).
 *
 * HOW: Pure presentational component. Receives data from useSiteTrends().
 */

import { TrendingUp, TrendingDown, Minus, Flame, AlertTriangle, Bug, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ScoreDelta, StreakData } from "@/lib/analytics/trends";
import { useI18n } from "@/components/i18n-provider";

interface DeltaCardsProps {
  delta: ScoreDelta | null;
  streak: StreakData | null;
  currentViolations?: number;
  currentCritical?: number;
}

export function DeltaCards({ delta, streak, currentViolations, currentCritical }: DeltaCardsProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {/* AIS Score */}
      <DeltaCard
        label="AIS Score"
        value={delta?.currentScore ?? 0}
        delta={delta?.scoreDelta ?? null}
        icon={<Zap className="h-4 w-4 text-blue-500" />}
        format="score"
      />

      {/* Total Violations */}
      <DeltaCard
        label="Violations"
        value={currentViolations ?? (delta ? (delta.violationDelta < 0 ? 0 : delta.violationDelta) : 0)}
        delta={delta?.violationDelta ? -delta.violationDelta : null}
        icon={<Bug className="h-4 w-4 text-orange-500" />}
        format="count"
        invertDelta
      />

      {/* Critical Issues */}
      <DeltaCard
        label="Critical Issues"
        value={currentCritical ?? 0}
        delta={delta?.criticalDelta ? -delta.criticalDelta : null}
        icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
        format="count"
        invertDelta
      />

      {/* Streak */}
      <Card className="border border-neutral-200 dark:border-neutral-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Improvement Streak
            </span>
            {streak && streak.currentStreak >= 3 ? (
              <Flame className="h-4 w-4 text-orange-500" />
            ) : (
              <Minus className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            )}
          </div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            {streak?.currentStreak ?? 0}
            {streak && streak.currentStreak >= 3 && (
              <span className="ml-1 text-sm font-normal text-orange-500">🔥</span>
            )}
          </p>
          <p className="text-xs text-neutral-500 mt-1">
            {streak && streak.currentStreak >= 3
              ? `${streak.currentStreak} scans improving`
              : streak && streak.currentStreak === 0
              ? "Score dropped — check recent changes"
              : "Keep scanning to build a streak"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────── Single Delta Card ───────────────

interface DeltaCardProps {
  label: string;
  value: number;
  delta: number | null;
  icon: React.ReactNode;
  format: "score" | "count";
  invertDelta?: boolean;
}

function DeltaCard({ label, value, delta, icon, format, invertDelta }: DeltaCardProps) {
  const displayDelta = delta !== null && delta !== 0;
  const isPositive = invertDelta ? (delta ?? 0) > 0 : (delta ?? 0) > 0;
  const isNegative = invertDelta ? (delta ?? 0) < 0 : (delta ?? 0) < 0;

  return (
    <Card className="border border-neutral-200 dark:border-neutral-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {label}
          </span>
          {icon}
        </div>
        <div className="flex items-end gap-2">
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            {format === "score" ? value : value}
          </p>
          {displayDelta && (
            <span
              className={`inline-flex items-center gap-0.5 text-xs font-medium pb-0.5 ${
                isPositive
                  ? "text-green-600"
                  : isNegative
                  ? "text-red-600"
                  : "text-neutral-500"
              }`}
              aria-label={`Change: ${delta! > 0 ? "+" : ""}${delta}`}
            >
              {isPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : isNegative ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {delta! > 0 ? "+" : ""}
              {delta}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
