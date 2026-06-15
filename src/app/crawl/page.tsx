"use client";

/**
 * RegLayer — Enterprise Site Audit Page v4
 *
 * Discovery-based auditor: scans ANY site the user enters. The crawler
 * discovers the target's real pages via sitemap.xml + on-page link BFS — it is
 * NOT seeded with RegLayer's own routes.
 *
 * UX Flow:
 * Step 1 — Choose scan mode: Public Site / Authenticated App / Deep Crawl
 * Step 2 — Configure (URL, page limit, crawl depth, speed, auth if needed)
 * Step 3 — Live progress dashboard with real-time SSE
 * Step 4 — Results: discovered pages with clear scores
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Shield,
  Clock,
  Search,
  BarChart3,
  CheckCircle2,
  XCircle,
  Layers,
  Activity,
  Zap,
  StopCircle,
  Radio,
  Timer,
  ChevronDown,
  ChevronUp,
  Lock,
  ArrowRight,
  ArrowLeft,
  Info,
  Eye,
  ShieldCheck,
  History,
  Crosshair,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import type { AuthConfig } from "@/lib/validations/auth";
import { CrawlTheater } from "@/components/crawl/CrawlTheater";
import { createInitialTheaterState, reduceTheaterEvent, type TheaterState } from "@/lib/crawl-viz/crawlTheater";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

// Mode semantics are discovery-based, not tied to RegLayer's own routes:
//   public        — audit publicly-reachable pages, no login
//   authenticated — log in, then audit pages behind the login
//   deep          — deeper discovery (higher maxDepth), auth optional
type ScanMode = "public" | "authenticated" | "deep";

// Per-mode defaults so the three modes behave meaningfully differently rather
// than only changing crawl depth:
//  - public:        fast, shallow surface scan of the marketing/public site
//  - authenticated: gentler concurrency (avoids tripping auth rate-limits) and
//                   a session-aware, slightly broader sweep behind the login
//  - deep:          broad, deep discovery for full-site coverage
const MODE_CONFIG: Record<ScanMode, { maxPages: number; maxDepth: number; concurrency: number }> = {
  public: { maxPages: 25, maxDepth: 2, concurrency: 3 },
  authenticated: { maxPages: 40, maxDepth: 3, concurrency: 2 },
  deep: { maxPages: 75, maxDepth: 5, concurrency: 3 },
};

// Back-compat alias (depth still referenced elsewhere).
const MODE_DEPTH: Record<ScanMode, number> = {
  public: MODE_CONFIG.public.maxDepth,
  authenticated: MODE_CONFIG.authenticated.maxDepth,
  deep: MODE_CONFIG.deep.maxDepth,
};

// ── Types ──

interface PageResult {
  url: string;
  scanId: string;
  score: number;
  violations: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  depth: number;
  pageTitle?: string;
  scanDuration?: number;
  importance: number;
  consoleErrors: string[];
  screenshot?: string;
  error?: string;
  retryCount?: number;
}

interface CrawlError {
  url: string;
  phase: "auth" | "discovery" | "scan" | "analysis";
  error: string;
  timestamp: number;
}

interface ViolationPattern {
  ruleId: string;
  description: string;
  pageCount: number;
  impact: "critical" | "serious" | "moderate" | "minor";
  sampleUrls: string[];
  isTemplateIssue: boolean;
}

interface AuditResult {
  id: string;
  startUrl: string;
  pagesScanned: number;
  pagesDiscovered: number;
  averageScore: number;
  lowestScore: { url: string; score: number };
  highestScore: { url: string; score: number };
  totalViolations: number;
  criticalPages: Array<{ url: string; score: number; critical: number }>;
  duration: number;
  pages: PageResult[];
  auth?: { authenticated: boolean; method: string; sessionPages?: number; proof?: string; sessionExpired?: boolean };
  errors: CrawlError[];
  timing: { auth: number; discovery: number; scanning: number; analysis: number; total: number };
  patterns: ViolationPattern[];
  discovery: { sitemapUrls: number; linkUrls: number; totalUnique: number; sitemapAvailable: boolean };
  outcome?: "ok" | "all-failed" | "no-pages" | "launch-failed";
}

interface LiveProgress {
  phase: string;
  pagesDiscovered: number;
  pagesScanned: number;
  pagesTotal: number;
  pagesFailed: number;
  currentUrl?: string;
  avgScore: number;
  totalViolations: number;
  patternsFound: number;
  eta?: number;
  scanRate?: number;
  phaseTiming: Record<string, number>;
}

interface LivePageEvent {
  url: string;
  score: number;
  violations: number;
  duration: number;
  status: "scanning" | "complete" | "error";
  error?: string;
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

export default function CrawlPage() {
  const [step, setStep] = useState<"mode" | "config" | "running" | "done">("mode");
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState("50");
  const [maxDepth, setMaxDepth] = useState("3");
  const [concurrency, setConcurrency] = useState("3");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [livePages, setLivePages] = useState<LivePageEvent[]>([]);
  // View-model for the live crawl visualization; SSE events are folded in below.
  const [theater, setTheater] = useState<TheaterState>(createInitialTheaterState());
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Polling backstop: guarantees the UI reaches a correct terminal state and
  // keeps progress moving even if SSE never connects, drops, or lands on a
  // different serverless instance than the one running the crawl.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useI18n();

  const TERMINAL_STATUSES = ["complete", "failed", "cancelled"];
  const stopTracking = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Warn before leaving during active scan
  useEffect(() => {
    if (!running) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "An audit is currently in progress. Leaving will disconnect you from live results.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running]);

  // Persist jobId to sessionStorage for reconnection
  useEffect(() => {
    if (jobId && running) {
      sessionStorage.setItem("reglayer_active_crawl", JSON.stringify({ jobId, url, mode }));
    }
    if (!running && jobId) {
      sessionStorage.removeItem("reglayer_active_crawl");
    }
  }, [jobId, running, url, mode]);

  // Defined before the restore-on-mount effect below so that effect can call it
  // without a use-before-declaration violation (react-hooks/immutability).
  // Centralised terminal handler — used by BOTH the SSE stream and the polling
  // backstop, so the UI always lands in a single, correct end state exactly once.
  const finishCrawl = useCallback((id: string, kind: "complete" | "failed" | "cancelled", payload?: { result?: AuditResult; error?: string }) => {
    stopTracking();
    setRunning(false);
    if (kind === "failed") {
      setError(payload?.error || "We couldn't finish the audit. Please try again.");
    } else {
      // complete OR cancelled: pull the authoritative final result from the API
      // (the SSE payload may be screenshot-stripped or arrive before the record).
      fetch(`/api/crawl/${id}`)
        .then((r) => r.json())
        .then((data) => { if (data?.result) setResult(data.result); else if (payload?.result) setResult(payload.result); })
        .catch(() => { if (payload?.result) setResult(payload.result); });
      if (kind === "cancelled") setProgress((prev) => (prev ? { ...prev, phase: "cancelled" } : prev));
    }
    setStep("done");
  }, [stopTracking]);

  const connectSSE = useCallback((id: string) => {
    stopTracking();
    const es = new EventSource(`/api/crawl/${id}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        // Fold every event into the live-visualization view-model (it ignores
        // event types it doesn't care about).
        setTheater((prev) => reduceTheaterEvent(prev, event));
        switch (event.type) {
          case "progress":
            setProgress(event.progress);
            break;
          case "page-start":
            setLivePages((prev) => [
              ...prev.filter((p) => p.url !== event.url),
              { url: event.url, score: 0, violations: 0, duration: 0, status: "scanning" },
            ]);
            break;
          case "page-complete":
            setLivePages((prev) =>
              prev.map((p) =>
                p.url === event.url
                  ? { ...p, score: event.score, violations: event.violations, duration: event.duration, status: "complete" as const }
                  : p
              )
            );
            break;
          case "page-error":
            setLivePages((prev) =>
              prev.map((p) =>
                p.url === event.url
                  ? { ...p, status: "error" as const, error: event.error }
                  : p
              )
            );
            break;
          case "complete":
            finishCrawl(id, "complete", { result: event.result });
            break;
          case "error":
            finishCrawl(id, "failed", { error: event.error });
            break;
          case "cancelled":
            finishCrawl(id, "cancelled");
            break;
        }
      } catch { /* ignore */ }
    };

    // SSE is the fast/rich path; on error we just let it close and rely on the
    // polling backstop below — no fragile single-shot setTimeout recovery.
    es.onerror = () => { eventSourceRef.current?.close(); };

    // ── Polling backstop ──────────────────────────────────────────────────
    // Independent of SSE: every few seconds, read durable job state. This
    // guarantees a terminal landing (even if SSE never delivered the event or
    // hit a cold instance) and keeps progress moving when SSE is quiet.
    const poll = async () => {
      try {
        const res = await fetch(`/api/crawl/${id}`);
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data?.status ?? "";
        if (TERMINAL_STATUSES.includes(status)) {
          if (status === "failed") finishCrawl(id, "failed", { error: data.error });
          else if (status === "cancelled") finishCrawl(id, "cancelled");
          else finishCrawl(id, "complete", { result: data.result });
          return;
        }
        if (data?.progress && typeof data.progress === "object") {
          // Keep progress monotonic so we never regress the richer SSE updates.
          setProgress((prev) => {
            if (!prev) return data.progress;
            return (data.progress.pagesScanned ?? 0) >= (prev.pagesScanned ?? 0)
              ? { ...prev, ...data.progress }
              : prev;
          });
        }
      } catch { /* transient — keep polling */ }
    };
    pollRef.current = setInterval(poll, 3000);
  }, [finishCrawl, stopTracking]);

  // Reconnect to active job on mount
  useEffect(() => {
    const saved = sessionStorage.getItem("reglayer_active_crawl");
    if (!saved) return;
    try {
      const { jobId: savedJobId, url: savedUrl, mode: savedMode } = JSON.parse(saved);
      // Verify job is still running
      fetch(`/api/crawl/${savedJobId}`)
        .then((r) => r.json())
        .then((data) => {
          const status: string = data?.status ?? "";
          const terminal = ["complete", "failed", "cancelled"].includes(status);
          if (!terminal) {
            // Any non-terminal phase (queued/connecting/discovering/scanning/
            // analyzing) means the crawl is still in flight — reattach.
            setJobId(savedJobId);
            setUrl(savedUrl);
            setMode(savedMode);
            setTheater(createInitialTheaterState());
            if (data?.progress && typeof data.progress === "object") setProgress(data.progress);
            setRunning(true);
            setStep("running");
            connectSSE(savedJobId);
          } else if (status === "complete" && data.result) {
            setResult(data.result);
            setUrl(savedUrl);
            setMode(savedMode);
            setStep("done");
            sessionStorage.removeItem("reglayer_active_crawl");
          } else {
            sessionStorage.removeItem("reglayer_active_crawl");
          }
        })
        .catch(() => sessionStorage.removeItem("reglayer_active_crawl"));
    } catch { sessionStorage.removeItem("reglayer_active_crawl"); }
    // connectSSE is a stable useCallback (empty deps) so this still runs once on mount.
  }, [connectSSE]);

  useEffect(() => {
    return () => { stopTracking(); };
  }, [stopTracking]);

  function selectMode(m: ScanMode) {
    setMode(m);
    // Apply per-mode defaults (page budget, depth, concurrency) so each mode is
    // genuinely tuned, not just a depth change. Users can still adjust them.
    const cfg = MODE_CONFIG[m];
    setMaxPages(String(cfg.maxPages));
    setMaxDepth(String(cfg.maxDepth));
    setConcurrency(String(cfg.concurrency));
    setStep("config");
  }

  function getTimeEstimate(): string {
    // Estimate from the user's page budget (worst case the crawler fills it),
    // not a fixed route list — discovery decides the real page count.
    const pages = Number(maxPages) || 1;
    const c = Number(concurrency) || 3;
    const secPerPage = 8; // realistic: Playwright load + render + axe-core on SPA
    const overhead = (mode === "authenticated" || mode === "deep") ? 15 : 5; // auth + discovery
    const totalSec = Math.ceil((pages / c) * secPerPage) + overhead;
    if (totalSec < 60) return `~${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec > 0 ? `~${min}m ${sec}s` : `~${min}m`;
  }

  async function handleAudit() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setLivePages([]);
    setTheater(createInitialTheaterState());
    setJobId(null);
    setStep("running");

    // Normalize the target URL: accept bare domains (e.g. "example.com") by
    // defaulting to https://. The crawler scans only this URL's own origin.
    const rawUrl = url.trim();
    const targetUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    if (targetUrl !== url) setUrl(targetUrl);

    try {
      // No knownRoutes: the engine does real discovery for the target site
      // (sitemap.xml + on-page link BFS) instead of seeding RegLayer's routes.
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          maxPages: Number(maxPages),
          maxDepth: Number(maxDepth) || MODE_DEPTH[mode ?? "public"],
          concurrency: Number(concurrency),
          ...(authConfig && authConfig.method !== "none" && { auth: authConfig }),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start audit");
      }
      const data = await res.json();
      setJobId(data.jobId);
      connectSSE(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start audit");
      setRunning(false);
      setStep("done");
    }
  }

  async function handleCancel() {
    if (!jobId) return;
    try { await fetch(`/api/crawl/${jobId}`, { method: "DELETE" }); } catch {}
  }

  function handleReset() {
    setStep("mode");
    setMode(null);
    setResult(null);
    setError(null);
    setProgress(null);
    setLivePages([]);
    setTheater(createInitialTheaterState());
    setJobId(null);
    setRunning(false);
    setUrl("");
    setMaxPages("50");
    setMaxDepth("3");
    setAuthConfig(undefined);
    stopTracking();
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Site Audit</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              {step === "mode" && "Choose what to scan"}
              {step === "config" && `Configure ${mode === "public" ? "public site" : mode === "authenticated" ? "authenticated app" : "deep crawl"} audit`}
              {step === "running" && "Audit in progress..."}
              {step === "done" && "Audit complete"}
            </p>
          </div>
          {(step === "done" || step === "config") && (
            <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> New Audit
            </Button>
          )}
        </div>

        {/* Step bar */}
        <div className="flex items-center gap-2">
          {(["mode", "config", "running", "done"] as const).map((s, i) => {
            const labels = ["Scope", "Configure", "Scanning", "Results"];
            const isCurrent = step === s;
            const isPast = ["mode", "config", "running", "done"].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center">
                {i > 0 && <div className={`w-8 h-px mx-1 ${isPast ? "bg-blue-400" : "bg-neutral-200 dark:bg-neutral-700"}`} />}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  isCurrent ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 ring-2 ring-blue-200 dark:ring-blue-800"
                  : isPast ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                }`}>
                  {isPast && <CheckCircle2 className="h-3 w-3" />}
                  {isCurrent && step === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{labels[i]}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══════════════ STEP 1: MODE SELECTION ══════════════ */}
        {step === "mode" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ModeCard
                icon={<Eye className="h-6 w-6" />}
                title="Public Site"
                description="Discovers and audits the publicly-reachable pages of any site — no login required."
                pageCountHint="Auto-discovered"
                color="blue"
                features={["No login required", "Sitemap + link discovery", "ADA litigation surface"]}
                onClick={() => selectMode("public")}
              />
              <ModeCard
                icon={<ShieldCheck className="h-6 w-6" />}
                title="Authenticated App"
                description="Logs in first, then discovers and audits the pages that live behind the login."
                pageCountHint="Auto-discovered"
                color="violet"
                features={["Requires authentication", "Crawls behind login", "Internal app coverage"]}
                requiresAuth
                onClick={() => selectMode("authenticated")}
              />
              <ModeCard
                icon={<Layers className="h-6 w-6" />}
                title="Deep Crawl"
                description="Deeper discovery that follows links further into the site — find template issues everywhere."
                pageCountHint="Auto-discovered"
                color="emerald"
                features={["Higher crawl depth", "Auth optional", "Template pattern detection"]}
                recommended
                onClick={() => selectMode("deep")}
              />
            </div>
            {/* Quick actions + history */}
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <Link href="/scans" className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <History className="h-3.5 w-3.5" /> View past audits
              </Link>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="flex items-center gap-1.5">
                <Crosshair className="h-3.5 w-3.5" /> Target: <code className="text-neutral-700 dark:text-neutral-300">{url || "auto-detected"}</code>
              </span>
            </div>
          </div>
        )}

        {/* ══════════════ STEP 2: CONFIGURATION ══════════════ */}
        {step === "config" && mode && (
          <div className="space-y-4">
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
              <CardContent className="p-4 flex items-start gap-3">
                <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Automatic page discovery</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                    RegLayer will automatically discover pages starting from this URL — following its
                    sitemap.xml and on-page links — up to your page limit.
                    {mode === "deep" && " Deep Crawl follows links further into the site for broader coverage."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Target URL</label>
                  <Input type="url" placeholder="https://www.yourcompany.com" value={url} onChange={(e) => setUrl(e.target.value)} required className="mt-1 font-mono text-sm" />
                  <p className="text-xs text-neutral-400 mt-1">We&apos;ll crawl this site and discover its pages automatically.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Max Pages</label>
                    <Input type="number" min="1" max="500" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} className="mt-1" />
                    <p className="text-xs text-neutral-400 mt-1">Discovery stops at this limit (1–500)</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Crawl Depth</label>
                    <Input type="number" min="1" max="10" value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} className="mt-1" />
                    <p className="text-xs text-neutral-400 mt-1">How many links deep to follow (1–10)</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Speed</label>
                    <div className="flex gap-2 mt-1">
                      {[
                        { label: "Gentle", value: "1", desc: "1 at a time" },
                        { label: "Normal", value: "3", desc: "3 parallel" },
                        { label: "Fast", value: "6", desc: "6 parallel" },
                      ].map((preset) => (
                        <button key={preset.value} onClick={() => setConcurrency(preset.value)} className={`flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                          concurrency === preset.value
                            ? "bg-blue-50 dark:bg-blue-950 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 ring-1 ring-blue-200 dark:ring-blue-800"
                            : "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-300"
                        }`}>
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">Faster = more server load</p>
                  </div>
                </div>

                {(mode === "authenticated" || mode === "deep") && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {mode === "authenticated" ? "Authentication Required" : "Authentication (Optional)"}
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                      {mode === "authenticated"
                        ? "Log in so the crawler can discover and audit pages behind the login. Configure authentication below or select a saved config."
                        : "Add login details to also discover pages behind authentication, or leave blank to crawl public pages only."}
                    </p>
                    <ScanAuthSection onAuthChange={setAuthConfig} scanUrl={url} />
                  </div>
                )}

                {/* Time estimate + start */}
                <div className="flex items-center gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep("mode")} className="px-6">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={handleAudit} disabled={!url} className="flex-1 h-11 text-sm font-medium">
                    <Zap className="h-4 w-4 mr-2" />
                    Start {mode === "public" ? "Public Site" : mode === "authenticated" ? "Authenticated" : "Deep Crawl"} Audit
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
                  <span className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5" /> Estimated time: <strong className="text-neutral-600 dark:text-neutral-300">{getTimeEstimate()}</strong>
                  </span>
                  <span>up to {Number(maxPages) || 0} pages · depth {Number(maxDepth) || 0} · {concurrency} parallel</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════ STEP 3: RUNNING ══════════════ */}
        {step === "running" && (
          <div className="mb-4">
            <CrawlTheater theater={theater} />
          </div>
        )}
        {step === "running" && progress && (
          <LiveProgressDashboard progress={progress} livePages={livePages} onCancel={handleCancel} />
        )}
        {step === "running" && !progress && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <div className="text-center" role="status" aria-live="polite">
                <p className="text-sm font-medium text-neutral-900 dark:text-white">Starting audit engine...</p>
                <p className="text-xs text-neutral-500 mt-1">Launching browser and connecting to target</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ══════════════ STEP 4: RESULTS ══════════════ */}
        {step === "done" && error && (
          <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
            <CardContent className="p-4 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">We couldn&apos;t finish the audit</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => handleAudit()} disabled={!url} className="h-8 text-xs">
                    <Radio className="h-3.5 w-3.5 mr-1.5" /> Try again
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("config")} className="h-8 text-xs">
                    Adjust settings
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("mode")} className="h-8 text-xs">
                    New audit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {step === "done" && result && <AuditResults result={result} />}
      </div>
    </AppShell>
  );
}

// ══════════════════════════════════════════════════════════════
// MODE CARD
// ══════════════════════════════════════════════════════════════

function ModeCard({ icon, title, description, pageCountHint, color, features, requiresAuth, recommended, onClick }: {
  icon: React.ReactNode; title: string; description: string; pageCountHint: string;
  color: "blue" | "violet" | "emerald"; features: string[];
  requiresAuth?: boolean; recommended?: boolean; onClick: () => void;
}) {
  const c = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600", icon: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400", badge: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300", ring: "hover:ring-2 hover:ring-blue-200 dark:hover:ring-blue-800" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800 hover:border-violet-400 dark:hover:border-violet-600", icon: "bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400", badge: "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300", ring: "hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-800" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600", icon: "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300", ring: "hover:ring-2 hover:ring-emerald-200 dark:hover:ring-emerald-800" },
  }[color];

  return (
    <button onClick={onClick} className={`relative text-left rounded-xl border-2 p-5 transition-all cursor-pointer ${c.bg} ${c.border} ${c.ring}`}>
      {recommended && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white">Recommended</span>
      )}
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-4 ${c.icon}`}>{icon}</div>
      <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-1">{title}</h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">{description}</p>
      <div className="space-y-1.5 mb-4">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" /> {f}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-neutral-200/60 dark:border-neutral-700/60">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>{pageCountHint}</span>
        {requiresAuth && (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" /> Auth needed
          </span>
        )}
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
// LIVE PROGRESS
// ══════════════════════════════════════════════════════════════

function LiveProgressDashboard({ progress, livePages, onCancel }: {
  progress: LiveProgress; livePages: LivePageEvent[]; onCancel: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const pct = progress.pagesTotal > 0 ? Math.round((progress.pagesScanned / progress.pagesTotal) * 100) : 0;
  const phaseLabel: Record<string, string> = {
    queued: "Queued", connecting: "Launching Browser...", discovering: "Discovering Pages...",
    scanning: "Scanning Pages", analyzing: "Analyzing Patterns...",
  };
  const completedPages = livePages.filter(p => p.status === "complete");
  const scanningPages = livePages.filter(p => p.status === "scanning");
  const failedPages = livePages.filter(p => p.status === "error");

  return (
    <div className="space-y-4" aria-busy="true">
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/50 dark:to-violet-950/50 overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-5 w-5 text-blue-500 animate-pulse" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-blue-500 rounded-full animate-ping" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white" role="status" aria-live="polite">{phaseLabel[progress.phase] || progress.phase}</p>
                {progress.currentUrl && progress.phase === "scanning" && (
                  <p className="text-xs text-neutral-500 font-mono truncate max-w-[400px]">{progress.currentUrl.replace(/^https?:\/\/[^/]+/, "")}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {progress.eta !== undefined && progress.eta > 0 && (
                <span className="flex items-center gap-1 text-xs text-neutral-500"><Timer className="h-3.5 w-3.5" /> ETA {formatDuration(progress.eta)}</span>
              )}
              <Button variant="outline" size="sm" onClick={onCancel} className="text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 h-7">
                <StopCircle className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>

          {progress.phase === "scanning" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                  {progress.pagesScanned} of {progress.pagesTotal} pages
                  {progress.scanRate && progress.scanRate > 0 && <span className="ml-2 text-neutral-400">({progress.scanRate.toFixed(1)} pages/s)</span>}
                </span>
                <span className="text-neutral-500 font-mono">{pct}%</span>
              </div>
              <div
                className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Pages scanned"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${progress.pagesScanned} of ${progress.pagesTotal} pages scanned`}
              >
                <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {progress.phase === "discovering" && (
            <div className="space-y-1">
              <p className="text-xs text-neutral-600 dark:text-neutral-300" role="status" aria-live="polite">{progress.pagesDiscovered} pages queued</p>
              <div
                className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="Discovering pages"
                aria-valuetext={`${progress.pagesDiscovered} pages discovered`}
              >
                <div className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full animate-[indeterminate_2s_ease-in-out_infinite] w-1/3" />
              </div>
            </div>
          )}

          {progress.phase === "scanning" && progress.pagesScanned > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <LiveStat label="Avg Score" value={progress.avgScore > 0 ? progress.avgScore.toFixed(1) : "—"} color={progress.avgScore >= 90 ? "green" : progress.avgScore >= 70 ? "yellow" : "red"} />
              <LiveStat label="Violations" value={progress.totalViolations.toString()} color={progress.totalViolations > 0 ? "red" : "green"} />
              <LiveStat label="Completed" value={`${completedPages.length}`} />
              <LiveStat label="Failed" value={failedPages.length.toString()} color={failedPages.length > 0 ? "amber" : "green"} />
            </div>
          )}

          {/* Phase timeline */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {(["connecting", "discovering", "scanning", "analyzing"] as const).map((phase, i) => {
              const isActive = progress.phase === phase;
              const isPast = ["connecting", "discovering", "scanning", "analyzing"].indexOf(progress.phase) > i;
              const dur = progress.phaseTiming[phase === "connecting" ? "auth" : phase === "discovering" ? "discovery" : phase];
              return (
                <div key={phase} className="flex items-center">
                  {i > 0 && <div className={`w-4 h-px mx-0.5 ${isPast ? "bg-green-400" : "bg-neutral-300 dark:bg-neutral-600"}`} />}
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                    isActive ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                    : isPast ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
                    : "bg-neutral-100 dark:bg-neutral-800 text-neutral-400 border border-neutral-200 dark:border-neutral-700"
                  }`}>
                    {isPast && <CheckCircle2 className="h-3 w-3" />}
                    {isActive && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span className="capitalize">{phase === "connecting" ? "Auth" : phase === "discovering" ? "Discover" : phase === "scanning" ? "Scan" : "Analyze"}</span>
                    {dur !== undefined && dur > 0 && <span className="text-[9px] opacity-60">{(dur / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Live pages stream */}
      {livePages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" /> Live Results
                <Badge variant="outline" className="text-xs">{completedPages.length}/{livePages.length}</Badge>
                {scanningPages.length > 0 && (
                  <span className="text-[10px] text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{scanningPages.length} scanning</span>
                )}
              </CardTitle>
              {expanded ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
            </button>
          </CardHeader>
          {expanded && (
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {[...livePages].reverse().map((p) => {
                  const path = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
                  return (
                    <div key={p.url} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${p.status === "scanning" ? "bg-blue-50 dark:bg-blue-950/30" : "bg-neutral-50 dark:bg-neutral-800/30"}`}>
                      {p.status === "scanning" && <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />}
                      {p.status === "complete" && (
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          p.score >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
                          : p.score >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
                          : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                        }`}>{Math.round(p.score)}</div>
                      )}
                      {p.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300 truncate">{path}</span>
                      </div>
                      {p.status === "complete" && <span className="text-[10px] text-neutral-400 shrink-0">{(p.duration / 1000).toFixed(1)}s</span>}
                      {p.status === "complete" && p.violations > 0 && <Badge variant="outline" className="text-[10px] shrink-0">{p.violations}</Badge>}
                      {p.status === "error" && <span className="text-[10px] text-red-500 truncate max-w-[120px]">{p.error}</span>}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

function LiveStat({ label, value, color }: { label: string; value: string; color?: string }) {
  const cls = color === "green" ? "text-green-600 dark:text-green-400"
    : color === "yellow" ? "text-yellow-600 dark:text-yellow-400"
    : color === "red" ? "text-red-600 dark:text-red-400"
    : color === "amber" ? "text-amber-600 dark:text-amber-400"
    : "text-neutral-900 dark:text-white";
  return (
    <div className="bg-white/60 dark:bg-neutral-800/60 rounded-lg px-3 py-2 border border-neutral-200/50 dark:border-neutral-700/50">
      <p className="text-[10px] text-neutral-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// FINAL RESULTS
// ══════════════════════════════════════════════════════════════

function AuditResults({ result }: { result: AuditResult }) {
  // Discovery-based audit: pages aren't pre-classified into public/admin —
  // present everything the crawler found as one collection.
  const discoveredPages = result.pages;
  const cleanCount = discoveredPages.filter((p) => !p.error && p.violations === 0 && p.scanId).length;
  const errorCount = discoveredPages.filter((p) => p.error).length;

  // Honest empty / all-failed state — never show a "score 0" success screen for
  // a crawl that scanned nothing.
  const noResults = result.pagesScanned === 0 || result.outcome === "no-pages" || result.outcome === "all-failed";
  if (noResults) {
    const isNoPages = result.outcome === "no-pages" || result.pagesDiscovered === 0;
    const firstErr = result.errors?.[0]?.error;
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                {isNoPages ? "No pages could be scanned" : "We couldn't scan any of the discovered pages"}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
                {isNoPages
                  ? `We discovered ${result.discovery?.totalUnique ?? 0} URL(s) but none were scannable.`
                  : `${result.pagesDiscovered} page(s) were discovered, but every scan failed.`}
              </p>
            </div>
          </div>
          {firstErr && (
            <p className="text-xs font-mono text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-md px-3 py-2 wrap-break-word">
              {firstErr}
            </p>
          )}
          <ul className="text-sm text-neutral-600 dark:text-neutral-300 list-disc pl-5 space-y-1">
            <li>Check the URL is correct and publicly reachable.</li>
            <li>Some sites block automated scanners — try again, or use Authenticated mode.</li>
            <li>For large or slow sites, retry with a lower speed (fewer pages in parallel).</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Card className="overflow-hidden">
        <div className={`h-1.5 ${result.averageScore >= 90 ? "bg-green-500" : result.averageScore >= 70 ? "bg-yellow-500" : result.averageScore >= 50 ? "bg-orange-500" : "bg-red-500"}`} />
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className={`h-20 w-20 rounded-2xl flex items-center justify-center text-3xl font-black ${
                result.averageScore >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
                : result.averageScore >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
                : result.averageScore >= 50 ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
              }`}>{Math.round(result.averageScore)}</div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">Overall Score</p>
                <p className="text-xs text-neutral-500 mt-0.5">{result.pagesScanned} pages · {result.totalViolations} violations · {formatDuration(result.duration)}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{result.patterns.filter(p => p.isTemplateIssue).length} template issues found</p>
              </div>
            </div>
            <div className="flex gap-4 sm:ml-auto">
              {cleanCount > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{cleanCount}</p>
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Clean</p>
                </div>
              )}
              {errorCount > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{errorCount}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">Failed</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase Timeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {[
          { name: "Auth", dur: result.timing.auth, icon: <Shield className="h-3.5 w-3.5" />, ok: result.auth?.authenticated ? "success" : result.auth ? "error" : "skip" },
          { name: "Discover", dur: result.timing.discovery, icon: <Search className="h-3.5 w-3.5" />, ok: "success" },
          { name: "Scan", dur: result.timing.scanning, icon: <Activity className="h-3.5 w-3.5" />, ok: "success" },
          { name: "Analyze", dur: result.timing.analysis, icon: <BarChart3 className="h-3.5 w-3.5" />, ok: "success" },
        ].map((p, i) => (
          <div key={p.name} className="flex items-center">
            {i > 0 && <div className="w-4 h-px bg-neutral-300 dark:bg-neutral-600 mx-1" />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              p.ok === "success" ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : p.ok === "error" ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700"
            }`}>
              {p.icon} <span>{p.name}</span> <span className="text-[10px] opacity-70">{p.dur > 0 ? formatDuration(p.dur) : "—"}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Auth */}
      {result.auth && (
        <div className={`rounded-xl border p-4 flex items-center justify-between ${
          result.auth.authenticated && !result.auth.sessionExpired
            ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50"
            : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
              result.auth.authenticated ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
            }`}>
              {result.auth.authenticated ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-white">
                {result.auth.authenticated ? `Authenticated via ${result.auth.method}` : `Auth failed (${result.auth.method})`}
              </p>
              <p className="text-xs text-neutral-500">{result.auth.authenticated ? `${result.auth.sessionPages || 0} pages with shared session` : "Admin pages were not accessible"}</p>
            </div>
          </div>
          {result.auth.proof && <img src={`data:image/jpeg;base64,${result.auth.proof}`} alt="Auth proof" className="hidden sm:block h-12 w-20 object-cover rounded border" />}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={<Layers className="h-4 w-4" />} label="Pages" value={result.pagesScanned.toString()} sublabel={`of ${result.pagesDiscovered} found`} />
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Avg Score" value={result.averageScore.toString()} color={result.averageScore >= 90 ? "green" : result.averageScore >= 70 ? "yellow" : "red"} />
        <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Violations" value={result.totalViolations.toString()} color={result.totalViolations > 0 ? "red" : "green"} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Patterns" value={result.patterns.length.toString()} sublabel={`${result.patterns.filter(p => p.isTemplateIssue).length} template`} />
        <MetricCard icon={<Search className="h-4 w-4" />} label="Discovery" value="Routes" sublabel={`${result.discovery.totalUnique} URLs`} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Duration" value={formatDuration(result.duration)} sublabel={`${result.pagesScanned} pages`} />
      </div>

      {/* Patterns */}
      {result.patterns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500" /> Violation Patterns <Badge variant="outline" className="ml-auto">{result.patterns.length}</Badge>
            </CardTitle>
            <p className="text-xs text-neutral-500">Issues on multiple pages — fix in template to resolve everywhere</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.patterns.slice(0, 10).map((p) => (
              <div key={p.ruleId} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                <Badge variant={p.impact === "critical" ? "critical" : p.impact === "serious" ? "serious" : "outline"} className="shrink-0 text-[10px]">{p.impact}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 dark:text-white truncate">{p.description}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {p.ruleId} · {p.pageCount} pages
                    {p.isTemplateIssue && <span className="ml-2 text-violet-600 dark:text-violet-400 font-medium">⚡ Template Issue</span>}
                  </p>
                </div>
                <span className="text-lg font-bold text-neutral-400">{p.pageCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> Issues ({result.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {result.errors.slice(0, 10).map((err, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5 uppercase">{err.phase}</Badge>
                <span className="text-amber-700 dark:text-amber-300 break-all">
                  {err.url.replace(/^https?:\/\/[^/]+/, "")}:
                  <span className="ml-1 text-amber-600">{err.error}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Page Results — grouped */}
      {discoveredPages.length > 0 && <PageGroup pages={discoveredPages} title="Discovered Pages" icon={<Globe className="h-4 w-4 text-blue-500" />} color="blue" />}
    </div>
  );
}

// ── Page Group ──

function PageGroup({ pages, title, icon, color }: { pages: PageResult[]; title: string; icon: React.ReactNode; color: "blue" | "violet" }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...pages].sort((a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    return a.score - b.score;
  });
  const visible = showAll ? sorted : sorted.slice(0, 15);
  const valid = pages.filter(p => !p.error && p.score > 0);
  const avg = valid.length > 0 ? Math.round((valid.reduce((s, p) => s + p.score, 0) / valid.length) * 10) / 10 : 0;
  const borderColor = color === "violet" ? "border-violet-200 dark:border-violet-800" : "border-blue-200 dark:border-blue-800";

  return (
    <Card className={borderColor}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {icon} {title} <Badge variant="outline">{pages.length}</Badge>
          </CardTitle>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            avg >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
            : avg >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
            : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
          }`}>Avg: {avg}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {visible.map((p) => {
            const path = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
            return (
              <div key={p.url} className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                  p.error ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                  : p.score >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
                  : p.score >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
                  : p.score >= 50 ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                  : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                }`}>{p.error ? "✗" : p.score > 0 ? Math.round(p.score) : "—"}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                    {p.pageTitle || path}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-neutral-500 truncate font-mono">{path}</p>
                    {p.scanDuration && <span className="text-[10px] text-neutral-400 shrink-0">{(p.scanDuration / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {p.error && <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                  {!p.error && p.critical > 0 && <Badge variant="critical" className="text-[10px]">{p.critical} crit</Badge>}
                  {!p.error && p.serious > 0 && <Badge variant="serious" className="text-[10px]">{p.serious} ser</Badge>}
                  {!p.error && p.moderate > 0 && <Badge variant="outline" className="text-[10px]">{p.moderate} mod</Badge>}
                  {!p.error && p.violations === 0 && p.scanId && (
                    <Badge className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">Clean</Badge>
                  )}
                </div>
                {p.scanId && (
                  <Link href={`/report/${p.scanId}`} className="text-neutral-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        {pages.length > 15 && !showAll && (
          <button onClick={() => setShowAll(true)} className="w-full mt-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg font-medium">
            Show all {pages.length} pages
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ── Metric Card ──

function MetricCard({ icon, label, value, sublabel, color }: {
  icon: React.ReactNode; label: string; value: string; sublabel?: string; color?: "green" | "yellow" | "red";
}) {
  const cls = color === "green" ? "text-green-600 dark:text-green-400"
    : color === "yellow" ? "text-yellow-600 dark:text-yellow-400"
    : color === "red" ? "text-red-600 dark:text-red-400"
    : "text-neutral-900 dark:text-white";
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
      {sublabel && <p className="text-[10px] text-neutral-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}
