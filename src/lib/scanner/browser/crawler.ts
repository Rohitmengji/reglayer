/**
 * ---------------------------------------------------------
 * RegLayer — Multi-Page Crawler
 * ---------------------------------------------------------
 *
 * Purpose:
 * Discovers and collects internal links from a target page
 * to enable multi-page accessibility scanning.
 *
 * Why this exists:
 * Single-page scans miss site-wide issues. A crawler enables:
 * - Full-site compliance assessment
 * - Discovery of orphaned/problematic pages
 * - Link integrity validation
 *
 * Engineering Notes:
 * - Stays within the same origin (no cross-domain crawling)
 * - Respects a configurable max page limit
 * - De-duplicates URLs by normalizing fragments/params
 * - Uses BFS traversal for balanced coverage
 * ---------------------------------------------------------
 */

import type { Browser } from "playwright-core";
import { SCAN_DEFAULTS } from "@/lib/constants";
import { launchBrowser, isServerless } from "@/lib/scanner/browser/launch";

export interface CrawlOptions {
  maxPages: number;
  timeout?: number;
  excludePatterns?: string[];
}

export interface CrawlResult {
  pages: string[];
  totalDiscovered: number;
  errors: CrawlError[];
}

export interface CrawlError {
  url: string;
  error: string;
}

/**
 * Crawl a website and discover internal links using BFS.
 *
 * Algorithm:
 * 1. Start from seed URL
 * 2. Extract all same-origin links
 * 3. Add unvisited links to queue
 * 4. Continue until maxPages reached
 */
export async function crawlPages(
  seedUrl: string,
  options: CrawlOptions = { maxPages: 10 }
): Promise<CrawlResult> {
  const origin = new URL(seedUrl).origin;
  const visited = new Set<string>();
  const queue: string[] = [normalizeUrl(seedUrl)];
  const errors: CrawlError[] = [];
  let browser: Browser | null = null;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    while (queue.length > 0 && visited.size < options.maxPages) {
      const currentUrl = queue.shift()!;

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);

      try {
        await page.goto(currentUrl, {
          waitUntil: "load",
          timeout: options.timeout ?? SCAN_DEFAULTS.timeout,
        });
        await (isServerless() ? new Promise(r => setTimeout(r, 1000)) : page.waitForTimeout(1000));

        // Extract all links from the page
        const links = await page.evaluate((orig: string) => {
          const anchors = document.querySelectorAll("a[href]");
          const hrefs: string[] = [];
          anchors.forEach((a) => {
            const href = (a as HTMLAnchorElement).href;
            if (href && href.startsWith(orig)) {
              hrefs.push(href);
            }
          });
          return hrefs;
        }, origin);

        // Add new links to queue
        for (const link of links) {
          const normalized = normalizeUrl(link);
          if (
            !visited.has(normalized) &&
            !queue.includes(normalized) &&
            !shouldExclude(normalized, options.excludePatterns)
          ) {
            queue.push(normalized);
          }
        }
      } catch (err) {
        errors.push({
          url: currentUrl,
          error: err instanceof Error ? err.message : "Navigation failed",
        });
      }
    }

    await context.close();

    return {
      pages: Array.from(visited),
      totalDiscovered: visited.size + queue.length,
      errors,
    };
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Normalize URL by removing fragments and trailing slashes.
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Remove trailing slash except for root
    let normalized = parsed.toString();
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

/**
 * Check if URL matches any exclusion pattern.
 */
function shouldExclude(url: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((pattern) => url.includes(pattern));
}
