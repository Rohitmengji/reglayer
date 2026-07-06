/**
 * ---------------------------------------------------------
 * RegLayer — Compliance Autopilot Orchestrator
 * ---------------------------------------------------------
 *
 * WHY: Makes RegLayer a RECURRING service instead of a one-time scan tool.
 *      One toggle per site chains: scan → proof → report → certificate → alerts.
 *
 * WHAT: After each scheduled scan completes, this module:
 *   1. Auto-issues an evidence chain proof (tamper-evident compliance record)
 *   2. Updates the streak counter (consecutive passes)
 *   3. Auto-revokes the certificate if score drops below threshold
 *   4. Re-activates certificate when score recovers
 *   5. Checks if a scheduled report is due and triggers generation
 *
 * HOW: Called from the cron runner's `executeScheduledScan` after success.
 *      Uses existing issueProof, email, and PDF infrastructure.
 *      Best-effort: failures here never block the scan pipeline.
 * ---------------------------------------------------------
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { issueProof } from "@/lib/vault/proofEngine";
import { sendComplianceReportEmail } from "@/lib/email/service";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "autopilot" });

export interface AutopilotScanInput {
  scanId: string;
  siteId: string;
  workspaceId: string;
  url: string;
  score: number;
}

export interface AutopilotResult {
  proofIssued: boolean;
  proofId: string | null;
  streakUpdated: boolean;
  consecutivePasses: number;
  certificateRevoked: boolean;
  certificateRestored: boolean;
  reportTriggered: boolean;
}

/**
 * Run the autopilot pipeline after a successful scheduled scan.
 * Best-effort — never throws. Returns a result summary for logging.
 */
export async function runAutopilot(input: AutopilotScanInput): Promise<AutopilotResult | null> {
  const result: AutopilotResult = {
    proofIssued: false,
    proofId: null,
    streakUpdated: false,
    consecutivePasses: 0,
    certificateRevoked: false,
    certificateRestored: false,
    reportTriggered: false,
  };

  try {
    // Find the autopilot config for this site
    const autopilot = await prisma.complianceAutopilot.findUnique({
      where: { workspaceId_siteId: { workspaceId: input.workspaceId, siteId: input.siteId } },
    });

    if (!autopilot || !autopilot.enabled) return null;

    const { score } = input;
    const passesThreshold = score >= autopilot.revokeThreshold;

    // ── 1. Auto-issue evidence chain proof ──
    if (autopilot.autoProof) {
      try {
        const proof = await issueProof({
          scanId: input.scanId,
          siteId: input.siteId,
          workspaceId: input.workspaceId,
          type: "CONTINUOUS_MONITORING",
          title: `Autopilot scan — score ${input.score}%`,
          standard: "WCAG 2.1 AA",
        });
        result.proofIssued = true;
        result.proofId = proof.id;
      } catch (err) {
        log.warn("Autopilot proof issuance failed", {
          siteId: input.siteId,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    }

    // ── 2. Update streak counter ──
    const newStreak = passesThreshold ? autopilot.consecutivePasses + 1 : 0;
    const longestStreak = Math.max(autopilot.longestStreak, newStreak);
    result.streakUpdated = true;
    result.consecutivePasses = newStreak;

    // ── 3. Certificate management ──
    if (autopilot.autoRevoke) {
      if (!passesThreshold && autopilot.certificateId && !autopilot.certificateRevokedAt) {
        // Score dropped — revoke the certificate
        await prisma.complianceProof.update({
          where: { id: autopilot.certificateId },
          data: { revokedAt: new Date(), revokedReason: `Autopilot: score ${score} dropped below threshold ${autopilot.revokeThreshold}` },
        }).catch(() => {}); // Proof might not exist anymore
        result.certificateRevoked = true;

        log.info("Autopilot revoked certificate", {
          siteId: input.siteId,
          score,
          threshold: autopilot.revokeThreshold,
        });
      } else if (passesThreshold && autopilot.certificateRevokedAt) {
        // Score recovered — restore by issuing a fresh proof as the new cert
        if (result.proofId) {
          result.certificateRestored = true;
        }
      }
    }

    // ── 4. Check if scheduled report is due ──
    if (autopilot.reportEnabled && autopilot.nextReportAt) {
      const now = new Date();
      if (now >= autopilot.nextReportAt && autopilot.reportRecipients.length > 0) {
        result.reportTriggered = true;
        // Fire-and-forget report delivery
        triggerReportDelivery(input.workspaceId, input.siteId, autopilot.reportRecipients)
          .catch((err) => {
            log.warn("Autopilot report delivery failed", {
              siteId: input.siteId,
              error: err instanceof Error ? err.message : "Unknown",
            });
          });
      }
    }

    // ── 5. Persist state update ──
    const nextReportAt = result.reportTriggered
      ? computeNextReportDate(autopilot.reportFrequency)
      : autopilot.nextReportAt;

    await prisma.complianceAutopilot.update({
      where: { id: autopilot.id },
      data: {
        consecutivePasses: newStreak,
        longestStreak,
        lastScanScore: score,
        lastScanAt: new Date(),
        certificateId: result.certificateRestored ? result.proofId : autopilot.certificateId,
        certificateRevokedAt: result.certificateRevoked
          ? new Date()
          : result.certificateRestored
            ? null
            : autopilot.certificateRevokedAt,
        lastReportSentAt: result.reportTriggered ? new Date() : autopilot.lastReportSentAt,
        nextReportAt,
      },
    });

    return result;
  } catch (err) {
    log.error("Autopilot pipeline failed", {
      siteId: input.siteId,
      error: err instanceof Error ? err.message : "Unknown",
    });
    return result;
  }
}

/**
 * Compute the next report delivery date from a frequency string.
 */
function computeNextReportDate(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "quarterly":
      return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    case "monthly":
    default:
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

/**
 * Trigger compliance report generation and email delivery.
 * Uses existing PDF + email infrastructure.
 */
async function triggerReportDelivery(
  workspaceId: string,
  siteId: string,
  recipients: string[]
): Promise<void> {
  // Get site info + recent scan data for the report
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) return;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentScans = await prisma.scan.findMany({
    where: { workspaceId, siteId, status: "COMPLETED", createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "desc" },
    select: { id: true, score: true, totalViolations: true, createdAt: true, url: true },
    take: 30,
  });

  if (recentScans.length === 0) return;

  const latestScan = recentScans[0];
  const scores = recentScans.map((s) => s.score).filter((s): s is number => s !== null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const scoreImproved = scores.length >= 2 ? (scores[0] ?? 0) >= (scores[scores.length - 1] ?? 0) : false;

  // Count proofs issued in the period
  const proofsCount = await prisma.complianceProof.count({
    where: { workspaceId, siteId, issuedAt: { gte: thirtyDaysAgo } },
  });

  // Send report email to each recipient
  for (const email of recipients) {
    try {
      await sendComplianceReportEmail({
        to: email,
        siteName: site.name || site.url,
        siteUrl: site.url,
        period: "Last 30 days",
        currentScore: latestScan.score ?? 0,
        averageScore: avgScore,
        totalScans: recentScans.length,
        totalViolations: latestScan.totalViolations ?? 0,
        proofsIssued: proofsCount,
        scoreImproved,
        reportUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app"}/reports?tab=trends`,
      });
    } catch (err) {
      log.warn("Failed to send report email", {
        email,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }
}
