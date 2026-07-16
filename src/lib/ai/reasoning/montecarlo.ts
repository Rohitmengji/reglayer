/**
 * RegLayer — Monte Carlo Reasoning
 *
 * Generate N candidate responses in parallel (high temperature for diversity),
 * score each one, return the highest-scoring response.
 *
 * WHY: A single LLM call at temperature 0.4 gives one "average" answer.
 * N calls at temperature 0.8 give N diverse answers — the best one is
 * almost always better than the single average one.
 *
 * COST: N × single call. Use N=3-5 for important questions, N=1 for simple.
 * Scoring adds 1 cheap call. Total: (N+1) × base cost.
 *
 * INSPIRED BY:
 *   - Best-of-N sampling (OpenAI internal technique)
 *   - Monte Carlo Tree Search (AlphaGo)
 *   - Self-Consistency (Wang et al., 2023) — sample + majority vote
 *   - Universal Self-Consistency (Chen et al., 2023)
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonteCarloConfig {
  /** Number of candidate responses to generate. Default: 5 */
  candidates?: number;
  /** Temperature for candidate generation (higher = more diverse). Default: 0.8 */
  generationTemperature?: number;
  /** Temperature for scoring (lower = more consistent). Default: 0.1 */
  scoringTemperature?: number;
  /** Max tokens per candidate. Default: 1500 */
  maxTokens?: number;
}

export interface MonteCarloResult {
  /** The highest-scoring response */
  bestResponse: string;
  /** Score of the best response (1-10) */
  bestScore: number;
  /** All candidates with scores (sorted by score desc) */
  candidates: ScoredCandidate[];
  /** Confidence: 1 - (score variance / max variance). High = candidates agree. */
  confidence: number;
  /** Total tokens across all candidates + scoring */
  totalTokens: number;
  /** Total cost */
  totalCostUsd: number;
}

export interface ScoredCandidate {
  index: number;
  response: string;
  score: number;
  reasoning: string;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Generate N candidate responses, score each, return the best one.
 *
 * @param systemPrompt System prompt for the generation
 * @param query        User's question
 * @param config       Monte Carlo configuration
 */
export async function monteCarloReason(
  systemPrompt: string,
  query: string,
  config?: MonteCarloConfig,
): Promise<MonteCarloResult> {
  const n = config?.candidates ?? 5;
  const genTemp = config?.generationTemperature ?? 0.8;
  const scoreTemp = config?.scoringTemperature ?? 0.1;
  const maxTokens = config?.maxTokens ?? 1500;
  const model = getDefaultModelId() as ModelId;

  if (!model) {
    return { bestResponse: "", bestScore: 0, candidates: [], confidence: 0, totalTokens: 0, totalCostUsd: 0 };
  }

  let totalTokens = 0;
  let totalCost = 0;

  // 1. Generate N candidates in parallel
  const candidatePromises = Array.from({ length: n }, (_, i) =>
    complete({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: genTemp,
      maxTokens,
      metadata: { feature: `montecarlo-candidate-${i}` },
    }),
  );

  const responses = await Promise.all(candidatePromises);

  const candidates: string[] = [];
  for (const r of responses) {
    candidates.push(r?.content ?? "");
    totalTokens += r?.usage.totalTokens ?? 0;
    totalCost += r?.cost.totalCost ?? 0;
  }

  // Filter out empty candidates
  const validCandidates = candidates.filter((c) => c.length > 0);
  if (validCandidates.length === 0) {
    return { bestResponse: "", bestScore: 0, candidates: [], confidence: 0, totalTokens, totalCostUsd: totalCost };
  }

  // 2. Score all candidates in a single LLM call
  const scored = await scoreCandidates(validCandidates, query, model, scoreTemp);
  totalTokens += scored.tokens;
  totalCost += scored.cost;

  // 3. Sort by score (descending)
  const sortedCandidates = scored.results.sort((a, b) => b.score - a.score);

  // 4. Calculate confidence from score variance
  const scores = sortedCandidates.map((c) => c.score);
  const confidence = calculateConfidence(scores);

  return {
    bestResponse: sortedCandidates[0]?.response ?? "",
    bestScore: sortedCandidates[0]?.score ?? 0,
    candidates: sortedCandidates,
    confidence,
    totalTokens,
    totalCostUsd: totalCost,
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

async function scoreCandidates(
  candidates: string[],
  query: string,
  model: ModelId,
  temperature: number,
): Promise<{ results: ScoredCandidate[]; tokens: number; cost: number }> {
  const candidateList = candidates
    .map((c, i) => `[Candidate ${i + 1}]\n${c.slice(0, 800)}`)
    .join("\n\n---\n\n");

  const result = await complete({
    model,
    messages: [{
      role: "user",
      content: `Score these ${candidates.length} AI responses to the question: "${query}"

Score each 1-10 on: accuracy, completeness, specificity, actionability.

${candidateList}

Respond with ONLY a JSON array:
[
  { "index": 1, "score": <1-10>, "reasoning": "<brief>" },
  ...
]`,
    }],
    temperature,
    maxTokens: 400,
    metadata: { feature: "montecarlo-scoring" },
  });

  if (!result) {
    return {
      results: candidates.map((c, i) => ({ index: i, response: c, score: 5, reasoning: "Scoring unavailable" })),
      tokens: 0,
      cost: 0,
    };
  }

  try {
    const match = result.content.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array");

    const scores: { index: number; score: number; reasoning: string }[] = JSON.parse(match[0]);

    return {
      results: candidates.map((c, i) => {
        const scoreEntry = scores.find((s) => s.index === i + 1) ?? { score: 5, reasoning: "Not scored" };
        return {
          index: i,
          response: c,
          score: scoreEntry.score,
          reasoning: scoreEntry.reasoning,
        };
      }),
      tokens: result.usage.totalTokens,
      cost: result.cost.totalCost,
    };
  } catch {
    return {
      results: candidates.map((c, i) => ({ index: i, response: c, score: 5, reasoning: "Parse error" })),
      tokens: result.usage.totalTokens,
      cost: result.cost.totalCost,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate confidence from score variance.
 * High variance = low confidence (candidates disagree on quality).
 * Low variance = high confidence (candidates are consistently good/bad).
 */
export function calculateConfidence(scores: number[]): number {
  if (scores.length < 2) return 1;

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const maxVariance = 20.25; // max possible variance for scores 1-10

  return Math.round((1 - variance / maxVariance) * 100) / 100;
}
