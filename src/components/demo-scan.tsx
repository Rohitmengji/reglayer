"use client";

import { useState } from "react";
import { Globe, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useConversionTracker } from "@/hooks/use-conversion-tracker";

interface DemoResult {
  score: number;
  url: string;
  totalViolations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  topViolations: { id: string; description: string; impact: string; count: number }[];
  pageTitle: string;
  scanDuration: number;
}

export function DemoScan() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState("");
  const { track } = useConversionTracker();

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      let scanUrl = url.trim();
      if (!scanUrl.startsWith("http")) scanUrl = `https://${scanUrl}`;
      track("demo_scan", { url: scanUrl });

      const res = await fetch("/api/demo-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scanUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Scan failed");
      } else {
        setResult(data);
        track("demo_scan_result", { url: scanUrl, score: data.score, violations: data.totalViolations });
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function getScoreColor(score: number) {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-yellow-500";
    return "text-red-500";
  }

  function getScoreRing(score: number) {
    if (score >= 90) return "border-green-500";
    if (score >= 70) return "border-yellow-500";
    return "border-red-500";
  }

  function getImpactColor(impact: string) {
    if (impact === "critical") return "bg-red-500/10 text-red-500 border-red-500/20";
    if (impact === "serious") return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (impact === "moderate") return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  }

  if (result) {
    return (
      <div className="mx-auto mt-10 max-w-2xl">
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 sm:p-8 text-left shadow-xl">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{result.url}</p>
              <p className="text-sm font-medium text-neutral-900 dark:text-white mt-0.5 truncate">
                {result.pageTitle || result.url}
              </p>
              <p className="text-xs text-neutral-400 mt-1">Scanned in {(result.scanDuration / 1000).toFixed(1)}s</p>
            </div>
            <div className={`shrink-0 flex items-center justify-center h-16 w-16 rounded-full border-4 ${getScoreRing(result.score)}`}>
              <span className={`text-xl font-bold ${getScoreColor(result.score)}`}>{result.score}</span>
            </div>
          </div>

          {/* Violation summary */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Critical", count: result.critical, color: "text-red-500" },
              { label: "Serious", count: result.serious, color: "text-orange-500" },
              { label: "Moderate", count: result.moderate, color: "text-yellow-500" },
              { label: "Minor", count: result.minor, color: "text-blue-500" },
            ].map((item) => (
              <div key={item.label} className="text-center rounded-lg bg-neutral-50 dark:bg-neutral-800 p-2">
                <p className={`text-lg font-bold ${item.color}`}>{item.count}</p>
                <p className="text-[10px] text-neutral-500">{item.label}</p>
              </div>
            ))}
          </div>

          {/* Top violations */}
          {result.topViolations.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Top Issues</p>
              <div className="space-y-2">
                {result.topViolations.slice(0, 3).map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-lg bg-neutral-50 dark:bg-neutral-800 px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${getImpactColor(v.impact)}`}>
                      {v.impact}
                    </span>
                    <span className="text-xs text-neutral-700 dark:text-neutral-300 truncate flex-1">{v.description}</span>
                    <span className="text-xs text-neutral-400 shrink-0">×{v.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/auth/login"
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              Sign up for full report
              <ArrowRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => { setResult(null); setUrl(""); }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Scan another
            </button>
          </div>

          <p className="text-[10px] text-neutral-400 text-center mt-4">
            {result.totalViolations} total violations found · Sign up to get AI fix suggestions, VPAT reports, and continuous monitoring
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-xl px-4 sm:px-0" data-tour="scan-input">
      <form onSubmit={handleScan} className="relative">
        <div className="flex items-center rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden focus-within:border-neutral-400 dark:focus-within:border-neutral-500 transition-colors">
          <Globe className="h-5 w-5 text-neutral-400 ml-3 sm:ml-4 shrink-0" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter website URL..."
            className="flex-1 min-w-0 px-2 sm:px-3 py-3.5 sm:py-4 text-sm bg-transparent text-neutral-900 dark:text-white placeholder:text-neutral-400 border-none outline-none shadow-none appearance-none"
            disabled={loading}
          />
          <button
            type="submit"
            aria-disabled={loading || !url.trim()}
            className={`mr-1.5 sm:mr-2 inline-flex items-center gap-1.5 sm:gap-2 rounded-lg px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              loading || !url.trim()
                ? "bg-neutral-900/80 dark:bg-white/80 text-white dark:text-neutral-900 cursor-not-allowed"
                : "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100"
            }`}
            onClick={(e) => { if (loading || !url.trim()) e.preventDefault(); }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="hidden sm:inline">Scanning...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>Scan Free</>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-3 flex items-center gap-2 justify-center text-sm text-red-500">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 text-center">
          <div className="inline-flex items-center gap-3 rounded-lg bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
            <span className="text-sm text-neutral-600 dark:text-neutral-300">Launching browser & scanning accessibility...</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400 text-center">
        No signup required · 3 free scans/hour · Results in under 30 seconds
      </p>
    </div>
  );
}
