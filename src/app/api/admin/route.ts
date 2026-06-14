/**
 * /api/admin — Master Admin API
 *
 * Endpoints:
 *   GET  — Get all workspaces, users, system overview
 *   POST — Actions: changePlan, assignRole, removeUser, toggleMasterAdmin
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { applyRateLimit } from "@/lib/rate-limit-middleware";
import { logger } from "@/lib/telemetry/logger";
import { canManageUser, canAssignRole, type WorkspaceRole } from "@/lib/auth/rbac";
import bcrypt from "bcryptjs";

const log = logger.withContext({ service: "admin-api" });

async function getAuthedMasterAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, isMasterAdmin: true },
  });
  if (!user || !user.isMasterAdmin) return null;

  return user;
}

export async function GET() {
  try {
    const admin = await getAuthedMasterAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden: Master Admin access required" }, { status: 403 });
    }

    const [workspaces, users, totalScans, totalSchedules] = await Promise.all([
      prisma.workspace.findMany({
        include: {
          members: {
            include: { user: { select: { id: true, email: true, name: true, isMasterAdmin: true } } },
          },
          _count: { select: { scans: true, schedules: true, sites: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          isMasterAdmin: true,
          createdAt: true,
          bonusCredits: true,
          creditGrants: {
            where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
            select: { id: true },
          },
          memberships: {
            select: {
              role: true,
              workspace: {
                select: {
                  id: true,
                  members: {
                    where: { role: "OWNER" },
                    select: { user: { select: { isMasterAdmin: true } } },
                    take: 1,
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.scan.count(),
      prisma.schedule.count(),
    ]);

    return NextResponse.json({
      workspaces,
      users: users.map((u) => {
        // A user can be granted master if they are an OWNER/ADMIN themselves,
        // or if their workspace owner is already a master admin
        const isOwnerOrAdmin = u.memberships.some((m) => m.role === "OWNER" || m.role === "ADMIN");
        const ownerIsMaster = u.memberships.some(
          (m) => m.workspace.members.some((om) => om.user.isMasterAdmin)
        );
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          isMasterAdmin: u.isMasterAdmin,
          createdAt: u.createdAt,
          role: u.memberships[0]?.role || null,
          canGrantMaster: isOwnerOrAdmin || ownerIsMaster,
          bonusCredits: u.bonusCredits ?? 0,
          creditGrantsThisMonth: u.creditGrants.length,
        };
      }),
      stats: { totalWorkspaces: workspaces.length, totalUsers: users.length, totalScans, totalSchedules },
    });
  } catch (err) {
    log.error("Failed to load admin overview", { action: "GET", error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = await applyRateLimit(req, "api");
  if (blocked) return blocked;

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!actor) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let body: AdminActionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { action } = body;

  try {
    return await handleAdminAction(action, body, actor);
  } catch (err) {
    log.error("Admin action failed", { action: String(action), actorId: actor.id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

type AdminActor = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

/** Union of fields used across admin actions — each case validates its own required fields. */
interface AdminActionBody {
  action?: string;
  workspaceId?: string;
  plan?: "FREE" | "PRO" | "ENTERPRISE";
  userId?: string;
  targetUserId?: string;
  role?: WorkspaceRole;
  name?: string;
  ownerEmail?: string;
  email?: string;
  amount?: number;
  reason?: string;
  newPassword?: string;
}

async function handleAdminAction(action: string | undefined, body: AdminActionBody, actor: AdminActor): Promise<NextResponse> {
  switch (action) {
    // ── Master Admin: Change workspace plan ──────────────────
    case "changePlan": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { workspaceId, plan } = body;
      if (!workspaceId || !plan || !["FREE", "PRO", "ENTERPRISE"].includes(plan)) {
        return NextResponse.json({ error: "Invalid workspaceId or plan" }, { status: 400 });
      }

      const workspace = await prisma.workspace.update({
        where: { id: workspaceId },
        data: { plan },
      });

      await prisma.auditLog.create({
        data: {
          action: "workspace.planChanged",
          actor: actor.id,
          target: workspaceId,
          metadata: { plan, changedBy: actor.email },
          workspaceId,
        },
      });

      return NextResponse.json({ success: true, workspace });
    }

    // ── Master Admin: Toggle master admin for another user ───
    case "toggleMasterAdmin": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { userId } = body;
      if (!userId || userId === actor.id) {
        return NextResponse.json({ error: "Cannot change your own master admin status" }, { status: 400 });
      }

      const target = await prisma.user.findUnique({ where: { id: userId } });
      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { isMasterAdmin: !target.isMasterAdmin },
      });

      await prisma.auditLog.create({
        data: {
          action: target.isMasterAdmin ? "user.masterAdminRevoked" : "user.masterAdminGranted",
          actor: actor.id,
          target: userId,
          metadata: { email: target.email },
        },
      });

      return NextResponse.json({ success: true, user: { id: updated.id, email: updated.email, isMasterAdmin: updated.isMasterAdmin } });
    }

    // ── Owner/Admin: Assign role within workspace ────────────
    case "assignRole": {
      const { workspaceId, targetUserId, role } = body;
      if (!workspaceId || !targetUserId || !role) {
        return NextResponse.json({ error: "Missing workspaceId, targetUserId, or role" }, { status: 400 });
      }

      const validRoles: WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      // Get actor's role in this workspace
      const actorMembership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: actor.id, workspaceId } },
      });

      const actorWorkspaceRole = (actorMembership?.role as WorkspaceRole) || null;

      const actorSystemRole = actor.isMasterAdmin ? "MASTER_ADMIN" : "USER";
      if (!canAssignRole(actorSystemRole, actorWorkspaceRole, role)) {
        return NextResponse.json({ error: `You cannot assign the ${role} role` }, { status: 403 });
      }

      // Check if target already has a membership
      const existingMembership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      });

      if (existingMembership) {
        // Check actor can manage target's current role
        if (!actor.isMasterAdmin && !canManageUser(actorWorkspaceRole!, existingMembership.role as WorkspaceRole)) {
          return NextResponse.json({ error: "Cannot change role of a user with equal or higher role" }, { status: 403 });
        }

        await prisma.workspaceMember.update({
          where: { id: existingMembership.id },
          data: { role },
        });
      } else {
        await prisma.workspaceMember.create({
          data: { userId: targetUserId, workspaceId, role },
        });
      }

      await prisma.auditLog.create({
        data: {
          action: "member.roleChanged",
          actor: actor.id,
          target: targetUserId,
          metadata: { role, workspaceId },
          workspaceId,
        },
      });

      return NextResponse.json({ success: true });
    }

    // ── Master Admin: Create workspace ───────────────────────
    case "createWorkspace": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { name: wsName, ownerEmail, plan: wsPlan } = body;
      if (!wsName || !ownerEmail) {
        return NextResponse.json({ error: "Missing name or ownerEmail" }, { status: 400 });
      }

      const validPlans = ["FREE", "PRO", "ENTERPRISE"];
      const selectedPlan = wsPlan && validPlans.includes(wsPlan) ? wsPlan : "FREE";

      // Find or create the owner user
      let ownerUser = await prisma.user.findUnique({ where: { email: ownerEmail } });
      if (!ownerUser) {
        ownerUser = await prisma.user.create({
          data: { email: ownerEmail, name: ownerEmail.split("@")[0] },
        });
      }

      const slug = wsName.replace(/[^a-z0-9-]/gi, "-").toLowerCase().slice(0, 30) + "-" + Date.now().toString(36);
      const newWorkspace = await prisma.workspace.create({
        data: {
          name: wsName,
          slug,
          plan: selectedPlan,
          members: { create: { userId: ownerUser.id, role: "OWNER" } },
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "workspace.created",
          actor: actor.id,
          target: newWorkspace.id,
          metadata: { name: wsName, ownerEmail, plan: selectedPlan },
          workspaceId: newWorkspace.id,
        },
      });

      return NextResponse.json({ success: true, workspace: newWorkspace });
    }

    // ── Master Admin: Add user to workspace ──────────────────
    case "addUserToWorkspace": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { workspaceId: addWsId, email: addEmail, role: addRole } = body;
      if (!addWsId || !addEmail) {
        return NextResponse.json({ error: "Missing workspaceId or email" }, { status: 400 });
      }

      const memberRole = addRole && ["OWNER", "ADMIN", "MEMBER", "VIEWER"].includes(addRole) ? addRole : "MEMBER";

      let targetUser = await prisma.user.findUnique({ where: { email: addEmail } });
      if (!targetUser) {
        targetUser = await prisma.user.create({
          data: { email: addEmail, name: addEmail.split("@")[0] },
        });
      }

      // Check if already a member
      const existingMember = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: targetUser.id, workspaceId: addWsId } },
      });
      if (existingMember) {
        return NextResponse.json({ error: "User is already a member of this workspace" }, { status: 400 });
      }

      await prisma.workspaceMember.create({
        data: { userId: targetUser.id, workspaceId: addWsId, role: memberRole },
      });

      await prisma.auditLog.create({
        data: {
          action: "member.added",
          actor: actor.id,
          target: targetUser.id,
          metadata: { email: addEmail, role: memberRole, workspaceId: addWsId },
          workspaceId: addWsId,
        },
      });

      return NextResponse.json({ success: true });
    }

    // ── Owner/Admin: Remove user from workspace ──────────────
    case "removeUser": {
      const { workspaceId: wsId, targetUserId: removeUserId } = body;
      if (!wsId || !removeUserId) {
        return NextResponse.json({ error: "Missing workspaceId or targetUserId" }, { status: 400 });
      }

      const actorMember = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: actor.id, workspaceId: wsId } },
      });

      if (!actor.isMasterAdmin && !actorMember) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const targetMember = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: removeUserId, workspaceId: wsId } },
      });

      if (!targetMember) {
        return NextResponse.json({ error: "User is not a member of this workspace" }, { status: 404 });
      }

      if (!actor.isMasterAdmin && !canManageUser(actorMember!.role as WorkspaceRole, targetMember.role as WorkspaceRole)) {
        return NextResponse.json({ error: "Cannot remove a user with equal or higher role" }, { status: 403 });
      }

      await prisma.workspaceMember.delete({ where: { id: targetMember.id } });

      await prisma.auditLog.create({
        data: {
          action: "member.removed",
          actor: actor.id,
          target: removeUserId,
          metadata: { workspaceId: wsId },
          workspaceId: wsId,
        },
      });

      return NextResponse.json({ success: true });
    }

    // ── Master Admin: Delete user entirely ───────────────────
    case "deleteUser": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { userId: deleteUserId } = body;
      if (!deleteUserId || deleteUserId === actor.id) {
        return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
      }

      const deleteTarget = await prisma.user.findUnique({ where: { id: deleteUserId } });
      if (!deleteTarget) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Remove all memberships, access requests, then the user — atomically,
      // so a failure partway through can't leave a half-deleted account
      await prisma.$transaction([
        prisma.workspaceMember.deleteMany({ where: { userId: deleteUserId } }),
        prisma.accessRequest.deleteMany({ where: { userId: deleteUserId } }),
        prisma.user.delete({ where: { id: deleteUserId } }),
      ]);

      await prisma.auditLog.create({
        data: {
          action: "user.deleted",
          actor: actor.id,
          target: deleteUserId,
          metadata: { email: deleteTarget.email },
        },
      });

      return NextResponse.json({ success: true });
    }

    // ── Master Admin: Reset password for any user ────────────
    case "resetPassword": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { userId: resetUserId, newPassword } = body;
      if (!resetUserId || !newPassword) {
        return NextResponse.json({ error: "Missing userId or newPassword" }, { status: 400 });
      }

      if (newPassword.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }

      const resetTarget = await prisma.user.findUnique({ where: { id: resetUserId } });
      if (!resetTarget) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: resetUserId },
        data: { passwordHash: hashedPassword },
      });

      await prisma.auditLog.create({
        data: {
          action: "user.passwordReset",
          actor: actor.id,
          target: resetUserId,
          metadata: { email: resetTarget.email, resetBy: "master" },
        },
      });

      return NextResponse.json({ success: true });
    }

    // ── Master Admin: Grant bonus AI credits to a user (max 3x/month per user) ──
    case "grantCredits": {
      if (!actor.isMasterAdmin) {
        return NextResponse.json({ error: "Forbidden: Master Admin required" }, { status: 403 });
      }

      const { userId: grantUserId, amount, reason } = body;
      if (!grantUserId || !amount) {
        return NextResponse.json({ error: "Missing userId or amount" }, { status: 400 });
      }

      // Validate amount is a positive integer, capped at 500 per grant
      const grantAmount = Math.floor(Number(amount));
      if (!Number.isFinite(grantAmount) || grantAmount < 1 || grantAmount > 500) {
        return NextResponse.json({ error: "Amount must be between 1 and 500" }, { status: 400 });
      }

      const grantTarget = await prisma.user.findUnique({
        where: { id: grantUserId },
        select: { id: true, email: true, bonusCredits: true },
      });
      if (!grantTarget) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Enforce: max 3 grants per user per calendar month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const grantsThisMonth = await prisma.creditGrant.count({
        where: { userId: grantUserId, createdAt: { gte: startOfMonth } },
      });

      if (grantsThisMonth >= 3) {
        return NextResponse.json(
          { error: `Credit grant limit reached: ${grantTarget.email} has already received 3 grants this month` },
          { status: 429 }
        );
      }

      // Apply the grant atomically
      const [updatedUser] = await prisma.$transaction([
        prisma.user.update({
          where: { id: grantUserId },
          data: { bonusCredits: { increment: grantAmount } },
          select: { bonusCredits: true },
        }),
        prisma.creditGrant.create({
          data: {
            userId: grantUserId,
            amount: grantAmount,
            reason: typeof reason === "string" ? reason.slice(0, 200) : null,
            grantedBy: actor.id,
          },
        }),
        prisma.auditLog.create({
          data: {
            action: "credits.granted",
            actor: actor.id,
            target: grantUserId,
            metadata: { amount: grantAmount, reason: reason || null, email: grantTarget.email, grantNumber: grantsThisMonth + 1 },
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        userId: grantUserId,
        email: grantTarget.email,
        bonusCredits: updatedUser.bonusCredits,
        grantsThisMonth: grantsThisMonth + 1,
        grantsRemaining: 2 - grantsThisMonth,
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
