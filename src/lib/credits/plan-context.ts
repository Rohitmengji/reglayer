/**
 * RegLayer — Plan Context
 *
 * WHY: API routes need to know the current user's plan limits to enforce feature gates.
 * WHAT: Gets authenticated user's plan info (limits, usage, remaining credits, permissions).
 * HOW: Reads NextAuth session → queries user + workspace role → resolves effective limits.
 *
 * Limit Resolution Strategy:
 * - Master Admin: Unlimited (bypasses all limits)
 * - Workspace Admin/Owner: Elevated scan limits via ADMIN_SCAN_LIMITS
 * - Member/Viewer: Standard plan limits from PLAN_LIMITS
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import "server-only";

import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, ADMIN_SCAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";

type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface PlanContext {
  userId: string;
  email: string;
  plan: PlanType;
  isMasterAdmin: boolean;
  workspaceRole: WorkspaceRole | null;
  /** Effective scan limit after role-based override (-1 = unlimited) */
  effectiveScansPerMonth: number;
  limits: (typeof PLAN_LIMITS)[PlanType];
}

/**
 * Get the current user's plan context for limit enforcement.
 * Returns null if unauthenticated.
 */
export async function getPlanContext(): Promise<PlanContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, email: true, plan: true, isMasterAdmin: true },
  });

  if (!user) return null;

  const plan = user.plan as PlanType;
  const planLimits = PLAN_LIMITS[plan];

  // Resolve workspace role for role-based limit overrides
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { role: true },
    orderBy: { joinedAt: "asc" },
  });

  const workspaceRole = (membership?.role as WorkspaceRole) ?? null;
  const isAdminRole = workspaceRole === "OWNER" || workspaceRole === "ADMIN";

  // Effective scan limit: master admin → unlimited, admin role → elevated, others → plan default
  let effectiveScansPerMonth: number;
  if (user.isMasterAdmin) {
    effectiveScansPerMonth = -1;
  } else if (isAdminRole) {
    effectiveScansPerMonth = ADMIN_SCAN_LIMITS[plan] ?? planLimits.scansPerMonth;
  } else {
    effectiveScansPerMonth = planLimits.scansPerMonth;
  }

  return {
    userId: user.id,
    email: user.email,
    plan,
    isMasterAdmin: user.isMasterAdmin,
    workspaceRole,
    effectiveScansPerMonth,
    limits: planLimits,
  };
}

/**
 * Count scans this month for a user's workspace.
 */
export async function getMonthlyScansCount(userId: string): Promise<number> {
  // FIX C5: use an explicit UTC month boundary. A server-local boundary
  // miscounts near month-end when the server runs in a non-UTC timezone
  // (Scan.createdAt is stored in UTC), letting users over/under their quota.
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    select: { workspaceId: true },
  });

  if (!membership) return 0;

  return prisma.scan.count({
    where: {
      workspaceId: membership.workspaceId,
      createdAt: { gte: startOfMonth },
    },
  });
}
