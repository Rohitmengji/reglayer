/**
 * RegLayer — Historical Trend Analytics
 *
 * WHY: Users need to SEE that their work matters. Without visible progress,
 *      they lose motivation after the first fix session.
 *
 * WHAT: Data utilities that compute score trends, violation trends,
 *       improvement streaks, and deltas from the existing Scans table.
 *
 * HOW: Queries prisma.scan with proper select/ordering. Groups by day
 *      when data is dense. Pure data functions — no HTTP concerns.
 */

import { prisma } from "@/lib/database/prisma";

// ─────────────── Types ───────────────

export interface ScoreTrendPoint {
  date: string;
  score: number;
  scanId: string;
}

export interface ViolationTrendPoint {
  date: string;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
}

export interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastImprovedAt: string | null;
}

export interface ScoreDelta {
  scoreDelta: number;
  violationDelta: number;
  criticalDelta: number;
  previousScore: number;
  currentScore: number;
  previousScanAt: string;
}

export interface TrendSummary {
  firstScanAt: string;
  totalScans: number;
  averageScore: number;
  peakScore: number;
  lowestScore: number;
}

export interface TrendOptions {
  from?: Date;
  to?: Date;
  limit?: number;
}

// ─────────────── Score Trend ───────────────

/**
 * Returns AIS score over time for a given site.
 * Groups by day if > 30 data points (takes daily latest scan).
 *
 * @param siteId - The site to query trends for
 * @param options - Optional date range and limit
 * @returns Ordered array of score data points (ASC by date)
 */
export async function getSiteScoreTrend(
  siteId: string,
  options?: TrendOptions
): Promise<ScoreTrendPoint[]> {
  const where: Record<string, unknown> = {
    siteId,
    status: "COMPLETED",
    score: { not: null },
  };

  if (options?.from || options?.to) {
    const createdAt: Record<string, Date> = {};
    if (options.from) createdAt.gte = options.from;
    if (options.to) createdAt.lte = options.to;
    where.createdAt = createdAt;
  }

  const scans = await prisma.scan.findMany({
    where,
    select: { id: true, score: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: options?.limit ?? 500,
  });

  if (scans.length === 0) return [];

  // If more than 30 data points, group by day (take latest scan per day)
  if (scans.length > 30) {
    const byDay = new Map<string, typeof scans[0]>();
    for (const scan of scans) {
      const dayKey = scan.createdAt.toISOString().split("T")[0];
      byDay.set(dayKey, scan); // Last one per day wins
    }
    return [...byDay.values()].map((s) => ({
      date: s.createdAt.toISOString(),
      score: s.score ?? 0,
      scanId: s.id,
    }));
  }

  return scans.map((s) => ({
    date: s.createdAt.toISOString(),
    score: s.score ?? 0,
    scanId: s.id,
  }));
}

// ─────────────── Violation Trend ───────────────

/**
 * Returns violation counts over time, broken down by impact level.
 *
 * @param siteId - The site to query
 * @param options - Optional date range
 * @returns Ordered array of violation count data points
 */
export async function getViolationTrend(
  siteId: string,
  options?: TrendOptions
): Promise<ViolationTrendPoint[]> {
  const where: Record<string, unknown> = {
    siteId,
    status: "COMPLETED",
  };

  if (options?.from || options?.to) {
    const createdAt: Record<string, Date> = {};
    if (options.from) createdAt.gte = options.from;
    if (options.to) createdAt.lte = options.to;
    where.createdAt = createdAt;
  }

  const scans = await prisma.scan.findMany({
    where,
    select: {
      createdAt: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return scans.map((s) => ({
    date: s.createdAt.toISOString(),
    critical: s.critical ?? 0,
    serious: s.serious ?? 0,
    moderate: s.moderate ?? 0,
    minor: s.minor ?? 0,
    total: s.totalViolations ?? 0,
  }));
}

// ─────────────── Improvement Streak ───────────────

/**
 * Returns a "streak" — consecutive scans where score improved or held.
 * Broken when score drops (even by 1 point).
 *
 * @param siteId - The site to analyze
 * @returns Current streak, best streak, and last improvement date
 */
export async function getImprovementStreak(
  siteId: string
): Promise<StreakData> {
  const scans = await prisma.scan.findMany({
    where: { siteId, status: "COMPLETED", score: { not: null } },
    select: { score: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (scans.length < 2) {
    return { currentStreak: 0, bestStreak: 0, lastImprovedAt: null };
  }

  let currentStreak = 0;
  let bestStreak = 0;
  let lastImprovedAt: Date | null = null;

  for (let i = 1; i < scans.length; i++) {
    const prev = scans[i - 1].score ?? 0;
    const curr = scans[i].score ?? 0;

    if (curr >= prev) {
      currentStreak++;
      if (curr > prev) {
        lastImprovedAt = scans[i].createdAt;
      }
    } else {
      // Score dropped — streak broken
      currentStreak = 0;
    }

    if (currentStreak > bestStreak) {
      bestStreak = currentStreak;
    }
  }

  return {
    currentStreak,
    bestStreak,
    lastImprovedAt: lastImprovedAt?.toISOString() ?? null,
  };
}

// ─────────────── Score Delta ───────────────

/**
 * Returns delta between two most recent completed scans.
 *
 * @param siteId - The site to compare
 * @returns Score and violation deltas, or null if insufficient data
 */
export async function getScoreDelta(
  siteId: string
): Promise<ScoreDelta | null> {
  const recentScans = await prisma.scan.findMany({
    where: { siteId, status: "COMPLETED", score: { not: null } },
    select: {
      score: true,
      totalViolations: true,
      critical: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  if (recentScans.length < 2) return null;

  const current = recentScans[0];
  const previous = recentScans[1];

  return {
    scoreDelta: (current.score ?? 0) - (previous.score ?? 0),
    violationDelta: (current.totalViolations ?? 0) - (previous.totalViolations ?? 0),
    criticalDelta: (current.critical ?? 0) - (previous.critical ?? 0),
    previousScore: previous.score ?? 0,
    currentScore: current.score ?? 0,
    previousScanAt: previous.createdAt.toISOString(),
  };
}

// ─────────────── Summary ───────────────

/**
 * Returns overall trend summary stats for a site.
 *
 * @param siteId - The site to summarize
 * @returns Aggregate statistics
 */
export async function getTrendSummary(
  siteId: string
): Promise<TrendSummary | null> {
  const stats = await prisma.scan.aggregate({
    where: { siteId, status: "COMPLETED", score: { not: null } },
    _count: { id: true },
    _avg: { score: true },
    _max: { score: true },
    _min: { score: true, createdAt: true },
  });

  if (!stats._count.id || stats._count.id === 0) return null;

  return {
    firstScanAt: stats._min.createdAt?.toISOString() ?? "",
    totalScans: stats._count.id,
    averageScore: Math.round(stats._avg.score ?? 0),
    peakScore: Math.round(stats._max.score ?? 0),
    lowestScore: Math.round(stats._min.score ?? 0),
  };
}
