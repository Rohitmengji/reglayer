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

export interface ScanJob {
  id: string;
  url: string;
  options?: ScanOptions;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: {
    scan: ScanResult;
    compliance: ComplianceReport;
  };
  error?: string;
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

  const job: ScanJob = {
    id,
    url,
    options,
    status: "queued",
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
    job.startedAt = new Date().toISOString();
    job.progress = 10;

    queueLogger.info("Processing scan job", { jobId, url: job.url });

    try {
      job.progress = 30;
      const scanResult = await executeScanPipeline(job.url, job.options);

      job.progress = 80;
      const compliance = evaluateCompliance(scanResult.id, scanResult.violations);

      job.progress = 100;
      job.status = "completed";
      job.completedAt = new Date().toISOString();
      job.result = { scan: scanResult, compliance };

      queueLogger.info("Job completed", { jobId, score: scanResult.summary.score });
    } catch (error) {
      job.status = "failed";
      job.completedAt = new Date().toISOString();
      job.error = error instanceof Error ? error.message : "Unknown error";

      queueLogger.error("Job failed", { jobId, error: job.error });
    }
  }

  isProcessing = false;
}
