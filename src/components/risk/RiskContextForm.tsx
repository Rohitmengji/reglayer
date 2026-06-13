/**
 * RegLayer — Risk Context Form
 *
 * WHY: Users set industry + geography for accurate risk calculation.
 * WHAT: Form to select industry and geography, trigger recalculation.
 */

"use client";

import { useState } from "react";
import { ModernSelect } from "@/components/ui/modern-select";
import { useI18n } from "@/components/i18n-provider";

const INDUSTRIES = [
  { value: "ecommerce", label: "E-Commerce" },
  { value: "restaurant", label: "Restaurant / Food" },
  { value: "healthcare", label: "Healthcare" },
  { value: "financial", label: "Financial Services" },
  { value: "education", label: "Education" },
  { value: "government", label: "Government" },
  { value: "hospitality", label: "Hospitality" },
  { value: "saas", label: "SaaS / Technology" },
  { value: "other", label: "Other" },
];

const GEOGRAPHIES = [
  { value: "NY", label: "New York" },
  { value: "CA", label: "California" },
  { value: "FL", label: "Florida" },
  { value: "TX", label: "Texas" },
  { value: "EU", label: "European Union" },
  { value: "other", label: "Other" },
];

interface RiskContextFormProps {
  siteId: string;
  currentIndustry?: string;
  currentGeo?: string;
  lastCalculated?: string;
  onRecalculated?: () => void;
}

export function RiskContextForm({
  siteId,
  currentIndustry,
  currentGeo,
  lastCalculated,
  onRecalculated,
}: RiskContextFormProps) {
  const { t } = useI18n();
  const [industry, setIndustry] = useState(currentIndustry || "other");
  const [primaryGeo, setPrimaryGeo] = useState(currentGeo || "other");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/risk/recalculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry, primaryGeo }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Recalculation failed");
      }
      onRecalculated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-6 space-y-4">
      <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Risk Context</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="industry" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Industry
          </label>
          <ModernSelect
              options={INDUSTRIES}
              value={industry}
              onChange={setIndustry}
            />
        </div>
        <div>
          <label htmlFor="geography" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Primary Geography
          </label>
          <ModernSelect
              options={GEOGRAPHIES}
              value={primaryGeo}
              onChange={setPrimaryGeo}
            />
        </div>
      </div>

      {lastCalculated && (
        <p className="text-xs text-zinc-500">
          Last calculated: {new Date(lastCalculated).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        onClick={handleRecalculate}
        disabled={loading}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? "Calculating..." : "Recalculate Risk"}
      </button>
    </div>
  );
}
