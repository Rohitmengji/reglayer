/**
 * RegLayer — Accessibility Copilot API
 *
 * POST /api/ai/copilot — real-time accessibility analysis of a source buffer.
 * Powers editor extensions, pre-commit hooks, and CI checks that can't import
 * the engine directly. Local editors should import `analyzeSource` for zero-latency
 * per-keystroke linting; this endpoint is the network fallback.
 *
 * Body: { source, filename? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeSource } from "@/lib/ai/ide/realtime-analyzer";

const bodySchema = z.object({
  source: z.string().max(200_000),
  filename: z.string().max(400).optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Editor-facing: allow frequent calls but still bound abuse.
  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-copilot");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = analyzeSource(parsed.data.source);
  return NextResponse.json(result, { headers: rateLimitHeaders(rl) });
}
