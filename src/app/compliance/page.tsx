"use client";

/**
 * RegLayer — Compliance Page
 *
 * WHY: Users need to see how their sites map against specific compliance standards.
 * WHAT: WCAG compliance matrix showing pass/fail for each success criterion. Tabs for different standards.
 * HOW: Lazy-loads matrix-page component. Fetches scan data and maps violations to WCAG/EN 301 549 criteria.
 */

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Grid3X3, FileText, ClipboardCheck, Globe } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { FeatureGate } from "@/components/ui/feature-gate";

const MatrixPage = lazy(() => import("@/app/compliance/matrix-page"));
const VpatPage = lazy(() => import("@/app/compliance/vpat/page"));
const StatementPage = lazy(() => import("@/app/statement/page"));
const JurisdictionsPage = lazy(() => import("@/app/compliance/jurisdictions-page"));

const tabs: Tab[] = [
  { id: "matrix", label: "WCAG Matrix", icon: Grid3X3 },
  { id: "jurisdictions", label: "Jurisdictions", icon: Globe },
  { id: "vpat", label: "VPAT / ACR", icon: ClipboardCheck },
  { id: "statement", label: "Statement", icon: FileText },
];

function ComplianceHub() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "matrix";

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("compliancePage.title")}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            {t("compliancePage.subtitle")}
          </p>
        </div>

        <TabNav tabs={tabs} basePath="/compliance" />

        <EmbeddedProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-900 rounded-full dark:border-neutral-600 dark:border-t-white" />
              </div>
            }
          >
            {activeTab === "matrix" && <MatrixPage />}
            {activeTab === "jurisdictions" && <JurisdictionsPage />}
            {activeTab === "vpat" && <VpatPage />}
            {activeTab === "statement" && <StatementPage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function CompliancePage() {
  return (
    <FeatureGate feature="compliance">
      <Suspense>
        <ComplianceHub />
      </Suspense>
    </FeatureGate>
  );
}
