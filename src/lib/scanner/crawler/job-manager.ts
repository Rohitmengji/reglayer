/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RegLayer — Site Audit Job Manager
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Enterprise-grade background job system for site audits.
 *
 * Architecture:
 * - In-memory job store (single-process, no external deps)
 * - EventEmitter for real-time progress streaming to SSE clients
 * - TTL-based auto-cleanup of completed jobs
 * - Cancel support for long-running audits
 *
 * Job lifecycle:
 *   QUEUED → CONNECTING → DISCOVERING → SCANNING → ANALYZING → COMPLETE
 *                                                             → FAILED
 *                              ↑ CANCELLED (from any state)
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { EventEmitter } from "events";
import type { CrawlConfig, CrawlResult } from "./siteCrawler";

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════

export type JobPhase =
  | "queued"
  | "connecting"
  | "discovering"
  | "scanning"
  | "analyzing"
  | "complete"
  | "failed"
  | "cancelled";

export interface JobProgress {
  phase: JobPhase;
  pagesDiscovered: number;
  pagesScanned: number;
  pagesTotal: number;
  pagesFailed: number;
  currentUrl?: string;
  avgScore: number;
  totalViolations: number;
  patternsFound: number;
  eta?: number; // ms remaining
  scanRate?: number; // pages per second
  phaseTiming: {
    auth?: number;
    discovery?: number;
    scanning?: number;
    analysis?: number;
  };
}

export interface AuditJob {
  id: string;
  config: CrawlConfig;
  status: JobPhase;
  progress: JobProgress;
  result?: CrawlResult;
  error?: string;
  startedAt: number;
  completedAt?: number;
  cancelRequested: boolean;
}

export type JobEvent =
  | { type: "phase"; phase: JobPhase; timestamp: number }
  | { type: "progress"; progress: JobProgress; timestamp: number }
  | { type: "page-start"; url: string; index: number; total: number; timestamp: number }
  | { type: "page-complete"; url: string; score: number; violations: number; duration: number; index: number; total: number; timestamp: number }
  | { type: "page-error"; url: string; error: string; index: number; total: number; timestamp: number }
  | { type: "discovery"; url: string; source: "sitemap" | "bfs"; total: number; timestamp: number }
  | { type: "auth-status"; authenticated: boolean; method: string; timestamp: number }
  | { type: "complete"; result: CrawlResult; timestamp: number }
  | { type: "error"; error: string; timestamp: number }
  | { type: "cancelled"; timestamp: number };

// ══════════════════════════════════════════════════════════════
// JOB MANAGER SINGLETON
// ══════════════════════════════════════════════════════════════

const JOB_TTL = 60 * 60 * 1000; // 1 hour
const MAX_CONCURRENT_JOBS = 3;
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

class AuditJobManager {
  private jobs = new Map<string, AuditJob>();
  private emitter = new EventEmitter();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.emitter.setMaxListeners(100);
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL);
  }

  // ── Job CRUD ──

  createJob(config: CrawlConfig): AuditJob {
    const id = `audit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    const job: AuditJob = {
      id,
      config,
      status: "queued",
      progress: {
        phase: "queued",
        pagesDiscovered: 0,
        pagesScanned: 0,
        pagesTotal: 0,
        pagesFailed: 0,
        avgScore: 0,
        totalViolations: 0,
        patternsFound: 0,
        phaseTiming: {},
      },
      startedAt: Date.now(),
      cancelRequested: false,
    };

    this.jobs.set(id, job);
    return job;
  }

  getJob(id: string): AuditJob | undefined {
    return this.jobs.get(id);
  }

  getActiveJobCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (["connecting", "discovering", "scanning", "analyzing"].includes(job.status)) {
        count++;
      }
    }
    return count;
  }

  canStartNewJob(): boolean {
    return this.getActiveJobCount() < MAX_CONCURRENT_JOBS;
  }

  cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (["complete", "failed", "cancelled"].includes(job.status)) return false;
    job.cancelRequested = true;
    return true;
  }

  // ── Progress Updates (called from engine) ──

  emitEvent(jobId: string, event: JobEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Update job state from event
    switch (event.type) {
      case "phase":
        job.status = event.phase;
        job.progress.phase = event.phase;
        break;
      case "progress":
        job.progress = event.progress;
        break;
      case "complete":
        job.status = "complete";
        job.progress.phase = "complete";
        job.result = event.result;
        job.completedAt = Date.now();
        break;
      case "error":
        job.status = "failed";
        job.progress.phase = "failed";
        job.error = event.error;
        job.completedAt = Date.now();
        break;
      case "cancelled":
        job.status = "cancelled";
        job.progress.phase = "cancelled";
        job.completedAt = Date.now();
        break;
    }

    this.emitter.emit(`job:${jobId}`, event);
  }

  // ── Event Subscription (used by SSE endpoint) ──

  subscribe(jobId: string, listener: (event: JobEvent) => void): () => void {
    const channel = `job:${jobId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  // ── Cleanup ──

  private cleanup(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > JOB_TTL) {
        this.jobs.delete(id);
        this.emitter.removeAllListeners(`job:${id}`);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.emitter.removeAllListeners();
    this.jobs.clear();
  }
}

// Singleton — survives hot reloads in dev
const globalForJobs = globalThis as unknown as { auditJobManager?: AuditJobManager };
export const jobManager = globalForJobs.auditJobManager ??= new AuditJobManager();
