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
import type { ScanOptions, ScanResult, ComplianceReport } from "@/lib/types";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type ScanStage = "queued" | "launching" | "analyzing" | "scoring" | "screenshot" | "persisting" | "complete" | "failed";

export interface ScanJob {
  id: string;
  url: string;
  options?: ScanOptions;
  status: JobStatus;
  stage: ScanStage;
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

// Simple queue processing
let isProcessing = false;
const queue: string[] = [];

/**
 * Enqueue a new scan job.
 * Returns immediately with job ID for polling.
 */
export function enqueueScanJob(url: string, options?: ScanOptions): ScanJob {
  const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Deduplication: check if same URL was scanned in last 60 seconds
  for (const existingJob of jobs.values()) {
    if (
      existingJob.url === url &&
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
 * Get all jobs.
 */
export function getAllJobs(): ScanJob[] {
  return Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
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
