"use client";

/**
 * RegLayer — Analysis Hub Page
 *
 * WHY: Combines multiple analysis views (screen reader, visual audit) in one tabbed interface.
 * WHAT: Tab navigation between Screen Reader simulation, Visual Audit, and Design System analysis.
 * HOW: Uses URL search params (?tab=screen-reader) for tab state. Lazy-loads tab content.
 */

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Eye, Zap, Sparkles, BarChart3, GitCompare } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { FeatureGate } from "@/components/ui/feature-gate";

const ScreenReaderPage = lazy(() => import("@/app/screen-reader/page"));
const PrioritiesPage = lazy(() => import("@/app/priorities/page"));
const InsightsPage = lazy(() => import("@/app/insights/page"));
const AnalyticsPage = lazy(() => import("@/app/analytics/page"));
const ComparePage = lazy(() => import("@/app/scans/compare/page"));

const tabs: Tab[] = [
  { id: "screen-reader", label: "Screen Reader", icon: Eye },
  { id: "priorities", label: "Priorities", icon: Zap },
  { id: "insights", label: "AI Insights", icon: Sparkles },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "compare", label: "Compare", icon: GitCompare },
];

function AnalysisContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "screen-reader";

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("analysis.title")}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {t("analysis.subtitle")}
          </p>
        </div>

        <TabNav tabs={tabs} basePath="/analysis" />

        <EmbeddedProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-900 rounded-full dark:border-neutral-600 dark:border-t-white" />
              </div>
            }
          >
            {activeTab === "screen-reader" && <ScreenReaderPage />}
            {activeTab === "priorities" && <PrioritiesPage />}
            {activeTab === "insights" && <InsightsPage />}
            {activeTab === "analytics" && <AnalyticsPage />}
            {activeTab === "compare" && <ComparePage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function AnalysisHub() {
  return (
    <FeatureGate feature="analysis">
      <Suspense>
        <AnalysisContent />
      </Suspense>
    </FeatureGate>
  );
}
