/**
 * RegLayer — Accessibility Digital Twin API
 *
 * POST /api/ai/digital-twin — simulate the future state after fixing a chosen
 * set of violations, forecasting score, legal risk, lawsuits, traffic, SEO and
 * revenue impact (with a conservative/likely/optimistic band).
 *
 * Body:
 *   { scanId, violationIds?, strategy?, assumptions? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { runDigitalTwin } from "@/lib/simulator/digitalTwin";

const bodySchema = z
  .object({
    scanId: z.string().min(1),
    violationIds: z.array(z.string()).max(2000).optional(),
    strategy: z.enum(["all", "critical", "critical-serious", "litigation-drivers"]).optional(),
    assumptions: z
      .object({
        monthlyVisitors: z.number().min(0).max(1_000_000_000).optional(),
        conversionRate: z.number().min(0).max(1).optional(),
        averageOrderValue: z.number().min(0).max(1_000_000).optional(),
        industry: z.string().max(40).optional(),
        geo: z.string().max(40).optional(),
        disabledPopulationRate: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .refine((b) => b.violationIds?.length || b.strategy, {
    message: "Provide violationIds or a strategy",
  });

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-digital-twin");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;

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

  const { scanId, violationIds, strategy, assumptions } = parsed.data;

  const result = await runDigitalTwin(scanId, {
    violationIds,
    strategy,
    assumptions,
    workspaceId: perm.ctx.workspaceId,
  });

  if (!result) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({ twin: result }, { headers: rateLimitHeaders(rl) });
}
