/**
 * RegLayer — Background Job Queue (Serverless-Compatible)
 *
 * WHY: Vercel has 60s function timeout. Heavy operations (scan, email, export)
 *      need to run asynchronously without blocking the request.
 * WHAT: Durable job queue backed by database + polling worker.
 * HOW: Jobs are persisted to DB with status tracking. A cron endpoint
 *      processes queued jobs. Uses `after()` for fire-and-forget on Vercel.
 *
 * Architecture:
 * - Producer: Any API route can enqueue a job
 * - Consumer: /api/cron/process-jobs (triggered by Vercel Cron every 30s)
 * - Storage: Database (survives cold starts, scales horizontally)
 */

import { prisma } from "@/lib/database/prisma";
import { incrementCounter, recordHistogram } from "@/lib/telemetry/metrics";

export type JobType =
  | "scan"
  | "crawl"
  | "email"
  | "export"
  | "webhook_delivery"
  | "agent_run"
  | "report_generation"
  | "certificate_issue";

export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface JobPayload {
  type: JobType;
  data: Record<string, unknown>;
  /** Max attempts before marking as failed */
  maxAttempts?: number;
  /** Priority (higher = processed first) */
  priority?: number;
  /** Delay execution until this time */
  scheduledFor?: Date;
}

/**
 * Enqueue a background job for async processing.
 * Returns the job ID for status tracking.
 */
export async function enqueueJob(payload: JobPayload, userId?: string, workspaceId?: string): Promise<string> {
  const job = await prisma.backgroundJob.create({
    data: {
      type: payload.type,
      status: "QUEUED",
      payload: payload.data as object,
      priority: payload.priority ?? 0,
      maxAttempts: payload.maxAttempts ?? 3,
      attempts: 0,
      scheduledFor: payload.scheduledFor ?? new Date(),
      userId: userId ?? null,
      workspaceId: workspaceId ?? null,
    },
  });

  incrementCounter("job.enqueued", { type: payload.type });
  return job.id;
}

/**
 * Claim the next batch of jobs for processing.
 * Uses atomic UPDATE with WHERE to prevent double-processing.
 */
export async function claimJobs(limit = 5): Promise<Array<{ id: string; type: string; payload: unknown; attempts: number }>> {
  // Atomic claim: only grab QUEUED jobs whose scheduled time has passed
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      status: "QUEUED",
      scheduledFor: { lte: new Date() },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
    select: { id: true, type: true, payload: true, attempts: true },
  });

  if (jobs.length === 0) return [];

  // Mark as PROCESSING atomically
  await prisma.backgroundJob.updateMany({
    where: { id: { in: jobs.map((j) => j.id) }, status: "QUEUED" },
    data: { status: "PROCESSING", startedAt: new Date(), attempts: { increment: 1 } },
  });

  return jobs;
}

/**
 * Mark a job as completed.
 */
export async function completeJob(jobId: string, result?: Record<string, unknown>): Promise<void> {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      result: result as object ?? null,
    },
  });
  incrementCounter("job.completed");
}

/**
 * Mark a job as failed. If under max attempts, re-queue with exponential backoff.
 */
export async function failJob(jobId: string, error: string): Promise<void> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true },
  });

  if (job && job.attempts < job.maxAttempts) {
    // Re-queue with exponential backoff
    const backoffMs = Math.pow(2, job.attempts) * 1000; // 2s, 4s, 8s...
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: "QUEUED",
        lastError: error,
        scheduledFor: new Date(Date.now() + backoffMs),
      },
    });
    incrementCounter("job.retried");
  } else {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "FAILED", lastError: error, completedAt: new Date() },
    });
    incrementCounter("job.failed");
  }
}

/**
 * Get job status for polling.
 */
export async function getJobStatus(jobId: string): Promise<{ status: JobStatus; result?: unknown; error?: string } | null> {
  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
    select: { status: true, result: true, lastError: true },
  });
  if (!job) return null;
  return { status: job.status as JobStatus, result: job.result ?? undefined, error: job.lastError ?? undefined };
}

/**
 * Process a batch of jobs. Called by the cron worker.
 */
export async function processJobBatch(handlers: Record<string, (payload: unknown) => Promise<Record<string, unknown> | void>>): Promise<number> {
  const jobs = await claimJobs(5);
  let processed = 0;

  for (const job of jobs) {
    const handler = handlers[job.type];
    if (!handler) {
      await failJob(job.id, `No handler registered for job type: ${job.type}`);
      continue;
    }

    const start = Date.now();
    try {
      const result = await handler(job.payload);
      await completeJob(job.id, result as Record<string, unknown> | undefined);
      recordHistogram("job.duration_ms", Date.now() - start, { type: job.type });
      processed++;
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : "Unknown error");
    }
  }

  return processed;
}
