/**
 * POST /api/v1/search — Hybrid search (dense + sparse + keyword)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { hybridSearch } from "@/lib/ai/search/hybrid";

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional().default(10),
  scanId: z.string().optional(),
  rerank: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const auth = await gatewayAuth(request, "search");
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  const results = await hybridSearch(parsed.data.query, {
    limit: parsed.data.limit,
    scanId: parsed.data.scanId,
    workspaceId: auth.ctx.workspaceId,
    rerank: parsed.data.rerank,
  });

  auditLog(auth.ctx, "/v1/search", "POST", Date.now() - start, 200);

  return apiResponse({
    results: results.map((r) => ({
      id: r.id,
      ruleId: r.ruleId,
      impact: r.impact,
      description: r.description,
      help: r.help,
      wcagCriteria: r.wcagCriteria,
      score: r.score,
      sources: r.sources,
    })),
    count: results.length,
  });
}
