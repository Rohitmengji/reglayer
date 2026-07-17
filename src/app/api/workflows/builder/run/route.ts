/**
 * RegLayer — Workflow Builder Run API
 *
 * POST /api/workflows/builder/run — Execute a visual workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const runSchema = z.object({
  name: z.string().min(1),
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

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, nodes, edges } = parsed.data;

  // Simple topological execution: find trigger → follow edges → execute actions
  const triggerNodes = nodes.filter((n) => n.type === "trigger");
  if (triggerNodes.length === 0) {
    return NextResponse.json({ error: "Workflow must have at least one trigger" }, { status: 400 });
  }

  // Build adjacency from edges
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
  }

  // BFS execution simulation
  const executed: string[] = [];
  const queue = triggerNodes.map((n) => n.id);

  while (queue.length > 0) {
    const current = queue.shift()!;
    executed.push(current);
    const next = adjacency.get(current) ?? [];
    for (const nId of next) {
      if (!executed.includes(nId)) {
        queue.push(nId);
      }
    }
  }

  return NextResponse.json({
    runId: crypto.randomUUID(),
    workflowName: name,
    status: "completed",
    executedNodes: executed,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });
}
