import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { ScanResult } from "../src/lib/types";
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
    connectionString: fixture.connectionString, max: 8, statement_timeout: 10_000,
    application_name: "reglayer_page_integration",
  }) }) };
});
vi.mock("@/lib/scanner/pipelines/scanPipeline", () => ({ executeScanPipeline: vi.fn() }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { withContext: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) } }));
vi.mock("@/lib/intelligence/alertEngine", () => ({ evaluateAlerts: vi.fn() }));
vi.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhookEvent: vi.fn() }));
vi.mock("@/lib/email/service", () => ({ sendScanCompleteEmail: vi.fn() }));
vi.mock("@/lib/integrations/dispatcher", () => ({ dispatchToIntegrations: vi.fn() }));
vi.mock("@/lib/database/workspace", () => ({ getOrCreateWorkspace: vi.fn() }));
vi.mock("@/lib/ai/vector/search", () => ({ embedScanViolations: vi.fn() }));

import { prisma } from "@/lib/database/prisma";
import { getOrScanCrawlPage, loadCrawlPage, saveCrawlPage } from "@/services/crawlPageService";
import { crawlPageKey } from "@/lib/scanner/crawler/page-checkpoint";
import { claimCrawlAttempt, renewCrawlAttempt, finishCrawlAttempt, withCrawlAttempt } from "@/services/crawlAttemptService";

const observer = new Client({ connectionString: fixture.connectionString });
const scope = { workspaceId: "workspace-pages", jobId: "audit-pages", url: "https://example.com/page?q=1" };
function candidate(id = "ephemeral-scan", score = 75): ScanResult {
  return {
    id, url: scope.url, timestamp: "2026-09-21T00:00:00.000Z", status: "completed", screenshot: "original-image",
    summary: { score, totalViolations: 1, critical: 0, serious: 1, moderate: 0, minor: 0 },
    metadata: { scanDuration: 10, pageTitle: "Original page", browserEngine: "chromium", axeCoreVersion: "4" },
    violations: [{
      id: "color-contrast", impact: "serious", description: "Contrast", help: "Improve contrast", helpUrl: "https://example.com/help",
      wcagTags: ["wcag143", "wcag2aa"], nodes: [{ html: "<p>Text</p>", target: ["p"], failureSummary: "Low contrast" }],
    }],
  };
}

beforeAll(async () => {
  await observer.connect();
  await createCrawlSchema(observer, ["CrawlJobRecord", "Scan", "Violation"]);
  await observer.query('ALTER TABLE violations ADD CONSTRAINT integration_scan_fkey FOREIGN KEY ("scanId") REFERENCES scans(id) ON DELETE CASCADE');
  const migration = await readFile(new URL("../prisma/migrations/add_crawl_page_checkpoints.sql", import.meta.url), "utf8");
  await observer.query(migration);
  await observer.query(migration);
  const leaseMigration = await readFile(new URL("../prisma/migrations/add_crawl_attempt_leases.sql", import.meta.url), "utf8");
  await observer.query(leaseMigration);
  await observer.query(leaseMigration);
});
beforeEach(async () => {
  await prisma.crawlPageCheckpoint.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.crawlJobRecord.deleteMany();
  await prisma.crawlJobRecord.create({ data: {
    id: scope.jobId, workspaceId: scope.workspaceId, userId: "owner-pages", rootUrl: "https://example.com",
  } });
});
afterAll(async () => {
  await prisma.$disconnect();
  await observer.end();
});

it("commits the checkpoint, scan, and violations together without duplicating the screenshot", async () => {
  const result = await saveCrawlPage(scope, candidate());
  expect(result.id).toBe(crawlPageKey(scope));
  expect(await prisma.scan.count()).toBe(1);
  expect(await prisma.violation.count()).toBe(1);
  const row = await prisma.scan.findUniqueOrThrow({ where: { id: result.id }, include: { violations: true } });
  expect(row).toMatchObject({ workspaceId: scope.workspaceId, userId: "owner-pages", screenshot: "original-image" });
  expect(row.violations[0]).toMatchObject({ wcagCriteria: "1.4.3", wcagLevel: "AA" });
  expect((await prisma.crawlPageCheckpoint.findUniqueOrThrow({ where: { id: result.id } })).snapshot).not.toHaveProperty("scan.screenshot");
});

it("replays the original result after reconnecting instead of overwriting it with a later scan", async () => {
  const original = await saveCrawlPage(scope, candidate());
  await prisma.$disconnect();
  expect(await loadCrawlPage(scope)).toEqual(original);
  expect(await saveCrawlPage(scope, candidate("retry-id", 10))).toEqual(original);
  expect(await prisma.scan.count()).toBe(1);
  expect(await prisma.violation.count()).toBe(1);
});

it("skips scanning a saved page on a later attempt", async () => {
  const scan = vi.fn(async () => candidate());
  const first = await getOrScanCrawlPage(scope, scan);
  await prisma.$disconnect();
  const second = await getOrScanCrawlPage(scope, scan);
  expect(second).toEqual(first);
  expect(scan).toHaveBeenCalledOnce();
});

it("does not save a checkpoint or scan when browser execution fails", async () => {
  await expect(getOrScanCrawlPage(scope, async () => { throw new Error("Browser failed"); })).rejects.toThrow("Browser failed");
  expect(await prisma.crawlPageCheckpoint.count()).toBe(0);
  expect(await prisma.scan.count()).toBe(0);
});

it.each(["cancelled", "failed", "complete"])("does not start browser work for a %s crawl", async status => {
  await prisma.crawlJobRecord.update({ where: { id: scope.jobId }, data: { status } });
  const scan = vi.fn(async () => candidate());
  await expect(getOrScanCrawlPage(scope, scan)).rejects.toThrow("not active");
  expect(scan).not.toHaveBeenCalled();
});

it("does not start browser work for a job belonging to another workspace", async () => {
  const scan = vi.fn(async () => candidate());
  await expect(getOrScanCrawlPage({ ...scope, workspaceId: "another-workspace" }, scan)).rejects.toThrow("not active");
  expect(scan).not.toHaveBeenCalled();
});

it("collapses concurrent attempts to one authoritative scan and violation set", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => saveCrawlPage(scope, candidate(`attempt-${index}`, index * 10))));
  for (const result of results) expect(result).toEqual(results[0]);
  expect(await prisma.scan.count()).toBe(1);
  expect(await prisma.violation.count()).toBe(1);
  expect(await prisma.crawlPageCheckpoint.count()).toBe(1);
});

it.each(["crawl_page_checkpoints", "violations"])("rolls back all page data if %s rejects a write", async table => {
  await observer.query(`ALTER TABLE ${table} ADD CONSTRAINT reject_test_page CHECK (false)`);
  try {
    await expect(saveCrawlPage(scope, candidate())).rejects.toThrow();
    expect(await prisma.scan.count()).toBe(0);
    expect(await prisma.violation.count()).toBe(0);
    expect(await prisma.crawlPageCheckpoint.count()).toBe(0);
  } finally {
    await observer.query(`ALTER TABLE ${table} DROP CONSTRAINT reject_test_page`);
  }
});

it("denies persistence into another workspace's job", async () => {
  const other = { ...scope, workspaceId: "another-workspace" };
  await expect(saveCrawlPage(other, candidate())).rejects.toThrow("not active");
  await saveCrawlPage(scope, candidate());
  expect(await loadCrawlPage(other)).toBeNull();
});

it("does not deduplicate different crawl jobs or query variants", async () => {
  await prisma.crawlJobRecord.create({ data: { id: "another-job", workspaceId: scope.workspaceId, rootUrl: scope.url } });
  const first = await saveCrawlPage(scope, candidate());
  const second = await saveCrawlPage({ ...scope, jobId: "another-job" }, candidate());
  const third = await saveCrawlPage({ ...scope, url: "https://example.com/page?q=2" }, candidate());
  expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  expect(await prisma.scan.count()).toBe(3);
});

it("does not commit a page after a competing cancellation transaction wins", async () => {
  await observer.query("BEGIN");
  let pending: Promise<unknown> | undefined;
  try {
    await observer.query("SELECT id FROM crawl_jobs WHERE id = $1 FOR UPDATE", [scope.jobId]);
    pending = saveCrawlPage(scope, candidate()).then(() => "unexpected success", error => error);
    await expect.poll(async () => (await observer.query(`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name = 'reglayer_page_integration' AND wait_event_type = 'Lock'
    `)).rows[0].count).toBeGreaterThan(0);
    await observer.query("UPDATE crawl_jobs SET status = 'cancelled' WHERE id = $1", [scope.jobId]);
    await observer.query("COMMIT");
    expect(await pending).toBeInstanceOf(Error);
    expect(await prisma.scan.count()).toBe(0);
  } finally {
    await observer.query("ROLLBACK");
    await pending;
  }
});

it("fails closed on an unsupported saved snapshot instead of silently rescanning", async () => {
  const saved = await saveCrawlPage(scope, candidate());
  await prisma.crawlPageCheckpoint.update({ where: { id: saved.id }, data: { snapshot: { version: 99 } } });
  const scan = vi.fn(async () => candidate());
  await expect(getOrScanCrawlPage(scope, scan)).rejects.toThrow();
  expect(scan).not.toHaveBeenCalled();
  expect(await prisma.scan.count()).toBe(1);
});

it("removes a checkpoint when its scan is deleted, without leaving a dangling replay", async () => {
  const saved = await saveCrawlPage(scope, candidate());
  await prisma.scan.delete({ where: { id: saved.id } });
  expect(await prisma.crawlPageCheckpoint.count()).toBe(0);
  expect(await prisma.violation.count()).toBe(0);
  expect(await loadCrawlPage(scope)).toBeNull();
});

it("removes checkpoints when a crawl is deleted but retains the independently owned scan", async () => {
  const saved = await saveCrawlPage(scope, candidate());
  await prisma.crawlJobRecord.delete({ where: { id: scope.jobId } });
  expect(await prisma.crawlPageCheckpoint.count()).toBe(0);
  expect(await prisma.scan.findUnique({ where: { id: saved.id } })).not.toBeNull();
});

it("grants only one of eight concurrent attempt claims", async () => {
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimCrawlAttempt(scope)));
  const owners = claims.filter(claim => claim !== null);
  expect(owners).toHaveLength(1);
  expect(owners[0]?.generation).toBe(1);
});

it("fences an expired owner after replacement without changing the saved page identity", async () => {
  const first = await claimCrawlAttempt(scope);
  expect(first).not.toBeNull();
  const saved = await saveCrawlPage({ ...scope, attempt: first! }, candidate());
  await observer.query(`UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobId" = $1`, [scope.jobId]);
  const replacement = await claimCrawlAttempt(scope);
  expect(replacement?.generation).toBe(2);
  expect(replacement?.token).not.toBe(first?.token);

  await expect(saveCrawlPage({ ...scope, url: "https://example.com/late", attempt: first! }, candidate())).rejects.toThrow("attempt");
  await expect(renewCrawlAttempt({ ...scope, attempt: first! })).rejects.toThrow("attempt");
  await expect(finishCrawlAttempt({ ...scope, attempt: first! }, { status: "complete" })).rejects.toThrow("attempt");
  const scan = vi.fn(async () => candidate("replacement"));
  expect(await getOrScanCrawlPage({ ...scope, attempt: replacement! }, scan)).toEqual(saved);
  expect(scan).not.toHaveBeenCalled();
  expect(await prisma.scan.count()).toBe(1);
});

it("renews only the current live owner and finalizes its job", async () => {
  const attempt = await claimCrawlAttempt(scope, 30);
  expect(attempt).not.toBeNull();
  const owned = { ...scope, attempt: attempt! };
  const expiry = await renewCrawlAttempt(owned, 60);
  expect(expiry.getTime()).toBeGreaterThan(attempt!.expiresAt.getTime());
  expect(await claimCrawlAttempt(scope)).toBeNull();
  await saveCrawlPage(owned, candidate());
  await finishCrawlAttempt(owned, { status: "complete", result: { pagesScanned: 1 } });
  expect(await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).toMatchObject({
    status: "complete", progress: 100, result: { pagesScanned: 1 },
  });
  await expect(renewCrawlAttempt(owned)).rejects.toThrow("not active");
  await expect(claimCrawlAttempt(scope)).rejects.toThrow("not active");
});

it("does not let an expired owner renew or start another page even before takeover", async () => {
  const attempt = await claimCrawlAttempt(scope);
  await observer.query(`UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobId" = $1`, [scope.jobId]);
  const scan = vi.fn(async () => candidate());
  await expect(getOrScanCrawlPage({ ...scope, attempt: attempt! }, scan)).rejects.toThrow("attempt");
  await expect(renewCrawlAttempt({ ...scope, attempt: attempt! })).rejects.toThrow("attempt");
  expect(scan).not.toHaveBeenCalled();
});

it("requires the exact token and generation once a lease exists, including checkpoint replay", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  await saveCrawlPage({ ...scope, attempt }, candidate());
  const scan = vi.fn(async () => candidate());
  for (const invalid of [
    undefined,
    { ...attempt, token: randomUUID() },
    { ...attempt, generation: attempt.generation + 1 },
  ]) {
    await expect(getOrScanCrawlPage({ ...scope, attempt: invalid }, scan)).rejects.toThrow("attempt");
    await expect(saveCrawlPage({ ...scope, attempt: invalid }, candidate())).rejects.toThrow("attempt");
  }
  expect(scan).not.toHaveBeenCalled();
  expect(await prisma.scan.count()).toBe(1);
});

it("does not accept an attempt token for an unleased job", async () => {
  await expect(saveCrawlPage({ ...scope, attempt: { token: randomUUID(), generation: 1 } }, candidate())).rejects.toThrow("attempt");
  expect(await prisma.scan.count()).toBe(0);
});

it("rejects invalid lease durations before acquiring ownership", async () => {
  for (const seconds of [0, 4, 301, 1.5, NaN, Infinity]) {
    await expect(claimCrawlAttempt(scope, seconds)).rejects.toThrow();
  }
  expect(await prisma.crawlAttemptLease.count()).toBe(0);
});

it.each(["cancelled", "failed", "complete"])("does not claim or renew a %s job", async status => {
  const attempt = (await claimCrawlAttempt(scope))!;
  await prisma.crawlJobRecord.update({ where: { id: scope.jobId }, data: { status } });
  await expect(claimCrawlAttempt(scope)).rejects.toThrow("not active");
  await expect(renewCrawlAttempt({ ...scope, attempt })).rejects.toThrow("not active");
  await expect(finishCrawlAttempt({ ...scope, attempt }, { status: "failed" })).rejects.toThrow("not active");
});

it("does not acquire or reuse a lease across workspace boundaries", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  const other = { ...scope, workspaceId: "other-workspace", attempt };
  await expect(claimCrawlAttempt(other)).rejects.toThrow("not active");
  await expect(renewCrawlAttempt(other)).rejects.toThrow("not active");
  await expect(saveCrawlPage(other, candidate())).rejects.toThrow("not active");
});

it("rolls back an operation if its lease expires before the final ownership check", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  await expect(withCrawlAttempt({ ...scope, attempt }, async transaction => {
    await transaction.crawlJobRecord.update({ where: { id: scope.jobId }, data: { pagesScanned: 99 } });
    await transaction.$executeRaw`
      UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second'
      WHERE "jobId" = ${scope.jobId}
    `;
  })).rejects.toThrow("attempt");
  expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: scope.jobId } })).pagesScanned).toBe(0);
  expect((await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } })).expiresAt).toEqual(attempt.expiresAt);
});

it("fences a stale page writer after it waits behind a committed takeover", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  await observer.query("BEGIN");
  let pending: Promise<unknown> | undefined;
  try {
    await observer.query("SELECT id FROM crawl_jobs WHERE id = $1 FOR UPDATE", [scope.jobId]);
    pending = saveCrawlPage({ ...scope, attempt }, candidate()).then(() => "unexpected success", error => error);
    await expect.poll(async () => (await observer.query(`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name = 'reglayer_page_integration' AND wait_event_type = 'Lock'
    `)).rows[0].count).toBeGreaterThan(0);
    await observer.query('UPDATE crawl_attempt_leases SET token = $2, generation = generation + 1 WHERE "jobId" = $1', [scope.jobId, randomUUID()]);
    await observer.query("COMMIT");
    expect(await pending).toBeInstanceOf(Error);
    expect(await prisma.scan.count()).toBe(0);
  } finally {
    await observer.query("ROLLBACK");
    await pending;
  }
});

it("cannot claim ownership halfway through an unleased page transaction", async () => {
  let unlock!: () => void;
  let locked!: () => void;
  const entered = new Promise<void>(resolve => { locked = resolve; });
  const release = new Promise<void>(resolve => { unlock = resolve; });
  const writing = withCrawlAttempt(scope, async () => { locked(); await release; });
  await entered;
  const claiming = claimCrawlAttempt(scope);
  try {
    await expect.poll(async () => (await observer.query(`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name = 'reglayer_page_integration' AND wait_event_type = 'Lock'
    `)).rows[0].count).toBeGreaterThan(0);
    expect((await observer.query('SELECT "jobId" FROM crawl_attempt_leases')).rows).toEqual([]);
  } finally {
    unlock();
    await writing;
    await claiming;
  }
  expect(await prisma.crawlAttemptLease.count()).toBe(1);
});

it("discards a late browser result after ownership moves to a replacement", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  let finishScan!: (result: ScanResult) => void;
  const scan = vi.fn(() => new Promise<ScanResult>(resolve => { finishScan = resolve; }));
  const pending = getOrScanCrawlPage({ ...scope, attempt }, scan).then(result => result, error => error);
  try {
    await expect.poll(() => scan.mock.calls.length).toBe(1);
    await observer.query(`UPDATE crawl_attempt_leases SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') - interval '1 second' WHERE "jobId" = $1`, [scope.jobId]);
    const replacement = (await claimCrawlAttempt(scope))!;
    const winner = await saveCrawlPage({ ...scope, attempt: replacement }, candidate("replacement", 90));
    finishScan(candidate("old-owner", 10));
    expect(await pending).toBeInstanceOf(Error);
    expect(await loadCrawlPage(scope)).toEqual(winner);
    expect(await prisma.scan.count()).toBe(1);
    expect(await prisma.violation.count()).toBe(1);
  } finally {
    finishScan?.(candidate());
    await pending;
  }
});

it("keeps the lease generation after reconnect and cascades it only when the job is removed", async () => {
  const attempt = (await claimCrawlAttempt(scope))!;
  await prisma.$disconnect();
  expect(await claimCrawlAttempt(scope)).toBeNull();
  expect(await prisma.crawlAttemptLease.findUniqueOrThrow({ where: { jobId: scope.jobId } })).toMatchObject({
    token: attempt.token, generation: attempt.generation, workspaceId: scope.workspaceId,
  });
  await prisma.crawlJobRecord.delete({ where: { id: scope.jobId } });
  expect(await prisma.crawlAttemptLease.count()).toBe(0);
});