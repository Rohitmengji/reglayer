/**
 * RegLayer — AI Root Cause Engine API
 *
 * GET /api/ai/root-cause — trace violations to their shared component roots and
 * rank by fix leverage ("fix once → N pages resolved").
 *   ?siteId=… | ?url=…   optional scope; otherwise the whole workspace.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { analyzeRootCauses } from "@/lib/intelligence/rootCause";

const querySchema = z.object({
  siteId: z.string().min(1).optional(),
  url: z.string().url().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-root-cause");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ scansAnalyzed: 0, totalInstances: 0, distinctRoots: 0, clusters: [], summary: "No workspace." });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    siteId: url.searchParams.get("siteId") ?? undefined,
    url: url.searchParams.get("url") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = await analyzeRootCauses(perm.ctx.workspaceId, parsed.data);
  return NextResponse.json(report, { headers: rateLimitHeaders(rl) });
}
