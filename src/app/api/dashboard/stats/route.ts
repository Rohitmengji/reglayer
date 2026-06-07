/**
 * RegLayer — Dashboard Stats API
 *
 * WHY: Dashboard page needs aggregated metrics (total scans, avg score, top violations).
 * WHAT: GET returns { totalScans, avgScore, totalViolations, sitesMonitored, trend, recentScans, topViolations }.
 * HOW: Queries Prisma for user's workspace scans, aggregates counts and averages.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/dashboard/stats
 * 
 * Returns aggregated dashboard statistics:
 * - Total scans, average score, total violations
 * - Score trend (last 7 days vs previous 7 days)
 * - Recent scans list
 * - Top violations by frequency
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
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

  const [totalScans, recentScans, violationStats] = await Promise.all([
    prisma.scan.count({ where: { status: "COMPLETED", ...scopeFilter } }),
    prisma.scan.findMany({
      where: { status: "COMPLETED", ...scopeFilter },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        url: true,
        score: true,
        createdAt: true,
        _count: { select: { violations: true } },
      },
    }),
    prisma.violation.groupBy({
      by: ["ruleId", "impact"],
      where: { scan: scopeFilter },
      _count: { ruleId: true },
      orderBy: { _count: { ruleId: "desc" } },
      take: 10,
    }),
  ]);

  // Calculate averages
  const scores = recentScans.map((s) => s.score).filter((s): s is number => s !== null);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const totalViolations = recentScans.reduce((sum, s) => sum + s._count.violations, 0);

  // Score trend: compare last 5 vs previous 5
  const recent5 = scores.slice(0, 5);
  const prev5 = scores.slice(5, 10);
  const recentAvg = recent5.length > 0 ? recent5.reduce((a, b) => a + b, 0) / recent5.length : 0;
  const prevAvg = prev5.length > 0 ? prev5.reduce((a, b) => a + b, 0) / prev5.length : recentAvg;
  const trend = recentAvg - prevAvg;

  // Sites monitored (unique URLs)
  const uniqueUrls = new Set(recentScans.map((s) => {
    try { return new URL(s.url).hostname; } catch { return s.url; }
  }));

  return NextResponse.json({
    totalScans,
    avgScore,
    totalViolations,
    sitesMonitored: uniqueUrls.size,
    trend: Math.round(trend * 10) / 10,
    recentScans: recentScans.map((s) => ({
      id: s.id,
      url: s.url,
      score: s.score,
      violations: s._count.violations,
      date: s.createdAt,
    })),
    topViolations: violationStats.map((v) => ({
      ruleId: v.ruleId,
      impact: v.impact,
      count: v._count.ruleId,
    })),
  });
  } catch {
    return NextResponse.json(
      { error: "Failed to load dashboard stats", totalScans: 0, avgScore: 0, totalViolations: 0, sitesMonitored: 0, trend: 0, recentScans: [], topViolations: [] },
      { status: 500 }
    );
  }
}
