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
import { prisma } from "@/lib/database/prisma";
import { evaluateAlerts } from "@/lib/intelligence/alertEngine";
import { dispatchWebhookEvent } from "@/lib/integrations/webhookDispatcher";
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

    // Persist to database (fire-and-forget, don't block response)
    persistScan(scanResult, complianceReport).catch((err) => {
      scanLogger.warn("Failed to persist scan to database", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    });

    // Evaluate alert rules (fire-and-forget)
    evaluateAlerts(scanResult).catch((err) => {
      scanLogger.warn("Failed to evaluate alerts", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    });

    // Dispatch webhook events (fire-and-forget)
    dispatchWebhookEvent("scan.completed", {
      scanId: scanResult.id,
      url: scanResult.url,
      score: scanResult.summary.score,
      violations: scanResult.summary.totalViolations,
      critical: scanResult.summary.critical,
      duration: scanResult.metadata.scanDuration,
    }).catch(() => {/* non-blocking */});

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

/**
 * Persist scan results to the database.
 */
async function persistScan(
  scan: ScanResult,
  compliance: ComplianceReport
): Promise<void> {
  await prisma.scan.create({
    data: {
      id: scan.id,
      url: scan.url,
      status: "COMPLETED",
      score: scan.summary.score,
      totalViolations: scan.summary.totalViolations,
      critical: scan.summary.critical,
      serious: scan.summary.serious,
      moderate: scan.summary.moderate,
      minor: scan.summary.minor,
      compliance: compliance.overallCompliance,
      pageTitle: scan.metadata.pageTitle || null,
      duration: scan.metadata.scanDuration,
      screenshot: scan.screenshot || null,
      startedAt: new Date(scan.timestamp),
      completedAt: new Date(),
      metadata: {
        browserEngine: scan.metadata.browserEngine,
        axeCoreVersion: scan.metadata.axeCoreVersion,
      },
      violations: {
        create: scan.violations.map((v) => ({
          ruleId: v.id,
          impact: v.impact as "critical" | "serious" | "moderate" | "minor",
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl || null,
          tags: v.wcagTags,
          affectedElements: v.nodes.map((n) => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        })),
      },
    },
  });
}
