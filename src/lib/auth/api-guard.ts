/**
 * RegLayer — API mutation guard
 *
 * WHY: Most mutation routes only verified "is authenticated" (and sometimes
 * workspace membership) — a VIEWER could therefore run scans, delete keys, edit
 * integrations, etc. This helper enforces the canonical RBAC permission matrix
 * (rbac.ts) at the API boundary so read-only roles cannot mutate.
 *
 * WHAT: `requireWorkspacePermission(permission, { workspaceId? })` resolves the
 * caller's system + workspace role and checks the permission. Master admins
 * bypass (handled inside hasPermission).
 *
 * HOW: Returns a discriminated result — on failure, a ready-to-return 401/403
 * NextResponse; on success, the resolved context (userId, workspaceId, roles)
 * so the route can reuse it instead of re-querying.
 */
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { hasPermission, type Permission, type SystemRole, type WorkspaceRole } from "@/lib/auth/rbac";

export interface WorkspaceAccess {
  userId: string;
  email: string;
  isMasterAdmin: boolean;
  systemRole: SystemRole;
  workspaceId: string | null;
  workspaceRole: WorkspaceRole | null;
}

export type GuardResult =
  | { ok: true; ctx: WorkspaceAccess }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller's workspace access and enforce `permission`.
 *
 * - If `workspaceId` is provided, the role is resolved IN THAT workspace (use
 *   this when the route acts on a resource whose workspace you already know).
 * - Otherwise the caller's primary (earliest-joined) membership is used, which
 *   matches the `getOrCreateWorkspace()` / `findFirst` convention the existing
 *   routes rely on.
 */
export async function requireWorkspacePermission(
  permission: Permission,
  opts?: { workspaceId?: string | null }
): Promise<GuardResult> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isMasterAdmin: true },
  });
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const systemRole: SystemRole = user.isMasterAdmin ? "MASTER_ADMIN" : "USER";

  let workspaceId = opts?.workspaceId ?? null;
  let workspaceRole: WorkspaceRole | null = null;

  if (workspaceId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      select: { role: true },
    });
    workspaceRole = (member?.role as WorkspaceRole) ?? null;
  } else {
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
      select: { role: true, workspaceId: true },
    });
    workspaceRole = (member?.role as WorkspaceRole) ?? null;
    workspaceId = member?.workspaceId ?? null;
  }

  if (!hasPermission(systemRole, workspaceRole, permission)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Forbidden: requires '${permission}' permission` },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: user.id,
      email,
      isMasterAdmin: user.isMasterAdmin,
      systemRole,
      workspaceId,
      workspaceRole,
    },
  };
}
