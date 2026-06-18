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

/**
 * A compact, serializable snapshot of the live crawl visualization state
 * (the faux-browser viewport, site-map, and filmstrip). It is accumulated from
 * events and persisted to the durable CrawlJobRecord so the client can render
 * the live view by POLLING — essential on serverless, where the SSE stream and
 * the crawl run on different instances and events never reach the browser.
 */
export interface LivePageSnapshot {
  url: string;
  scanId?: string;
  score?: number;
  violations?: number;
  status: "discovered" | "scanning" | "complete" | "error";
  depth?: number;
}
export interface LiveSnapshot {
  rootUrl: string | null;
  currentUrl: string | null;
  pages: LivePageSnapshot[];
  edges: Array<{ from: string; to: string }>;
  /**
   * A data-URL screenshot of the page the browser is on RIGHT NOW — updated as
   * the crawler visits each page during discovery AND after each scan. This is
   * what makes the faux-browser viewport show the actual page being processed,
   * page by page, instead of a skeleton during the (often long) discovery phase.
   * A single overwritten field (never accumulated), so the durable snapshot
   * stays small even on 500-page crawls.
   */
  currentShot?: string;
  /**
   * Aspect ratio (height/width) of currentShot when it's a tall, full-content
   * capture. Drives the client's "scroll to footer" pan — the viewport scrolls
   * the tall image from top to bottom. Absent for short/viewport shots (the
   * client then shows them statically).
   */
  currentShotAspect?: number;
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
  live: LiveSnapshot;
}

export type JobEvent =
  | { type: "phase"; phase: JobPhase; timestamp: number }
  | { type: "progress"; progress: JobProgress; timestamp: number }
  | { type: "page-start"; url: string; index: number; total: number; timestamp: number }
  | { type: "page-complete"; url: string; scanId: string; score: number; violations: number; duration: number; index: number; total: number; timestamp: number }
  | { type: "page-error"; url: string; error: string; index: number; total: number; timestamp: number }
  | { type: "discovery"; url: string; source: "sitemap" | "bfs"; total: number; from?: string; depth?: number; timestamp: number }
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
      live: { rootUrl: null, currentUrl: null, pages: [], edges: [] },
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

  /**
   * Set the "live page" screenshot shown in the faux-browser viewport. Called
   * by the crawler as it visits each page during discovery and after each scan,
   * so the viewport tracks the page the browser is actually on — page by page —
   * rather than a skeleton. `shot` may be raw base64 or a data URL; it is
   * normalized to a data URL. Pass `url` to also advance the address bar
   * (done during discovery; during scanning the page-start events drive it).
   */
  setLiveShot(jobId: string, shot: string, url?: string, aspect?: number): void {
    const job = this.jobs.get(jobId);
    if (!job || !shot) return;
    // Bound the frame so a pathologically large page can't bloat the durable
    // snapshot (re-persisted every ~2.5s → DB/egress cost). A tall bounded clip
    // (≤3 screens, q30) lands well under this; an oversized one keeps the
    // previous frame rather than dropping the live view.
    if (shot.length > 420_000) {
      if (url) job.live.currentUrl = url;
      return;
    }
    job.live.currentShot = shot.startsWith("data:")
      ? shot
      : `data:image/${shot.startsWith("iVBOR") ? "png" : "jpeg"};base64,${shot}`;
    // Only treat genuinely-tall captures as scrollable (height/width clearly
    // exceeds the 16:10 frame ⇒ aspect > ~0.78); else clear it so short/viewport
    // shots render statically.
    job.live.currentShotAspect = aspect && aspect > 0.78 ? aspect : undefined;
    if (url) job.live.currentUrl = url;
  }

  // ── Progress Updates (called from engine) ──

  emitEvent(jobId: string, event: JobEvent): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Accumulate the live-visualization snapshot (so it can be persisted to the
    // durable record and rendered by polling, independent of the SSE stream).
    this.accumulateLive(job, event);

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

  /** Fold an event into the job's live snapshot (capped to keep the record small). */
  private accumulateLive(job: AuditJob, event: JobEvent): void {
    const live = job.live;
    const MAX = 200;
    const upsert = (url: string, patch: Partial<LivePageSnapshot>) => {
      const existing = live.pages.find((p) => p.url === url);
      if (existing) Object.assign(existing, patch);
      else if (live.pages.length < MAX) live.pages.push({ url, status: "discovered", ...patch });
    };
    switch (event.type) {
      case "discovery": {
        if (live.rootUrl === null) live.rootUrl = event.depth === 0 ? event.url : (event.from ?? event.url);
        if (event.from && event.from !== event.url && live.edges.length < MAX) {
          if (!live.edges.some((e) => e.from === event.from && e.to === event.url)) {
            live.edges.push({ from: event.from, to: event.url });
          }
        }
        // Discovered, not yet scanning — only page-start promotes to "scanning".
        if (!live.pages.find((p) => p.url === event.url) && live.pages.length < MAX) {
          live.pages.push({ url: event.url, status: "discovered", depth: event.depth });
        }
        break;
      }
      case "page-start":
        live.currentUrl = event.url;
        upsert(event.url, { status: "scanning" });
        break;
      case "page-complete":
        upsert(event.url, { status: "complete", scanId: event.scanId, score: event.score, violations: event.violations });
        break;
      case "page-error":
        upsert(event.url, { status: "error" });
        break;
    }
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
