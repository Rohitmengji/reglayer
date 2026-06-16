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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = jobManager.getJob(jobId);
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

  const terminal = record.status === "complete" || record.status === "failed" || record.status === "cancelled";
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
    record.status === "complete" ? "complete"
    : record.status === "failed" ? "failed"
    : record.status === "cancelled" ? "cancelled"
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
    status: record.status,
    progress,
    startedAt: record.createdAt.getTime(),
    completedAt: terminal ? record.updatedAt.getTime() : undefined,
    error: record.error ?? undefined,
    result: terminal ? (record.result ?? undefined) : undefined,
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
  const cancelled = jobManager.cancelJob(jobId);
  if (!cancelled) {
    return NextResponse.json({ error: "Job not found or already complete" }, { status: 404 });
  }

  return NextResponse.json({ status: "cancelling", jobId });
}
