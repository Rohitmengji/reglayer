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
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Wand2, DollarSign, Route, Activity, Component, Clock } from "lucide-react";

const RemediationPage = lazy(() => import("@/app/dashboard/remediation/page"));
const RevenuePage = lazy(() => import("@/app/dashboard/revenue/page"));
const JourneyPage = lazy(() => import("@/app/dashboard/journey/page"));
const RumPage = lazy(() => import("@/app/dashboard/rum/page"));
const DesignSystemPage = lazy(() => import("@/app/dashboard/design-system/page"));
const SchedulesPage = lazy(() => import("@/app/automation/schedules-page"));

const tabs: Tab[] = [
  { id: "remediation", label: "Remediation", icon: Wand2 },
  { id: "revenue", label: "Revenue Impact", icon: DollarSign },
  { id: "journey", label: "Journey Scan", icon: Route },
  { id: "rum", label: "RUM", icon: Activity },
  { id: "design-system", label: "Design System", icon: Component },
  { id: "schedules", label: "Schedules", icon: Clock },
];

function AutomationContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "remediation";

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Automation</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Automated scanning, monitoring, and remediation tools
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
    <Suspense>
      <AutomationContent />
    </Suspense>
  );
}
