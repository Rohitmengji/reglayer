/**
 * RegLayer — Scans List API
 *
 * WHY: Frontend needs to fetch paginated scan history for the current user's workspace.
 * WHAT: GET returns scans with pagination, filtering by date/URL/score. Ordered by createdAt DESC.
 * HOW: Authenticates via session, queries Prisma with workspace scope, returns JSON array with total count.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit")) || 50));
    const url = request.nextUrl.searchParams.get("url");

    // Scope: users see only their own scans; master admins see all workspace scans
    // (single query — membership rides along instead of a second round trip)
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

    const membership = user.memberships[0];

    // Master admins see all scans in their workspace; regular users see only their own
    const scopeFilter = user.isMasterAdmin && membership
      ? { workspaceId: membership.workspaceId }
      : { userId: user.id };

    const where = {
      ...(url ? { url, status: "COMPLETED" as const } : {}),
      ...scopeFilter,
    };

    const scans = await prisma.scan.findMany({
      where,
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
        compliance: true,
        pageTitle: true,
        duration: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(
      { scans, count: scans.length },
      { headers: { "Cache-Control": "private, max-age=15" } }
    );
  } catch {
    return NextResponse.json({ error: "Failed to load scans", scans: [] }, { status: 500 });
  }
}
