/**
 * RegLayer — Revenue Impact API
 *
 * WHY: Business stakeholders need to understand the financial cost of inaccessibility.
 * WHAT: GET calculates estimated revenue loss from accessibility barriers.
 * HOW: Uses traffic data + bounce rates + disability statistics to estimate lost conversions.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { assertScanAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/database/prisma";
import { calculateRevenueImpact } from "@/lib/analytics/revenue-calculator";
import { z } from "zod";

/**
 * Revenue Impact Calculator API
 *
 * POST /api/revenue-impact
 * Calculate estimated revenue loss from accessibility issues.
 *
 * GET /api/revenue-impact?scanId=<id>
 * Calculate from an existing scan (uses stored violation data).
 */

const impactSchema = z.object({
  scanId: z.string().optional(),
  traffic: z.object({
    monthlyVisitors: z.number().positive(),
    avgOrderValue: z.number().positive().optional(),
    conversionRate: z.number().min(0).max(1).optional(),
    monthlyRevenue: z.number().positive().optional(),
    bounceRate: z.number().min(0).max(1).optional(),
    currency: z.string().length(3).default("USD"),
  }),
  region: z.enum(["US", "UK", "EU", "AU", "CA", "GLOBAL"]).default("GLOBAL"),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = impactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { scanId, traffic, region } = parsed.data;

  // Get accessibility data from scan or estimate
  let accessibilityData;

  if (scanId) {
    // IDOR guard: only the scan's owner/workspace may use it for impact analysis.
    const access = await assertScanAccess(scanId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: {
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
      },
    });

    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    accessibilityData = {
      score: scan.score ?? 0,
      totalViolations: scan.totalViolations ?? 0,
      critical: scan.critical ?? 0,
      serious: scan.serious ?? 0,
      moderate: scan.moderate ?? 0,
      minor: scan.minor ?? 0,
    };
  } else {
    // Use most recent scan for the user's workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { user: { email: session.user.email } },
      select: { workspaceId: true },
    });

    if (!membership?.workspaceId) {
      return NextResponse.json(
        { error: "No scan data available. Run a scan first or provide a scanId." },
        { status: 400 }
      );
    }

    const latestScan = await prisma.scan.findFirst({
      where: { workspaceId: membership.workspaceId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: {
        score: true,
        totalViolations: true,
        critical: true,
        serious: true,
        moderate: true,
        minor: true,
      },
    });

    if (!latestScan) {
      return NextResponse.json(
        { error: "No completed scans found. Run a scan first." },
        { status: 400 }
      );
    }

    accessibilityData = {
      score: latestScan.score ?? 0,
      totalViolations: latestScan.totalViolations ?? 0,
      critical: latestScan.critical ?? 0,
      serious: latestScan.serious ?? 0,
      moderate: latestScan.moderate ?? 0,
      minor: latestScan.minor ?? 0,
    };
  }

  const result = calculateRevenueImpact(traffic, accessibilityData, region);

  return NextResponse.json({
    ...result,
    accessibility: accessibilityData,
    traffic: {
      monthlyVisitors: traffic.monthlyVisitors,
      currency: traffic.currency,
    },
    region,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const scanId = request.nextUrl.searchParams.get("scanId");
  const monthlyVisitors = parseInt(request.nextUrl.searchParams.get("visitors") || "10000", 10);
  const currency = request.nextUrl.searchParams.get("currency") || "USD";
  const region = request.nextUrl.searchParams.get("region") || "GLOBAL";

  if (!scanId) {
    return NextResponse.json(
      { error: "Missing 'scanId' parameter" },
      { status: 400 }
    );
  }

  // IDOR guard: only the scan's owner/workspace may use it for impact analysis.
  const access = await assertScanAccess(scanId, session);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: {
      score: true,
      totalViolations: true,
      critical: true,
      serious: true,
      moderate: true,
      minor: true,
    },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  const accessibilityData = {
    score: scan.score ?? 0,
    totalViolations: scan.totalViolations ?? 0,
    critical: scan.critical ?? 0,
    serious: scan.serious ?? 0,
    moderate: scan.moderate ?? 0,
    minor: scan.minor ?? 0,
  };

  const result = calculateRevenueImpact(
    { monthlyVisitors, currency },
    accessibilityData,
    region
  );

  return NextResponse.json({
    ...result,
    accessibility: accessibilityData,
    scanId,
    timestamp: new Date().toISOString(),
  });
}
