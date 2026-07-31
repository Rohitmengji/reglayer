/**
 * RegLayer — Autonomous Accessibility Agent API
 *
 * POST /api/ai/remediation-agent — run the autonomous remediation lifecycle for
 * a scan: understand → locate → propose → (review gate) → open PR → verify →
 * close → prove. Side-effecting stages are gated by autonomy level, human
 * approval, and configured capabilities.
 *
 * Body: { scanId, autonomy?, approved?, reportUrl? }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { runRemediationAgent } from "@/lib/agents/remediation/agent";

const bodySchema = z.object({
  scanId: z.string().min(1),
  autonomy: z.enum(["suggest", "assisted", "autonomous"]).default("assisted"),
  approved: z.boolean().optional(),
  reportUrl: z.string().url().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.ai, "ai-remediation-agent");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Running the agent can change state (PRs, status, proofs) — require a write
  // scope so viewers cannot trigger it.
  const perm = await requireWorkspacePermission("scans.run");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
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

  const { scanId, autonomy, approved, reportUrl } = parsed.data;

  const run = await runRemediationAgent(scanId, {
    autonomy,
    approved,
    reportUrl,
    actorUserId: perm.ctx.userId,
    workspaceId: perm.ctx.workspaceId,
  });

  if (!run) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  return NextResponse.json({ run }, { headers: rateLimitHeaders(rl) });
}
