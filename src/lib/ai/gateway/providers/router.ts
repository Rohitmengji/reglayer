/**
 * RegLayer — GPU Router (Intelligent Provider Selection)
 *
 * Selects the optimal LLM provider for each request based on:
 *   - Latency (recent P50 response time)
 *   - Cost (per-token pricing)
 *   - Availability (circuit breaker state, API key configured)
 *   - Capability (model quality for the task type)
 *
 * ROUTING STRATEGIES:
 *   "cheapest"    — minimize cost (default for high-volume)
 *   "fastest"     — minimize latency (for streaming chat)
 *   "best"        — maximize quality (for reports, compliance)
 *   "balanced"    — weighted score across all dimensions
 *   "local-first" — prefer local models, fallback to cloud
 *
 * PROVIDER REGISTRY:
 *   Cloud: OpenAI, Anthropic, Groq, Cerebras, Fireworks, Together
 *   Local: Ollama, vLLM, llama.cpp
 *
 * INSPIRED BY:
 *   - OpenRouter (multi-provider routing)
 *   - Portkey (AI gateway with fallback)
 *   - LiteLLM (unified interface + routing)
 *   - Martian (intelligent model routing)
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RoutingStrategy = "cheapest" | "fastest" | "best" | "balanced" | "local-first";
export type ProviderStatus = "available" | "degraded" | "unavailable";

export interface ProviderConfig {
  id: string;
  name: string;
  type: "cloud" | "local";
  models: ModelConfig[];
  envKey: string;               // env var name for API key (or endpoint URL)
  baseUrl?: string;             // override endpoint
  maxConcurrency?: number;
}

export interface ModelConfig {
  id: string;                   // internal model ID
  providerModelId: string;      // provider's model ID (e.g., "gpt-4o-mini")
  costPer1kInput: number;       // $ per 1K input tokens
  costPer1kOutput: number;      // $ per 1K output tokens
  avgLatencyMs: number;         // estimated average latency
  contextWindow: number;        // max tokens
  quality: number;              // 1-10 quality rating
  capabilities: string[];       // ["chat", "tool-calling", "vision", "embedding"]
  local?: boolean;
}

export interface RouteDecision {
  provider: string;
  model: string;
  providerModelId: string;
  score: number;
  reason: string;
  fallbacks: string[];
}

export interface RoutingWeights {
  latency: number;    // 0-1
  cost: number;       // 0-1
  availability: number; // 0-1
  quality: number;    // 0-1
}

// ── Provider Registry ─────────────────────────────────────────────────────────

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    type: "cloud",
    envKey: "OPENAI_API_KEY",
    models: [
      { id: "gpt-4o-mini", providerModelId: "gpt-4o-mini", costPer1kInput: 0.00015, costPer1kOutput: 0.0006, avgLatencyMs: 800, contextWindow: 128000, quality: 8, capabilities: ["chat", "tool-calling", "vision"] },
      { id: "gpt-4o", providerModelId: "gpt-4o", costPer1kInput: 0.0025, costPer1kOutput: 0.01, avgLatencyMs: 1200, contextWindow: 128000, quality: 10, capabilities: ["chat", "tool-calling", "vision"] },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "cloud",
    envKey: "ANTHROPIC_API_KEY",
    models: [
      { id: "claude-haiku", providerModelId: "claude-3-5-haiku-latest", costPer1kInput: 0.0008, costPer1kOutput: 0.004, avgLatencyMs: 600, contextWindow: 200000, quality: 8, capabilities: ["chat", "tool-calling", "vision"] },
      { id: "claude-sonnet", providerModelId: "claude-sonnet-4-20250514", costPer1kInput: 0.003, costPer1kOutput: 0.015, avgLatencyMs: 1500, contextWindow: 200000, quality: 10, capabilities: ["chat", "tool-calling", "vision"] },
    ],
  },
  {
    id: "groq",
    name: "Groq",
    type: "cloud",
    envKey: "GROQ_API_KEY",
    models: [
      { id: "groq-llama-70b", providerModelId: "llama-3.3-70b-versatile", costPer1kInput: 0.00059, costPer1kOutput: 0.00079, avgLatencyMs: 200, contextWindow: 128000, quality: 7, capabilities: ["chat", "tool-calling"] },
    ],
  },
  {
    id: "cerebras",
    name: "Cerebras",
    type: "cloud",
    envKey: "CEREBRAS_API_KEY",
    models: [
      { id: "cerebras-llama-70b", providerModelId: "llama-3.3-70b", costPer1kInput: 0.00085, costPer1kOutput: 0.00085, avgLatencyMs: 150, contextWindow: 128000, quality: 7, capabilities: ["chat"] },
    ],
  },
  {
    id: "fireworks",
    name: "Fireworks",
    type: "cloud",
    envKey: "FIREWORKS_API_KEY",
    models: [
      { id: "fireworks-llama-70b", providerModelId: "accounts/fireworks/models/llama-v3p3-70b-instruct", costPer1kInput: 0.0009, costPer1kOutput: 0.0009, avgLatencyMs: 300, contextWindow: 128000, quality: 7, capabilities: ["chat", "tool-calling"] },
    ],
  },
  {
    id: "together",
    name: "Together",
    type: "cloud",
    envKey: "TOGETHER_API_KEY",
    models: [
      { id: "together-llama-70b", providerModelId: "meta-llama/Llama-3.3-70B-Instruct-Turbo", costPer1kInput: 0.00088, costPer1kOutput: 0.00088, avgLatencyMs: 350, contextWindow: 128000, quality: 7, capabilities: ["chat", "tool-calling"] },
    ],
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    type: "local",
    envKey: "OLLAMA_BASE_URL",
    baseUrl: "http://localhost:11434",
    models: [
      { id: "ollama-llama3", providerModelId: "llama3.2", costPer1kInput: 0, costPer1kOutput: 0, avgLatencyMs: 500, contextWindow: 128000, quality: 6, capabilities: ["chat"], local: true },
      { id: "ollama-mistral", providerModelId: "mistral", costPer1kInput: 0, costPer1kOutput: 0, avgLatencyMs: 400, contextWindow: 32000, quality: 6, capabilities: ["chat"], local: true },
    ],
  },
  {
    id: "vllm",
    name: "vLLM (Local)",
    type: "local",
    envKey: "VLLM_BASE_URL",
    baseUrl: "http://localhost:8000",
    models: [
      { id: "vllm-default", providerModelId: "default", costPer1kInput: 0, costPer1kOutput: 0, avgLatencyMs: 300, contextWindow: 128000, quality: 7, capabilities: ["chat", "tool-calling"], local: true },
    ],
  },
];

// ── Strategy Weights ──────────────────────────────────────────────────────────

const STRATEGY_WEIGHTS: Record<RoutingStrategy, RoutingWeights> = {
  cheapest:      { latency: 0.1, cost: 0.7, availability: 0.1, quality: 0.1 },
  fastest:       { latency: 0.7, cost: 0.1, availability: 0.1, quality: 0.1 },
  best:          { latency: 0.1, cost: 0.1, availability: 0.1, quality: 0.7 },
  balanced:      { latency: 0.25, cost: 0.25, availability: 0.25, quality: 0.25 },
  "local-first": { latency: 0.2, cost: 0.5, availability: 0.1, quality: 0.2 },
};

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Select the best provider + model for a request.
 *
 * @param strategy Routing strategy
 * @param requirements What the request needs (e.g., "tool-calling", "vision")
 * @param preferLocal Whether to strongly prefer local models
 */
export function route(
  strategy: RoutingStrategy = "balanced",
  requirements?: { capabilities?: string[]; minQuality?: number; maxCost?: number },
): RouteDecision {
  const weights = STRATEGY_WEIGHTS[strategy];
  const available = getAvailableProviders();
  const candidates: { provider: string; model: ModelConfig; score: number }[] = [];

  for (const provider of available) {
    for (const model of provider.models) {
      // Filter by requirements
      if (requirements?.capabilities) {
        const hasAll = requirements.capabilities.every((c) => model.capabilities.includes(c));
        if (!hasAll) continue;
      }
      if (requirements?.minQuality && model.quality < requirements.minQuality) continue;
      if (requirements?.maxCost && model.costPer1kInput > requirements.maxCost) continue;

      // Score
      const latencyScore = 1 - Math.min(model.avgLatencyMs / 2000, 1); // 0ms=1.0, 2000ms=0.0
      const costScore = 1 - Math.min((model.costPer1kInput + model.costPer1kOutput) / 0.02, 1);
      const availScore = 1.0; // already filtered
      const qualityScore = model.quality / 10;

      // Local boost for "local-first"
      const localBoost = strategy === "local-first" && model.local ? 0.3 : 0;

      const score = (
        weights.latency * latencyScore +
        weights.cost * costScore +
        weights.availability * availScore +
        weights.quality * qualityScore +
        localBoost
      ) * 100;

      candidates.push({ provider: provider.id, model, score: Math.round(score) });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      provider: "openai",
      model: "gpt-4o-mini",
      providerModelId: "gpt-4o-mini",
      score: 0,
      reason: "No available providers match requirements",
      fallbacks: [],
    };
  }

  const winner = candidates[0];
  const fallbacks = candidates.slice(1, 4).map((c) => `${c.provider}/${c.model.id}`);

  return {
    provider: winner.provider,
    model: winner.model.id,
    providerModelId: winner.model.providerModelId,
    score: winner.score,
    reason: `${strategy} strategy: ${winner.provider}/${winner.model.id} scored ${winner.score} (latency:${winner.model.avgLatencyMs}ms, quality:${winner.model.quality}/10, cost:$${(winner.model.costPer1kInput * 1000).toFixed(4)}/1K)`,
    fallbacks,
  };
}

/**
 * Get all providers that have their API key / endpoint configured.
 */
export function getAvailableProviders(): ProviderConfig[] {
  return PROVIDERS.filter((p) => {
    const envValue = process.env[p.envKey];
    if (!envValue) return false;
    // For local providers, check if the URL is set (even default counts)
    if (p.type === "local") return true;
    // For cloud providers, check API key is real (not placeholder)
    return !envValue.includes("replace_me") && envValue.length > 5;
  });
}

/**
 * Get all registered providers (for settings UI display).
 */
export function getAllProviders(): ProviderConfig[] {
  return PROVIDERS;
}

/**
 * Get provider status (available/unavailable based on env vars).
 */
export function getProviderStatus(): Record<string, ProviderStatus> {
  const result: Record<string, ProviderStatus> = {};
  for (const p of PROVIDERS) {
    const envValue = process.env[p.envKey];
    result[p.id] = envValue && envValue.length > 5 ? "available" : "unavailable";
  }
  return result;
}

/**
 * Estimate cost for a request with a specific model.
 */
export function estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
  for (const provider of PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) {
      return (inputTokens * model.costPer1kInput + outputTokens * model.costPer1kOutput) / 1000;
    }
  }
  return 0;
}
