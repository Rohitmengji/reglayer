/**
 * RegLayer — Debate Mode
 *
 * Two agents argue opposing positions, then a judge synthesizes the best answer.
 * Produces higher-quality responses for ambiguous compliance questions where
 * a single perspective misses nuance.
 *
 * WHEN TO USE:
 *   - "Is our site ADA compliant?" (depends on interpretation)
 *   - "Do we need VPAT for this product?" (legal gray area)
 *   - "Is this violation critical or moderate?" (subjective)
 *
 * INSPIRED BY:
 *   - Society of Mind (Minsky) — multiple perspectives
 *   - Debate (Irving et al., 2018) — AI safety through debate
 *   - Constitutional AI (Anthropic) — multi-perspective evaluation
 *   - LLM-as-Judge (Zheng et al., 2023)
 */

import "server-only";

import { complete, getDefaultModelId } from "@/lib/ai/gateway";
import type { ModelId } from "@/lib/ai/gateway/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DebateConfig {
  /** Number of back-and-forth rounds. Default: 2 */
  rounds?: number;
  /** Temperature for debaters (higher = more creative arguments). Default: 0.7 */
  debaterTemperature?: number;
  /** Temperature for judge (lower = more objective). Default: 0.2 */
  judgeTemperature?: number;
}

export interface DebateResult {
  /** The judge's final synthesized answer */
  answer: string;
  /** Which side the judge favored */
  winner: "A" | "B" | "balanced";
  /** Judge's confidence (0-1) */
  confidence: number;
  /** The dissenting view (what the losing side argued) */
  dissent: string;
  /** Full debate transcript */
  transcript: DebateTurn[];
  /** Total tokens used across all participants */
  totalTokens: number;
  /** Total cost */
  totalCostUsd: number;
}

export interface DebateTurn {
  speaker: "A" | "B" | "Judge";
  round: number;
  content: string;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run a structured debate between two AI agents on a question.
 *
 * @param question The compliance question to debate
 * @param context  Optional RAG context for grounding
 * @param config   Debate configuration
 */
export async function debate(
  question: string,
  context?: string,
  config?: DebateConfig,
): Promise<DebateResult> {
  const rounds = config?.rounds ?? 2;
  const debaterTemp = config?.debaterTemperature ?? 0.7;
  const judgeTemp = config?.judgeTemperature ?? 0.2;
  const model = getDefaultModelId() as ModelId;

  if (!model) {
    return {
      answer: "AI unavailable for debate.",
      winner: "balanced",
      confidence: 0,
      dissent: "",
      transcript: [],
      totalTokens: 0,
      totalCostUsd: 0,
    };
  }

  const transcript: DebateTurn[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  const contextBlock = context ? `\n\nRelevant data:\n${context.slice(0, 1500)}` : "";

  // Agent A: Advocate (argues the positive/compliant position)
  const agentASystem = `You are Agent A in a compliance debate. You argue the POSITIVE position — that the site/product IS compliant or that the issue IS less severe than it appears. Be specific, cite WCAG criteria and regulations. Challenge Agent B's arguments with counterpoints.${contextBlock}`;

  // Agent B: Critic (argues the negative/non-compliant position)
  const agentBSystem = `You are Agent B in a compliance debate. You argue the CRITICAL position — that the site/product is NOT fully compliant and that issues ARE significant. Be specific, cite WCAG criteria and legal risks. Challenge Agent A's arguments with counterpoints.${contextBlock}`;

  // Debate rounds
  const history: { role: "user" | "assistant"; content: string }[] = [];

  for (let round = 1; round <= rounds; round++) {
    // Agent A argues
    const aPrompt = round === 1
      ? `Debate question: "${question}"\n\nPresent your opening argument (positive position). Be specific and cite evidence.`
      : `Agent B argued:\n"${transcript[transcript.length - 1].content}"\n\nRespond to their points and strengthen your position.`;

    const aResult = await complete({
      model,
      messages: [
        { role: "system", content: agentASystem },
        ...history,
        { role: "user", content: aPrompt },
      ],
      temperature: debaterTemp,
      maxTokens: 500,
      metadata: { feature: "debate-agent-a" },
    });

    const aContent = aResult?.content ?? "No argument available.";
    transcript.push({ speaker: "A", round, content: aContent });
    history.push({ role: "user", content: aPrompt }, { role: "assistant", content: aContent });
    totalTokens += aResult?.usage.totalTokens ?? 0;
    totalCost += aResult?.cost.totalCost ?? 0;

    // Agent B responds
    const bPrompt = `Agent A argued:\n"${aContent}"\n\nPresent your counter-argument (critical position). Challenge their specific claims.`;

    const bResult = await complete({
      model,
      messages: [
        { role: "system", content: agentBSystem },
        { role: "user", content: bPrompt },
      ],
      temperature: debaterTemp,
      maxTokens: 500,
      metadata: { feature: "debate-agent-b" },
    });

    const bContent = bResult?.content ?? "No counter-argument available.";
    transcript.push({ speaker: "B", round, content: bContent });
    totalTokens += bResult?.usage.totalTokens ?? 0;
    totalCost += bResult?.cost.totalCost ?? 0;
  }

  // Judge evaluates
  const debateText = transcript
    .map((t) => `[Agent ${t.speaker}, Round ${t.round}]\n${t.content}`)
    .join("\n\n---\n\n");

  const judgeResult = await complete({
    model,
    messages: [{
      role: "user",
      content: `You are an impartial judge evaluating a compliance debate.

Question: "${question}"

Debate transcript:
${debateText}

Evaluate both sides and produce a final answer. Respond with JSON:
{
  "answer": "Your synthesized final answer incorporating the strongest arguments from both sides",
  "winner": "A" or "B" or "balanced",
  "confidence": 0.0-1.0,
  "dissent": "The key point from the losing side that should still be considered"
}`,
    }],
    temperature: judgeTemp,
    maxTokens: 800,
    metadata: { feature: "debate-judge" },
  });

  totalTokens += judgeResult?.usage.totalTokens ?? 0;
  totalCost += judgeResult?.cost.totalCost ?? 0;

  // Parse judge's verdict
  try {
    const match = judgeResult?.content?.match(/\{[\s\S]*\}/);
    if (match) {
      const verdict = JSON.parse(match[0]);
      transcript.push({ speaker: "Judge", round: rounds + 1, content: verdict.answer });
      return {
        answer: verdict.answer ?? "No verdict reached.",
        winner: verdict.winner ?? "balanced",
        confidence: typeof verdict.confidence === "number" ? verdict.confidence : 0.7,
        dissent: verdict.dissent ?? "",
        transcript,
        totalTokens,
        totalCostUsd: totalCost,
      };
    }
  } catch { /* parse failure */ }

  return {
    answer: judgeResult?.content ?? "Debate concluded without clear verdict.",
    winner: "balanced",
    confidence: 0.5,
    dissent: "",
    transcript,
    totalTokens,
    totalCostUsd: totalCost,
  };
}
