import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import { createCrawlSchema } from "./fixtures/crawl-schema";

const fixture = vi.hoisted(() => {
  const connectionString = process.env.REGLAYER_TEST_DATABASE_URL;
  if (!connectionString) throw new Error("Run these isolated tests with npm run test:postgres.");
  const target = new URL(connectionString);
  if (target.hostname !== "127.0.0.1" || target.pathname !== "/reglayer_test" || target.search) {
    throw new Error("PostgreSQL tests require the disposable loopback database.");
  }
  return { connectionString, after: vi.fn(), crawlSite: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", async () => {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");
  return { prisma: new PrismaClient({ adapter: new PrismaPg({
    connectionString: fixture.connectionString,
    application_name: "reglayer_crawl_integration",
    max: 2,
    statement_timeout: 10_000,
    connectionTimeoutMillis: 5_000,
  }) }) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/server")>(), after: fixture.after,
}));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { email: "test@example.com" } }) }));
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }));
vi.mock("@/lib/auth/api-guard", () => ({ requireWorkspacePermission: async () => ({ ok: true }) }));
vi.mock("@/lib/auth/access", () => ({ assertCrawlJobAccess: async () => ({ ok: true, workspaceId: "workspace-1" }) }));
vi.mock("@/lib/features/require-feature", () => ({ requireFeature: async () => ({ allowed: true }) }));
vi.mock("@/lib/rate-limit-middleware", () => ({ applyRateLimit: async () => null }));
vi.mock("@/lib/credits/plan-context", () => ({ getPlanContext: async () => ({
  userId: "user-1", isMasterAdmin: false, limits: { pagesPerScan: 10 },
}) }));
vi.mock("@/lib/database/workspace", () => ({ getOrCreateWorkspace: async () => "workspace-1" }));
vi.mock("@/lib/scanner/crawler/siteCrawler", () => ({ crawlSite: fixture.crawlSite }));
vi.mock("@/lib/validations/ssrf", () => ({ validateScanUrl: () => null, resolvesToInternalIp: async () => false }));
vi.mock("@/lib/crypto", () => ({ decryptJson: vi.fn() }));
vi.mock("@/lib/telemetry/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { POST } from "@/app/api/crawl/route";
import { GET, DELETE } from "@/app/api/crawl/[jobId]/route";
import { jobManager } from "@/lib/scanner/crawler/job-manager";

const observer = new Client({ connectionString: fixture.connectionString, statement_timeout: 10_000 });
const params = (jobId: string) => ({ params: Promise.resolve({ jobId }) });
const request = (jobId: string) => new NextRequest(`http://localhost:3000/api/crawl/${jobId}`);

async function submit(url = "https://example.com") {
  return POST(new NextRequest("http://localhost:3000/api/crawl", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
  }));
}
function background() {
  const callback = fixture.after.mock.calls[0]?.[0];
  if (typeof callback !== "function") throw new Error("No background callback was scheduled");
  return callback() as Promise<void>;
}

async function waitForBlockedWrite() {
  await expect.poll(async () => {
    const { rows } = await observer.query(`
      SELECT count(*)::int AS count FROM pg_stat_activity
      WHERE application_name = 'reglayer_crawl_integration' AND wait_event_type = 'Lock'
    `);
    return rows[0].count;
  }, { timeout: 5_000 }).toBeGreaterThan(0);
}

async function competingWrite<Result>(jobId: string, operation: () => Promise<Result>, winner: () => Promise<unknown>) {
  await observer.query("BEGIN");
  let pending: Promise<{ result: Result } | { error: unknown }> | undefined;
  try {
    await observer.query("SELECT id FROM crawl_jobs WHERE id = $1 FOR UPDATE", [jobId]);
    pending = operation().then(result => ({ result }), error => ({ error }));
    await waitForBlockedWrite();
    await winner();
    await observer.query("COMMIT");
    const outcome = await pending;
    if ("error" in outcome) throw outcome.error;
    return outcome.result;
  } finally {
    await observer.query("ROLLBACK");
    await pending;
  }
}

beforeEach(async () => {
  vi.resetAllMocks();
  jobManager.destroy();
  await prisma.crawlJobRecord.deleteMany();
});
afterEach(() => {
  jobManager.destroy();
  vi.restoreAllMocks();
});

beforeAll(async () => {
  await observer.connect();
  await createCrawlSchema(observer);
});
afterAll(async () => {
  await prisma.$disconnect();
  await observer.end();
});

it("persists the generated CrawlJobRecord schema across independent connections", async () => {
  await prisma.crawlJobRecord.create({ data: { id: "postgres-smoke", rootUrl: "https://example.com" } });
  const { rows } = await observer.query('SELECT status, "updatedAt" FROM crawl_jobs WHERE id = $1', ["postgres-smoke"]);
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("processing");
  expect(rows[0].updatedAt).toBeInstanceOf(Date);
});

describe("real database admission", () => {
  it("returns a job ID only after the row is visible to another connection", async () => {
    const response = await submit();
    const { jobId } = await response.json();
    const { rows } = await observer.query('SELECT id, "workspaceId", "userId", status FROM crawl_jobs WHERE id = $1', [jobId]);
    expect(response.status).toBe(200);
    expect(rows).toEqual([{ id: jobId, workspaceId: "workspace-1", userId: "user-1", status: "processing" }]);
    expect(fixture.after).toHaveBeenCalledOnce();
  });

  it("does not schedule a crawl when PostgreSQL rejects the insert", async () => {
    await observer.query("ALTER TABLE crawl_jobs ADD CONSTRAINT integration_reject CHECK (false)");
    try {
      const response = await submit();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Unable to save the audit. Please try again shortly." });
      expect(fixture.after).not.toHaveBeenCalled();
      expect(await prisma.crawlJobRecord.count()).toBe(0);
    } finally {
      await observer.query("ALTER TABLE crawl_jobs DROP CONSTRAINT integration_reject");
    }
  });
});

describe("PostgreSQL row-lock interleavings", () => {
  it.each(["complete", "failed", "cancelled"])("does not overwrite a %s record with a blocked progress write", async (status) => {
    const interval = vi.spyOn(globalThis, "setInterval");
    let finishCrawl!: (value: object) => void;
    fixture.crawlSite.mockReturnValueOnce(new Promise(resolve => { finishCrawl = resolve; }));
    const { jobId } = await (await submit()).json();
    jobManager.emitEvent(jobId, { type: "phase", phase: "scanning", timestamp: Date.now() });
    const pending = background();
    const progress = interval.mock.calls.find(([, duration]) => duration === 2500)?.[0];
    const result = { pagesScanned: 10, pagesDiscovered: 10 };
    try {
      if (typeof progress !== "function") throw new Error("Missing progress callback");
      await competingWrite(jobId, async () => { await progress(); }, () => observer.query(
        "UPDATE crawl_jobs SET status = $2, result = $3::jsonb WHERE id = $1", [jobId, status, JSON.stringify(result)]
      ));
      expect(await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status, result });
    } finally {
      finishCrawl(result);
      await pending;
    }
  });

  it("does not cancel a job completed by a competing transaction", async () => {
    const { jobId } = await (await submit()).json();
    const response = await competingWrite(jobId, () => DELETE(request(jobId), params(jobId)), () => observer.query(
      "UPDATE crawl_jobs SET status = 'complete', result = $2::jsonb WHERE id = $1", [jobId, JSON.stringify({ pagesScanned: 10 })]
    ));
    expect(response.status).toBe(200);
    expect(await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({
      status: "complete", result: { pagesScanned: 10 },
    });
    expect(jobManager.getJob(jobId)?.cancelRequested).toBe(false);
  });

  it.each(["failed", "cancelled"])("does not finalize over a %s state committed while its write is blocked", async (status) => {
    const { jobId } = await (await submit()).json();
    fixture.crawlSite.mockResolvedValue({ pagesScanned: 1, pagesDiscovered: 1 });
    await competingWrite(jobId, background, () => observer.query(
      "UPDATE crawl_jobs SET status = $2, error = 'Terminal winner' WHERE id = $1", [jobId, status]
    ));
    expect(await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ status, error: "Terminal winner", result: null });
    expect(jobManager.getJob(jobId)?.status).toBe(status);
  });

  it.each(["complete", "processing", "cancelled"])("does not recover a stale job after a concurrent %s update", async (status) => {
    const jobId = "stale-race";
    await prisma.crawlJobRecord.create({ data: {
      id: jobId, rootUrl: "https://example.com", updatedAt: new Date(Date.now() - 70_000),
      result: { __live: { pages: [] } },
    } });
    const result = status === "complete" ? { pagesScanned: 10 } : { __live: { pages: [] } };
    const response = await competingWrite(jobId, () => GET(request(jobId), params(jobId)), () => observer.query(
      'UPDATE crawl_jobs SET status = $2, "updatedAt" = NOW(), result = $3::jsonb WHERE id = $1',
      [jobId, status, JSON.stringify(result)]
    ));
    const body = await response.json();
    expect(body.status).toBe(status);
    expect(body.error).toBeUndefined();
    if (status === "complete") expect(body.result).toEqual(result);
    else expect(body.result).toBeUndefined();
    expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: jobId } })).status).toBe(status);
  });
});

it("does not acknowledge cancellation rejected by PostgreSQL or stop the local crawl", async () => {
  const { jobId } = await (await submit()).json();
  await observer.query("ALTER TABLE crawl_jobs ADD CONSTRAINT integration_reject_cancel CHECK (status <> 'cancelled')");
  try {
    const response = await DELETE(request(jobId), params(jobId));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Unable to cancel the audit. Please try again shortly." });
    expect((await prisma.crawlJobRecord.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("processing");
    expect(jobManager.getJob(jobId)?.cancelRequested).toBe(false);
  } finally {
    await observer.query("ALTER TABLE crawl_jobs DROP CONSTRAINT integration_reject_cancel");
  }
});

it("persists abandoned-job failure for subsequent status requests on a new client", async () => {
  const jobId = "abandoned";
  await prisma.crawlJobRecord.create({ data: {
    id: jobId, rootUrl: "https://example.com", updatedAt: new Date(Date.now() - 70_000),
    result: { __live: { pages: [] } },
  } });
  const first = await (await GET(request(jobId), params(jobId))).json();
  expect(first.status).toBe("failed");
  expect(first.result).toBeUndefined();
  await prisma.$disconnect();
  const second = await (await GET(request(jobId), params(jobId))).json();
  expect(second.status).toBe("failed");
  expect(second.error).toBe(first.error);
  expect(second.result).toBeUndefined();
  const { rows } = await observer.query("SELECT status, error FROM crawl_jobs WHERE id = $1", [jobId]);
  expect(rows[0]).toEqual({ status: "failed", error: first.error });
});