/**
 * ---------------------------------------------------------
 * RegLayer — Analytics Engine
 * ---------------------------------------------------------
 * 
 * Deep analytics over scan history:
 * - Score trends over time
 * - Violation pattern detection
 * - Score forecasting (linear regression)
 * - Top recurring issues
 * - Fix velocity tracking
 * - Site health scoring
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";
import { computeViolationVelocity } from "@/lib/intelligence/velocity";

export interface AnalyticsReport {
  period: { start: string; end: string; days: number };
  overview: {
    totalScans: number;
    uniqueUrls: number;
    averageScore: number;
    medianScore: number;
    bestScore: number;
    worstScore: number;
    totalViolationsFound: number;
    averageViolationsPerScan: number;
  };
  trend: {
    direction: "improving" | "declining" | "stable";
    changePerWeek: number;
    dataPoints: Array<{ date: string; score: number; scans: number }>;
  };
  forecast: {
    nextWeekScore: number;
    nextMonthScore: number;
    weeksTo90: number | null; // null if already above or declining
    confidence: number; // 0-1
  };
  topViolations: Array<{
    ruleId: string;
    count: number;
    impact: string;
    avgAffectedElements: number;
    firstSeen: string;
    lastSeen: string;
    trend: "increasing" | "decreasing" | "stable";
  }>;
  velocityMetrics: {
    scansPerDay: number;
    violationsFixedPerWeek: number;
    newViolationsPerWeek: number;
    netChangePerWeek: number;
  };
  urlBreakdown: Array<{
    url: string;
    scans: number;
    latestScore: number;
    trend: "improving" | "declining" | "stable";
    topIssue: string | null;
  }>;
}

/**
 * Generate comprehensive analytics report.
 */
export async function generateAnalytics(
  days: number = 30,
  workspaceId?: string
): Promise<AnalyticsReport> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const where = {
    status: "COMPLETED" as const,
    createdAt: { gte: since },
    ...(workspaceId ? { workspaceId } : {}),
  };

  // Fetch all scans in period
  const scans = await prisma.scan.findMany({
    where,
    select: {
      id: true,
      url: true,
      score: true,
      totalViolations: true,
      critical: true,
      serious: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (scans.length === 0) {
    return emptyReport(since, days);
  }

  // Overview
  const scores = scans.map((s) => s.score ?? 0);
  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianScore = sortedScores[Math.floor(sortedScores.length / 2)];
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const uniqueUrls = new Set(scans.map((s) => s.url)).size;
  const totalViolations = scans.reduce((sum, s) => sum + s.totalViolations, 0);

  // Trend: group by day
  const dailyMap = new Map<string, { scores: number[]; count: number }>();
  for (const scan of scans) {
    const day = scan.createdAt.toISOString().split("T")[0];
    const existing = dailyMap.get(day) || { scores: [], count: 0 };
    existing.scores.push(scan.score ?? 0);
    existing.count++;
    dailyMap.set(day, existing);
  }

  const dataPoints = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      score: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
      scans: data.count,
    }));

  // Linear regression for trend
  const { slope, rSquared } = linearRegression(
    dataPoints.map((_, i) => i),
    dataPoints.map((d) => d.score)
  );

  const changePerWeek = Math.round(slope * 7 * 10) / 10;
  const direction: "improving" | "declining" | "stable" =
    changePerWeek > 1 ? "improving" : changePerWeek < -1 ? "declining" : "stable";

  // Forecast
  const latestScore = scores[scores.length - 1];
  const nextWeekScore = Math.min(100, Math.max(0, Math.round((latestScore + slope * 7) * 10) / 10));
  const nextMonthScore = Math.min(100, Math.max(0, Math.round((latestScore + slope * 30) * 10) / 10));

  let weeksTo90: number | null = null;
  if (latestScore < 90 && slope > 0) {
    weeksTo90 = Math.ceil((90 - latestScore) / (slope * 7));
    if (weeksTo90 > 52) weeksTo90 = null; // More than a year = unrealistic
  }

  // Top violations
  const violations = await prisma.violation.findMany({
    where: { scan: where },
    select: { ruleId: true, impact: true, affectedElements: true, scan: { select: { createdAt: true } } },
  });

  const violationCounts = new Map<string, { count: number; impact: string; elements: number[]; dates: Date[] }>();
  for (const v of violations) {
    const existing = violationCounts.get(v.ruleId) || { count: 0, impact: v.impact, elements: [], dates: [] };
    existing.count++;
    existing.elements.push(Array.isArray(v.affectedElements) ? (v.affectedElements as unknown[]).length : 1);
    existing.dates.push(v.scan.createdAt);
    violationCounts.set(v.ruleId, existing);
  }

  const topViolations = Array.from(violationCounts.entries())
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10)
    .map(([ruleId, data]) => {
      const sortedDates = data.dates.sort((a, b) => a.getTime() - b.getTime());
      const midpoint = Math.floor(sortedDates.length / 2);
      const firstHalfCount = midpoint;
      const secondHalfCount = sortedDates.length - midpoint;
      const trend: "increasing" | "decreasing" | "stable" =
        secondHalfCount > firstHalfCount * 1.2 ? "increasing" :
        secondHalfCount < firstHalfCount * 0.8 ? "decreasing" : "stable";

      return {
        ruleId,
        count: data.count,
        impact: data.impact,
        avgAffectedElements: Math.round(data.elements.reduce((a, b) => a + b, 0) / data.elements.length),
        firstSeen: sortedDates[0].toISOString(),
        lastSeen: sortedDates[sortedDates.length - 1].toISOString(),
        trend,
      };
    });

  // Velocity metrics
  const scansPerDay = scans.length / days;
  const weeklyViolations = totalViolations / (days / 7);

  // URL breakdown
  const urlMap = new Map<string, typeof scans>();
  for (const scan of scans) {
    const existing = urlMap.get(scan.url) || [];
    existing.push(scan);
    urlMap.set(scan.url, existing);
  }

  // Real fix/introduction velocity — diff each URL's scan series over time
  // (scans are fetched createdAt-asc, so each URL group is already chronological).
  const velocity = computeViolationVelocity(Array.from(urlMap.values()), days / 7);

  const urlBreakdown = Array.from(urlMap.entries())
    .map(([url, urlScans]) => {
      const urlScores = urlScans.map((s) => s.score ?? 0);
      const { slope: urlSlope } = linearRegression(
        urlScores.map((_, i) => i),
        urlScores
      );
      return {
        url,
        scans: urlScans.length,
        latestScore: urlScores[urlScores.length - 1],
        trend: (urlSlope > 0.5 ? "improving" : urlSlope < -0.5 ? "declining" : "stable") as "improving" | "declining" | "stable",
        topIssue: null as string | null, // filled below
      };
    })
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 20);

  return {
    period: { start: since.toISOString(), end: new Date().toISOString(), days },
    overview: {
      totalScans: scans.length,
      uniqueUrls,
      averageScore: Math.round(averageScore * 10) / 10,
      medianScore: Math.round(medianScore * 10) / 10,
      bestScore: Math.max(...scores),
      worstScore: Math.min(...scores),
      totalViolationsFound: totalViolations,
      averageViolationsPerScan: Math.round((totalViolations / scans.length) * 10) / 10,
    },
    trend: { direction, changePerWeek, dataPoints },
    forecast: {
      nextWeekScore,
      nextMonthScore,
      weeksTo90,
      confidence: Math.round(rSquared * 100) / 100,
    },
    topViolations,
    velocityMetrics: {
      scansPerDay: Math.round(scansPerDay * 10) / 10,
      violationsFixedPerWeek: velocity.violationsFixedPerWeek,
      // "violations found per week" (the label the UI shows) — total found / weeks,
      // distinct from velocity.violationsIntroducedPerWeek (net rises only).
      newViolationsPerWeek: Math.round(weeklyViolations * 10) / 10,
      netChangePerWeek: velocity.netChangePerWeek,
    },
    urlBreakdown,
  };
}

/**
 * Simple linear regression.
 */
function linearRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] || 0, rSquared: 0 };

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  const ssRes = y.reduce((acc, yi, i) => acc + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const ssTot = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

function emptyReport(since: Date, days: number): AnalyticsReport {
  return {
    period: { start: since.toISOString(), end: new Date().toISOString(), days },
    overview: { totalScans: 0, uniqueUrls: 0, averageScore: 0, medianScore: 0, bestScore: 0, worstScore: 0, totalViolationsFound: 0, averageViolationsPerScan: 0 },
    trend: { direction: "stable", changePerWeek: 0, dataPoints: [] },
    forecast: { nextWeekScore: 0, nextMonthScore: 0, weeksTo90: null, confidence: 0 },
    topViolations: [],
    velocityMetrics: { scansPerDay: 0, violationsFixedPerWeek: 0, newViolationsPerWeek: 0, netChangePerWeek: 0 },
    urlBreakdown: [],
  };
}
