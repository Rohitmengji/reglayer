/**
 * GET /api/leaderboard — Public accessibility leaderboard
 *
 * Returns top-scoring sites scanned on RegLayer. No auth required.
 * Powers the /leaderboard marketing page for SEO and social proof.
 *
 * Only includes sites scanned at least twice with valid scores.
 * Excludes private/internal URLs.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);

  // Get recent completed scans with scores, group by URL
  const scans = await prisma.scan.findMany({
    where: {
      status: "COMPLETED",
      score: { not: null, gt: 0 },
      url: {
        not: { contains: "localhost" },
      },
    },
    select: {
      url: true,
      score: true,
      completedAt: true,
      pageTitle: true,
    },
    orderBy: { completedAt: "desc" },
    take: 500, // reasonable window
  });

  // Aggregate by URL
  const urlMap = new Map<string, { scores: number[]; lastScanned: Date | null; pageTitle: string | null }>();
  for (const scan of scans) {
    if (!scan.score) continue;
    // Filter internal URLs
    if (scan.url.includes("127.0.0.1") || scan.url.includes("192.168.") || scan.url.includes("10.0.")) continue;

    const existing = urlMap.get(scan.url);
    if (existing) {
      existing.scores.push(scan.score);
      if (scan.completedAt && (!existing.lastScanned || scan.completedAt > existing.lastScanned)) {
        existing.lastScanned = scan.completedAt;
      }
    } else {
      urlMap.set(scan.url, {
        scores: [scan.score],
        lastScanned: scan.completedAt,
        pageTitle: scan.pageTitle,
      });
    }
  }

  // Build leaderboard: only URLs with 2+ scans
  const entries: Array<{
    url: string;
    domain: string;
    name: string | null;
    score: number;
    bestScore: number;
    scans: number;
    improvement: number;
    lastScanned: Date | null;
  }> = [];

  for (const [url, data] of urlMap) {
    if (data.scores.length < 2) continue;

    const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
    const bestScore = Math.max(...data.scores);
    const oldestScore = data.scores[data.scores.length - 1]; // oldest (array is newest-first)
    const newestScore = data.scores[0];
    const improvement = newestScore - oldestScore;

    let domain: string;
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }

    entries.push({
      url,
      domain,
      name: data.pageTitle,
      score: Math.round(avgScore * 10) / 10,
      bestScore: Math.round(bestScore * 10) / 10,
      scans: data.scores.length,
      improvement: Math.round(improvement * 10) / 10,
      lastScanned: data.lastScanned,
    });
  }

  // Sort by best score descending
  entries.sort((a, b) => b.bestScore - a.bestScore);

  const leaderboard = entries.slice(0, limit).map((e, idx) => ({
    rank: idx + 1,
    ...e,
  }));

  return NextResponse.json(
    {
      leaderboard,
      total: leaderboard.length,
      updatedAt: new Date().toISOString(),
    },
    { headers: CACHE_HEADERS }
  );
}
