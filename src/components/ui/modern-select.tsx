"use client";

import { useState, useRef, useEffect, useId } from "react";
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
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef<{ query: string; timer: ReturnType<typeof setTimeout> | null }>({
    query: "",
    timer: null,
  });
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const optionId = (i: number) => `${baseId}-option-${i}`;
  const activeOption = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // When opening, focus the currently-selected option (or first).
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: seed the focused option when the listbox opens
      setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [open, selectedIndex]);

  // Keep the focused option scrolled into view.
  useEffect(() => {
    if (!open || focusedIndex < 0) return;
    const el = listRef.current?.querySelector(`#${CSS.escape(`${baseId}-option-${focusedIndex}`)}`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, focusedIndex, baseId]);

  function closeAndRestore() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function selectIndex(i: number) {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    closeAndRestore();
  }

  function handleTypeahead(char: string) {
    const ta = typeaheadRef.current;
    if (ta.timer) clearTimeout(ta.timer);
    ta.query += char.toLowerCase();
    const match = options.findIndex((o) => o.label.toLowerCase().startsWith(ta.query));
    if (match >= 0) setFocusedIndex(match);
    ta.timer = setTimeout(() => {
      ta.query = "";
    }, 500);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (focusedIndex >= 0) selectIndex(focusedIndex);
        break;
      case "Escape":
        e.preventDefault();
        closeAndRestore();
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          handleTypeahead(e.key);
        }
    }
  }

  return (
    <div className={cn("relative", className)} ref={ref}>
      {label && (
        <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 rounded-xl border bg-white dark:bg-neutral-900 px-3.5 py-2.5 text-sm shadow-sm transition-all",
          "hover:bg-neutral-50 dark:hover:bg-neutral-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent",
          open ? "border-accent ring-2 ring-accent/30" : "border-neutral-200 dark:border-neutral-700"
        )}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && focusedIndex >= 0 ? optionId(focusedIndex) : undefined}
      >
        <span className={cn("truncate", activeOption ? "font-medium text-neutral-900 dark:text-white" : "text-neutral-400")}>
          {activeOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180 text-accent" : ""}`}
        />
      </button>
      {open && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={label ?? placeholder}
          className="absolute left-0 top-full mt-1 w-full min-w-0 sm:min-w-40 max-h-60 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1.5 shadow-xl shadow-neutral-300/40 dark:shadow-black/60 ring-1 ring-black/5 dark:ring-white/10 z-50 overscroll-contain"
        >
          {options.map((opt, i) => {
            const isSelected = value === opt.value;
            const isFocused = i === focusedIndex;
            return (
              <div
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectIndex(i)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  isSelected
                    ? "bg-accent/10 text-accent font-medium"
                    : isFocused
                      ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-white"
                      : "text-neutral-600 dark:text-neutral-400"
                )}
              >
                <span className="flex-1 text-left truncate">{opt.label}</span>
                {isSelected && (
                  <Check className="h-4 w-4 text-accent shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
