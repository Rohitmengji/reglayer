/**
 * RegLayer — Sites API
 *
 * GET: List the caller's workspace sites, most-recently-updated first. Used by
 * the crawl page to AUTO-DETECT a target (pre-fill the URL with the user's own
 * site) so the "Target: auto-detected" affordance is real rather than cosmetic.
 *
 * Strictly workspace-scoped: only sites in the caller's resolved workspace are
 * returned, so this never leaks another tenant's domains.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { getPlanContext } from "@/lib/credits/plan-context";
import { getOrCreateWorkspace } from "@/lib/database/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const planCtx = await getPlanContext();
    if (!planCtx?.userId) {
      // No resolvable user → no sites (don't 500, just return empty).
      return NextResponse.json({ sites: [] });
    }

    const workspaceId = await getOrCreateWorkspace(planCtx.userId, session.user.email);
    if (!workspaceId) return NextResponse.json({ sites: [] });

    const sites = await prisma.site.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, url: true, name: true, updatedAt: true },
    });

    return NextResponse.json({ sites });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
