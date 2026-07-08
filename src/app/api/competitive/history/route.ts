/**
 * RegLayer — Competitive Intelligence History API
 *
 * GET /api/competitive/history?competitorId=X&days=90 — Get score history for a competitor
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getCompetitorHistory } from "@/lib/competitive/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const { searchParams } = request.nextUrl;
  const competitorId = searchParams.get("competitorId");
  const days = parseInt(searchParams.get("days") || "90", 10);

  if (!competitorId) {
    return NextResponse.json({ error: "competitorId is required" }, { status: 400 });
  }

  // Verify competitor belongs to workspace
  const competitor = await prisma.competitor.findFirst({
    where: { id: competitorId, workspaceId: member.workspaceId },
  });
  if (!competitor) {
    return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
  }

  const history = await getCompetitorHistory(competitorId, days);
  return NextResponse.json({ history });
}
