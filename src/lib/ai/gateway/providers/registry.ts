/**
 * RegLayer — AI Model Registry
 *
 * WHY:  The registry is the single source of truth for every model the platform
 *       can use. When the gateway receives a request for "claude-sonnet," it asks
 *       the registry: "which provider? which model ID? what's the cost per token?"
 *
 *       This is how Cursor knows to route inline chat to Claude and autocomplete
 *       to a smaller model. It's how Perplexity picks a fast model for query
 *       understanding and a strong model for answer synthesis. The mapping is
 *       separate from the routing logic — so you can change models without
 *       touching any business code.
 *
 * DESIGN DECISIONS:
 * - Config-based, not DB-based. We don't need to change models at runtime yet.
 *   When we do (feature flags, A/B testing), we move this to the database.
 * - Pricing is embedded because cost calculation must be instant (no API call
 *   to check pricing). These are updated when provider pricing changes.
 * - isAvailable() checks env vars at call time, not at import time. This lets
 *   tests work without setting every env var.
 * - Fallback chain: when a model is unavailable, the gateway can try the next
 *   model in the same "tier" (e.g., claude-sonnet → gpt-4o-mini).
 *
 * PRICING SOURCE (as of July 2025):
 * - OpenAI: https://openai.com/api/pricing/
 * - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models
 *
 * BUDGET STRATEGY (Jul 15 – Aug 1, 2025):
 * - Primary: gpt-4o-mini ($0.15/$0.60 per M) — ~15,000 calls per $5
 * - Fallback only: claude-haiku ($0.80/$4.00 per M) — use Anthropic credits as safety net
 * - NEVER default to Sonnet/Opus during budget period — 10-50x more expensive
 */

import type { ModelConfig, ModelId, Provider } from "../types";

// ── Model Definitions ─────────────────────────────────────────────────────────

const MODEL_CONFIGS: ModelConfig[] = [
  // ── OpenAI ────────────────────────────────────────────────────────────────
  {
    id: "gpt-4o-mini",
    providerModelId: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    pricing: { inputPerMillion: 0.15, outputPerMillion: 0.60 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.OPENAI_API_KEY,
  },
  {
    id: "gpt-4o",
    providerModelId: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    pricing: { inputPerMillion: 2.50, outputPerMillion: 10.00 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.OPENAI_API_KEY,
  },
  {
    id: "gpt-4.1-mini",
    providerModelId: "gpt-4.1-mini",
    provider: "openai",
    displayName: "GPT-4.1 Mini",
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    pricing: { inputPerMillion: 0.40, outputPerMillion: 1.60 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.OPENAI_API_KEY,
  },
  {
    id: "gpt-4.1",
    providerModelId: "gpt-4.1",
    provider: "openai",
    displayName: "GPT-4.1",
    contextWindow: 1_047_576,
    maxOutputTokens: 32_768,
    pricing: { inputPerMillion: 2.00, outputPerMillion: 8.00 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.OPENAI_API_KEY,
  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  {
    id: "claude-sonnet",
    providerModelId: "claude-sonnet-4-6",
    provider: "anthropic",
    displayName: "Claude Sonnet 4.6",
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    pricing: { inputPerMillion: 3.00, outputPerMillion: 15.00 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
  },
  {
    id: "claude-haiku",
    providerModelId: "claude-haiku-4-5-20250514",
    provider: "anthropic",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    pricing: { inputPerMillion: 0.80, outputPerMillion: 4.00 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
  },
  {
    id: "claude-opus",
    providerModelId: "claude-opus-4-8",
    provider: "anthropic",
    displayName: "Claude Opus 4.8",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    pricing: { inputPerMillion: 15.00, outputPerMillion: 75.00 },
    supportsVision: true,
    supportsJsonMode: true,
    isAvailable: () => !!process.env.ANTHROPIC_API_KEY,
  },
];

// ── Registry API ──────────────────────────────────────────────────────────────

const modelMap = new Map<ModelId, ModelConfig>(
  MODEL_CONFIGS.map((config) => [config.id, config]),
);

/**
 * Look up a model by its RegLayer alias.
 * Throws if the model ID isn't registered — this is a developer error.
 */
export function getModelConfig(modelId: ModelId): ModelConfig {
  const config = modelMap.get(modelId);
  if (!config) {
    throw new Error(`Unknown model: "${modelId}". Check the model registry.`);
  }
  return config;
}

/**
 * Get all registered models, optionally filtered by provider.
 */
export function getAvailableModels(provider?: Provider): ModelConfig[] {
  return MODEL_CONFIGS.filter(
    (config) =>
      config.isAvailable() && (provider ? config.provider === provider : true),
  );
}

/**
 * Get the default model for a given use case.
 * Returns the cheapest available model that supports the needed capabilities.
 *
 * This is where product decisions live:
 * - "violation-explainer" → cheap model (gpt-4o-mini or claude-haiku)
 * - "visual-scan" → needs vision
 * - "chat" → stronger model
 */
export function getDefaultModel(options?: {
  needsVision?: boolean;
  preferProvider?: Provider;
}): ModelConfig | null {
  const candidates = MODEL_CONFIGS.filter((config) => {
    if (!config.isAvailable()) return false;
    if (options?.needsVision && !config.supportsVision) return false;
    if (options?.preferProvider && config.provider !== options.preferProvider) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  // Sort by cost (cheapest first) — the default should be cost-efficient.
  // Premium models are explicitly requested, never defaulted to.
  return candidates.sort(
    (a, b) => a.pricing.inputPerMillion - b.pricing.inputPerMillion,
  )[0];
}

/**
 * Calculate the cost of a completion given token usage.
 */
export function calculateCost(
  modelId: ModelId,
  inputTokens: number,
  outputTokens: number,
): { inputCost: number; outputCost: number; totalCost: number } {
  const config = getModelConfig(modelId);
  const inputCost = (inputTokens * config.pricing.inputPerMillion) / 1_000_000;
  const outputCost =
    (outputTokens * config.pricing.outputPerMillion) / 1_000_000;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}
