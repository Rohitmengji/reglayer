"use client";

/**
 * RegLayer — FeatureGate
 *
 * WHY: A plan-locked page should mount its real content only when the workspace
 *      is entitled — so an unentitled user (deep link, ⌘K, stale bookmark) gets
 *      the graceful UpgradeGate instead of a raw 403 or wasted data fetches.
 * WHAT: Wraps a page's inner component. While features resolve → spinner; if the
 *       lookup failed → retry (not an upsell); if the plan lacks the feature →
 *       <UpgradeGate>; otherwise renders children.
 * HOW: Reads useFeatures() and the catalog's gateInfoForFeature(). Renders inside
 *       <AppShell> for the loading/locked states so the nav chrome stays; the
 *       children render their own shell (a passthrough when embedded in a hub).
 *
 * Usage:
 *   export default function ViolationsPage() {
 *     return <FeatureGate feature="violations"><ViolationsPageInner /></FeatureGate>;
 *   }
 */

import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageLoading } from "@/components/ui/page-loading";
import { UpgradeGate } from "@/components/ui/upgrade-gate";
import { useFeatures } from "@/hooks/use-features";
import { gateInfoForFeature } from "@/lib/features/feature-catalog";

export function FeatureGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { hasFeature, loading, accessError, retryAccess } = useFeatures();

  if (loading) {
    return (
      <AppShell>
        <PageLoading />
      </AppShell>
    );
  }

  // Entitled (including the error-fallback base features) renders normally.
  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  // Not entitled AND the capability lookup failed: an outage, not a plan limit —
  // offer retry instead of a misleading upsell. Server authorization stays authoritative.
  if (accessError) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Couldn&apos;t check your plan access</h2>
          <p className="max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
            This is a temporary problem loading your workspace capabilities, not a change to your plan. Please try again.
          </p>
          <button
            onClick={retryAccess}
            className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Try again
          </button>
        </div>
      </AppShell>
    );
  }

  const { name, requiredPlan } = gateInfoForFeature(feature);
  return (
    <AppShell>
      <UpgradeGate featureName={name} requiredPlan={requiredPlan} />
    </AppShell>
  );
}
