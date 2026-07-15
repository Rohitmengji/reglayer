/**
 * ---------------------------------------------------------
 * RegLayer — AI Compliance Summary Generator
 * ---------------------------------------------------------
 *
 * Purpose:
 * Generates executive-level compliance summaries from
 * scan results using OpenAI.
 *
 * Why this exists:
 * Executives and legal teams need:
 * - One-paragraph overall assessment
 * - Top risks prioritized by business impact
 * - Actionable recommendations
 * - Regulatory context
 * ---------------------------------------------------------
 */

import { aiComplianceSummarySchema, type AIComplianceSummary } from "../structuredOutput";
import type { ScanResult, ComplianceReport } from "@/lib/types";
import { complete, getDefaultModelId } from "../gateway";
import { buildMessages, getPrompt } from "../prompts/registry";

/**
 * Generate an executive compliance summary.
 */
export async function generateComplianceSummary(
  scan: ScanResult,
  compliance: ComplianceReport
): Promise<AIComplianceSummary | null> {
  const modelId = getDefaultModelId();
  if (!modelId) return null;

  const prompt = getPrompt("compliance-summary");

  try {
    const failedRules = compliance.ruleResults
      .filter((r) => !r.passed)
      .map((r) => `${r.rule.name} (${r.rule.regulation})`);

    const result = await complete({
      model: modelId,
      messages: buildMessages("compliance-summary", {
        "scan.url": scan.url,
        "scan.score": scan.summary.score,
        "scan.compliance": compliance.overallCompliance,
        "scan.totalViolations": scan.summary.totalViolations,
        "scan.critical": scan.summary.critical,
        "scan.serious": scan.summary.serious,
        "scan.failedRules": failedRules.join(", ") || "None",
        "scan.topViolations": scan.violations.slice(0, 5).map((v) => `${v.impact}: ${v.help}`).join("; "),
      }),
      jsonMode: true,
      temperature: prompt.defaultTemperature,
      maxTokens: prompt.defaultMaxTokens,
      metadata: { feature: prompt.feature },
    });

    if (!result) return null;

    const parsed = JSON.parse(result.content);
    const validated = aiComplianceSummarySchema.safeParse(parsed);

    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}
