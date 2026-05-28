/**
 * RegLayer — Certificate API
 *
 * WHY: Users want embeddable compliance certificates for their websites.
 * WHAT: GET returns certificate data (score, standard, date, URL) for rendering.
 * HOW: Queries scan by ID, verifies it exists, returns structured certificate info.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database/prisma";

/**
 * GET /api/certificate/[id]
 * 
 * Generates a verifiable compliance certificate for a scan.
 * Can be shared publicly as proof of accessibility compliance.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const scan = await prisma.scan.findUnique({
    where: { id },
    include: { violations: true },
  });

  if (!scan || scan.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Scan not found or not completed" },
      { status: 404 }
    );
  }

  const criticalCount = scan.critical ?? 0;
  const seriousCount = scan.serious ?? 0;
  const score = scan.score ?? 0;

  // Determine compliance level
  let level: "gold" | "silver" | "bronze" | "in-progress";
  if (score >= 95 && criticalCount === 0 && seriousCount === 0) {
    level = "gold";
  } else if (score >= 85 && criticalCount === 0) {
    level = "silver";
  } else if (score >= 70) {
    level = "bronze";
  } else {
    level = "in-progress";
  }

  const certificate = {
    id: scan.id,
    url: scan.url,
    issuedAt: scan.createdAt,
    expiresAt: new Date(new Date(scan.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
    level,
    score,
    standard: "EN 301 549 V3.2.1",
    wcagLevel: "AA",
    violations: {
      critical: criticalCount,
      serious: seriousCount,
      moderate: scan.moderate ?? 0,
      minor: scan.minor ?? 0,
      total: scan.violations.length,
    },
    verificationUrl: `https://reglayer.vercel.app/certificate/${scan.id}`,
  };

  return NextResponse.json(certificate);
}
