/**
 * RegLayer — Plan Context
 *
 * WHY: API routes need to know the current user's plan limits to enforce feature gates.
 * WHAT: Gets authenticated user's plan info (limits, usage, remaining credits, permissions).
 * HOW: Reads NextAuth session → queries user → returns merged plan limits + current usage.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import "server-only";

import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits/plan-limits";

export interface PlanContext {
  userId: string;
  email: string;
  plan: PlanType;
  isMasterAdmin: boolean;
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

  return {
    userId: user.id,
    email: user.email,
    plan,
    isMasterAdmin: user.isMasterAdmin,
    limits: PLAN_LIMITS[plan],
  };
}

/**
 * Count scans this month for a user's workspace.
 */
export async function getMonthlyScansCount(userId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
