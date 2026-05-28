"use client";

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Grid3X3, FileText, ClipboardCheck } from "lucide-react";

const MatrixPage = lazy(() => import("@/app/compliance/matrix-page"));
const VpatPage = lazy(() => import("@/app/compliance/vpat/page"));
const StatementPage = lazy(() => import("@/app/statement/page"));

const tabs: Tab[] = [
  { id: "matrix", label: "WCAG Matrix", icon: Grid3X3 },
  { id: "vpat", label: "VPAT / ACR", icon: ClipboardCheck },
  { id: "statement", label: "Statement", icon: FileText },
];

function ComplianceHub() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "matrix";

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Compliance</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            WCAG conformance matrix, VPAT generation, and accessibility statements
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
    <Suspense>
      <ComplianceHub />
    </Suspense>
  );
}
