/**
 * POST /api/v1/evaluate — Submit feedback
 * GET  /api/v1/evaluate — Get feedback analysis
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { recordFeedback, analyzeFeedback, getLearningOverview } from "@/lib/ai/learning/service";

const feedbackSchema = z.object({
  rating: z.number().int().min(-1).max(5),
  comment: z.string().max(2000).optional(),
  category: z.enum(["accuracy", "relevance", "helpfulness", "tone"]).optional(),
  feature: z.string().min(1),
  messageId: z.string().optional(),
  promptId: z.string().optional(),
  model: z.string().optional(),
  query: z.string().max(5000).optional(),
  response: z.string().max(10000).optional(),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "evaluate");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  const id = await recordFeedback({
    ...parsed.data,
    userId: auth.ctx.userId,
    workspaceId: auth.ctx.workspaceId,
  });

  auditLog(auth.ctx, "/v1/evaluate", "POST", Date.now() - start, 201);
  return apiResponse({ id, recorded: true }, 201);
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "evaluate");
  if (!auth.ok) return auth.response;

  const promptId = request.nextUrl.searchParams.get("promptId");

  if (promptId) {
    const analysis = await analyzeFeedback(promptId);
    auditLog(auth.ctx, "/v1/evaluate", "GET", Date.now() - start, 200);
    return apiResponse(analysis);
  }

  const overview = await getLearningOverview();
  auditLog(auth.ctx, "/v1/evaluate", "GET", Date.now() - start, 200);
  return apiResponse(overview);
}
