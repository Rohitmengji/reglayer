/**
 * RegLayer — Audit SSE Stream
 *
 * GET /api/crawl/[jobId]/stream — Server-Sent Events endpoint.
 * Streams real-time progress events from a running audit job.
 *
 * Events:
 * - phase: Phase transition (connecting → discovering → scanning → analyzing → complete)
 * - progress: Periodic progress update (pages scanned, avg score, ETA, etc.)
 * - page-start: Individual page scan started
 * - page-complete: Individual page scan finished (with score + violations)
 * - page-error: Individual page scan failed
 * - discovery: New URL discovered
 * - auth-status: Authentication result
 * - complete: Audit finished with full results
 * - error: Audit failed
 * - cancelled: Audit was cancelled
 */
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { jobManager, type JobEvent } from "@/lib/scanner/crawler/job-manager";
import { assertCrawlJobAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { jobId } = await params;
  const job = jobManager.getJob(jobId);
  if (!job) {
    return new Response("Job not found", { status: 404 });
  }

  // Ownership check (IDOR guard): don't stream another tenant's live audit.
  const access = await assertCrawlJobAccess(jobId, session, {
    workspaceId: job.config.workspaceId ?? null,
    userId: job.config.userId ?? null,
  });
  if (!access.ok) {
    return new Response(access.error, { status: access.status });
  }

  // If job is already complete, send single event and close
  if (["complete", "failed", "cancelled"].includes(job.status)) {
    const encoder = new TextEncoder();
    const body = encoder.encode(
      `data: ${JSON.stringify({
        type: job.status === "complete" ? "complete" : job.status === "cancelled" ? "cancelled" : "error",
        ...(job.result ? { result: job.result } : {}),
        ...(job.error ? { error: job.error } : {}),
        timestamp: Date.now(),
      })}\n\n`
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Stream live events
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send current progress as initial event
      controller.enqueue(encoder.encode(
        `data: ${JSON.stringify({ type: "progress", progress: job.progress, timestamp: Date.now() })}\n\n`
      ));

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      // Subscribe to job events
      const unsubscribe = jobManager.subscribe(jobId, (event: JobEvent) => {
        try {
          // For complete events, strip screenshots to reduce SSE payload size
          let payload = event;
          if (event.type === "complete" && event.result) {
            payload = {
              ...event,
              result: {
                ...event.result,
                pages: event.result.pages.map((p) => ({
                  ...p,
                  screenshot: p.screenshot ? "[available]" : undefined,
                })),
                auth: event.result.auth
                  ? { ...event.result.auth, proof: event.result.auth.proof ? "[available]" : undefined }
                  : undefined,
              },
            };
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

          // Close stream on terminal events
          if (["complete", "error", "cancelled"].includes(event.type)) {
            clearInterval(heartbeat);
            unsubscribe();
            controller.close();
          }
        } catch {
          clearInterval(heartbeat);
          unsubscribe();
        }
      });

      // Cleanup on client disconnect
      _request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
