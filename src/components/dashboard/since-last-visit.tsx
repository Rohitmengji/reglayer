"use client";

/**
 * RegLayer — "Since your last visit" summary
 *
 * WHY: Orient a returning user instantly — what changed since they were last on
 * the dashboard.
 *
 * WHAT: A dismissible banner summarizing new completed scans, critical issues,
 * and workspace activity since the last dashboard visit. Reuses the read-only
 * notification feed (useNotifications); renders nothing when there's nothing new.
 *
 * HOW: Compares feed items against a localStorage `last-visit` timestamp,
 * snapshots once after the feed loads, then advances the timestamp.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { useNotifications } from "@/hooks/use-notifications";

const LAST_VISIT_KEY = "reglayer-dashboard-last-visit";

function readLastVisit(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LAST_VISIT_KEY);
    return raw ? Date.parse(raw) : 0;
  } catch {
    return 0;
  }
}

export function SinceLastVisit() {
  const { t } = useI18n();
  const { items } = useNotifications();
  // Capture the previous visit timestamp ONCE (before we advance it below).
  const [lastVisit] = useState(readLastVisit);
  const [dismissed, setDismissed] = useState(false);

  // Advance the stored timestamp on mount — a side effect, not a state update.
  useEffect(() => {
    try {
      window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
  }, []);

  const counts = useMemo(() => {
    // First-ever visit (no stored timestamp) shows nothing — avoids a noisy debut.
    if (lastVisit <= 0) return null;
    const fresh = items.filter((i) => Date.parse(i.createdAt) > lastVisit);
    if (fresh.length === 0) return null;
    return {
      scan: fresh.filter((i) => i.type === "scan").length,
      violation: fresh.filter((i) => i.type === "violation").length,
      activity: fresh.filter((i) => i.type === "activity").length,
    };
  }, [items, lastVisit]);

  if (!counts || dismissed) return null;

  const parts: string[] = [];
  if (counts.scan > 0) parts.push(`${counts.scan} scan${counts.scan === 1 ? "" : "s"} completed`);
  if (counts.violation > 0)
    parts.push(`${counts.violation} new critical issue${counts.violation === 1 ? "" : "s"}`);
  if (counts.activity > 0)
    parts.push(`${counts.activity} workspace update${counts.activity === 1 ? "" : "s"}`);
  if (parts.length === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 dark:border-accent/30">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          {t("sinceLastVisit.title")}
        </p>
        <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
          {parts.join(" · ")}
        </p>
      </div>
      <Link
        href="/audit-log"
        className="shrink-0 text-xs font-medium text-accent hover:underline"
      >
        {t("sinceLastVisit.viewAll")}
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label={t("sinceLastVisit.dismiss")}
        className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
