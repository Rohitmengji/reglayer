/**
 * RegLayer — Marketplace Install API
 *
 * POST /api/marketplace/install — Install a marketplace item into workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const installSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(["workflow", "rule", "agent", "template"]),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = installSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { itemId } = parsed.data;

  // Find the marketplace item
  const item = await prisma.marketplaceItem.findUnique({
    where: { id: itemId },
  });

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Increment download count
  if (!perm.ctx.userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const workspaceId = perm.ctx.workspaceId;
  const userId = perm.ctx.userId;

  // Install by type. The download counter is only bumped after the install
  // actually succeeds, so a failed or unsupported install never inflates it.
  if (item.type === "workflow") {
    const def = item.definition as { nodes?: unknown[]; edges?: unknown[] };
    await prisma.savedWorkflow.create({
      data: {
        name: item.title,
        workspaceId,
        createdBy: userId,
        definition: JSON.parse(JSON.stringify(item.definition)),
        nodeCount: Array.isArray(def?.nodes) ? def.nodes.length : 0,
        edgeCount: Array.isArray(def?.edges) ? def.edges.length : 0,
        description: item.description,
        category: item.category,
      },
    });
  } else if (item.type === "agent") {
    const def = item.definition as {
      systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number; tools?: string[];
    } | null;
    if (!def?.systemPrompt) {
      return NextResponse.json({ error: "This agent is missing its configuration and can't be installed." }, { status: 422 });
    }
    const slug = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent"}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const { createBlueprint } = await import("@/lib/ai/marketplace/registry");
      await createBlueprint({
        slug,
        name: item.title,
        description: item.description,
        category: item.category,
        systemPrompt: def.systemPrompt,
        model: def.model,
        temperature: def.temperature,
        maxTokens: def.maxTokens,
        tools: def.tools,
        createdBy: userId,
        workspaceId,
      });
    } catch {
      return NextResponse.json({ error: "Could not install this agent — it may already exist in your workspace." }, { status: 409 });
    }
  } else {
    return NextResponse.json({ error: `Installing “${item.type}” items isn't available yet.` }, { status: 400 });
  }

  await prisma.marketplaceItem.update({
    where: { id: itemId },
    data: { downloads: { increment: 1 } },
  });

  return NextResponse.json({
    installed: true,
    itemId: item.id,
    title: item.title,
    type: item.type,
  });
}
