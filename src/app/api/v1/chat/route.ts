/**
 * POST /api/v1/chat — Streaming AI chat
 *
 * Enterprise endpoint with full retrieval pipeline:
 * Cache → Intent → Hybrid Search + Graph RAG → Compress → Stream LLM
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiError, auditLog } from "@/lib/api/gateway";
import { optimizedRetrieve, BALANCED_PRESET } from "@/lib/ai/retrieval/pipeline";
import { stream, getDefaultModelId, isAIAvailable } from "@/lib/ai/gateway";
import { getPrompt } from "@/lib/ai/prompts/registry";
import { containsPII, sanitizeForLLM } from "@/lib/ai/hardening";
import { toTextStream } from "ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(10_000),
  })).min(1).max(50),
  model: z.string().optional(),
  stream: z.boolean().optional().default(true),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "chat");
  if (!auth.ok) return auth.response;
  const { ctx } = auth;

  if (!isAIAvailable()) return apiError("AI not configured", "ai_unavailable", 503);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  // Sanitize PII
  const messages = parsed.data.messages.map((m) =>
    m.role === "user" && containsPII(m.content) ? { ...m, content: sanitizeForLLM(m.content) } : m
  );

  // Retrieve context
  const latestMsg = messages.filter((m) => m.role === "user").pop()?.content ?? "";
  const retrieval = await optimizedRetrieve(latestMsg, {
    ...BALANCED_PRESET,
    workspaceId: ctx.workspaceId,
    userId: ctx.userId,
  });

  // Build augmented messages
  const systemPrompt = retrieval.context
    ? `${getPrompt("chat-rag").system}\n\n${retrieval.context}`
    : getPrompt("chat-system").system;

  const llmMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages,
  ];

  const modelId = getDefaultModelId();
  if (!modelId) return apiError("No model available", "no_model", 503);

  const result = stream({
    model: modelId,
    messages: llmMessages,
    temperature: 0.4,
    maxTokens: 2000,
    metadata: { feature: "v1-chat", userId: ctx.userId },
  });

  if (!result) return apiError("AI provider unavailable", "provider_error", 503);

  auditLog(ctx, "/v1/chat", "POST", Date.now() - start, 200);

  return new Response(toTextStream(result), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-API-Version": "v1",
    },
  });
}
