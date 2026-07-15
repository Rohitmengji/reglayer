/**
 * RegLayer — AI Observability Service
 *
 * WHY:  Console logs vanish. This persists every AI event to the database
 *       for cost tracking, latency monitoring, and usage analytics.
 *
 * WHAT:
 *   - Persists gateway events (completions, embeddings) to ai_events table
 *   - Provides aggregate queries for dashboards (cost by feature, by user, by day)
 *   - Non-blocking: writes are fire-and-forget (never slows AI responses)
 *
 * HOW TO USE:
 *   Register `persistEventHandler` with the gateway at app startup.
 *   Query usage via getUsageSummary(), getCostByFeature(), etc.
 */

import "server-only";

import { prisma } from "@/lib/database/prisma";
import type { GatewayEvent, GatewayEventHandler } from "@/lib/ai/gateway/types";

// ── Event Persistence ─────────────────────────────────────────────────────────

/**
 * Gateway event handler that persists events to the database.
 * Register with: onGatewayEvent(persistEventHandler)
 */
export const persistEventHandler: GatewayEventHandler = async (event: GatewayEvent) => {
  try {
    await prisma.aiEvent.create({
      data: {
        type: event.type,
        feature: event.request.feature,
        model: event.response.model,
        provider: event.response.provider,
        inputTokens: event.response.usage.inputTokens,
        outputTokens: event.response.usage.outputTokens,
        totalTokens: event.response.usage.totalTokens,
        costUsd: event.response.cost.totalCost,
        latencyMs: event.response.latencyMs,
        success: event.response.success,
        error: event.response.error ?? null,
        userId: event.request.userId ?? null,
        workspaceId: event.request.workspaceId ?? null,
      },
    });
  } catch {
    // Never let persistence failures affect the AI response
  }
};

// ── Query Functions (for dashboards) ──────────────────────────────────────────

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  successRate: number;
}

/**
 * Get usage summary for a time period.
 */
export async function getUsageSummary(options?: {
  workspaceId?: string;
  userId?: string;
  days?: number;
}): Promise<UsageSummary> {
  const since = new Date();
  since.setDate(since.getDate() - (options?.days ?? 30));

  const where = {
    createdAt: { gte: since },
    ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
    ...(options?.userId ? { userId: options.userId } : {}),
  };

  const [agg, total] = await Promise.all([
    prisma.aiEvent.aggregate({
      where,
      _sum: { totalTokens: true, costUsd: true },
      _avg: { latencyMs: true },
      _count: true,
    }),
    prisma.aiEvent.count({ where: { ...where, success: true } }),
  ]);

  return {
    totalRequests: agg._count,
    totalTokens: agg._sum.totalTokens ?? 0,
    totalCostUsd: agg._sum.costUsd ?? 0,
    avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
    successRate: agg._count > 0 ? total / agg._count : 1,
  };
}

/**
 * Get cost breakdown by feature.
 */
export async function getCostByFeature(options?: {
  workspaceId?: string;
  days?: number;
}): Promise<{ feature: string; cost: number; requests: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - (options?.days ?? 30));

  const results = await prisma.aiEvent.groupBy({
    by: ["feature"],
    where: {
      createdAt: { gte: since },
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
    _sum: { costUsd: true },
    _count: true,
    orderBy: { _sum: { costUsd: "desc" } },
  });

  return results.map((r) => ({
    feature: r.feature,
    cost: r._sum.costUsd ?? 0,
    requests: r._count,
  }));
}

/**
 * Get daily usage for charting.
 */
export async function getDailyUsage(options?: {
  workspaceId?: string;
  days?: number;
}): Promise<{ date: string; requests: number; tokens: number; cost: number }[]> {
  const days = options?.days ?? 14;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const events = await prisma.aiEvent.findMany({
    where: {
      createdAt: { gte: since },
      ...(options?.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
    select: { createdAt: true, totalTokens: true, costUsd: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by day
  const byDay = new Map<string, { requests: number; tokens: number; cost: number }>();
  for (const event of events) {
    const date = event.createdAt.toISOString().split("T")[0];
    const existing = byDay.get(date) ?? { requests: 0, tokens: 0, cost: 0 };
    existing.requests++;
    existing.tokens += event.totalTokens;
    existing.cost += event.costUsd;
    byDay.set(date, existing);
  }

  return Array.from(byDay.entries()).map(([date, data]) => ({ date, ...data }));
}
