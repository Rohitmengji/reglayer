/**
 * RegLayer — Agent Orchestration API
 *
 * POST /api/ai/agents
 *
 * Triggers multi-agent orchestration for complex accessibility tasks.
 * The planner agent decomposes the request, specialists execute, reviewer combines.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { orchestrate } from "@/lib/ai/agents/orchestrator";
import { isAIAvailable } from "@/lib/ai/gateway";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const agentRequestSchema = z.object({
  request: z.string().min(5).max(2000),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.ai);
  if (!rl.success) {
    return new Response("Too many requests", { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!isAIAvailable()) {
    return NextResponse.json({ error: "AI not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

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

  const plan = await orchestrate(parsed.data.request, {
    userId: user?.id ?? session.user.email,
    workspaceId: membership?.workspaceId ?? null,
  });

  // Extract the final useful output (reviewer's or last agent's)
  const finalOutput = plan.results.length > 1
    ? plan.results[plan.results.length - 1]?.output
    : plan.results[0]?.output;

  return NextResponse.json({
    status: plan.status,
    agentSequence: plan.agentSequence,
    result: finalOutput,
    agents: plan.results.map((r) => ({
      id: r.agentId,
      success: r.success,
      durationMs: r.durationMs,
      outputLength: r.output.length,
    })),
    totalDurationMs: plan.totalDurationMs,
  });
}
