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
 * Accessibility compliance is a global requirement.
 * WCAG 2.2, ADA, Section 508, EAA, and AODA all
 * mandate accessible digital experiences.
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

import type { Page, Browser } from "playwright-core";
import type { ScanOptions } from "@/lib/types";
import { SCAN_DEFAULTS } from "@/lib/constants";
import { launchBrowser, isServerless, getViewport } from "@/lib/scanner/browser/launch";
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

/**
 * Domains that serve tracking/advertising content.
 * Blocking these speeds up page load without affecting
 * accessibility analysis of the actual page content.
 */
const BLOCKED_RESOURCE_DOMAINS = [
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "facebook.net",
  "hotjar.com",
  "intercom.io",
  "segment.com",
  "mixpanel.com",
  "amplitude.com",
];

/**
 * Resource types that are unnecessary for accessibility analysis.
 * Blocking these reduces load time without affecting DOM structure.
 */
const BLOCKED_RESOURCE_TYPES = ["media", "font"];

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
    browser = await launchBrowser();
    const page: Page = await browser.newPage();

    // Set consistent viewport for reproducible results
    const viewport = getViewport();
    if (!isServerless()) {
      await page.setViewportSize(viewport);
    }

    // Block tracking/ad resources to speed up load without affecting content
    if (isServerless()) {
      // Puppeteer request interception
      await (page as unknown as { setRequestInterception: (v: boolean) => Promise<void> })
        .setRequestInterception(true);
      (page as unknown as { on: (event: string, handler: (req: { url: () => string; resourceType: () => string; abort: () => void; continue: () => void }) => void) => void })
        .on("request", (req) => {
          const reqUrl = req.url();
          const resourceType = req.resourceType();
          if (
            BLOCKED_RESOURCE_TYPES.includes(resourceType) ||
            BLOCKED_RESOURCE_DOMAINS.some((d) => reqUrl.includes(d))
          ) {
            req.abort();
          } else {
            req.continue();
          }
        });
    } else {
      // Playwright route interception
      await page.route("**/*", (route) => {
        const reqUrl = route.request().url();
        const resourceType = route.request().resourceType();
        if (
          BLOCKED_RESOURCE_TYPES.includes(resourceType) ||
          BLOCKED_RESOURCE_DOMAINS.some((d) => reqUrl.includes(d))
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }

    /**
     * Navigate to target page.
     *
     * Strategy:
     * - Serverless (Puppeteer): "networkidle0" — waits until ≤0 network
     *   connections for 500ms. More thorough than "load" for SPAs.
     * - Local (Playwright): "networkidle" — equivalent Playwright API.
     *
     * Fallback: If networkidle times out (common for sites with persistent
     * connections like WebSockets), catch and proceed — the page is likely
     * already rendered enough for axe analysis.
     */
    const timeout = options?.timeout ?? SCAN_DEFAULTS.timeout;
    try {
      if (isServerless()) {
        await page.goto(url, { waitUntil: "networkidle0" as unknown as "load", timeout });
      } else {
        await page.goto(url, { waitUntil: "networkidle", timeout });
      }
    } catch (navError: unknown) {
      // If networkidle timed out, the page is likely loaded enough.
      // Only re-throw if the page didn't load at all.
      const message = navError instanceof Error ? navError.message : "";
      if (message.includes("Timeout") || message.includes("timeout")) {
        // Page loaded but had persistent connections — proceed with scan
      } else {
        throw navError;
      }
    }

    // Post-navigation stabilization: allow JS frameworks to hydrate
    // 3 seconds provides enough time for React/Vue/Angular to render
    if (isServerless()) {
      await new Promise((r) => setTimeout(r, 3000));
    } else {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(3000);
    }

    // Optional: wait for specific selector if provided (SPA support)
    if (options?.waitForSelector) {
      try {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      } catch {
        // Selector not found within timeout — proceed anyway
      }
    }

    /**
     * Execute accessibility scan using axe-core.
     *
     * Injects axe-core source directly into page context,
     * then runs axe.run() to analyze the full document.
     */
    const axeSource = getAxeSource();
    await page.evaluate(axeSource);

    // Run axe with specified tags or full ruleset
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
    if (browser) {
      await browser.close();
    }
  }
}
