/**
 * GET /api/scan/[scanId]/stream
 *
 * Server-Sent Events endpoint for real-time scan progress.
 * Streams progress updates as the scan runs.
 *
 * WHY: Users need immediate feedback during scans (10-60 seconds).
 * SSE is simpler than WebSocket for unidirectional data and works
 * through most proxies/CDNs without configuration.
 *
 * HOW: Opens a long-lived response with text/event-stream content type.
 * Polls the scan record every 500ms and pushes updates when state changes.
 * Auto-closes when scan completes or client disconnects.
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userEmail = session.user.email;

  const { scanId } = await params;

  // Verify scan belongs to user's workspace (not just the creator)
  // This allows team members to view scan progress for shared workspace scans
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { memberships: { select: { workspaceId: true } } },
  });

  const workspaceIds = user?.memberships.map((m) => m.workspaceId) ?? [];

  const scan = await prisma.scan.findFirst({
    where: {
      id: scanId,
      OR: [
        { user: { email: userEmail } },
        { workspaceId: { in: workspaceIds } },
      ],
    },
    select: { id: true, status: true },
  });

  if (!scan) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      // Send initial state
      send({ status: "connecting", percentage: 0 });

      let lastStatus = "";
      let lastScore: number | null = null;
      let iterations = 0;
      const maxIterations = 120; // 60 seconds max (500ms intervals)

      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        iterations++;
        if (iterations > maxIterations) {
          send({ status: "failed", message: "Scan timed out" });
          clearInterval(interval);
          controller.close();
          closed = true;
          return;
        }

        try {
          // Re-verify workspace membership on every poll to prevent IDOR if
          // user is removed from workspace while stream is open.
          const current = await prisma.scan.findFirst({
            where: {
              id: scanId,
              OR: [
                { user: { email: userEmail } },
                { workspaceId: { in: workspaceIds } },
              ],
            },
            select: {
              status: true,
              score: true,
              totalViolations: true,
              metadata: true,
            },
          });

          if (!current) {
            send({ status: "failed", message: "Scan not found" });
            clearInterval(interval);
            controller.close();
            closed = true;
            return;
          }

          // Only send if something changed
          const statusChanged = current.status !== lastStatus || current.score !== lastScore;
          if (statusChanged) {
            lastStatus = current.status ?? "";
            lastScore = current.score;

            const meta = (current.metadata as Record<string, unknown> | null) ?? {};
            const totalPages = (meta.totalPages as number) ?? 1;
            const pagesScanned = (meta.pagesScanned as number) ?? 0;
            const percentage = totalPages > 0 ? Math.round((pagesScanned / totalPages) * 100) : 0;

            send({
              status: current.status === "COMPLETED" ? "complete" : current.status === "FAILED" ? "failed" : "scanning",
              percentage: current.status === "COMPLETED" ? 100 : percentage,
              pagesScanned,
              totalPages,
              issuesFound: current.totalViolations ?? 0,
              currentUrl: (meta.currentUrl as string) ?? undefined,
              score: current.score ?? undefined,
            });

            if (current.status === "COMPLETED" || current.status === "FAILED") {
              clearInterval(interval);
              controller.close();
              closed = true;
            }
          }
        } catch {
          // DB error — don't crash the stream
        }
      }, 500);

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Nginx buffering bypass
    },
  });
}
