/**
 * ---------------------------------------------------------
 * RegLayer — Scan Service
 * ---------------------------------------------------------
 *
 * Purpose:
 * Service layer that orchestrates scan operations.
 *
 * Why this exists:
 * The service layer is the bridge between:
 * - API routes (HTTP interface)
 * - Pipeline (execution engine)
 * - Storage (persistence)
 *
 * This keeps API routes thin and pipelines focused.
 *
 * Responsibilities:
 * - Validate and prepare scan requests
 * - Invoke scan pipeline
 * - Handle errors and retries
 * - Return structured results
 *
 * Future Extensions:
 * - Queue-based async scanning
 * - Scan scheduling
 * - Rate limiting
 * - Result caching
 * ---------------------------------------------------------
 */

import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";
import { logger } from "@/lib/telemetry/logger";
import type { ScanRequest, ScanResult, ComplianceReport } from "@/lib/types";

export interface ScanServiceResult {
  scan: ScanResult;
  compliance: ComplianceReport;
}

/**
 * Execute a full scan with compliance evaluation.
 */
export async function performScan(
  request: ScanRequest
): Promise<ScanServiceResult> {
  const scanLogger = logger.withContext({
    service: "scanService",
    url: request.url,
  });

  scanLogger.info("Scan initiated", { options: request.options });

  try {
    // Execute scan pipeline
    const scanResult = await executeScanPipeline(
      request.url,
      request.options
    );

    scanLogger.info("Scan completed", {
      scanId: scanResult.id,
      violationCount: scanResult.summary.totalViolations,
      score: scanResult.summary.score,
    });

    // Evaluate compliance against rules
    const complianceReport = evaluateCompliance(
      scanResult.id,
      scanResult.violations
    );

    scanLogger.info("Compliance evaluated", {
      scanId: scanResult.id,
      overallCompliance: complianceReport.overallCompliance,
    });

    return {
      scan: scanResult,
      compliance: complianceReport,
    };
  } catch (error) {
    scanLogger.error("Scan failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
