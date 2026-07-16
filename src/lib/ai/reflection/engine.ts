/**
 * RegLayer — Self-Reflection Engine
 *
 * LLM generates a response, then critiques and improves its own answer
 * before returning it to the user. Catches errors, hallucinations, and
 * incomplete reasoning that single-pass generation misses.
 *
 * PIPELINE:
 *   Generate → Critique (score 1-10) → if low, Improve → Return
 *
 * WHY:
 *   Single-pass LLM responses frequently:
 *   - Miss edge cases in WCAG criteria
 *   - Over-simplify remediation steps
 *   - Hallucinate non-existent success criteria
 *   - Fail to cite specific regulation sections
 *
 *   Self-reflection catches these before the user sees them.
 *
 * COST:
 *   +1 LLM call for critique (cheap: ~100 output tokens)
 *   +1 LLM call for improvement (only when score < threshold)
 *   Average: 1.3x the cost of single-pass (70% pass first critique)
 *
 * INSPIRED BY:
 *   - Reflexion (Shinn et al., 2023) — self-evaluating agents
 *   - Constitutional AI (Anthropic) — critique + revise
 *   - Self-Refine (Madaan et al., 2023) — iterative self-improvement
 *   - Chain-of-Verification (Meta) — verify then correct
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReflectionConfig {
  /** Minimum critique score (1-10) to accept without improvement. Default: 7 */
  threshold?: number;
  /** Maximum reflection rounds. Default: 2 */
  maxRounds?: number;
  /** Which dimensions to critique. Default: all */
  dimensions?: CritiqueDimension[];
  /** Model for critique (can be cheaper than generation). Default: same */
  critiqueModel?: string;
}

export type CritiqueDimension =
  | "accuracy"       // Are facts correct?
  | "completeness"   // Does it fully answer the question?
  | "groundedness"   // Is it based on provided context (not hallucinated)?
  | "relevance"      // Does it address the actual question?
  | "specificity"    // Does it cite specific criteria/regulations?
  | "actionability"; // Are the recommendations concrete and implementable?

export interface CritiqueResult {
  overallScore: number; // 1-10
  dimensions: Record<CritiqueDimension, { score: number; feedback: string }>;
  shouldImprove: boolean;
  summary: string;
}

export interface ReflectionResult {
  /** Final response (original or improved) */
  response: string;
  /** Whether reflection improved the response */
  improved: boolean;
  /** Number of reflection rounds performed */
  rounds: number;
  /** Critique scores per round */
  critiques: CritiqueResult[];
  /** Total additional tokens used for reflection */
  reflectionTokens: number;
  /** Total additional cost for reflection */
  reflectionCostUsd: number;
}

// ── Default Config ────────────────────────────────────────────────────────────

const ALL_DIMENSIONS: CritiqueDimension[] = [
  "accuracy", "completeness", "groundedness", "relevance", "specificity", "actionability",
];

const DEFAULT_CONFIG: Required<ReflectionConfig> = {
  threshold: 7,
  maxRounds: 2,
  dimensions: ALL_DIMENSIONS,
  critiqueModel: "",
};

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Apply self-reflection to an LLM response.
 *
 * @param response    The initial LLM response to reflect on
 * @param query       The user's original question (for relevance checking)
 * @param context     Any RAG context that was provided (for groundedness checking)
 * @param config      Reflection configuration
 */
export async function reflect(
  response: string,
  query: string,
  context?: string,
  config?: ReflectionConfig,
): Promise<ReflectionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const modelId = (cfg.critiqueModel || getDefaultModelId()) as ModelId;

  if (!modelId) {
    return { response, improved: false, rounds: 0, critiques: [], reflectionTokens: 0, reflectionCostUsd: 0 };
  }

  let currentResponse = response;
  const critiques: CritiqueResult[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  for (let round = 0; round < cfg.maxRounds; round++) {
    // 1. Critique the current response
    const critique = await critiqueResponse(currentResponse, query, context, cfg.dimensions, modelId);
    critiques.push(critique.result);
    totalTokens += critique.tokens;
    totalCost += critique.cost;

    // 2. If good enough, stop
    if (!critique.result.shouldImprove || critique.result.overallScore >= cfg.threshold) {
      return {
        response: currentResponse,
        improved: round > 0,
        rounds: round + 1,
        critiques,
        reflectionTokens: totalTokens,
        reflectionCostUsd: totalCost,
      };
    }

    // 3. Improve based on critique feedback
    const improved = await improveResponse(currentResponse, query, critique.result, modelId);
    currentResponse = improved.response;
    totalTokens += improved.tokens;
    totalCost += improved.cost;
  }

  return {
    response: currentResponse,
    improved: true,
    rounds: cfg.maxRounds,
    critiques,
    reflectionTokens: totalTokens,
    reflectionCostUsd: totalCost,
  };
}

// ── Critique ──────────────────────────────────────────────────────────────────

const CRITIQUE_PROMPT = `You are a quality reviewer for an AI accessibility compliance assistant. Evaluate the response on these dimensions (score 1-10 each):

{{dimensions}}

Respond with ONLY valid JSON:
{
  "overallScore": <1-10>,
  "dimensions": {
    {{dimensionKeys}}
  },
  "summary": "<one sentence: what's the biggest issue, if any>"
}`;

async function critiqueResponse(
  response: string,
  query: string,
  context: string | undefined,
  dimensions: CritiqueDimension[],
  model: ModelId,
): Promise<{ result: CritiqueResult; tokens: number; cost: number }> {
  const dimensionDescriptions = dimensions.map((d) => `- ${d}: ${DIMENSION_DESCRIPTIONS[d]}`).join("\n");
  const dimensionKeys = dimensions.map((d) => `"${d}": { "score": <1-10>, "feedback": "<brief>" }`).join(",\n    ");

  const prompt = CRITIQUE_PROMPT
    .replace("{{dimensions}}", dimensionDescriptions)
    .replace("{{dimensionKeys}}", dimensionKeys);

  const userMsg = [
    `**User Question:** ${query}`,
    context ? `**Context Provided:** ${context.slice(0, 500)}` : "",
    `**AI Response to Evaluate:**\n${response.slice(0, 2000)}`,
  ].filter(Boolean).join("\n\n");

  const result = await complete({
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: userMsg },
    ],
    temperature: 0.1, // deterministic critique
    maxTokens: 300,
    metadata: { feature: "self-reflection-critique" },
  });

  if (!result) {
    return {
      result: { overallScore: 8, dimensions: {} as any, shouldImprove: false, summary: "Critique unavailable" }, // eslint-disable-line @typescript-eslint/no-explicit-any
      tokens: 0,
      cost: 0,
    };
  }

  try {
    const match = result.content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    const parsed = JSON.parse(match[0]);

    const dimResults: Record<string, { score: number; feedback: string }> = {};
    for (const d of dimensions) {
      dimResults[d] = parsed.dimensions?.[d] ?? { score: 7, feedback: "Not evaluated" };
    }

    const overallScore = typeof parsed.overallScore === "number" ? parsed.overallScore : 7;

    return {
      result: {
        overallScore,
        dimensions: dimResults as Record<CritiqueDimension, { score: number; feedback: string }>,
        shouldImprove: overallScore < 7,
        summary: parsed.summary ?? "",
      },
      tokens: result.usage.totalTokens,
      cost: result.cost.totalCost,
    };
  } catch {
    return {
      result: { overallScore: 7, dimensions: {} as any, shouldImprove: false, summary: "Parse error" }, // eslint-disable-line @typescript-eslint/no-explicit-any
      tokens: result.usage.totalTokens,
      cost: result.cost.totalCost,
    };
  }
}

// ── Improvement ───────────────────────────────────────────────────────────────

async function improveResponse(
  response: string,
  query: string,
  critique: CritiqueResult,
  model: ModelId,
): Promise<{ response: string; tokens: number; cost: number }> {
  const feedbackLines = Object.entries(critique.dimensions)
    .filter(([, v]) => v.score < 7)
    .map(([k, v]) => `- ${k} (${v.score}/10): ${v.feedback}`)
    .join("\n");

  const prompt = `Improve this accessibility compliance response based on the critique below.
Keep what's good, fix what's weak. Do NOT start with "Here is the improved response".

**Original question:** ${query}

**Critique (overall ${critique.overallScore}/10):**
${critique.summary}
${feedbackLines}

**Original response:**
${response.slice(0, 3000)}

**Improved response:**`;

  const result = await complete({
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens: 2000,
    metadata: { feature: "self-reflection-improve" },
  });

  return {
    response: result?.content ?? response, // fall back to original if improvement fails
    tokens: result?.usage.totalTokens ?? 0,
    cost: result?.cost.totalCost ?? 0,
  };
}

// ── Dimension Descriptions ────────────────────────────────────────────────────

const DIMENSION_DESCRIPTIONS: Record<CritiqueDimension, string> = {
  accuracy: "Are all facts, WCAG criteria numbers, and regulation references correct? No fabricated standards.",
  completeness: "Does the response fully answer the question, covering all relevant aspects?",
  groundedness: "Is the response based on the provided context/data, not invented information?",
  relevance: "Does the response directly address the user's actual question?",
  specificity: "Does it cite specific WCAG success criteria (e.g., SC 1.4.3), regulation sections, or code examples?",
  actionability: "Are the recommendations concrete steps the user can actually implement?",
};

/**
 * Get all available critique dimensions (for UI display).
 */
export function getCritiqueDimensions(): { id: CritiqueDimension; description: string }[] {
  return ALL_DIMENSIONS.map((d) => ({ id: d, description: DIMENSION_DESCRIPTIONS[d] }));
}

/**
 * Quick quality check — returns just the score without improvement.
 * Useful for evaluation pipelines and monitoring.
 */
export async function quickScore(
  response: string,
  query: string,
  context?: string,
): Promise<{ score: number; summary: string }> {
  const modelId = getDefaultModelId() as ModelId;
  if (!modelId) return { score: 0, summary: "No model available" };

  const result = await critiqueResponse(response, query, context, ["accuracy", "relevance", "groundedness"], modelId);
  return { score: result.result.overallScore, summary: result.result.summary };
}
