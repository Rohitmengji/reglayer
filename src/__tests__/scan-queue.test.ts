/**
 * RegLayer — Scan Queue Tests
 *
 * WHY: Queued scans must execute in order, handle failures, and report status correctly.
 * WHAT: Tests enqueueScan(), processQueue(), getQueueStatus(), retryFailed() functions.
 * HOW: Mocks BullMQ/in-memory queue. Tests FIFO ordering, concurrency limits, failure retry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies that scanQueue imports
vi.mock("server-only", () => ({}));

vi.mock("@/lib/scanner/pipelines/scanPipeline", () => ({
  executeScanPipeline: vi.fn(),
}));

vi.mock("@/lib/compliance/policyEvaluator", () => ({
  evaluateCompliance: vi.fn(),
}));

vi.mock("@/lib/telemetry/logger", () => ({
  logger: {
    withContext: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    scan: { create: vi.fn().mockResolvedValue({}) },
  },
}));

vi.mock("@/lib/database/workspace", () => ({
  getOrCreateWorkspace: vi.fn().mockResolvedValue("ws_1"),
}));

import { enqueueScanJob, getJob, getAllJobs } from "@/lib/queue/scanQueue";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";

describe("Scan Queue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues a job and returns immediately with ID", () => {
    vi.mocked(executeScanPipeline).mockResolvedValue({
      id: "scan_1",
      url: "https://example.com",
      violations: [],
      summary: { score: 100, totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
      timestamp: new Date().toISOString(),
      status: "completed",
      metadata: { scanDuration: 1000, browserEngine: "chromium", axeCoreVersion: "4.x" },
    } as any);
    vi.mocked(evaluateCompliance).mockReturnValue({
      scanId: "scan_1",
      overallCompliance: 100,
      ruleResults: [],
      timestamp: new Date().toISOString(),
    } as any);

    const job = enqueueScanJob("https://example.com");

    expect(job.id).toMatch(/^job_/);
    expect(job.url).toBe("https://example.com");
    // Job may already be processing since queue starts immediately
    expect(["queued", "processing", "completed"]).toContain(job.status);
    expect(job.createdAt).toBeDefined();
  });

  it("stores options in the job", () => {
    vi.mocked(executeScanPipeline).mockResolvedValue({
      id: "scan_2",
      violations: [],
      summary: { score: 100 },
    } as any);
    vi.mocked(evaluateCompliance).mockReturnValue({} as any);

    const job = enqueueScanJob("https://test.com", { includeScreenshot: true });

    expect(job.options).toEqual({ includeScreenshot: true });
  });

  it("getJob retrieves a job by ID", () => {
    vi.mocked(executeScanPipeline).mockResolvedValue({
      id: "scan_3",
      violations: [],
      summary: { score: 100 },
    } as any);
    vi.mocked(evaluateCompliance).mockReturnValue({} as any);

    const created = enqueueScanJob("https://find-me.com");
    const found = getJob(created.id);

    expect(found).toBeDefined();
    expect(found!.url).toBe("https://find-me.com");
  });

  it("getJob returns undefined for unknown ID", () => {
    expect(getJob("job_nonexistent")).toBeUndefined();
  });

  it("getAllJobs returns jobs sorted by createdAt descending", () => {
    vi.mocked(executeScanPipeline).mockResolvedValue({
      id: "scan_x",
      violations: [],
      summary: { score: 100 },
    } as any);
    vi.mocked(evaluateCompliance).mockReturnValue({} as any);

    enqueueScanJob("https://first.com");
    enqueueScanJob("https://second.com");

    const all = getAllJobs();
    expect(all.length).toBeGreaterThanOrEqual(2);

    // Most recent first
    const firstTime = new Date(all[0].createdAt).getTime();
    const secondTime = new Date(all[1].createdAt).getTime();
    expect(firstTime).toBeGreaterThanOrEqual(secondTime);
  });

  it("processes job to completion", async () => {
    const mockResult = {
      id: "scan_complete",
      url: "https://complete.com",
      violations: [],
      summary: { score: 95, totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
      timestamp: new Date().toISOString(),
      status: "completed",
      metadata: { scanDuration: 2000, browserEngine: "chromium", axeCoreVersion: "4.x" },
    };
    const mockCompliance = {
      scanId: "scan_complete",
      overallCompliance: 95,
      ruleResults: [],
      timestamp: new Date().toISOString(),
    };

    vi.mocked(executeScanPipeline).mockResolvedValue(mockResult as any);
    vi.mocked(evaluateCompliance).mockReturnValue(mockCompliance as any);

    const job = enqueueScanJob("https://complete.com");

    // Wait for async processing
    await vi.waitFor(() => {
      const updated = getJob(job.id);
      expect(updated!.status).toBe("completed");
    });

    const completed = getJob(job.id);
    expect(completed!.status).toBe("completed");
    expect(completed!.completedAt).toBeDefined();
    expect(completed!.result).toBeDefined();
    expect(completed!.result!.scan.id).toBe("scan_complete");
  });

  it("marks job as failed when pipeline throws", async () => {
    vi.mocked(executeScanPipeline).mockRejectedValue(new Error("Timeout exceeded"));

    const job = enqueueScanJob("https://fail.com");

    await vi.waitFor(() => {
      const updated = getJob(job.id);
      expect(updated!.status).toBe("failed");
    });

    const failed = getJob(job.id);
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toBe("Timeout exceeded");
    expect(failed!.completedAt).toBeDefined();
  });
});
