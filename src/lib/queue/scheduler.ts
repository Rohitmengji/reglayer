/**
 * ---------------------------------------------------------
 * RegLayer — Scan Scheduler
 * ---------------------------------------------------------
 *
 * Purpose:
 * Manages scheduled/recurring scan configurations.
 *
 * Why this exists:
 * Compliance is not a one-time check. It requires:
 * - Regular monitoring
 * - Regression detection
 * - Trend tracking over time
 *
 * Architecture:
 * V1: In-memory schedule store with cron-triggered execution
 * V2: Database-backed with BullMQ repeatable jobs
 *
 * Engineering Notes:
 * - Schedules are defined with cron expressions
 * - Each schedule produces scan jobs via the queue
 * - Execution is triggered via API (cron service calls endpoint)
 * ---------------------------------------------------------
 */

import { CronExpressionParser } from "cron-parser";
import { enqueueScanJob } from "@/lib/queue/scanQueue";
import { logger } from "@/lib/telemetry/logger";
import type { ScanOptions } from "@/lib/types";

export interface ScanSchedule {
  id: string;
  name: string;
  url: string;
  cron: string;
  options?: ScanOptions;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

// In-memory schedule store
const schedules = new Map<string, ScanSchedule>();

/**
 * Create a new scan schedule.
 */
export function createSchedule(params: {
  name: string;
  url: string;
  cron: string;
  options?: ScanOptions;
}): ScanSchedule {
  const id = `sched_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

  const nextRun = getNextRun(params.cron);

  const schedule: ScanSchedule = {
    id,
    name: params.name,
    url: params.url,
    cron: params.cron,
    options: params.options,
    enabled: true,
    createdAt: new Date().toISOString(),
    nextRunAt: nextRun?.toISOString(),
  };

  schedules.set(id, schedule);
  return schedule;
}

/**
 * Get all schedules.
 */
export function getSchedules(): ScanSchedule[] {
  return Array.from(schedules.values());
}

/**
 * Get a specific schedule.
 */
export function getSchedule(id: string): ScanSchedule | undefined {
  return schedules.get(id);
}

/**
 * Toggle schedule enabled/disabled.
 */
export function toggleSchedule(id: string): ScanSchedule | undefined {
  const schedule = schedules.get(id);
  if (!schedule) return undefined;

  schedule.enabled = !schedule.enabled;
  if (schedule.enabled) {
    schedule.nextRunAt = getNextRun(schedule.cron)?.toISOString();
  }
  return schedule;
}

/**
 * Delete a schedule.
 */
export function deleteSchedule(id: string): boolean {
  return schedules.delete(id);
}

/**
 * Execute all due schedules.
 * Called by cron trigger endpoint.
 */
export function executeDueSchedules(): string[] {
  const now = new Date();
  const executed: string[] = [];
  const schedLogger = logger.withContext({ module: "scheduler" });

  for (const schedule of schedules.values()) {
    if (!schedule.enabled) continue;
    if (!schedule.nextRunAt) continue;

    const nextRun = new Date(schedule.nextRunAt);
    if (nextRun <= now) {
      // Enqueue the scan
      enqueueScanJob(schedule.url, schedule.options);
      executed.push(schedule.id);

      // Update timestamps
      schedule.lastRunAt = now.toISOString();
      schedule.nextRunAt = getNextRun(schedule.cron)?.toISOString();

      schedLogger.info("Scheduled scan executed", {
        scheduleId: schedule.id,
        url: schedule.url,
      });
    }
  }

  return executed;
}

/**
 * Calculate next run time from cron expression.
 */
function getNextRun(cron: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron);
    return interval.next().toDate();
  } catch {
    return null;
  }
}
