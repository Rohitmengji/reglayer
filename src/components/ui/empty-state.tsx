"use client";

/**
 * RegLayer — Empty State Component
 *
 * Reusable empty state with icon, title, description, and CTA button.
 * Used across pages when users have no data yet (scans, violations, team).
 */

import Link from "next/link";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
  tips?: string[];
}

export function EmptyState({
  icon: Icon,
  iconColor = "text-neutral-400",
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  secondaryLabel,
  secondaryHref,
  tips,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Icon */}
      <div className="relative mb-6">
        <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-neutral-100 dark:bg-neutral-800 ring-8 ring-neutral-50 dark:ring-neutral-900">
          <Icon className={`h-9 w-9 ${iconColor}`} />
        </div>
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
          <span className="text-[10px]">✨</span>
        </div>
      </div>

      {/* Text */}
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
        {title}
      </h3>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 max-w-sm leading-relaxed mb-6">
        {description}
      </p>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        {actionLabel && actionHref && (
          <Link
            href={actionHref}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
          >
            {actionLabel}
          </Link>
        )}
        {actionLabel && onAction && !actionHref && (
          <button
            onClick={onAction}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-sm"
          >
            {actionLabel}
          </button>
        )}
        {secondaryLabel && secondaryHref && (
          <Link
            href={secondaryHref}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-750 transition-colors"
          >
            {secondaryLabel}
          </Link>
        )}
      </div>

      {/* Tips */}
      {tips && tips.length > 0 && (
        <div className="mt-8 w-full max-w-sm">
          <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-3">
            Getting Started
          </p>
          <div className="space-y-2 text-left">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 px-3 py-2.5">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-bold text-neutral-600 dark:text-neutral-400 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {tip}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
