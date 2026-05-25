import { NextResponse } from "next/server";
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
  const [totalScans, recentScans, violationStats] = await Promise.all([
    prisma.scan.count({ where: { status: "COMPLETED" } }),
    prisma.scan.findMany({
      where: { status: "COMPLETED" },
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
  const uniqueUrls = new Set(recentScans.map((s) => new URL(s.url).hostname));

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
}
