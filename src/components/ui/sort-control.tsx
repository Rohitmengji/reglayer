"use client";

/**
 * RegLayer — SortControl
 *
 * Compact "Sort by" control for list/card views (where there are no table
 * column headers to click). Pairs a key selector with a direction toggle.
 * Reusable across any list driven by the useSortable hook.
 */

import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { SortDir } from "@/hooks/use-sortable";

export interface SortOption {
  key: string;
  label: string;
}

interface SortControlProps {
  options: SortOption[];
  sortKey: string;
  sortDir: SortDir;
  onChangeKey: (key: string) => void;
  onToggleDir: () => void;
  label?: string;
}

export function SortControl({
  options,
  sortKey,
  sortDir,
  onChangeKey,
  onToggleDir,
  label = "Sort by",
}: SortControlProps) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="sort-control-select">
        {label}
      </label>
      <select
        id="sort-control-select"
        value={sortKey}
        onChange={(e) => onChangeKey(e.target.value)}
        className="appearance-none rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {label}: {opt.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggleDir}
        aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
        title={sortDir === "asc" ? "Ascending" : "Descending"}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        )}
      >
        {sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </button>
    </div>
  );
}
