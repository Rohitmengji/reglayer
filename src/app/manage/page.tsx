"use client";

import { Suspense, lazy } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TabNav, type Tab } from "@/components/ui/tab-nav";
import { EmbeddedProvider } from "@/components/layout/embedded-context";
import { Users, ClipboardList, Plug, Webhook } from "lucide-react";

const TeamPage = lazy(() => import("@/app/team/page"));
const AuditLogPage = lazy(() => import("@/app/audit-log/page"));
const IntegrationsPage = lazy(() => import("@/app/integrations/page"));
const WebhooksPage = lazy(() => import("@/app/webhooks/page"));

const tabs: Tab[] = [
  { id: "team", label: "Team", icon: Users },
  { id: "audit-log", label: "Audit Log", icon: ClipboardList },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
];

function ManageContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "team";

  return (
    <AppShell>
      <div className="flex flex-col gap-6 -mt-2">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Manage</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Team, integrations, webhooks, and audit trail
          </p>
        </div>

        <TabNav tabs={tabs} basePath="/manage" />

        <EmbeddedProvider>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-900 rounded-full dark:border-neutral-600 dark:border-t-white" />
              </div>
            }
          >
            {activeTab === "team" && <TeamPage />}
            {activeTab === "audit-log" && <AuditLogPage />}
            {activeTab === "integrations" && <IntegrationsPage />}
            {activeTab === "webhooks" && <WebhooksPage />}
          </Suspense>
        </EmbeddedProvider>
      </div>
    </AppShell>
  );
}

export default function ManageHub() {
  return (
    <Suspense>
      <ManageContent />
    </Suspense>
  );
}
