/**
 * RegLayer — Workspace Decisions API
 *
 * GET    /api/ai/decisions — List active decisions for current workspace
 * POST   /api/ai/decisions — Create a new decision
 * PATCH  /api/ai/decisions — Update a decision
 * DELETE /api/ai/decisions — Delete a decision
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { requireWorkspacePermission } from "@/lib/auth/api-guard";
import { loadDecisions, createDecision, updateDecision, deleteDecision } from "@/lib/ai/decisions/engine";
import { z } from "zod";

const createSchema = z.object({
  category: z.enum(["ARCHITECTURE", "CODING", "COMPLIANCE", "SECURITY", "UX", "PERFORMANCE", "TESTING", "INTEGRATION", "CUSTOM"]),
  decision: z.string().min(3).max(500),
  rationale: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  id: z.string(),
  decision: z.string().min(3).max(500).optional(),
  rationale: z.string().max(1000).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  const workspaceId = perm.ctx.workspaceId;
  if (!workspaceId) return NextResponse.json({ decisions: [] });

  const decisions = await loadDecisions(workspaceId);
  return NextResponse.json({ decisions });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  const workspaceId = perm.ctx.workspaceId;
  const userId = perm.ctx.userId;
  if (!workspaceId || !userId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const decision = await createDecision({
    workspaceId,
    category: parsed.data.category,
    decision: parsed.data.decision,
    rationale: parsed.data.rationale,
    createdBy: userId,
  });

  return NextResponse.json({ decision }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  const workspaceId = perm.ctx.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id, ...data } = parsed.data;
  await updateDecision(id, workspaceId, data);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const perm = await requireWorkspacePermission("settings.manage");
  if (!perm.ok) return perm.response;

  const workspaceId = perm.ctx.workspaceId;
  if (!workspaceId) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await deleteDecision(id, workspaceId);
  return NextResponse.json({ deleted: true });
}
