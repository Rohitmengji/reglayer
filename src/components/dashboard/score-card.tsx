"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScanSummary } from "@/lib/types";
import { ShieldAlert, AlertTriangle, Info } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface ScoreCardProps {
  summary: ScanSummary;
}

export function ScoreCard({ summary }: ScoreCardProps) {
  const scoreColor = getScoreColor(summary.score);
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          {t("scoreCard.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Score Circle */}
          <div className="relative flex h-24 w-24 items-center justify-center">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-neutral-200 dark:text-neutral-700"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={scoreColor}
                strokeWidth="8"
                strokeDasharray={`${summary.score * 2.51} 251`}
                strokeLinecap="round"
              />
            </svg>
            <span
              className="absolute text-2xl font-bold"
              style={{ color: scoreColor }}
            >
              {summary.score}
            </span>
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
        <p className="text-lg font-semibold text-neutral-900 dark:text-white">{count}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      </div>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  return "#dc2626";
}
