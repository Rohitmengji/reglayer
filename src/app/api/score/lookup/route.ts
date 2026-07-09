/**
 * GET /api/score/lookup?url=<encoded-url> — Public accessibility score lookup
 *
 * No auth required. Returns the latest known accessibility score for a URL.
 * Only returns data from scans that have already been performed.
 * Does NOT trigger new scans (prevents abuse).
 *
 * Rate limited: 60 requests/minute per IP.
 *
 * Use cases:
 * - Third-party integrations checking a site's score
 * - SEO tools embedding accessibility data
 * - Marketing: "Check any site's accessibility score"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "url parameter is required", example: "/api/score/lookup?url=https://example.com" },
      { status: 400 }
    );
  }

  // Normalize URL for lookup
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
    normalizedUrl = "https://" + normalizedUrl;
  }
  normalizedUrl = normalizedUrl.replace(/\/+$/, "");

  // Find latest completed scan for this URL (across all workspaces — public data)
  const latestScan = await prisma.scan.findFirst({
    where: {
      url: normalizedUrl,
      status: "COMPLETED",
      score: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: {
      score: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
      pageTitle: true,
      completedAt: true,
    },
  });

  // Also try with trailing slash variant
  if (!latestScan) {
    const altUrl = normalizedUrl + "/";
    const altScan = await prisma.scan.findFirst({
      where: {
        url: altUrl,
        status: "COMPLETED",
        score: { not: null },
      },
      orderBy: { completedAt: "desc" },
      select: {
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
        pageTitle: true,
        completedAt: true,
      },
    });

    if (!altScan) {
      return NextResponse.json(
        {
          found: false,
          url: normalizedUrl,
          message: "No scan data found for this URL. Scan it on RegLayer to get a score.",
          scanUrl: `https://reglayer.com/dashboard`,
        },
        { status: 404, headers: CACHE_HEADERS }
      );
    }

    return NextResponse.json(
      formatResponse(normalizedUrl, altScan),
      { headers: CACHE_HEADERS }
    );
  }

  return NextResponse.json(
    formatResponse(normalizedUrl, latestScan),
    { headers: CACHE_HEADERS }
  );
}

function formatResponse(
  url: string,
  scan: {
    score: number | null;
    totalViolations: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    pageTitle: string | null;
    completedAt: Date | null;
  }
) {
  const score = scan.score || 0;
  let grade: string;
  if (score >= 95) grade = "A+";
  else if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    found: true,
    url,
    score: Math.round(score * 10) / 10,
    grade,
    violations: {
      total: scan.totalViolations,
      critical: scan.critical,
      serious: scan.serious,
      moderate: scan.moderate,
      minor: scan.minor,
    },
    pageTitle: scan.pageTitle,
    lastScanned: scan.completedAt?.toISOString() || null,
    badge: `https://reglayer.com/api/badge?url=${encodeURIComponent(url)}`,
    reportUrl: `https://reglayer.com/dashboard`,
  };
}
