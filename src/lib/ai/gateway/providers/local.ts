/**
 * RegLayer — Local AI Provider Adapter
 *
 * Supports self-hosted LLM inference via:
 *   - Ollama (easiest, runs locally with `ollama serve`)
 *   - vLLM (production-grade, GPU-optimized serving)
 *   - llama.cpp server (lightweight C++ inference)
 *
 * All three expose OpenAI-compatible endpoints, so we use a single
 * adapter that points to the local URL instead of api.openai.com.
 *
 * WHY LOCAL:
 *   - Zero cost per token (after hardware investment)
 *   - Complete data privacy (nothing leaves the network)
 *   - No rate limits
 *   - Works offline
 *   - Required for air-gapped/classified environments
 *
 * TRADE-OFFS:
 *   - Lower quality than GPT-4o / Claude Sonnet
 *   - Requires GPU hardware (or slow CPU inference)
 *   - No tool-calling on most local models
 *   - User manages model downloads + updates
 */

import "server-only";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LocalProvider = "ollama" | "vllm" | "llamacpp";

export interface LocalProviderConfig {
  provider: LocalProvider;
  baseUrl: string;
  model: string;
  envKey: string;
}

export interface LocalModelInfo {
  name: string;
  size: string;
  quantization: string;
  parameters: string;
}

// ── Provider Configs ──────────────────────────────────────────────────────────

export const LOCAL_PROVIDERS: Record<LocalProvider, { defaultUrl: string; envKey: string; apiPath: string }> = {
  ollama: {
    defaultUrl: "http://localhost:11434",
    envKey: "OLLAMA_BASE_URL",
    apiPath: "/api/chat",          // Ollama native API
  },
  vllm: {
    defaultUrl: "http://localhost:8000",
    envKey: "VLLM_BASE_URL",
    apiPath: "/v1/chat/completions", // OpenAI-compatible
  },
  llamacpp: {
    defaultUrl: "http://localhost:8080",
    envKey: "LLAMACPP_BASE_URL",
    apiPath: "/v1/chat/completions", // OpenAI-compatible (llama-server)
  },
};

// ── Health Check ──────────────────────────────────────────────────────────────

/**
 * Check if a local provider is running and responsive.
 */
export async function checkLocalHealth(provider: LocalProvider): Promise<{
  available: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
}> {
  const config = LOCAL_PROVIDERS[provider];
  const baseUrl = process.env[config.envKey] ?? config.defaultUrl;

  const start = Date.now();

  try {
    if (provider === "ollama") {
      // Ollama has a /api/tags endpoint to list models
      const res = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { models?: { name: string }[] };
      return {
        available: true,
        latencyMs: Date.now() - start,
        models: data.models?.map((m) => m.name) ?? [],
      };
    }

    // vLLM and llama.cpp use OpenAI-compatible /v1/models
    const res = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { data?: { id: string }[] };
    return {
      available: true,
      latencyMs: Date.now() - start,
      models: data.data?.map((m) => m.id) ?? [],
    };
  } catch (err) {
    return {
      available: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

/**
 * Check all local providers and return their status.
 */
export async function checkAllLocal(): Promise<Record<LocalProvider, {
  available: boolean;
  latencyMs: number;
  models?: string[];
}>> {
  const providers: LocalProvider[] = ["ollama", "vllm", "llamacpp"];
  const results = await Promise.all(
    providers.map(async (p) => ({ provider: p, ...(await checkLocalHealth(p)) })),
  );

  const status: Record<string, { available: boolean; latencyMs: number; models?: string[] }> = {};
  for (const r of results) {
    status[r.provider] = { available: r.available, latencyMs: r.latencyMs, models: r.models };
  }
  return status as Record<LocalProvider, { available: boolean; latencyMs: number; models?: string[] }>;
}

/**
 * Get the base URL for a local provider (from env or default).
 */
export function getLocalBaseUrl(provider: LocalProvider): string {
  const config = LOCAL_PROVIDERS[provider];
  return process.env[config.envKey] ?? config.defaultUrl;
}

/**
 * Check if any local provider is available.
 */
export function isLocalAvailable(): boolean {
  return (["ollama", "vllm", "llamacpp"] as LocalProvider[]).some((p) => {
    const config = LOCAL_PROVIDERS[p];
    return !!process.env[config.envKey];
  });
}

/**
 * Get recommended local model based on available hardware.
 * Returns model suggestions for different capability tiers.
 */
export function getRecommendedModels(): { tier: string; model: string; ram: string; quality: number }[] {
  return [
    { tier: "Minimum (8GB RAM)", model: "llama3.2:3b", ram: "4GB", quality: 5 },
    { tier: "Standard (16GB RAM)", model: "llama3.2:latest", ram: "8GB", quality: 6 },
    { tier: "Quality (32GB RAM)", model: "llama3.3:70b-q4", ram: "24GB", quality: 8 },
    { tier: "Embedding", model: "nomic-embed-text", ram: "2GB", quality: 7 },
  ];
}
