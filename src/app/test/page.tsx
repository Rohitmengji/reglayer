"use client";

/**
 * RegLayer — Testing Hub
 *
 * WHY: "Scans", "Crawl Site", and "Manual Testing" are three facets of one job —
 *      checking a site for accessibility issues. Folding them into a single tabbed
 *      hub keeps the sidebar short and groups the mental model.
 * WHAT: Tabs for Scans · Crawl · Manual Testing. A tab is hidden if the plan lacks
 *       its feature; the underlying routes (/scans, /crawl, /manual-testing) still
 *       resolve, so existing links and bookmarks keep working.
 * HOW: Mirrors the Manage hub — lazy-imports the existing pages inside an
 *      EmbeddedProvider (so each child's own <AppShell> collapses to a passthrough).
 *      Tab state lives in ?tab=.
 *      NOTE: this route is /test — deliberately distinct from the legacy /testing
 *      (the Human Testing Network), which is an unrelated page.
 */

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Scan, Globe, ClipboardCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useFeatures } from "@/hooks/use-features";

const ScansPage = lazy(() => import("@/app/scans/page"));
const CrawlPage = lazy(() => import("@/app/crawl/page"));
const ManualTestingPage = lazy(() => import("@/app/manual-testing/page"));

type HubTab = Tab & { feature: string };

function HubSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900 dark:border-neutral-600 dark:border-t-white" />
    </div>
  );
}

function TestHubContent() {
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
    { id: "scans", label: t("nav.scans"), icon: Scan, feature: "scans" },
    { id: "crawl", label: t("nav.crawl"), icon: Globe, feature: "crawl" },
    { id: "manual", label: t("nav.manualTesting"), icon: ClipboardCheck, feature: "manualTesting" },
  ];
  const tabs = allTabs.filter((tb) => hasFeature(tb.feature));
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((tb) => tb.id === requested) ? requested : tabs[0]?.id;

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("testHub.title")}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{t("testHub.subtitle")}</p>
        </div>

        {tabs.length > 0 && <TabNav tabs={tabs} basePath="/test" />}

        <EmbeddedProvider>
          <Suspense fallback={<HubSpinner />}>
            {activeTab === "scans" && <ScansPage />}
            {activeTab === "crawl" && <CrawlPage />}
            {activeTab === "manual" && <ManualTestingPage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function TestHub() {
  return (
    <Suspense>
      <TestHubContent />
    </Suspense>
  );
}
