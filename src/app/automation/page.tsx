"use client";

/**
 * RegLayer — Automation Hub Page
 *
 * WHY: Combines scheduling and remediation views in one tabbed interface.
 * WHAT: Tab navigation between Schedules (cron) and Remediation (AI fixes).
 * HOW: Uses URL search params (?tab=remediation) for tab state. Lazy-loads tab content.
 */

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { FeatureGate } from "@/components/ui/feature-gate";
import { Wand2, DollarSign, Route, Activity, Component, Clock } from "lucide-react";

const RemediationPage = lazy(() => import("@/app/dashboard/remediation/page"));
const RevenuePage = lazy(() => import("@/app/dashboard/revenue/page"));
const JourneyPage = lazy(() => import("@/app/dashboard/journey/page"));
const RumPage = lazy(() => import("@/app/dashboard/rum/page"));
const DesignSystemPage = lazy(() => import("@/app/dashboard/design-system/page"));
const SchedulesPage = lazy(() => import("@/app/automation/schedules-page"));

function AutomationContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "remediation";

  // Built inside the component so labels go through t() (a module-level array
  // can't translate).
  const tabs: Tab[] = [
    { id: "remediation", label: t("automation.tabRemediation"), icon: Wand2 },
    { id: "revenue", label: t("automation.tabRevenue"), icon: DollarSign },
    { id: "journey", label: t("automation.tabJourney"), icon: Route },
    { id: "rum", label: t("automation.tabRum"), icon: Activity },
    { id: "design-system", label: t("automation.tabDesignSystem"), icon: Component },
    { id: "schedules", label: t("automation.tabSchedules"), icon: Clock },
  ];

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("nav.automation")}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {t("automation.subtitle")}
          </p>
        </div>

        <TabNav tabs={tabs} basePath="/automation" />

        <EmbeddedProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-900 rounded-full dark:border-neutral-600 dark:border-t-white" />
              </div>
            }
          >
            {activeTab === "remediation" && <RemediationPage />}
            {activeTab === "revenue" && <RevenuePage />}
            {activeTab === "journey" && <JourneyPage />}
            {activeTab === "rum" && <RumPage />}
            {activeTab === "design-system" && <DesignSystemPage />}
            {activeTab === "schedules" && <SchedulesPage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function AutomationHub() {
  return (
    <FeatureGate feature="automation">
      <Suspense>
        <AutomationContent />
      </Suspense>
    </FeatureGate>
  );
}
