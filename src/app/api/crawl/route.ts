/**
 * RegLayer — Crawl API (v3 — Background Job Architecture)
 *
 * POST: Start a new site audit → returns job ID immediately
 *       Background: engine runs async, streams progress via SSE
 *
 * No more synchronous scanning — supports 500+ page audits.
 */
import { NextRequest, NextResponse, after } from "next/server";
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

// The crawl launches headless Chromium and can run for a while; give it the
// Node runtime and the maximum duration (the matching vercel.json entry also
// raises memory and bundles the @sparticuz/chromium binary).
export const runtime = "nodejs";
export const maxDuration = 60;

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

  // Run the crawl via after(): the response is returned immediately, but Vercel
  // keeps the function alive to finish this work (a bare fire-and-forget promise
  // is frozen/killed once the response is sent). Throughout the crawl we persist
  // progress to the durable CrawlJobRecord every few seconds, so a client
  // polling from ANY lambda instance sees live progress even though the
  // in-memory job manager is per-instance and SSE may land on a cold instance.
  after(async () => {
    const persistProgress = async () => {
      try {
        const j = jobManager.getJob(job.id);
        if (!j || j.status === "complete" || j.status === "failed" || j.status === "cancelled") return;
        // Honor a durable cancel written by a DELETE on another lambda: if the
        // record was set to "cancelled", stop the crawl here and DON'T overwrite
        // it back to "processing".
        const rec = await prisma.crawlJobRecord.findUnique({ where: { id: job.id }, select: { status: true } });
        if (rec?.status === "cancelled") { jobManager.cancelJob(job.id); return; }
        const p = j.progress;
        const total = p.pagesTotal || maxPages;
        await prisma.crawlJobRecord.update({
          where: { id: job.id },
          data: {
            status: "processing",
            progress: total > 0 ? Math.min(99, Math.round((p.pagesScanned / total) * 100)) : 0,
            pagesScanned: p.pagesScanned,
            pagesTotal: total,
            // Persist the live-visualization snapshot so the client can render
            // the faux-browser viewport / site-map / filmstrip by POLLING. On
            // serverless the SSE stream and the crawl run on different lambdas,
            // so SSE delivers nothing — polling the durable record is the only
            // reliable channel. Overwritten by the full CrawlResult on finish.
            result: { __live: j.live, phase: p.phase, currentUrl: p.currentUrl ?? null } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch { /* best-effort durable progress */ }
    };
    const ticker = setInterval(persistProgress, 2500);

    try {
      // Wall-clock budget ~10s under the 60s function maxDuration: the crawl
      // returns a "partial" result and the finalizer below writes a terminal
      // status BEFORE Vercel kills the lambda — so the job never hangs at
      // "processing" on deep/large crawls.
      const result = await crawlSite({ ...crawlConfig, jobId: job.id, deadline: Date.now() + 50_000 });
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Crawl failed unexpectedly";
      logger.error("Background crawl failed", { jobId: job.id, error: message });
      jobManager.emitEvent(job.id, { type: "error", error: message, timestamp: Date.now() });
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
    } finally {
      clearInterval(ticker);
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
