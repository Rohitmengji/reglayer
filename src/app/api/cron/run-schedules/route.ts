/**
 * ---------------------------------------------------------
 * RegLayer — Cron: Run Scheduled Scans
 * ---------------------------------------------------------
 *
 * Vercel Cron endpoint that executes due scan schedules.
 *
 * Invoked every 5 minutes by Vercel Cron. Protected by
 * CRON_SECRET header (Vercel injects this automatically for
 * cron jobs, and we validate it for manual triggers).
 *
 * Pipeline per schedule:
 * 1. Perform scan (reuses existing performScan service)
 * 2. Detect regressions (compare with previous scan)
 * 3. Fire regression-specific notifications if score dropped
 * 4. Update schedule timestamps (lastRunAt, nextRunAt)
 * 5. Log to audit trail
 *
 * Safety:
 * - Processes max 10 schedules per invocation (Vercel 60s limit)
 * - Each schedule failure is isolated (doesn't block others)
 * - Idempotent: double-invocation is safe due to nextRunAt guard
 * - Rate-limited by plan (Free=weekly, Pro=daily, Enterprise=hourly)
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { performScan } from "@/services/scanService";
import { detectRegressions } from "@/lib/intelligence/regressionDetector";
import { getDueSchedules, markScheduleExecuted, markScheduleFailed } from "@/lib/scheduling/scheduleService";
import { sendRegressionAlert } from "@/lib/email/service";
import { dispatchToIntegrations } from "@/lib/integrations/dispatcher";
import { dispatchWebhookEvent } from "@/lib/integrations/webhookDispatcher";
import { notifyWorkspace } from "@/lib/notifications/dispatcher";
import { prisma } from "@/lib/database/prisma";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "cron:run-schedules" });

export const maxDuration = 60; // Vercel max for cron functions
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/run-schedules
 * Triggered by Vercel Cron every 5 minutes.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (Vercel sends this automatically for cron jobs)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    log.warn("Unauthorized cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: ExecutionResult[] = [];

  try {
    const dueSchedules = await getDueSchedules();

    if (dueSchedules.length === 0) {
      return NextResponse.json({
        message: "No schedules due",
        executedAt: new Date().toISOString(),
        next: "Checking again in 5 minutes",
      });
    }

    log.info(`Processing ${dueSchedules.length} due schedule(s)`);

    // Process each schedule sequentially to avoid overloading the scanner
    for (const schedule of dueSchedules) {
      const url = schedule.site.url;
      const workspaceId = schedule.workspaceId;
      const ownerEmail = schedule.workspace.members[0]?.user?.email;

      const result = await executeScheduledScan({
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        url,
        cron: schedule.cron,
        workspaceId,
        ownerEmail,
      });

      results.push(result);

      // Safety: if we've used more than 50s, stop and let next invocation handle the rest
      if (Date.now() - startTime > 50_000) {
        log.warn("Approaching timeout, deferring remaining schedules");
        break;
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;

    log.info("Cron execution complete", { succeeded, failed, durationMs: Date.now() - startTime });

    return NextResponse.json({
      executedAt: new Date().toISOString(),
      processed: results.length,
      succeeded,
      failed,
      results: results.map((r) => ({
        scheduleId: r.scheduleId,
        url: r.url,
        status: r.status,
        score: r.score,
        regression: r.isRegression,
        error: r.error,
      })),
      durationMs: Date.now() - startTime,
    });
  } catch (error) {
    log.error("Cron runner failed", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────
// Internal execution logic
// ─────────────────────────────────────────────

interface ExecutionResult {
  scheduleId: string;
  url: string;
  status: "success" | "failed";
  score?: number;
  isRegression?: boolean;
  error?: string;
}

async function executeScheduledScan(params: {
  scheduleId: string;
  scheduleName: string;
  url: string;
  cron: string;
  workspaceId: string;
  ownerEmail?: string;
}): Promise<ExecutionResult> {
  const { scheduleId, scheduleName, url, cron, workspaceId, ownerEmail } = params;

  try {
    log.info("Executing scheduled scan", { scheduleId, url, scheduleName });

    // 1. Perform the scan
    const { scan } = await performScan({
      url,
      options: { timeout: 30000 },
      userEmail: ownerEmail,
    });

    // 2. Link scan to workspace and site (retry up to 3 times, persist is fire-and-forget)
    const site = await prisma.site.findFirst({
      where: { workspaceId, url },
    });

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await prisma.scan.update({
          where: { id: scan.id },
          data: { workspaceId, siteId: site?.id || null },
        });
        break;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
        // If final attempt fails, the scan still succeeded — just not linked
      }
    }

    // 3. Detect regressions
    const regression = await detectRegressions(scan.id, url, workspaceId);

    // 4. If regression detected, send focused alerts
    if (regression.isRegression) {
      await handleRegression(regression, workspaceId, ownerEmail, scheduleName);
    }

    // 5. Dispatch webhook event for scheduled scans specifically
    await dispatchWebhookEvent("scan.completed", {
      scanId: scan.id,
      url,
      score: scan.summary.score,
      violations: scan.summary.totalViolations,
      critical: scan.summary.critical,
      triggeredBy: "schedule",
      scheduleName,
      regression: regression.isRegression
        ? { scoreDelta: regression.scoreDelta, newViolations: regression.newViolations.length }
        : null,
    }).catch(() => {/* non-blocking */});

    // 6. Mark schedule as executed + calculate next run
    await markScheduleExecuted(scheduleId, cron);

    // 7. Audit trail
    await prisma.auditLog.create({
      data: {
        action: "schedule.executed",
        target: scheduleId,
        workspaceId,
        metadata: {
          scanId: scan.id,
          url,
          score: scan.summary.score,
          violations: scan.summary.totalViolations,
          isRegression: regression.isRegression,
          scoreDelta: regression.scoreDelta,
        },
      },
    });

    return {
      scheduleId,
      url,
      status: "success",
      score: scan.summary.score,
      isRegression: regression.isRegression,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";

    // Still advance the schedule to prevent infinite retry loops
    await markScheduleFailed(scheduleId, cron, errorMsg);

    // Audit the failure
    await prisma.auditLog.create({
      data: {
        action: "schedule.failed",
        target: scheduleId,
        workspaceId,
        metadata: { url, error: errorMsg },
      },
    }).catch(() => {});

    return {
      scheduleId,
      url,
      status: "failed",
      error: errorMsg,
    };
  }
}

/**
 * Handle a detected regression — notify the workspace owner.
 */
async function handleRegression(
  regression: Awaited<ReturnType<typeof detectRegressions>>,
  workspaceId: string,
  ownerEmail?: string,
  scheduleName?: string,
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://reglayer.vercel.app";
  const reportUrl = `${appUrl}/scans/${regression.currentScanId}`;

  // In-app notifications for score degradation
  if (Math.abs(regression.scoreDelta) >= 5) {
    await notifyWorkspace(workspaceId, {
      type: "scoreDegraded",
      title: `Score dropped ${Math.abs(regression.scoreDelta)} points`,
      body: `${regression.url} score went from ${regression.previousScore} → ${regression.currentScore}`,
      link: reportUrl,
      emailSubject: `⚠️ Score drop detected: ${regression.url}`,
      emailHtml: `<p>Your accessibility score for <strong>${regression.url}</strong> dropped from ${regression.previousScore} to ${regression.currentScore} (${regression.scoreDelta} points).</p><p><a href="${reportUrl}">View report →</a></p>`,
    }).catch(() => {});
  }

  // In-app notifications for new critical violations
  const criticalNew = regression.newViolations.filter((v) => v.impact === "critical");
  if (criticalNew.length > 0) {
    await notifyWorkspace(workspaceId, {
      type: "newViolations",
      title: `${criticalNew.length} new critical violation${criticalNew.length > 1 ? "s" : ""}`,
      body: `${regression.url} has new critical accessibility issues that need attention`,
      link: reportUrl,
      emailSubject: `🚨 New critical violations: ${regression.url}`,
      emailHtml: `<p><strong>${criticalNew.length}</strong> new critical violation${criticalNew.length > 1 ? "s" : ""} detected on <strong>${regression.url}</strong>.</p><p><a href="${reportUrl}">View details →</a></p>`,
    }).catch(() => {});
  }

  // Email alert to workspace owner
  if (ownerEmail) {
    await sendRegressionAlert(ownerEmail, {
      url: regression.url,
      previousScore: regression.previousScore ?? 0,
      currentScore: regression.currentScore,
      scoreDelta: regression.scoreDelta,
      newViolations: regression.newViolations,
      fixedViolations: regression.fixedViolations,
      reportUrl,
      scheduleName: scheduleName || "Scheduled scan",
    }).catch(() => {});
  }

  // Dispatch to integrations (Slack, etc.) with regression context
  await dispatchToIntegrations(workspaceId, "score.degraded", {
    url: regression.url,
    previousScore: regression.previousScore,
    currentScore: regression.currentScore,
    scoreDelta: regression.scoreDelta,
    newViolations: regression.newViolations.length,
    criticalNew: regression.newViolations.filter((v) => v.impact === "critical").length,
    summary: regression.summary,
    reportUrl,
  }).catch(() => {});

  // Fire dedicated webhook event
  await dispatchWebhookEvent("score.degraded", {
    url: regression.url,
    previousScore: regression.previousScore,
    currentScore: regression.currentScore,
    scoreDelta: regression.scoreDelta,
    newViolations: regression.newViolations,
    fixedViolations: regression.fixedViolations,
    reportUrl,
  }).catch(() => {});
}
