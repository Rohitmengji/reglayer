/**
 * RegLayer — Executive Dashboard API
 *
 * WHY: Executives/portfolio managers need a bird's-eye view across all monitored sites.
 * WHAT: Aggregated compliance metrics, risk distribution, trends, and site rankings.
 * HOW: Queries all scans in workspace, groups by site, computes trends and distributions.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { requireFeature } from "@/lib/features/require-feature";

export async function GET() {
  const guard = await requireFeature("executive");
  if (!guard.allowed) return guard.response;

  try {
    // guard already resolved user + workspace — no duplicate queries
    const { userId, workspaceId, isMasterAdmin } = guard;

    const scopeFilter = isMasterAdmin && workspaceId
      ? { workspaceId }
      : { userId };

    // 12-week window for the trend chart + bounded site rankings.
    const now = new Date();
    const trendWindowStart = new Date(now);
    trendWindowStart.setDate(trendWindowStart.getDate() - 12 * 7);

    // Bounded recent set (mirrors trends/dashboard take:500 pattern) used for
    // weekly trend + site rankings — NOT for portfolio-wide totals.
    const recentScans = await prisma.scan.findMany({
      where: {
        status: "COMPLETED",
        ...scopeFilter,
        createdAt: { gte: trendWindowStart },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        createdAt: true,
      },
    });

    // Portfolio-wide totals come from an aggregate, not in-memory reduction,
    // so the biggest tenants don't load every scan into memory.
    const portfolioAgg = await prisma.scan.aggregate({
      where: { status: "COMPLETED", ...scopeFilter },
      _avg: { score: true },
      _sum: { totalViolations: true },
      _count: true,
    });
    const portfolioAvgScore = portfolioAgg._avg.score !== null
      ? Math.round(portfolioAgg._avg.score)
      : 0;
    const portfolioTotalScans = portfolioAgg._count;
    const portfolioTotalViolations = portfolioAgg._sum.totalViolations ?? 0;

    // Group by site (hostname)
    const siteMap = new Map<string, typeof recentScans>();
    for (const scan of recentScans) {
      let hostname: string;
      try {
        hostname = new URL(scan.url).hostname;
      } catch {
        hostname = scan.url;
      }
      if (!siteMap.has(hostname)) siteMap.set(hostname, []);
      siteMap.get(hostname)!.push(scan);
    }

    // Site rankings (latest score per site)
    const siteRankings = Array.from(siteMap.entries()).map(([hostname, scans]) => {
      const latest = scans[0]; // Already sorted desc
      const scores = scans.map((s) => s.score).filter((s): s is number => s !== null);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const latestScore = latest.score ?? 0;
      const prevScore = scans.length > 1 ? (scans[1].score ?? latestScore) : latestScore;
      const trend = Math.round((latestScore - prevScore) * 10) / 10;
      const totalViolations = scans.reduce((sum, s) => sum + (s.totalViolations ?? 0), 0);

      return {
        hostname,
        latestScore,
        avgScore,
        trend,
        scanCount: scans.length,
        totalViolations,
        lastScanned: latest.createdAt,
        url: latest.url,
      };
    });

    // Sort by score ascending (worst first for attention)
    siteRankings.sort((a, b) => a.latestScore - b.latestScore);

    // Compliance distribution
    const complianceBuckets = { critical: 0, needsWork: 0, passing: 0, excellent: 0 };
    for (const site of siteRankings) {
      if (site.latestScore < 50) complianceBuckets.critical++;
      else if (site.latestScore < 70) complianceBuckets.needsWork++;
      else if (site.latestScore < 90) complianceBuckets.passing++;
      else complianceBuckets.excellent++;
    }

    // Trend over time (weekly averages for last 12 weeks)
    const weeklyTrend: { week: string; avgScore: number; scanCount: number }[] = [];
    for (let w = 11; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - (w + 1) * 7);
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - w * 7);

      const weekScans = recentScans.filter((s) => {
        const d = new Date(s.createdAt);
        return d >= weekStart && d < weekEnd;
      });

      const weekScores = weekScans.map((s) => s.score).filter((s): s is number => s !== null);
      weeklyTrend.push({
        week: weekStart.toISOString().slice(0, 10),
        avgScore: weekScores.length ? Math.round(weekScores.reduce((a, b) => a + b, 0) / weekScores.length) : 0,
        scanCount: weekScans.length,
      });
    }

    // Top violations across all scans
    const violationStats = await prisma.violation.groupBy({
      by: ["ruleId", "impact"],
      where: { scan: scopeFilter },
      _count: { ruleId: true },
      orderBy: { _count: { ruleId: "desc" } },
      take: 10,
    });

    // Impact distribution
    const impactDist = await prisma.violation.groupBy({
      by: ["impact"],
      where: { scan: scopeFilter },
      _count: { impact: true },
    });

    const impactDistribution: Record<string, number> = {};
    for (const v of impactDist) {
      if (v.impact) impactDistribution[v.impact] = v._count.impact;
    }

    return NextResponse.json({
      portfolio: {
        totalSites: siteRankings.length,
        totalScans: portfolioTotalScans,
        avgScore: portfolioAvgScore,
        totalViolations: portfolioTotalViolations,
        complianceBuckets,
      },
      siteRankings: siteRankings.slice(0, 20),
      weeklyTrend,
      topViolations: violationStats.map((v) => ({
        ruleId: v.ruleId,
        impact: v.impact,
        count: v._count.ruleId,
      })),
      impactDistribution,
    });
  } catch {
    return NextResponse.json({ error: "Failed to load executive dashboard" }, { status: 500 });
  }
}
