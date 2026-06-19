/**
 * RegLayer — AI Visual Review: pure types + normalizer
 *
 * WHY: The normalizer must be unit-testable WITHOUT dragging in the OpenAI client
 *      or the credits/prisma (`server-only`) chain that visualScan.ts needs. This
 *      module has ZERO server imports — only zod — so tests can import it directly.
 * WHAT: VisualFinding shape, the allowed categories, and normalizeVisualFindings().
 */

import { z } from "zod";

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
export const MAX_VISUAL_FINDINGS = 8;

/**
 * Pure: validate + clamp a raw model payload into VisualFinding[]. Drops entries
 * that don't validate, coerces unknown categories to "other", clamps confidence
 * to [0,1], defaults missing severity to "moderate", and caps the count.
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
    const conf =
      typeof parsed.data.confidence === "number" && Number.isFinite(parsed.data.confidence)
        ? Math.min(1, Math.max(0, parsed.data.confidence))
        : 0.5;
    out.push({
      category: (VISUAL_CATEGORIES as readonly string[]).includes(cat) ? cat : "other",
      issue: parsed.data.issue.trim(),
      severity: (SEVERITIES as readonly string[]).includes(sev) ? (sev as VisualFinding["severity"]) : "moderate",
      confidence: conf,
    });
    if (out.length >= MAX_VISUAL_FINDINGS) break;
  }
  return out;
}
