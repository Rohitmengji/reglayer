"use client";

/**
 * RegLayer — Enterprise Site Audit Page
 *
 * BrowserStack/LambdaTest-class UI:
 * - Phase timeline (auth → discover → audit → analyze)
 * - Discovery stats (sitemap vs links)
 * - Pattern analysis (template issues)
 * - Page-level results with importance scores
 * - Auth proof screenshots
 * - Error diagnostics
 */

import { useState } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/i18n-provider";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import type { AuthConfig } from "@/lib/validations/auth";

// ── Result Types ──

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

export default function CrawlPage() {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState("10");
  const [maxDepth, setMaxDepth] = useState("3");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | undefined>(undefined);
  const [phase, setPhase] = useState<string>("");
  const { t } = useI18n();

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setResult(null);
    setPhase("Connecting...");

    try {
      const res = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          maxPages: Number(maxPages),
          maxDepth: Number(maxDepth),
          concurrency: 2,
          ...(authConfig && authConfig.method !== "none" && { auth: authConfig }),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.message || "Audit failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setRunning(false);
      setPhase("");
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <FileSearch className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Site Audit</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Enterprise-grade multi-page accessibility analysis with pattern detection
            </p>
          </div>
        </div>

        {/* Config Panel */}
        <Card className="border-neutral-200 dark:border-neutral-700">
          <CardContent className="p-6">
            <form onSubmit={handleAudit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Target URL</label>
                <Input
                  type="url"
                  placeholder="https://your-app.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                  disabled={running}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Max Pages</label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    disabled={running}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Crawl Depth</label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    disabled={running}
                    className="mt-1"
                  />
                </div>
              </div>

              <ScanAuthSection onAuthChange={setAuthConfig} scanUrl={url} />

              <Button type="submit" disabled={running} className="w-full h-11 text-sm font-medium">
                {running ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{phase || "Auditing..."}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Start Site Audit
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
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

        {/* Results */}
        {result && <AuditResults result={result} />}
      </div>
    </AppShell>
  );
}

// ══════════════════════════════════════════════════════════════
// RESULTS COMPONENT
// ══════════════════════════════════════════════════════════════

function AuditResults({ result }: { result: AuditResult }) {
  return (
    <div className="space-y-6">
      {/* Phase Timeline */}
      <PhaseTimeline timing={result.timing} auth={result.auth} />

      {/* Auth Status */}
      {result.auth && <AuthStatusCard auth={result.auth} />}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard icon={<Layers className="h-4 w-4" />} label="Pages" value={result.pagesScanned.toString()} sublabel={`of ${result.pagesDiscovered} found`} />
        <MetricCard icon={<BarChart3 className="h-4 w-4" />} label="Avg Score" value={result.averageScore.toString()} color={result.averageScore >= 90 ? "green" : result.averageScore >= 70 ? "yellow" : "red"} />
        <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Violations" value={result.totalViolations.toString()} color={result.totalViolations > 0 ? "red" : "green"} />
        <MetricCard icon={<Activity className="h-4 w-4" />} label="Patterns" value={result.patterns.length.toString()} sublabel={`${result.patterns.filter(p => p.isTemplateIssue).length} template`} />
        <MetricCard icon={<Search className="h-4 w-4" />} label="Discovery" value={result.discovery.sitemapAvailable ? "Sitemap" : "BFS"} sublabel={`${result.discovery.totalUnique} URLs`} />
        <MetricCard icon={<Clock className="h-4 w-4" />} label="Duration" value={`${Math.round(result.duration / 1000)}s`} sublabel={formatDuration(result.duration)} />
      </div>

      {/* Pattern Analysis */}
      {result.patterns.length > 0 && <PatternSection patterns={result.patterns} />}

      {/* Errors */}
      {result.errors.length > 0 && <ErrorSection errors={result.errors} />}

      {/* Page Results */}
      <PageResultsSection pages={result.pages} />
    </div>
  );
}

// ── Phase Timeline ──

function PhaseTimeline({ timing, auth }: { timing: AuditResult["timing"]; auth?: AuditResult["auth"] }) {
  const phases = [
    { name: "Auth", duration: timing.auth, icon: <Shield className="h-3.5 w-3.5" />, status: auth?.authenticated ? "success" : auth ? "error" : "skipped" },
    { name: "Discover", duration: timing.discovery, icon: <Search className="h-3.5 w-3.5" />, status: "success" as const },
    { name: "Scan", duration: timing.scanning, icon: <Activity className="h-3.5 w-3.5" />, status: "success" as const },
    { name: "Analyze", duration: timing.analysis, icon: <BarChart3 className="h-3.5 w-3.5" />, status: "success" as const },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {phases.map((p, i) => (
        <div key={p.name} className="flex items-center">
          {i > 0 && <div className="w-4 h-px bg-neutral-300 dark:bg-neutral-600 mx-1" />}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
            p.status === "success" ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800"
            : p.status === "error" ? "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
            : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border border-neutral-200 dark:border-neutral-700"
          }`}>
            {p.icon}
            <span>{p.name}</span>
            <span className="text-[10px] opacity-70">{p.duration > 0 ? `${(p.duration / 1000).toFixed(1)}s` : "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Auth Status ──

function AuthStatusCard({ auth }: { auth: NonNullable<AuditResult["auth"]> }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${
      auth.authenticated && !auth.sessionExpired
        ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/50"
        : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/50"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
          auth.authenticated && !auth.sessionExpired ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
        }`}>
          {auth.authenticated && !auth.sessionExpired
            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : <XCircle className="h-4 w-4 text-red-600" />
          }
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            {auth.authenticated && !auth.sessionExpired
              ? `Authenticated via ${auth.method}`
              : auth.sessionExpired
                ? "Session expired during audit"
                : `Authentication failed (${auth.method})`
            }
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {auth.authenticated
              ? `${auth.sessionPages || 0} pages scanned with shared session`
              : "Pages behind login were not accessible"
            }
          </p>
        </div>
      </div>
      {auth.proof && (
        <div className="hidden sm:block">
          <img
            src={`data:image/jpeg;base64,${auth.proof}`}
            alt="Auth proof"
            className="h-12 w-20 object-cover rounded border border-neutral-200 dark:border-neutral-700"
          />
        </div>
      )}
    </div>
  );
}

// ── Pattern Analysis ──

function PatternSection({ patterns }: { patterns: ViolationPattern[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          Violation Patterns
          <Badge variant="outline" className="ml-auto">{patterns.length}</Badge>
        </CardTitle>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Issues appearing on multiple pages — likely template or layout problems
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {patterns.slice(0, 8).map((p) => (
          <div key={p.ruleId} className="flex items-center gap-3 p-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/50">
            <Badge
              variant={p.impact === "critical" ? "critical" : p.impact === "serious" ? "serious" : "outline"}
              className="shrink-0 text-[10px]"
            >
              {p.impact}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-white truncate">{p.description}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                {p.ruleId} · {p.pageCount} pages
                {p.isTemplateIssue && <span className="ml-2 text-violet-600 dark:text-violet-400 font-medium">⚡ Template Issue</span>}
              </p>
            </div>
            <span className="text-lg font-bold text-neutral-400 dark:text-neutral-500">{p.pageCount}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Errors ──

function ErrorSection({ errors }: { errors: CrawlError[] }) {
  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Issues ({errors.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {errors.slice(0, 6).map((err, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <Badge variant="outline" className="text-[9px] shrink-0 mt-0.5 uppercase">{err.phase}</Badge>
            <span className="text-amber-700 dark:text-amber-300 break-all">
              {err.url.replace(/^https?:\/\/[^/]+/, "")}:
              <span className="ml-1 text-amber-600 dark:text-amber-400">{err.error}</span>
            </span>
          </div>
        ))}
        {errors.length > 6 && (
          <p className="text-xs text-amber-600 pt-1">...and {errors.length - 6} more</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page Results ──

function PageResultsSection({ pages }: { pages: PageResult[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-500" />
          Page Results
          <Badge variant="outline" className="ml-auto">{pages.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {pages.map((p) => (
            <div
              key={p.url}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors group"
            >
              {/* Score circle */}
              <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                p.error ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-400"
                : p.score >= 90 ? "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400"
                : p.score >= 70 ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
                : p.score >= 50 ? "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
              }`}>
                {p.error ? "✗" : p.score > 0 ? Math.round(p.score) : "—"}
              </div>

              {/* Page info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">
                    {p.pageTitle || p.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                  </p>
                  {p.importance > 0.7 && (
                    <span className="text-[9px] bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">HIGH</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate font-mono">
                    {p.url.replace(/^https?:\/\/[^/]+/, "")}
                  </p>
                  {p.scanDuration && (
                    <span className="text-[10px] text-neutral-400 shrink-0">{(p.scanDuration / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>

              {/* Violations summary */}
              <div className="flex items-center gap-1.5 shrink-0">
                {p.error && <Badge variant="destructive" className="text-[10px]">Error</Badge>}
                {!p.error && p.critical > 0 && <Badge variant="critical" className="text-[10px]">{p.critical} crit</Badge>}
                {!p.error && p.serious > 0 && <Badge variant="serious" className="text-[10px]">{p.serious} ser</Badge>}
                {!p.error && p.violations === 0 && p.scanId && (
                  <Badge className="text-[10px] bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800">Clean</Badge>
                )}
              </div>

              {/* Report link */}
              {p.scanId && (
                <Link
                  href={`/report/${p.scanId}`}
                  className="text-neutral-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Metric Card ──

function MetricCard({ icon, label, value, sublabel, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  color?: "green" | "yellow" | "red";
}) {
  const colorClass = color === "green" ? "text-green-600 dark:text-green-400"
    : color === "yellow" ? "text-yellow-600 dark:text-yellow-400"
    : color === "red" ? "text-red-600 dark:text-red-400"
    : "text-neutral-900 dark:text-white";

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3">
      <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400 mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
      {sublabel && <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">{sublabel}</p>}
    </div>
  );
}

// ── Helpers ──

function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}
