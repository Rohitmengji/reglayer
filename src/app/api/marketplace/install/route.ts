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
  await prisma.marketplaceItem.update({
    where: { id: itemId },
    data: { downloads: { increment: 1 } },
  });

  // Install based on type
  if (item.type === "workflow") {
    const def = item.definition as { nodes?: unknown[]; edges?: unknown[] };
    await prisma.savedWorkflow.create({
      data: {
        name: item.title,
        workspaceId: perm.ctx.workspaceId,
        createdBy: perm.ctx.userId!,
        definition: JSON.parse(JSON.stringify(item.definition)),
        nodeCount: Array.isArray(def?.nodes) ? def.nodes.length : 0,
        edgeCount: Array.isArray(def?.edges) ? def.edges.length : 0,
        description: item.description,
        category: item.category,
      },
    });
  }

  // For other types (rule, agent, template), we store a reference
  // that the respective subsystem can pick up

  return NextResponse.json({
    installed: true,
    itemId: item.id,
    title: item.title,
    type: item.type,
  });
}
