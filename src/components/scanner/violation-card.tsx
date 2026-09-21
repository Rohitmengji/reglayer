"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Violation Card Component
 * ---------------------------------------------------------
 *
 * WHY: Each accessibility violation needs a clear, actionable
 * display that developers can understand and act on.
 *
 * WHAT:
 * - Rule name and description
 * - Impact badge (critical/serious/moderate/minor) with color
 * - WCAG criteria tags
 * - Affected element count + HTML snippets / failure summaries
 * - Link to axe-core documentation
 * - "Track status" deep-link to the /violations triage surface, where
 *   remediation status is actually managed (the canonical, DB-backed
 *   workflow with note-required exceptions, bulk actions, and history).
 *
 * HOW:
 * - Receives AccessibilityViolation as prop (scanner output — no DB status)
 * - Impact badge uses color-coded Badge component
 * - Code blocks rendered in monospace for HTML snippets
 * ---------------------------------------------------------
 */

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AccessibilityViolation } from "@/lib/types";
import { AlertTriangle, ExternalLink, ArrowRight } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { analyzeContrastViolation } from "@/lib/a11y/contrast-violation";
import { analyzeLangTagViolation, LANG_VALIDITY_RULES } from "@/lib/a11y/lang-tag-violation";
import Link from "next/link";

interface ViolationCardProps {
  violation: AccessibilityViolation;
  /** When provided, the "Track status" link deep-links to this scan's triage view. */
  scanId?: string;
}

export function ViolationCard({ violation, scanId }: ViolationCardProps) {
  const { t } = useI18n();
  const contrastFix = violation.id === "color-contrast"
    ? violation.nodes.map((node) => analyzeContrastViolation(node.failureSummary)).find((fix) => fix?.report.suggestion?.meetsTarget)
    : null;
  const langFix = LANG_VALIDITY_RULES.has(violation.id)
    ? violation.nodes.map((node) => analyzeLangTagViolation(node.html)).find(Boolean)
    : null;

  const renderNode = (node: AccessibilityViolation["nodes"][number], index: number) => (
    <div key={index} className="min-w-0 rounded-md bg-neutral-50 dark:bg-neutral-800 p-2 text-xs space-y-1">
      <p className="font-mono break-all text-neutral-700 dark:text-neutral-300">{node.target.join(" ")}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all text-neutral-700 dark:text-neutral-300"><code>{node.html}</code></pre>
      {node.failureSummary && <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-line">{node.failureSummary}</p>}
    </div>
  );
  return (
    <Card className="border-l-4 border-l-transparent" style={{
      borderLeftColor: getImpactColor(violation.impact),
    }}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: getImpactColor(violation.impact) }}
            />
            <div>
              <CardTitle className="text-sm font-medium">
                {violation.help}
              </CardTitle>
              <p className="mt-1 text-xs text-neutral-500">
                {violation.description}
              </p>
            </div>
          </div>
          <Badge variant={violation.impact}>
            {violation.impact}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* WCAG Tags */}
        <div className="mb-3 flex flex-wrap gap-1">
          {violation.wcagTags.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Affected Nodes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
            {t("violationCard.affectedElements", { count: String(violation.nodes.length) })}
          </p>
          {violation.nodes.slice(0, 3).map(renderNode)}
          {violation.nodes.length > 3 && (
            <details className="space-y-2">
              <summary className="cursor-pointer py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">{t("violationCard.moreElements", { count: String(violation.nodes.length - 3) })}</summary>
              {violation.nodes.slice(3).map(renderNode)}
            </details>
          )}
        </div>

        {contrastFix?.report.suggestion && <div className="mt-3 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          <p className="font-medium">Suggested color correction</p>
          <p>Foreground <code>{contrastFix.foreground}</code> to <code>{contrastFix.report.suggestion.recommended.hex}</code> on <code>{contrastFix.background}</code>: {contrastFix.report.suggestion.recommended.ratio}:1 contrast.</p>
          <p className="text-xs">Calculated from the captured colors. Check all interaction states, then re-scan to verify.</p>
        </div>}
        {langFix && <div className="mt-3 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
          <p className="font-medium">Suggested language tag correction</p>
          <p><code>{langFix.value}</code> to <code>{langFix.suggestion}</code>. Confirm it matches the content language, then re-scan.</p>
        </div>}

        {/* Help Link + Track status */}
        <div className="mt-3 flex items-center justify-between">
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            {t("violationCard.learnMore")}
            <ExternalLink className="h-3 w-3" />
          </a>
          <Link
            href={scanId ? `/violations?scanId=${encodeURIComponent(scanId)}` : "/violations"}
            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          >
            {t("violationCard.trackStatus")}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function getImpactColor(impact: string): string {
  switch (impact) {
    case "critical":
      return "#dc2626";
    case "serious":
      return "#ea580c";
    case "moderate":
      return "#ca8a04";
    case "minor":
      return "#2563eb";
    default:
      return "#6b7280";
  }
}
