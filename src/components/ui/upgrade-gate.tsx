"use client";

/**
 * RegLayer — UpgradeGate
 *
 * WHY: When a workspace's plan doesn't include a feature, a normal user should
 *      see a clear, conversion-friendly "upgrade to unlock" state — never an
 *      empty screen or a raw 403 error. This is the single, consistent locked
 *      state used across gated pages, hubs, and 403 fallbacks.
 * WHAT: A centered panel with a lock mark, a plain-English explanation of which
 *       plan unlocks the feature, a primary "Upgrade" CTA → /pricing, and a
 *       low-key escape back to the dashboard.
 * HOW: Pure presentational + i18n. Callers pass the human feature name and the
 *       lowest plan that unlocks it (see gateInfoForFeature in feature-catalog
 *       for the id→{name,plan} mapping).
 */

import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/components/i18n-provider";

// Plan display names are brand terms (kept as-is across locales).
const PLAN_NAME: Record<"PRO" | "ENTERPRISE", string> = { PRO: "Pro", ENTERPRISE: "Enterprise" };

interface UpgradeGateProps {
  /** Human-readable feature/area name, e.g. "Reports" or "Violations Manager". */
  featureName: string;
  /** Lowest plan that unlocks it. */
  requiredPlan: "PRO" | "ENTERPRISE";
  className?: string;
}

export function UpgradeGate({ featureName, requiredPlan, className }: UpgradeGateProps) {
  const { t } = useI18n();
  const plan = PLAN_NAME[requiredPlan];

  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center min-h-[50vh]", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
        <Lock className="h-6 w-6 text-accent" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-neutral-900 dark:text-white">
        {t("upgrade.lockedTitle", { feature: featureName, plan })}
      </h2>
      <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
        {t("upgrade.lockedDesc", { feature: featureName, plan })}
      </p>
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
        <Link href="/pricing" className={cn(buttonVariants(), "gap-1.5")}>
          {t("upgrade.cta", { plan })}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
        <Link
          href="/dashboard"
          className="text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
        >
          {t("upgrade.backToDashboard")}
        </Link>
      </div>
    </div>
  );
}
