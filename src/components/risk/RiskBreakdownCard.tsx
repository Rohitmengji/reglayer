/**
 * RegLayer — Risk Breakdown Card
 *
 * WHY: Shows what's driving the risk score with actionable detail.
 * WHAT: Top risk factors, per-rule bars, narrative, and financial exposure.
 */

"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { formatExposure } from "@/lib/risk/litigationWeights";

interface RiskFactor {
  ruleId: string;
  count: number;
  contribution: number;
  reason: string;
}

interface RiskBreakdownCardProps {
  topRiskFactors: RiskFactor[];
  narrative: string;
  estimatedExposure: number;
  violationBreakdown: Array<{ ruleId: string; count: number; contribution: number }>;
  /** Site whose defense file can be generated. When absent, the action is hidden. */
  siteId?: string | null;
}

export function RiskBreakdownCard({
  topRiskFactors,
  narrative,
  estimatedExposure,
  violationBreakdown,
  siteId,
}: RiskBreakdownCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [defenseError, setDefenseError] = useState<string | null>(null);
  const maxContribution = Math.max(...violationBreakdown.map((v) => v.contribution), 1);

  async function handleGenerateDefenseFile() {
    if (!siteId || generating) return;
    setGenerating(true);
    setDefenseError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/defense-file`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "html" }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => ""));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "RegLayer-Defense-File.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDefenseError(t("risk.defenseFileFailed"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Risk Breakdown</h3>

      {/* Top Risk Factors */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Top Risk Factors</h4>
        {topRiskFactors.map((factor, i) => (
          <div key={factor.ruleId} className="flex items-start gap-3 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-800">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 flex items-center justify-center text-xs font-bold">
              {i + 1}
            </span>
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {factor.ruleId} ({factor.count} instance{factor.count > 1 ? "s" : ""})
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{factor.reason}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Violation Breakdown Bars */}
      <div className="space-y-1.5">
        <h4 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Per-Rule Risk Contribution</h4>
        {violationBreakdown.slice(0, 6).map((item) => (
          <div key={item.ruleId} className="flex items-center gap-2">
            <span className="text-xs text-zinc-500 w-40 truncate font-mono">{item.ruleId}</span>
            <div className="flex-1 h-3 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${(item.contribution / maxContribution) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400 w-8 text-right">{item.count}</span>
          </div>
        ))}
      </div>

      {/* Narrative */}
      <div className="pt-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">{narrative}</p>
      </div>

      {/* Financial Exposure */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        {expanded ? "Hide" : "What this means"} — Financial Exposure
      </button>
      {expanded && (
        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-2xl font-bold text-red-700 dark:text-red-300">
            {formatExposure(estimatedExposure)}
          </p>
          <p className="text-xs text-red-600 dark:text-red-400 mt-1">
            Estimated legal exposure based on violation profile × industry × geography multipliers.
            Actual exposure depends on jurisdiction, entity size, and litigation history.
          </p>
        </div>
      )}

      {/* Litigation Defense File */}
      {siteId && (
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            onClick={handleGenerateDefenseFile}
            disabled={generating}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
          >
            {generating ? t("risk.generatingDefenseFile") : t("risk.generateDefenseFile")}
          </button>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
            {t("risk.defenseFileDescription")}
          </p>
          {defenseError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">
              {defenseError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
