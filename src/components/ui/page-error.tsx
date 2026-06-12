"use client";

import { AlertCircle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

interface PageErrorProps {
  /** User-friendly error title */
  title?: string;
  /** User-friendly description — avoid technical jargon */
  message?: string;
  /** Retry callback — shows "Try again" button when provided */
  onRetry?: () => void;
  /** Where to redirect the user as a fallback (defaults to /dashboard) */
  fallbackHref?: string;
  /** Label for the fallback link */
  fallbackLabel?: string;
}

/**
 * Consistent full-page error display used across all pages.
 * Shows a friendly message with actionable next steps.
 * Never exposes internal error details to the user.
 */
export function PageError({
  title = "Something went wrong",
  message = "We couldn\u2019t load this page. Please try again or come back later.",
  onRetry,
  fallbackHref = "/dashboard",
  fallbackLabel = "Go to Dashboard",
}: PageErrorProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
          <AlertCircle className="h-7 w-7 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {title}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {message}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          {onRetry && (
            <Button size="sm" onClick={onRetry} className="gap-1.5 cursor-pointer">
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          )}
          <Link
            href={fallbackHref}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            <Home className="h-3.5 w-3.5" />
            {fallbackLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
