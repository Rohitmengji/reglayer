"use client";

/**
 * Dashboard Analytics — violation breakdown chart + priority fixes list.
 * Extracted from dashboard/page.tsx to keep the page lean and testable.
 */

import dynamic from "next/dynamic";
import { useI18n } from "@/components/i18n-provider";

const ViolationsChart = dynamic(
  () => import("@/components/charts/dashboard-charts").then((m) => m.ViolationsChart),
  { ssr: false, loading: () => null }
);

// Shared rule → category mapping (reusable by priorityEngine, reports, etc.)
export const VIOLATION_CATEGORY_MAP: Record<string, string> = {
  "color-contrast": "Color",
  "image-alt": "Images",
  "label": "Forms",
  "button-name": "Interactive",
  "link-name": "Navigation",
  "html-has-lang": "Structure",
  "document-title": "Structure",
  "meta-viewport": "Structure",
  "heading-order": "Structure",
  "list": "Structure",
  "aria-hidden-focus": "ARIA",
  "aria-valid-attr": "ARIA",
  "aria-valid-attr-value": "ARIA",
  "aria-required-attr": "ARIA",
  "aria-roles": "ARIA",
  "bypass": "Navigation",
  "frame-title": "Frames",
  "landmark-one-main": "Landmarks",
  "region": "Landmarks",
  "duplicate-id": "HTML",
  "tabindex": "Keyboard",
  "focus-order-semantics": "Keyboard",
  "keyboard": "Keyboard",
};

interface TopViolation {
  ruleId: string;
  impact: string;
  count: number;
}

interface DashboardAnalyticsProps {
  topViolations: TopViolation[];
}

export function DashboardAnalytics({ topViolations }: DashboardAnalyticsProps) {
  const categoryMap = new Map<string, { critical: number; serious: number; moderate: number; minor: number }>();

  for (const v of topViolations) {
    const category = VIOLATION_CATEGORY_MAP[v.ruleId] || "Other";
    const existing = categoryMap.get(category) || { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const impact = v.impact as "critical" | "serious" | "moderate" | "minor";
    if (impact in existing) {
      existing[impact] += v.count;
    }
    categoryMap.set(category, existing);
  }

  const violationData = Array.from(categoryMap.entries())
    .map(([category, counts]) => ({ category, ...counts }))
    .sort((a, b) => (b.critical + b.serious + b.moderate + b.minor) - (a.critical + a.serious + a.moderate + a.minor))
    .slice(0, 6);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ViolationsChart data={violationData} />
      <PriorityFixes topViolations={topViolations} />
    </div>
  );
}

function PriorityFixes({ topViolations }: { topViolations: TopViolation[] }) {
  const { t } = useI18n();
  const impactColor: Record<string, string> = {
    critical: "bg-red-500",
    serious: "bg-amber-500",
    moderate: "bg-blue-500",
    minor: "bg-neutral-400",
  };

  const impactBadge: Record<string, string> = {
    critical: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    serious: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    moderate: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    minor: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };

  const fixes = topViolations.slice(0, 5);
  const totalIssues = fixes.reduce((sum, v) => sum + v.count, 0);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{t("dashboard.priorityFixes")}</h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{t("dashboard.priorityFixesDesc")}</p>
        </div>
        <span className="text-lg font-bold tabular-nums text-neutral-900 dark:text-white">{totalIssues}<span className="text-xs font-normal text-neutral-500 dark:text-neutral-400 ml-1">{t("dashboard.issues", { count: String(totalIssues) })}</span></span>
      </div>
      <div className="space-y-2.5">
        {fixes.map((v, i) => (
          <div key={v.ruleId} className="flex items-center gap-3 rounded-lg border border-neutral-100 dark:border-neutral-800 p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-[10px] font-bold text-neutral-500 dark:text-neutral-400">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <code className="text-xs font-medium text-neutral-900 dark:text-white truncate">{v.ruleId}</code>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${impactBadge[v.impact] ?? impactBadge.minor}`}>
                  {v.impact}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${impactColor[v.impact] ?? impactColor.minor}`}
                    style={{ width: `${Math.min(100, (v.count / Math.max(totalIssues, 1)) * 100 * 2)}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 tabular-nums">{v.count}×</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {fixes.length === 0 && (
        <div className="text-center py-6 text-sm text-neutral-400 dark:text-neutral-500">
          {t("dashboard.noViolationsEmpty")}
        </div>
      )}
    </div>
  );
}
