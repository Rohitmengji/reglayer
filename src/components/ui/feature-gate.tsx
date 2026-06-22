"use client";

/**
 * RegLayer — FeatureGate
 *
 * WHY: A plan-locked page should mount its real content only when the workspace
 *      is entitled — so an unentitled user (deep link, ⌘K, stale bookmark) gets
 *      the graceful UpgradeGate instead of a raw 403 or wasted data fetches.
 * WHAT: Wraps a page's inner component. While features resolve → spinner; if the
 *       plan lacks the feature → <UpgradeGate>; otherwise renders children.
 * HOW: Reads useFeatures() and the catalog's gateInfoForFeature(). Renders inside
 *       <AppShell> for the loading/locked states so the nav chrome stays; the
 *       children render their own shell (a passthrough when embedded in a hub).
 *
 * Usage:
 *   export default function ViolationsPage() {
 *     return <FeatureGate feature="violations"><ViolationsPageInner /></FeatureGate>;
 *   }
 */

import { AppShell } from "@/components/layout/app-shell";
import { PageLoading } from "@/components/ui/page-loading";
import { UpgradeGate } from "@/components/ui/upgrade-gate";
import { useFeatures } from "@/hooks/use-features";
import { gateInfoForFeature } from "@/lib/features/feature-catalog";

export function FeatureGate({ feature, children }: { feature: string; children: React.ReactNode }) {
  const { hasFeature, loading } = useFeatures();

  if (loading) {
    return (
      <AppShell>
        <PageLoading />
      </AppShell>
    );
  }

  if (!hasFeature(feature)) {
    const { name, requiredPlan } = gateInfoForFeature(feature);
    return (
      <AppShell>
        <UpgradeGate featureName={name} requiredPlan={requiredPlan} />
      </AppShell>
    );
  }

  return <>{children}</>;
}
