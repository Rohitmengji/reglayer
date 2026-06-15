/**
 * ---------------------------------------------------------
 * RegLayer — Scan Pipeline
 * ---------------------------------------------------------
 *
 * Purpose:
 * Orchestrates the complete scan workflow as a pipeline.
 *
 * Why this exists:
 * Scanning is NOT a single function call.
 * It's a multi-step pipeline:
 *
 *   crawl → analyze → normalize → classify → enrich → report
 *
 * This pipeline pattern enables:
 * - Independent step evolution
 * - Step-level error handling
 * - Future middleware injection
 * - Observability at each stage
 *
 * Engineering Notes:
 * - Each step receives output from the previous step.
 * - Pipeline is idempotent (same input → same output).
 * - Steps can be individually tested.
 * ---------------------------------------------------------
 */

import { runAccessibilityScan } from "../accessibility/axeScanner";
import { normalizeViolations } from "../accessibility/issueNormalizer";
import { generateScanSummary } from "../accessibility/severityEngine";
import { captureScreenshot } from "../browser/screenshot";
import * as Sentry from "@sentry/nextjs";
import type { ScanOptions, ScanResult } from "@/lib/types";

export type ProgressCallback = (stage: string, percent: number) => void;

/**
 * Execute the full scan pipeline.
 *
 * Pipeline stages:
 * 1. SCAN: Run axe-core against target URL
 * 2. NORMALIZE: Transform raw results to internal format
 * 3. CLASSIFY: Generate severity summary and scoring
 * 4. SCREENSHOT: Capture visual evidence (optional)
 * 5. PACKAGE: Assemble final scan result
 */
export async function executeScanPipeline(
  url: string,
  options?: ScanOptions,
  onProgress?: ProgressCallback
): Promise<ScanResult> {
  const startTime = Date.now();

  return Sentry.startSpan({ name: "scan.pipeline", op: "scan", attributes: { url } }, async () => {
    // Stage 1: Execute raw accessibility scan
    onProgress?.("launching", 10);
    const rawResults = await Sentry.startSpan(
      { name: "scan.axe_run", op: "scan.stage" },
      () => runAccessibilityScan(url, options)
    );

    // Stage 2: Normalize violations to internal format
    onProgress?.("analyzing", 60);
    const violations = Sentry.startSpan(
      { name: "scan.normalize", op: "scan.stage" },
      () => normalizeViolations(rawResults.violations)
    );

    // Stage 3: Generate severity classification and scoring
    onProgress?.("scoring", 70);
    const summary = Sentry.startSpan(
      { name: "scan.classify", op: "scan.stage" },
      () => generateScanSummary(rawResults.violations)
    );

    // Stage 4: Screenshot capture (if requested)
    // Prefer the screenshot the axe scanner already captured from its loaded
    // page (no extra navigation). Only fall back to the re-navigating
    // captureScreenshot() if the inline capture was unavailable.
    let screenshot: string | undefined = rawResults.screenshot;
    if (!screenshot && options?.includeScreenshot) {
      onProgress?.("screenshot", 80);
      try {
        const screenshotResult = await Sentry.startSpan(
          { name: "scan.screenshot", op: "scan.stage" },
          () => captureScreenshot(url, { fullPage: false })
        );
        screenshot = screenshotResult.data;
      } catch {
        // Screenshot failure should not block scan results
      }
    }

    // Stage 5: Package final result
    onProgress?.("complete", 100);
    const scanResult: ScanResult = {
      id: generateScanId(),
      url: rawResults.url,
      timestamp: rawResults.timestamp,
      status: "completed",
      summary,
      violations,
      screenshot,
      metadata: {
        scanDuration: Date.now() - startTime,
        pageTitle: rawResults.pageTitle,
        browserEngine: "chromium",
        axeCoreVersion: "4.x",
      },
    };

    return scanResult;
  });
}

/**
 * Generate a unique scan identifier.
 *
 * Format: scan_<timestamp>_<random>
 * Sortable by time, collision-resistant.
 */
function generateScanId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `scan_${timestamp}_${random}`;
}
