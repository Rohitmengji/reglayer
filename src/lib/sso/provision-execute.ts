/**
 * RegLayer — SSO JIT provisioning executor (server-only)
 *
 * Runs the PURE planProvisioning() decision against Prisma at sign-in time:
 * loads the connection (by Jackson tenant = SSOConnection.id), re-checks the
 * asserted email against the connection's VERIFIED domains (review #4), resolves
 * the role by precedence, and upserts the WorkspaceMember txn-safely (review #15,
 * reusing the userId_workspaceId unique). Never downgrades; never touches other
 * workspaces (review #5). Returns a result the signIn callback can audit.
 */
import "server-only";
import { prisma } from "@/lib/database/prisma";
import { planProvisioning } from "./provision";
import type { WorkspaceRole } from "./routing";

export interface JitInput {
  connectionId: string; // = Jackson tenant carried in userinfo.requested.tenant
  email: string;
  name?: string | null;
  groups?: string[];
  claims?: Record<string, unknown>;
}

export type JitResult =
  | { ok: true; workspaceId: string; role: WorkspaceRole }
  | { ok: false; reason: string };

export async function applyProvisioning(input: JitInput): Promise<JitResult> {
  const connection = await prisma.sSOConnection.findUnique({
    where: { id: input.connectionId },
    select: {
      id: true,
      workspaceId: true,
      defaultRole: true,
      disabledAt: true,
      deletedAt: true,
      rolloutStage: true,
      verifiedDomains: { select: { domain: true } },
      roleMappings: { select: { idpGroup: true, role: true } },
      attributeMappings: { select: { sourceAttr: true, targetField: true } },
    },
  });
  if (!connection || connection.disabledAt || connection.deletedAt || connection.rolloutStage === "DISABLED") {
    return { ok: false, reason: "connection_unavailable" };
  }

  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) return { ok: false, reason: "no_user" };

  const existing = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: connection.workspaceId } },
    select: { role: true },
  });

  const plan = planProvisioning({
    assertedEmail: input.email,
    connectionVerifiedDomains: connection.verifiedDomains.map((d) => d.domain),
    existingRole: existing?.role ?? null,
    idpGroups: input.groups ?? [],
    roleMappings: connection.roleMappings.map((m) => ({ idpGroup: m.idpGroup, role: m.role })),
    defaultRole: connection.defaultRole,
    claims: input.claims,
    attributeMappings: connection.attributeMappings.map((m) => ({ sourceAttr: m.sourceAttr, targetField: m.targetField })),
  });
  if (!plan.ok) return { ok: false, reason: plan.reason };
  const role = plan.role;

  // Name comes from mapped attributes if configured, else the IdP display name.
  const name = plan.profile.name ?? input.name ?? undefined;

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: connection.workspaceId } },
      update: { role },
      create: { userId: user.id, workspaceId: connection.workspaceId, role },
    });
    if (name) await tx.user.update({ where: { id: user.id }, data: { name } });
    await tx.sSOConnection.update({
      where: { id: connection.id },
      data: { lastLoginAt: new Date(), lastSSOLoginAt: new Date() },
    });
  });

  return { ok: true, workspaceId: connection.workspaceId, role };
}
