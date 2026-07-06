/**
 * ---------------------------------------------------------
 * RegLayer — Cron: Run Scheduled Scans
 * ---------------------------------------------------------
 *
 * Vercel Cron endpoint that executes due scan schedules.
 *
 * Invoked once daily by Vercel Cron (Hobby plan allows a single daily cron;
 * see vercel.json "0 6 * * *"). Because runs are infrequent, each invocation
 * DRAINS the due backlog within its time budget instead of stopping after one
 * batch. Protected by CRON_SECRET header (Vercel injects this automatically for
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
 * - Drains the due backlog within a 50s budget (Vercel 60s limit), in batches
 * - Per-workspace fairness so one tenant can't starve others in a single run
 * - Each schedule failure is isolated (doesn't block others)
 * - Atomic claim per schedule (C1/REL-02) so concurrent invocations don't double-run
 * - Rate-limited by plan (Free=weekly, Pro=daily, Enterprise=daily)
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { performScan } from "@/services/scanService";
import { detectRegressions } from "@/lib/intelligence/regressionDetector";
import { getDueSchedules, claimSchedule, markScheduleExecuted, markScheduleFailed } from "@/lib/scheduling/scheduleService";
import { sendRegressionAlert } from "@/lib/email/service";
import { dispatchToIntegrations } from "@/lib/integrations/dispatcher";
import { dispatchWebhookEvent, redeliverFailedWebhooks } from "@/lib/integrations/webhookDispatcher";
import { runAutopilot } from "@/lib/autopilot/orchestrator";
import { prisma } from "@/lib/database/prisma";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "cron:run-schedules" });

export const maxDuration = 60; // Vercel max for cron functions
export const dynamic = "force-dynamic";

// Time budget per invocation. Vercel caps cron functions at 60s; leave headroom
// for the response + the webhook redelivery sweep.
const TIME_BUDGET_MS = 50_000;
// How many schedules to fetch per batch while draining the backlog.
const BATCH_SIZE = 10;
// Per-workspace fairness cap: max schedules we run for a single workspace per
// invocation, so one tenant's large backlog can't starve other tenants.
const MAX_PER_WORKSPACE = 3;

/**
 * GET /api/cron/run-schedules
 * Triggered once daily by Vercel Cron (see vercel.json "0 6 * * *").
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

  // Track schedules already handled this run (claimed/run/skipped/deferred) so
  // successive batch fetches exclude them and the loop makes forward progress.
  const handledIds = new Set<string>();
  // Per-workspace counter enforcing fairness across the whole invocation.
  const perWorkspaceCount = new Map<string, number>();
  // Count of schedules skipped this run because their workspace hit the fairness
  // cap. They stay due (their nextRunAt isn't advanced) and are picked up by a
  // later invocation; meanwhile they're added to handledIds so this run's drain
  // loop doesn't re-fetch and re-evaluate them.
  let deferredForFairness = 0;
  let budgetHit = false;

  try {
    // C-4: DRAIN the backlog. Vercel Hobby permits only one daily cron, so a
    // single run must process as many due schedules as the time budget allows
    // instead of stopping after the first batch of 10. We loop, fetching the
    // oldest-due schedules and processing them until either nothing is due or
    // the time budget is reached.
    while (Date.now() - startTime <= TIME_BUDGET_MS) {
      const batch = await getDueSchedules(BATCH_SIZE, [...handledIds]);
      if (batch.length === 0) break; // backlog drained

      for (const schedule of batch) {
        // Stop cleanly if we're out of budget mid-batch.
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          budgetHit = true;
          break;
        }

        handledIds.add(schedule.id);

        const workspaceId = schedule.workspaceId;

        // Per-workspace fairness: cap how many of one tenant's schedules run per
        // invocation so a tenant with a huge backlog can't starve the others.
        const ranForWorkspace = perWorkspaceCount.get(workspaceId) ?? 0;
        if (ranForWorkspace >= MAX_PER_WORKSPACE) {
          deferredForFairness++;
          continue;
        }

        // C1/REL-02: atomically claim the schedule before running it. The claim
        // advances nextRunAt past the value we read; only the invocation whose
        // conditional update affected a row (count === 1) proceeds. A losing
        // invocation (another already claimed it) skips silently — no double-run.
        const claimed = await claimSchedule(schedule.id, schedule.nextRunAt, schedule.cron);
        if (!claimed) {
          log.info("Schedule already claimed by another run, skipping", { scheduleId: schedule.id });
          continue;
        }

        const url = schedule.site.url;
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
        perWorkspaceCount.set(workspaceId, ranForWorkspace + 1);
      }

      if (budgetHit) {
        log.warn("Approaching timeout, deferring remaining schedules");
        break;
      }
    }

    const succeeded = results.filter((r) => r.status === "success").length;
    const failed = results.filter((r) => r.status === "failed").length;

    // R-4: best-effort webhook redelivery sweep within remaining budget. Replays
    // recent terminal webhook failures (the DLQ) and marks them handled. Fully
    // isolated so a sweep error never fails the cron run.
    let redelivery: { attempted: number; redelivered: number; stillFailing: number } | undefined;
    if (Date.now() - startTime < TIME_BUDGET_MS) {
      try {
        redelivery = await redeliverFailedWebhooks();
      } catch (sweepErr) {
        log.warn("Webhook redelivery sweep failed", {
          error: sweepErr instanceof Error ? sweepErr.message : "Unknown",
        });
      }
    }

    log.info("Cron execution complete", {
      succeeded,
      failed,
      deferredForFairness,
      budgetHit,
      durationMs: Date.now() - startTime,
    });

    // Piggyback the daily SSO certificate/health sweep so it runs on Vercel Hobby
    // (single scheduled cron). Best-effort + isolated — never affects scan results.
    let ssoHealth: { checked: number; warning: number; expired: number; invalid: number; alerts: number } | null = null;
    try {
      const { runSsoHealthChecks } = await import("@/lib/sso/health");
      ssoHealth = await runSsoHealthChecks();
    } catch (e) {
      log.error("SSO health sweep failed", { error: e instanceof Error ? e.message : "Unknown" });
    }

    return NextResponse.json({
      executedAt: new Date().toISOString(),
      processed: results.length,
      ssoHealth,
      succeeded,
      failed,
      deferredForFairness,
      budgetHit,
      redelivery,
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
    // Defense-in-depth SSRF guard. The create endpoint validates the URL, but a
    // public host can re-point at an internal IP after the fact (TOCTOU), and
    // schedules created before that guard existed were never checked. Use the
    // synchronous literal/range check (resolvesToInternalIp fails open and the
    // runner has a tight time budget). A throw here routes to the catch below,
    // which marks the schedule failed + audits it like any other scan failure.
    const ssrfError = validateScanUrl(url);
    if (ssrfError) {
      throw new Error(`Refusing to scan internal/unsafe URL: ${ssrfError}`);
    }

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
    }, workspaceId).catch(() => {/* non-blocking */});

    // 6. Mark schedule as executed + calculate next run
    await markScheduleExecuted(scheduleId, cron);

    // 7. Compliance Autopilot: auto-issue proof, update streak, manage cert, check reports.
    //    Best-effort — failures here never block the scan result.
    if (site) {
      runAutopilot({
        scanId: scan.id,
        siteId: site.id,
        workspaceId,
        url,
        score: scan.summary.score,
      }).catch(() => {/* non-blocking */});
    }

    // 8. Audit trail
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

  // Email alert to workspace owner — but honor their notification preferences.
  // A regression is a compliance drop / new-violations event, so gate on those
  // toggles (default ON when the owner has no preference row).
  if (ownerEmail) {
    const owner = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    });
    const prefs = owner
      ? await prisma.notificationPreference.findUnique({
          where: { userId: owner.id },
          select: { complianceAlerts: true, newViolations: true },
        })
      : null;
    const wantsRegressionEmail = !prefs || prefs.complianceAlerts || prefs.newViolations;

    if (wantsRegressionEmail) {
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
  }, workspaceId).catch(() => {});
}
