/**
 * RegLayer — Crawl API (v3 — Background Job Architecture)
 *
 * POST: Start a new site audit → returns job ID immediately
 *       Background: engine runs async, streams progress via SSE
 *
 * No more synchronous scanning — supports 500+ page audits.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { crawlSite } from "@/lib/scanner/crawler/siteCrawler";
import { jobManager } from "@/lib/scanner/crawler/job-manager";
import { getPlanContext } from "@/lib/credits/plan-context";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { authConfigSchema } from "@/lib/validations/auth";
import { logger } from "@/lib/telemetry/logger";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWorkspace } from "@/lib/database/workspace";
import { Prisma } from "@/generated/prisma/client";

const crawlSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(500).default(10),
  maxDepth: z.number().min(1).max(10).default(3),
  concurrency: z.number().min(1).max(10).default(3),
  requestDelay: z.number().min(0).max(5000).default(200),
  includePatterns: z.array(z.string()).optional(),
  excludePatterns: z.array(z.string()).optional(),
  auth: authConfigSchema.optional(),
  knownRoutes: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const blocked = await applyRateLimit(request, "crawl");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = crawlSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { url, maxDepth, concurrency, requestDelay, includePatterns, excludePatterns, auth, knownRoutes } = parsed.data;
  let { maxPages } = parsed.data;

  // SSRF protection
  const ssrfError = validateScanUrl(url);
  if (ssrfError) {
    return NextResponse.json({ error: ssrfError }, { status: 400 });
  }

  // Enforce page limit based on plan
  const planCtx = await getPlanContext();
  if (planCtx && !planCtx.isMasterAdmin) {
    const pageLimit = planCtx.limits.pagesPerScan;
    if (pageLimit !== -1 && maxPages > pageLimit) {
      maxPages = pageLimit;
    }
  }

  // Check capacity
  if (!jobManager.canStartNewJob()) {
    return NextResponse.json(
      { error: "Server busy — max concurrent audits reached. Try again shortly." },
      { status: 429 }
    );
  }

  // Resolve durable scoping: the user running the crawl + their workspace.
  // planCtx is non-null here (route is authenticated), but stay defensive.
  const userId = planCtx?.userId ?? null;
  const userEmail = session.user.email;
  let workspaceId: string | null = null;
  if (planCtx?.userId) {
    const resolved = await getOrCreateWorkspace(planCtx.userId, userEmail);
    workspaceId = resolved || null;
  }

  // Create job
  const crawlConfig = {
    startUrl: url,
    maxPages,
    maxDepth,
    concurrency,
    requestDelay,
    includePatterns,
    excludePatterns,
    auth: auth && auth.method !== "none" ? auth : undefined,
    knownRoutes,
    // Durable per-page Scan persistence (R-5)
    userEmail,
    workspaceId: workspaceId ?? undefined,
    userId: userId ?? undefined,
  };

  const job = jobManager.createJob(crawlConfig);

  // Durable job state (R-5): survives Vercel cold starts / cross-instance reads.
  // Best-effort — if this write fails the in-memory job still runs.
  try {
    await prisma.crawlJobRecord.create({
      data: {
        id: job.id,
        workspaceId,
        userId,
        rootUrl: url,
        status: "processing",
        pagesTotal: maxPages,
      },
    });
  } catch (error) {
    logger.warn("Failed to persist CrawlJobRecord", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "Unknown",
    });
  }

  // Start crawl in background (fire-and-forget). Persist the final outcome to
  // the durable record when the detached promise settles (best-effort).
  crawlSite({ ...crawlConfig, jobId: job.id })
    .then(async (result) => {
      // crawlSite resolves (doesn't throw) for cancelled / internally-failed
      // crawls too — mirror the in-memory job's terminal status so the durable
      // record doesn't mislabel them as "complete".
      const inMemory = jobManager.getJob(job.id);
      const status =
        inMemory?.status === "cancelled"
          ? "cancelled"
          : inMemory?.status === "failed"
            ? "failed"
            : "complete";
      const pagesTotal = result.pagesDiscovered || maxPages;
      const progress =
        status === "complete"
          ? 100
          : pagesTotal > 0
            ? Math.round((result.pagesScanned / pagesTotal) * 100)
            : 0;
      try {
        await prisma.crawlJobRecord.update({
          where: { id: job.id },
          data: {
            status,
            progress,
            pagesScanned: result.pagesScanned,
            pagesTotal,
            result: result as unknown as Prisma.InputJsonValue,
            error: inMemory?.error ?? null,
          },
        });
      } catch (err) {
        logger.warn("Failed to finalize CrawlJobRecord (settled)", {
          jobId: job.id,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    })
    .catch(async (error) => {
      const message = error instanceof Error ? error.message : "Crawl failed unexpectedly";
      logger.error("Background crawl failed", { jobId: job.id, error: message });
      jobManager.emitEvent(job.id, {
        type: "error",
        error: message,
        timestamp: Date.now(),
      });
      try {
        await prisma.crawlJobRecord.update({
          where: { id: job.id },
          data: { status: "failed", error: message },
        });
      } catch (err) {
        logger.warn("Failed to finalize CrawlJobRecord (failed)", {
          jobId: job.id,
          error: err instanceof Error ? err.message : "Unknown",
        });
      }
    });

  // Return job ID immediately
  return NextResponse.json({
    jobId: job.id,
    status: "queued",
    config: {
      url,
      maxPages,
      maxDepth,
      concurrency,
      requestDelay,
      auth: auth?.method || "none",
    },
  });
}
