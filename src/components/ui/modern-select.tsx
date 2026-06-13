"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface ModernSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function ModernSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  className,
}: ModernSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={ref}>
      {label && (
        <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all"
        aria-expanded={open}
      >
        <span className={activeOption ? "" : "text-neutral-400"}>
          {activeOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-full min-w-40 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg shadow-neutral-200/50 dark:shadow-neutral-900/50 py-1.5 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                value === opt.value
                  ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white font-medium"
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <span className="flex-1 text-left">{opt.label}</span>
              {value === opt.value && (
                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
