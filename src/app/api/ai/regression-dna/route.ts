/**
 * RegLayer — Accessibility Regression DNA API
 *
 * GET /api/ai/regression-dna?siteId=…|url=… — reconstruct each violation's
 * appear→fix→return lineage across scan history and predict what will regress
 * next sprint.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { computeSiteRegressionDNA } from "@/lib/intelligence/regressionDNA";

const querySchema = z
  .object({
    siteId: z.string().min(1).optional(),
    url: z.string().url().optional(),
    sprintDays: z.coerce.number().int().min(1).max(90).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((q) => q.siteId || q.url, { message: "Provide siteId or url" });

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-regression-dna");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ scansAnalyzed: 0, dna: [], predictions: [] });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    siteId: url.searchParams.get("siteId") ?? undefined,
    url: url.searchParams.get("url") ?? undefined,
    sprintDays: url.searchParams.get("sprintDays") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { siteId, url: siteUrl, sprintDays, limit } = parsed.data;

  const result = await computeSiteRegressionDNA(perm.ctx.workspaceId, {
    siteId,
    url: siteUrl,
    sprintDays,
    limit,
  });

  return NextResponse.json(result, { headers: rateLimitHeaders(rl) });
}
