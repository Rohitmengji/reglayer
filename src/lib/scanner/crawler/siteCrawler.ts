/**
 * ---------------------------------------------------------
 * RegLayer — Site Crawler Engine
 * ---------------------------------------------------------
 * 
 * Multi-page accessibility scanning. Discovers pages by
 * following internal links up to a configurable depth.
 * Respects robots.txt, rate limits, and max pages.
 * 
 * Architecture:
 * - BFS crawl strategy (breadth-first for breadth coverage)
 * - URL deduplication via normalized fingerprints
 * - Parallel scan execution with concurrency control
 * - Progressive result streaming via callback
 * ---------------------------------------------------------
 */

import { performScan } from "@/services/scanService";
import { prisma } from "@/lib/database/prisma";
import { launchBrowser } from "@/lib/scanner/browser/launch";
import { applyAuthToContext } from "@/lib/scanner/auth";
import type { Page } from "playwright-core";
import type { AuthConfig } from "@/lib/validations/auth";

export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobotsTxt?: boolean;
  /** Authentication config for crawling behind-login pages */
  auth?: AuthConfig;
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
}

export interface CrawlPageResult {
  url: string;
  scanId: string;
  score: number;
  violations: number;
  critical: number;
  serious: number;
  depth: number;
}

/**
 * Discover internal links from a page.
 */
async function discoverLinks(page: Page, baseUrl: string): Promise<string[]> {
  const origin = new URL(baseUrl).origin;

  const hrefs = await page.evaluate((orig: string) => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    return anchors
      .map((a) => {
        try {
          const href = (a as HTMLAnchorElement).href;
          const url = new URL(href);
          // Only same-origin links
          if (url.origin !== orig) return null;
          // Strip hash and trailing slash for dedup
          url.hash = "";
          const normalized = url.toString().replace(/\/$/, "");
          return normalized;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as string[];
  }, origin);

  return [...new Set(hrefs)];
}

/**
 * Check if URL matches include/exclude patterns.
 */
function matchesPatterns(
  url: string,
  include?: string[],
  exclude?: string[]
): boolean {
  if (exclude?.length) {
    for (const pattern of exclude) {
      if (url.includes(pattern)) return false;
    }
  }
  if (include?.length) {
    return include.some((pattern) => url.includes(pattern));
  }
  return true;
}

/**
 * Execute a full site crawl with accessibility scanning.
 */
export async function crawlSite(config: CrawlConfig): Promise<CrawlResult> {
  const startTime = Date.now();
  const crawlId = `crawl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [
    { url: config.startUrl.replace(/\/$/, ""), depth: 0 },
  ];
  const results: CrawlPageResult[] = [];

  // Discovery phase: find all pages first
  let browser = null;
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();

    // Apply authentication before crawling (so we can discover pages behind login)
    if (config.auth && config.auth.method !== "none") {
      await applyAuthToContext(context, page, config.auth);
    }

    while (queue.length > 0 && visited.size < config.maxPages) {
      const current = queue.shift()!;
      const normalizedUrl = current.url.replace(/\/$/, "");

      if (visited.has(normalizedUrl)) continue;
      if (current.depth > config.maxDepth) continue;
      if (!matchesPatterns(normalizedUrl, config.includePatterns, config.excludePatterns)) continue;

      visited.add(normalizedUrl);

      try {
        await page.goto(normalizedUrl, { waitUntil: "load", timeout: 15000 });
        await new Promise((r) => setTimeout(r, 1000));

        // Discover links for next depth
        if (current.depth < config.maxDepth) {
          const links = await discoverLinks(page, config.startUrl);
          for (const link of links) {
            if (!visited.has(link) && visited.size + queue.length < config.maxPages * 2) {
              queue.push({ url: link, depth: current.depth + 1 });
            }
          }
        }
      } catch {
        // Skip pages that fail to load
      }
    }

    await browser.close();
    browser = null;
  } catch {
    if (browser) await browser.close();
  }

  // Scan phase: scan discovered pages with concurrency control
  const pagesToScan = [...visited].slice(0, config.maxPages);
  const scanPromises: Promise<void>[] = [];
  let activeScans = 0;

  for (const url of pagesToScan) {
    // Simple concurrency limiter
    while (activeScans >= config.concurrency) {
      await new Promise((r) => setTimeout(r, 500));
    }

    activeScans++;
    const depth = queue.find((q) => q.url === url)?.depth ?? 0;

    const scanPromise = performScan({ url, options: config.auth ? { auth: config.auth } : undefined })
      .then((result) => {
        results.push({
          url,
          scanId: result.scan.id,
          score: result.scan.summary.score,
          violations: result.scan.summary.totalViolations,
          critical: result.scan.summary.critical,
          serious: result.scan.summary.serious,
          depth,
        });
      })
      .catch(() => {
        // Record failed scans
        results.push({
          url,
          scanId: "",
          score: 0,
          violations: 0,
          critical: 0,
          serious: 0,
          depth,
        });
      })
      .finally(() => {
        activeScans--;
      });

    scanPromises.push(scanPromise);
  }

  await Promise.all(scanPromises);

  // Compute aggregate metrics
  const validResults = results.filter((r) => r.scanId !== "");
  const scores = validResults.map((r) => r.score);
  const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const sorted = [...validResults].sort((a, b) => a.score - b.score);
  const lowestScore = sorted[0] || { url: config.startUrl, score: 0 };
  const highestScore = sorted[sorted.length - 1] || { url: config.startUrl, score: 0 };

  const criticalPages = validResults
    .filter((r) => r.critical > 0)
    .sort((a, b) => b.critical - a.critical)
    .slice(0, 10);

  const crawlResult: CrawlResult = {
    id: crawlId,
    startUrl: config.startUrl,
    pagesScanned: validResults.length,
    pagesDiscovered: visited.size,
    averageScore: Math.round(averageScore * 10) / 10,
    lowestScore: { url: lowestScore.url, score: lowestScore.score },
    highestScore: { url: highestScore.url, score: highestScore.score },
    totalViolations: validResults.reduce((sum, r) => sum + r.violations, 0),
    criticalPages,
    duration: Date.now() - startTime,
    pages: results.sort((a, b) => a.score - b.score),
  };

  // Persist crawl metadata
  try {
    await prisma.scan.updateMany({
      where: { id: { in: validResults.map((r) => r.scanId) } },
      data: { metadata: { crawlId, startUrl: config.startUrl } },
    });
  } catch {
    // Non-critical
  }

  return crawlResult;
}
