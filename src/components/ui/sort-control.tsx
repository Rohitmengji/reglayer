"use client";

/**
 * RegLayer — SortControl
 *
 * Compact "Sort by" control for list/card views (where there are no table
 * column headers to click). Pairs a key selector with a direction toggle.
 * Reusable across any list driven by the useSortable hook.
 */

import { useState, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, ChevronDown, Check } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeOption = options.find((o) => o.key === sortKey);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
          aria-expanded={open}
          aria-label={label}
        >
          <span className="text-neutral-500 dark:text-neutral-400">{label}:</span>
          <span className="font-medium">{activeOption?.label}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-1.5 min-w-40 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg shadow-neutral-200/50 dark:shadow-neutral-900/50 py-1.5 z-50">
            {options.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => { onChangeKey(opt.key); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                  sortKey === opt.key
                    ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                    : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
                }`}
              >
                <span>{opt.label}</span>
                {sortKey === opt.key && <Check className="ml-auto h-3.5 w-3.5 text-green-600" />}
              </button>
            ))}
          </div>
        )}
      </div>
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
