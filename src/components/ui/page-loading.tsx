"use client";

import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

interface PageLoadingProps {
  /** Friendly message shown below the spinner */
  message?: string;
}

/**
 * Consistent full-page loading spinner used across all pages.
 * Centers vertically within the page content area.
 */
export function PageLoading({ message = "Loading..." }: PageLoadingProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-neutral-500 dark:text-neutral-500" />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
    </div>
  );
}
