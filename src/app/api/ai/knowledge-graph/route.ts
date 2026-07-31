/**
 * RegLayer — Accessibility Knowledge Graph API
 *
 * GET /api/ai/knowledge-graph?insight=component-risk|component-volume|regressions
 *
 * Answers cross-scan questions no single scan can:
 *   - component-risk    → which component carries the most legal risk
 *   - component-volume  → which component fails most often
 *   - regressions       → which WCAG rule keeps coming back after fixes
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import {
  getComponentRiskRanking,
  getComponentViolationRanking,
  getRegressionProneRules,
} from "@/lib/ai/graph/knowledge-graph";

const querySchema = z.object({
  insight: z.enum(["component-risk", "component-volume", "regressions"]).default("component-risk"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-knowledge-graph");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ insight: "component-risk", results: [] });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    insight: url.searchParams.get("insight") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { insight, limit } = parsed.data;
  const workspaceId = perm.ctx.workspaceId;

  const results =
    insight === "component-volume"
      ? await getComponentViolationRanking(workspaceId, { limit })
      : insight === "regressions"
        ? await getRegressionProneRules(workspaceId, { limit })
        : await getComponentRiskRanking(workspaceId, { limit });

  return NextResponse.json({ insight, results }, { headers: rateLimitHeaders(rl) });
}
