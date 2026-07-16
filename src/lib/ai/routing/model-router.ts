/**
 * Dynamic Model Router — selects cheapest adequate model per query.
 *
 * WHY: Using GPT-4o for "what is alt text?" wastes 10x the cost vs GPT-4o-mini.
 * WHAT: Classifies query complexity → routes to appropriate model.
 * HOW: Heuristic complexity scoring based on message length, topic, and history depth.
 *
 * Estimated savings: 40-60% on AI token costs.
 */

export type ModelTier = "fast" | "standard" | "advanced";

interface ModelConfig {
  provider: "openai" | "anthropic";
  model: string;
  maxTokens: number;
  /** Estimated cost per 1K tokens (input + output averaged) */
  costPer1K: number;
}

export const MODEL_TIERS: Record<ModelTier, ModelConfig> = {
  fast: {
    provider: "openai",
    model: "gpt-4o-mini",
    maxTokens: 2048,
    costPer1K: 0.00015,
  },
  standard: {
    provider: "openai",
    model: "gpt-4o-mini",
    maxTokens: 4096,
    costPer1K: 0.00015,
  },
  advanced: {
    provider: "openai",
    model: "gpt-4o",
    maxTokens: 8192,
    costPer1K: 0.005,
  },
};

/** Fallback chain: if primary fails, try next tier */
export const FALLBACK_CHAIN: Record<string, string> = {
  "gpt-4o": "claude-haiku-4-20250514",
  "gpt-4o-mini": "claude-haiku-4-20250514",
  "claude-haiku-4-20250514": "gpt-4o-mini",
};

interface RoutingInput {
  /** Latest user message */
  message: string;
  /** Number of messages in conversation so far */
  historyLength: number;
  /** Whether the query explicitly asks for code */
  wantsCode: boolean;
}

/**
 * Score query complexity (0-100). Higher = needs more capable model.
 */
export function scoreComplexity(input: RoutingInput): number {
  let score = 0;

  // Message length (longer = more complex)
  if (input.message.length > 500) score += 20;
  else if (input.message.length > 200) score += 10;

  // Conversation depth (deeper = more context needed)
  if (input.historyLength > 10) score += 15;
  else if (input.historyLength > 5) score += 8;

  // Code generation requests are more complex
  if (input.wantsCode) score += 25;

  // Multi-part questions
  const questionMarks = (input.message.match(/\?/g) || []).length;
  if (questionMarks > 2) score += 15;

  // Technical depth indicators
  const technicalTerms = [
    "implementation", "architecture", "migration", "audit",
    "remediation plan", "vpat", "compliance report", "legal",
    "compare", "analyze", "evaluate", "deep dive",
  ];
  for (const term of technicalTerms) {
    if (input.message.toLowerCase().includes(term)) {
      score += 10;
      break;
    }
  }

  // Simple question indicators (reduce score)
  const simplePatterns = [
    /^what\s+is\b/i, /^how\s+do\s+I\b/i, /^explain\b/i,
    /^define\b/i, /^what\s+does\b/i,
  ];
  if (simplePatterns.some((p) => p.test(input.message.trim()))) {
    score = Math.max(0, score - 15);
  }

  return Math.min(100, score);
}

/**
 * Route a query to the appropriate model tier.
 */
export function routeToModel(input: RoutingInput): { tier: ModelTier; config: ModelConfig; complexity: number } {
  const complexity = scoreComplexity(input);

  let tier: ModelTier;
  if (complexity >= 60) {
    tier = "advanced";
  } else if (complexity >= 30) {
    tier = "standard";
  } else {
    tier = "fast";
  }

  return { tier, config: MODEL_TIERS[tier], complexity };
}

/**
 * Estimate cost for a request before execution.
 * Returns estimated cost in USD.
 */
export function estimateCost(inputTokens: number, outputTokens: number, tier: ModelTier): number {
  const config = MODEL_TIERS[tier];
  return ((inputTokens + outputTokens) / 1000) * config.costPer1K;
}
