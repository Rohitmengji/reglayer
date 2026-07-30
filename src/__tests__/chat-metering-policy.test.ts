/**
 * Chat is metered by a daily allowance, NOT by AI credits.
 *
 * The reasoning, so a future change doesn't quietly undo it:
 *  - Credits are the budget for deliberate, expensive actions on a scan. A FREE user
 *    has 25 and a single `insightsAnalysis` costs 5. If conversation drew from the
 *    same pool, a user could talk away the budget they need for the actual product.
 *  - Chat still cannot be unlimited: it is a model call behind a free signup, and the
 *    per-minute burst limiter alone would still permit 14,400 messages a day.
 *
 * These tests pin both halves of that: chat must not appear in the credit table, and
 * every plan must carry a bounded (or explicitly unlimited) daily allowance.
 */
import { describe, it, expect } from "vitest";
import { PLAN_LIMITS, AI_CREDIT_COSTS } from "@/lib/credits/plan-limits";

describe("chat metering policy", () => {
  it("does not bill conversation from the AI credit pool", () => {
    expect(AI_CREDIT_COSTS).not.toHaveProperty("chatMessage");
    expect(Object.keys(AI_CREDIT_COSTS)).not.toContain("chat");
  });

  it("gives every plan a daily chat allowance", () => {
    for (const [name, limits] of Object.entries(PLAN_LIMITS)) {
      const daily = limits.chatMessagesPerDay;
      expect(daily, `${name} is missing chatMessagesPerDay`).toBeTypeOf("number");
      // -1 is the codebase's "unlimited" sentinel; anything else must be a real cap.
      expect(daily === -1 || daily > 0, `${name} has a nonsensical allowance: ${daily}`).toBe(true);
    }
  });

  it("does not let a cheaper plan out-chat a more expensive one", () => {
    const rank = (n: number) => (n === -1 ? Infinity : n);
    expect(rank(PLAN_LIMITS.PRO.chatMessagesPerDay)).toBeGreaterThan(
      rank(PLAN_LIMITS.FREE.chatMessagesPerDay),
    );
    expect(rank(PLAN_LIMITS.ENTERPRISE.chatMessagesPerDay)).toBeGreaterThanOrEqual(
      rank(PLAN_LIMITS.PRO.chatMessagesPerDay),
    );
  });

  it("keeps the free allowance well below what the burst limiter alone would permit", () => {
    // The `ai` preset is 10/min, i.e. 14,400/day — the number this cap exists to avoid.
    expect(PLAN_LIMITS.FREE.chatMessagesPerDay).toBeLessThan(14_400);
  });
});
