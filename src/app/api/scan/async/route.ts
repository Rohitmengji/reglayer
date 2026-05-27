/**
 * ---------------------------------------------------------
 * RegLayer — Async Scan API (Queue-based)
 * ---------------------------------------------------------
 *
 * Purpose:
 * Non-blocking scan endpoint that returns immediately
 * with a job ID for status polling.
 *
 * Flow:
 * 1. POST /api/scan/async → returns job ID
 * 2. GET /api/scan/async?jobId=xxx → returns job status
 * ---------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { enqueueScanJob, getJob, getAllJobs } from "@/lib/queue/scanQueue";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";

const asyncScanSchema = z.object({
  url: z.string().url(),
  options: z
    .object({
      includeScreenshot: z.boolean().optional(),
      timeout: z.number().min(1000).max(60000).optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Rate limit by IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = rateLimit(`async-scan:${ip}`, RATE_LIMITS.scan);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before scanning again." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await request.json();
    const parseResult = asyncScanSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { url, options } = parseResult.data;
    const job = enqueueScanJob(url, options);

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        message: "Scan queued successfully. Poll GET /api/scan/async?jobId=<id> for status.",
      },
      { status: 202 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to enqueue scan" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("jobId");

  if (jobId) {
    const job = getJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  }

  // Return all jobs
  const jobs = getAllJobs();
  return NextResponse.json({ jobs });
}
