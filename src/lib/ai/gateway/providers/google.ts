/**
 * RegLayer — Google Gemini Provider Adapter
 *
 * WHY:  Google's Gemini models offer competitive performance at lower cost.
 *       Gemini 2.0 Flash is particularly good for fast, cheap completions.
 *       Having 3 providers (OpenAI, Anthropic, Google) gives us:
 *       - Fallback if any provider has an outage
 *       - Cost optimization (route simple queries to cheapest)
 *       - Best-of-breed per task type
 *
 * The AI SDK provides @ai-sdk/google which handles all the API differences.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

// Cache the provider instance
let cachedProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = createGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_AI_API_KEY ?? "",
    });
  }
  return cachedProvider;
}

/**
 * Create a Google Gemini language model instance for the given model ID.
 */
export function createGoogleModel(
  providerModelId: string,
): LanguageModel {
  return getProvider()(providerModelId);
}

/**
 * Check if Google AI is configured.
 */
export function isGoogleConfigured(): boolean {
  return !!process.env.GOOGLE_AI_API_KEY;
}
