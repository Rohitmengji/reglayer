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

import { aiExplanationSchema, type AIExplanation } from "../structuredOutput";
import type { AccessibilityViolation } from "@/lib/types";
import { complete, isAIAvailable, getDefaultModelId } from "../gateway";
import { buildMessages, getPrompt } from "../prompts/registry";

/**
 * Generate a plain-language explanation of a violation.
 */
export async function explainViolation(
  violation: AccessibilityViolation
): Promise<AIExplanation | null> {
  const modelId = getDefaultModelId();
  if (!modelId) return null;

  const prompt = getPrompt("violation-explainer");

  try {
    const result = await complete({
      model: modelId,
      messages: buildMessages("violation-explainer", {
        "violation.id": violation.id,
        "violation.impact": violation.impact,
        "violation.description": violation.description,
        "violation.help": violation.help,
        "violation.wcagTags": violation.wcagTags.join(", "),
        "violation.nodeCount": violation.nodes.length,
        "violation.exampleHtml": violation.nodes[0]?.html ?? "N/A",
        "violation.failureSummary": violation.nodes[0]?.failureSummary ?? "N/A",
      }),
      jsonMode: true,
      temperature: prompt.defaultTemperature,
      maxTokens: prompt.defaultMaxTokens,
      metadata: { feature: prompt.feature },
    });

    if (!result) return null;

    const parsed = JSON.parse(result.content);
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

  if (!isAIAvailable()) return explanations;

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
