import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getServerSession: vi.fn(),
  requireFeature: vi.fn(),
  requireWorkspacePermission: vi.fn(),
  assertCrawlJobAccess: vi.fn(),
  applyRateLimit: vi.fn(),
  getPlanContext: vi.fn(),
  getOrCreateWorkspace: vi.fn(),
  createRecord: vi.fn(),
  findRecord: vi.fn(),
  updateRecord: vi.fn(),
  updateRecords: vi.fn(),
  crawlSite: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(),
  after: mocks.after,
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.getServerSession }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: mocks.requireWorkspacePermission }));
vi.mock("@/lib/auth/access", () => ({ assertCrawlJobAccess: mocks.assertCrawlJobAccess }));
vi.mock("@/lib/features/require-feature", () => ({ requireFeature: mocks.requireFeature }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: mocks.applyRateLimit }));
vi.mock("@/lib/credits/plan-context", () => ({ getPlanContext: mocks.getPlanContext }));
vi.mock("@/lib/database/workspace", () => ({ getOrCreateWorkspace: mocks.getOrCreateWorkspace }));
vi.mock("@/lib/database/prisma", () => ({
  prisma: {
    crawlJobRecord: {
      create: mocks.createRecord,
      findUnique: mocks.findRecord,
      update: mocks.updateRecord,
      updateMany: mocks.updateRecords,
    },
  },
}));
vi.mock("@/lib/scanner/crawler/siteCrawler", () => ({ crawlSite: mocks.crawlSite }));
vi.mock("@/lib/validations/ssrf", () => ({
  validateScanUrl: vi.fn(() => null),
  resolvesToInternalIp: vi.fn(async () => false),
}));
vi.mock("@/lib/crypto", () => ({ decryptJson: vi.fn() }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { warn: mocks.warn, error: mocks.error } }));

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/crawl/route";
import { DELETE, GET } from "@/app/api/crawl/[jobId]/route";
import { jobManager } from "@/lib/scanner/crawler/job-manager";

function makeRequest() {
  return new NextRequest("http://localhost:3000/api/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com", maxPages: 10 }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  jobManager.destroy();
  mocks.getServerSession.mockResolvedValue({ user: { email: "test@example.com" } });
  mocks.requireFeature.mockResolvedValue({ allowed: true });
  mocks.requireWorkspacePermission.mockResolvedValue({ ok: true });
  mocks.assertCrawlJobAccess.mockResolvedValue({ ok: true, workspaceId: "workspace-1" });
  mocks.applyRateLimit.mockResolvedValue(null);
  mocks.getPlanContext.mockResolvedValue({ userId: "user-1", isMasterAdmin: false, limits: { pagesPerScan: 10 } });
  mocks.getOrCreateWorkspace.mockResolvedValue("workspace-1");
  mocks.createRecord.mockResolvedValue({});
  mocks.updateRecords.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  jobManager.destroy();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/crawl admission", () => {
  it("fails closed when checkpointing is enabled without a resolved workspace", async () => {
    vi.stubEnv("CRAWL_PAGE_CHECKPOINTS_ENABLED", "true");
    mocks.getOrCreateWorkspace.mockResolvedValue(null);
    expect((await POST(makeRequest())).status).toBe(503);
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("passes the server-side checkpoint flag to the crawl without changing default behavior", async () => {
    vi.stubEnv("CRAWL_PAGE_CHECKPOINTS_ENABLED", "true");
    const { jobId } = await (await POST(makeRequest())).json();
    expect(jobManager.getJob(jobId)?.config.checkpointPages).toBe(true);
    vi.stubEnv("CRAWL_PAGE_CHECKPOINTS_ENABLED", "false");
    const second = await (await POST(makeRequest())).json();
    expect(jobManager.getJob(second.jobId)?.config.checkpointPages).toBe(false);
  });

  it("rejects a failed durable write without scheduling a crawl or exposing database details", async () => {
    mocks.createRecord.mockRejectedValue(new Error("database connection details"));

    const response = await POST(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Unable to save the audit. Please try again shortly." });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.crawlSite).not.toHaveBeenCalled();
    const jobId = mocks.createRecord.mock.calls[0][0].data.id;
    expect(jobManager.getJob(jobId)?.status).toBe("failed");
    expect(jobManager.getJob(jobId)?.completedAt).toEqual(expect.any(Number));
  });

  it("waits for durable persistence before registering background work", async () => {
    let resolvePersistence!: (value: object) => void;
    mocks.createRecord.mockReturnValueOnce(new Promise((resolve) => { resolvePersistence = resolve; }));

    const responsePromise = POST(makeRequest());
    await vi.waitFor(() => expect(mocks.createRecord).toHaveBeenCalledOnce());
    expect(mocks.after).not.toHaveBeenCalled();

    resolvePersistence({});
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ jobId: expect.any(String), status: "queued" });
    expect(mocks.createRecord).toHaveBeenCalledWith({ data: {
      id: body.jobId,
      workspaceId: "workspace-1",
      userId: "user-1",
      rootUrl: "https://example.com",
      status: "processing",
      pagesTotal: 10,
    } });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.crawlSite).not.toHaveBeenCalled();
  });

  it("does not create a job for an unauthenticated request", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    expect((await POST(makeRequest())).status).toBe(401);
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("does not create a job when workspace permission is denied", async () => {
    mocks.requireWorkspacePermission.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await POST(makeRequest())).status).toBe(403);
    expect(mocks.createRecord).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
});

describe("crawl progress finalization", () => {
  it.each([
    ["failed", "complete"],
    ["failed", "error"],
    ["cancelled", "complete"],
    ["cancelled", "error"],
  ])("preserves a durable %s state when late execution finishes with %s", async (terminalStatus, outcome) => {
    const record = { status: terminalStatus, error: "Durable terminal state" };
    mocks.findRecord.mockResolvedValue(record);
    mocks.updateRecord.mockImplementation(async ({ data }) => Object.assign(record, data));
    mocks.updateRecords.mockImplementation(async ({ where, data }) => {
      if (record.status !== where.status) return { count: 0 };
      Object.assign(record, data);
      return { count: 1 };
    });
    if (outcome === "complete") mocks.crawlSite.mockResolvedValue({ pagesScanned: 1, pagesDiscovered: 1 });
    else mocks.crawlSite.mockRejectedValue(new Error("Late worker error"));

    const { jobId } = await (await POST(makeRequest())).json();
    jobManager.emitEvent(jobId, { type: "phase", phase: "scanning", timestamp: Date.now() });
    await mocks.after.mock.calls[0][0]();

    expect(record.status).toBe(terminalStatus);
    expect(record.error).toBe("Durable terminal state");
    expect(jobManager.getJob(jobId)?.status).toBe(terminalStatus);
  });

  it.each(["complete", "failed"])("does not overwrite a %s record with an in-flight progress update", async (terminalStatus) => {
    vi.useFakeTimers();
    let record: { status: string; result?: unknown; error?: string } = { status: "processing" };
    mocks.updateRecord.mockImplementation(async ({ data }) => {
      record = { ...record, ...data };
      return record;
    });
    mocks.updateRecords.mockImplementation(async ({ where, data }) => {
      if (where.status !== record.status) return { count: 0 };
      record = { ...record, ...data };
      return { count: 1 };
    });

    let resolveProgressRead!: (value: { status: string }) => void;
    mocks.findRecord.mockReturnValueOnce(new Promise((resolve) => { resolveProgressRead = resolve; }));
    let finishCrawl!: (value: object) => void;
    let failCrawl!: (error: Error) => void;
    mocks.crawlSite.mockReturnValueOnce(new Promise((resolve, reject) => {
      finishCrawl = resolve;
      failCrawl = reject;
    }));

    const response = await POST(makeRequest());
    const { jobId } = await response.json();
    jobManager.emitEvent(jobId, { type: "phase", phase: "scanning", timestamp: Date.now() });
    const background = mocks.after.mock.calls[0][0]();
    await vi.advanceTimersByTimeAsync(2500);
    expect(mocks.findRecord).toHaveBeenCalledOnce();

    const result = { pagesScanned: 1, pagesDiscovered: 1 };
    if (terminalStatus === "complete") finishCrawl(result);
    else failCrawl(new Error("Crawl failed"));
    await background;
    expect(record.status).toBe(terminalStatus);

    resolveProgressRead({ status: "processing" });
    await vi.advanceTimersByTimeAsync(0);

    expect(record.status).toBe(terminalStatus);
    if (terminalStatus === "complete") expect(record.result).toEqual(result);
    else expect(record.error).toBe("Crawl failed");
  });
});

describe("GET /api/crawl/[jobId] stale recovery", () => {
  const jobId = "audit-recovery";
  const request = () => new NextRequest(`http://localhost:3000/api/crawl/${jobId}`);
  const params = () => ({ params: Promise.resolve({ jobId }) });
  const staleRecord = () => ({
    id: jobId,
    status: "processing",
    pagesScanned: 2,
    pagesTotal: 10,
    error: null,
    result: { __live: { pages: [] }, phase: "scanning" },
    createdAt: new Date(Date.now() - 120_000),
    updatedAt: new Date(Date.now() - 70_000),
  });

  it("persists a failed state without returning a partial snapshot as a completed result", async () => {
    vi.useFakeTimers();
    const record = staleRecord();
    const message = "The audit stopped unexpectedly (it may have exceeded the time limit). Please try again with fewer pages.";
    mocks.findRecord.mockResolvedValueOnce(record).mockResolvedValueOnce({
      ...record, status: "failed", error: message, updatedAt: new Date(),
    });

    const response = await GET(request(), params());
    const body = await response.json();

    expect(mocks.updateRecords).toHaveBeenCalledWith({
      where: { id: jobId, status: "processing", updatedAt: { lt: new Date(Date.now() - 65_000) } },
      data: { status: "failed", error: message },
    });
    expect(body).toMatchObject({ status: "failed", error: message, live: { pages: [] } });
    expect(body.result).toBeUndefined();
    expect(mocks.findRecord).toHaveBeenCalledTimes(2);
  });

  it.each(["complete", "processing", "cancelled"])("re-reads a concurrently changed %s record instead of reporting a stale failure", async (status) => {
    const record = staleRecord();
    const currentResult = status === "complete" ? { pagesScanned: 10, pagesDiscovered: 10 } : record.result;
    mocks.findRecord.mockResolvedValueOnce(record).mockResolvedValueOnce({
      ...record, status, result: currentResult, updatedAt: new Date(),
    });
    mocks.updateRecords.mockResolvedValueOnce({ count: 0 });

    const body = await (await GET(request(), params())).json();

    expect(body.status).toBe(status);
    expect(body.error).toBeUndefined();
    if (status === "complete") expect(body.result).toEqual(currentResult);
    else expect(body.result).toBeUndefined();
  });

  it("does not modify a record with a recent heartbeat", async () => {
    mocks.findRecord.mockResolvedValueOnce({ ...staleRecord(), updatedAt: new Date() });

    expect((await (await GET(request(), params())).json()).status).toBe("processing");
    expect(mocks.updateRecords).not.toHaveBeenCalled();
  });

  it("does not recover a job the caller cannot access", async () => {
    mocks.assertCrawlJobAccess.mockResolvedValue({ ok: false, error: "Forbidden", status: 403 });

    expect((await GET(request(), params())).status).toBe(403);
    expect(mocks.findRecord).not.toHaveBeenCalled();
    expect(mocks.updateRecords).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/crawl/[jobId] durable cancellation", () => {
  const jobId = "audit-cancel";
  const request = () => new NextRequest(`http://localhost:3000/api/crawl/${jobId}`, { method: "DELETE" });
  const params = () => ({ params: Promise.resolve({ jobId }) });

  it("does not overwrite a completion that wins the cancellation race", async () => {
    const record = { status: "complete" };
    mocks.findRecord.mockResolvedValue({ status: "processing" });
    mocks.updateRecord.mockImplementation(async ({ data }) => Object.assign(record, data));
    mocks.updateRecords.mockImplementation(async ({ where, data }) => {
      if (record.status !== where.status) return { count: 0 };
      Object.assign(record, data);
      return { count: 1 };
    });

    await DELETE(request(), params());

    expect(record.status).toBe("complete");
    expect(mocks.updateRecords).toHaveBeenCalledWith({
      where: { id: jobId, status: "processing" },
      data: { status: "cancelled" },
    });
  });

  it("reports a persistence failure instead of acknowledging an unsaved cancellation", async () => {
    mocks.findRecord.mockResolvedValue({ status: "processing" });
    mocks.updateRecord.mockRejectedValue(new Error("Database unavailable"));
    mocks.updateRecords.mockRejectedValue(new Error("Database unavailable"));

    const response = await DELETE(request(), params());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to cancel the audit. Please try again shortly." });
  });

  it("persists a cancellation before acknowledging the request", async () => {
    mocks.findRecord.mockResolvedValue({ status: "processing" });

    const response = await DELETE(request(), params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "cancelling", jobId });
    expect(mocks.updateRecords).toHaveBeenCalledWith({
      where: { id: jobId, status: "processing" },
      data: { status: "cancelled" },
    });
  });

  it("does not modify the job when cancellation permission is denied", async () => {
    mocks.requireWorkspacePermission.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    expect((await DELETE(request(), params())).status).toBe(403);
    expect(mocks.findRecord).not.toHaveBeenCalled();
    expect(mocks.updateRecords).not.toHaveBeenCalled();
  });
});