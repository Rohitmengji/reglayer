/**
 * RegLayer — Workflows API (Session Auth)
 *
 * POST /api/workflows — Execute a workflow definition
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const runSchema = z.object({
  workflowId: z.enum(["compliance-audit", "remediation-plan", "scan-and-report"]),
  input: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("scans.run");
  if (!perm.ok) return perm.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const { getWorkflow } = await import("@/lib/ai/workflows/registry");
    const { runWorkflow } = await import("@/lib/ai/workflows/runner");

    const workflow = getWorkflow(parsed.data.workflowId);
    const result = await runWorkflow(
      workflow,
      parsed.data.input ?? {},
      {
        userId: perm.ctx.userId ?? session.user.email,
        workspaceId: perm.ctx.workspaceId ?? null,
      },
    );

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Workflow execution failed",
    }, { status: 500 });
  }
}
