"use client";

/**
 * RegLayer — "← Accessibility Tools" back-link for the individual /tools/* pages.
 * Gives each tool a one-click route back to the hub (previously only reachable
 * via the footer).
 */
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function ToolsBackLink() {
  const { t } = useI18n();
  return (
    <Link
      href="/tools"
      className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("tools.hub.title")}
    </Link>
  );
}
