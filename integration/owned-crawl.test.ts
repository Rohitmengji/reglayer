import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { Socket } from "node:net";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createCrawlSchema } from "./fixtures/crawl-schema";

const fixture = vi.hoisted(() => {
  const connectionString = process.env.REGLAYER_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Run npm run test:postgres.");
  const target = new URL(connectionString);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/reglayer_test" || target.search) throw new Error("Disposable database required.");
  return { connectionString };
});
vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({
    connectionString: fixture.connectionString, max: 8, statement_timeout: 5000,
  }) }) };
});
vi.mock("@/lib/intelligence/alertEngine", () => ({ evaluateAlerts: vi.fn() }));
vi.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhookEvent: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendScanCompleteEmail: vi.fn() }));
vi.mock("@/lib/integrations/dispatcher", () => ({ dispatchToIntegrations: vi.fn() }));
vi.mock("@/lib/database/workspace", () => ({ getOrCreateWorkspace: vi.fn() }));
vi.mock("@/lib/ai/vector/search", () => ({ embedScanViolations: vi.fn() }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: {
  info: vi.fn(), warn: vi.fn(), error: vi.fn(), withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
} }));

import { prisma } from "@/lib/database/prisma";
import { runOwnedCrawlAttempt } from "@/services/crawlExecutor";
import { executeOwnedCrawl } from "@/services/ownedCrawlService";
import { getOrScanCrawlPage } from "@/services/crawlPageService";
import { claimCrawlAttempt } from "@/services/crawlAttemptService";
import { runAccessibilityScan } from "@/lib/scanner/accessibility/axeScanner";
import { executeScanPipeline } from "@/lib/scanner/pipelines/scanPipeline";
import { captureScreenshot } from "@/lib/scanner/browser/screenshot";
import { crawlSite } from "@/lib/scanner/crawler/siteCrawler";
import { jobManager } from "@/lib/scanner/crawler/job-manager";

const scope = { workspaceId: "owned-workspace", jobId: "owned-crawl" };
const sockets = new Set<Socket>();
let requests: string[] = [];
const server = createServer((request, response) => {
  requests.push(request.url ?? "");
  if (request.url === "/hang") return;
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end('<!doctype html><html lang="en"><head><title>Local audit</title></head><body><main><h1>Local fixture</h1><p>Browser cancellation test.</p></main></body></html>');
});
server.on("connection", socket => {
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
});
let origin: string;
let abort: AbortController;
const pending: Promise<unknown>[] = [];
const observer = new Client({ connectionString: fixture.connectionString });

function track<Result>(promise: Promise<Result>) {
  const settled = promise.then(value => value, error => error);
  pending.push(settled);
  return settled;
}

async function waitForNavigation() {
  await expect.poll(() => requests.includes("/hang"), { timeout: 5000 }).toBe(true);
}

beforeAll(async () => {
  await observer.connect();
  await createCrawlSchema(observer, ["CrawlJobRecord", "Scan", "Violation"]);
  await observer.query(await readFile(new URL("../prisma/migrations/add_crawl_page_checkpoints.sql", import.meta.url), "utf8"));
  await observer.query(await readFile(new URL("../prisma/migrations/add_crawl_attempt_leases.sql", import.meta.url), "utf8"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Loopback server did not start.");
  origin = `http://127.0.0.1:${address.port}`;
});
beforeEach(async () => {
  requests = [];
  abort = new AbortController();
  jobManager.destroy();
  await prisma.crawlPageCheckpoint.deleteMany();
  await prisma.violation.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.crawlJobRecord.deleteMany();
  await prisma.crawlJobRecord.create({ data: {
    id: scope.jobId, workspaceId: scope.workspaceId, rootUrl: origin,
  } });
});
afterEach(async () => {
  abort.abort();
  await Promise.all(pending.splice(0));
  for (const socket of sockets) socket.destroy();
  jobManager.destroy();
});
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect();
  await observer.end();
});

it("renews an active browser attempt and closes navigation on shutdown without finalizing", async () => {
  let scan: Promise<unknown> | undefined;
  const execution = track(runOwnedCrawlAttempt(scope, async ({ signal }) => {
    scan = track(runAccessibilityScan(`${origin}/hang`, { signal }));
    const result = await scan;
    if (result instanceof Error) throw result;
    return { status: "complete" };
  }, { leaseSeconds: 6, renewalIntervalMs: 1000, signal: abort.signal }));
  await waitForNavigation();
  const first = await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } });
  await expect.poll(async () => (await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } })).expiresAt.getTime(), { timeout: 4000 }).toBeGreaterThan(first.expiresAt.getTime());
  abort.abort();
  expect(await execution).toBeInstanceOf(Error);
  expect(await scan).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).status).toBe("processing");
});

it("observes durable cancellation during renewal and aborts the real browser", async () => {
  let scan: Promise<unknown> | undefined;
  const execution = track(runOwnedCrawlAttempt(scope, async ({ signal }) => {
    scan = track(runAccessibilityScan(`${origin}/hang`, { signal }));
    const result = await scan;
    if (result instanceof Error) throw result;
    return { status: "complete" };
  }, { leaseSeconds: 6, renewalIntervalMs: 1000, signal: abort.signal }));
  await waitForNavigation();
  await prisma.crawlJobRecord.update({ where: { id: scope.jobId }, data: { status: "cancelled" } });
  expect(await execution).toBeInstanceOf(Error);
  expect(await scan).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).status).toBe("cancelled");
});

it("aborts an old browser after a replacement acquires the lease", async () => {
  let scan: Promise<unknown> | undefined;
  const execution = track(runOwnedCrawlAttempt(scope, async ({ signal }) => {
    scan = track(runAccessibilityScan(`${origin}/hang`, { signal }));
    const result = await scan;
    if (result instanceof Error) throw result;
    return { status: "complete" };
  }, { leaseSeconds: 6, renewalIntervalMs: 1000, signal: abort.signal }));
  await waitForNavigation();
  await observer.query(`UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobId" = $1`, [scope.jobId]);
  const replacement = await claimCrawlAttempt(scope);
  expect(replacement?.generation).toBe(2);
  expect(await execution).toBeInstanceOf(Error);
  expect(await scan).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).status).toBe("processing");
  expect((await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } })).token).toBe(replacement?.token);
});

it("completes a real local accessibility scan through the fenced finalizer", async () => {
  const outcome = await runOwnedCrawlAttempt(scope, async ({ signal }) => {
    const result = await executeScanPipeline(origin, { signal });
    return { status: "complete", result: { pagesScanned: 1, score: result.summary.score } };
  }, { signal: abort.signal });
  expect(outcome.status).toBe("complete");
  expect(await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).toMatchObject({
    status: "complete", progress: 100, result: { pagesScanned: 1 },
  });
  await expect.poll(() => sockets.size).toBe(0);
});

it("closes a real screenshot browser on abort", async () => {
  const screenshot = track(captureScreenshot(`${origin}/hang`, { signal: abort.signal }));
  await waitForNavigation();
  abort.abort();
  expect(await screenshot).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
});

it("stops crawl discovery without launching page scans after abort", async () => {
  const crawl = track(crawlSite({
    startUrl: `${origin}/hang`, maxPages: 2, maxDepth: 1, concurrency: 1,
    useSitemap: false, signal: abort.signal,
  }));
  await waitForNavigation();
  abort.abort();
  expect(await crawl).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
  expect(requests.filter(url => url === "/hang")).toHaveLength(1);
});

it("runs the owned crawler end to end with real scanning, checkpoints and fenced completion", async () => {
  const outcome = await executeOwnedCrawl({
    ...scope, startUrl: origin, maxPages: 1, maxDepth: 1, concurrency: 1, useSitemap: false, requestDelay: 0,
  }, { signal: abort.signal, leaseSeconds: 6, renewalIntervalMs: 1000 });
  expect(outcome.status).toBe("complete");
  expect(await prisma.scan.count()).toBe(1);
  expect(await prisma.crawlPageCheckpoint.count()).toBe(1);
  const job = await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } });
  expect(job).toMatchObject({ status: "complete", pagesScanned: 1, pagesTotal: 1, result: { pagesScanned: 1, outcome: "ok" } });
  await expect.poll(() => sockets.size).toBe(0);
});

it("reuses a real committed page when an interrupted attempt is replaced", async () => {
  const first = track(runOwnedCrawlAttempt(scope, async ({ signal, attempt }) => {
    await getOrScanCrawlPage({ ...scope, url: `${origin}/`, attempt }, () => executeScanPipeline(`${origin}/`, { signal }), signal);
    abort.abort();
    return { status: "complete" };
  }, { signal: abort.signal, leaseSeconds: 6, renewalIntervalMs: 1000 }));
  expect(await first).toBeInstanceOf(Error);
  const saved = await prisma.scan.findFirstOrThrow();
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).status).toBe("processing");
  await observer.query(`UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobId" = $1`, [scope.jobId]);
  abort = new AbortController();
  requests = [];
  const outcome = await executeOwnedCrawl({
    ...scope, startUrl: origin, maxPages: 1, maxDepth: 1, concurrency: 1, useSitemap: false, requestDelay: 0,
  }, { signal: abort.signal, leaseSeconds: 6, renewalIntervalMs: 1000 });
  expect(outcome.status).toBe("complete");
  expect(await prisma.scan.count()).toBe(1);
  expect((await prisma.scan.findFirstOrThrow()).id).toBe(saved.id);
  expect((await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } })).generation).toBe(2);
  expect(requests.filter(url => url === "/")).toHaveLength(1);
  await expect.poll(() => sockets.size).toBe(0);
});

it("aborts the owned crawl entry point during discovery and leaves the job recoverable", async () => {
  await prisma.crawlJobRecord.update({ where: { id: scope.jobId }, data: { rootUrl: `${origin}/hang` } });
  const execution = track(executeOwnedCrawl({
    ...scope, startUrl: `${origin}/hang`, maxPages: 1, maxDepth: 1, concurrency: 1, useSitemap: false,
  }, { signal: abort.signal, leaseSeconds: 6, renewalIntervalMs: 1000 }));
  await waitForNavigation();
  abort.abort();
  expect(await execution).toBeInstanceOf(Error);
  await expect.poll(() => sockets.size).toBe(0);
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).status).toBe("processing");
  expect(await prisma.crawlPageCheckpoint.count()).toBe(0);
});