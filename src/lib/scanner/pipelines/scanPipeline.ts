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
import type { ScanOptions, ScanResult } from "@/lib/types";

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
  options?: ScanOptions
): Promise<ScanResult> {
  const startTime = Date.now();

  // Stage 1: Execute raw accessibility scan
  const rawResults = await runAccessibilityScan(url, options);

  // Stage 2: Normalize violations to internal format
  const violations = normalizeViolations(rawResults.violations);

  // Stage 3: Generate severity classification and scoring
  const summary = generateScanSummary(rawResults.violations);

  // Stage 4: Screenshot capture (if requested)
  let screenshot: string | undefined;
  if (options?.includeScreenshot) {
    try {
      const screenshotResult = await captureScreenshot(url, { fullPage: false });
      screenshot = screenshotResult.data;
    } catch {
      // Screenshot failure should not block scan results
    }
  }

  // Stage 5: Package final result
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
