/**
 * RegLayer — Workflow Builder Run API
 *
 * POST /api/workflows/builder/run — Validate and preview a visual workflow
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { z } from "zod";

const runSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nodes: z.array(z.object({
    id: z.string().min(1).max(200),
    type: z.enum(["trigger", "action", "condition"]),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.string(), z.unknown()),
  })).min(1).max(200),
  edges: z.array(z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    label: z.string().optional(),
  })).max(500),
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

  const triggerNodes = nodes.filter((n) => n.type === "trigger");
  if (triggerNodes.length === 0) {
    return NextResponse.json({ error: "Workflow must have at least one trigger" }, { status: 400 });
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) return NextResponse.json({ error: "Each step must have a unique ID" }, { status: 400 });
  if (edges.some((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))) {
    return NextResponse.json({ error: "Every connection must refer to an existing step" }, { status: 400 });
  }
  const adjacency = new Map<string, string[]>();
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? [];
    targets.push(edge.target);
    adjacency.set(edge.source, targets);
    incoming.set(edge.target, incoming.get(edge.target)! + 1);
  }

  const reachable = new Set<string>();
  const pending = triggerNodes.map((node) => node.id);
  while (pending.length) {
    const current = pending.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  if (reachable.size !== nodes.length) return NextResponse.json({ error: "Connect every step to a trigger before previewing" }, { status: 400 });

  const plannedNodes: string[] = [];
  const queue = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  while (queue.length > 0) {
    const current = queue.shift()!;
    plannedNodes.push(current);
    const next = adjacency.get(current) ?? [];
    for (const nextId of next) {
      incoming.set(nextId, incoming.get(nextId)! - 1);
      if (incoming.get(nextId) === 0) queue.push(nextId);
    }
  }
  if (plannedNodes.length !== nodes.length) return NextResponse.json({ error: "Remove circular connections before previewing" }, { status: 400 });

  return NextResponse.json({
    workflowName: name,
    status: "preview",
    executed: false,
    message: "Structure preview only. No scans, AI calls, reports or notifications were executed. Conditional branches are listed, not evaluated.",
    plannedNodes,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });
}
