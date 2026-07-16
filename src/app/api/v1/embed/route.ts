/**
 * POST /api/v1/embed — Generate embeddings
 * POST /api/v1/search — Hybrid search
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { gatewayAuth, apiResponse, apiError, auditLog } from "@/lib/api/gateway";
import { embed, isAIAvailable } from "@/lib/ai/gateway";
import { hybridSearch } from "@/lib/ai/search/hybrid";

// ── Embed Endpoint ────────────────────────────────────────────────────────────

const embedSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]).transform((v) => (typeof v === "string" ? [v] : v)),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const path = request.nextUrl.pathname;

  if (path.endsWith("/embed")) return handleEmbed(request, start);
  if (path.endsWith("/search")) return handleSearch(request, start);

  return apiError("Not found", "not_found", 404);
}

async function handleEmbed(request: NextRequest, start: number) {
  const auth = await gatewayAuth(request, "embed");
  if (!auth.ok) return auth.response;

  if (!isAIAvailable()) return apiError("AI not configured", "ai_unavailable", 503);

  let body: unknown;
  try { body = await request.json(); } catch { return apiError("Invalid JSON", "invalid_json", 400); }

  const parsed = embedSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid request", "validation_error", 400);

  const result = await embed({
    input: parsed.data.input.length === 1 ? parsed.data.input[0] : parsed.data.input,
    metadata: { feature: "v1-embed" },
  });

  if (!result) return apiError("Embedding failed", "embed_error", 500);

  auditLog(auth.ctx, "/v1/embed", "POST", Date.now() - start, 200);

  return apiResponse({
    embeddings: result.embeddings,
    usage: result.usage,
  });
}

// ── Search Endpoint ───────────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().min(1).max(2000),
  limit: z.number().int().min(1).max(50).optional().default(10),
  scanId: z.string().optional(),
  rerank: z.boolean().optional().default(false),
});

async function handleSearch(request: NextRequest, start: number) {
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
