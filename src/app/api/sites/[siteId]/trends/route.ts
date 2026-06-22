/**
 * RegLayer — Site Trends API
 *
 * WHY: The trend dashboard needs a single endpoint that returns all historical
 *      data for a site — score over time, violations over time, streak, delta.
 *
 * WHAT:
 *   GET /api/sites/[siteId]/trends?from=&to=
 *
 * HOW: Delegates to /lib/analytics/trends.ts utilities. Auth-gated by workspace
 *      membership. Returns comprehensive trend data in one response.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireFeature } from "@/lib/features/require-feature";
import {
  getSiteScoreTrend,
  getViolationTrend,
  getImprovementStreak,
  getScoreDelta,
  getTrendSummary,
} from "@/lib/analytics/trends";

/**
 * GET /api/sites/[siteId]/trends
 *
 * Query params:
 *   from — ISO date string (optional, filter start)
 *   to — ISO date string (optional, filter end)
 *
 * Response: { scoreTrend, violationTrend, streak, delta, summary }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const guard = await requireFeature("trends");
    if (!guard.allowed) return guard.response;

    const { siteId } = await params;

    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    if (!siteId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "siteId is required" },
        { status: 400 }
      );
    }

    // Verify site exists and user has access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, workspaceId: true, url: true, name: true },
    });

    if (!site) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: "Site not found" },
        { status: 404 }
      );
    }

    // Auth check — user must be member of site's workspace
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, memberships: { select: { workspaceId: true } } },
    });

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "User not found" },
        { status: 401 }
      );
    }

    const workspaceIds = user.memberships.map((m) => m.workspaceId);
    if (!workspaceIds.includes(site.workspaceId)) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: "You don't have access to this site" },
        { status: 403 }
      );
    }

    // Parse optional date filters
    const { searchParams } = request.nextUrl;
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;

    // Fetch all trend data in parallel
    const [scoreTrend, violationTrend, streak, delta, summary] = await Promise.all([
      getSiteScoreTrend(siteId, { from, to }),
      getViolationTrend(siteId, { from, to }),
      getImprovementStreak(siteId),
      getScoreDelta(siteId),
      getTrendSummary(siteId),
    ]);

    return NextResponse.json({
      siteId,
      siteName: site.name,
      siteUrl: site.url,
      scoreTrend,
      violationTrend,
      streak,
      delta,
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
