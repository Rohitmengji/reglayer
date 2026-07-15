/**
 * RegLayer — Custom Workflow Builder API
 *
 * POST /api/ai/workflow/custom
 *
 * Accepts a workflow template (JSON), compiles it, and executes it.
 * This enables users to create custom automation without writing code.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { compileWorkflow, type WorkflowTemplate } from "@/lib/ai/workflows/builder";
import { runWorkflow } from "@/lib/ai/workflows/runner";
import { isAIAvailable } from "@/lib/ai/gateway";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/database/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const stepSchema = z.object({
  id: z.string(),
  type: z.enum(["fetch_scan", "ai_generate", "evaluate", "notify", "transform"]),
  name: z.string(),
  config: z.record(z.string(), z.unknown()),
  next: z.union([z.string(), z.object({
    condition: z.string(),
    then: z.string().nullable(),
    else: z.string().nullable(),
  })]).optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  steps: z.array(stepSchema).min(1).max(10),
  entryStep: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
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

  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid template", details: parsed.error.issues }, { status: 400 });
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
    const template: WorkflowTemplate = {
      id: `custom_${Date.now()}`,
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      steps: parsed.data.steps,
      entryStep: parsed.data.entryStep,
    };

    const definition = compileWorkflow(template);
    const result = await runWorkflow(definition, parsed.data.input ?? {}, {
      userId: user?.id ?? session.user.email,
      workspaceId: membership?.workspaceId ?? null,
    });

    return NextResponse.json({
      runId: result.runId,
      status: result.status,
      completedSteps: result.completedSteps,
      data: result.data,
      error: result.error,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Workflow compilation failed" },
      { status: 500 },
    );
  }
}
