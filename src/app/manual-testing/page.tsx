"use client";

/**
 * RegLayer — AI-Guided Manual Testing Page
 *
 * WHY: ~60% of WCAG criteria cannot be fully determined by automation. This page provides
 *      structured, human-in-the-loop test flows with AI guidance and narration evidence.
 * WHAT: Guided checklist — pick a scan → generate plan → record verdicts → see combined score.
 * HOW: Fetches /api/audits for existing plans, POST to create new. Real-time score rollup.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Sparkles,
  BookOpen,
  ArrowRight,
  Shield,
  BarChart3,
  Eye,
  Lock,
  RefreshCw,
  FileSearch,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditSummary {
  id: string;
  status: string;
  scope: string;
  automatedScore: number | null;
  manualScore: number | null;
  combinedScore: number | null;
  createdAt: string;
}

interface ManualTestItem {
  criterion: string;
  level: "A" | "AA";
  title: string;
  principle: string;
  why: string;
  guidance: string;
  aiGenerated: boolean;
  evidence: { kind: string; steps?: number[]; note?: string };
  verdict: "pass" | "fail" | "na" | "untested";
  note: string | null;
  attestedBy: string | null;
  attestedAt: string | null;
}

interface ManualTestPlan {
  version: number;
  scanId: string;
  generatedAt: string;
  snapshotRef: { capturedAt: string; totalElements: number } | null;
  items: ManualTestItem[];
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ManualTestingPage() {
  const [audits, setAudits] = useState<AuditSummary[]>([]);
  const [selectedAudit, setSelectedAudit] = useState<string | null>(null);
  const [plan, setPlan] = useState<ManualTestPlan | null>(null);
  const [scores, setScores] = useState<{ automated: number; manual: number; combined: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [scanId, setScanId] = useState("");
  const [scanIdError, setScanIdError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(null), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  const loadAudits = useCallback(async () => {
    try {
      const res = await fetch("/api/audits");
      if (!res.ok) {
        if (res.status === 401) throw new Error("Please sign in to access manual testing.");
        throw new Error("Unable to load your test audits. Please try again.");
      }
      const data = await res.json();
      setAudits(data.audits ?? []);
      setError(null);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to load audits. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: kick off the initial client-side data fetch (sets loading state synchronously)
    loadAudits().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [loadAudits]);

  const loadPlan = useCallback(async (auditId: string) => {
    setPlanLoading(true);
    setError(null);
    try {
      // Request AI enrichment so guidance is genuinely AI-drafted (the server
      // caps + caches per item, so this only spends credits on first load and
      // degrades to static guidance when AI is unavailable).
      const res = await fetch(`/api/audits/${encodeURIComponent(auditId)}/plan?enrich=true`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) throw new Error("You don't have access to this audit.");
        if (res.status === 404) throw new Error("This audit was not found or has been deleted.");
        throw new Error(data.error || "Unable to load the test plan. Please try again.");
      }
      const data = await res.json();
      if (!data.plan?.items?.length) {
        throw new Error("This audit has no test items. It may have been created incorrectly.");
      }
      setPlan(data.plan);
      setScores(data.scores);
      setSelectedAudit(auditId);
    } catch (err) {
      if (err instanceof TypeError) {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Unable to load plan. Please try again.");
      }
    } finally {
      setPlanLoading(false);
    }
  }, []);

  function validateScanId(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return "Scan ID is required.";
    if (trimmed.length < 5) return "Scan ID appears too short. Check and try again.";
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return "Scan ID contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed.";
    if (trimmed.length > 100) return "Scan ID is too long.";
    return null;
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    const validationError = validateScanId(scanId);
    if (validationError) { setScanIdError(validationError); return; }
    setScanIdError(null);
    if (creating) return;
    setCreating(true);
    setError(null);
    setUpgradeRequired(false);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: scanId.trim() }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgradeRequired) { setUpgradeRequired(true); throw new Error(data.error); }
        if (res.status === 404) throw new Error("Scan not found. Please verify the scan ID and try again.");
        if (res.status === 403) throw new Error(data.error || "You don't have permission to create an audit for this scan.");
        if (res.status === 429) throw new Error("Too many requests. Please wait a moment and try again.");
        throw new Error(data.error || "Unable to generate the test plan. Please try again.");
      }
      setSuccessMsg("Manual test plan generated successfully.");
      setScanId("");
      await loadAudits();
      await loadPlan(data.id);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof TypeError) { setError("Network error. Please check your connection and try again."); }
      else { setError(err instanceof Error ? err.message : "Unable to create audit. Please try again."); }
    } finally {
      setCreating(false);
    }
  }

  async function handleVerdict(criterion: string, verdict: "pass" | "fail" | "na", note: string | null) {
    if (!selectedAudit) return;
    setError(null);
    try {
      const res = await fetch(`/api/audits/${encodeURIComponent(selectedAudit)}/items/${encodeURIComponent(criterion)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verdict, note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 400 && data.details?.fieldErrors?.note) throw new Error("A note is required when marking a criterion as failed.");
        if (res.status === 429) throw new Error("Too many requests. Please wait a moment.");
        throw new Error(data.error || "Unable to save verdict. Please try again.");
      }
      const data = await res.json();
      if (plan) {
        const updatedItems = plan.items.map((item) =>
          item.criterion === criterion ? { ...item, verdict, note, attestedBy: "self", attestedAt: new Date().toISOString() } : item
        );
        setPlan({ ...plan, items: updatedItems });
        setScores((prev) => prev ? { ...prev, manual: data.scores.manual, combined: data.scores.combined } : prev);
      }
      setSuccessMsg(`WCAG ${criterion} marked as ${verdict}.`);
    } catch (err) {
      if (err instanceof TypeError) { setError("Network error. Please check your connection."); }
      else { setError(err instanceof Error ? err.message : "Unable to save verdict. Please try again."); }
    }
  }

  return (
    <AppShell>
      <div className="space-y-8">
        <header className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 flex items-center justify-center" aria-hidden="true">
            <ClipboardCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Manual Testing</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">AI-guided human verification for criteria automation cannot determine</p>
          </div>
        </header>

        {/* Value proposition */}
        {!selectedAudit && !planLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex flex-col hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm transition-all">
              <div className="h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center mb-3">
                <Eye className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Human Verification</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex-1">Test focus order, keyboard access, and semantic meaning that automated scanners cannot determine.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex flex-col hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm transition-all">
              <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mb-3">
                <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">AI-Guided Steps</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex-1">Get specific testing instructions for each WCAG criterion with real accessibility tree evidence.</p>
            </div>
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 flex flex-col hover:border-neutral-300 dark:hover:border-neutral-700 hover:shadow-sm transition-all">
              <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-3">
                <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">Legal-Ready Record</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 flex-1">Attested verdicts feed into VPAT and Defense File for procurement officers and litigation defense.</p>
            </div>
          </div>
        )}

        <div aria-live="polite" aria-atomic="true" className="sr-only">{successMsg}{error}</div>

        {successMsg && (
          <div role="status" className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/50 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
            <p className="text-sm text-green-700 dark:text-green-300">{successMsg}</p>
          </div>
        )}

        {error && !upgradeRequired && (
          <div role="alert" className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/50 p-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500 shrink-0" aria-hidden="true" />
            <p className="text-sm text-red-700 dark:text-red-300 flex-1">{error}</p>
            <Button variant="outline" size="sm" onClick={() => { setError(null); loadAudits(); }} className="shrink-0 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" aria-hidden="true" /> Retry
            </Button>
          </div>
        )}

        {upgradeRequired && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30" role="alert">
            <CardContent className="p-4 flex items-center gap-3">
              <Lock className="h-5 w-5 text-amber-600 shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">PRO plan required</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Manual testing is available on PRO and Enterprise plans. Upgrade to access AI-guided WCAG verification.</p>
              </div>
              <a href="/settings?tab=billing" className="inline-flex items-center justify-center rounded-md bg-neutral-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shrink-0">Upgrade</a>
            </CardContent>
          </Card>
        )}

        {!selectedAudit && !planLoading && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileSearch className="h-4 w-4 text-violet-500" aria-hidden="true" />
                  Generate Manual Test Plan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-neutral-500 mb-3">Enter a completed scan ID to generate a structured manual test plan covering WCAG criteria that automation cannot fully determine.</p>
                <form onSubmit={handleCreate} className="space-y-2" noValidate>
                  <div>
                    <label htmlFor="scan-id-input" className="sr-only">Scan ID</label>
                    <div className="flex gap-2">
                      <input id="scan-id-input" type="text" value={scanId} onChange={(e) => { setScanId(e.target.value); setScanIdError(null); }}
                        placeholder="Scan ID (e.g., scan_abc123)"
                        className={`flex-1 rounded-lg border bg-white dark:bg-neutral-900 px-3 py-2 text-sm font-mono transition-colors ${scanIdError ? "border-red-300 dark:border-red-700 focus:ring-red-500" : "border-neutral-200 dark:border-neutral-700 focus:ring-violet-500"} focus:outline-none focus:ring-2 focus:ring-offset-1`}
                        aria-invalid={!!scanIdError} aria-describedby={scanIdError ? "scan-id-error" : undefined}
                        autoComplete="off" spellCheck={false} maxLength={100} />
                      <Button type="submit" disabled={creating || !scanId.trim()} aria-busy={creating}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" /> : <ArrowRight className="h-4 w-4 mr-2" aria-hidden="true" />}
                        Generate Plan
                      </Button>
                    </div>
                    {scanIdError && <p id="scan-id-error" className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{scanIdError}</p>}
                  </div>
                </form>
              </CardContent>
            </Card>

            {loading ? (
              <div className="flex items-center justify-center py-12" role="status" aria-label="Loading audits">
                <Loader2 className="h-6 w-6 text-neutral-400 animate-spin" aria-hidden="true" />
                <span className="ml-3 text-sm text-neutral-500">Loading your audits...</span>
              </div>
            ) : audits.length > 0 ? (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-sm">Previous Audits ({audits.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2" role="list" aria-label="Previous manual test audits">
                  {audits.map((audit) => (
                    <button key={audit.id} onClick={() => loadPlan(audit.id)} role="listitem"
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 transition-colors text-left"
                      aria-label={`Audit: ${audit.scope}, score ${audit.combinedScore != null ? Math.round(audit.combinedScore) : "not evaluated"}, status ${audit.status}`}>
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${(audit.combinedScore ?? 0) >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700" : (audit.combinedScore ?? 0) >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700" : "bg-red-100 dark:bg-red-900/50 text-red-700"}`} aria-hidden="true">
                        {audit.combinedScore != null ? Math.round(audit.combinedScore) : "—"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{audit.scope}</p>
                        <p className="text-xs text-neutral-500">{new Date(audit.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
                      </div>
                      <Badge variant={audit.status === "completed" ? "success" : "outline"} className="text-xs shrink-0">{audit.status}</Badge>
                    </button>
                  ))}
                </CardContent>
              </Card>
            ) : !error ? (
              <Card className="border-dashed border-neutral-200 dark:border-neutral-800">
                <CardContent className="py-12 px-6">
                  <div className="flex flex-col items-center text-center max-w-lg mx-auto">
                    <ClipboardCheck className="h-10 w-10 text-neutral-300 dark:text-neutral-600 mb-4" aria-hidden="true" />
                    <h3 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">No manual test audits yet</h3>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">Generate your first manual test plan from a completed scan to start verifying WCAG criteria that require human judgment.</p>
                  </div>
                  <div className="border-t border-neutral-100 dark:border-neutral-800 pt-6 mt-8">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-4 text-center">How it works</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="flex flex-col items-center text-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-xs font-bold text-violet-600">1</span>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Run a scan on any page, then paste the scan ID above</p>
                      </div>
                      <div className="flex flex-col items-center text-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-xs font-bold text-violet-600">2</span>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">We generate a structured checklist of criteria needing human verification</p>
                      </div>
                      <div className="flex flex-col items-center text-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-xs font-bold text-violet-600">3</span>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">Record pass/fail verdicts — results feed your VPAT and Defense File</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        )}

        {planLoading && (
          <div className="flex items-center justify-center py-12" role="status" aria-label="Loading test plan">
            <Loader2 className="h-6 w-6 text-violet-500 animate-spin" aria-hidden="true" />
            <span className="ml-3 text-sm text-neutral-500">Loading test plan...</span>
          </div>
        )}

        {selectedAudit && plan && scores && !planLoading && (
          <PlanView plan={plan} scores={scores} onVerdict={handleVerdict} onBack={() => { setSelectedAudit(null); setPlan(null); setScores(null); setError(null); }} />
        )}
      </div>
    </AppShell>
  );
}

// ── Plan View ─────────────────────────────────────────────────────────────────

function PlanView({ plan, scores, onVerdict, onBack }: {
  plan: ManualTestPlan;
  scores: { automated: number; manual: number; combined: number };
  onVerdict: (criterion: string, verdict: "pass" | "fail" | "na", note: string | null) => Promise<void>;
  onBack: () => void;
}) {
  const evaluated = plan.items.filter((i) => i.verdict !== "untested").length;
  const passed = plan.items.filter((i) => i.verdict === "pass").length;
  const failed = plan.items.filter((i) => i.verdict === "fail").length;
  const pct = plan.items.length > 0 ? Math.round((evaluated / plan.items.length) * 100) : 0;
  const principles = ["Perceivable", "Operable", "Understandable", "Robust"] as const;
  const grouped = principles.map((p) => ({ principle: p, items: plan.items.filter((item) => item.principle === p) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={onBack}><span aria-hidden="true">←</span> Back to audits</Button>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-neutral-500">
          <span className="flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Automated: <strong className="text-neutral-900 dark:text-white">{Math.round(scores.automated)}%</strong></span>
          <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Manual: <strong className="text-neutral-900 dark:text-white">{Math.round(scores.manual)}%</strong></span>
          <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5" aria-hidden="true" /> Combined: <strong className="text-neutral-900 dark:text-white">{Math.round(scores.combined)}%</strong></span>
        </div>
      </div>

      <Card className="bg-linear-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30 border-violet-200 dark:border-violet-800">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">Manual Test Progress</p>
            <span className="text-xs text-neutral-500">{evaluated} of {plan.items.length} evaluated ({pct}%)</span>
          </div>
          <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Evaluation progress">
            <div className="h-full bg-linear-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="text-green-600 dark:text-green-400">{passed} pass</span>
            <span className="text-red-600 dark:text-red-400">{failed} fail</span>
            <span className="text-neutral-400">{plan.items.length - evaluated} remaining</span>
          </div>
        </CardContent>
      </Card>

      {grouped.map(({ principle, items }) => (
        <section key={principle} aria-labelledby={`heading-${principle.toLowerCase()}`}>
          <h2 id={`heading-${principle.toLowerCase()}`} className="text-sm font-semibold text-neutral-900 dark:text-white mb-3 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden="true" />{principle}
            <Badge variant="outline" className="text-[10px] ml-1">{items.length}</Badge>
          </h2>
          <div className="space-y-2">
            {items.map((item) => <TestItemCard key={item.criterion} item={item} onVerdict={onVerdict} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── Test Item Card ────────────────────────────────────────────────────────────

function TestItemCard({ item, onVerdict }: {
  item: ManualTestItem;
  onVerdict: (criterion: string, verdict: "pass" | "fail" | "na", note: string | null) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  async function handleVerdict(verdict: "pass" | "fail" | "na") {
    if (saving) return;
    setNoteError(null);
    if (verdict === "fail" && !note.trim()) {
      setExpanded(true);
      setNoteError("A note explaining the failure is required.");
      setTimeout(() => noteRef.current?.focus(), 50);
      return;
    }
    setSaving(true);
    try { await onVerdict(item.criterion, verdict, note.trim() || null); } finally { setSaving(false); }
  }

  const verdictColors = { pass: "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30", fail: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30", na: "border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-neutral-800/30", untested: "border-neutral-200 dark:border-neutral-700" };
  const cid = item.criterion.replace(/\./g, "-");

  return (
    <article className={`rounded-xl border p-4 transition-colors ${verdictColors[item.verdict]}`} aria-labelledby={`crit-${cid}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0" aria-hidden="true">
          {item.verdict === "pass" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          {item.verdict === "fail" && <XCircle className="h-5 w-5 text-red-500" />}
          {item.verdict === "na" && <MinusCircle className="h-5 w-5 text-neutral-400" />}
          {item.verdict === "untested" && <div className="h-5 w-5 rounded-full border-2 border-neutral-300 dark:border-neutral-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-violet-600 dark:text-violet-400">{item.criterion}</span>
            <span id={`crit-${cid}`} className="text-sm font-medium text-neutral-900 dark:text-white">{item.title}</span>
            <Badge variant="outline" className="text-[10px]">{item.level}</Badge>
            {item.aiGenerated ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400"><Sparkles className="h-3 w-3" aria-hidden="true" /> AI-guided</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-neutral-400"><BookOpen className="h-3 w-3" aria-hidden="true" /> Standard guidance</span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">{item.why}</p>
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-violet-600 dark:text-violet-400 hover:underline mt-1 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded px-1 -ml-1" aria-expanded={expanded} aria-controls={`guide-${cid}`}>
            {expanded ? "Hide guidance ▲" : "Show testing guidance ▼"}
          </button>
          {expanded && (
            <div id={`guide-${cid}`} className="mt-3 space-y-3">
              <div className="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-3">
                <p className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap leading-relaxed">{item.guidance}</p>
              </div>
              {item.evidence.kind === "narration" && item.evidence.note && (
                <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-1">Computed accessibility tree (simulation)</p>
                  <p className="text-xs text-violet-700 dark:text-violet-300">{item.evidence.note}</p>
                </div>
              )}
              <div>
                <label htmlFor={`note-${cid}`} className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 block mb-1">Notes {item.verdict === "untested" && "(required for fail)"}</label>
                <textarea id={`note-${cid}`} ref={noteRef} value={note} onChange={(e) => { setNote(e.target.value); setNoteError(null); }}
                  placeholder="Describe what you observed..."
                  className={`w-full rounded-lg border bg-white dark:bg-neutral-900 px-3 py-2 text-xs resize-none h-16 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${noteError ? "border-red-300 dark:border-red-700 focus:ring-red-500" : "border-neutral-200 dark:border-neutral-700 focus:ring-violet-500"}`}
                  aria-invalid={!!noteError} aria-describedby={noteError ? `note-err-${cid}` : undefined} maxLength={2000} />
                {noteError && <p id={`note-err-${cid}`} className="text-[11px] text-red-600 dark:text-red-400 mt-1" role="alert">{noteError}</p>}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0" role="group" aria-label={`Verdict for ${item.criterion} ${item.title}`}>
          {saving ? (
            <Loader2 className="h-4 w-4 text-neutral-400 animate-spin" aria-label="Saving..." />
          ) : (
            <>
              <button onClick={() => handleVerdict("pass")} aria-pressed={item.verdict === "pass"} aria-label="Pass" disabled={saving}
                className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 ${item.verdict === "pass" ? "bg-green-100 dark:bg-green-900/50 text-green-600" : "text-neutral-400 hover:bg-green-50 dark:hover:bg-green-950/50 hover:text-green-600"}`}>
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button onClick={() => handleVerdict("fail")} aria-pressed={item.verdict === "fail"} aria-label="Fail" disabled={saving}
                className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 ${item.verdict === "fail" ? "bg-red-100 dark:bg-red-900/50 text-red-600" : "text-neutral-400 hover:bg-red-50 dark:hover:bg-red-950/50 hover:text-red-600"}`}>
                <XCircle className="h-4 w-4" />
              </button>
              <button onClick={() => handleVerdict("na")} aria-pressed={item.verdict === "na"} aria-label="Not Applicable" disabled={saving}
                className={`p-1.5 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500 ${item.verdict === "na" ? "bg-neutral-200 dark:bg-neutral-700 text-neutral-600" : "text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-600"}`}>
                <MinusCircle className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
