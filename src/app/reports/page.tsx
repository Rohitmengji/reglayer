"use client";

/**
 * RegLayer — Reports Hub
 *
 * WHY: "Trends" and "Executive" are both the business/stakeholder view of where
 *      compliance stands and where it's heading. One tabbed hub keeps the sidebar
 *      short and frames them as reporting.
 * WHAT: Tabs for Trends · Executive. A tab is hidden if the plan lacks its feature;
 *       the underlying routes (/trends, /executive) still resolve.
 * HOW: Mirrors the Manage hub — lazy-imports the existing pages inside an
 *      EmbeddedProvider. Tab state lives in ?tab=.
 */

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { TrendingUp, PieChart } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useFeatures } from "@/hooks/use-features";

const TrendsPage = lazy(() => import("@/app/trends/page"));
const ExecutivePage = lazy(() => import("@/app/executive/page"));

type HubTab = Tab & { feature: string };

function HubSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-600 dark:border-t-white" />
    </div>
  );
}

function ReportsHubContent() {
  const { t } = useI18n();
  const { hasFeature, loading } = useFeatures();
  const searchParams = useSearchParams();

  // Until features resolve, hasFeature fails open (returns true for everything),
  // which would briefly show tabs the plan doesn't have. Hold the spinner so the
  // tab set settles in one transition.
  if (loading) {
    return (
      <AppShell>
        <HubSpinner />
      </AppShell>
    );
  }

  const allTabs: HubTab[] = [
    { id: "trends", label: t("nav.trends"), icon: TrendingUp, feature: "trends" },
    { id: "executive", label: t("nav.executive"), icon: PieChart, feature: "executive" },
  ];
  const tabs = allTabs.filter((tb) => hasFeature(tb.feature));
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((tb) => tb.id === requested) ? requested : tabs[0]?.id;

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("reports.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("reports.subtitle")}</p>
        </div>

        {tabs.length > 0 && <TabNav tabs={tabs} basePath="/reports" />}

        <EmbeddedProvider>
          <Suspense fallback={<HubSpinner />}>
            {activeTab === "trends" && <TrendsPage />}
            {activeTab === "executive" && <ExecutivePage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function ReportsHub() {
  return (
    <Suspense>
      <ReportsHubContent />
    </Suspense>
  );
}
