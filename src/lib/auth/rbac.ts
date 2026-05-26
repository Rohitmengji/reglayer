/**
 * ---------------------------------------------------------
 * RegLayer — Role-Based Access Control (RBAC)
 * ---------------------------------------------------------
 *
 * Hierarchy:
 *   MASTER_ADMIN (system-level, God mode)
 *     └── OWNER (workspace-level, full control)
 *           └── ADMIN (workspace-level, manage members/scans)
 *                 └── MEMBER (workspace-level, run scans)
 *                       └── VIEWER (workspace-level, read-only)
 *
 * Master Admin can:
 *   - Manage ALL workspaces
 *   - Change plan for any workspace
 *   - Assign/revoke OWNER role
 *   - View all data across all workspaces
 *
 * Owner can:
 *   - Full control of their workspace
 *   - Assign ADMIN/MEMBER/VIEWER roles
 *   - Manage billing/plan (within limits)
 *   - Delete workspace
 *
 * Admin can:
 *   - Manage schedules, integrations, API keys
 *   - Run scans, view all data
 *   - Invite MEMBER/VIEWER
 *
 * Member can:
 *   - Run scans, view results
 *   - Cannot manage settings or members
 *
 * Viewer can:
 *   - Read-only access to scan results
 * ---------------------------------------------------------
 */

import { prisma } from "@/lib/database/prisma";

export type SystemRole = "MASTER_ADMIN" | "USER";
export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type Permission =
  | "workspace.manage"
  | "workspace.delete"
  | "workspace.changePlan"
  | "members.invite"
  | "members.remove"
  | "members.changeRole"
  | "scans.run"
  | "scans.view"
  | "schedules.manage"
  | "integrations.manage"
  | "apiKeys.manage"
  | "settings.manage"
  | "admin.allWorkspaces"
  | "admin.managePlans"
  | "admin.manageOwners";

const ROLE_PERMISSIONS: Record<WorkspaceRole, Permission[]> = {
  OWNER: [
    "workspace.manage",
    "workspace.delete",
    "members.invite",
    "members.remove",
    "members.changeRole",
    "scans.run",
    "scans.view",
    "schedules.manage",
    "integrations.manage",
    "apiKeys.manage",
    "settings.manage",
  ],
  ADMIN: [
    "workspace.manage",
    "members.invite",
    "members.remove",
    "scans.run",
    "scans.view",
    "schedules.manage",
    "integrations.manage",
    "apiKeys.manage",
    "settings.manage",
  ],
  MEMBER: ["scans.run", "scans.view"],
  VIEWER: ["scans.view"],
};

const MASTER_ADMIN_PERMISSIONS: Permission[] = [
  "admin.allWorkspaces",
  "admin.managePlans",
  "admin.manageOwners",
  "workspace.manage",
  "workspace.delete",
  "workspace.changePlan",
  "members.invite",
  "members.remove",
  "members.changeRole",
  "scans.run",
  "scans.view",
  "schedules.manage",
  "integrations.manage",
  "apiKeys.manage",
  "settings.manage",
];

// Roles that each role can assign to others
const ASSIGNABLE_ROLES: Record<WorkspaceRole, WorkspaceRole[]> = {
  OWNER: ["ADMIN", "MEMBER", "VIEWER"],
  ADMIN: ["MEMBER", "VIEWER"],
  MEMBER: [],
  VIEWER: [],
};

/**
 * Get the current user's context: system role + workspace role
 */
export async function getUserContext(userId: string, workspaceId?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isMasterAdmin: true },
  });

  if (!user) return null;

  const systemRole: SystemRole = user.isMasterAdmin ? "MASTER_ADMIN" : "USER";

  let workspaceRole: WorkspaceRole | null = null;
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { role: true },
    });
    workspaceRole = (membership?.role as WorkspaceRole) || null;
  }

  return { user, systemRole, workspaceRole };
}

/**
 * Check if a user has a specific permission in a workspace
 */
export function hasPermission(
  systemRole: SystemRole,
  workspaceRole: WorkspaceRole | null,
  permission: Permission
): boolean {
  // Master admin has everything
  if (systemRole === "MASTER_ADMIN") return true;

  // No workspace role = no workspace permissions
  if (!workspaceRole) return false;

  return ROLE_PERMISSIONS[workspaceRole].includes(permission);
}

/**
 * Get all permissions for a user in a workspace context
 */
export function getPermissions(
  systemRole: SystemRole,
  workspaceRole: WorkspaceRole | null
): Permission[] {
  if (systemRole === "MASTER_ADMIN") return MASTER_ADMIN_PERMISSIONS;
  if (!workspaceRole) return [];
  return ROLE_PERMISSIONS[workspaceRole];
}

/**
 * Check if a user can assign a specific role
 */
export function canAssignRole(
  systemRole: SystemRole,
  workspaceRole: WorkspaceRole | null,
  targetRole: WorkspaceRole
): boolean {
  // Master admin can assign any role including OWNER
  if (systemRole === "MASTER_ADMIN") return true;

  if (!workspaceRole) return false;
  return ASSIGNABLE_ROLES[workspaceRole].includes(targetRole);
}

/**
 * Check if a user can manage another user (for removal, role change)
 * Rule: You can only manage users with a lower role than yours
 */
export function canManageUser(
  actorRole: WorkspaceRole,
  targetRole: WorkspaceRole
): boolean {
  const hierarchy: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
  return hierarchy.indexOf(actorRole) < hierarchy.indexOf(targetRole);
}

/**
 * Require specific permission — throws if not authorized
 */
export function requirePermission(
  systemRole: SystemRole,
  workspaceRole: WorkspaceRole | null,
  permission: Permission
): void {
  if (!hasPermission(systemRole, workspaceRole, permission)) {
    throw new Error(`Forbidden: requires '${permission}' permission`);
  }
}

/**
 * Check if user is master admin (quick check from user record)
 */
export async function isMasterAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isMasterAdmin: true },
  });
  return user?.isMasterAdmin === true;
}

/**
 * Get all workspaces (master admin) or user's workspaces
 */
export async function getAccessibleWorkspaces(userId: string, isMaster: boolean) {
  if (isMaster) {
    return prisma.workspace.findMany({
      include: {
        members: { include: { user: { select: { id: true, email: true, name: true } } } },
        _count: { select: { scans: true, schedules: true, sites: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          members: { include: { user: { select: { id: true, email: true, name: true } } } },
          _count: { select: { scans: true, schedules: true, sites: true } },
        },
      },
    },
  });

  return memberships.map((m) => m.workspace);
}
