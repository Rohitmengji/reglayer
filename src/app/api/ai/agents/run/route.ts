/**
 * RegLayer — AI Blueprint Agent Run API (Session Auth)
 *
 * POST /api/ai/agents/run — Execute a blueprint agent with a task description
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const runSchema = z.object({
  agentSlug: z.string().min(1).max(100),
  task: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("scans.read");
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
    const { runConversation } = await import("@/lib/ai/a2a/protocol");

    const result = await runConversation({
      agentSlug: parsed.data.agentSlug,
      task: parsed.data.task,
      userId: perm.ctx.userId ?? session.user.email,
      workspaceId: perm.ctx.workspaceId ?? "",
    });

    // Extract the last agent message as the output
    const agentMessages = result.messages.filter((m) => m.role === "AGENT");
    const output = agentMessages.length > 0
      ? agentMessages[agentMessages.length - 1].content
      : "Agent completed with no output.";

    return NextResponse.json({
      output,
      conversationId: result.id,
      turns: result.messages.length,
      status: result.status,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Agent execution failed",
    }, { status: 500 });
  }
}
