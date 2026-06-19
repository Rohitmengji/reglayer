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

import OpenAI from "openai";
import { z } from "zod";
import { consumeCredits } from "@/lib/credits";
import type { AiAction } from "@/lib/credits/plan-limits";
import { withRetry } from "@/lib/retry";

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export const VISUAL_CATEGORIES = [
  "text-in-image",
  "color-only",
  "low-contrast",
  "focus-visibility",
  "meaningful-image",
  "layout",
  "other",
] as const;
export type VisualCategory = (typeof VISUAL_CATEGORIES)[number];

export interface VisualFinding {
  category: VisualCategory;
  /** What the model saw and why it may be an accessibility problem. */
  issue: string;
  severity: "critical" | "serious" | "moderate" | "minor";
  /** Model's self-reported confidence 0–1 — surfaced so users can triage. */
  confidence: number;
}

const SEVERITIES = ["critical", "serious", "moderate", "minor"] as const;
const MAX_FINDINGS = 8;

/**
 * Pure: validate + clamp a raw model payload into VisualFinding[]. Drops entries
 * that don't validate, coerces unknown categories to "other", clamps confidence
 * to [0,1], and caps the count. Unit-tested.
 */
export function normalizeVisualFindings(raw: unknown): VisualFinding[] {
  const itemSchema = z.object({
    category: z.string().optional(),
    issue: z.string().min(1).max(400),
    severity: z.string().optional(),
    confidence: z.coerce.number().optional(),
  });

  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { findings?: unknown })?.findings)
      ? (raw as { findings: unknown[] }).findings
      : [];

  const out: VisualFinding[] = [];
  for (const entry of list) {
    const parsed = itemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const cat = parsed.data.category as VisualCategory;
    const sev = parsed.data.severity ?? "";
    const conf = typeof parsed.data.confidence === "number" && Number.isFinite(parsed.data.confidence)
      ? Math.min(1, Math.max(0, parsed.data.confidence))
      : 0.5;
    out.push({
      category: (VISUAL_CATEGORIES as readonly string[]).includes(cat) ? cat : "other",
      issue: parsed.data.issue.trim(),
      severity: (SEVERITIES as readonly string[]).includes(sev) ? (sev as VisualFinding["severity"]) : "moderate",
      confidence: conf,
    });
    if (out.length >= MAX_FINDINGS) break;
  }
  return out;
}

const SYSTEM_PROMPT = `You are a senior accessibility auditor reviewing a SCREENSHOT of a web page.
Report ONLY issues that are visually apparent and that an automated DOM/axe scanner CANNOT reliably detect. Focus on:
- text-in-image: meaningful text rendered inside an image/graphic (not real HTML text)
- color-only: information conveyed by color alone (e.g. red/green status with no label/icon)
- low-contrast: text that visually appears to have insufficient contrast against its background
- focus-visibility: interactive elements that appear to lack a visible focus indicator
- meaningful-image: images that look informative and would need descriptive alt text
- layout: visual layout problems that impede readability (overlap, truncation, tiny targets)
Do NOT report things a DOM scanner already catches (missing alt attributes, ARIA syntax, etc.).
Respond with JSON: { "findings": [ { "category": <one of the above or "other">, "issue": string, "severity": "critical"|"serious"|"moderate"|"minor", "confidence": number 0-1 } ] }.
Be conservative: only report what you can actually see. Max 8 findings. If nothing visually apparent, return an empty findings array.`;

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
  const client = getOpenAIClient();
  if (!client || !screenshotBase64) {
    return { findings: [], aiGenerated: false };
  }

  if (opts?.userId) {
    const credit = await consumeCredits(opts.userId, "visualScan" as AiAction);
    if (!credit.success) {
      return { findings: [], aiGenerated: false };
    }
  }

  try {
    const mime = opts?.mime ?? "image/jpeg";
    const response = await withRetry(
      () =>
        client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Review this page screenshot for visually-apparent accessibility issues." },
                { type: "image_url", image_url: { url: `data:${mime};base64,${screenshotBase64}` } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 700,
        }),
      { maxAttempts: 2, baseDelayMs: 1000 },
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return { findings: [], aiGenerated: false };

    const findings = normalizeVisualFindings(JSON.parse(content));
    return { findings, aiGenerated: true };
  } catch {
    return { findings: [], aiGenerated: false };
  }
}
