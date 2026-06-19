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
import { applyAuthToContext } from "@/lib/scanner/auth";
import { runDeepPasses, type DeepScanReport, type AxeViolationLike, type EvaluablePage } from "./deepScan";
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
let cachedAxeSource: string | null = null;
function getAxeSource(): string {
  // axe.min.js (~500KB) never changes at runtime — read + decode it once.
  // Previously re-read on every scan and every crawled page (N× per audit).
  if (cachedAxeSource !== null) return cachedAxeSource;
  const axePath = path.resolve(
    process.cwd(),
    "node_modules/axe-core/axe.min.js"
  );
  cachedAxeSource = fs.readFileSync(axePath, "utf-8");
  return cachedAxeSource;
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
  /** Auth result metadata (no credentials). Present only if auth was configured. */
  authResult?: { authenticated: boolean; method: string; error?: string };
  /**
   * Base64 JPEG of the viewport, captured from the already-loaded page (only
   * when options.includeScreenshot is set). Capturing here — rather than via a
   * second navigation in captureScreenshot() — avoids re-loading every page,
   * which matters for multi-hundred-page crawls.
   */
  screenshot?: string;
  /**
   * Deep Scan report — present only when options.deep was set. Revealed-state
   * axe violations are already merged into `violations`; this block carries the
   * extra context (states revealed, keyboard heuristics, coverage notes).
   */
  deepScan?: DeepScanReport;
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

    // Apply authentication before navigation (if configured)
    let authResult: { authenticated: boolean; method: string; error?: string } | undefined;
    if (options?.auth && options.auth.method !== "none") {
      const context = page.context();
      authResult = await applyAuthToContext(context, page, options.auth);
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
    // Navigate with "domcontentloaded" rather than networkidle. networkidle
    // waits for the network to fall quiet, which on real sites with persistent
    // connections (analytics sockets, chat widgets, ad beacons) routinely burns
    // the full timeout and makes every page feel slow. domcontentloaded returns
    // as soon as the DOM is parsed — sufficient for axe — and the bounded
    // hydration wait below gives SPA frameworks time to render.
    const timeout = Math.min(options?.timeout ?? SCAN_DEFAULTS.timeout, 20_000);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    } catch (navError: unknown) {
      // A timeout here usually means the DOM is up but the network never settled
      // — proceed and let the content guard below decide if the page is usable.
      const message = navError instanceof Error ? navError.message : "";
      if (message.includes("Timeout") || message.includes("timeout")) {
        // Proceed with scan
      } else {
        throw navError;
      }
    }

    // Post-navigation stabilization: give JS frameworks a bounded window to
    // hydrate. 1.2s (down from a blind 3s) is enough for the initial render of
    // React/Vue/Angular apps while keeping per-page time low across a crawl.
    const HYDRATION_WAIT_MS = 1200;
    if (isServerless()) {
      await new Promise((r) => setTimeout(r, HYDRATION_WAIT_MS));
    } else {
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(HYDRATION_WAIT_MS);
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
     * FIX C8: Assert the page actually loaded before scanning.
     *
     * The navigation catch above tolerates "Timeout" errors (persistent
     * connections like WebSockets keep networkidle from settling). But a real
     * timeout can also mean the page never rendered — scanning a blank document
     * produces zero violations and an inflated, meaningless 100 score.
     *
     * Guard against that: require the document to be at least "interactive" AND
     * have meaningful content (visible text or rendered elements in <body>). If
     * the page is effectively blank, throw so the caller records a FAILED scan
     * (see FIX R-9) instead of persisting a falsely-perfect result.
     */
    const MIN_BODY_TEXT_LENGTH = 1;
    const pageState = await page.evaluate(() => {
      const body = document.body;
      return {
        readyState: document.readyState,
        textLength: body ? (body.innerText ?? "").trim().length : 0,
        elementCount: body ? body.querySelectorAll("*").length : 0,
      };
    }) as { readyState: string; textLength: number; elementCount: number };

    const documentReady =
      pageState.readyState === "interactive" || pageState.readyState === "complete";
    const hasContent =
      pageState.textLength >= MIN_BODY_TEXT_LENGTH || pageState.elementCount > 0;

    if (!documentReady || !hasContent) {
      throw new Error(
        `Page did not load for accessibility scan (readyState="${pageState.readyState}", ` +
          `bodyTextLength=${pageState.textLength}, bodyElements=${pageState.elementCount}). ` +
          `The target may have timed out, blocked automated access, or served a blank page.`
      );
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

    /**
     * Optional viewport screenshot, captured from THIS page before the browser
     * closes (no extra navigation). Used as live "watch the crawl" evidence and
     * for single-scan visual records. JPEG q40 keeps each frame ~40-90 KB.
     * Best-effort: a screenshot failure must never fail the scan.
     */
    let screenshot: string | undefined;
    if (options?.includeScreenshot) {
      try {
        const buf = await page.screenshot({ type: "jpeg", quality: 40, fullPage: false });
        screenshot = Buffer.from(buf).toString("base64");
      } catch {
        // Non-fatal — proceed without a screenshot.
      }
    }

    /**
     * Deep Scan (opt-in): drive the live page to reveal interactive states and
     * probe keyboard reachability — surfacing what a single static axe pass
     * misses. axe is already injected on `window`, so the reveal re-scan just
     * calls axe.run() again. Best-effort: a deep-pass failure never fails the
     * scan (standard results are still returned).
     */
    let deepScan: DeepScanReport | undefined;
    if (options?.deep) {
      try {
        const runAxe = async (): Promise<AxeViolationLike[]> => {
          const r = await page.evaluate((opts) => {
            return (window as unknown as { axe: { run: (o: unknown) => Promise<{ violations: unknown[] }> } }).axe.run(opts);
          }, axeOptions) as { violations: AxeViolationLike[] };
          return r.violations;
        };

        const { report, extraViolations } = await runDeepPasses(
          page as unknown as EvaluablePage,
          runAxe,
          results.violations as AxeViolationLike[],
        );
        deepScan = report;
        // Merge revealed-state axe violations into the result set so they are
        // normalized, scored, and persisted as first-class findings.
        if (extraViolations.length > 0) {
          (results.violations as AxeViolationLike[]).push(...extraViolations);
        }
      } catch {
        deepScan = {
          ran: false,
          statesRevealed: 0,
          revealedViolationCount: 0,
          keyboardFindings: [],
          notes: ["Deep scan could not complete; standard scan results were returned."],
        };
      }
    }

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
      ...(authResult && { authResult }),
      ...(screenshot && { screenshot }),
      ...(deepScan && { deepScan }),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
