/**
 * RegLayer — Demand-Letter Triage page
 *
 * WHY: Paste an ADA demand letter and get an evidence-grounded, per-claim rebuttal +
 *      exposure-delta, downloaded as a self-contained HTML dossier.
 * WHAT: Thin client over POST /api/sites/[siteId]/demand-letter (reads siteId from the
 *       ?siteId= query string, like the risk page). The rich report is the downloadable
 *       HTML, so the page itself stays minimal.
 */

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n-provider";

export default function DemandLetterPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const siteId = searchParams.get("siteId");
  const [letterText, setLetterText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!siteId || !letterText.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/demand-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterText, format: "html" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || t("demandLetter.failed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "RegLayer-Demand-Letter-Rebuttal.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("demandLetter.failed"));
    } finally {
      setLoading(false);
    }
  }

  if (!siteId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-amber-800 dark:text-amber-300">{t("demandLetter.noSite")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{t("demandLetter.title")}</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mt-1">{t("demandLetter.subtitle")}</p>
      </div>

      <label className="block">
        <span className="sr-only">{t("demandLetter.title")}</span>
        <textarea
          value={letterText}
          onChange={(e) => setLetterText(e.target.value)}
          rows={14}
          placeholder={t("demandLetter.letterPlaceholder")}
          className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      <button
        onClick={handleAnalyze}
        disabled={loading || !letterText.trim()}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium"
      >
        {loading ? t("demandLetter.analyzing") : t("demandLetter.analyze")}
      </button>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
