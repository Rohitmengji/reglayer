/**
 * RegLayer — Workflow Builder API
 *
 * POST /api/workflows/builder       — Save a visual workflow definition
 * GET  /api/workflows/builder       — List saved workflows
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { prisma } from "@/lib/database/prisma";
import { z } from "zod";

const saveSchema = z.object({
  name: z.string().min(1).max(200),
  nodes: z.array(z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.string(), z.unknown()),
  })).min(1),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    label: z.string().optional(),
  })),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId) return NextResponse.json({ workflows: [] });

  const workflows = await prisma.savedWorkflow.findMany({
    where: { workspaceId: perm.ctx.workspaceId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, nodeCount: true, edgeCount: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ workflows });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;
  if (!perm.ctx.workspaceId || !perm.ctx.userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, nodes, edges } = parsed.data;

  const workflow = await prisma.savedWorkflow.upsert({
    where: {
      workspaceId_name: { workspaceId: perm.ctx.workspaceId, name },
    },
    create: {
      name,
      workspaceId: perm.ctx.workspaceId,
      createdBy: perm.ctx.userId,
      definition: JSON.parse(JSON.stringify({ nodes, edges })),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    update: {
      definition: JSON.parse(JSON.stringify({ nodes, edges })),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
  });

  return NextResponse.json({ id: workflow.id, name: workflow.name }, { status: 201 });
}
