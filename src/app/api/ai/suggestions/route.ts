/**
 * RegLayer — Proactive Suggestions API
 *
 * GET /api/ai/suggestions — Get contextual AI suggestions for the workspace
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { generateSuggestions } from "@/lib/ai/suggestions/service";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(session.user.email, RATE_LIMITS.api, "ai-suggestions");
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  // Read-only endpoint — any workspace member should see suggestions for their
  // own workspace. `scans.view` is granted to OWNER/ADMIN/MEMBER/VIEWER; the
  // previous `settings.manage` gate wrongly locked MEMBER/VIEWER out.
  const perm = await requireWorkspacePermission("scans.view");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) return NextResponse.json({ suggestions: [] });

  const suggestions = await generateSuggestions(perm.ctx.workspaceId);
  return NextResponse.json({ suggestions });
}

