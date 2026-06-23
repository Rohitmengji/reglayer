/**
 * RegLayer — Custom Compliance Rules API (item)
 *
 * PATCH  /api/rules/[id] — update a rule (OWNER/ADMIN)
 * DELETE /api/rules/[id] — delete a rule (OWNER/ADMIN)
 *
 * Gated by the Enterprise "customRules" feature. The rule must belong to the
 * caller's active workspace (IDOR guard).
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { requireFeature } from "@/lib/features/require-feature";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import type { Prisma } from "@/generated/prisma/client";
import { parseRuleConfig } from "../route";

const IMPACTS = ["critical", "serious", "moderate", "minor"] as const;

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  severity: z.enum(IMPACTS).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

async function requireWorkspaceAdmin(email: string, workspaceId: string): Promise<string | null> {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, user: { email }, role: { in: ["OWNER", "ADMIN"] } },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const guard = await requireFeature("customRules");
  if (!guard.allowed) return guard.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const actorId = await requireWorkspaceAdmin(session.user.email, guard.workspaceId);
  if (!actorId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.complianceRule.findUnique({ where: { id }, select: { id: true, workspaceId: true, type: true } });
  if (!existing || existing.workspaceId !== guard.workspaceId) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  // If config is being changed, validate it against the rule's (immutable) type.
  let configData: Prisma.InputJsonValue | undefined;
  if (parsed.data.config !== undefined) {
    const cfg = parseRuleConfig(existing.type, parsed.data.config);
    if (!cfg.success) {
      return NextResponse.json({ error: { config: cfg.error.issues.map((i) => i.message) } }, { status: 400 });
    }
    configData = cfg.data;
  }

  const rule = await prisma.complianceRule.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
      ...(parsed.data.severity !== undefined ? { severity: parsed.data.severity } : {}),
      ...(configData !== undefined ? { config: configData } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "compliance_rule.updated",
      actor: actorId,
      target: rule.id,
      workspaceId: guard.workspaceId,
      metadata: { name: rule.name },
    },
  });

  return NextResponse.json({ rule });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const blocked = await applyRateLimit(request, "api");
  if (blocked) return blocked;

  const guard = await requireFeature("customRules");
  if (!guard.allowed) return guard.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const actorId = await requireWorkspaceAdmin(session.user.email, guard.workspaceId);
  if (!actorId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const existing = await prisma.complianceRule.findUnique({ where: { id }, select: { id: true, workspaceId: true, name: true } });
  if (!existing || existing.workspaceId !== guard.workspaceId) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  await prisma.complianceRule.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      action: "compliance_rule.deleted",
      actor: actorId,
      target: existing.id,
      workspaceId: guard.workspaceId,
      metadata: { name: existing.name },
    },
  });

  return NextResponse.json({ ok: true });
}
