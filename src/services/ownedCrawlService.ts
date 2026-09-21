import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { crawlSite, type CrawlConfig } from "@/lib/scanner/crawler/siteCrawler";
import { withCrawlAttempt } from "./crawlAttemptService";
import { runOwnedCrawlAttempt } from "./crawlExecutor";

type OwnedCrawlConfig = Omit<CrawlConfig, "signal" | "attempt" | "checkpointPages" | "jobId" | "workspaceId"> & {
  jobId: string;
  workspaceId: string;
};

export function executeOwnedCrawl(config: OwnedCrawlConfig, options: Parameters<typeof runOwnedCrawlAttempt>[2] = {}) {
  const scope = { jobId: config.jobId, workspaceId: config.workspaceId };
  return runOwnedCrawlAttempt(scope, async ({ attempt, signal }) => {
    const job = await withCrawlAttempt({ ...scope, attempt }, transaction => transaction.crawlJobRecord.findUniqueOrThrow({
      where: { id: config.jobId }, select: { rootUrl: true },
    }));
    if (new URL(config.startUrl).href !== new URL(job.rootUrl).href) {
      throw new Error("Crawl URL does not match the persisted job.");
    }
    signal.throwIfAborted();
    const result = await crawlSite({ ...config, attempt, signal, checkpointPages: true });
    signal.throwIfAborted();
    const failed = result.outcome === "partial" || result.outcome === "all-failed" || result.outcome === "launch-failed";
    return {
      status: failed ? "failed" : "complete",
      result: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      pages: { scanned: result.pagesScanned, total: result.pagesDiscovered },
      ...(failed ? { error: "The crawl did not complete full coverage. Review the saved results before retrying." } : {}),
    };
  }, options);
}