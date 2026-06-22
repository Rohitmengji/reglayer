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

export function TabNav({ tabs, basePath, className }: TabNavProps) {
  const searchParams = useSearchParams();
  // Honor the URL ?tab only when it names a tab actually present in the list
  // (feature-gated hubs filter their tabs); otherwise fall back to the first.
  // This keeps the highlighted tab in sync with the panel the hub renders.
  const requested = searchParams.get("tab");
  const activeTab = tabs.some((t) => t.id === requested) ? requested : tabs[0]?.id;

  return (
    // Route-based tabs are navigation: a labeled <nav> landmark + aria-current on
    // the active link is the correct, screen-reader-friendly pattern (not an
    // in-page tablist, which would imply arrow-key panel switching).
    <nav
      aria-label="Section tabs"
      className={cn(
        "grid sm:flex sm:gap-1 border-b border-neutral-200 dark:border-neutral-700 pb-px",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={`${basePath}?tab=${tab.id}`}
            replace
            aria-current={isActive ? "page" : undefined}
            // The label is `hidden sm:inline`, so on mobile the link is icon-only
            // with no accessible name — aria-label gives it one at every width.
            aria-label={tab.label}
            className={cn(
              "flex items-center justify-center sm:justify-start gap-2 px-2 py-3 sm:px-4 sm:py-2.5 text-sm font-medium transition-colors relative",
              isActive
                ? "text-neutral-900 dark:text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-neutral-900 after:dark:bg-white after:rounded-full"
                : "text-neutral-500 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
            )}
            title={tab.label}
          >
            {tab.icon && <tab.icon className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
