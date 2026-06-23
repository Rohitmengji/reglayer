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

  const [scanAgg, recentScans, violationStats, distinctUrls] = await Promise.all([
    // Headline numbers reflect the FULL scoped dataset, not just the last 10.
    prisma.scan.aggregate({
      where: { status: "COMPLETED", ...scopeFilter },
      _avg: { score: true },
      _sum: { totalViolations: true },
      _count: true,
    }),
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
    // Distinct scanned URLs across the FULL dataset — "Sites Monitored" must
    // reflect every unique site, not just whatever appeared in the last 10 scans.
    prisma.scan.groupBy({
      by: ["url"],
      where: { status: "COMPLETED", ...scopeFilter },
    }),
  ]);

  // Headline metrics from the full scoped dataset (aggregate, not last-10).
  const totalScans = scanAgg._count;
  const avgScore = scanAgg._avg.score !== null ? Math.round(scanAgg._avg.score) : 0;
  const totalViolations = scanAgg._sum.totalViolations ?? 0;

  // Score trend is inherently a recent-window comparison: last 5 vs previous 5.
  const scores = recentScans.map((s) => s.score).filter((s): s is number => s !== null);
  const recent5 = scores.slice(0, 5);
  const prev5 = scores.slice(5, 10);
  const recentAvg = recent5.length > 0 ? recent5.reduce((a, b) => a + b, 0) / recent5.length : 0;
  const prevAvg = prev5.length > 0 ? prev5.reduce((a, b) => a + b, 0) / prev5.length : recentAvg;
  const trend = recentAvg - prevAvg;

  // Sites monitored — distinct hostnames across ALL scanned URLs (not last-10).
  const uniqueUrls = new Set(distinctUrls.map((g) => {
    try { return new URL(g.url).hostname; } catch { return g.url; }
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
  } catch (err) {
    console.error("[dashboard/stats] Query failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to load dashboard stats" },
      { status: 500 }
    );
  }
}
