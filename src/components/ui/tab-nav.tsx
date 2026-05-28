"use client";

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
  const activeTab = searchParams.get("tab") || tabs[0]?.id;

  return (
    <div
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
            className={cn(
              "flex items-center justify-center sm:justify-start gap-2 px-2 py-3 sm:px-4 sm:py-2.5 text-sm font-medium transition-colors relative",
              isActive
                ? "text-neutral-900 dark:text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-neutral-900 after:dark:bg-white after:rounded-full"
                : "text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-white"
            )}
            title={tab.label}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
