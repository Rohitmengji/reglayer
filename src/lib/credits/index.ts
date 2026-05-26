import "server-only";

import { prisma } from "@/lib/database/prisma";
import { PLAN_LIMITS, AI_CREDIT_COSTS, type PlanType, type AiAction } from "./plan-limits";

/**
 * Check if a user has enough AI credits for an action.
 * Auto-resets credits if a new billing cycle has started (monthly).
 */
export async function checkCredits(userId: string): Promise<{
  allowed: boolean;
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  plan: PlanType;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, aiCreditsUsed: true, creditResetAt: true, isMasterAdmin: true },
  });

  if (!user) {
    return { allowed: false, creditsUsed: 0, creditsLimit: 0, creditsRemaining: 0, plan: "FREE" };
  }

  // Master admins have unlimited credits
  if (user.isMasterAdmin) {
    return { allowed: true, creditsUsed: 0, creditsLimit: -1, creditsRemaining: -1, plan: user.plan as PlanType };
  }

  const plan = user.plan as PlanType;
  const limit = PLAN_LIMITS[plan].aiCredits;

  // Check if credit reset is due (monthly)
  const now = new Date();
  const resetAt = new Date(user.creditResetAt);
  const monthsSinceReset = (now.getFullYear() - resetAt.getFullYear()) * 12 + (now.getMonth() - resetAt.getMonth());

  let creditsUsed = user.aiCreditsUsed;

  if (monthsSinceReset >= 1) {
    // Reset credits for new month
    await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsUsed: 0, creditResetAt: now },
    });
    creditsUsed = 0;
  }

  const remaining = limit - creditsUsed;

  return {
    allowed: remaining > 0,
    creditsUsed,
    creditsLimit: limit,
    creditsRemaining: Math.max(0, remaining),
    plan,
  };
}

/**
 * Consume AI credits for an action. Returns false if insufficient credits.
 */
export async function consumeCredits(userId: string, action: AiAction): Promise<{
  success: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  cost: number;
}> {
  const status = await checkCredits(userId);
  const cost = AI_CREDIT_COSTS[action];

  // Master admins bypass limits
  if (status.creditsLimit === -1) {
    return { success: true, creditsUsed: 0, creditsRemaining: -1, cost };
  }

  if (status.creditsRemaining < cost) {
    return {
      success: false,
      creditsUsed: status.creditsUsed,
      creditsRemaining: status.creditsRemaining,
      cost,
    };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { aiCreditsUsed: { increment: cost } },
    select: { aiCreditsUsed: true },
  });

  return {
    success: true,
    creditsUsed: updated.aiCreditsUsed,
    creditsRemaining: status.creditsLimit - updated.aiCreditsUsed,
    cost,
  };
}

/**
 * Check if a feature is available for a given plan.
 */
export function hasFeature(plan: PlanType, feature: keyof typeof PLAN_LIMITS.FREE.features): boolean {
  const value = PLAN_LIMITS[plan].features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value !== "summary" && value !== "basic"; // strings: "full" = has feature
}

export { PLAN_LIMITS, AI_CREDIT_COSTS, type PlanType, type AiAction };
