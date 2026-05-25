/**
 * ---------------------------------------------------------
 * RegLayer Accessibility Scanner — axe-core Engine
 * ---------------------------------------------------------
 *
 * Purpose:
 * This module is responsible for executing automated
 * accessibility scans against a target webpage.
 *
 * Why this exists:
 * Accessibility compliance is one of the foundational
 * compliance pillars in European digital regulations.
 *
 * This scanner acts as the first layer of our
 * compliance intelligence pipeline.
 *
 * Responsibilities:
 * - Launch browser instance
 * - Navigate to target page
 * - Execute axe-core analysis
 * - Return structured accessibility violations
 *
 * Important Engineering Notes:
 * - This module should ONLY handle scanning.
 * - It should NOT contain business logic.
 * - It should NOT classify severity.
 * - It should NOT generate reports.
 *
 * Separation of concerns is critical because:
 * - scanning evolves independently
 * - compliance logic evolves independently
 * - reporting evolves independently
 *
 * Future Extensions:
 * - multi-page crawling
 * - authenticated scanning
 * - interaction flows
 * - screenshot evidence generation
 * - runtime monitoring
 * ---------------------------------------------------------
 */

import { chromium, type Page, type Browser } from "playwright";
import type { ScanOptions } from "@/lib/types";
import { SCAN_DEFAULTS } from "@/lib/constants";
import fs from "fs";
import path from "path";

/**
 * Load axe-core source directly from node_modules.
 *
 * Why manual injection instead of @axe-core/playwright:
 * - The @axe-core/playwright wrapper has a known bug where
 *   it injects code using `module.exports` which is undefined
 *   in browser evaluate() contexts.
 * - Direct injection of the axe-core bundle avoids this entirely.
 * - We read the minified source and evaluate it in page context.
 */
function getAxeSource(): string {
  const axePath = path.resolve(
    process.cwd(),
    "node_modules/axe-core/axe.min.js"
  );
  return fs.readFileSync(axePath, "utf-8");
}

export interface AxeScanResult {
  violations: AxeViolation[];
  passes: number;
  incomplete: number;
  inapplicable: number;
  timestamp: string;
  url: string;
  pageTitle: string;
}

export interface AxeViolation {
  id: string;
  impact: "critical" | "serious" | "moderate" | "minor";
  description: string;
  help: string;
  helpUrl: string;
  tags: string[];
  nodes: AxeViolationNode[];
}

export interface AxeViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
}

/**
 * Execute an accessibility scan on the target URL.
 *
 * This is the foundational scan operation that:
 * 1. Launches a headless browser
 * 2. Navigates to the target
 * 3. Runs axe-core analysis
 * 4. Returns raw structured results
 *
 * The caller is responsible for normalization,
 * severity classification, and report generation.
 */
export async function runAccessibilityScan(
  url: string,
  options?: ScanOptions
): Promise<AxeScanResult> {
  let browser: Browser | null = null;

  try {
    /**
     * Launch headless Chromium browser.
     *
     * Why Chromium?
     * - Stable automation support
     * - Industry-standard rendering engine
     * - Reliable accessibility tree support
     */
    browser = await chromium.launch({
      headless: true,
    });

    /**
     * Create isolated browser page instance.
     *
     * Each scan gets isolated execution context
     * to avoid cross-request contamination.
     */
    const page: Page = await browser.newPage();

    /**
     * Navigate to target page.
     *
     * Strategy: Use "load" event instead of "networkidle".
     *
     * Why NOT networkidle:
     * - Many modern sites keep persistent connections open
     *   (WebSocket, analytics, long-polling)
     * - networkidle waits for 0 connections for 500ms
     * - This frequently times out on SPAs and dynamic sites
     *
     * Why "load" + manual stabilization:
     * - "load" fires when DOM + subresources are ready
     * - Additional wait ensures JS frameworks hydrate
     * - More reliable across diverse site architectures
     */
    await page.goto(url, {
      waitUntil: "load",
      timeout: options?.timeout ?? SCAN_DEFAULTS.timeout,
    });

    // Allow time for JS frameworks to hydrate and render
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    /**
     * Optional: wait for specific selector if provided.
     * Useful for SPAs that render content dynamically.
     */
    if (options?.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, {
        timeout: 10000,
      });
    }

    /**
     * Execute accessibility scan using axe-core.
     *
     * Injects axe-core source directly into page context,
     * then runs axe.run() to analyze the DOM.
     *
     * This avoids the @axe-core/playwright wrapper bug where
     * `module` is not defined in browser evaluate context.
     */
    const axeSource = getAxeSource();
    await page.evaluate(axeSource);

    const axeOptions = options?.tags?.length
      ? { runOnly: { type: "tag" as const, values: options.tags } }
      : {};

    const results = await page.evaluate((opts) => {
      return (window as unknown as { axe: { run: (opts: unknown) => Promise<unknown> } }).axe.run(opts);
    }, axeOptions) as {
      violations: Array<{
        id: string;
        impact: string;
        description: string;
        help: string;
        helpUrl: string;
        tags: string[];
        nodes: Array<{ html: string; target: string[]; failureSummary?: string }>;
      }>;
      passes: unknown[];
      incomplete: unknown[];
      inapplicable: unknown[];
    };

    const pageTitle = await page.title();

    return {
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact as AxeViolation["impact"],
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          target: n.target as string[],
          failureSummary: n.failureSummary ?? "",
        })),
      })),
      passes: results.passes.length,
      incomplete: results.incomplete.length,
      inapplicable: results.inapplicable.length,
      timestamp: new Date().toISOString(),
      url,
      pageTitle,
    };
  } finally {
    /**
     * Always close browser resources.
     *
     * Prevents:
     * - memory leaks
     * - hanging processes
     * - infrastructure instability
     */
    if (browser) {
      await browser.close();
    }
  }
}
