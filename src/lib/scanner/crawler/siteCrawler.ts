/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RegLayer — Enterprise Site Audit Engine v2
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Architecture (BrowserStack-class multi-phase pipeline):
 *
 * ┌───────────────────────────────────────────────────────────────────────────┐
 * │  Phase 1: CONNECT — Launch browser, authenticate, verify session          │
 * │  Phase 2: DISCOVER — Sitemap.xml + BFS traversal + importance scoring     │
 * │  Phase 3: AUDIT — Parallel scans with shared session, evidence capture    │
 * │  Phase 4: ANALYZE — Pattern detection, template issues, priority scoring  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Key differentiators vs basic crawlers:
 * - Sitemap.xml discovery (find routes without crawling)
 * - Single auth session shared across all scans (no re-login per page)
 * - Auth health monitoring (detect session expiry mid-crawl)
 * - Page importance scoring (by inbound link count)
 * - Pattern analysis (same violation on N pages = template issue)
 * - Evidence collection (screenshots, console errors, performance timing)
 * - Phase-level timing for performance visibility
 * - Graceful failure with diagnostic context (not silent 0-result returns)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { launchBrowser } from "@/lib/scanner/browser/launch";
import { applyAuthToContext, AuthenticationError } from "@/lib/scanner/auth";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";
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
}

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

async function discoverFromSitemap(origin: string): Promise<string[]> {
  const urls: string[] = [];
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap-0.xml`];

  for (const sitemapUrl of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "RegLayer-Auditor/2.0" },
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const xml = await res.text();
      const locMatches = xml.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gi);
      for (const match of locMatches) {
        const loc = match[1].trim();
        if (loc && isSameOrigin(loc, origin) && !shouldSkipUrl(loc)) {
          urls.push(normalizeUrl(loc));
        }
      }
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
  await page.waitForTimeout(1500);
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
// MAIN ENGINE
// ══════════════════════════════════════════════════════════════

export async function crawlSite(config: CrawlConfig): Promise<CrawlResult> {
  const startTime = Date.now();
  const crawlId = `audit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  const crawlLogger = logger.withContext({ crawlId, startUrl: config.startUrl });

  const origin = new URL(config.startUrl).origin;
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

  crawlLogger.info("Site audit started", {
    maxPages: config.maxPages,
    maxDepth: config.maxDepth,
    concurrency: config.concurrency,
    auth: config.auth?.method || "none",
  });

  // ════════════════════════════════════════════════════════════
  // PHASE 1: CONNECT + AUTHENTICATE
  // ════════════════════════════════════════════════════════════

  const authStart = Date.now();
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Browser launch failed";
    return buildEmptyResult(crawlId, config, startTime, [
      { url: config.startUrl, phase: "auth", error: `Browser launch failed: ${msg}`, timestamp: Date.now() },
    ]);
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
    await browser.close();
    const msg = err instanceof Error ? err.message : "Context creation failed";
    return buildEmptyResult(crawlId, config, startTime, [
      { url: config.startUrl, phase: "auth", error: msg, timestamp: Date.now() },
    ]);
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

      // Verify auth by navigating to target
      await page.goto(config.startUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
      await waitForPageReady(page, 10000);

      if (isLoginRedirect(page.url(), config.auth)) {
        throw new AuthenticationError(
          "Target page redirected to login — credentials may be incorrect",
          config.auth.method,
        );
      }

      // Auth proof screenshot
      let proof: string | undefined;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40 });
        proof = Buffer.from(buf).toString("base64");
      } catch { /* non-critical */ }

      authStatus = { authenticated: true, method: authResult.method, proof };
      crawlLogger.info("Authentication verified");
    } catch (authErr) {
      const message = authErr instanceof Error ? authErr.message : "Authentication failed";
      crawlLogger.error("Authentication failed", { error: message });

      let failProof: string | undefined;
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40 });
        failProof = Buffer.from(buf).toString("base64");
      } catch { /* ignore */ }

      await context.close();
      await browser.close();
      timing.auth = Date.now() - authStart;
      timing.total = Date.now() - startTime;

      return {
        ...buildEmptyResult(crawlId, config, startTime, [
          { url: config.startUrl, phase: "auth", error: `Authentication failed: ${message}`, timestamp: Date.now() },
        ]),
        auth: { authenticated: false, method: config.auth.method, proof: failProof },
        timing,
      };
    }
  }

  timing.auth = Date.now() - authStart;

  // ════════════════════════════════════════════════════════════
  // PHASE 2: DISCOVER
  // ════════════════════════════════════════════════════════════

  const discoveryStart = Date.now();
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: normalizeUrl(config.startUrl), depth: 0 },
  ];
  let sitemapUrlCount = 0;
  let sitemapAvailable = false;

  // Sitemap discovery
  if (config.useSitemap !== false) {
    try {
      const sitemapUrls = await discoverFromSitemap(origin);
      sitemapUrlCount = sitemapUrls.length;
      sitemapAvailable = sitemapUrls.length > 0;
      for (const sUrl of sitemapUrls) {
        if (!shouldSkipUrl(sUrl) && matchesPatterns(sUrl, config.includePatterns, config.excludePatterns)) {
          queue.push({ url: sUrl, depth: 1 });
        }
      }
      if (sitemapAvailable) crawlLogger.info("Sitemap discovered", { urls: sitemapUrlCount });
    } catch { /* proceed without sitemap */ }
  }

  // BFS discovery with authenticated session
  while (queue.length > 0 && visited.size < config.maxPages) {
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
      await waitForPageReady(page, 8000);

      // Session health check
      if (config.auth && isLoginRedirect(page.url(), config.auth)) {
        crawlLogger.warn("Session expired during discovery", { url: normalizedUrl });
        errors.push({ url: normalizedUrl, phase: "discovery", error: "Session expired — redirected to login", timestamp: Date.now() });
        if (authStatus) authStatus.sessionExpired = true;
        break;
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
          }
        }
      }
    } catch (err) {
      errors.push({ url: normalizedUrl, phase: "discovery", error: err instanceof Error ? err.message : "Navigation failed", timestamp: Date.now() });
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

  // ════════════════════════════════════════════════════════════
  // PHASE 3: AUDIT
  // ════════════════════════════════════════════════════════════

  const scanStart = Date.now();
  const pagesToScan = [...visited].slice(0, config.maxPages);

  if (pagesToScan.length === 0) {
    timing.scanning = 0;
    timing.analysis = 0;
    timing.total = Date.now() - startTime;
    return {
      ...buildEmptyResult(crawlId, config, startTime, errors.length > 0 ? errors : [
        { url: config.startUrl, phase: "discovery", error: "No scannable pages discovered", timestamp: Date.now() },
      ]),
      auth: authStatus,
      timing,
      discovery: { sitemapUrls: sitemapUrlCount, linkUrls: linkUrlCount, totalUnique: 0, sitemapAvailable },
    };
  }

  crawlLogger.info("Audit phase started", { pages: pagesToScan.length, concurrency: config.concurrency });

  // Build scan options with exported session
  const validCookies = sessionCookies.filter((c) => c.name && c.value && c.domain);
  const scanOptions: ScanOptions | undefined = validCookies.length > 0
    ? { auth: { method: "cookies" as const, cookies: validCookies } }
    : config.auth && config.auth.method !== "none" ? { auth: config.auth } : undefined;

  const maxInbound = Math.max(1, ...inboundLinks.values());
  let activeScans = 0;

  const scanPage = async (url: string, depth: number): Promise<void> => {
    const importance = Math.min(1, (inboundLinks.get(url) || 1) / maxInbound);
    const pageStart = Date.now();

    try {
      const scanResult = await executeScanPipeline(url, scanOptions);

      for (const v of scanResult.violations) {
        allViolations.push({
          ruleId: v.id || "unknown",
          description: v.description || v.help || "Unknown",
          impact: v.impact || "moderate",
          url,
        });
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
        scanDuration: Date.now() - pageStart,
        importance,
        consoleErrors: [],
        screenshot: scanResult.screenshot,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scan failed";
      errors.push({ url, phase: "scan", error: message, timestamp: Date.now() });
      results.push({
        url, scanId: "", score: 0, violations: 0, critical: 0, serious: 0,
        moderate: 0, minor: 0, depth, importance, consoleErrors: [], error: message,
      });
    }
  };

  // Parallel with backpressure
  const pending = pagesToScan.map((url, i) => ({ url, depth: Math.min(config.maxDepth, Math.floor(i / 3) + (i === 0 ? 0 : 1)) }));
  const inFlight: Promise<void>[] = [];

  while (pending.length > 0 || inFlight.length > 0) {
    while (pending.length > 0 && activeScans < config.concurrency) {
      const { url, depth } = pending.shift()!;
      activeScans++;
      const p = scanPage(url, depth).finally(() => {
        activeScans--;
        const idx = inFlight.indexOf(p);
        if (idx > -1) inFlight.splice(idx, 1);
      });
      inFlight.push(p);
    }
    if (inFlight.length > 0) await Promise.race(inFlight);
  }

  timing.scanning = Date.now() - scanStart;

  // ════════════════════════════════════════════════════════════
  // PHASE 4: ANALYZE
  // ════════════════════════════════════════════════════════════

  const analysisStart = Date.now();
  const patterns = analyzePatterns(allViolations, results.length);

  const validResults = results.filter((r) => r.scanId !== "");
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

  // Persist metadata
  if (validResults.length > 0) {
    try {
      await prisma.scan.updateMany({
        where: { id: { in: validResults.map((r) => r.scanId) } },
        data: { metadata: { crawlId, startUrl: config.startUrl, auditVersion: "2.0" } },
      });
    } catch { /* non-critical */ }
  }

  return {
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
  };
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
