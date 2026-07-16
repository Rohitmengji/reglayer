/**
 * RegLayer — Audit Job Status API
 *
 * GET /api/crawl/[jobId] — Returns current job status, progress, and results.
 * DELETE /api/crawl/[jobId] — Cancel a running audit.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { jobManager } from "@/lib/scanner/crawler/job-manager";
import { prisma } from "@/lib/database/prisma";
import { assertCrawlJobAccess } from "@/lib/auth/access";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Input validation: reject absurd job IDs early (DoS prevention).
  if (typeof jobId !== "string" || jobId.length > 100) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const job = jobManager.getJob(jobId);

  // Ownership check (IDOR guard): job IDs are guessable, so a status/result/live
  // read must be scoped to the caller's workspace. Use the in-memory job's owner
  // as the fast path (no DB read while the crawl is live); otherwise the helper
  // reads the durable record.
  const access = await assertCrawlJobAccess(jobId, session, job
    ? { workspaceId: job.config.workspaceId ?? null, userId: job.config.userId ?? null }
    : undefined);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (job) {
    // In-memory state is authoritative when present (live progress object).
    return NextResponse.json({
      id: job.id,
      status: job.status,
      progress: job.progress,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result,
      live: job.live, // drives the live viewport / site-map / filmstrip
    });
  }

  // Fallback (R-5): the in-memory job is gone — different lambda instance or
  // after a cold start. Read durable state so status/result still resolve.
  const record = await prisma.crawlJobRecord.findUnique({ where: { id: jobId } });
  if (!record) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Stuck-job recovery: if a record is still "processing" but hasn't been
  // updated well beyond the function's maxDuration (60s), the lambda was killed
  // before finalizing. The progress ticker writes every 2.5s, so if we haven't
  // seen an update in 65s (60s maxDuration + 5s DB write grace), the function
  // is dead. Surface it as failed so the client stops polling.
  const STALE_MS = 65_000;
  const isStale = record.status === "processing" && Date.now() - record.updatedAt.getTime() > STALE_MS;
  const effectiveStatus = isStale ? "failed" : record.status;
  const terminal = effectiveStatus === "complete" || effectiveStatus === "failed" || effectiveStatus === "cancelled";
  // record.result holds EITHER the live snapshot ({__live,...}) while the crawl
  // is in flight, OR the full CrawlResult once finished. Disambiguate so the
  // client never mistakes the partial for a final result.
  const raw = (record.result ?? null) as null | {
    __live?: unknown; phase?: string; currentUrl?: string | null;
    pagesDiscovered?: number; pagesScanned?: number; averageScore?: number;
    totalViolations?: number; patterns?: unknown[]; errors?: unknown[];
  };
  const live = raw && raw.__live !== undefined ? raw.__live : null;
  const r = terminal ? raw : null; // only treat as CrawlResult when finished
  const phase =
    effectiveStatus === "complete" ? "complete"
    : effectiveStatus === "failed" ? "failed"
    : effectiveStatus === "cancelled" ? "cancelled"
    : (raw?.phase as string | undefined) ?? (record.pagesScanned > 0 ? "scanning" : "discovering");
  const progress = {
    phase,
    pagesDiscovered: r?.pagesDiscovered ?? record.pagesTotal,
    pagesScanned: r?.pagesScanned ?? record.pagesScanned,
    pagesTotal: record.pagesTotal,
    pagesFailed: Array.isArray(r?.errors) ? r!.errors!.length : 0,
    currentUrl: raw?.currentUrl ?? undefined,
    avgScore: r?.averageScore ?? 0,
    totalViolations: r?.totalViolations ?? 0,
    patternsFound: Array.isArray(r?.patterns) ? r!.patterns!.length : 0,
    phaseTiming: {},
  };
  return NextResponse.json({
    id: record.id,
    status: effectiveStatus,
    progress,
    startedAt: record.createdAt.getTime(),
    completedAt: terminal ? record.updatedAt.getTime() : undefined,
    error: isStale
      ? "The audit stopped unexpectedly (it may have exceeded the time limit). Please try again with fewer pages."
      : (record.error ?? undefined),
    // Only the FULL CrawlResult is a result; a stale record's partial live blob is not.
    result: terminal && !isStale ? (record.result ?? undefined) : undefined,
    live, // drives the live viewport / site-map / filmstrip via polling
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  // Ownership check (IDOR guard): never let one user cancel another's audit.
  const existing = jobManager.getJob(jobId);
  const access = await assertCrawlJobAccess(jobId, session, existing
    ? { workspaceId: existing.config.workspaceId ?? null, userId: existing.config.userId ?? null }
    : undefined);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  // Authorization — cancelling a crawl needs the same capability as starting one
  // (scans.run, MEMBER and above). A VIEWER cannot cancel audits.
  const perm = await requireWorkspacePermission("scans.run", { workspaceId: access.workspaceId });
  if (!perm.ok) return perm.response;

  // Cancel the in-memory job IF this lambda is the one running it.
  const cancelledInMemory = jobManager.cancelJob(jobId);

  // Durable cancel: on serverless the DELETE almost always lands on a DIFFERENT
  // lambda than the crawl, so the in-memory cancel above is a no-op. Persist the
  // intent to the record — the crawl's progress ticker (on the running instance)
  // reads this each tick and stops, and the client poll sees "cancelled" and
  // leaves the running view. Best-effort; don't fail the request on a write error.
  try {
    const rec = await prisma.crawlJobRecord.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!rec) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (rec.status === "processing") {
      await prisma.crawlJobRecord.update({ where: { id: jobId }, data: { status: "cancelled" } });
    }
  } catch {
    if (!cancelledInMemory) {
      // couldn't reach the record and not in memory — nothing we can do
      return NextResponse.json({ status: "cancelling", jobId });
    }
  }

  return NextResponse.json({ status: "cancelling", jobId });
}
