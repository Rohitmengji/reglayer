/**
 * RegLayer — Analytics API
 *
 * WHY: Analytics page needs historical compliance data for trend visualization.
 * WHAT: GET returns score history, violation trends, and improvement metrics over time.
 * HOW: Queries scans for workspace, groups by date, calculates moving averages.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { generateAnalytics } from "@/lib/intelligence/analyticsEngine";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const days = Number(request.nextUrl.searchParams.get("days")) || 30;

  // Scope to user's workspace
  const membership = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    select: { workspaceId: true },
  });
  const workspaceId = membership?.workspaceId;
  // SECURITY: never call generateAnalytics with an undefined workspaceId — the
  // engine treats "no workspaceId" as "no filter" and would return EVERY tenant's
  // scans. A user with no workspace has no analytics.
  if (!workspaceId) {
    return NextResponse.json({ error: "You must belong to a workspace to view analytics." }, { status: 403 });
  }

  try {
    const report = await generateAnalytics(days, workspaceId);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Analytics failed" },
      { status: 500 }
    );
  }
}
