/**
 * /api/sso/connections/[id] — update or soft-delete one connection (OWNER/ADMIN).
 *
 *  PATCH  → label / rolloutStage / enforcementPolicy / defaultRole / enable-disable.
 *  DELETE → soft-delete; releases its verified domains (frees the global claim)
 *           and deregisters it from the Jackson backend (best-effort).
 *
 * Scoped to the caller's workspace — a connection in another workspace 404s
 * (never leaks existence).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/database/prisma";
import { getSsoBackend } from "@/lib/sso/backend";
import { recordSsoAudit } from "@/lib/sso/audit";
import { requireSsoAdmin } from "@/lib/sso/admin-guard";
import { logger } from "@/lib/telemetry/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    label: z.string().trim().min(1).max(100).optional(),
    rolloutStage: z.enum(["DISABLED", "INTERNAL", "BETA", "GA"]).optional(),
    enforcementPolicy: z.enum(["OPTIONAL", "ENFORCED", "ENFORCED_VERIFIED_DOMAINS"]).optional(),
    defaultRole: z.enum(["ADMIN", "MEMBER", "VIEWER"]).optional(),
    disabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "No fields to update" });

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const before = await prisma.sSOConnection.findFirst({
    where: { id, workspaceId: guard.ctx.workspaceId, deletedAt: null },
    select: { id: true, label: true, rolloutStage: true, enforcementPolicy: true, defaultRole: true, disabledAt: true },
  });
  if (!before) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const { label, rolloutStage, enforcementPolicy, defaultRole, disabled } = parsed.data;
  const data: Prisma.SSOConnectionUpdateInput = {};
  if (label !== undefined) data.label = label;
  if (rolloutStage !== undefined) data.rolloutStage = rolloutStage;
  if (enforcementPolicy !== undefined) data.enforcementPolicy = enforcementPolicy;
  if (defaultRole !== undefined) data.defaultRole = defaultRole;
  if (disabled !== undefined) data.disabledAt = disabled ? new Date() : null;

  const changeType = disabled === true ? "DISABLED" : disabled === false ? "ENABLED" : "UPDATED";

  const updated = await prisma.sSOConnection.update({
    where: { id },
    data,
    select: { id: true, label: true, rolloutStage: true, enforcementPolicy: true, defaultRole: true, disabledAt: true },
  });

  await recordSsoAudit(prisma, { connectionId: id, actor: guard.ctx.email, changeType, before, after: updated });

  return NextResponse.json({ connection: updated });
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  const connection = await prisma.sSOConnection.findFirst({
    where: { id, workspaceId: guard.ctx.workspaceId, deletedAt: null },
    select: { id: true, label: true, protocol: true },
  });
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.sSOConnection.update({ where: { id }, data: { deletedAt: now, disabledAt: now, rolloutStage: "DISABLED" } });
    // Release the global domain claim + tombstone the domain rows.
    await tx.verifiedDomain.deleteMany({ where: { connectionId: id } });
    await tx.ssoDomain.updateMany({ where: { connectionId: id, deletedAt: null }, data: { deletedAt: now } });
    await recordSsoAudit(tx, { connectionId: id, actor: guard.ctx.email, changeType: "DELETED", before: connection });
  });

  // Deregister from Jackson (best-effort — the connection is already gone for us).
  try {
    const backend = await getSsoBackend();
    await backend.deleteConnection({ tenant: id, product: "reglayer" });
  } catch (err) {
    logger.warn("SSO backend deregistration failed (connection soft-deleted regardless)", { connectionId: id, error: String(err) });
  }

  return NextResponse.json({ ok: true });
}
