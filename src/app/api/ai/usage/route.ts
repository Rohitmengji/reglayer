/**
 * RegLayer — AI Usage API
 *
 * GET /api/ai/usage
 *
 * Returns AI usage metrics: total cost, tokens, requests, breakdown by feature.
 * Powers the cost dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { getUsageSummary, getCostByFeature, getDailyUsage } from "@/lib/ai/observability/service";
import { prisma } from "@/lib/database/prisma";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get("days") ?? "30", 10);

  // Resolve workspace
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  const membership = user ? await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  }) : null;

  const workspaceId = membership?.workspaceId ?? undefined;

  const [summary, byFeature, daily] = await Promise.all([
    getUsageSummary({ workspaceId, days }),
    getCostByFeature({ workspaceId, days }),
    getDailyUsage({ workspaceId, days }),
  ]);

  return NextResponse.json({ summary, byFeature, daily });
}
