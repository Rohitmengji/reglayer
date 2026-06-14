"use client";

/**
 * RegLayer — Enterprise Site Audit Page v4
 *
 * UX Flow:
 * Step 1 — Choose scan mode: Public Pages / Admin Pages / Full Site
 * Step 2 — Configure (URL, auth if needed, pages shown based on mode)
 * Step 3 — Live progress dashboard with real-time SSE
 * Step 4 — Results organized by page type with clear scores
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
  FileSearch,
  Zap,
  StopCircle,
  Radio,
  Timer,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  ArrowRight,
  ArrowLeft,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import type { AuthConfig } from "@/lib/validations/auth";

// ══════════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════════

type ScanMode = "public" | "admin" | "full";

const PUBLIC_ROUTES = [
  "/", "/features", "/pricing", "/standards", "/contact",
  "/blog", "/auth/login", "/auth/register", "/privacy",
  "/terms", "/cookie-policy", "/api-reference", "/docs",
  "/request-access",
];

const ADMIN_ROUTES = [
  "/dashboard", "/scans", "/violations", "/trends",
  "/compliance", "/analysis", "/automation", "/manage",
  "/executive", "/agency", "/settings", "/crawl",
  "/insights", "/priorities", "/notifications",
  "/audit-log", "/integrations", "/monitoring",
  "/screen-reader", "/vault", "/risk",
  "/dashboard/revenue", "/dashboard/remediation",
  "/dashboard/design-system", "/dashboard/rum",
  "/dashboard/journey",
];

const ADMIN_ROUTE_META: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/scans": "Scans",
  "/violations": "Violations",
  "/trends": "Trends",
  "/compliance": "Compliance",
  "/analysis": "Analysis",
  "/automation": "Automation",
  "/manage": "Manage",
  "/executive": "Executive",
  "/agency": "Agency",
  "/settings": "Settings",
  "/crawl": "Crawl",
  "/insights": "Insights",
  "/priorities": "Priorities",
  "/notifications": "Notifications",
  "/audit-log": "Audit Log",
  "/integrations": "Integrations",
  "/monitoring": "Monitoring",
  "/screen-reader": "Screen Reader",
  "/vault": "Vault",
  "/risk": "Risk Score",
  "/dashboard/revenue": "Revenue Impact",
  "/dashboard/remediation": "Remediation",
  "/dashboard/design-system": "Design System",
  "/dashboard/rum": "Real User Monitoring",
  "/dashboard/journey": "Journey Map",
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
  const [concurrency, setConcurrency] = useState("3");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<LiveProgress | null>(null);
  const [livePages, setLivePages] = useState<LivePageEvent[]>([]);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    return () => { eventSourceRef.current?.close(); };
  }, []);

  function selectMode(m: ScanMode) {
    setMode(m);
    if (m === "public") setMaxPages(String(PUBLIC_ROUTES.length));
    else if (m === "admin") setMaxPages(String(ADMIN_ROUTES.length));
    else setMaxPages(String(PUBLIC_ROUTES.length + ADMIN_ROUTES.length));
    setStep("config");
  }

  const connectSSE = useCallback((id: string) => {
    const es = new EventSource(`/api/crawl/${id}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
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
            setRunning(false);
            fetch(`/api/crawl/${id}`)
              .then((r) => r.json())
              .then((data) => { setResult(data.result || event.result); })
              .catch(() => setResult(event.result));
            setStep("done");
            es.close();
            break;
          case "error":
            setRunning(false);
            setError(event.error);
            setStep("done");
            es.close();
            break;
          case "cancelled":
            setRunning(false);
            setProgress((prev) => prev ? { ...prev, phase: "cancelled" } : null);
            fetch(`/api/crawl/${id}`)
              .then((r) => r.json())
              .then((data) => { if (data.result) setResult(data.result); })
              .catch(() => {});
            setStep("done");
            es.close();
            break;
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
      setTimeout(() => {
        fetch(`/api/crawl/${id}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.status === "complete" && data.result) { setResult(data.result); setRunning(false); setStep("done"); }
            else if (data.status === "failed") { setError(data.error || "Audit failed"); setRunning(false); setStep("done"); }
          })
          .catch(() => { setError("Connection lost"); setRunning(false); setStep("done"); });
      }, 2000);
    };
  }, []);

  async function handleAudit() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setLivePages([]);
    setJobId(null);
    setStep("running");

    let knownRoutes: string[] | undefined;
    if (mode === "public") knownRoutes = PUBLIC_ROUTES;
    else if (mode === "admin") knownRoutes = ADMIN_ROUTES;
    else knownRoutes = [...PUBLIC_ROUTES, ...ADMIN_ROUTES];

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          maxPages: Number(maxPages),
          maxDepth: mode === "public" ? 3 : 5,
          concurrency: Number(concurrency),
          knownRoutes,
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
    setJobId(null);
    setRunning(false);
    setUrl("");
    setAuthConfig(undefined);
    eventSourceRef.current?.close();
  }

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <FileSearch className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Site Audit</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {step === "mode" && "Choose what to scan"}
                {step === "config" && `Configure ${mode === "public" ? "public" : mode === "admin" ? "admin" : "full site"} audit`}
                {step === "running" && "Audit in progress..."}
                {step === "done" && "Audit complete"}
              </p>
            </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ModeCard
              icon={<Unlock className="h-6 w-6" />}
              title="Public Pages"
              description="Scan visitor-facing pages — homepage, pricing, docs, login, etc."
              pageCount={PUBLIC_ROUTES.length}
              color="blue"
              features={["No login required", "SEO-visible pages", "Sitemap discovery"]}
              onClick={() => selectMode("public")}
            />
            <ModeCard
              icon={<Lock className="h-6 w-6" />}
              title="Admin Pages"
              description="Scan behind-login pages — dashboard, settings, reports, etc."
              pageCount={ADMIN_ROUTES.length}
              color="violet"
              features={["Requires authentication", "All sidebar routes", "Dashboard & tools"]}
              requiresAuth
              onClick={() => selectMode("admin")}
            />
            <ModeCard
              icon={<Globe className="h-6 w-6" />}
              title="Full Site"
              description="Scan everything — public and admin pages combined."
              pageCount={PUBLIC_ROUTES.length + ADMIN_ROUTES.length}
              color="emerald"
              features={["Complete coverage", "Public + admin pages", "Template issue detection"]}
              requiresAuth
              recommended
              onClick={() => selectMode("full")}
            />
          </div>
        )}

        {/* ══════════════ STEP 2: CONFIGURATION ══════════════ */}
        {step === "config" && mode && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" /> Pages to scan
                  <Badge variant="outline" className="ml-auto">
                    {mode === "public" ? PUBLIC_ROUTES.length : mode === "admin" ? ADMIN_ROUTES.length : PUBLIC_ROUTES.length + ADMIN_ROUTES.length} routes
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {(mode === "public" ? PUBLIC_ROUTES : mode === "admin" ? ADMIN_ROUTES : [...PUBLIC_ROUTES, ...ADMIN_ROUTES]).map((route) => {
                    const isAdmin = ADMIN_ROUTES.includes(route);
                    return (
                      <span key={route} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono ${
                        isAdmin
                          ? "bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800"
                          : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                      }`}>
                        {isAdmin && <Lock className="h-2.5 w-2.5" />}
                        {ADMIN_ROUTE_META[route] || route}
                      </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Target URL</label>
                  <Input type="url" placeholder="https://your-app.com" value={url} onChange={(e) => setUrl(e.target.value)} required className="mt-1 font-mono text-sm" />
                  <p className="text-xs text-neutral-400 mt-1">Base URL of your site. Routes will be appended to this.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Max Pages</label>
                    <Input type="number" min="1" max="500" value={maxPages} onChange={(e) => setMaxPages(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Parallel Scans</label>
                    <Input type="number" min="1" max="10" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} className="mt-1" />
                    <p className="text-xs text-neutral-400 mt-1">Higher = faster but more server load</p>
                  </div>
                </div>

                {(mode === "admin" || mode === "full") && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Authentication Required</p>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">Admin pages require login. Configure authentication below or select a saved config.</p>
                    <ScanAuthSection onAuthChange={setAuthConfig} scanUrl={url} />
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep("mode")} className="px-6">
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                  </Button>
                  <Button onClick={handleAudit} disabled={!url} className="flex-1 h-11 text-sm font-medium">
                    <Zap className="h-4 w-4 mr-2" />
                    Start {mode === "public" ? "Public" : mode === "admin" ? "Admin" : "Full Site"} Audit
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════ STEP 3: RUNNING ══════════════ */}
        {step === "running" && progress && (
          <LiveProgressDashboard progress={progress} livePages={livePages} onCancel={handleCancel} />
        )}
        {step === "running" && !progress && (
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30">
            <CardContent className="p-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              <div className="text-center">
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
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Audit Failed</p>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
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

function ModeCard({ icon, title, description, pageCount, color, features, requiresAuth, recommended, onClick }: {
  icon: React.ReactNode; title: string; description: string; pageCount: number;
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
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>{pageCount} pages</span>
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
    <div className="space-y-4">
      <Card className="border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-violet-50 dark:from-blue-950/50 dark:to-violet-950/50 overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-5 w-5 text-blue-500 animate-pulse" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-blue-500 rounded-full animate-ping" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-white">{phaseLabel[progress.phase] || progress.phase}</p>
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
              <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}

          {progress.phase === "discovering" && (
            <div className="space-y-1">
              <p className="text-xs text-neutral-600 dark:text-neutral-300">{progress.pagesDiscovered} pages queued</p>
              <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
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
                  const isAdmin = ADMIN_ROUTES.some(r => path === r || path.startsWith(r + "/") || path.startsWith(r + "?"));
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
                        {isAdmin && <Lock className="h-3 w-3 text-violet-400 shrink-0" />}
                        <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300 truncate">{ADMIN_ROUTE_META[path] || path}</span>
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
  const publicPages = result.pages.filter((p) => {
    const path = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
    return PUBLIC_ROUTES.some(r => path === r || path === r + "/");
  });
  const adminPages = result.pages.filter((p) => {
    const path = p.url.replace(/^https?:\/\/[^/]+/, "") || "/";
    return !PUBLIC_ROUTES.some(r => path === r || path === r + "/");
  });

  const calcAvg = (pages: PageResult[]) => {
    const valid = pages.filter(p => !p.error && p.score > 0);
    return valid.length > 0 ? Math.round((valid.reduce((s, p) => s + p.score, 0) / valid.length) * 10) / 10 : 0;
  };
  const publicAvg = calcAvg(publicPages);
  const adminAvg = calcAvg(adminPages);

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
              {publicPages.length > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{publicAvg}</p>
                  <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Public ({publicPages.length})</p>
                </div>
              )}
              {adminPages.length > 0 && (
                <div className="text-center px-4 py-2 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                  <p className="text-2xl font-bold text-violet-700 dark:text-violet-400">{adminAvg}</p>
                  <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium uppercase tracking-wide">Admin ({adminPages.length})</p>
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
      {publicPages.length > 0 && <PageGroup pages={publicPages} title="Public Pages" icon={<Unlock className="h-4 w-4 text-blue-500" />} color="blue" />}
      {adminPages.length > 0 && <PageGroup pages={adminPages} title="Admin Pages" icon={<Lock className="h-4 w-4 text-violet-500" />} color="violet" />}
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
                    {ADMIN_ROUTE_META[path] || p.pageTitle || path}
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
