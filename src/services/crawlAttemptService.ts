import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import type { CrawlAttempt, CrawlJobScope } from "@/lib/scanner/crawler/page-checkpoint";

const scopeSchema = z.object({ workspaceId: z.string().trim().min(1), jobId: z.string().trim().min(1) });
const attemptSchema = z.object({ token: z.string().uuid(), generation: z.number().int().positive().max(2_147_483_647) });
const durationSchema = z.number().int().min(5).max(300);
type OwnedScope = CrawlJobScope & { attempt: CrawlAttempt };
type Lease = CrawlAttempt & { expiresAt: Date };

async function lockActiveJob(transaction: Prisma.TransactionClient, scope: CrawlJobScope) {
  scopeSchema.parse(scope);
  const jobs = await transaction.$queryRaw<Array<{ userId: string | null; status: string }>>`
    SELECT "userId", status FROM crawl_jobs
    WHERE id = ${scope.jobId} AND "workspaceId" = ${scope.workspaceId}
    FOR UPDATE
  `;
  if (jobs.length !== 1 || jobs[0].status !== "processing") throw new Error("The crawl is not active in this workspace.");
  return jobs[0];
}

async function assertCurrentAttempt(transaction: Prisma.TransactionClient, scope: CrawlJobScope) {
  const attempt = scope.attempt === undefined ? undefined : attemptSchema.parse(scope.attempt);
  const leases = await transaction.$queryRaw<Array<{ owned: boolean }>>`
    SELECT ("workspaceId" = ${scope.workspaceId}
      AND token = ${attempt?.token ?? null}
      AND generation = ${attempt?.generation ?? null}
      AND "expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')) AS owned
    FROM crawl_attempt_leases WHERE "jobId" = ${scope.jobId}
  `;
  if (leases.length === 0 && !attempt) return;
  if (leases.length !== 1 || !leases[0].owned) throw new Error("The crawl attempt no longer owns this job.");
}

export function withCrawlAttempt<Result>(
  scope: CrawlJobScope,
  operation: (transaction: Prisma.TransactionClient, job: { userId: string | null }) => Promise<Result>,
): Promise<Result> {
  return prisma.$transaction(async transaction => {
    const job = await lockActiveJob(transaction, scope);
    await assertCurrentAttempt(transaction, scope);
    const result = await operation(transaction, job);
    await assertCurrentAttempt(transaction, scope);
    return result;
  }, { maxWait: 5_000, timeout: 10_000 });
}

export async function claimCrawlAttempt(scope: CrawlJobScope, leaseSeconds = 60): Promise<Lease | null> {
  durationSchema.parse(leaseSeconds);
  const token = randomUUID();
  return prisma.$transaction(async transaction => {
    await lockActiveJob(transaction, scope);
    const leases = await transaction.$queryRaw<Lease[]>`
      INSERT INTO crawl_attempt_leases ("jobId", "workspaceId", token, generation, "expiresAt")
      VALUES (${scope.jobId}, ${scope.workspaceId}, ${token}, 1,
        (clock_timestamp() AT TIME ZONE 'UTC') + make_interval(secs => ${leaseSeconds}))
      ON CONFLICT ("jobId") DO UPDATE SET
        token = EXCLUDED.token, generation = crawl_attempt_leases.generation + 1,
        "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') + make_interval(secs => ${leaseSeconds})
      WHERE crawl_attempt_leases."workspaceId" = ${scope.workspaceId}
        AND crawl_attempt_leases."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      RETURNING token, generation, "expiresAt"
    `;
    if (leases.length === 0) return null;
    await transaction.$executeRaw`
      UPDATE crawl_jobs SET "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC') WHERE id = ${scope.jobId}
    `;
    return leases[0];
  }, { maxWait: 5_000, timeout: 10_000 });
}

export async function renewCrawlAttempt(scope: OwnedScope, leaseSeconds = 60): Promise<Date> {
  attemptSchema.parse(scope.attempt);
  durationSchema.parse(leaseSeconds);
  return withCrawlAttempt(scope, async transaction => {
    const leases = await transaction.$queryRaw<Array<{ expiresAt: Date }>>`
      UPDATE crawl_attempt_leases
      SET "expiresAt" = (clock_timestamp() AT TIME ZONE 'UTC') + make_interval(secs => ${leaseSeconds})
      WHERE "jobId" = ${scope.jobId} AND "workspaceId" = ${scope.workspaceId}
        AND token = ${scope.attempt.token} AND generation = ${scope.attempt.generation}
        AND "expiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')
      RETURNING "expiresAt"
    `;
    if (leases.length !== 1) throw new Error("The crawl attempt no longer owns this job.");
    await transaction.$executeRaw`
      UPDATE crawl_jobs SET "updatedAt" = (clock_timestamp() AT TIME ZONE 'UTC') WHERE id = ${scope.jobId}
    `;
    return leases[0].expiresAt;
  });
}

export async function finishCrawlAttempt(
  scope: OwnedScope,
  outcome: { status: "complete" | "failed"; result?: Prisma.InputJsonValue; error?: string; pages?: { scanned: number; total: number } },
): Promise<void> {
  attemptSchema.parse(scope.attempt);
  z.enum(["complete", "failed"]).parse(outcome.status);
  const pages = z.object({
    scanned: z.number().int().nonnegative().max(2_147_483_647),
    total: z.number().int().nonnegative().max(2_147_483_647),
  }).refine(value => value.scanned <= value.total).optional().parse(outcome.pages);
  await withCrawlAttempt(scope, async transaction => {
    await transaction.crawlJobRecord.update({ where: { id: scope.jobId }, data: {
      status: outcome.status, result: outcome.result, error: outcome.error ?? null,
      ...(outcome.status === "complete" ? { progress: 100 } : {}),
      ...(pages ? { pagesScanned: pages.scanned, pagesTotal: pages.total } : {}),
    } });
  });
}