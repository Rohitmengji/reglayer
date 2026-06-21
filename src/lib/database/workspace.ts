/**
 * RegLayer — Workspace Helper
 *
 * WHY: New users need a workspace auto-provisioned on first scan.
 * WHAT: Gets or creates a personal workspace for a user.
 * HOW: Checks WorkspaceMember for user. If none, creates workspace with slug from email, adds user as OWNER.
 */

import { prisma } from "@/lib/database/prisma";

/**
 * Get or create a default workspace for a user.
 * - Master admins and credential-based users: auto-create workspace as OWNER
 * - Google/OAuth users: only return existing membership (must be invited)
 * Returns the workspaceId or null if user has no workspace.
 */
export async function getOrCreateWorkspace(userId: string, email: string): Promise<string> {
  // Check if user already has a workspace membership. ORDER BY joinedAt asc so
  // "primary workspace" is defined IDENTICALLY here and in the RBAC guard
  // (requireWorkspacePermission) — an unordered findFirst can return a different
  // row than the guard, letting a permission verified in workspace A authorize a
  // write into workspace B (cross-workspace privilege divergence).
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });

  if (membership) {
    return membership.workspaceId;
  }

  // Check if user is master admin — they always get their own workspace
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isMasterAdmin: true },
  });

  if (user?.isMasterAdmin) {
    const slug = email.split("@")[0].replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const workspace = await prisma.workspace.create({
      data: {
        name: `${email.split("@")[0]}'s Workspace`,
        slug: `${slug}-${Date.now().toString(36)}`,
        plan: "ENTERPRISE",
        members: { create: { userId, role: "OWNER" } },
      },
    });
    return workspace.id;
  }

  // For regular users (e.g. Google sign-in), don't auto-create.
  // They must be invited to a workspace by an Owner/Admin.
  // Return empty string to signal "no workspace"
  return "";
}

/**
 * Create a new workspace with a designated owner.
 * Used by master admin to onboard new users/teams.
 */
export async function createWorkspace(
  name: string,
  ownerUserId: string,
  plan: "FREE" | "PRO" | "ENTERPRISE" = "FREE"
): Promise<string> {
  const slug = name.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 30) + "-" + Date.now().toString(36);
  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      plan,
      members: { create: { userId: ownerUserId, role: "OWNER" } },
    },
  });
  return workspace.id;
}
