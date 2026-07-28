/**
 * RegLayer — AI Timeline API
 *
 * GET /api/ai/timeline — Fetch unified activity feed from all AI subsystems
 *
 * Aggregates: AiEvents, ChatConversations, AgentConversations, Scans, Workflows, Decisions
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/database/prisma";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";

interface TimelineEvent {
  id: string;
  type: "chat" | "agent" | "scan" | "workflow" | "decision" | "alert" | "knowledge";
  action: string;
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  actor: string;
  status: "success" | "error" | "pending" | "info";
  createdAt: string;
}

// Only chat/agent/scan sources are actually aggregated today (see below) —
// an unrecognized `type` gets a clean 400 instead of silently returning [].
const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  type: z.enum(["chat", "agent", "scan"]).nullish(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-timeline");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Read-only feed — any workspace member should see their own activity.
  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) return NextResponse.json({ events: [] });

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten().fieldErrors }, { status: 400 });
  }
  const { page, limit, type } = parsedQuery.data;
  const offset = (page - 1) * limit;

  const events: TimelineEvent[] = [];
  const workspaceId = perm.ctx.workspaceId;

  try {
    // Fetch from multiple sources in parallel
    const [aiEvents, conversations, scans, agentRuns] = await Promise.all([
    // AI Events (chat completions, tool calls)
    prisma.aiEvent.findMany({
      where: {
        workspaceId,
        ...(type === "chat" ? { feature: { contains: "chat" } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        feature: true,
        model: true,
        provider: true,
        inputTokens: true,
        outputTokens: true,
        costUsd: true,
        latencyMs: true,
        success: true,
        createdAt: true,
      },
    }),
    // Chat Conversations
    prisma.chatConversation.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: Math.min(limit, 10),
      skip: offset > 0 ? Math.floor(offset / 3) : 0,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    // Scans
    prisma.scan.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 10),
      skip: offset > 0 ? Math.floor(offset / 3) : 0,
      select: {
        id: true,
        url: true,
        score: true,
        totalViolations: true,
        status: true,
        createdAt: true,
      },
    }),
    // Agent Conversations
    prisma.agentConversation.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 10),
      skip: offset > 0 ? Math.floor(offset / 3) : 0,
      select: {
        id: true,
        blueprintId: true,
        status: true,
        createdAt: true,
      },
    }),
  ]);

  // Map AI events
  if (!type || type === "chat") {
    for (const e of aiEvents) {
      events.push({
        id: `ai-${e.id}`,
        type: "chat",
        action: "ai.completion",
        title: `AI ${e.feature} completion`,
        description: `${e.model} via ${e.provider} — ${e.inputTokens + e.outputTokens} tokens`,
        metadata: {
          model: e.model ?? "unknown",
          tokens: (e.inputTokens ?? 0) + (e.outputTokens ?? 0),
          cost: `$${(e.costUsd ?? 0).toFixed(4)}`,
          latency: `${e.latencyMs ?? 0}ms`,
        },
        actor: "AI",
        status: e.success ? "success" : "error",
        createdAt: e.createdAt.toISOString(),
      });
    }
  }

  // Map conversations
  if (!type || type === "chat") {
    for (const c of conversations) {
      events.push({
        id: `conv-${c.id}`,
        type: "chat",
        action: "conversation.active",
        title: c.title || "Chat conversation",
        description: "Active conversation",
        metadata: {},
        actor: "User",
        status: "info",
        createdAt: c.updatedAt.toISOString(),
      });
    }
  }

  // Map scans
  if (!type || type === "scan") {
    for (const s of scans) {
      events.push({
        id: `scan-${s.id}`,
        type: "scan",
        action: `scan.${s.status?.toLowerCase() ?? "created"}`,
        title: `Scan: ${s.url}`,
        description: `Score: ${s.score ?? "pending"} · ${s.totalViolations ?? 0} violations`,
        metadata: {
          score: s.score,
          violations: s.totalViolations,
        },
        actor: "Scanner",
        status: s.status === "COMPLETED" ? "success" : s.status === "FAILED" ? "error" : "pending",
        createdAt: s.createdAt.toISOString(),
      });
    }
  }

  // Map agent runs
  if (!type || type === "agent") {
    for (const a of agentRuns) {
      events.push({
        id: `agent-${a.id}`,
        type: "agent",
        action: "agent.run",
        title: `Agent: ${a.blueprintId}`,
        description: `Status: ${a.status}`,
        metadata: { blueprintId: a.blueprintId },
        actor: "Agent",
        status: a.status === "COMPLETED" ? "success" : a.status === "FAILED" ? "error" : "pending",
        createdAt: a.createdAt.toISOString(),
      });
    }
  }

  // Sort all events by date descending
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Apply limit
  const paginatedEvents = events.slice(0, limit);

    return NextResponse.json({ events: paginatedEvents, page, hasMore: events.length >= limit });
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
