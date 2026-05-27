/**
 * ---------------------------------------------------------
 * RegLayer — Job Queue (In-Memory)
 * ---------------------------------------------------------
 *
 * Purpose:
 * Async job queue for scan operations.
 *
 * Why this exists:
 * Scans can take 10-30+ seconds. Blocking HTTP requests
 * for that duration is unacceptable. A queue enables:
 * - Immediate response to client
 * - Background processing
 * - Status polling
 * - Retry on failure
 *
 * Architecture:
 * V1: In-memory queue (development/single-instance)
 * V2: BullMQ + Redis (production/multi-instance)
 *
 * The interface is identical — only the backing store changes.
 * ---------------------------------------------------------
 */

import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";
import { logger } from "@/lib/telemetry/logger";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import type { ScanOptions, ScanResult, ComplianceReport } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type ScanStage = "queued" | "launching" | "analyzing" | "scoring" | "screenshot" | "persisting" | "complete" | "failed";

export interface ScanJob {
  id: string;
  url: string;
  options?: ScanOptions;
  status: JobStatus;
  stage: ScanStage;
  userEmail: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    scan: ScanResult;
    compliance: ComplianceReport;
  };
  error?: string;
  errorCode?: "TIMEOUT" | "UNREACHABLE" | "BROWSER_CRASH" | "BLOCKED" | "INVALID_URL" | "UNKNOWN";
  retryable?: boolean;
  progress?: number;
}

// In-memory job store
const jobs = new Map<string, ScanJob>();

// TTL: evict completed/failed jobs after 30 minutes
const JOB_TTL_MS = 30 * 60 * 1000;
const MAX_JOBS = 500;

function evictStaleJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (
      (job.status === "completed" || job.status === "failed") &&
      job.completedAt &&
      now - new Date(job.completedAt).getTime() > JOB_TTL_MS
    ) {
      jobs.delete(id);
    }
  }
  // Hard cap: if still over limit, remove oldest completed
  if (jobs.size > MAX_JOBS) {
    const sorted = Array.from(jobs.entries())
      .filter(([, j]) => j.status === "completed" || j.status === "failed")
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime());
    for (const [id] of sorted) {
      jobs.delete(id);
      if (jobs.size <= MAX_JOBS) break;
    }
  }
}

// Simple queue processing
let isProcessing = false;
const queue: string[] = [];

/**
 * Enqueue a new scan job.
 * Returns immediately with job ID for polling.
 */
export function enqueueScanJob(url: string, options?: ScanOptions, userEmail?: string): ScanJob {
  evictStaleJobs();

  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Deduplication: check if same URL was scanned by same user in last 60 seconds
  for (const existingJob of jobs.values()) {
    if (
      existingJob.url === url &&
      existingJob.userEmail === (userEmail || "") &&
      (existingJob.status === "queued" || existingJob.status === "processing") &&
      Date.now() - new Date(existingJob.createdAt).getTime() < 60_000
    ) {
      return existingJob; // Return existing in-flight job
    }
  }

  const job: ScanJob = {
    id,
    url,
    options,
    userEmail: userEmail || "",
    status: "queued",
    stage: "queued",
    createdAt: new Date().toISOString(),
    progress: 0,
  };

  jobs.set(id, job);
  queue.push(id);

  // Start processing if not already running
  processQueue();

  return job;
}

/**
 * Get job status by ID.
 */
export function getJob(id: string): ScanJob | undefined {
  return jobs.get(id);
}

/**
 * Get all jobs (admin use only).
 */
export function getAllJobs(): ScanJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Get jobs for a specific user.
 */
export function getJobsForUser(userEmail: string): ScanJob[] {
  return Array.from(jobs.values())
    .filter((job) => job.userEmail === userEmail)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Process queued jobs sequentially.
 */
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  const queueLogger = logger.withContext({ worker: "scanQueue" });

  while (queue.length > 0) {
    const jobId = queue.shift()!;
    const job = jobs.get(jobId);
    if (!job) continue;

    job.status = "processing";
    job.stage = "launching";
    job.startedAt = new Date().toISOString();
    job.progress = 5;

    queueLogger.info("Processing scan job", { jobId, url: job.url });

    try {
      const scanResult = await executeScanPipeline(
        job.url,
        job.options,
        (stage, percent) => {
          job.stage = stage as ScanJob["stage"];
          job.progress = percent;
        }
      );

      job.stage = "persisting";
      job.progress = 90;
      const compliance = evaluateCompliance(scanResult.id, scanResult.violations);

      // Persist to database with user/workspace scoping
      try {
        let userId: string | undefined;
        let workspaceId: string | undefined;

        if (job.userEmail) {
          const user = await prisma.user.findUnique({ where: { email: job.userEmail } });
          if (user) {
            userId = user.id;
            workspaceId = await getOrCreateWorkspace(user.id, user.email);
          }
        }

        await prisma.scan.create({
          data: {
            id: scanResult.id,
            url: scanResult.url,
            status: "COMPLETED",
            score: scanResult.summary.score,
            totalViolations: scanResult.summary.totalViolations,
            critical: scanResult.summary.critical,
            serious: scanResult.summary.serious,
            moderate: scanResult.summary.moderate,
            minor: scanResult.summary.minor,
            compliance: compliance.overallCompliance,
            pageTitle: scanResult.metadata.pageTitle || null,
            duration: scanResult.metadata.scanDuration,
            screenshot: scanResult.screenshot || null,
            startedAt: new Date(scanResult.timestamp),
            completedAt: new Date(),
            userId,
            workspaceId,
            metadata: {
              browserEngine: scanResult.metadata.browserEngine,
              axeCoreVersion: scanResult.metadata.axeCoreVersion,
            },
            violations: {
              create: scanResult.violations.map((v) => ({
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
      } catch (persistErr) {
        queueLogger.error("Failed to persist scan", {
          jobId,
          error: persistErr instanceof Error ? persistErr.message : "Unknown",
        });
      }

      job.progress = 100;
      job.status = "completed";
      job.stage = "complete";
      job.completedAt = new Date().toISOString();
      job.result = { scan: scanResult, compliance };

      queueLogger.info("Job completed", { jobId, score: scanResult.summary.score });
    } catch (error) {
      job.status = "failed";
      job.stage = "failed";
      job.completedAt = new Date().toISOString();

      const message = error instanceof Error ? error.message : "Unknown error";
      job.error = message;

      // Classify error for client UX
      if (message.includes("timeout") || message.includes("Timeout")) {
        job.errorCode = "TIMEOUT";
        job.retryable = true;
      } else if (message.includes("ERR_NAME_NOT_RESOLVED") || message.includes("ENOTFOUND")) {
        job.errorCode = "UNREACHABLE";
        job.retryable = false;
      } else if (message.includes("net::ERR_") || message.includes("Navigation failed")) {
        job.errorCode = "BLOCKED";
        job.retryable = true;
      } else if (message.includes("browser") || message.includes("crashed") || message.includes("Protocol error")) {
        job.errorCode = "BROWSER_CRASH";
        job.retryable = true;
      } else {
        job.errorCode = "UNKNOWN";
        job.retryable = true;
      }

      queueLogger.error("Job failed", { jobId, error: job.error, errorCode: job.errorCode });
    }
  }

  isProcessing = false;
}
