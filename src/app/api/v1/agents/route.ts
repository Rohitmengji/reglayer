/**
 * GET  /api/v1/agents — List agents
 * POST /api/v1/agents — Run an agent
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { listBlueprints } from "@/lib/ai/marketplace/registry";
import { runConversation } from "@/lib/ai/a2a/protocol";

const runSchema = z.object({
  agentSlug: z.string().min(1),
  task: z.string().min(1).max(5000),
});

export async function GET(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "agents");
  if (!auth.ok) return auth.response;

  const category = request.nextUrl.searchParams.get("category") ?? undefined;
  const agents = await listBlueprints({
    workspaceId: auth.ctx.workspaceId,
    category,
  });

  auditLog(auth.ctx, "/v1/agents", "GET", Date.now() - start, 200);

  return apiResponse({
    agents: agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      category: a.category,
      model: a.model,
      isSystem: a.isSystem,
      tools: a.tools,
    })),
    count: agents.length,
  });
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "agents");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  try {
    const conversation = await runConversation({
      agentSlug: parsed.data.agentSlug,
      task: parsed.data.task,
      userId: auth.ctx.userId,
      workspaceId: auth.ctx.workspaceId,
    });

    auditLog(auth.ctx, "/v1/agents", "POST", Date.now() - start, 200);

    return apiResponse({
      conversationId: conversation.id,
      status: conversation.status,
      messages: conversation.messages.map((m) => ({
        role: m.role,
        content: m.content,
        agent: m.fromAgentSlug,
        costUsd: m.costUsd,
      })),
      totalCostUsd: conversation.totalCostUsd,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Agent failed", "agent_error", 500);
  }
}
