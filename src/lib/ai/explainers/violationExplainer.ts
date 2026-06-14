/**
 * ---------------------------------------------------------
 * RegLayer — AI Violation Explainer
 * ---------------------------------------------------------
 *
 * Purpose:
 * Uses OpenAI to generate human-readable explanations
 * of accessibility violations for non-technical stakeholders.
 *
 * Why this exists:
 * Raw axe-core output is developer-facing. Stakeholders need:
 * - Plain-language impact descriptions
 * - Business risk explanations
 * - Actionable remediation steps
 *
 * Engineering Notes:
 * - AI is an augmentation layer only.
 * - All outputs are validated with Zod schemas.
 * - Gracefully degrades if OpenAI is unavailable.
 * - Never blocks core scan functionality.
 * ---------------------------------------------------------
 */

import OpenAI from "openai";
import { aiExplanationSchema, type AIExplanation } from "../structuredOutput";
import type { AccessibilityViolation } from "@/lib/types";
import { withRetry } from "@/lib/retry";

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });
}

/**
 * Generate a plain-language explanation of a violation.
 */
export async function explainViolation(
  violation: AccessibilityViolation
): Promise<AIExplanation | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  try {
    const response = await withRetry(
      () => getOpenAIClient().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
        {
          role: "system",
          content: `You are an accessibility compliance expert. Explain web accessibility violations in clear, non-technical language. Respond with JSON matching this schema: { summary: string (max 500 chars), impact: string (max 300 chars), recommendation: string (max 500 chars), technicalDetail: string (max 1000 chars, optional), confidence: number 0-1 }`,
        },
        {
          role: "user",
          content: `Explain this accessibility violation:
- Rule: ${violation.id}
- Impact: ${violation.impact}
- Description: ${violation.description}
- Help: ${violation.help}
- WCAG Tags: ${violation.wcagTags.join(", ")}
- Affected elements: ${violation.nodes.length}
- Example HTML: ${violation.nodes[0]?.html ?? "N/A"}
- Failure: ${violation.nodes[0]?.failureSummary ?? "N/A"}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 500,
    }),
      { maxAttempts: 3, baseDelayMs: 1000 }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = aiExplanationSchema.safeParse(parsed);

    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}

/**
 * Generate explanations for all violations in a scan.
 * Processes in parallel with rate limiting.
 */
export async function explainAllViolations(
  violations: AccessibilityViolation[]
): Promise<Map<string, AIExplanation>> {
  const explanations = new Map<string, AIExplanation>();

  if (!process.env.OPENAI_API_KEY) return explanations;

  // Process in batches of 3 to respect rate limits
  const batchSize = 3;
  for (let i = 0; i < violations.length; i += batchSize) {
    const batch = violations.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((v) => explainViolation(v).then((r) => ({ id: v.id, result: r })))
    );

    for (const { id, result } of results) {
      if (result) explanations.set(id, result);
    }
  }

  return explanations;
}
