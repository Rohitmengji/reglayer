/**
 * RegLayer — Tree of Thoughts (ToT)
 *
 * Instead of generating multiple ANSWERS (Monte Carlo), generates multiple
 * REASONING APPROACHES and follows the best thinking path.
 *
 * DIFFERENCE FROM OTHER STRATEGIES:
 *   Single-pass:   1 approach → 1 answer
 *   Monte Carlo:   1 approach → N answers → pick best answer
 *   Tree of Thoughts: N approaches → evaluate each → follow best → answer
 *
 * WHY: Complex compliance questions have multiple valid reasoning paths.
 * "Prioritize by severity" vs "Prioritize by legal risk" vs "Prioritize by
 * effort" lead to fundamentally different (and all valid) strategies.
 * ToT explores all paths and picks the most promising one.
 *
 * ALGORITHM:
 *   1. PLAN — Decompose question into 3-5 reasoning branches
 *   2. BRANCH — Generate a partial answer following each approach
 *   3. EVALUATE — Score each branch on promise (1-10)
 *   4. CHOOSE — Follow the highest-scoring branch to completion
 *   5. SYNTHESIZE — Final answer incorporating insights from other branches
 *
 * INSPIRED BY:
 *   - Tree of Thoughts (Yao et al., 2023)
 *   - Graph of Thoughts (Besta et al., 2023)
 *   - Chain-of-Thought (Wei et al., 2022)
 *   - AlphaGo's MCTS (explore + evaluate + select)
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToTConfig {
  /** Number of reasoning branches to explore. Default: 3 */
  branches?: number;
  /** Max depth per branch (reasoning steps). Default: 2 */
  depth?: number;
  /** Temperature for branch generation (diverse thinking). Default: 0.8 */
  branchTemperature?: number;
  /** Temperature for evaluation (consistent scoring). Default: 0.1 */
  evalTemperature?: number;
  /** Whether to incorporate insights from non-winning branches. Default: true */
  synthesize?: boolean;
}

export interface ThoughtBranch {
  id: number;
  approach: string;
  reasoning: string;
  score: number;
  evaluation: string;
}

export interface ToTResult {
  /** Final answer following the best reasoning path */
  answer: string;
  /** The winning branch */
  bestBranch: ThoughtBranch;
  /** All explored branches (sorted by score desc) */
  branches: ThoughtBranch[];
  /** Insights incorporated from non-winning branches */
  crossBranchInsights: string[];
  /** Total tokens used */
  totalTokens: number;
  /** Total cost */
  totalCostUsd: number;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Explore multiple reasoning paths and follow the best one.
 *
 * @param question The complex question requiring multi-path reasoning
 * @param context  Optional grounding context (RAG results, scan data)
 * @param config   Tree of Thoughts configuration
 */
export async function treeOfThoughts(
  question: string,
  context?: string,
  config?: ToTConfig,
): Promise<ToTResult> {
  const numBranches = config?.branches ?? 3;
  const branchTemp = config?.branchTemperature ?? 0.8;
  const evalTemp = config?.evalTemperature ?? 0.1;
  const shouldSynthesize = config?.synthesize ?? true;
  const model = getDefaultModelId() as ModelId;

  if (!model) {
    return {
      answer: "", bestBranch: { id: 0, approach: "", reasoning: "", score: 0, evaluation: "" },
      branches: [], crossBranchInsights: [], totalTokens: 0, totalCostUsd: 0,
    };
  }

  let totalTokens = 0;
  let totalCost = 0;

  const contextBlock = context ? `\nAvailable data:\n${context.slice(0, 1500)}` : "";

  // ── Step 1: PLAN — Generate N reasoning approaches ──────────────────────

  const planResult = await complete({
    model,
    messages: [{
      role: "user",
      content: `You are a strategic planner. Given this complex compliance question, suggest ${numBranches} different REASONING APPROACHES (not answers). Each approach should be a different lens or framework for thinking about the problem.

Question: "${question}"${contextBlock}

Respond with ONLY a JSON array of ${numBranches} objects:
[
  { "id": 1, "approach": "Brief name", "description": "How this approach would reason about the question (2-3 sentences)" },
  ...
]`,
    }],
    temperature: branchTemp,
    maxTokens: 400,
    metadata: { feature: "tot-plan" },
  });

  totalTokens += planResult?.usage.totalTokens ?? 0;
  totalCost += planResult?.cost.totalCost ?? 0;

  let approaches: { id: number; approach: string; description: string }[] = [];
  try {
    const match = planResult?.content?.match(/\[[\s\S]*\]/);
    if (match) approaches = JSON.parse(match[0]);
  } catch { /* parse failure */ }

  // Fallback: generate default approaches
  if (approaches.length === 0) {
    approaches = [
      { id: 1, approach: "Severity-first", description: "Prioritize by violation impact: critical → serious → moderate → minor" },
      { id: 2, approach: "Legal-risk-first", description: "Prioritize by litigation risk and regulatory deadline proximity" },
      { id: 3, approach: "Quick-wins-first", description: "Prioritize by effort-to-impact ratio: easy fixes with high visibility first" },
    ];
  }

  // ── Step 2: BRANCH — Follow each approach to a partial answer ───────────

  const branchPromises = approaches.map(async (approach) => {
    const result = await complete({
      model,
      messages: [{
        role: "user",
        content: `Using the "${approach.approach}" reasoning approach:
${approach.description}

Answer this question step by step:
"${question}"${contextBlock}

Think through this approach systematically. Show your reasoning, then give your answer.`,
      }],
      temperature: 0.5, // moderate — follow the approach but with some creativity
      maxTokens: 800,
      metadata: { feature: `tot-branch-${approach.id}` },
    });

    return {
      id: approach.id,
      approach: approach.approach,
      reasoning: result?.content ?? "No reasoning available.",
      tokens: result?.usage.totalTokens ?? 0,
      cost: result?.cost.totalCost ?? 0,
    };
  });

  const branchResults = await Promise.all(branchPromises);
  for (const br of branchResults) {
    totalTokens += br.tokens;
    totalCost += br.cost;
  }

  // ── Step 3: EVALUATE — Score each branch ────────────────────────────────

  const branchSummaries = branchResults
    .map((b) => `[Branch ${b.id}: ${b.approach}]\n${b.reasoning.slice(0, 600)}`)
    .join("\n\n---\n\n");

  const evalResult = await complete({
    model,
    messages: [{
      role: "user",
      content: `Evaluate these ${branchResults.length} reasoning approaches for the question: "${question}"

Score each 1-10 on: logical soundness, completeness, practicality, and specificity.

${branchSummaries}

Respond with ONLY a JSON array:
[
  { "id": 1, "score": <1-10>, "evaluation": "<one sentence: strength and weakness>" },
  ...
]`,
    }],
    temperature: evalTemp,
    maxTokens: 300,
    metadata: { feature: "tot-evaluate" },
  });

  totalTokens += evalResult?.usage.totalTokens ?? 0;
  totalCost += evalResult?.cost.totalCost ?? 0;

  let evaluations: { id: number; score: number; evaluation: string }[] = [];
  try {
    const match = evalResult?.content?.match(/\[[\s\S]*\]/);
    if (match) evaluations = JSON.parse(match[0]);
  } catch { /* parse failure */ }

  // Build scored branches
  const branches: ThoughtBranch[] = branchResults.map((br) => {
    const eval_ = evaluations.find((e) => e.id === br.id);
    return {
      id: br.id,
      approach: br.approach,
      reasoning: br.reasoning,
      score: eval_?.score ?? 5,
      evaluation: eval_?.evaluation ?? "Not evaluated",
    };
  });

  branches.sort((a, b) => b.score - a.score);
  const bestBranch = branches[0];

  // ── Step 4: SYNTHESIZE — Combine best branch with cross-branch insights ─

  let answer = bestBranch.reasoning;
  const crossBranchInsights: string[] = [];

  if (shouldSynthesize && branches.length > 1) {
    const otherInsights = branches.slice(1)
      .filter((b) => b.score >= 5) // only include reasonably scored branches
      .map((b) => `${b.approach}: ${b.evaluation}`)
      .slice(0, 3);

    if (otherInsights.length > 0) {
      const synthResult = await complete({
        model,
        messages: [{
          role: "user",
          content: `You chose the "${bestBranch.approach}" reasoning approach as the best one for: "${question}"

Best approach's answer:
${bestBranch.reasoning.slice(0, 1500)}

Other approaches had these insights:
${otherInsights.join("\n")}

Write a final, comprehensive answer that follows the best approach but incorporates any valuable insights from the other approaches. Be specific and actionable.`,
        }],
        temperature: 0.3,
        maxTokens: 1200,
        metadata: { feature: "tot-synthesize" },
      });

      totalTokens += synthResult?.usage.totalTokens ?? 0;
      totalCost += synthResult?.cost.totalCost ?? 0;

      if (synthResult?.content) {
        answer = synthResult.content;
        crossBranchInsights.push(...otherInsights);
      }
    }
  }

  return {
    answer,
    bestBranch,
    branches,
    crossBranchInsights,
    totalTokens,
    totalCostUsd: totalCost,
  };
}

/**
 * Get the default reasoning approaches for accessibility compliance.
 * Used as fallback when LLM planning fails, and for UI display.
 */
export function getDefaultApproaches(): { id: number; approach: string; description: string }[] {
  return [
    { id: 1, approach: "Severity-first", description: "Prioritize by violation impact: critical → serious → moderate → minor. Fix the most harmful issues first." },
    { id: 2, approach: "Legal-risk-first", description: "Prioritize by litigation risk and regulatory deadline proximity. Address legally mandated requirements before best practices." },
    { id: 3, approach: "Quick-wins-first", description: "Prioritize by effort-to-impact ratio. Fix easy, high-visibility issues first to show rapid progress." },
    { id: 4, approach: "User-impact-first", description: "Prioritize by number of affected users and severity of their experience degradation." },
    { id: 5, approach: "Standards-coverage", description: "Systematically work through WCAG principles: Perceivable → Operable → Understandable → Robust." },
  ];
}
