/**
 * RegLayer — AI Visual Review (vision-augmented accessibility analysis)
 *
 * WHY: Rule engines (axe) analyze the DOM — they cannot SEE the page, so they
 *      miss the whole class of issues that are only visually apparent: text baked
 *      into images, information conveyed by color alone, text that looks too
 *      low-contrast, and missing/invisible focus indicators. A vision model can
 *      flag these by actually looking at a screenshot.
 * WHAT: analyzeScreenshotForA11y() sends a page screenshot to a vision model and
 *       returns structured, severity-tagged findings.
 * HOW: Mirrors the established AI pattern — null-safe (no key → no-op), credit-
 *      metered, Zod-validated, retry-wrapped. Findings are AI-SUGGESTED and must
 *      be presented as needing human confirmation; they are NEVER folded into the
 *      axe score. Fallback/empty results are never cached.
 */

import { consumeCredits } from "@/lib/credits";
import type { AiAction } from "@/lib/credits/plan-limits";
import { complete, getDefaultModelId } from "./gateway";
import { normalizeVisualFindings, type VisualFinding } from "./visualFindings";
import { getPrompt } from "./prompts/registry";

/**
 * Analyze a page screenshot for visually-apparent accessibility issues.
 *
 * @param screenshotBase64 - base64 JPEG/PNG (no data: prefix).
 * @param mime - image mime type (default image/jpeg).
 * @param userId - requesting user (for credit metering); when omitted, no credits charged.
 * @returns findings + aiGenerated flag. aiGenerated:false means AI was unavailable
 *          (no key / no credits / error) and the result must NOT be cached.
 */
export async function analyzeScreenshotForA11y(
  screenshotBase64: string,
  opts?: { mime?: string; userId?: string },
): Promise<{ findings: VisualFinding[]; aiGenerated: boolean }> {
  const modelId = getDefaultModelId();
  if (!modelId || !screenshotBase64) {
    return { findings: [], aiGenerated: false };
  }

  if (opts?.userId) {
    const credit = await consumeCredits(opts.userId, "visualScan" as AiAction);
    if (!credit.success) {
      return { findings: [], aiGenerated: false };
    }
  }

  const prompt = getPrompt("visual-scan");

  try {
    const mime = opts?.mime ?? "image/jpeg";
    const result = await complete({
      model: modelId,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: [
            { type: "text", text: "Review this page screenshot for visually-apparent accessibility issues." },
            { type: "image", data: screenshotBase64, mimeType: mime },
          ],
        },
      ],
      jsonMode: true,
      temperature: prompt.defaultTemperature,
      maxTokens: prompt.defaultMaxTokens,
      metadata: {
        feature: prompt.feature,
        userId: opts?.userId,
      },
    });

    if (!result) return { findings: [], aiGenerated: false };

    const findings = normalizeVisualFindings(JSON.parse(result.content));
    return { findings, aiGenerated: true };
  } catch {
    return { findings: [], aiGenerated: false };
  }
}
