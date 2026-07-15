/**
 * RegLayer — Anthropic Provider Adapter
 *
 * WHY:  Same adapter pattern as OpenAI, but for Anthropic's Claude models.
 *       The gateway doesn't know or care which provider is behind a model —
 *       it just gets a `LanguageModelV1` back and calls `generateText()`.
 *
 * NOTE ON ANTHROPIC'S ARCHITECTURE:
 *   Anthropic's API differs from OpenAI in subtle ways:
 *   - System messages are a separate top-level parameter (not in `messages[]`)
 *   - Tool calling uses a different schema format
 *   - Streaming uses Server-Sent Events with different event types
 *   The Vercel AI SDK abstracts ALL of this. Our adapter is three lines of code
 *   because the SDK does the heavy lifting. This is the power of using a good
 *   abstraction layer.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

// Cache the provider instance
let cachedProvider: ReturnType<typeof createAnthropic> | null = null;

function getProvider() {
  if (!cachedProvider) {
    cachedProvider = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    });
  }
  return cachedProvider;
}

/**
 * Create an Anthropic language model instance for the given model ID.
 */
export function createAnthropicModel(
  providerModelId: string,
): LanguageModel {
  return getProvider()(providerModelId);
}
