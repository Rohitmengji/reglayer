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
  Scale,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import type { AuthConfig } from "@/lib/validations/auth";
import { CrawlTheater } from "@/components/crawl/CrawlTheater";
import { createInitialTheaterState, reduceTheaterEvent, type TheaterState } from "@/lib/crawl-viz/crawlTheater";
import { normalizeTargetUrl } from "@/lib/crawl-viz/targetUrl";
import { formatExposure } from "@/lib/risk/litigationWeights";
import { FeatureGate } from "@/components/ui/feature-gate";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

// Mode semantics are discovery-based, not tied to RegLayer's own routes:
//   public        — audit publicly-reachable pages, no login
//   authenticated — log in, then audit pages behind the login
//   deep          — deeper discovery (higher maxDepth), auth optional
type ScanMode = "public" | "authenticated" | "deep";

// Per-mode defaults. Page budgets are tuned to what a single serverless
// function can realistically scan within its ~60s limit (the crawl returns a
// clean "partial" result if a run exceeds it, so these are safe upper bounds,
// not hard caps the user can't change):
//  - public:        fast, shallow surface scan of the marketing/public site
//  - authenticated: gentler concurrency (avoids tripping auth rate-limits),
//                   session-aware sweep behind the login
//  - deep:          broader, deeper discovery for fuller coverage
const MODE_CONFIG: Record<ScanMode, { maxPages: number; maxDepth: number; concurrency: number }> = {
  public: { maxPages: 18, maxDepth: 2, concurrency: 3 },
  authenticated: { maxPages: 18, maxDepth: 3, concurrency: 2 },
  deep: { maxPages: 30, maxDepth: 4, concurrency: 3 },
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
  litigationSurface?: LitigationSurface;
  outcome?: "ok" | "all-failed" | "no-pages" | "launch-failed" | "partial";
}

// Mirrors the server's LitigationSurface (src/lib/risk/litigationSurface.ts).
interface LitigationFactor {
  ruleId: string;
  label: string;
  wcag: string;
  plaintiffNote: string;
  occurrences: number;
  affectedPages: number;
  lawsuitFrequency: number;
  contribution: number;
  estimatedExposure: number;
  sampleUrls: string[];
}
interface LitigationSurface {
  pagesScanned: number;
  score: number;
  tier: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  estimatedExposure: number;
  coveredRuleCount: number;
  totalHighRiskRules: number;
  factors: LitigationFactor[];
  summary: string;
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

// Durable live snapshot shape (from GET /api/crawl/[jobId].live).
interface LiveSnapshot {
  rootUrl: string | null;
  currentUrl: string | null;
  pages: Array<{ url: string; scanId?: string; score?: number; violations?: number; status: "discovered" | "scanning" | "complete" | "error"; depth?: number }>;
  edges: Array<{ from: string; to: string }>;
  /** Data-URL screenshot of the page being visited right now (live viewport). */
  currentShot?: string;
  /** Aspect (height/width) of a tall currentShot → drives scroll-to-footer pan. */
  currentShotAspect?: number;
}

/**
 * Rebuild the live-visualization view-model from a durable snapshot (polled).
 * Replays the snapshot through the same pure reducer the SSE path uses, so the
 * viewport / site-map / filmstrip render identically whether driven by live SSE
 * events (local) or by polling the durable record (serverless).
 */
function theaterFromLive(live: LiveSnapshot | null, phase?: string): TheaterState {
  let s = createInitialTheaterState();
  if (!live) return s;
  for (const e of live.edges ?? []) {
    s = reduceTheaterEvent(s, { type: "discovery", url: e.to, from: e.from });
  }
  for (const p of live.pages ?? []) {
    const from = (live.edges ?? []).find((e) => e.to === p.url)?.from;
    s = reduceTheaterEvent(s, { type: "discovery", url: p.url, from, depth: p.depth });
  }
  for (const p of live.pages ?? []) {
    if (p.status === "complete" && p.scanId) {
      s = reduceTheaterEvent(s, { type: "page-complete", url: p.url, scanId: p.scanId, score: p.score ?? 0, violations: p.violations ?? 0 });
    } else if (p.status === "error") {
      s = reduceTheaterEvent(s, { type: "page-start", url: p.url });
      s = reduceTheaterEvent(s, { type: "page-error", url: p.url });
    } else if (p.status === "scanning") {
      s = reduceTheaterEvent(s, { type: "page-start", url: p.url });
    }
    // "discovered" stays a discovery node only (added above) — not scanning.
  }
  // Only mark the current page as scanning if it isn't already finished, so the
  // viewport doesn't get stuck showing "Scanning…" over a completed page.
  const cur = (live.pages ?? []).find((p) => p.url === live.currentUrl);
  if (live.currentUrl && (!cur || (cur.status !== "complete" && cur.status !== "error"))) {
    s = reduceTheaterEvent(s, { type: "page-start", url: live.currentUrl });
  }
  if (phase) s = reduceTheaterEvent(s, { type: "phase", phase });
  // The live page screenshot is a snapshot field (not an event) — attach it so
  // the viewport can render the actual page the browser is on right now.
  if (live.currentShot) s = { ...s, currentShot: live.currentShot, currentShotAspect: live.currentShotAspect };
  return s;
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════

function CrawlPageInner() {
  const [step, setStep] = useState<"mode" | "config" | "running" | "done">("mode");
  const [mode, setMode] = useState<ScanMode | null>(null);
  const [url, setUrl] = useState("");
  // Inline validation message for the target URL (e.g. "google" isn't a domain).
  const [urlError, setUrlError] = useState<string | null>(null);
  // The user's own most-recent site, fetched on mount to AUTO-DETECT a target.
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  // True only when the URL was set BY auto-detect (not coincidentally typed),
  // so the "auto-detected" hint is honest.
  const [urlAutoDetected, setUrlAutoDetected] = useState(false);
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
  // A saved auth config selected in ScanAuthSection — sent to the API as
  // authConfigId and resolved server-side (credentials never reach the client).
  const [savedConfigId, setSavedConfigId] = useState<string | undefined>(undefined);
  // Guards against double-starting a crawl (e.g. a fast double-click on Start).
  const startingRef = useRef(false);
  // Shown when the server clamped maxPages to the plan limit (so it isn't silent).
  const [clampNotice, setClampNotice] = useState<string | null>(null);
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
      e.returnValue = t("crawl.audit.beforeUnload");
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [running, t]);

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
      setError(payload?.error || t("crawl.audit.errorGeneric"));
    } else {
      // complete OR cancelled: pull the authoritative final result from the API
      // (the SSE payload may be screenshot-stripped or arrive before the record).
      fetch(`/api/crawl/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.result) setResult(data.result);
          else if (payload?.result) setResult(payload.result);
          // Never strand the user on a blank "done" page if BOTH the authoritative
          // fetch and the event payload lack a result.
          else if (kind === "complete") setError(t("crawl.audit.errorResultsUnloadable"));
        })
        .catch(() => {
          if (payload?.result) setResult(payload.result);
          else if (kind === "complete") setError(t("crawl.audit.errorResultsUnloadable"));
        });
      if (kind === "cancelled") setProgress((prev) => (prev ? { ...prev, phase: "cancelled" } : prev));
    }
    setStep("done");
  }, [stopTracking, t]);

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
            // Keep progress monotonic so a late/stale SSE frame (e.g. after a
            // reconnect to a warm lambda) can't regress what polling advanced.
            setProgress((prev) => {
              if (!prev) return event.progress;
              return (event.progress.pagesScanned ?? 0) >= (prev.pagesScanned ?? 0)
                ? { ...prev, ...event.progress }
                : prev;
            });
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
        // Rebuild the live visualization (viewport / site-map / filmstrip) from
        // the durable snapshot. This is what makes the Live view work on
        // serverless, where SSE delivers nothing (the crawl and the stream run
        // on different lambdas).
        if (data?.live) {
          setTheater(theaterFromLive(data.live, data?.progress?.phase));
          if (Array.isArray(data.live.pages)) {
            // The text "Live Results" list only shows pages actually being/already
            // scanned — not the larger set of merely-discovered URLs.
            setLivePages(
              data.live.pages
                .filter((p: { status: string }) => p.status !== "discovered")
                .map((p: { url: string; score?: number; violations?: number; status: "scanning" | "complete" | "error" }) => ({
                  url: p.url, score: p.score ?? 0, violations: p.violations ?? 0, duration: 0, status: p.status,
                }))
            );
          }
        }
      } catch { /* transient — keep polling */ }
    };
    pollRef.current = setInterval(poll, 3000);
    void poll(); // immediate first poll so the live view fills fast
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
            // Seed the live view from the snapshot already in hand so the theater
            // isn't blank for a full poll interval after a reload mid-crawl.
            setTheater(theaterFromLive(data?.live ?? null, data?.progress?.phase));
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

  // Auto-detect a target: pre-fill the URL with the user's own most-recent site
  // so "Target: auto-detected" is genuine. Never clobbers a typed/restored URL,
  // and stands down entirely if a crawl is already in progress (the reconnect
  // effect owns the URL in that case — avoids a fill/overwrite race).
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("reglayer_active_crawl")) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/sites");
        if (!r.ok) return;
        const data = await r.json();
        const top: string | undefined = data?.sites?.[0]?.url;
        if (cancelled || !top) return;
        setDetectedUrl(top);
        setUrl((prev) => {
          if (prev) return prev; // don't clobber a typed/restored URL
          setUrlAutoDetected(true);
          return top;
        });
      } catch { /* auto-detect is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function selectMode(m: ScanMode) {
    setMode(m);
    // Apply per-mode defaults (page budget, depth, concurrency) so each mode is
    // genuinely tuned, not just a depth change. Users can still adjust them.
    const cfg = MODE_CONFIG[m];
    setMaxPages(String(cfg.maxPages));
    setMaxDepth(String(cfg.maxDepth));
    setConcurrency(String(cfg.concurrency));
    // Public audits must never carry credentials. Clear any auth configured
    // under a previous Authenticated/Deep selection so it can't leak in.
    if (m === "public") {
      setAuthConfig(undefined);
      setSavedConfigId(undefined);
    }
    setUrlError(null);
    setError(null);
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
    // Guard against double-start (fast double-click, or Try-again while a job is
    // already starting) — one click, one crawl.
    if (startingRef.current) return;

    // Validate the target FIRST — a bad domain like "google" (→ https://google/)
    // must be caught here with a clear inline message, not after a wasted crawl.
    const { url: targetUrl, error: vErr } = normalizeTargetUrl(url);
    if (vErr || !targetUrl) {
      setUrlError(vErr || t("crawl.audit.errorInvalidUrl"));
      setStep("config");
      return;
    }
    // Authenticated mode means "behind the login" — refuse to silently run it as
    // a public crawl when no credentials (inline or saved) are configured.
    const hasAuth = !!savedConfigId || (!!authConfig && authConfig.method !== "none");
    if (mode === "authenticated" && !hasAuth) {
      setUrlError(null);
      setError(t("crawl.audit.errorAuthRequired"));
      setStep("config");
      return;
    }
    setUrlError(null);
    setError(null);
    if (targetUrl !== url) setUrl(targetUrl);

    startingRef.current = true;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setLivePages([]);
    setTheater(createInitialTheaterState());
    setJobId(null);
    setStep("running");

    // Clamp the page budget: an empty/0 field must fall back to the mode default
    // rather than POST maxPages:0 (which the API rejects → "Failed to start").
    const safeMaxPages = Math.min(500, Math.max(1, Number(maxPages) || MODE_CONFIG[mode ?? "public"].maxPages));
    // Public audits never send credentials — even if auth was configured under a
    // previous Authenticated/Deep selection and left behind by the Back button.
    const includeAuth = mode !== "public";
    const inlineAuth = includeAuth && authConfig && authConfig.method !== "none" ? authConfig : undefined;
    const sendSavedId = includeAuth ? savedConfigId : undefined;

    try {
      // No knownRoutes: the engine does real discovery for the target site
      // (sitemap.xml + on-page link BFS) instead of seeding RegLayer's routes.
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          maxPages: safeMaxPages,
          maxDepth: Number(maxDepth) || MODE_DEPTH[mode ?? "public"],
          concurrency: Number(concurrency) || MODE_CONFIG[mode ?? "public"].concurrency,
          // A saved login (resolved server-side) takes precedence over inline auth.
          ...(sendSavedId ? { authConfigId: sendSavedId } : inlineAuth ? { auth: inlineAuth } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("crawl.audit.errorFailedToStart"));
      }
      const data = await res.json();
      // Surface a silent plan clamp so a 50→5 (FREE) reduction isn't mysterious.
      if (data?.config?.maxPages && data.config.maxPages < safeMaxPages) {
        setProgress(null);
        setClampNotice(t("crawl.audit.clampNotice", { limit: String(data.config.maxPages) }));
      } else {
        setClampNotice(null);
      }
      setJobId(data.jobId);
      connectSSE(data.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("crawl.audit.errorFailedToStart"));
      setRunning(false);
      setStep("done");
    } finally {
      startingRef.current = false;
    }
  }

  async function handleCancel() {
    if (!jobId) return;
    // Optimistic feedback: reflect the cancel intent immediately so the UI
    // doesn't look unresponsive. The durable cancel is confirmed by the
    // poll/SSE backstop within a cycle, which lands the terminal "cancelled".
    setProgress((prev) => (prev ? { ...prev, phase: "cancelled" } : prev));
    try { await fetch(`/api/crawl/${jobId}`, { method: "DELETE" }); } catch { /* poll backstop still lands it */ }
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
    setUrlError(null);
    setUrlAutoDetected(false);
    setMaxPages("50");
    setMaxDepth("3");
    setAuthConfig(undefined);
    setSavedConfigId(undefined);
    setClampNotice(null);
    startingRef.current = false;
    stopTracking();
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{t("crawl.audit.pageTitle")}</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
              {step === "mode" && t("crawl.audit.subtitleChooseScope")}
              {step === "config" && (mode === "public" ? t("crawl.audit.subtitleConfigurePublic") : mode === "authenticated" ? t("crawl.audit.subtitleConfigureAuthenticated") : t("crawl.audit.subtitleConfigureDeep"))}
              {step === "running" && t("crawl.audit.subtitleRunning")}
              {step === "done" && t("crawl.audit.subtitleDone")}
            </p>
          </div>
          {(step === "done" || step === "config") && (
            <Button variant="outline" size="sm" onClick={handleReset} className="text-xs">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> {t("crawl.audit.newAudit")}
            </Button>
          )}
        </div>

        {/* Step bar — shrink connectors/padding on mobile and allow horizontal
            scroll so 4 steps never widen the page (was overflowing at ≤400px). */}
        <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(["mode", "config", "running", "done"] as const).map((s, i) => {
            const labels = [t("crawl.audit.stepScope"), t("crawl.audit.stepConfigure"), t("crawl.audit.stepScanning"), t("crawl.audit.stepResults")];
            const isCurrent = step === s;
            const isPast = ["mode", "config", "running", "done"].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center shrink-0">
                {i > 0 && <div className={`w-4 sm:w-8 h-px mx-1 ${isPast ? "bg-blue-400" : "bg-neutral-200 dark:bg-neutral-700"}`} />}
                <div className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-all ${
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
                title={t("crawl.mode.publicTitle")}
                description={t("crawl.mode.publicDescription")}
                pageCountHint={t("crawl.mode.publicHint")}
                color="blue"
                features={[t("crawl.mode.publicFeature1"), t("crawl.mode.publicFeature2"), t("crawl.mode.publicFeature3")]}
                recommendedLabel={t("crawl.mode.recommended")}
                authNeededLabel={t("crawl.mode.authNeeded")}
                onClick={() => selectMode("public")}
              />
              <ModeCard
                icon={<ShieldCheck className="h-6 w-6" />}
                title={t("crawl.mode.authenticatedTitle")}
                description={t("crawl.mode.authenticatedDescription")}
                pageCountHint={t("crawl.mode.authenticatedHint")}
                color="violet"
                features={[t("crawl.mode.authenticatedFeature1"), t("crawl.mode.authenticatedFeature2"), t("crawl.mode.authenticatedFeature3")]}
                recommendedLabel={t("crawl.mode.recommended")}
                authNeededLabel={t("crawl.mode.authNeeded")}
                requiresAuth
                onClick={() => selectMode("authenticated")}
              />
              <ModeCard
                icon={<Layers className="h-6 w-6" />}
                title={t("crawl.mode.deepTitle")}
                description={t("crawl.mode.deepDescription")}
                pageCountHint={t("crawl.mode.deepHint")}
                color="emerald"
                features={[t("crawl.mode.deepFeature1"), t("crawl.mode.deepFeature2"), t("crawl.mode.deepFeature3")]}
                recommendedLabel={t("crawl.mode.recommended")}
                authNeededLabel={t("crawl.mode.authNeeded")}
                recommended
                onClick={() => selectMode("deep")}
              />
            </div>
            {/* Quick actions + history */}
            <div className="flex items-center gap-3 text-xs text-neutral-500">
              <Link href="/scans" className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                <History className="h-3.5 w-3.5" /> {t("crawl.viewPastAudits")}
              </Link>
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <span className="flex items-center gap-1.5">
                <Crosshair className="h-3.5 w-3.5" /> {t("crawl.target")}{" "}
                {url ? (
                  <>
                    <code className="text-neutral-700 dark:text-neutral-300">{url}</code>
                    {urlAutoDetected && (
                      <span className="text-green-600 dark:text-green-400">· {t("crawl.targetAutoDetected")}</span>
                    )}
                  </>
                ) : (
                  <span className="text-neutral-400">{t("crawl.targetEnterNext")}</span>
                )}
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
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{t("crawl.config.autoDiscoveryTitle")}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                    {t("crawl.config.autoDiscoveryBody")}
                    {mode === "deep" && t("crawl.config.autoDiscoveryDeep")}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.config.targetUrl")}</label>
                  <Input
                    type="url"
                    placeholder={t("crawl.config.targetUrlPlaceholder")}
                    value={url}
                    onChange={(e) => { setUrl(e.target.value); setUrlAutoDetected(false); if (urlError) setUrlError(null); }}
                    required
                    aria-invalid={!!urlError}
                    className={`mt-1 font-mono text-sm ${urlError ? "border-red-400 dark:border-red-600 focus-visible:ring-red-400" : ""}`}
                  />
                  {urlError ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {urlError}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-400 mt-1">{t("crawl.config.targetUrlHint")}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.maxPages")}</label>
                    <Input type="number" min="1" max="500" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} className="mt-1" />
                    <p className="text-xs text-neutral-400 mt-1">{t("crawl.config.maxPagesHint")}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.config.crawlDepth")}</label>
                    <Input type="number" min="1" max="10" value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} className="mt-1" />
                    <p className="text-xs text-neutral-400 mt-1">{t("crawl.config.crawlDepthHint")}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{t("crawl.config.speed")}</label>
                    <div className="flex gap-2 mt-1">
                      {[
                        { label: t("crawl.config.speedGentle"), value: "1" },
                        { label: t("crawl.config.speedNormal"), value: "3" },
                        { label: t("crawl.config.speedFast"), value: "6" },
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
                    <p className="text-xs text-neutral-400 mt-1">{t("crawl.config.speedHint")}</p>
                  </div>
                </div>

                {(mode === "authenticated" || mode === "deep") && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        {mode === "authenticated" ? t("crawl.config.authRequiredTitle") : t("crawl.config.authOptionalTitle")}
                      </p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                      {mode === "authenticated"
                        ? t("crawl.config.authRequiredBody")
                        : t("crawl.config.authOptionalBody")}
                    </p>
                    <ScanAuthSection key={mode} onAuthChange={setAuthConfig} onSavedConfigChange={setSavedConfigId} scanUrl={url} />
                  </div>
                )}

                {/* Inline error (e.g. authenticated mode started with no login) */}
                {error && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 flex items-start gap-2.5">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}

                {/* Time estimate + start — stacked full-width on mobile, but the
                    CTA must not stretch the full card width on large screens. */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                  <Button variant="outline" onClick={() => { setError(null); setStep("mode"); }} className="w-full sm:w-auto px-6">
                    <ArrowLeft className="h-4 w-4 mr-2" /> {t("common.back")}
                  </Button>
                  <Button onClick={handleAudit} disabled={!url.trim()} className="w-full sm:w-auto sm:min-w-64 h-11 text-sm font-medium">
                    <Zap className="h-4 w-4 mr-2" />
                    {mode === "public" ? t("crawl.config.startPublic") : mode === "authenticated" ? t("crawl.config.startAuthenticated") : t("crawl.config.startDeep")}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
                <div className="flex flex-col gap-1 text-xs text-neutral-400 px-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 shrink-0" /> {t("crawl.config.estimatedTime")} <strong className="text-neutral-600 dark:text-neutral-300">{getTimeEstimate()}</strong>
                  </span>
                  <span>{t("crawl.config.budgetSummary", { pages: String(Number(maxPages) || 0), depth: String(Number(maxDepth) || 0), concurrency: String(concurrency) })}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════ STEP 3: RUNNING ══════════════ */}
        {(step === "running" || step === "done") && clampNotice && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 mb-4">
            <CardContent className="p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-200">{clampNotice}</p>
            </CardContent>
          </Card>
        )}
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
                <p className="text-sm font-medium text-neutral-900 dark:text-white">{t("crawl.running.startingEngine")}</p>
                <p className="text-xs text-neutral-500 mt-1">{t("crawl.running.startingEngineSub")}</p>
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
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{t("crawl.results.couldntFinish")}</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => handleAudit()} disabled={!url.trim()} className="h-8 text-xs">
                    <Radio className="h-3.5 w-3.5 mr-1.5" /> {t("crawl.results.tryAgain")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("config")} className="h-8 text-xs">
                    {t("crawl.results.adjustSettings")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setStep("mode")} className="h-8 text-xs">
                    {t("crawl.results.newAudit")}
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

function ModeCard({ icon, title, description, pageCountHint, color, features, requiresAuth, recommended, recommendedLabel, authNeededLabel, onClick }: {
  icon: React.ReactNode; title: string; description: string; pageCountHint: string;
  color: "blue" | "violet" | "emerald"; features: string[];
  requiresAuth?: boolean; recommended?: boolean; recommendedLabel: string; authNeededLabel: string; onClick: () => void;
}) {
  const c = {
    blue: { bg: "bg-blue-50 dark:bg-blue-950/40", border: "border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600", icon: "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400", badge: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300", ring: "hover:ring-2 hover:ring-blue-200 dark:hover:ring-blue-800" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800 hover:border-violet-400 dark:hover:border-violet-600", icon: "bg-violet-100 dark:bg-violet-900 text-violet-600 dark:text-violet-400", badge: "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300", ring: "hover:ring-2 hover:ring-violet-200 dark:hover:ring-violet-800" },
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/40", border: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600", icon: "bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300", ring: "hover:ring-2 hover:ring-emerald-200 dark:hover:ring-emerald-800" },
  }[color];

  return (
    <button onClick={onClick} className={`relative text-left rounded-xl border-2 p-5 transition-all cursor-pointer ${c.bg} ${c.border} ${c.ring}`}>
      {recommended && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500 text-white">{recommendedLabel}</span>
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
            <Lock className="h-2.5 w-2.5" /> {authNeededLabel}
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
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const pct = progress.pagesTotal > 0 ? Math.round((progress.pagesScanned / progress.pagesTotal) * 100) : 0;
  const phaseLabel: Record<string, string> = {
    queued: t("crawl.running.phaseQueued"), connecting: t("crawl.running.phaseConnecting"), discovering: t("crawl.running.phaseDiscovering"),
    scanning: t("crawl.running.phaseScanning"), analyzing: t("crawl.running.phaseAnalyzing"),
  };
  const completedPages = livePages.filter(p => p.status === "complete");
  const scanningPages = livePages.filter(p => p.status === "scanning");
  const failedPages = livePages.filter(p => p.status === "error");

  return (
    <div className="space-y-4" aria-busy="true">
      <Card className="border-blue-200 dark:border-blue-800 bg-linear-to-r from-blue-50 to-violet-50 dark:from-blue-950/50 dark:to-violet-950/50 overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative shrink-0">
                <Radio className="h-5 w-5 text-blue-500 animate-pulse" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-blue-500 rounded-full animate-ping" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate" role="status" aria-live="polite">{phaseLabel[progress.phase] || progress.phase}</p>
                {progress.currentUrl && progress.phase === "scanning" && (
                  <p className="text-xs text-neutral-500 font-mono truncate">{progress.currentUrl.replace(/^https?:\/\/[^/]+/, "")}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {progress.eta !== undefined && progress.eta > 0 && (
                <span className="flex items-center gap-1 text-xs text-neutral-500 whitespace-nowrap"><Timer className="h-3.5 w-3.5" /> {t("crawl.running.eta", { time: formatDuration(progress.eta) })}</span>
              )}
              <Button variant="outline" size="sm" onClick={onCancel} className="text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950 h-7 shrink-0">
                <StopCircle className="h-3 w-3 mr-1" /> {t("common.cancel")}
              </Button>
            </div>
          </div>

          {progress.phase === "scanning" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-600 dark:text-neutral-300 font-medium">
                  {t("crawl.running.pagesProgress", { scanned: String(progress.pagesScanned), total: String(progress.pagesTotal) })}
                  {progress.scanRate && progress.scanRate > 0 && <span className="ml-2 text-neutral-400">{t("crawl.running.pagesPerSecond", { rate: progress.scanRate.toFixed(1) })}</span>}
                </span>
                <span className="text-neutral-500 font-mono">{pct}%</span>
              </div>
              <div
                className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-label={t("crawl.running.pagesScannedAria")}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={t("crawl.running.pagesScannedValueText", { scanned: String(progress.pagesScanned), total: String(progress.pagesTotal) })}
              >
                <div className="h-full bg-linear-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {progress.phase === "discovering" && (
            <div className="space-y-1">
              <p className="text-xs text-neutral-600 dark:text-neutral-300" role="status" aria-live="polite">{t("crawl.running.pagesQueued", { count: String(progress.pagesDiscovered) })}</p>
              <div
                className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden"
                role="progressbar"
                aria-label={t("crawl.running.discoveringAria")}
                aria-valuetext={t("crawl.running.discoveredValueText", { count: String(progress.pagesDiscovered) })}
              >
                <div className="h-full bg-linear-to-r from-blue-400 to-blue-600 rounded-full animate-[indeterminate_2s_ease-in-out_infinite] w-1/3" />
              </div>
            </div>
          )}

          {progress.phase === "scanning" && progress.pagesScanned > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <LiveStat label={t("crawl.avgScore")} value={progress.avgScore > 0 ? progress.avgScore.toFixed(1) : "—"} color={progress.avgScore >= 90 ? "green" : progress.avgScore >= 70 ? "yellow" : "red"} />
              <LiveStat label={t("crawl.running.statViolations")} value={progress.totalViolations.toString()} color={progress.totalViolations > 0 ? "red" : "green"} />
              <LiveStat label={t("crawl.running.statCompleted")} value={`${completedPages.length}`} />
              <LiveStat label={t("crawl.running.statFailed")} value={failedPages.length.toString()} color={failedPages.length > 0 ? "amber" : "green"} />
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
                    <span className="capitalize">{phase === "connecting" ? t("crawl.running.phaseAuth") : phase === "discovering" ? t("crawl.running.phaseDiscover") : phase === "scanning" ? t("crawl.running.phaseScan") : t("crawl.running.phaseAnalyze")}</span>
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
                <Activity className="h-4 w-4 text-blue-500" /> {t("crawl.running.liveResults")}
                <Badge variant="outline" className="text-xs">{completedPages.length}/{livePages.length}</Badge>
                {scanningPages.length > 0 && (
                  <span className="text-[10px] text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t("crawl.running.scanningCount", { count: String(scanningPages.length) })}</span>
                )}
              </CardTitle>
              {expanded ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
            </button>
          </CardHeader>
          {expanded && (
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-100 overflow-y-auto">
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
                      {p.status === "error" && <span className="text-[10px] text-red-500 truncate max-w-30">{p.error}</span>}
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
  const { t } = useI18n();
  // Defensive defaults: a partial/older/stale durable record may be missing
  // arrays/objects. Never let a missing field white-screen the results page.
  const pages = result.pages ?? [];
  const patterns = result.patterns ?? [];
  const errors = result.errors ?? [];
  const timing = result.timing ?? { auth: 0, discovery: 0, scanning: 0, analysis: 0, total: 0 };
  const discovery = result.discovery ?? { sitemapUrls: 0, linkUrls: 0, totalUnique: 0, sitemapAvailable: false };
  // Discovery-based audit: pages aren't pre-classified into public/admin —
  // present everything the crawler found as one collection.
  const discoveredPages = pages;
  const cleanCount = discoveredPages.filter((p) => !p.error && p.violations === 0 && p.scanId).length;
  const errorCount = discoveredPages.filter((p) => p.error).length;

  // Honest empty / all-failed state — never show a "score 0" success screen for
  // a crawl that scanned nothing.
  const noResults = result.pagesScanned === 0 || result.outcome === "no-pages" || result.outcome === "all-failed";
  if (noResults) {
    const isNoPages = result.outcome === "no-pages" || result.pagesDiscovered === 0;
    const firstErr = errors?.[0]?.error;
    return (
      <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30">
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                {isNoPages ? t("crawl.results.noPagesScanned") : t("crawl.results.noneScannable")}
              </h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
                {isNoPages
                  ? t("crawl.results.noPagesBody", { count: String(discovery?.totalUnique ?? 0) })
                  : t("crawl.results.allFailedBody", { count: String(result.pagesDiscovered) })}
              </p>
            </div>
          </div>
          {firstErr && (
            <p className="text-xs font-mono text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 rounded-md px-3 py-2 wrap-break-word">
              {firstErr}
            </p>
          )}
          <ul className="text-sm text-neutral-600 dark:text-neutral-300 list-disc pl-5 space-y-1">
            <li>{t("crawl.results.tip1")}</li>
            <li>{t("crawl.results.tip2")}</li>
            <li>{t("crawl.results.tip3")}</li>
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {result.outcome === "partial" && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-neutral-900 dark:text-white">{t("crawl.results.partialTitle")}</p>
              <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">
                {t("crawl.results.partialBody", { scanned: String(result.pagesScanned), discovered: String(result.pagesDiscovered) })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Summary */}
      <Card className="overflow-hidden">
        <div aria-hidden="true" className={`h-1.5 ${result.averageScore >= 90 ? "bg-green-500" : result.averageScore >= 70 ? "bg-yellow-500" : result.averageScore >= 50 ? "bg-orange-500" : "bg-red-500"}`} />
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
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{t("crawl.results.overallScore")}</p>
                <p className="text-xs text-neutral-500 mt-0.5">{t("crawl.results.scoreSummary", { pages: String(result.pagesScanned), violations: String(result.totalViolations), duration: formatDuration(result.duration) })}</p>
                <p className="text-xs text-neutral-400 mt-0.5">{t("crawl.results.templateIssuesFound", { count: String(patterns.filter(p => p.isTemplateIssue).length) })}</p>
              </div>
            </div>
            <div className="flex gap-4 sm:ml-auto">
              {cleanCount > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{cleanCount}</p>
                  <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">{t("crawl.results.clean")}</p>
                </div>
              )}
              {errorCount > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{errorCount}</p>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">{t("crawl.results.failed")}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ADA Litigation Surface — the concrete backing for the Public Site promise */}
      {result.litigationSurface && <LitigationSurfaceCard surface={result.litigationSurface} />}

      {/* Phase Timeline */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {[
          { name: "Auth", label: t("crawl.running.phaseAuth"), dur: timing.auth, icon: <Shield className="h-3.5 w-3.5" />, ok: result.auth?.authenticated ? "success" : result.auth ? "error" : "skip" },
          { name: "Discover", label: t("crawl.running.phaseDiscover"), dur: timing.discovery, icon: <Search className="h-3.5 w-3.5" />, ok: "success" },
          { name: "Scan", label: t("crawl.running.phaseScan"), dur: timing.scanning, icon: <Activity className="h-3.5 w-3.5" />, ok: "success" },
          { name: "Analyze", label: t("crawl.running.phaseAnalyze"), dur: timing.analysis, icon: <BarChart3 className="h-3.5 w-3.5" />, ok: "success" },
        ].map((p, i) => (
          <div key={p.name} className="flex items-center">
            {i > 0 && <div className="w-4 h-px bg-neutral-300 dark:bg-neutral-600 mx-1" />}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              p.ok === "success" ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
              : p.ok === "error" ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700"
            }`}>
              {p.icon} <span>{p.label}</span> <span className="text-[10px] opacity-70">{p.dur > 0 ? formatDuration(p.dur) : "—"}</span>
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
                {result.auth.authenticated ? t("crawl.results.authenticatedVia", { method: result.auth.method }) : t("crawl.results.authFailed", { method: result.auth.method })}
              </p>
              <p className="text-xs text-neutral-500">{result.auth.authenticated ? t("crawl.results.sessionPages", { count: String(result.auth.sessionPages || 0) }) : t("crawl.results.adminNotAccessible")}</p>
            </div>
          </div>
          {result.auth.proof && <img src={`data:image/jpeg;base64,${result.auth.proof}`} alt={t("crawl.results.authProofAlt")} className="hidden sm:block h-12 w-20 object-cover rounded border" />}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <MetricCard icon={<Layers className="h-4 w-4" />} label={t("crawl.results.metricPages")} value={result.pagesScanned.toString()} sublabel={t("crawl.results.metricPagesSub", { count: String(result.pagesDiscovered) })} />
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label={t("crawl.results.metricAvgScore")} value={result.averageScore.toString()} color={result.averageScore >= 90 ? "green" : result.averageScore >= 70 ? "yellow" : "red"} />
        <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label={t("crawl.results.metricViolations")} value={result.totalViolations.toString()} color={result.totalViolations > 0 ? "red" : "green"} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label={t("crawl.results.metricPatterns")} value={patterns.length.toString()} sublabel={t("crawl.results.metricPatternsSub", { count: String(patterns.filter(p => p.isTemplateIssue).length) })} />
        <MetricCard icon={<Search className="h-4 w-4" />} label={t("crawl.results.metricDiscovery")} value={t("crawl.results.metricDiscoveryValue")} sublabel={t("crawl.results.metricDiscoverySub", { count: String(discovery.totalUnique) })} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label={t("crawl.results.metricDuration")} value={formatDuration(result.duration)} sublabel={t("crawl.results.metricDurationSub", { count: String(result.pagesScanned) })} />
      </div>

      {/* Patterns */}
      {patterns.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500" /> {t("crawl.results.violationPatterns")} <Badge variant="outline" className="ml-auto">{patterns.length}</Badge>
            </CardTitle>
            <p className="text-xs text-neutral-500">{t("crawl.results.patternsHint")}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {patterns.slice(0, 10).map((p) => (
              <div key={p.ruleId} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
                <Badge variant={p.impact === "critical" ? "critical" : p.impact === "serious" ? "serious" : "outline"} className="shrink-0 text-[10px]">{p.impact}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 dark:text-white truncate">{p.description}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {p.ruleId} · {t("crawl.results.patternPages", { count: String(p.pageCount) })}
                    {p.isTemplateIssue && <span className="ml-2 text-violet-600 dark:text-violet-400 font-medium">{t("crawl.results.templateIssue")}</span>}
                  </p>
                </div>
                <span className="text-lg font-bold text-neutral-400">{p.pageCount}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> {t("crawl.results.issues", { count: String(errors.length) })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {errors.slice(0, 10).map((err, i) => (
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
      {discoveredPages.length > 0 && <PageGroup pages={discoveredPages} title={t("crawl.results.discoveredPages")} icon={<Globe className="h-4 w-4 text-blue-500" />} color="blue" />}
    </div>
  );
}

// ── ADA Litigation Surface ──

/**
 * The site-wide litigation exposure card — the concrete backing for the Public
 * Site mode's "ADA litigation surface" promise. Renders which lawsuit-driving
 * issue types are present, how widespread, and the resulting exposure tier +
 * dollar estimate. Framed as an informational estimate (not legal advice).
 */
function LitigationSurfaceCard({ surface }: { surface: LitigationSurface }) {
  const { t } = useI18n();
  const TIER: Record<LitigationSurface["tier"], { label: string; bar: string; chip: string; ring: string }> = {
    LOW: { label: t("crawl.litigation.tierLow"), bar: "bg-green-500", chip: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300", ring: "border-green-200 dark:border-green-800" },
    MODERATE: { label: t("crawl.litigation.tierModerate"), bar: "bg-yellow-500", chip: "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300", ring: "border-yellow-200 dark:border-yellow-800" },
    HIGH: { label: t("crawl.litigation.tierHigh"), bar: "bg-orange-500", chip: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300", ring: "border-orange-200 dark:border-orange-800" },
    CRITICAL: { label: t("crawl.litigation.tierCritical"), bar: "bg-red-500", chip: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300", ring: "border-red-200 dark:border-red-800" },
  };
  const tier = TIER[surface.tier];
  const money = (n: number) => `$${n.toLocaleString()}`;

  return (
    <Card className={`overflow-hidden border ${tier.ring}`}>
      <div className={`h-1.5 ${tier.bar}`} />
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Scale className="h-4 w-4 text-neutral-700 dark:text-neutral-300" /> {t("crawl.litigation.title")}
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${tier.chip}`}>{tier.label}</span>
        </CardTitle>
        <p className="text-xs text-neutral-500">{surface.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Headline metrics — stack on mobile so the "$500,000+" exposure doesn't overflow a 3-col row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">{t("crawl.litigation.riskScore")}</p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">{surface.score}<span className="text-sm font-medium text-neutral-400">/100</span></p>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">{t("crawl.litigation.estExposure")}</p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">{formatExposure(surface.estimatedExposure)}</p>
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3">
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 font-medium">{t("crawl.litigation.highRiskIssues")}</p>
            <p className="text-2xl font-black text-neutral-900 dark:text-white">{surface.coveredRuleCount}<span className="text-sm font-medium text-neutral-400">/{surface.totalHighRiskRules}</span></p>
          </div>
        </div>

        {/* Litigation-driving factors */}
        {surface.factors.length > 0 ? (
          <div className="space-y-2">
            {surface.factors.map((f) => (
              <div key={f.ruleId} className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-white">{f.label}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">{t("crawl.litigation.citedIn", { wcag: f.wcag, pct: String(Math.round(f.lawsuitFrequency * 100)) })}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">{f.plaintiffNote}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-neutral-900 dark:text-white">{f.affectedPages === 1 ? t("crawl.litigation.pageCount", { count: String(f.affectedPages) }) : t("crawl.litigation.pagesCount", { count: String(f.affectedPages) })}</p>
                    <p className="text-[11px] text-neutral-500">{f.occurrences === 1 ? t("crawl.litigation.instanceCount", { count: String(f.occurrences) }) : t("crawl.litigation.instancesCount", { count: String(f.occurrences) })}</p>
                    <p className="text-[11px] text-neutral-400 mt-0.5">~{money(f.estimatedExposure)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/30 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-300">{t("crawl.litigation.noneFound")}</p>
          </div>
        )}

        <p className="text-[11px] text-neutral-400 flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          {t("crawl.litigation.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Page Group ──

function PageGroup({ pages, title, icon, color }: { pages: PageResult[]; title: string; icon: React.ReactNode; color: "blue" | "violet" }) {
  const { t } = useI18n();
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
          }`}>{t("crawl.results.avgLabel", { score: String(avg) })}</span>
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
                  {p.error && <Badge variant="destructive" className="text-[10px]">{t("crawl.results.errorBadge")}</Badge>}
                  {!p.error && p.critical > 0 && <Badge variant="critical" className="text-[10px]">{t("crawl.results.critBadge", { count: String(p.critical) })}</Badge>}
                  {!p.error && p.serious > 0 && <Badge variant="serious" className="text-[10px]">{t("crawl.results.serBadge", { count: String(p.serious) })}</Badge>}
                  {!p.error && p.moderate > 0 && <Badge variant="outline" className="text-[10px]">{t("crawl.results.modBadge", { count: String(p.moderate) })}</Badge>}
                  {!p.error && p.violations === 0 && p.scanId && (
                    <Badge className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">{t("crawl.results.clean")}</Badge>
                  )}
                </div>
                {p.scanId && (
                  <Link
                    href={`/report/${p.scanId}`}
                    aria-label={t("crawl.results.openReportFor", { url: p.url })}
                    title={t("crawl.results.openFullReport")}
                    className="text-neutral-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            );
          })}
        </div>
        {pages.length > 15 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            aria-expanded={false}
            aria-label={t("crawl.results.showAllPagesAria", { count: String(pages.length) })}
            className="w-full mt-3 py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-lg font-medium"
          >
            {t("crawl.results.showAllPages", { count: String(pages.length) })}
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

export default function CrawlPage() {
  return (
    <FeatureGate feature="crawl">
      <CrawlPageInner />
    </FeatureGate>
  );
}
