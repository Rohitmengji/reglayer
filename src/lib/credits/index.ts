/**
 * RegLayer — Credit System
 *
 * WHY: AI features (explanations, fix suggestions) cost money. Credits limit usage per plan.
 * WHAT: Functions to check credit balance, consume credits, handle monthly reset.
 * HOW: Reads user.aiCreditsUsed, compares to plan limit. Resets monthly via creditResetAt timestamp.
 */

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
  bonusCredits: number;
  plan: PlanType;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, aiCreditsUsed: true, bonusCredits: true, creditResetAt: true, isMasterAdmin: true },
  });

  if (!user) {
    return { allowed: false, creditsUsed: 0, creditsLimit: 0, creditsRemaining: 0, bonusCredits: 0, plan: "FREE" };
  }

  // Master admins have unlimited credits
  if (user.isMasterAdmin) {
    return { allowed: true, creditsUsed: 0, creditsLimit: -1, creditsRemaining: -1, bonusCredits: 0, plan: user.plan as PlanType };
  }

  const plan = user.plan as PlanType;
  const limit = PLAN_LIMITS[plan].aiCredits;

  // Check if credit reset is due (monthly).
  // FIX C6: use UTC calendar-month boundaries so the reset trigger matches the
  // displayed next-reset date (getNextCreditReset) and the UTC scan-quota window.
  const now = new Date();
  const resetAt = new Date(user.creditResetAt);
  const monthsSinceReset =
    (now.getUTCFullYear() - resetAt.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - resetAt.getUTCMonth());

  let creditsUsed = user.aiCreditsUsed;

  if (monthsSinceReset >= 1) {
    // Reset credits for new month — bonus credits persist
    await prisma.user.update({
      where: { id: userId },
      data: { aiCreditsUsed: 0, creditResetAt: now },
    });
    creditsUsed = 0;
  }

  const totalAvailable = limit + (user.bonusCredits ?? 0);
  const remaining = totalAvailable - creditsUsed;

  return {
    allowed: remaining > 0,
    creditsUsed,
    creditsLimit: limit,
    creditsRemaining: Math.max(0, remaining),
    bonusCredits: user.bonusCredits ?? 0,
    plan,
  };
}

/**
 * Consume AI credits for an action using atomic database operation.
 * Prevents race conditions by using a conditional update (optimistic locking).
 * Returns false if insufficient credits.
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

  // Atomic update with WHERE guard to prevent race conditions.
  // Only increments if the current usage + cost doesn't exceed limit + bonus.
  // If a concurrent request already consumed credits pushing usage over, this returns 0 rows.
  const totalLimit = status.creditsLimit + status.bonusCredits;
  const result = await prisma.$executeRaw`
    UPDATE users 
    SET "aiCreditsUsed" = "aiCreditsUsed" + ${cost}, "updatedAt" = NOW()
    WHERE id = ${userId} 
      AND "aiCreditsUsed" + ${cost} <= ${totalLimit}
  `;

  if (result === 0) {
    // Race condition: another request consumed credits first
    const refreshed = await checkCredits(userId);
    return {
      success: false,
      creditsUsed: refreshed.creditsUsed,
      creditsRemaining: refreshed.creditsRemaining,
      cost,
    };
  }

  const newUsed = status.creditsUsed + cost;
  return {
    success: true,
    creditsUsed: newUsed,
    creditsRemaining: totalLimit - newUsed,
    cost,
  };
}

/**
 * Refund previously-consumed AI credits for an action.
 *
 * WHY (FIX C7): Credits are consumed BEFORE the expensive/failure-prone work
 * runs (e.g. an OpenAI call, or a scan). If that work fails or is skipped, the
 * credit must not be permanently consumed. Callers that consume credits up
 * front should call this on their failure path so the user is made whole.
 *
 * Uses an atomic, floored decrement so a refund can never push usage below 0
 * (e.g. if a monthly reset happened between consume and refund). Master admins
 * never had credits consumed, so refunds are a no-op for them.
 */
export async function refundCredits(userId: string, action: AiAction): Promise<void> {
  const cost = AI_CREDIT_COSTS[action];
  if (cost <= 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isMasterAdmin: true },
  });
  // Master admins never had credits deducted — nothing to refund.
  if (!user || user.isMasterAdmin) return;

  // Floored decrement: GREATEST(0, used - cost) prevents negative balances.
  await prisma.$executeRaw`
    UPDATE users
    SET "aiCreditsUsed" = GREATEST(0, "aiCreditsUsed" - ${cost}), "updatedAt" = NOW()
    WHERE id = ${userId}
  `;
}

/**
 * The canonical calendar-month reset boundary used for AI credits.
 *
 * FIX C6: The displayed "next reset" date must derive from the SAME rule that
 * actually triggers the reset. Credits reset at the start of a new calendar
 * month (see checkCredits' month-delta logic). Compute that boundary in UTC so
 * it agrees with the UTC-based monthly scan-quota window (FIX C5) and never
 * drifts by a day in non-UTC server timezones.
 *
 * @returns The first instant of next month, in UTC.
 */
export function getNextCreditReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
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
