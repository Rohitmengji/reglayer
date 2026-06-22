"use client";

/**
 * RegLayer — Jurisdictions Tab (Multi-Jurisdiction Compliance)
 *
 * WHY: Enterprises serve multiple regions and face simultaneous compliance requirements.
 * WHAT: Evaluate a scan against ADA, EAA, Section 508, AODA simultaneously with confidence scoring.
 * HOW: Calls POST /api/compliance/report → displays per-jurisdiction cards with status + confidence.
 */

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
  TrendingUp,
} from "lucide-react";
import { JURISDICTIONS, JURISDICTION_IDS, type JurisdictionId } from "@/lib/compliance/jurisdictions";
import type { EvaluatorOutput, JurisdictionResult } from "@/lib/compliance/evaluator";

interface ScanOption {
  id: string;
  url: string;
  score: number | null;
  createdAt: string;
}

export default function JurisdictionsPage() {
  const searchParams = useSearchParams();
  const urlScanId = searchParams.get("scan");

  const [scans, setScans] = useState<ScanOption[]>([]);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(urlScanId);
  const [loading, setLoading] = useState(false);
  const [scansLoading, setScansLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluatorOutput | null>(null);

  // Load available scans
  useEffect(() => {
    fetch("/api/scans?limit=20")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        const scanList = (data.scans ?? []).map((s: { id: string; url: string; score: number | null; createdAt: string }) => ({
          id: s.id, url: s.url, score: s.score, createdAt: s.createdAt,
        }));
        setScans(scanList);
        if (!selectedScanId && scanList.length > 0) {
          setSelectedScanId(scanList[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setScansLoading(false));
  }, []);

  async function handleGenerate() {
    if (!selectedScanId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/compliance/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: selectedScanId, jurisdictions: ["ADA", "EAA", "SECTION508", "AODA"] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate report");
      setEvaluation(data.evaluation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate compliance report. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (scansLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400 mr-3" />
        <span className="text-sm text-neutral-500">Loading scans...</span>
      </div>
    );
  }

  if (scans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Globe className="h-12 w-12 text-neutral-300 dark:text-neutral-600 mb-4" />
        <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">No scans available</h3>
        <p className="text-sm text-neutral-500 mt-1 max-w-md">Run an accessibility scan first, then come back to evaluate multi-jurisdiction compliance.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Generate button */}
      {!evaluation && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-8 flex flex-col items-center text-center">
            <Globe className="h-10 w-10 text-blue-500 mb-4" />
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Multi-Jurisdiction Compliance Report</h3>
            <p className="text-sm text-neutral-500 mt-2 max-w-lg">
              Evaluate this scan against ADA, EAA (European Accessibility Act), Section 508, and AODA simultaneously.
            </p>

            {/* Scan selector */}
            <div className="mt-4 w-full max-w-md">
              <label htmlFor="jurisdiction-scan-select" className="sr-only">Select scan</label>
              <select
                id="jurisdiction-scan-select"
                value={selectedScanId ?? ""}
                onChange={(e) => setSelectedScanId(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {scans.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.url} — Score: {s.score ?? "N/A"} — {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handleGenerate} className="mt-4" size="lg" disabled={!selectedScanId}>
              <Shield className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-3" />
          <span className="text-sm text-neutral-500">Evaluating across 4 jurisdictions...</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50">
          <CardContent className="p-4 flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            <Button variant="outline" size="sm" onClick={handleGenerate} className="ml-auto shrink-0">Retry</Button>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {evaluation && (
        <>
          {/* Overall confidence */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-neutral-500" />
              <span className="text-sm text-neutral-500">Overall confidence:</span>
              <Badge variant="outline" className="font-bold">{evaluation.overallConfidence}%</Badge>
            </div>
            <span className="text-xs text-neutral-400">Evaluated {new Date(evaluation.evaluatedAt).toLocaleDateString()}</span>
          </div>

          {/* Jurisdiction cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {JURISDICTION_IDS.map((jId) => {
              const result = evaluation.jurisdictions[jId];
              if (!result) return null;
              return <JurisdictionCard key={jId} result={result} />;
            })}
          </div>

          {/* Cross-jurisdiction risks */}
          {evaluation.crossJurisdictionRisks.length > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Cross-Jurisdiction Risks ({evaluation.crossJurisdictionRisks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {evaluation.crossJurisdictionRisks.map((risk) => (
                  <div key={risk.criterion} className="flex items-start gap-2 text-sm">
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-300 shrink-0">{risk.criterion}</span>
                    <span className="text-neutral-600 dark:text-neutral-400">{risk.reason}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Jurisdiction Card ─────────────────────────────────────────────────────────

function JurisdictionCard({ result }: { result: JurisdictionResult }) {
  const jurisdiction = JURISDICTIONS[result.id];
  const statusConfig = {
    supports: { color: "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30", icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, label: "Supports", badge: "success" as const },
    partially_supports: { color: "border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/30", icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />, label: "Partially Supports", badge: "outline" as const },
    does_not_support: { color: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30", icon: <XCircle className="h-5 w-5 text-red-500" />, label: "Does Not Support", badge: "destructive" as const },
    not_evaluated: { color: "border-neutral-200 dark:border-neutral-700", icon: <FileText className="h-5 w-5 text-neutral-400" />, label: "Not Evaluated", badge: "outline" as const },
  };

  const config = statusConfig[result.status];

  return (
    <Card className={`${config.color} hover:shadow-sm transition-all`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {config.icon}
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">{jurisdiction.name}</p>
              <p className="text-[10px] text-neutral-500">{jurisdiction.region}</p>
            </div>
          </div>
          <Badge variant={config.badge} className="text-[10px]">{config.label}</Badge>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="text-center">
            <p className="text-lg font-bold text-green-600">{result.criteriaPassed}</p>
            <p className="text-[9px] text-neutral-500">Pass</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-red-600">{result.criteriaFailed}</p>
            <p className="text-[9px] text-neutral-500">Fail</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-neutral-400">{result.criteriaNotTested}</p>
            <p className="text-[9px] text-neutral-500">Untested</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-neutral-500 mb-1">
            <span>Confidence</span>
            <span className="font-medium">{result.confidence}%</span>
          </div>
          <div className="h-1.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                result.confidence >= 80 ? "bg-green-500" : result.confidence >= 50 ? "bg-yellow-500" : "bg-red-500"
              }`}
              style={{ width: `${result.confidence}%` }}
            />
          </div>
        </div>

        {/* EN 301 549 extras badge for EAA */}
        {result.extraRequirements && (
          <div className="mt-3 pt-2 border-t border-neutral-200/50 dark:border-neutral-700/50">
            <p className="text-[9px] text-neutral-500">
              EN 301 549 extras: {result.extraRequirements.filter((r) => r.status === "pass").length} pass / {result.extraRequirements.filter((r) => r.status === "not_tested").length} untested
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
