/**
 * RegLayer — Organizational Accessibility Memory API
 *
 * GET /api/ai/org-memory — institutional recall of past verified fixes.
 *   ?violationId=…              → recall for one violation
 *   ?ruleId=…&selector=…        → recall for an explicit rule + selector
 *   ?scanId=…                   → all OPEN violations the org has fixed before
 *
 * Grounds the AI's "we've solved this before — reuse it?" prompt in the
 * workspace's own verified fix history.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import {
  recallFixForViolation,
  recallFixForRuleSelector,
  recallForScan,
} from "@/lib/memory/orgAccessibilityMemory";

const querySchema = z
  .object({
    violationId: z.string().min(1).optional(),
    scanId: z.string().min(1).optional(),
    ruleId: z.string().min(1).max(100).optional(),
    selector: z.string().max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .refine((q) => q.violationId || q.scanId || q.ruleId, {
    message: "Provide violationId, scanId, or ruleId",
  });

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-org-memory");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ recalls: [] });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    violationId: url.searchParams.get("violationId") ?? undefined,
    scanId: url.searchParams.get("scanId") ?? undefined,
    ruleId: url.searchParams.get("ruleId") ?? undefined,
    selector: url.searchParams.get("selector") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { violationId, scanId, ruleId, selector, limit } = parsed.data;
  const workspaceId = perm.ctx.workspaceId;

  if (scanId) {
    const recalls = await recallForScan(scanId, workspaceId, { limit });
    return NextResponse.json({ recalls }, { headers: rateLimitHeaders(rl) });
  }

  if (violationId) {
    const recall = await recallFixForViolation(workspaceId, violationId);
    if (!recall) return NextResponse.json({ error: "Violation not found" }, { status: 404 });
    return NextResponse.json({ recall }, { headers: rateLimitHeaders(rl) });
  }

  // ruleId (+ optional selector)
  const recall = await recallFixForRuleSelector(workspaceId, ruleId!, selector ?? null);
  return NextResponse.json({ recall }, { headers: rateLimitHeaders(rl) });
}
