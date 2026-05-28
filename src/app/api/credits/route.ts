/**
 * RegLayer — Credits API
 *
 * WHY: Frontend needs to display the user's current AI credit balance and plan info.
 * WHAT: GET returns { credits: { used, limit, remaining, daysUntilReset, unlimited } }.
 * HOW: Reads user from session, computes credits based on plan limits and monthly usage.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/database/prisma";
import { checkCredits, PLAN_LIMITS, AI_CREDIT_COSTS, type PlanType } from "@/lib/credits";

/**
 * GET /api/credits — Get current user's credit usage and plan limits
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, plan: true, aiCreditsUsed: true, bonusCredits: true, creditResetAt: true, isMasterAdmin: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const status = await checkCredits(user.id);
  const plan = user.plan as PlanType;
  const limits = PLAN_LIMITS[plan];

  // Calculate days until reset
  const resetAt = new Date(user.creditResetAt);
  const nextReset = new Date(resetAt);
  nextReset.setMonth(nextReset.getMonth() + 1);
  const daysUntilReset = Math.max(0, Math.ceil((nextReset.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return NextResponse.json({
    plan,
    credits: {
      used: status.creditsUsed,
      limit: status.creditsLimit,
      bonus: user.bonusCredits ?? 0,
      totalAvailable: status.creditsLimit === -1 ? -1 : status.creditsLimit + (user.bonusCredits ?? 0),
      remaining: status.creditsRemaining,
      daysUntilReset,
      unlimited: user.isMasterAdmin,
    },
    limits: {
      scansPerMonth: limits.scansPerMonth,
      pagesPerScan: limits.pagesPerScan,
      teamMembers: limits.teamMembers,
      auditLogDays: limits.auditLogDays,
    },
    features: limits.features,
    costs: AI_CREDIT_COSTS,
  });
}
