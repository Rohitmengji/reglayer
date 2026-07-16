/**
 * RegLayer — AI Usage API
 *
 * GET /api/ai/usage
 *
 * Returns AI usage metrics: total cost, tokens, requests, breakdown by feature,
 * breakdown by model, and previous-period comparison for delta indicators.
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
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") ?? "30", 10)));

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

  // Current period + previous period (for delta comparison)
  const [summary, prevSummary, byFeature, byModel, daily] = await Promise.all([
    getUsageSummary({ workspaceId, days }),
    getUsageSummary({ workspaceId, days, offset: days }), // previous period
    getCostByFeature({ workspaceId, days }),
    getCostByModel({ workspaceId, days }),
    getDailyUsage({ workspaceId, days }),
  ]);

  return NextResponse.json({ summary, prevSummary, byFeature, byModel, daily });
}

// ── Model-level cost breakdown ────────────────────────────────────────────────

async function getCostByModel(options: { workspaceId?: string; days: number }) {
  const since = new Date();
  since.setDate(since.getDate() - options.days);

  const results = await prisma.aiEvent.groupBy({
    by: ["model", "provider"],
    where: {
      createdAt: { gte: since },
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
    _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    _count: true,
    _avg: { latencyMs: true },
    orderBy: { _sum: { costUsd: "desc" } },
  });

  return results.map((r) => ({
    model: r.model,
    provider: r.provider,
    cost: r._sum.costUsd ?? 0,
    inputTokens: r._sum.inputTokens ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
    requests: r._count,
    avgLatencyMs: Math.round(r._avg.latencyMs ?? 0),
  }));
}
