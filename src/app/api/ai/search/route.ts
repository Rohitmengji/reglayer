/**
 * RegLayer — AI Semantic Search API
 *
 * POST /api/ai/search
 *
 * Searches violations by semantic similarity using pgvector embeddings.
 * Unlike keyword search, this finds results by meaning — "color contrast
 * issues" matches "insufficient foreground-to-background ratio."
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { searchViolations } from "@/lib/ai/vector/search";
import { isAIAvailable } from "@/lib/ai/gateway";

const searchSchema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(50).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  scanId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAIAvailable()) {
    return NextResponse.json(
      { error: "AI features are not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const results = await searchViolations(parsed.data.query, {
      limit: parsed.data.limit,
      minSimilarity: parsed.data.minSimilarity,
      scanId: parsed.data.scanId,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    console.error("[ai-search] Error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}
