/**
 * RegLayer — In-app notification feed (read-only)
 *
 * WHY: A returning user has no at-a-glance surface for "what happened" — that
 * only lived in email + webhooks. This powers the header notification bell.
 *
 * WHAT: GET returns a unified, time-sorted list of recent events derived from
 * data that ALREADY exists — completed scans, their critical issue counts, and
 * workspace audit-log activity — gated by the user's existing
 * NotificationPreference flags. No new table, no writes: unread state is tracked
 * client-side via a localStorage `lastSeenAt` timestamp.
 *
 * HOW: Mirrors the auth + workspace-scoping pattern of /api/scans and
 * /api/audit-log. Sibling segment to /api/notifications — that route is untouched.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getOrCreateWorkspace } from "@/lib/database/workspace";

export interface NotificationItem {
  id: string;
  type: "scan" | "violation" | "activity";
  title: string;
  body: string;
  href: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
}

const FEED_LIMIT = 20;

function humanizeAction(action: string): string {
  // "member.invited" → "Member invited"
  const text = action.replace(/[._]/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        isMasterAdmin: true,
        memberships: { select: { workspaceId: true }, take: 1 },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const workspaceId =
      user.memberships[0]?.workspaceId ??
      (await getOrCreateWorkspace(user.id, session.user.email));

    // Read existing preferences (no write). Default everything on if absent.
    const prefs = await prisma.notificationPreference.findUnique({
      where: { userId: user.id },
      select: { scanComplete: true, newViolations: true, teamActivity: true },
    });
    const wantScans = prefs?.scanComplete ?? true;
    const wantViolations = prefs?.newViolations ?? true;
    const wantActivity = prefs?.teamActivity ?? true;

    const scopeFilter =
      user.isMasterAdmin && workspaceId ? { workspaceId } : { userId: user.id };

    const items: NotificationItem[] = [];

    if (wantScans || wantViolations) {
      const scans = await prisma.scan.findMany({
        where: { ...scopeFilter, status: "COMPLETED" as const },
        select: {
          id: true,
          url: true,
          score: true,
          critical: true,
          serious: true,
          totalViolations: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      });

      for (const scan of scans) {
        const host = (() => {
          try {
            return new URL(scan.url).host;
          } catch {
            return scan.url;
          }
        })();

        if (wantScans) {
          const score = scan.score != null ? Math.round(scan.score) : null;
          items.push({
            id: `scan-${scan.id}`,
            type: "scan",
            title: "Scan completed",
            body: score != null ? `${host} scored ${score}/100` : host,
            href: `/scans/${scan.id}`,
            createdAt: scan.createdAt.toISOString(),
            severity: score != null && score < 70 ? "warning" : "info",
          });
        }

        if (wantViolations && scan.critical > 0) {
          items.push({
            id: `violation-${scan.id}`,
            type: "violation",
            title: `${scan.critical} critical issue${scan.critical === 1 ? "" : "s"} found`,
            body: host,
            href: `/scans/${scan.id}`,
            createdAt: scan.createdAt.toISOString(),
            severity: "critical",
          });
        }
      }
    }

    if (wantActivity && workspaceId) {
      const logs = await prisma.auditLog.findMany({
        where: { workspaceId },
        select: { id: true, action: true, target: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 15,
      });

      for (const log of logs) {
        items.push({
          id: `activity-${log.id}`,
          type: "activity",
          title: humanizeAction(log.action),
          body: log.target ? `Re: ${log.target}` : "Workspace activity",
          href: "/audit-log",
          createdAt: log.createdAt.toISOString(),
          severity: "info",
        });
      }
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({ items: items.slice(0, FEED_LIMIT) });
  } catch {
    return NextResponse.json({ error: "Failed to load notifications", items: [] }, { status: 500 });
  }
}
