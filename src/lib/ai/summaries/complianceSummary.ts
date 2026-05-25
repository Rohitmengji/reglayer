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

import OpenAI from "openai";
import { aiComplianceSummarySchema, type AIComplianceSummary } from "../structuredOutput";
import type { ScanResult, ComplianceReport } from "@/lib/types";

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });
}

/**
 * Generate an executive compliance summary.
 */
export async function generateComplianceSummary(
  scan: ScanResult,
  compliance: ComplianceReport
): Promise<AIComplianceSummary | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const failedRules = compliance.ruleResults
      .filter((r) => !r.passed)
      .map((r) => `${r.rule.name} (${r.rule.regulation})`);

    const response = await getOpenAIClient().chat.completions.create({
      model: "chatgpt-5.4-mini",
      messages: [
        {
          role: "system",
          content: `You are a compliance advisor. Generate executive summaries of accessibility compliance reports. Respond with JSON: { overallAssessment: string (max 1000 chars), topRisks: string[] (max 5), recommendations: string[] (max 5), regulatoryContext: string (max 500 chars, optional) }`,
        },
        {
          role: "user",
          content: `Generate compliance summary:
- URL: ${scan.url}
- Score: ${scan.summary.score}/100
- Compliance: ${compliance.overallCompliance}%
- Total Violations: ${scan.summary.totalViolations}
- Critical: ${scan.summary.critical}, Serious: ${scan.summary.serious}
- Failed Rules: ${failedRules.join(", ") || "None"}
- Top violations by impact: ${scan.violations.slice(0, 5).map((v) => `${v.impact}: ${v.help}`).join("; ")}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const validated = aiComplianceSummarySchema.safeParse(parsed);

    return validated.success ? validated.data : null;
  } catch {
    return null;
  }
}
