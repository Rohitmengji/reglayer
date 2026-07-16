/**
 * POST /api/v1/workflow — Run a workflow
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { runWorkflow } from "@/lib/ai/workflows/runner";
import { getWorkflow } from "@/lib/ai/workflows/registry";
import type { WorkflowId } from "@/lib/ai/workflows/types";

export const maxDuration = 60;

const workflowSchema = z.object({
  workflowId: z.string().min(1),
  input: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "workflow");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = workflowSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  let definition;
  try {
    definition = getWorkflow(parsed.data.workflowId as WorkflowId);
  } catch {
    return apiError("Workflow not found", "not_found", 404);
  }

  try {
    const result = await runWorkflow(definition, parsed.data.input, {
      userId: auth.ctx.userId,
      workspaceId: auth.ctx.workspaceId,
    });

    auditLog(auth.ctx, "/v1/workflow", "POST", Date.now() - start, 200);

    return apiResponse({
      workflowId: parsed.data.workflowId,
      runId: result.runId,
      status: result.status,
      completedSteps: result.completedSteps,
      data: result.data,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Workflow failed", "workflow_error", 500);
  }
}
