import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), guard: vi.fn(), crawl: vi.fn(), readJob: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/services/crawlExecutor", () => ({ runOwnedCrawlAttempt: mocks.execute }));
vi.mock("@/services/crawlAttemptService", () => ({ withCrawlAttempt: mocks.guard }));
vi.mock("@/lib/scanner/crawler/siteCrawler", () => ({ crawlSite: mocks.crawl }));
import { executeOwnedCrawl } from "@/services/ownedCrawlService";

const config = { jobId: "audit-1", workspaceId: "workspace-1", startUrl: "https://example.com", maxPages: 10, maxDepth: 2, concurrency: 2 };
const attempt = { token: "test-owner", generation: 2 };
let controller: AbortController;
beforeEach(() => {
  vi.resetAllMocks();
  controller = new AbortController();
  mocks.execute.mockImplementation(async (_scope, operation) => operation({ attempt, signal: controller.signal }));
  mocks.guard.mockImplementation(async (_scope, operation) => operation({ crawlJobRecord: { findUniqueOrThrow: mocks.readJob } }));
  mocks.readJob.mockResolvedValue({ rootUrl: config.startUrl });
});

it("forces checkpointing and propagates attempt ownership and abort signal", async () => {
  mocks.crawl.mockResolvedValue({ outcome: "ok", pagesScanned: 1, pagesDiscovered: 1 });
  expect(await executeOwnedCrawl(config)).toEqual({
    status: "complete", result: { outcome: "ok", pagesScanned: 1, pagesDiscovered: 1 }, pages: { scanned: 1, total: 1 },
  });
  expect(mocks.crawl).toHaveBeenCalledWith({ ...config, attempt, signal: controller.signal, checkpointPages: true });
  expect(mocks.guard).toHaveBeenCalledWith({ jobId: config.jobId, workspaceId: config.workspaceId, attempt }, expect.any(Function));
});

it.each(["partial", "all-failed", "launch-failed"])("does not label %s coverage a complete audit", async outcome => {
  mocks.crawl.mockResolvedValue({ outcome, pagesScanned: 1 });
  expect(await executeOwnedCrawl(config)).toMatchObject({ status: "failed", result: { outcome } });
});

it("rejects a changed root URL before starting a browser", async () => {
  mocks.readJob.mockResolvedValue({ rootUrl: "https://another.example.com" });
  await expect(executeOwnedCrawl(config)).rejects.toThrow("does not match");
  expect(mocks.crawl).not.toHaveBeenCalled();
});

it("ignores a late crawler result after abort", async () => {
  mocks.crawl.mockImplementation(async () => {
    controller.abort();
    return { outcome: "ok" };
  });
  await expect(executeOwnedCrawl(config)).rejects.toThrow();
});