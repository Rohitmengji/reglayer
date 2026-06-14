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
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: job.progress,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.result,
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
