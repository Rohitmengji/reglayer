/**
 * RegLayer — Workflow Execution API
 *
 * POST /api/ai/workflow
 *
 * Triggers a workflow by ID with input parameters.
 * Returns the final workflow state (including results or error).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { runWorkflow } from "@/lib/ai/workflows/runner";
import { getWorkflow } from "@/lib/ai/workflows/registry";
import { isAIAvailable } from "@/lib/ai/gateway";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const workflowRequestSchema = z.object({
  workflowId: z.enum(["compliance-audit", "remediation-plan", "scan-and-report"]),
  input: z.record(z.string(), z.unknown()),
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

  const parsed = workflowRequestSchema.safeParse(body);
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

  try {
    const workflow = getWorkflow(parsed.data.workflowId);
    const result = await runWorkflow(workflow, parsed.data.input, {
      userId: user?.id ?? session.user.email,
      workspaceId: membership?.workspaceId ?? null,
    });

    return NextResponse.json({
      runId: result.runId,
      status: result.status,
      completedSteps: result.completedSteps,
      result: result.data.summary ?? result.data,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow execution failed" },
      { status: 500 },
    );
  }
}
