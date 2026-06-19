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

import OpenAI from "openai";
import { z } from "zod";
import type { ManualTestItem } from "@/lib/testing/manualTestPlan";
import { consumeCredits } from "@/lib/credits";
import type { AiAction } from "@/lib/credits/plan-limits";

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

// ── OpenAI client ─────────────────────────────────────────────────────────────

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Generate AI-guided testing instructions for a manual test item.
 *
 * - Consumes credits via consumeCredits() before calling OpenAI.
 * - Returns AI-generated guidance when OPENAI_API_KEY is available and credits suffice.
 * - Falls back to the item's existing static guidance on error or missing key.
 * - The fallback is marked aiGenerated:false and must NOT be cached.
 * - This module returns guidance only — never a verdict.
 *
 * @param item - The manual test item to generate guidance for
 * @param userId - The requesting user's ID (for credit consumption). Optional for fallback-only mode.
 */
export async function generateGuidance(item: ManualTestItem, userId?: string): Promise<GuidanceResult> {
  const client = getOpenAIClient();

  if (!client) {
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

  try {
    const evidenceContext = item.evidence.kind === "narration" && item.evidence.steps
      ? `The accessibility tree shows ${item.evidence.steps.length} relevant element(s). ${item.evidence.note ?? ""}`
      : "No specific accessibility tree evidence available for this criterion.";

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an accessibility testing expert. Draft specific, actionable manual testing steps for a WCAG success criterion. Your guidance tells a human HOW to test — you never determine the verdict yourself. Respond with JSON: { "guidance": "string" }. Keep under 800 tokens. Be specific and practical.`,
        },
        {
          role: "user",
          content: `Draft manual testing guidance for:
- Criterion: WCAG ${item.criterion} "${item.title}" (Level ${item.level})
- Principle: ${item.principle}
- Why manual testing is needed: ${item.why}
- Evidence context: ${evidenceContext}

Provide step-by-step instructions a tester can follow to determine pass/fail. Include what to look for, what tools to use (keyboard, browser devtools, screen reader), and what constitutes a pass vs fail for this specific criterion.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return { guidance: item.guidance, aiGenerated: false };
    }

    const parsed = JSON.parse(content);
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
