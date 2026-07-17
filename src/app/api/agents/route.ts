/**
 * RegLayer — Agents API (Session Auth)
 *
 * GET  /api/agents         — List available agents for the user's workspace
 * POST /api/agents/run     — Run an agent with a task (creates conversation, returns result)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { listBlueprints } from "@/lib/ai/marketplace/registry";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("scans.read");
  if (!perm.ok) return perm.response;

  const agents = await listBlueprints({
    workspaceId: perm.ctx.workspaceId ?? undefined,
  });

  return NextResponse.json({
    agents: agents.map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      category: a.category,
      model: a.model,
      isSystem: a.isSystem,
      tools: a.tools,
    })),
    count: agents.length,
  });
}
