"use client";

/**
 * RegLayer — Custom Compliance Rules results (scan detail)
 *
 * WHY: Enterprise workspaces define custom compliance policies; they need to see
 *      how each scan fares against them in-product, not only via the API.
 * WHAT: Fetches the scan's custom-rule evaluation and shows per-rule pass/fail.
 * HOW: Self-contained — renders nothing when the workspace has no enabled rules
 *      (non-Enterprise or none defined), so it never clutters a normal scan.
 */

import { useEffect, useState } from "react";
import { SlidersHorizontal, Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/components/i18n-provider";

interface RuleResult {
  id: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  detail: string;
}
interface Summary {
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
}

export function CustomRulesCard({ scanId }: { scanId: string }) {
  const { t } = useI18n();
  const [results, setResults] = useState<RuleResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/scans/${scanId}/custom-rules`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setResults(d.results ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  // Render nothing unless this workspace actually has enabled custom rules.
  if (!loaded || results.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-neutral-500" aria-hidden="true" />
            {t("scanDetail.customRules")}
          </CardTitle>
          {summary && (
            <Badge variant={summary.allPassed ? "success" : "critical"}>
              {t("scanDetail.customRulesSummary", { passed: String(summary.passed), total: String(summary.total) })}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {results.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-800 p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {r.passed ? (
                    <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                  ) : (
                    <X className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
                  )}
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">{r.name}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{r.detail}</p>
              </div>
              <Badge variant={r.passed ? "success" : "critical"} className="shrink-0">
                {r.passed ? t("scanDetail.rulePass") : t("scanDetail.ruleFail")}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
