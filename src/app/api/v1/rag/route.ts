/**
 * POST /api/v1/rag — Direct RAG query (non-streaming)
 *
 * Returns a complete answer with citations and retrieval metadata.
 * Use this when you need the full response at once (not streaming).
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { optimizedRetrieve, THOROUGH_PRESET } from "@/lib/ai/retrieval/pipeline";
import { complete, getDefaultModelId, isAIAvailable } from "@/lib/ai/gateway";
import { getPrompt } from "@/lib/ai/prompts/registry";

export const maxDuration = 60;

const requestSchema = z.object({
  query: z.string().min(1).max(5000),
  scanId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "rag");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  if (!isAIAvailable()) return apiError("AI not configured", "ai_unavailable", 503);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  const retrieval = await optimizedRetrieve(parsed.data.query, {
    ...THOROUGH_PRESET,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
    scanId: parsed.data.scanId,
  });

  const modelId = getDefaultModelId();
  if (!modelId) return apiError("No model available", "no_model", 503);

  const systemPrompt = retrieval.context
    ? `${getPrompt("chat-rag").system}\n\n${retrieval.context}`
    : getPrompt("chat-system").system;

  const response = await complete({
    model: modelId,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: parsed.data.query },
    ],
    temperature: 0.3,
    maxTokens: 2000,
    metadata: { feature: "v1-rag", userId: ctx.userId },
  });

  if (!response) return apiError("AI provider unavailable", "provider_error", 503);

  auditLog(ctx, "/v1/rag", "POST", Date.now() - start, 200);

  return apiResponse({
    answer: response.content,
    usage: response.usage,
    cost: response.cost,
    retrieval: {
      cached: retrieval.cached,
      intent: retrieval.intent,
      sourceCount: retrieval.sourceCount,
      tokenCount: retrieval.tokenCount,
      latencyMs: retrieval.totalLatencyMs,
    },
  });
}
