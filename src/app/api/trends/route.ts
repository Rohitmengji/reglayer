/**
 * RegLayer — URL-based Trends API
 *
 * WHY: The site-based trends API requires a Site record, but scans don't always
 *      create sites. This endpoint returns trend data by querying scans by URL.
 *
 * WHAT:
 *   GET /api/trends?url=<encoded-url>&from=&to=
 *
 * HOW: Queries all COMPLETED scans for a URL, computes score trend,
 *      violation trend, streak, delta, summary. Auth-gated.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

interface ScoreTrendPoint {
  date: string;
  score: number;
  scanId: string;
}

interface ViolationTrendPoint {
  date: string;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const url = searchParams.get("url");
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    if (!url) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "url parameter is required" },
        { status: 400 }
      );
    }

    // Scope: users see only their own scans; master admins see all workspace scans
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, isMasterAdmin: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { workspaceId: true },
    });

    const scopeFilter = user.isMasterAdmin && membership
      ? { workspaceId: membership.workspaceId }
      : { userId: user.id };

    // Build where clause
    const where: Record<string, unknown> = {
      url,
      status: "COMPLETED",
      score: { not: null },
      ...scopeFilter,
    };

    if (fromStr || toStr) {
      const createdAt: Record<string, Date> = {};
      if (fromStr) createdAt.gte = new Date(fromStr);
      if (toStr) createdAt.lte = new Date(toStr);
      where.createdAt = createdAt;
    }

    // Fetch all completed scans for this URL
    const scans = await prisma.scan.findMany({
      where,
      select: {
        id: true,
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    // Score trend
    const scoreTrend: ScoreTrendPoint[] = scans.map((s) => ({
      date: s.createdAt.toISOString(),
      score: s.score ?? 0,
      scanId: s.id,
    }));

    // Violation trend
    const violationTrend: ViolationTrendPoint[] = scans.map((s) => ({
      date: s.createdAt.toISOString(),
      critical: s.critical ?? 0,
      serious: s.serious ?? 0,
      moderate: s.moderate ?? 0,
      minor: s.minor ?? 0,
      total: s.totalViolations ?? 0,
    }));

    // Streak: consecutive scans where score improved or held
    let currentStreak = 0;
    let bestStreak = 0;
    let lastImprovedAt: string | null = null;

    for (let i = 1; i < scans.length; i++) {
      const prev = scans[i - 1].score ?? 0;
      const curr = scans[i].score ?? 0;
      if (curr >= prev) {
        currentStreak++;
        if (curr > prev) {
          lastImprovedAt = scans[i].createdAt.toISOString();
        }
      } else {
        currentStreak = 0;
      }
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    }

    // Delta between two most recent scans
    let delta = null;
    if (scans.length >= 2) {
      const current = scans[scans.length - 1];
      const previous = scans[scans.length - 2];
      delta = {
        scoreDelta: (current.score ?? 0) - (previous.score ?? 0),
        violationDelta: (current.totalViolations ?? 0) - (previous.totalViolations ?? 0),
        criticalDelta: (current.critical ?? 0) - (previous.critical ?? 0),
        previousScore: previous.score ?? 0,
        currentScore: current.score ?? 0,
        previousScanAt: previous.createdAt.toISOString(),
      };
    }

    // Summary
    let summary = null;
    if (scans.length > 0) {
      const scores = scans.map((s) => s.score ?? 0);
      summary = {
        firstScanAt: scans[0].createdAt.toISOString(),
        totalScans: scans.length,
        averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
        peakScore: Math.max(...scores),
        lowestScore: Math.min(...scores),
      };
    }

    return NextResponse.json({
      url,
      scoreTrend,
      violationTrend,
      streak: { currentStreak, bestStreak, lastImprovedAt },
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
