/**
 * RegLayer — Demand-Letter claim extraction (server, AI-augmented)
 *
 * WHY: Demand letters are free text. To triage them we need a structured list of the
 *      alleged barriers, mapped to the automated rules RegLayer can check.
 * WHAT: Uses gpt-4o-mini to extract { rawText, ruleId, wcagCriteria, allegedDate } per
 *       alleged claim, validated with Zod and normalized against a known rule set.
 * HOW: Mirrors the repo's AI convention (violationExplainer.ts): OpenAI client, withRetry,
 *      json_object response, zod-validated, graceful null/empty on missing key or failure.
 *      The pure triage core (demandLetter.ts) never depends on this — letters can also be
 *      triaged from a manually-supplied claims array.
 */

import "server-only";

import OpenAI from "openai";
import { z } from "zod";
import { withRetry } from "@/lib/retry";
import type { DemandClaim } from "@/lib/triage/demandLetter";

/**
 * The automated rules a demand-letter claim can be mapped to. Superset of the
 * litigation-weighted rules plus the common axe rules that appear in ADA letters.
 */
export const KNOWN_TRIAGE_RULES = [
  "image-alt",
  "input-image-alt",
  "label",
  "select-name",
  "form-field-multiple-labels",
  "color-contrast",
  "link-name",
  "button-name",
  "keyboard",
  "focus-order-semantics",
  "tabindex",
  "document-title",
  "html-has-lang",
  "heading-order",
  "empty-heading",
  "region",
  "landmark-one-main",
  "bypass",
  "list",
  "listitem",
  "aria-required-attr",
  "aria-valid-attr-value",
  "aria-roles",
  "duplicate-id",
  "frame-title",
  "video-caption",
  "meta-viewport",
] as const;

const parsedClaimSchema = z.object({
  rawText: z.string().min(1).max(600),
  ruleId: z.string().nullable(),
  wcagCriteria: z.string().max(16).nullable(),
  allegedDate: z.string().max(40).nullable(),
});

const parsedClaimsSchema = z.object({
  claims: z.array(parsedClaimSchema).max(60),
});

const KNOWN_SET = new Set<string>(KNOWN_TRIAGE_RULES);

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
}

/** Normalize an AI-suggested allegedDate into an ISO date string, or null. */
function normalizeDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * Extract structured claims from demand-letter text. Returns [] if AI is unavailable
 * or the text yields nothing parseable — callers should fall back to manual claim entry.
 */
export async function parseDemandLetter(letterText: string): Promise<DemandClaim[]> {
  const text = letterText.trim();
  if (!text || !process.env.OPENAI_API_KEY) return [];

  try {
    const response = await withRetry(
      () =>
        getOpenAIClient().chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                `You extract alleged web-accessibility barriers from ADA/Section 508 demand letters. ` +
                `Return JSON: { "claims": [ { "rawText": string (the alleged barrier, <= 600 chars), ` +
                `"ruleId": one of [${KNOWN_TRIAGE_RULES.join(", ")}] or null if none clearly applies, ` +
                `"wcagCriteria": a WCAG criterion like "1.4.3" or null, ` +
                `"allegedDate": an ISO date (YYYY-MM-DD) the letter says the barrier was observed, or null ] }. ` +
                `One entry per distinct alleged barrier. Do not invent claims that are not in the text. ` +
                `Only use a ruleId from the provided list; otherwise null.`,
            },
            { role: "user", content: text.slice(0, 12000) },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 1500,
        }),
      { maxAttempts: 3, baseDelayMs: 1000 }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = parsedClaimsSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return [];

    return parsed.data.claims.map((c, i) => ({
      index: i + 1,
      rawText: c.rawText,
      ruleId: c.ruleId && KNOWN_SET.has(c.ruleId) ? c.ruleId : null,
      wcagCriteria: c.wcagCriteria,
      allegedDate: normalizeDate(c.allegedDate),
    }));
  } catch {
    return [];
  }
}
