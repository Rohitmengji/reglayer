/**
 * RegLayer — Site Risk Recalculate API
 *
 * POST: Force recalculation of risk score with new context
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { calculateLitigationRisk, INDUSTRY_MULTIPLIERS, GEO_MULTIPLIERS } from "@/lib/risk/legalRiskEngine";
import { assertSiteAccess } from "@/lib/auth/access";
import { z } from "zod";

const recalculateSchema = z.object({
  industry: z.string().refine((v) => v in INDUSTRY_MULTIPLIERS, "Invalid industry"),
  primaryGeo: z.string().refine((v) => v in GEO_MULTIPLIERS, "Invalid geography"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;

    // Ownership check — the caller must own the site before recalculating risk.
    const access = await assertSiteAccess(siteId, session);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json();
    const parsed = recalculateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Find latest completed scan for this site
    const latestScan = await prisma.scan.findFirst({
      where: { siteId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      select: { id: true },
    });

    if (!latestScan) {
      return NextResponse.json(
        { error: "No completed scan found for this site" },
        { status: 404 }
      );
    }

    const score = await calculateLitigationRisk(latestScan.id, parsed.data);

    return NextResponse.json({ score });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
