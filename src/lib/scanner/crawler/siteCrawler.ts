/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RegLayer — Enterprise Site Audit Engine v3
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Architecture (enterprise-grade pipeline, 500+ page capable):
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  Phase 1: CONNECT — Launch browser, authenticate, verify session          │
 * │  Phase 2: DISCOVER — Sitemap.xml + BFS traversal + importance scoring     │
 * │  Phase 3: AUDIT — Parallel scans with backpressure, retries, rate limit   │
 * │  Phase 4: ANALYZE — Pattern detection, template issues, priority scoring  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * v3 enterprise upgrades over v2:
 * - Background job execution with real-time progress events
 * - 500-page capacity (up from 50)
 * - Configurable concurrency up to 10 parallel scans
 * - Auto-retry failed pages (configurable, default 2 retries)
 * - Rate limiting to avoid overwhelming target servers
 * - Cancel support — graceful mid-crawl abort
 * - ETA calculation based on rolling average scan time
 * - Per-page progress events for live UI updates
 * - Memory-aware: streams results, doesn't buffer screenshots
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { launchBrowser, isServerless } from "@/lib/scanner/browser/launch";
import { humanizeCrawlError } from "./crawlErrors";
import { applyAuthToContext, AuthenticationError } from "@/lib/scanner/auth";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";
import { persistScan } from "@/services/scanService";
import { logger } from "@/lib/telemetry/logger";
import { jobManager, type JobEvent } from "./job-manager";
import { computeLitigationSurface, type LitigationSurface } from "@/lib/risk/litigationSurface";
import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AuthConfig } from "@/lib/validations/auth";
import type { ScanOptions } from "@/lib/types";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  auth?: AuthConfig;
  /** Enable sitemap.xml discovery. Default: true */
  useSitemap?: boolean;
  /** Delay between requests in ms (rate limiting). Default: 200 */
  requestDelay?: number;
  /** Max retries per failed page. Default: 2 */
  maxRetries?: number;
  /**
   * Absolute wall-clock deadline (Date.now() ms). When set (e.g. by the
   * serverless route to ~10s under the function maxDuration), the crawl stops
   * scheduling work and returns a "partial" result before the platform kills
   * the function — so the job always reaches a terminal state instead of
   * hanging forever at "processing".
   */
  deadline?: number;
  /** Job ID for progress reporting */
  jobId?: string;
  /** Known routes to inject directly (bypasses BFS — e.g. admin sidebar routes) */
  knownRoutes?: string[];
  /** Owning user's email — used to persist each crawled page as a real Scan row */
  userEmail?: string;
  /** Pre-resolved workspace for the crawl (scopes persisted Scan rows + quota) */
  workspaceId?: string;
  /** Pre-resolved user id for the crawl */
  userId?: string;
  /** Optional Site to link persisted Scan rows to */
  siteId?: string;
}

/**
 * Outcome of a finished crawl, so the UI can tell apart a real success from a
 * run that completed but scanned nothing — instead of rendering a misleading
 * "score 0" success screen.
 *  - "ok":          at least one page scanned successfully
 *  - "all-failed":  pages were discovered but every scan failed
 *  - "no-pages":    discovery found nothing scannable
 *  - "launch-failed": the browser could not start at all
 */
export type CrawlOutcome = "ok" | "all-failed" | "no-pages" | "launch-failed" | "partial";

export interface CrawlResult {
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
  pages: CrawlPageResult[];
  auth?: AuthStatus;
  errors: CrawlError[];
  timing: CrawlTiming;
  patterns: ViolationPattern[];
  discovery: DiscoveryMeta;
  /**
   * Site-wide ADA litigation exposure derived from the aggregate violations —
   * the concrete backing for the "ADA litigation surface" promise. Absent on
   * empty/failed crawls and older records.
   */
  litigationSurface?: LitigationSurface;
  /** Set on every finished crawl. Absent on older records → treat as "ok". */
  outcome?: CrawlOutcome;
}

export interface CrawlPageResult {
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
  performance?: PagePerformance;
  screenshot?: string;
  error?: string;
  retryCount?: number;
}

export interface AuthStatus {
  authenticated: boolean;
  method: string;
  sessionPages?: number;
  proof?: string;
  sessionExpired?: boolean;
}

export interface CrawlError {
  url: string;
  phase: "auth" | "discovery" | "scan" | "analysis";
  error: string;
  timestamp: number;
}

export interface CrawlTiming {
  auth: number;
  discovery: number;
  scanning: number;
  analysis: number;
  total: number;
}

export interface ViolationPattern {
  ruleId: string;
  description: string;
  pageCount: number;
  impact: "critical" | "serious" | "moderate" | "minor";
  sampleUrls: string[];
  isTemplateIssue: boolean;
}

export interface DiscoveryMeta {
  sitemapUrls: number;
  linkUrls: number;
  totalUnique: number;
  sitemapAvailable: boolean;
}

interface PagePerformance {
  domContentLoaded: number;
  loadTime: number;
  domNodes: number;
}

// ══════════════════════════════════════════════════════════════
// URL UTILITIES
// ══════════════════════════════════════════════════════════════

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.searchParams.delete("_rsc");
    parsed.searchParams.delete("__nextDataReq");
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  try { return new URL(url).origin === origin; } catch { return false; }
}

function matchesPatterns(url: string, include?: string[], exclude?: string[]): boolean {
  if (exclude?.length) {
    for (const p of exclude) { if (url.includes(p)) return false; }
  }
  if (include?.length) {
    return include.some((p) => url.includes(p));
  }
  return true;
}

const SKIP_EXTENSIONS = new Set([
  ".pdf", ".zip", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".mp4", ".webm", ".mp3", ".woff", ".woff2", ".ttf", ".eot",
  ".css", ".js", ".map", ".json", ".xml", ".rss",
]);

const SKIP_PATHS = ["/api/", "/_next/", "/static/", "/__nextjs", "/favicon"];

function shouldSkipUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    for (const ext of SKIP_EXTENSIONS) { if (path.endsWith(ext)) return true; }
    for (const p of SKIP_PATHS) { if (path.includes(p)) return true; }
  } catch { return true; }
  return false;
}

// ══════════════════════════════════════════════════════════════
// SITEMAP DISCOVERY
// ══════════════════════════════════════════════════════════════

/** Hard caps so a giant/malformed sitemap can't exhaust memory or CPU. */
const MAX_SITEMAP_URLS = 5000;
const MAX_SITEMAP_BYTES = 5_000_000;

async function discoverFromSitemap(origin: string): Promise<string[]> {
  const urls: string[] = [];
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap-0.xml`];

  for (const sitemapUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "RegLayer-Auditor/3.0" },
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      let xml = await res.text();
      // Bound parsing so a giant or malformed sitemap can't exhaust memory/CPU:
      // cap the bytes scanned, bound each <loc> (no '<', ≤2KB) to avoid pathological
      // backtracking, and stop after MAX_SITEMAP_URLS.
      if (xml.length > MAX_SITEMAP_BYTES) xml = xml.slice(0, MAX_SITEMAP_BYTES);
      const locMatches = xml.matchAll(/<loc>\s*([^<]{1,2048}?)\s*<\/loc>/gi);
      for (const match of locMatches) {
        if (urls.length >= MAX_SITEMAP_URLS) break;
        const loc = match[1].trim();
        if (loc && isSameOrigin(loc, origin) && !shouldSkipUrl(loc)) {
          urls.push(normalizeUrl(loc));
        }
      }
      if (urls.length >= MAX_SITEMAP_URLS) break;
    } catch { /* sitemap not available */ }
  }
  return [...new Set(urls)];
}

// ══════════════════════════════════════════════════════════════
// LINK DISCOVERY
// ══════════════════════════════════════════════════════════════

async function discoverLinks(page: Page, origin: string): Promise<string[]> {
  return page.evaluate((orig: string) => {
    const links = new Set<string>();
    document.querySelectorAll("a[href]").forEach((el) => {
      try {
        const href = (el as HTMLAnchorElement).href;
        if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        const url = new URL(href);
        if (url.origin !== orig) return;
        url.hash = "";
        url.searchParams.delete("_rsc");
        const normalized = url.toString().replace(/\/$/, "") || url.origin;
        links.add(normalized);
      } catch { /* skip invalid */ }
    });
    return [...links];
  }, origin);
}

async function waitForPageReady(page: Page, timeout = 10000): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout });
  } catch { /* timeout OK */ }
  await page.waitForTimeout(1000);
}

function isLoginRedirect(currentUrl: string, auth?: AuthConfig): boolean {
  if (!auth || auth.method !== "form") return false;
  const loginUrl = (auth as { loginUrl?: string }).loginUrl;
  if (!loginUrl) return false;
  try {
    const loginPath = new URL(loginUrl).pathname;
    const currentPath = new URL(currentUrl).pathname;
    return currentPath === loginPath || currentPath.includes("/login") || currentPath.includes("/signin");
  } catch { return false; }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════════
// PATTERN ANALYSIS
// ══════════════════════════════════════════════════════════════

interface RawViolation {
  ruleId: string;
  description: string;
  impact: string;
  url: string;
}

function analyzePatterns(violations: RawViolation[], totalPages: number): ViolationPattern[] {
  const ruleMap = new Map<string, { description: string; impact: string; urls: Set<string> }>();

  for (const v of violations) {
    const existing = ruleMap.get(v.ruleId);
    if (existing) { existing.urls.add(v.url); }
    else { ruleMap.set(v.ruleId, { description: v.description, impact: v.impact, urls: new Set([v.url]) }); }
  }

  return [...ruleMap.entries()]
    .filter(([, data]) => data.urls.size > 1)
    .map(([ruleId, data]) => ({
      ruleId,
      description: data.description,
      impact: data.impact as ViolationPattern["impact"],
      pageCount: data.urls.size,
      sampleUrls: [...data.urls].slice(0, 5),
      isTemplateIssue: data.urls.size > totalPages * 0.5,
    }))
    .sort((a, b) => b.pageCount - a.pageCount);
}

// ══════════════════════════════════════════════════════════════
// PROGRESS HELPER
// ══════════════════════════════════════════════════════════════

function emit(jobId: string | undefined, event: JobEvent): void {
  if (jobId) jobManager.emitEvent(jobId, event);
}

function isCancelled(jobId: string | undefined): boolean {
  if (!jobId) return false;
  const job = jobManager.getJob(jobId);
  return job?.cancelRequested ?? false;
}

/** Close a browser/context/page without ever throwing (teardown must not mask the real error). */
async function safeClose(closable: { close: () => Promise<void> } | null | undefined): Promise<void> {
  try { await closable?.close(); } catch { /* best-effort */ }
}

/**
 * Effective scan concurrency. Serverless functions are memory-constrained, so
 * launching many headless Chromiums at once is the direct cause of
 * "Target closed" crashes — cap it there regardless of the requested value.
 */
function effectiveConcurrency(requested: number): number {
  const safe = Math.max(1, Math.min(requested || 1, 10));
  return isServerless() ? Math.min(safe, 2) : safe;
}

// ══════════════════════════════════════════════════════════════
// MAIN ENGINE
// ══════════════════════════════════════════════════════════════

export async function crawlSite(config: CrawlConfig): Promise<CrawlResult> {
  const startTime = Date.now();
  const crawlId = config.jobId || `audit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  const crawlLogger = logger.withContext({ crawlId, startUrl: config.startUrl });
  const requestDelay = config.requestDelay ?? 200;
  const maxRetries = config.maxRetries ?? 2;
  // Wall-clock budget. On serverless the route sets this ~10s under maxDuration
  // so the crawl returns a "partial" result before the lambda is killed.
  const deadline = config.deadline ?? startTime + 10 * 60 * 1000;
  const isExpired = () => Date.now() > deadline;
  let timedOut = false;

  // Mutable: a root-level redirect (apex→www, http→https) moves the canonical
  // origin. We adopt the landed origin after the first navigation so discovery
  // isn't confined to the pre-redirect origin (which silently yields a 1-page
  // "success"). See the depth-0 handling in the discovery loop below.
  let origin = new URL(config.startUrl).origin;
  const results: CrawlPageResult[] = [];
  const errors: CrawlError[] = [];
  const allViolations: RawViolation[] = [];
  let authStatus: AuthStatus | undefined;
  let sessionCookies: Array<{
    name: string; value: string; domain: string;
    path?: string; secure?: boolean; httpOnly?: boolean;
    sameSite?: "Strict" | "Lax" | "None"; expires?: number;
  }> = [];
  const timing: CrawlTiming = { auth: 0, discovery: 0, scanning: 0, analysis: 0, total: 0 };
  const inboundLinks = new Map<string, number>();

  // Scan time tracking for ETA
  const scanTimes: number[] = [];
  let pagesCompleted = 0;

  crawlLogger.info("Site audit v3 started", {
    maxPages: config.maxPages,
    maxDepth: config.maxDepth,
    concurrency: config.concurrency,
    auth: config.auth?.method || "none",
    requestDelay,
    maxRetries,
  });

  // ════════════════════════════════════════════════════════════
  // PHASE 1: CONNECT + AUTHENTICATE
  // ════════════════════════════════════════════════════════════

  emit(config.jobId, { type: "phase", phase: "connecting", timestamp: Date.now() });

  const authStart = Date.now();
  let browser: Browser | null = null;

  try {
    // launchBrowser() already retries transient Chromium crashes with backoff,
    // so reaching this catch means the browser genuinely could not start.
    browser = await launchBrowser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Browser launch failed";
    crawlLogger.error("Browser launch failed after retries", { error: msg });
    emit(config.jobId, { type: "error", error: humanizeCrawlError(msg), timestamp: Date.now() });
    return {
      ...buildEmptyResult(crawlId, config, startTime, [
        { url: config.startUrl, phase: "auth", error: `Browser launch failed: ${msg}`, timestamp: Date.now() },
      ]),
      outcome: "launch-failed",
    };
  }

  let context: BrowserContext;
  let page: Page;

  try {
    context = await (browser as unknown as { newContext: (o: unknown) => Promise<BrowserContext> }).newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1280, height: 720 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    });
    page = await context.newPage();
  } catch (err) {
    await safeClose(browser);
    const msg = err instanceof Error ? err.message : "Context creation failed";
    emit(config.jobId, { type: "error", error: humanizeCrawlError(msg), timestamp: Date.now() });
    return {
      ...buildEmptyResult(crawlId, config, startTime, [
        { url: config.startUrl, phase: "auth", error: msg, timestamp: Date.now() },
      ]),
      outcome: "launch-failed",
    };
  }

  if (config.auth && config.auth.method !== "none") {
    crawlLogger.info("Authenticating", { method: config.auth.method });
    try {
      const authResult = await applyAuthToContext(context, page, config.auth);
      if (!authResult.authenticated) {
        throw new AuthenticationError(
          authResult.error || "Authentication returned non-authenticated state",
          config.auth.method,
        );
      }

      await page.goto(config.startUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      await waitForPageReady(page, 10000);

      if (isLoginRedirect(page.url(), config.auth)) {
        throw new AuthenticationError(
          "Target page redirected to login — credentials may be incorrect",
          config.auth.method,
        );
      }

      let proof: string | undefined;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40 });
        proof = Buffer.from(buf).toString("base64");
      } catch { /* non-critical */ }

      authStatus = { authenticated: true, method: authResult.method, proof };
      emit(config.jobId, { type: "auth-status", authenticated: true, method: authResult.method, timestamp: Date.now() });
      crawlLogger.info("Authentication verified");
    } catch (authErr) {
      const message = authErr instanceof Error ? authErr.message : "Authentication failed";
      crawlLogger.error("Authentication failed", { error: message });

      let failProof: string | undefined;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40 });
        failProof = Buffer.from(buf).toString("base64");
      } catch { /* ignore */ }

      await safeClose(context);
      await safeClose(browser);
      timing.auth = Date.now() - authStart;
      timing.total = Date.now() - startTime;

      emit(config.jobId, { type: "auth-status", authenticated: false, method: config.auth.method, timestamp: Date.now() });
      emit(config.jobId, { type: "error", error: humanizeCrawlError(message, "auth"), timestamp: Date.now() });

      return {
        ...buildEmptyResult(crawlId, config, startTime, [
          { url: config.startUrl, phase: "auth", error: `Authentication failed: ${message}`, timestamp: Date.now() },
        ]),
        auth: { authenticated: false, method: config.auth.method, proof: failProof },
        timing,
        outcome: "launch-failed",
      };
    }
  }

  timing.auth = Date.now() - authStart;

  // Cancel check
  if (isCancelled(config.jobId)) {
    await context.close();
    await browser.close();
    emit(config.jobId, { type: "cancelled", timestamp: Date.now() });
    return buildEmptyResult(crawlId, config, startTime, []);
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 2: DISCOVER
  // ════════════════════════════════════════════════════════════

  emit(config.jobId, { type: "phase", phase: "discovering", timestamp: Date.now() });

  const discoveryStart = Date.now();
  const visited = new Set<string>();
  const rootUrl = normalizeUrl(config.startUrl);
  // child url -> parent url, so the live site-map graph can draw real edges.
  const parentOf = new Map<string, string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: rootUrl, depth: 0 },
  ];
  let sitemapUrlCount = 0;
  let sitemapAvailable = false;

  // Inject known routes (admin sidebar pages, etc.)
  let knownRouteCount = 0;
  if (config.knownRoutes?.length) {
    for (const route of config.knownRoutes) {
      const fullUrl = route.startsWith("http") ? route : `${origin}${route}`;
      const normalized = normalizeUrl(fullUrl);
      if (!shouldSkipUrl(normalized) && isSameOrigin(normalized, origin)
        && matchesPatterns(normalized, config.includePatterns, config.excludePatterns)) {
        queue.push({ url: normalized, depth: 1 });
        knownRouteCount++;
        emit(config.jobId, { type: "discovery", url: normalized, source: "sitemap", total: queue.length, from: rootUrl, depth: 1, timestamp: Date.now() });
      }
    }
    if (knownRouteCount > 0) crawlLogger.info("Known routes injected", { count: knownRouteCount });
  }

  // Sitemap discovery
  if (config.useSitemap !== false) {
    try {
      const sitemapUrls = await discoverFromSitemap(origin);
      sitemapUrlCount = sitemapUrls.length;
      sitemapAvailable = sitemapUrls.length > 0;
      for (const sUrl of sitemapUrls) {
        if (!shouldSkipUrl(sUrl) && matchesPatterns(sUrl, config.includePatterns, config.excludePatterns)) {
          queue.push({ url: sUrl, depth: 1 });
          emit(config.jobId, { type: "discovery", url: sUrl, source: "sitemap", total: queue.length, from: rootUrl, depth: 1, timestamp: Date.now() });
        }
      }
      if (sitemapAvailable) crawlLogger.info("Sitemap discovered", { urls: sitemapUrlCount });
    } catch { /* proceed without sitemap */ }
  }

  // BFS discovery with authenticated session
  while (queue.length > 0 && visited.size < config.maxPages) {
    if (isCancelled(config.jobId)) break;
    if (isExpired()) { timedOut = true; break; }

    const current = queue.shift()!;
    const normalizedUrl = normalizeUrl(current.url);

    if (visited.has(normalizedUrl)) continue;
    if (current.depth > config.maxDepth) continue;
    if (!isSameOrigin(normalizedUrl, origin)) continue;
    if (shouldSkipUrl(normalizedUrl)) continue;
    if (!matchesPatterns(normalizedUrl, config.includePatterns, config.excludePatterns)) continue;

    visited.add(normalizedUrl);

    try {
      await page.goto(normalizedUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      await waitForPageReady(page, 6000);

      // Adopt a root-level redirect to the canonical origin (apex→www,
      // http→https, bare→canonical). Without this, discovery filters every
      // discovered link against the PRE-redirect origin → it finds nothing and
      // the crawl silently returns a misleading 1-page "success".
      if (current.depth === 0) {
        try {
          const landed = new URL(page.url()).origin;
          if (landed !== origin) {
            crawlLogger.info("Adopting redirected origin for discovery", { from: origin, to: landed });
            origin = landed;
            // Don't re-scan the same content under both origins.
            visited.add(normalizeUrl(page.url()));
          }
        } catch { /* keep the original origin */ }
      }

      // Session health check
      if (config.auth && isLoginRedirect(page.url(), config.auth)) {
        crawlLogger.warn("Session expired during discovery", { url: normalizedUrl });
        errors.push({ url: normalizedUrl, phase: "discovery", error: "Session expired — redirected to login", timestamp: Date.now() });
        if (authStatus) authStatus.sessionExpired = true;
        break;
      }

      // Stream a live screenshot of the page we're on, so the viewport shows
      // each page as it's visited DURING DISCOVERY (the longest phase on SPAs).
      // Capture a BOUNDED-TALL clip (top → up to 3 screens) so the live viewport
      // can scroll the page top-to-bottom like a real scanner reading it. Capped
      // height keeps payload sane; best-effort with a viewport-shot fallback so a
      // clip/eval failure never blanks the frame or slows the crawl.
      if (config.jobId) {
        try {
          const dims = await page.evaluate(() => {
            const vw = window.innerWidth || 1280;
            const vh = window.innerHeight || 720;
            const h = Math.max(vh, Math.min(document.documentElement.scrollHeight || 0, vh * 3));
            return { w: vw, h: Math.round(h) };
          });
          const buf = await page.screenshot({
            type: "jpeg",
            quality: 30,
            clip: { x: 0, y: 0, width: dims.w, height: dims.h },
          });
          jobManager.setLiveShot(
            config.jobId,
            Buffer.from(buf).toString("base64"),
            normalizedUrl,
            dims.h / dims.w, // aspect (height/width) → drives the scroll pan client-side
          );
        } catch {
          try {
            const buf = await page.screenshot({ type: "jpeg", quality: 35 });
            jobManager.setLiveShot(config.jobId, Buffer.from(buf).toString("base64"), normalizedUrl);
          } catch { /* best-effort live frame */ }
        }
      }

      // Discover links
      if (current.depth < config.maxDepth) {
        const links = await discoverLinks(page, origin);
        for (const link of links) {
          const nl = normalizeUrl(link);
          if (!visited.has(nl) && !shouldSkipUrl(nl) && isSameOrigin(nl, origin)
            && matchesPatterns(nl, config.includePatterns, config.excludePatterns)) {
            queue.push({ url: nl, depth: current.depth + 1 });
            inboundLinks.set(nl, (inboundLinks.get(nl) || 0) + 1);
            if (!parentOf.has(nl)) parentOf.set(nl, normalizedUrl);
          }
        }
      }

      // Emit discovery progress
      emit(config.jobId, {
        type: "discovery", url: normalizedUrl, source: "bfs", total: visited.size,
        from: parentOf.get(normalizedUrl) ?? (normalizedUrl === rootUrl ? undefined : rootUrl),
        depth: current.depth, timestamp: Date.now(),
      });

      // Emit progress with discovered count
      emit(config.jobId, {
        type: "progress",
        progress: {
          phase: "discovering",
          pagesDiscovered: visited.size,
          pagesScanned: 0,
          pagesTotal: Math.min(config.maxPages, visited.size + queue.length),
          pagesFailed: 0,
          avgScore: 0,
          totalViolations: 0,
          patternsFound: 0,
          phaseTiming: { auth: timing.auth, discovery: Date.now() - discoveryStart },
        },
        timestamp: Date.now(),
      });

      // Rate limit discovery navigation
      if (requestDelay > 0 && queue.length > 0) {
        await delay(Math.min(requestDelay, 100));
      }
    } catch (err) {
      errors.push({
        url: normalizedUrl, phase: "discovery",
        error: err instanceof Error ? err.message : "Navigation failed",
        timestamp: Date.now(),
      });
      // Only abort discovery if the BROWSER itself died (every remaining goto
      // would fail identically). A per-page navigation TIMEOUT or load error must
      // NOT stop the crawl — skip that page and keep discovering. (Previously
      // isTransientBrowserError matched "timed out", so one slow page aborted the
      // whole discovery → crawls capped at the few pages found before the first
      // slow page.)
      const msg = err instanceof Error ? err.message : "";
      const browserDead =
        /Target closed|Target\.createTarget|Session closed|Connection closed|browser has disconnected|Protocol error/i.test(msg) ||
        !(browser as { isConnected?: () => boolean }).isConnected?.();
      if (browserDead) {
        crawlLogger.warn("Discovery browser died — proceeding to audit with pages found so far", {
          discovered: visited.size,
        });
        break;
      }
    }
  }

  // Export session cookies
  try {
    const cookies = await context.cookies();
    sessionCookies = cookies.map((c) => ({
      name: c.name, value: c.value, domain: c.domain,
      path: c.path, secure: c.secure, httpOnly: c.httpOnly,
      sameSite: c.sameSite as "Strict" | "Lax" | "None" | undefined,
      expires: c.expires > 0 ? c.expires : undefined,
    }));
  } catch { /* non-critical */ }

  await context.close();
  await browser.close();
  browser = null;

  const linkUrlCount = Math.max(0, visited.size - sitemapUrlCount);
  timing.discovery = Date.now() - discoveryStart;
  crawlLogger.info("Discovery complete", { total: visited.size, sitemap: sitemapUrlCount, links: linkUrlCount });

  // Cancel check
  if (isCancelled(config.jobId)) {
    emit(config.jobId, { type: "cancelled", timestamp: Date.now() });
    return buildEmptyResult(crawlId, config, startTime, []);
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 3: AUDIT (parallel with backpressure + retry)
  // ════════════════════════════════════════════════════════════

  emit(config.jobId, { type: "phase", phase: "scanning", timestamp: Date.now() });

  const scanStart = Date.now();
  const pagesToScan = [...visited].slice(0, config.maxPages);

  if (pagesToScan.length === 0) {
    timing.scanning = 0;
    timing.analysis = 0;
    timing.total = Date.now() - startTime;
    // Finishing with nothing to scan is a completed (if empty) audit, not a hard
    // error — emit `complete` so the UI shows a clear "no pages found" state with
    // the discovery stats, rather than a scary raw-error screen.
    const emptyResult: CrawlResult = {
      ...buildEmptyResult(crawlId, config, startTime, errors.length > 0 ? errors : [
        { url: config.startUrl, phase: "discovery", error: "No scannable pages discovered", timestamp: Date.now() },
      ]),
      auth: authStatus,
      timing,
      discovery: { sitemapUrls: sitemapUrlCount, linkUrls: linkUrlCount, totalUnique: 0, sitemapAvailable },
      outcome: "no-pages",
    };
    emit(config.jobId, { type: "complete", result: emptyResult, timestamp: Date.now() });
    return emptyResult;
  }

  const totalPages = pagesToScan.length;
  // Cap concurrency on serverless: launching many headless Chromiums at once is
  // the direct cause of "Target closed" crashes under memory pressure.
  const concurrency = effectiveConcurrency(config.concurrency);
  crawlLogger.info("Audit phase started", { pages: totalPages, concurrency, requested: config.concurrency });

  // Build scan options with exported session.
  // includeScreenshot drives the live "watch the crawl" viewport. The shot is
  // captured from the page axe already loaded (no extra navigation) and lands
  // on each page's Scan row via persistScan — it is intentionally NOT buffered
  // into the in-memory results array below, and is lazy-loaded by the client
  // from /api/scan/[scanId]/thumbnail. So large crawls stay memory-bounded.
  const validCookies = sessionCookies.filter((c) => c.name && c.value && c.domain);
  const scanOptions: ScanOptions = {
    includeScreenshot: true,
    ...(validCookies.length > 0
      ? { auth: { method: "cookies" as const, cookies: validCookies } }
      : config.auth && config.auth.method !== "none" ? { auth: config.auth } : {}),
  };

  const maxInbound = Math.max(1, ...inboundLinks.values());
  let activeScans = 0;

  const scanPage = async (url: string, depth: number, index: number): Promise<void> => {
    const importance = Math.min(1, (inboundLinks.get(url) || 1) / maxInbound);

    emit(config.jobId, {
      type: "page-start", url, index, total: totalPages, timestamp: Date.now(),
    });

    let lastError = "";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (isCancelled(config.jobId)) return;
      if (isExpired()) { timedOut = true; return; }

      const pageStart = Date.now();
      try {
        // Rate limit between scans
        if (requestDelay > 0 && attempt === 0 && index > 0) {
          await delay(requestDelay);
        }

        // Hard per-page timeout so a single hung page can't stall a worker
        // (and, across retries, the whole audit) for minutes.
        const scanResult = await Promise.race([
          executeScanPipeline(url, scanOptions),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Page scan timed out")), 35_000)
          ),
        ]);

        for (const v of scanResult.violations) {
          allViolations.push({
            ruleId: v.id || "unknown",
            description: v.description || v.help || "Unknown",
            impact: v.impact || "moderate",
            url,
          });
        }

        const scanDuration = Date.now() - pageStart;
        scanTimes.push(scanDuration);
        pagesCompleted++;

        // Persist each successful page as a real Scan row (R-5).
        // This makes the flagship audit durable and counts each page against
        // the scan quota. Best-effort: a DB failure must not fail the crawl.
        if (config.userEmail || config.workspaceId) {
          try {
            const compliance = evaluateCompliance(scanResult.id, scanResult.violations);
            await persistScan(scanResult, compliance, config.userEmail, {
              workspaceId: config.workspaceId,
              userId: config.userId,
              siteId: config.siteId,
              metadata: { crawlId, startUrl: config.startUrl, auditVersion: "3.0" },
            });
          } catch (persistErr) {
            crawlLogger.warn("Failed to persist crawled page scan", {
              url,
              scanId: scanResult.id,
              error: persistErr instanceof Error ? persistErr.message : "Unknown",
            });
          }
        }

        results.push({
          url,
          scanId: scanResult.id,
          score: scanResult.summary.score,
          violations: scanResult.summary.totalViolations,
          critical: scanResult.summary.critical,
          serious: scanResult.summary.serious,
          moderate: scanResult.summary.moderate || 0,
          minor: scanResult.summary.minor || 0,
          depth,
          pageTitle: scanResult.metadata.pageTitle,
          scanDuration,
          importance,
          consoleErrors: [],
          // Screenshot is persisted on the Scan row (lazy-loaded via
          // /api/scan/[scanId]/thumbnail) and deliberately NOT buffered here,
          // keeping memory bounded for multi-hundred-page crawls.
          retryCount: attempt,
        });

        // Keep the live viewport on the page we just scanned (its real
        // screenshot), so scanning continues the page-by-page "watch it work"
        // motion seamlessly from discovery. The same shot is persisted on the
        // Scan row for the filmstrip/thumbnail; surfacing it inline here avoids
        // the transient 404 flash while that row settles.
        if (config.jobId && scanResult.screenshot) {
          jobManager.setLiveShot(config.jobId, scanResult.screenshot);
        }

        // Calculate ETA
        const avgTime = scanTimes.reduce((a, b) => a + b, 0) / scanTimes.length;
        const remaining = totalPages - pagesCompleted;
        const eta = Math.round(avgTime * remaining / Math.max(concurrency, 1));
        const scanRate = pagesCompleted / ((Date.now() - scanStart) / 1000);

        // Emit page complete
        emit(config.jobId, {
          type: "page-complete",
          url,
          scanId: scanResult.id,
          score: scanResult.summary.score,
          violations: scanResult.summary.totalViolations,
          duration: scanDuration,
          index,
          total: totalPages,
          timestamp: Date.now(),
        });

        // Calculate live stats
        const validResults = results.filter((r) => r.scanId !== "");
        const scores = validResults.map((r) => r.score);
        const currentAvg = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

        // Emit progress update
        emit(config.jobId, {
          type: "progress",
          progress: {
            phase: "scanning",
            pagesDiscovered: visited.size,
            pagesScanned: pagesCompleted,
            pagesTotal: totalPages,
            pagesFailed: results.filter((r) => !!r.error).length,
            currentUrl: url,
            avgScore: currentAvg,
            totalViolations: allViolations.length,
            patternsFound: 0,
            eta,
            scanRate: Math.round(scanRate * 100) / 100,
            phaseTiming: {
              auth: timing.auth,
              discovery: timing.discovery,
              scanning: Date.now() - scanStart,
            },
          },
          timestamp: Date.now(),
        });

        return; // Success — exit retry loop
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Scan failed";
        if (attempt < maxRetries) {
          crawlLogger.warn("Page scan failed, retrying", { url, attempt: attempt + 1, error: lastError });
          await delay(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    // All retries exhausted
    errors.push({ url, phase: "scan", error: `${lastError} (after ${maxRetries + 1} attempts)`, timestamp: Date.now() });
    pagesCompleted++;
    results.push({
      url, scanId: "", score: 0, violations: 0, critical: 0, serious: 0,
      moderate: 0, minor: 0, depth, importance, consoleErrors: [], error: lastError,
      retryCount: maxRetries,
    });

    emit(config.jobId, {
      type: "page-error", url, error: lastError, index, total: totalPages, timestamp: Date.now(),
    });
  };

  // Parallel execution with backpressure
  const pending = pagesToScan.map((url, i) => ({
    url,
    depth: Math.min(config.maxDepth, Math.floor(i / 3) + (i === 0 ? 0 : 1)),
    index: i,
  }));
  const inFlight: Promise<void>[] = [];

  while (pending.length > 0 || inFlight.length > 0) {
    if (isCancelled(config.jobId) || isExpired()) {
      if (isExpired()) timedOut = true;
      // Stop scheduling new pages; let in-flight scans finish, then assemble
      // whatever we have into a partial result.
      if (inFlight.length > 0) await Promise.allSettled(inFlight);
      break;
    }

    while (pending.length > 0 && activeScans < concurrency && !isExpired()) {
      const { url, depth, index } = pending.shift()!;
      activeScans++;
      const p = scanPage(url, depth, index).finally(() => {
        activeScans--;
        const idx = inFlight.indexOf(p);
        if (idx > -1) inFlight.splice(idx, 1);
      });
      inFlight.push(p);
    }
    // Race a COPY: a settling promise's finally() splices `inFlight`, so racing
    // the live array risks iterating it mid-mutation.
    if (inFlight.length > 0) await Promise.race([...inFlight]);
  }

  timing.scanning = Date.now() - scanStart;

  // Cancel check
  if (isCancelled(config.jobId)) {
    emit(config.jobId, { type: "cancelled", timestamp: Date.now() });
    // Still return partial results
    timing.total = Date.now() - startTime;
    const validResults = results.filter((r) => r.scanId !== "");
    const scores = validResults.map((r) => r.score);
    const avgScore = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    return {
      id: crawlId, startUrl: config.startUrl, pagesScanned: validResults.length,
      pagesDiscovered: visited.size, averageScore: avgScore,
      lowestScore: { url: config.startUrl, score: 0 },
      highestScore: { url: config.startUrl, score: 0 },
      totalViolations: allViolations.length, criticalPages: [],
      duration: timing.total, pages: results, auth: authStatus, errors, timing,
      patterns: [], discovery: { sitemapUrls: sitemapUrlCount, linkUrls: linkUrlCount, totalUnique: visited.size, sitemapAvailable },
    };
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 4: ANALYZE
  // ════════════════════════════════════════════════════════════

  emit(config.jobId, { type: "phase", phase: "analyzing", timestamp: Date.now() });

  const analysisStart = Date.now();
  const validResults = results.filter((r) => r.scanId !== "");
  // Use the count of SUCCESSFULLY-scanned pages as the template-issue denominator
  // (a rule on >50% of scanned pages = template issue). Including failed pages
  // (scanId="") would understate template prevalence.
  const patterns = analyzePatterns(allViolations, validResults.length);

  // Site-wide ADA litigation surface from the aggregate violations — makes the
  // "ADA litigation surface" promise concrete: which lawsuit-driving issues are
  // present, how widespread, and the resulting exposure tier + dollar estimate.
  const litigationSurface = computeLitigationSurface(allViolations, validResults.length);
  const scores = validResults.map((r) => r.score);
  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  const sorted = [...validResults].sort((a, b) => a.score - b.score);
  const lowestScore = sorted[0] || { url: config.startUrl, score: 0 };
  const highestScore = sorted[sorted.length - 1] || { url: config.startUrl, score: 0 };

  const criticalPages = validResults
    .filter((r) => r.critical > 0)
    .sort((a, b) => b.critical - a.critical)
    .slice(0, 10);

  timing.analysis = Date.now() - analysisStart;
  timing.total = Date.now() - startTime;

  if (authStatus) authStatus.sessionPages = validResults.length;

  crawlLogger.info("Audit complete", {
    pagesScanned: validResults.length,
    averageScore,
    violations: validResults.reduce((s, r) => s + r.violations, 0),
    patterns: patterns.length,
    templateIssues: patterns.filter((p) => p.isTemplateIssue).length,
    duration: timing.total,
  });

  // NOTE(R-5): Per-page Scan rows (incl. crawl linkage metadata) are now
  // persisted inline as each page completes (see scanPage). The previous
  // prisma.scan.updateMany() here always matched 0 rows — those scan ids were
  // never inserted — so it has been removed.

  const finalResult: CrawlResult = {
    id: crawlId,
    startUrl: config.startUrl,
    pagesScanned: validResults.length,
    pagesDiscovered: visited.size,
    averageScore,
    lowestScore: { url: lowestScore.url, score: lowestScore.score },
    highestScore: { url: highestScore.url, score: highestScore.score },
    totalViolations: validResults.reduce((s, r) => s + r.violations, 0),
    criticalPages,
    duration: timing.total,
    pages: results.sort((a, b) => (a.error && !b.error) ? -1 : (!a.error && b.error) ? 1 : a.score - b.score),
    auth: authStatus,
    errors,
    timing,
    patterns,
    discovery: { sitemapUrls: sitemapUrlCount, linkUrls: linkUrlCount, totalUnique: visited.size, sitemapAvailable },
    litigationSurface,
    // Pages were discovered but every scan failed → tell the UI so it shows an
    // honest "couldn't scan any pages" state instead of a "score 0" success.
    outcome: validResults.length === 0 ? "all-failed" : timedOut ? "partial" : "ok",
  };

  emit(config.jobId, { type: "complete", result: finalResult, timestamp: Date.now() });

  return finalResult;
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

function buildEmptyResult(id: string, config: CrawlConfig, startTime: number, errors: CrawlError[]): CrawlResult {
  return {
    id, startUrl: config.startUrl, pagesScanned: 0, pagesDiscovered: 0,
    averageScore: 0, lowestScore: { url: config.startUrl, score: 0 },
    highestScore: { url: config.startUrl, score: 0 }, totalViolations: 0,
    criticalPages: [], duration: Date.now() - startTime, pages: [], errors,
    timing: { auth: 0, discovery: 0, scanning: 0, analysis: 0, total: Date.now() - startTime },
    patterns: [], discovery: { sitemapUrls: 0, linkUrls: 0, totalUnique: 0, sitemapAvailable: false },
  };
}
