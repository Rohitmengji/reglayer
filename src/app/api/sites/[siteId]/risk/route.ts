/**
 * RegLayer — Site Risk Score API
 *
 * GET: Returns latest LitigationRiskScore for a site
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { siteId } = await params;

    const riskScore = await prisma.litigationRiskScore.findFirst({
      where: { siteId },
      orderBy: { calculatedAt: "desc" },
    });

    if (!riskScore) {
      return NextResponse.json({
        score: null,
        message: "No risk score calculated yet. Run a scan first.",
      });
    }

    return NextResponse.json({ score: riskScore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
