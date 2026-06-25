/**
 * /api/sso/connections/[id]/role-mappings — IdP-group → workspace-role mapping (#25).
 *
 *  GET → list this connection's role mappings.
 *  PUT → replace the full set atomically (delete-all + recreate in one tx) + audit.
 *
 * These map an IdP group claim to a workspace role at JIT-provision time
 * (resolveProvisionedRole consumes them). SSO never maps a group to OWNER — the
 * highest assignable role here is ADMIN — so a misconfigured IdP can't mint an
 * owner. Gated + workspace-scoped by requireSsoAdmin (cross-workspace ⇒ 404).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/database/prisma";
import { requireSsoAdmin } from "@/lib/sso/admin-guard";
import { recordSsoAudit } from "@/lib/sso/audit";
import { logger } from "@/lib/telemetry/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Thrown inside the PUT transaction when the connection was soft-deleted concurrently. */
class ConnectionGone extends Error {}

const putSchema = z
  .object({
    mappings: z
      .array(
        z.object({
          // Lowercased so matching is case-insensitive end-to-end (storage here +
          // resolveProvisionedRole at login); also makes the dedupe below match
          // the DB @@unique([connectionId, idpGroup]).
          idpGroup: z.string().trim().toLowerCase().min(1).max(200),
          // Never OWNER via SSO group mapping (no privilege minting).
          role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
        })
      )
      .max(200),
  })
  .refine(
    (d) => {
      const groups = d.mappings.map((m) => m.idpGroup);
      return new Set(groups).size === groups.length;
    },
    { message: "Duplicate idpGroup entries" }
  );

async function loadConnection(id: string, workspaceId: string) {
  return prisma.sSOConnection.findFirst({ where: { id, workspaceId, deletedAt: null }, select: { id: true } });
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  const connection = await loadConnection(id, guard.ctx.workspaceId);
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const mappings = await prisma.ssoRoleMapping.findMany({
    where: { connectionId: id },
    select: { id: true, idpGroup: true, role: true },
    orderBy: { idpGroup: "asc" },
  });
  return NextResponse.json({ mappings });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSsoAdmin(request);
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const connection = await loadConnection(id, guard.ctx.workspaceId);
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const mappings = parsed.data.mappings;
  try {
    await prisma.$transaction(async (tx) => {
      // Lock the connection FOR UPDATE so a concurrent soft-delete can't leave
      // role mappings stranded on a dead connection (invariant: deleted
      // connections have no mappings).
      const live = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM sso_connections WHERE id = ${id} AND "deletedAt" IS NULL FOR UPDATE`;
      if (live.length === 0) throw new ConnectionGone();

      const before = await tx.ssoRoleMapping.findMany({ where: { connectionId: id }, select: { idpGroup: true, role: true } });
      await tx.ssoRoleMapping.deleteMany({ where: { connectionId: id } });
      if (mappings.length > 0) {
        await tx.ssoRoleMapping.createMany({ data: mappings.map((m) => ({ connectionId: id, idpGroup: m.idpGroup, role: m.role })) });
      }
      await recordSsoAudit(tx, { connectionId: id, actor: guard.ctx.email, changeType: "ROLE_MAPPING_CHANGED", before, after: mappings });
    });
  } catch (err) {
    if (err instanceof ConnectionGone) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    logger.error("SSO role-mapping update failed", { connectionId: id, error: String(err) });
    return NextResponse.json({ error: "Failed to update role mappings" }, { status: 500 });
  }

  return NextResponse.json({ mappings });
}
