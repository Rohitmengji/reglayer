import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";
import { crawlPageKey, pageSnapshot, restorePageSnapshot, type CrawlPageScope } from "@/lib/scanner/crawler/page-checkpoint";
import type { ScanResult } from "@/lib/types";
import { persistScan } from "./scanService";
import { withCrawlAttempt } from "./crawlAttemptService";

export async function getOrScanCrawlPage(scope: CrawlPageScope, scanPage: () => Promise<ScanResult>, signal?: AbortSignal): Promise<ScanResult> {
  signal?.throwIfAborted();
  const existing = await withCrawlAttempt(scope, transaction => loadCrawlPage(scope, transaction));
  signal?.throwIfAborted();
  if (existing) return existing;
  const candidate = await scanPage();
  signal?.throwIfAborted();
  return saveCrawlPage(scope, candidate);
}

export async function loadCrawlPage(scope: CrawlPageScope, database: Prisma.TransactionClient = prisma): Promise<ScanResult | null> {
  const checkpoint = await database.crawlPageCheckpoint.findFirst({
    where: {
      id: crawlPageKey(scope), workspaceId: scope.workspaceId, jobId: scope.jobId,
      job: { workspaceId: scope.workspaceId }, scan: { workspaceId: scope.workspaceId },
    },
    include: { scan: { select: { screenshot: true } } },
  });
  if (!checkpoint) return null;
  return restorePageSnapshot(checkpoint.snapshot, checkpoint.scanId, checkpoint.scan.screenshot);
}

export async function saveCrawlPage(scope: CrawlPageScope, candidate: ScanResult): Promise<ScanResult> {
  const id = crawlPageKey(scope);
  try {
    return await withCrawlAttempt(scope, async (transaction, job) => {
      const existing = await loadCrawlPage(scope, transaction);
      if (existing) return existing;

      const snapshot = pageSnapshot({ ...candidate, id });
      const scan: ScanResult = { ...snapshot.scan, screenshot: candidate.screenshot };
      const compliance = evaluateCompliance(id, scan.violations);
      await persistScan(scan, compliance, undefined, {
        workspaceId: scope.workspaceId, userId: job.userId ?? undefined,
        metadata: { crawlJobId: scope.jobId, requestedUrl: new URL(scope.url).href, checkpointVersion: 1 },
      }, transaction);
      await transaction.crawlPageCheckpoint.create({ data: {
        id, workspaceId: scope.workspaceId, jobId: scope.jobId, url: new URL(scope.url).href,
        scanId: id, snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
      } });
      return scan;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await withCrawlAttempt(scope, transaction => loadCrawlPage(scope, transaction));
      if (winner) return winner;
    }
    throw error;
  }
}