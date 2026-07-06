/**
 * RegLayer — Adversarial Accessibility Agents API
 *
 * POST /api/agents/run — Launch an adversarial agent run
 * GET  /api/agents/run — List runs for the workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { executeAgentRun } from "@/lib/agents/runner";
import { PERSONA_CONSTRAINTS } from "@/lib/agents/personas";
import { validateScanUrl } from "@/lib/validations/ssrf";
import { z } from "zod";

export const dynamic = "force-dynamic";

const launchSchema = z.object({
  siteId: z.string().min(1),
  persona: z.enum(["KEYBOARD", "SCREEN_READER", "MOTOR", "LOW_VISION", "COGNITIVE"]),
  goal: z.string().min(5).max(500),
  startUrl: z.string().url().max(2000),
});

/**
 * GET /api/agents/run — List recent agent runs
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Adversarial Agent testing requires a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const siteId = searchParams.get("siteId");
  const persona = searchParams.get("persona");

  const runs = await prisma.agentRun.findMany({
    where: {
      workspaceId: member.workspace.id,
      ...(siteId ? { siteId } : {}),
      ...(persona ? { persona: persona as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { steps: { orderBy: { stepIndex: "asc" }, take: 30 } },
  });

  return NextResponse.json({
    runs,
    personas: Object.entries(PERSONA_CONSTRAINTS).map(([id, c]) => ({
      id,
      label: c.label,
      description: c.description,
    })),
  });
}

/**
 * POST /api/agents/run — Launch a new adversarial agent test
 *
 * The agent runs asynchronously (detached promise) — the endpoint returns
 * the run ID immediately so the client can poll for results.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.workspaceMember.findFirst({
    where: { user: { email: session.user.email } },
    include: { workspace: true },
  });
  if (!member) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (member.workspace.plan === "FREE") {
    return NextResponse.json(
      { error: "Adversarial Agent testing requires a Pro or Enterprise plan", upgradeRequired: true },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { siteId, persona, goal, startUrl } = parsed.data;

  // SSRF guard on the start URL
  const ssrfErr = validateScanUrl(startUrl);
  if (ssrfErr) {
    return NextResponse.json({ error: ssrfErr }, { status: 400 });
  }

  // Verify site belongs to workspace
  const site = await prisma.site.findFirst({
    where: { id: siteId, workspaceId: member.workspace.id },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found in workspace" }, { status: 404 });
  }

  // Create the run record
  const run = await prisma.agentRun.create({
    data: {
      workspaceId: member.workspace.id,
      siteId,
      persona,
      goal,
      startUrl,
      status: "QUEUED",
      scheduledBy: "manual",
    },
  });

  // Execute asynchronously — don't block the response
  executeAgentRun({
    runId: run.id,
    workspaceId: member.workspace.id,
    siteId,
    persona,
    goal,
    startUrl,
  }).catch((err) => {
    // If the runner itself crashes, mark the run as FAILED
    prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        failureReason: `Runner crashed: ${err instanceof Error ? err.message : "Unknown"}`,
        completedAt: new Date(),
      },
    }).catch(() => {});
  });

  return NextResponse.json({
    run: { id: run.id, status: "QUEUED", persona, goal },
    message: `Agent launched. ${PERSONA_CONSTRAINTS[persona].label} will attempt: "${goal}"`,
  }, { status: 202 });
}
