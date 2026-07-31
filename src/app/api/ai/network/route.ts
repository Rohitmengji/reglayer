/**
 * RegLayer — Accessibility Intelligence Network API
 *
 * GET  /api/ai/network                         → network overview (consent-gated)
 * GET  /api/ai/network?ruleId=…&selector=…     → k-anonymised benchmark for a fix
 * POST /api/ai/network  { enabled: boolean }   → opt in / out of the network
 *
 * The network is opt-in and anonymised: only the Fix Genome fingerprint and
 * verified success/timing are pooled — never URLs, HTML, PII, or org identity —
 * and aggregates are withheld unless backed by ≥ MIN_CONTRIBUTORS organisations.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import {
  queryNetworkForFix,
  getNetworkStats,
  setNetworkConsent,
  hasNetworkConsent,
} from "@/lib/network/intelligenceNetwork";

const querySchema = z.object({
  ruleId: z.string().min(1).max(100).optional(),
  selector: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const consentSchema = z.object({ enabled: z.boolean() });

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-network");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ consented: false, contributingOrgs: 0, totalVerifiedOutcomes: 0, topProvenFixes: [] });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    ruleId: url.searchParams.get("ruleId") ?? undefined,
    selector: url.searchParams.get("selector") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { ruleId, selector, limit } = parsed.data;

  if (ruleId) {
    const insight = await queryNetworkForFix(perm.ctx.workspaceId, ruleId, selector ?? null);
    return NextResponse.json({ insight }, { headers: rateLimitHeaders(rl) });
  }

  const stats = await getNetworkStats(perm.ctx.workspaceId, { limit });
  return NextResponse.json(stats, { headers: rateLimitHeaders(rl) });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-network-consent");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Joining/leaving the network is a data-governance decision — require admin scope.
  const perm = await requireWorkspacePermission("settings.manage");
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

  const parsed = consentSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await setNetworkConsent(perm.ctx.workspaceId, parsed.data.enabled, perm.ctx.userId);
  const consented = await hasNetworkConsent(perm.ctx.workspaceId);
  return NextResponse.json({ consented }, { headers: rateLimitHeaders(rl) });
}
