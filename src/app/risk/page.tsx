/**
 * RegLayer — Litigation Risk Page
 *
 * WHY: Executives and legal teams need a clear view of lawsuit exposure.
 * WHAT: Full risk dashboard with score gauge, breakdown, context form, and trend.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";
import { RiskScoreBadge } from "@/components/risk/RiskScoreBadge";
import { RiskBreakdownCard } from "@/components/risk/RiskBreakdownCard";
import { RiskContextForm } from "@/components/risk/RiskContextForm";
import { RiskDisclaimer } from "@/components/risk/RiskDisclaimer";

interface RiskScore {
  finalScore: number;
  baseScore: number;
  tier: string;
  industry: string;
  primaryGeo: string;
  estimatedExposure: number;
  topRiskFactors: Array<{ ruleId: string; count: number; contribution: number; reason: string }>;
  violationBreakdown: Array<{ ruleId: string; count: number; contribution: number; avgSettlement: number }>;
  narrative: string;
  calculatedAt: string;
}

export default function RiskPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const siteId = searchParams.get("siteId");
  const [score, setScore] = useState<RiskScore | null>(null);
  const [loading, setLoading] = useState(!!siteId);
  const [error, setError] = useState<string | null>(
    siteId ? null : "No site selected. Please select a site from your dashboard."
  );

  const loadRisk = useCallback(async () => {
    if (!siteId) {
      setError("No site selected. Please select a site from your dashboard.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/sites/${siteId}/risk`);
      if (!res.ok) throw new Error("Failed to load risk score");
      const data = await res.json();
      setScore(data.score || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    fetch(`/api/sites/${siteId}/risk`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load risk score");
        return res.json();
      })
      .then((data) => setScore(data.score || null))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t("risk.title")}</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">
          {t("risk.subtitle")}
        </p>
      </div>

      {!score ? (
        <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-6">
          <p className="text-zinc-600 dark:text-zinc-400">
            No risk score calculated yet. Run a scan and configure your industry context below.
          </p>
          {siteId && (
            <RiskContextForm
              siteId={siteId}
              onRecalculated={() => { setLoading(true); loadRisk(); }}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Score Gauge */}
          <div className="lg:col-span-1 flex flex-col items-center justify-start pt-4">
            <RiskScoreBadge score={score.finalScore} tier={score.tier} />
            <div className="mt-4 text-center">
              <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                ${score.estimatedExposure.toLocaleString()}
              </p>
              <p className="text-xs text-zinc-500">{t("risk.exposure")}</p>
            </div>
            <RiskDisclaimer />
          </div>

          {/* Breakdown + Form */}
          <div className="lg:col-span-2 space-y-6">
            <RiskBreakdownCard
              topRiskFactors={score.topRiskFactors}
              narrative={score.narrative}
              estimatedExposure={score.estimatedExposure}
              violationBreakdown={score.violationBreakdown}
              siteId={siteId}
            />
            {siteId && (
              <RiskContextForm
                siteId={siteId}
                currentIndustry={score.industry}
                currentGeo={score.primaryGeo}
                lastCalculated={score.calculatedAt}
                onRecalculated={() => { setLoading(true); loadRisk(); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
