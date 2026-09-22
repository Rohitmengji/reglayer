"use client";

/**
 * RegLayer — Tab Navigation Component
 *
 * WHY: Multiple pages use tabbed interfaces to organize related content.
 * WHAT: Horizontal tab bar with active indicator. Controls which content panel is visible.
 * HOW: Client-side state management. Renders tabs from array of { label, value } props.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export interface Tab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface TabNavProps {
  tabs: Tab[];
  basePath: string;
  className?: string;
}

/**
 * Resolve the active tab id from a raw URL value. Honors only ids present in
 * `tabs` (feature-gated hubs filter their lists) and otherwise falls back to the
 * first tab. Shared by TabNav (highlight) and hub pages (content) so an unknown
 * `?tab` value can never highlight one tab while rendering no panel.
 */
export function resolveActiveTab(tabs: Tab[], requested: string | null | undefined): string | undefined {
  if (requested && tabs.some((t) => t.id === requested)) return requested;
  return tabs[0]?.id;
}

export function TabNav({ tabs, basePath, className }: TabNavProps) {
  const searchParams = useSearchParams();
  // Keeps the highlighted tab in sync with the panel the hub renders.
  const activeTab = resolveActiveTab(tabs, searchParams.get("tab"));

  // Preserve any non-tab query params (scan id, filters) when switching tabs.
  const hrefFor = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    return `${basePath}?${params.toString()}`;
  };

  return (
    // Route-based tabs are navigation: a labeled <nav> landmark + aria-current on
    // the active link is the correct, screen-reader-friendly pattern (not an
    // in-page tablist, which would imply arrow-key panel switching).
    <nav
      aria-label="Section tabs"
      className={cn(
        "flex flex-wrap gap-1 border-b border-neutral-200 dark:border-neutral-700 pb-px",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={hrefFor(tab.id)}
            scroll={false}
            aria-current={isActive ? "page" : undefined}
            aria-label={tab.label}
            className={cn(
              "flex min-h-11 max-w-full items-center justify-center sm:justify-start gap-2 px-2 py-3 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors relative",
              isActive
                ? "text-neutral-900 dark:text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-neutral-900 after:dark:bg-white after:rounded-full"
                : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
            )}
            title={tab.label}
          >
            {tab.icon && <tab.icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
            <span className="break-words">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
