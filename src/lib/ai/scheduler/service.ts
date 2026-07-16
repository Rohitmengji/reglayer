/**
 * RegLayer — Agent Scheduler
 *
 * Run agents on schedules (cron), events, or manually — without human trigger.
 *
 * TRIGGERS:
 *   CRON  — Hourly/daily/weekly/custom cron expression
 *   EVENT — React to system events (scan.completed, score.dropped, violation.new)
 *   MANUAL — On-demand via API or UI button
 *
 * OUTPUT ACTIONS:
 *   LOG     — Persist output for audit trail
 *   NOTIFY  — Email the result to configured recipient
 *   WEBHOOK — POST result to external URL
 *   APPROVE — Create ApprovalRequest for human review before action
 *
 * ARCHITECTURE:
 *   ┌──────────────┐
 *   │  Trigger     │  Cron tick / System event / API call
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐
 *   │ Resolve task │  Interpolate template with event data
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐
 *   │ Run agent    │  runConversation() via A2A protocol
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐
 *   │ Output action│  Log / Email / Webhook / Approval
 *   └──────┬───────┘
 *          ▼
 *   ┌──────────────┐
 *   │ Update run   │  Persist result, advance nextRunAt
 *   └──────────────┘
 *
 * INSPIRED BY:
 *   - GitHub Actions (scheduled workflows)
 *   - n8n (event-triggered automation)
 *   - Temporal (scheduled workflow execution)
 *   - AutoGPT (autonomous loop agents)
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import { CronExpressionParser } from "cron-parser";
import { runConversation } from "@/lib/ai/a2a/protocol";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "agent-scheduler" });

// ── Types ─────────────────────────────────────────────────────────────────────

export type AgentTrigger = "CRON" | "EVENT" | "MANUAL";
export type OutputAction = "LOG" | "NOTIFY" | "WEBHOOK" | "APPROVE";

export interface AgentScheduleEntry {
  id: string;
  name: string;
  agentSlug: string;
  trigger: AgentTrigger;
  cron: string | null;
  eventType: string | null;
  taskTemplate: string;
  enabled: boolean;
  outputAction: OutputAction;
  notifyEmail: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  runCount: number;
}

export interface ScheduleRunEntry {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  trigger: string;
  output: string | null;
  error: string | null;
  costUsd: number;
  durationMs: number;
  createdAt: Date;
}

// ── Schedule CRUD ─────────────────────────────────────────────────────────────

export async function createSchedule(opts: {
  name: string;
  agentSlug: string;
  trigger: AgentTrigger;
  cron?: string;
  eventType?: string;
  taskTemplate: string;
  outputAction?: OutputAction;
  notifyEmail?: string;
  webhookUrl?: string;
  workspaceId: string;
  createdBy: string;
}): Promise<AgentScheduleEntry> {
  const nextRunAt = opts.cron ? calculateNextRun(opts.cron) : null;

  const result = await prisma.agentSchedule.create({
    data: {
      name: opts.name,
      agentSlug: opts.agentSlug,
      trigger: opts.trigger,
      cron: opts.cron ?? null,
      eventType: opts.eventType ?? null,
      taskTemplate: opts.taskTemplate,
      outputAction: opts.outputAction ?? "LOG",
      notifyEmail: opts.notifyEmail ?? null,
      webhookUrl: opts.webhookUrl ?? null,
      nextRunAt,
      workspaceId: opts.workspaceId,
      createdBy: opts.createdBy,
    },
  });

  return mapSchedule(result);
}

export async function listSchedules(
  workspaceId: string,
  opts?: { enabled?: boolean; limit?: number },
): Promise<AgentScheduleEntry[]> {
  const results = await prisma.agentSchedule.findMany({
    where: {
      workspaceId,
      ...(opts?.enabled !== undefined ? { enabled: opts.enabled } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts?.limit ?? 50,
  });
  return results.map(mapSchedule);
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<boolean> {
  const result = await prisma.agentSchedule.updateMany({
    where: { id },
    data: { enabled },
  });
  return result.count > 0;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  try {
    await prisma.agentSchedule.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

// ── Cron Execution ────────────────────────────────────────────────────────────

/**
 * Get all due agent schedules (cron-triggered, nextRunAt <= now).
 * Called by the cron runner to find which agents need to run.
 */
export async function getDueAgentSchedules(limit = 20): Promise<AgentScheduleEntry[]> {
  const results = await prisma.agentSchedule.findMany({
    where: {
      enabled: true,
      trigger: "CRON",
      nextRunAt: { lte: new Date() },
    },
    orderBy: { nextRunAt: "asc" },
    take: limit,
  });
  return results.map(mapSchedule);
}

/**
 * Execute a scheduled agent run.
 * Resolves the task template, runs the agent, handles output action.
 */
export async function executeScheduledRun(
  scheduleId: string,
  triggerLabel: string,
  eventData?: Record<string, unknown>,
): Promise<ScheduleRunEntry> {
  const schedule = await prisma.agentSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new Error("Schedule not found");

  // Create run record
  const run = await prisma.agentScheduleRun.create({
    data: {
      scheduleId,
      trigger: triggerLabel,
      input: (eventData ?? {}) as object,
    },
  });

  const startTime = Date.now();

  try {
    // Resolve task template with event data
    const task = resolveTemplate(schedule.taskTemplate, eventData ?? {});

    // Run the agent conversation
    const conversation = await runConversation({
      agentSlug: schedule.agentSlug,
      task,
      userId: schedule.createdBy,
      workspaceId: schedule.workspaceId,
    });

    // Extract the final agent response
    const agentMessages = conversation.messages.filter((m) => m.role === "AGENT");
    const finalOutput = agentMessages[agentMessages.length - 1]?.content ?? "No output";
    const totalCost = conversation.totalCostUsd;
    const durationMs = Date.now() - startTime;

    // Handle output action
    await handleOutputAction(schedule, finalOutput);

    // Update run as completed
    await prisma.agentScheduleRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        output: finalOutput,
        costUsd: totalCost,
        durationMs,
        completedAt: new Date(),
      },
    });

    // Advance schedule
    const nextRunAt = schedule.cron ? calculateNextRun(schedule.cron) : null;
    await prisma.agentSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
        runCount: { increment: 1 },
        lastError: null,
      },
    });

    return {
      id: run.id, status: "COMPLETED", trigger: triggerLabel,
      output: finalOutput, error: null, costUsd: totalCost, durationMs, createdAt: run.createdAt,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const durationMs = Date.now() - startTime;

    await prisma.agentScheduleRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error, durationMs, completedAt: new Date() },
    });

    await prisma.agentSchedule.update({
      where: { id: scheduleId },
      data: { lastError: error },
    });

    return {
      id: run.id, status: "FAILED", trigger: triggerLabel,
      output: null, error, costUsd: 0, durationMs, createdAt: run.createdAt,
    };
  }
}

// ── Event-Driven Execution ────────────────────────────────────────────────────

/**
 * Fire all agent schedules that listen for a specific event type.
 * Called from event emitters (scan completion, score change, etc.).
 *
 * Example:
 *   fireAgentEvent("scan.completed", "ws-123", { scanId: "s1", url: "example.com", score: 85 })
 *   → Triggers all schedules with trigger=EVENT, eventType="scan.completed" in ws-123
 */
export async function fireAgentEvent(
  eventType: string,
  workspaceId: string,
  eventData: Record<string, unknown>,
): Promise<number> {
  const schedules = await prisma.agentSchedule.findMany({
    where: {
      workspaceId,
      enabled: true,
      trigger: "EVENT",
      eventType,
    },
  });

  let fired = 0;
  for (const schedule of schedules) {
    try {
      await executeScheduledRun(schedule.id, `event:${eventType}`, eventData);
      fired++;
    } catch (err) {
      log.warn("Agent event execution failed", {
        scheduleId: schedule.id,
        eventType,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return fired;
}

/**
 * Get run history for a schedule (for UI display).
 */
export async function getRunHistory(
  scheduleId: string,
  limit = 20,
): Promise<ScheduleRunEntry[]> {
  const runs = await prisma.agentScheduleRun.findMany({
    where: { scheduleId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return runs.map((r) => ({
    id: r.id,
    status: r.status as ScheduleRunEntry["status"],
    trigger: r.trigger,
    output: r.output,
    error: r.error,
    costUsd: r.costUsd,
    durationMs: r.durationMs,
    createdAt: r.createdAt,
  }));
}

// ── Template Resolution ───────────────────────────────────────────────────────

/**
 * Resolve a task template with event data.
 * Replaces {{variable}} placeholders with values from the event.
 *
 * Example:
 *   template: "Analyze scan {{scanId}} for {{url}} — score was {{score}}"
 *   data: { scanId: "s1", url: "example.com", score: 85 }
 *   result: "Analyze scan s1 for example.com — score was 85"
 */
export function resolveTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = data[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

// ── Output Action Handling ────────────────────────────────────────────────────

async function handleOutputAction(
  schedule: { outputAction: string; notifyEmail: string | null; webhookUrl: string | null; workspaceId: string; createdBy: string },
  output: string,
): Promise<void> {
  switch (schedule.outputAction) {
    case "NOTIFY":
      if (schedule.notifyEmail) {
        // Fire-and-forget email (import dynamically to avoid circular deps)
        try {
          const { sendEmail } = await import("@/lib/email/service");
          await sendEmail({
            to: schedule.notifyEmail,
            subject: "RegLayer Agent Report",
            text: output,
            html: `<pre style="white-space:pre-wrap;font-family:monospace">${output}</pre>`,
          });
        } catch {
          log.warn("Agent notification email failed", { email: schedule.notifyEmail });
        }
      }
      break;

    case "WEBHOOK":
      if (schedule.webhookUrl) {
        try {
          await fetch(schedule.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ output, timestamp: new Date().toISOString() }),
            signal: AbortSignal.timeout(10000),
          });
        } catch {
          log.warn("Agent webhook delivery failed", { url: schedule.webhookUrl });
        }
      }
      break;

    case "APPROVE": {
      // Create an approval request for human review
      const { createApprovalRequest } = await import("@/lib/ai/approval/service");
      await createApprovalRequest({
        type: "POLICY_UPDATE",
        title: "Agent Report — Requires Review",
        content: { agentOutput: output },
        requestedBy: schedule.createdBy,
        workspaceId: schedule.workspaceId,
      });
      break;
    }

    case "LOG":
    default:
      // Output already persisted in the run record
      break;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calculateNextRun(cron: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron, { currentDate: new Date() });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

function mapSchedule(row: {
  id: string; name: string; agentSlug: string; trigger: string;
  cron: string | null; eventType: string | null; taskTemplate: string;
  enabled: boolean; outputAction: string; notifyEmail: string | null;
  lastRunAt: Date | null; nextRunAt: Date | null; runCount: number;
}): AgentScheduleEntry {
  return {
    id: row.id, name: row.name, agentSlug: row.agentSlug,
    trigger: row.trigger as AgentTrigger, cron: row.cron,
    eventType: row.eventType, taskTemplate: row.taskTemplate,
    enabled: row.enabled, outputAction: row.outputAction as OutputAction,
    notifyEmail: row.notifyEmail, lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt, runCount: row.runCount,
  };
}
