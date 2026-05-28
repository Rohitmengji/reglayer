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
    <div className={cn("border-b border-neutral-200 dark:border-neutral-800", className)}>
      <nav className="-mb-px flex gap-1 overflow-x-auto px-1" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`${basePath}?tab=${tab.id}`}
              replace
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white bg-white dark:bg-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
              )}
            >
              {tab.icon && <tab.icon className="h-4 w-4" />}
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
