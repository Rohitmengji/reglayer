import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claim: vi.fn(), renew: vi.fn(), finish: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/services/crawlAttemptService", () => ({
  claimCrawlAttempt: mocks.claim, renewCrawlAttempt: mocks.renew, finishCrawlAttempt: mocks.finish,
}));

import { runOwnedCrawlAttempt } from "@/services/crawlExecutor";

const scope = { workspaceId: "workspace-1", jobId: "audit-1" };
const attempt = { token: "f39f2695-f3b3-4218-b9d8-70809a9f2ecd", generation: 1, expiresAt: new Date() };
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(attempt);
  mocks.renew.mockResolvedValue(new Date());
  mocks.finish.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

it("does not execute a job already owned elsewhere", async () => {
  mocks.claim.mockResolvedValue(null);
  const run = vi.fn();
  expect(await runOwnedCrawlAttempt(scope, run)).toEqual({ status: "busy" });
  expect(run).not.toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("renews while work is active and commits through the fenced finalizer", async () => {
  let complete!: (value: { status: "complete"; result: { pagesScanned: number } }) => void;
  const run = vi.fn(() => new Promise<{ status: "complete"; result: { pagesScanned: number } }>(resolve => { complete = resolve; }));
  const pending = runOwnedCrawlAttempt(scope, run, { leaseSeconds: 6, renewalIntervalMs: 1000 });
  await vi.advanceTimersByTimeAsync(3500);
  expect(mocks.renew).toHaveBeenCalledTimes(3);
  expect(mocks.renew).toHaveBeenCalledWith({ ...scope, attempt }, 6);
  complete({ status: "complete", result: { pagesScanned: 1 } });
  expect(await pending).toEqual({ status: "complete", result: { pagesScanned: 1 } });
  expect(mocks.finish).toHaveBeenCalledWith({ ...scope, attempt }, { status: "complete", result: { pagesScanned: 1 } });
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts work and rejects its result when renewal fails", async () => {
  mocks.renew.mockRejectedValue(new Error("Ownership lost"));
  let receivedSignal!: AbortSignal;
  let complete!: (value: { status: "complete" }) => void;
  const pending = runOwnedCrawlAttempt(scope, ({ signal }) => {
    receivedSignal = signal;
    return new Promise(resolve => { complete = resolve; });
  }, { leaseSeconds: 6, renewalIntervalMs: 1000 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await pending).toBeInstanceOf(Error);
  expect(receivedSignal.aborted).toBe(true);
  complete({ status: "complete" });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts on shutdown without marking recoverable work permanently failed", async () => {
  const controller = new AbortController();
  const pending = runOwnedCrawlAttempt(scope, () => new Promise(() => {}), { signal: controller.signal }).catch(error => error);
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  expect(await pending).toBeInstanceOf(Error);
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not claim work when shutdown has already started", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(runOwnedCrawlAttempt(scope, vi.fn(), { signal: controller.signal })).rejects.toThrow();
  expect(mocks.claim).not.toHaveBeenCalled();
});

it("reports normal task failure only through the owned finalizer", async () => {
  const error = new Error("Browser execution failed");
  await expect(runOwnedCrawlAttempt(scope, async () => { throw error; })).rejects.toBe(error);
  expect(mocks.finish).toHaveBeenCalledWith({ ...scope, attempt }, {
    status: "failed", error: "Crawl execution failed. Please retry the audit.",
  });
  expect(vi.getTimerCount()).toBe(0);
});

it("expires conservatively if a renewal hangs, without overlapping renewal requests", async () => {
  mocks.renew.mockReturnValue(new Promise(() => {}));
  let signal!: AbortSignal;
  const pending = runOwnedCrawlAttempt(scope, context => {
    signal = context.signal;
    return new Promise(() => {});
  }, { leaseSeconds: 6, renewalIntervalMs: 1000 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(6000);
  expect(await pending).toBeInstanceOf(Error);
  expect(signal.aborted).toBe(true);
  expect(mocks.renew).toHaveBeenCalledOnce();
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for an in-flight renewal before attempting finalization", async () => {
  let renew!: (value: Date) => void;
  let complete!: (value: { status: "complete" }) => void;
  mocks.renew.mockReturnValue(new Promise(resolve => { renew = resolve; }));
  const pending = runOwnedCrawlAttempt(scope, () => new Promise(resolve => { complete = resolve; }), {
    leaseSeconds: 6, renewalIntervalMs: 1000,
  });
  await vi.advanceTimersByTimeAsync(1000);
  complete({ status: "complete" });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.finish).not.toHaveBeenCalled();
  renew(new Date());
  expect(await pending).toEqual({ status: "complete" });
  expect(mocks.finish).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("ignores a renewal reply received after watchdog expiry", async () => {
  let renew!: (value: Date) => void;
  mocks.renew.mockReturnValue(new Promise(resolve => { renew = resolve; }));
  const pending = runOwnedCrawlAttempt(scope, () => new Promise(() => {}), {
    leaseSeconds: 6, renewalIntervalMs: 1000,
  }).catch(error => error);
  await vi.advanceTimersByTimeAsync(6000);
  expect(await pending).toBeInstanceOf(Error);
  renew(new Date());
  await vi.advanceTimersByTimeAsync(10_000);
  expect(mocks.renew).toHaveBeenCalledOnce();
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start work after a claim response arrives too late", async () => {
  let claimed!: (value: typeof attempt) => void;
  mocks.claim.mockReturnValue(new Promise(resolve => { claimed = resolve; }));
  const run = vi.fn();
  const pending = runOwnedCrawlAttempt(scope, run, { leaseSeconds: 6 }).catch(error => error);
  await vi.advanceTimersByTimeAsync(6000);
  expect(await pending).toBeInstanceOf(Error);
  claimed(attempt);
  await vi.advanceTimersByTimeAsync(0);
  expect(run).not.toHaveBeenCalled();
  expect(mocks.finish).not.toHaveBeenCalled();
});

it("propagates a rejected final write without trying an unfenced fallback", async () => {
  mocks.finish.mockRejectedValue(new Error("Replacement owns job"));
  await expect(runOwnedCrawlAttempt(scope, async () => ({ status: "complete" }))).rejects.toThrow("Replacement owns job");
  expect(mocks.finish).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects renewal timing that cannot fit safely inside the lease", async () => {
  await expect(runOwnedCrawlAttempt(scope, vi.fn(), { leaseSeconds: 6, renewalIntervalMs: 6000 })).rejects.toThrow("timing");
  expect(mocks.claim).not.toHaveBeenCalled();
});