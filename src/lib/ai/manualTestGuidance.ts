/**
 * ---------------------------------------------------------
 * RegLayer — AI Manual Test Guidance
 * ---------------------------------------------------------
 *
 * WHY: Testers need concrete, criterion-specific how-to-test steps.
 *      AI can draft richer guidance than static text — but the human
 *      always owns the pass/fail verdict.
 * WHAT: generateGuidance() drafts testing instructions for a manual test item.
 *       Falls back to static guidance when OPENAI_API_KEY is unset or on error.
 * HOW: Follows the existing AI module pattern (Zod schema, OpenAI call,
 *      safeParse, null-safe fallback). Never caches fallback output.
 *      Consumes credits via consumeCredits().
 * ---------------------------------------------------------
 */

import { z } from "zod";
import type { ManualTestItem } from "@/lib/testing/manualTestPlan";
import { consumeCredits } from "@/lib/credits";
import type { AiAction } from "@/lib/credits/plan-limits";
import { complete, getDefaultModelId } from "./gateway";
import { buildMessages, getPrompt } from "./prompts/registry";

// ── Schema ────────────────────────────────────────────────────────────────────

export const manualTestGuidanceSchema = z.object({
  guidance: z.string().min(10).max(2000),
});

export type ManualTestGuidanceOutput = z.infer<typeof manualTestGuidanceSchema>;

// ── Result type ───────────────────────────────────────────────────────────────

export interface GuidanceResult {
  guidance: string;
  aiGenerated: boolean;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Generate AI-guided testing instructions for a manual test item.
 *
 * - Consumes credits via consumeCredits() before calling the AI gateway.
 * - Returns AI-generated guidance when a provider is available and credits suffice.
 * - Falls back to the item's existing static guidance on error or missing key.
 * - The fallback is marked aiGenerated:false and must NOT be cached.
 * - This module returns guidance only — never a verdict.
 *
 * @param item - The manual test item to generate guidance for
 * @param userId - The requesting user's ID (for credit consumption). Optional for fallback-only mode.
 */
export async function generateGuidance(item: ManualTestItem, userId?: string): Promise<GuidanceResult> {
  const modelId = getDefaultModelId();

  if (!modelId) {
    return { guidance: item.guidance, aiGenerated: false };
  }

  // Consume credits before making the AI call
  if (userId) {
    const creditResult = await consumeCredits(userId, "manualTestGuidance" as AiAction);
    if (!creditResult.success) {
      // Insufficient credits — return fallback (do not cache)
      return { guidance: item.guidance, aiGenerated: false };
    }
  }

  const prompt = getPrompt("manual-test-guidance");

  try {
    const evidenceContext = item.evidence.kind === "narration" && item.evidence.steps
      ? `The accessibility tree shows ${item.evidence.steps.length} relevant element(s). ${item.evidence.note ?? ""}`
      : "No specific accessibility tree evidence available for this criterion.";

    const result = await complete({
      model: modelId,
      messages: buildMessages("manual-test-guidance", {
        "item.criterion": item.criterion,
        "item.title": item.title,
        "item.level": item.level,
        "item.principle": item.principle,
        "item.why": item.why,
        "item.evidenceContext": evidenceContext,
      }),
      jsonMode: true,
      temperature: prompt.defaultTemperature,
      maxTokens: prompt.defaultMaxTokens,
      metadata: {
        feature: prompt.feature,
        userId,
      },
    });

    if (!result) {
      return { guidance: item.guidance, aiGenerated: false };
    }

    const parsed = JSON.parse(result.content);
    const validated = manualTestGuidanceSchema.safeParse(parsed);

    if (validated.success) {
      return { guidance: validated.data.guidance, aiGenerated: true };
    }

    // Validation failed — use fallback
    return { guidance: item.guidance, aiGenerated: false };
  } catch {
    // API error — graceful fallback
    return { guidance: item.guidance, aiGenerated: false };
  }
}
