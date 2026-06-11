/**
 * RegLayer — Cron: Weekly Digest
 *
 * WHY: Users who opt into weekly digests need a scheduled summary of their site scores.
 * WHAT: Iterates all workspaces with opted-in members, sends the existing digest template.
 * HOW: Protected by CRON_SECRET (same pattern as run-schedules). Calls sendWeeklyDigest() per workspace.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { sendWeeklyDigest } from "@/lib/emails/weeklyDigest";
import { logger } from "@/lib/telemetry/logger";

const log = logger.withContext({ module: "cron:weekly-digest" });

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    log.warn("Unauthorized weekly-digest cron attempt");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all workspaces that have at least one member with weeklyDigest enabled
    const workspaces = await prisma.workspace.findMany({
      where: {
        members: {
          some: {
            user: {
              id: {
                notIn: await getOptedOutUserIds(),
              },
            },
          },
        },
      },
      select: { id: true, name: true },
    });

    let totalSent = 0;
    const results: { workspaceId: string; name: string; sent: number; error?: string }[] = [];

    for (const ws of workspaces) {
      try {
        const sent = await sendWeeklyDigest(ws.id);
        totalSent += sent;
        results.push({ workspaceId: ws.id, name: ws.name, sent });
      } catch (err) {
        const error = err instanceof Error ? err.message : "Unknown";
        log.error("Digest failed for workspace", { workspaceId: ws.id, error });
        results.push({ workspaceId: ws.id, name: ws.name, sent: 0, error });
      }
    }

    log.info("Weekly digest cron complete", { workspaces: workspaces.length, totalSent });

    return NextResponse.json({
      executedAt: new Date().toISOString(),
      workspacesProcessed: workspaces.length,
      emailsSent: totalSent,
      results,
    });
  } catch (error) {
    log.error("Weekly digest cron failed", {
      error: error instanceof Error ? error.message : "Unknown",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Get user IDs that have explicitly opted out of weekly digest */
async function getOptedOutUserIds(): Promise<string[]> {
  const optedOut = await prisma.notificationPreference.findMany({
    where: { weeklyDigest: false },
    select: { userId: true },
  });
  return optedOut.map((p) => p.userId);
}
