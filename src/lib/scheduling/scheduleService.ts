/**
 * ---------------------------------------------------------
 * RegLayer — Schedule Service (Database-Backed)
 * ---------------------------------------------------------
 *
 * Production-grade scheduling service backed by PostgreSQL.
 * Replaces the in-memory scheduler for reliable execution
 * across serverless deployments.
 *
 * Design:
 * - All state in Postgres (survives restarts/deploys)
 * - Idempotent execution (safe if cron fires twice)
 * - Plan-aware rate limiting
 * - Audit trail for every execution
 * - Graceful error handling per-schedule (one failure doesn't block others)
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import { CronExpressionParser } from "cron-parser";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "scheduleService" });

// Plan limits: minimum interval between runs (in minutes).
//
// IMPORTANT (C-4): Vercel Hobby allows only ONE daily cron, so the cron runner
// can physically deliver at most a daily cadence. We must not advertise sub-daily
// cadences the cron can't honor. ENTERPRISE is therefore set to daily (the smallest
// the daily cron can deliver) rather than hourly.
//
// To honor sub-daily cadences (e.g. hourly), the system needs either a real queue
// (e.g. Upstash QStash) or a paid Vercel plan with sub-daily cron schedules.
const PLAN_MIN_INTERVAL: Record<string, number> = {
  FREE: 10080,       // Weekly (7 days)
  PRO: 1440,         // Daily
  ENTERPRISE: 1440,  // Daily (smallest cadence a single daily Vercel Hobby cron can deliver)
};

/**
 * Calculate the next run time from a cron expression.
 */
export function calculateNextRun(cron: string, from?: Date): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: from || new Date(),
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

/**
 * Validate a cron expression against plan limits.
 * Returns null if valid, error message if invalid.
 */
export function validateCronForPlan(cron: string, plan: string): string | null {
  const minInterval = PLAN_MIN_INTERVAL[plan] || PLAN_MIN_INTERVAL.FREE;

  try {
    const interval = CronExpressionParser.parse(cron);
    const first = interval.next().toDate();
    const second = interval.next().toDate();
    const diffMinutes = (second.getTime() - first.getTime()) / 60000;

    if (diffMinutes < minInterval) {
      const readable = minInterval >= 1440
        ? `${minInterval / 1440} day(s)`
        : `${minInterval} minutes`;
      return `Your plan allows a minimum interval of ${readable} between scans. Upgrade for more frequent monitoring.`;
    }
    return null;
  } catch {
    return "Invalid cron expression";
  }
}

/**
 * Create a new schedule in the database.
 */
export async function createScheduleInDB(params: {
  name: string;
  url: string;
  cron: string;
  workspaceId: string;
}) {
  // Ensure Site record exists
  let site = await prisma.site.findFirst({
    where: { workspaceId: params.workspaceId, url: params.url },
  });

  if (!site) {
    site = await prisma.site.create({
      data: {
        url: params.url,
        name: new URL(params.url).hostname,
        workspaceId: params.workspaceId,
      },
    });
  }

  const nextRunAt = calculateNextRun(params.cron);

  const schedule = await prisma.schedule.create({
    data: {
      name: params.name,
      cron: params.cron,
      enabled: true,
      nextRunAt,
      workspaceId: params.workspaceId,
      siteId: site.id,
    },
    include: { site: { select: { url: true, name: true } } },
  });

  // Audit
  await prisma.auditLog.create({
    data: {
      action: "schedule.created",
      target: schedule.id,
      workspaceId: params.workspaceId,
      metadata: { name: params.name, url: params.url, cron: params.cron },
    },
  });

  return schedule;
}

/**
 * Get due schedules (nextRunAt <= now AND enabled), oldest first.
 *
 * Uses a SELECT ... FOR UPDATE SKIP LOCKED pattern conceptually —
 * concurrent double-execution is prevented by the atomic claim
 * (see {@link claimSchedule}), which advances nextRunAt before the scan runs.
 *
 * @param take    Max rows to fetch this batch (default 10).
 * @param exclude Schedule ids already handled this run — excluded so a drain
 *                loop fetching successive batches doesn't re-fetch the same rows
 *                (e.g. ones deferred for per-workspace fairness or already claimed).
 */
export async function getDueSchedules(take = 10, exclude: string[] = []) {
  const now = new Date();

  return prisma.schedule.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      ...(exclude.length > 0 ? { id: { notIn: exclude } } : {}),
    },
    include: {
      site: { select: { url: true, name: true } },
      workspace: { select: { id: true, plan: true, members: { select: { userId: true, role: true, user: { select: { email: true } } }, take: 1, where: { role: "OWNER" } } } },
    },
    orderBy: { nextRunAt: "asc" },
    take,
  });
}

/**
 * Atomically claim a due schedule before running it (C1/REL-02).
 *
 * `getDueSchedules` is an unlocked read, so two concurrent cron invocations can
 * both see the same due schedule and double-run it. To close that read/run/update
 * window we optimistically claim the row: a conditional updateMany that advances
 * nextRunAt to its provisional next value ONLY if nextRunAt still equals the value
 * we read. This mirrors the optimistic WHERE-guarded update used by consumeCredits.
 *
 * Returns true if THIS caller won the claim (count === 1) and should run the scan;
 * false if another invocation already claimed it (count === 0).
 *
 * On success the schedule is already advanced to its next run, so a crash mid-scan
 * won't cause an infinite retry. markScheduleExecuted/markScheduleFailed still run
 * afterwards to record lastRunAt and recompute nextRunAt from the completion time.
 *
 * @param scheduleId      The schedule to claim.
 * @param expectedNextRun The nextRunAt value observed when the row was read.
 * @param cron            The cron expression, used to compute the provisional next run.
 */
export async function claimSchedule(
  scheduleId: string,
  expectedNextRun: Date | null,
  cron: string,
): Promise<boolean> {
  // Provisional next run, computed from the value we read so it's deterministic
  // across concurrent invocations that read the same row.
  const provisionalNext = calculateNextRun(cron, expectedNextRun ?? new Date());

  const result = await prisma.schedule.updateMany({
    where: {
      id: scheduleId,
      enabled: true,
      nextRunAt: expectedNextRun,
    },
    data: { nextRunAt: provisionalNext },
  });

  return result.count === 1;
}

/**
 * Mark a schedule as executed and calculate next run.
 */
export async function markScheduleExecuted(scheduleId: string, cron: string) {
  const now = new Date();
  const nextRunAt = calculateNextRun(cron, now);

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: now,
      nextRunAt,
    },
  });
}

/**
 * Mark a schedule as failed (still advance nextRunAt to avoid infinite retry loops).
 */
export async function markScheduleFailed(scheduleId: string, cron: string, error: string) {
  const now = new Date();
  const nextRunAt = calculateNextRun(cron, now);

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: now,
      nextRunAt,
    },
  });

  log.warn("Schedule execution failed", { scheduleId, error });
}

/**
 * Toggle a schedule enabled/disabled.
 */
export async function toggleScheduleInDB(scheduleId: string) {
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) return null;

  const enabled = !schedule.enabled;
  const nextRunAt = enabled ? calculateNextRun(schedule.cron) : null;

  return prisma.schedule.update({
    where: { id: scheduleId },
    data: { enabled, nextRunAt },
    include: { site: { select: { url: true, name: true } } },
  });
}

/**
 * Delete a schedule.
 */
export async function deleteScheduleFromDB(scheduleId: string, workspaceId: string) {
  await prisma.schedule.delete({ where: { id: scheduleId } });

  await prisma.auditLog.create({
    data: {
      action: "schedule.deleted",
      target: scheduleId,
      workspaceId,
    },
  });
}

/**
 * List all schedules for a workspace with recent execution info.
 */
export async function listSchedulesForWorkspace(workspaceId: string) {
  return prisma.schedule.findMany({
    where: { workspaceId },
    include: {
      site: { select: { url: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
