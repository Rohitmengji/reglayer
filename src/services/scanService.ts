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
import { sendScanCompleteEmail } from "@/lib/email/service";
import { dispatchToIntegrations } from "@/lib/integrations/dispatcher";
import { enqueueJob } from "@/lib/queue/jobQueue";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { embedScanViolations } from "@/lib/ai/vector/search";
import type { ScanRequest, ScanResult, ComplianceReport } from "@/lib/types";

export interface ScanServiceResult {
  scan: ScanResult;
  compliance: ComplianceReport;
}

/**
 * FIX data-3: Derive WCAG criterion + conformance level from axe WCAG tags.
 *
 * axe emits tags such as:
 *   - "wcag111"     → success criterion 1.1.1
 *   - "wcag1410"    → success criterion 1.4.10
 *   - "wcag2a" / "wcag2aa" / "wcag21aa" / "wcag2aaa" → conformance level
 *
 * Criterion tags are "wcag" + digits, where the digits decode as
 * principle(1) + guideline(1) + criterion(1+) — e.g. "1410" → "1.4.10".
 * Level tags end in a/aa/aaa (after an optional version like "2", "21", "22").
 *
 * Returns the first criterion found (schema stores a single String?) and the
 * highest level seen. Conservative: returns nulls when nothing can be derived.
 */
function deriveWcag(tags: string[]): { wcagCriteria: string | null; wcagLevel: string | null } {
  let wcagCriteria: string | null = null;
  let wcagLevel: string | null = null;
  const levelRank: Record<string, number> = { A: 1, AA: 2, AAA: 3 };

  for (const raw of tags) {
    const tag = raw.toLowerCase();
    if (!tag.startsWith("wcag")) continue;

    // Conformance level tag, e.g. "wcag2a", "wcag2aa", "wcag21aa", "wcag2aaa".
    const levelMatch = /^wcag\d*(a|aa|aaa)$/.exec(tag);
    if (levelMatch) {
      const level = levelMatch[1].toUpperCase();
      if (wcagLevel === null || levelRank[level] > levelRank[wcagLevel]) {
        wcagLevel = level;
      }
      continue;
    }

    // Success-criterion tag, e.g. "wcag111" → "1.1.1", "wcag1410" → "1.4.10".
    const critMatch = /^wcag(\d{3,})$/.exec(tag);
    if (critMatch && wcagCriteria === null) {
      const digits = critMatch[1];
      // principle (1 digit) + guideline (1 digit) + criterion (remaining digits)
      const principle = digits.slice(0, 1);
      const guideline = digits.slice(1, 2);
      const criterion = String(parseInt(digits.slice(2), 10));
      wcagCriteria = `${principle}.${guideline}.${criterion}`;
    }
  }

  return { wcagCriteria, wcagLevel };
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

    // Resolve the scan's workspace once for tenant-scoped notifications
    let workspaceId: string | null = null;
    if (request.userEmail) {
      const user = await prisma.user.findUnique({ where: { email: request.userEmail } });
      if (user) {
        workspaceId = await getOrCreateWorkspace(user.id, user.email);
      }
    }

    // Persist to database — blocking, scan data is the product
    await persistScan(scanResult, complianceReport, request.userEmail);

    // Evaluate alert rules (fire-and-forget, workspace-scoped)
    evaluateAlerts(scanResult, workspaceId).catch((err) => {
      scanLogger.warn("Failed to evaluate alerts", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    });

    // Dispatch webhook events (fire-and-forget, workspace-scoped)
    dispatchWebhookEvent("scan.completed", {
      scanId: scanResult.id,
      url: scanResult.url,
      score: scanResult.summary.score,
      violations: scanResult.summary.totalViolations,
      critical: scanResult.summary.critical,
      duration: scanResult.metadata.scanDuration,
    }, workspaceId).catch(() => {/* non-blocking */});

    // Enqueue durable jobs for post-scan work (survives cold starts, retries on failure)
    enqueueJob({
      type: "webhook_delivery",
      data: { event: "scan.completed", scanId: scanResult.id, workspaceId },
    }, undefined, workspaceId ?? undefined).catch(() => {});

    // Send email notifications + integration dispatches (fire-and-forget)
    notifyScanComplete(scanResult, request.userEmail).catch((err) => {
      scanLogger.warn("Notification dispatch failed", {
        error: err instanceof Error ? err.message : "Unknown",
      });
    });

    // Embed violations for semantic search (fire-and-forget, non-blocking)
    embedScanViolations(scanResult.id).catch((err) => {
      scanLogger.warn("Violation embedding failed (non-blocking)", {
        scanId: scanResult.id,
        error: err instanceof Error ? err.message : "Unknown",
      });
    });

    return {
      scan: scanResult,
      compliance: complianceReport,
    };
  } catch (error) {
    scanLogger.error("Scan failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // FIX R-9: persist a minimal FAILED scan record so failures show up in
    // history (previously failures were never written → history could only ever
    // show successes). Best-effort: wrapped in its own try/catch so a persist
    // failure never masks the original scan error we re-throw below.
    try {
      const startedAt = new Date();
      let userId: string | undefined;
      let workspaceId: string | undefined;
      if (request.userEmail) {
        const user = await prisma.user.findUnique({ where: { email: request.userEmail } });
        if (user) {
          userId = user.id;
          workspaceId = await getOrCreateWorkspace(user.id, user.email);
        }
      }

      await prisma.scan.create({
        data: {
          url: request.url,
          status: "FAILED",
          score: 0,
          totalViolations: 0,
          critical: 0,
          serious: 0,
          moderate: 0,
          minor: 0,
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          startedAt,
          completedAt: new Date(),
          userId,
          workspaceId,
        },
      });
    } catch (persistErr) {
      scanLogger.error("Failed to persist FAILED scan record", {
        error: persistErr instanceof Error ? persistErr.message : "Unknown",
      });
      // Swallow — do not mask the original scan error.
    }

    throw error;
  }
}

/**
 * Optional pre-resolved scoping for a scan. When supplied (e.g. by the site
 * crawler, which already knows the workspace/site/user), these are used
 * directly instead of re-resolving from userEmail per page. `siteId`
 * additionally links the scan row to a Site.
 */
export interface PersistScanScope {
  workspaceId?: string;
  userId?: string;
  siteId?: string;
  /** Extra metadata merged into the Scan row (e.g. crawl linkage) */
  metadata?: Record<string, unknown>;
}

/**
 * Persist scan results to the database.
 *
 * Exported so callers that run scans outside `performScan` (e.g. the site
 * crawler's per-page audits) can turn each scan into a real Scan row with a
 * server-generated id, keeping crawl audits durable and counted against quota.
 */
export async function persistScan(
  scan: ScanResult,
  compliance: ComplianceReport,
  userEmail?: string,
  scope?: PersistScanScope
): Promise<void> {
  // Resolve user and workspace for proper scoping.
  // Prefer pre-resolved scope (avoids an extra user lookup per crawled page).
  let userId: string | undefined = scope?.userId;
  let workspaceId: string | undefined = scope?.workspaceId;
  const siteId: string | undefined = scope?.siteId;

  if ((userId === undefined || workspaceId === undefined) && userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (user) {
      userId = userId ?? user.id;
      workspaceId = workspaceId ?? (await getOrCreateWorkspace(user.id, user.email));
    }
  }

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
      region: scan.metadata.region || null,
      startedAt: new Date(scan.timestamp),
      completedAt: new Date(),
      userId,
      workspaceId,
      siteId: siteId || null,
      metadata: {
        browserEngine: scan.metadata.browserEngine,
        axeCoreVersion: scan.metadata.axeCoreVersion,
        ...((scan.metadata.deepScan
          ? { deepScan: scan.metadata.deepScan }
          : {}) as Record<string, unknown>),
        ...((scan.metadata.pageStructure
          ? { pageStructure: scan.metadata.pageStructure }
          : {}) as Record<string, unknown>),
        ...(scope?.metadata ?? {}),
      },
      violations: {
        create: scan.violations.map((v) => {
          // FIX data-3: populate the previously-dead wcagCriteria/wcagLevel
          // columns by parsing each violation's WCAG tags.
          const { wcagCriteria, wcagLevel } = deriveWcag(v.wcagTags);
          return {
            ruleId: v.id,
            impact: v.impact as "critical" | "serious" | "moderate" | "minor",
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl || null,
            tags: v.wcagTags,
            wcagCriteria,
            wcagLevel,
            affectedElements: v.nodes.map((n) => ({
              html: n.html,
              target: n.target,
              failureSummary: n.failureSummary,
            })),
          };
        }),
      },
    },
  });
}

/**
 * Send email notifications and dispatch to connected integrations
 * after a scan completes. Non-blocking.
 */
async function notifyScanComplete(scan: ScanResult, userEmail?: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app";
  const reportUrl = `${appUrl}/report/${scan.id}`;

  // Resolve user directly from email (no race with DB persist)
  if (userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (user) {
      // Check notification preferences
      const prefs = await prisma.notificationPreference.findUnique({
        where: { userId: user.id },
      });
      // Default to true if no preferences saved yet
      if (!prefs || prefs.scanComplete) {
        await sendScanCompleteEmail(user.email, {
          url: scan.url,
          score: scan.summary.score,
          violations: scan.summary.totalViolations,
          critical: scan.summary.critical,
          reportUrl,
        });
      }

      // Get workspace for integration dispatch
      const workspaceId = await getOrCreateWorkspace(user.id, user.email);
      if (workspaceId) {
        await dispatchToIntegrations(workspaceId, "scan.completed", {
          scanId: scan.id,
          url: scan.url,
          score: scan.summary.score,
          violations: scan.summary.totalViolations,
          critical: scan.summary.critical,
          reportUrl,
        });
      }
    }
  }
}
