/**
 * RegLayer — AI Gateway
 *
 * WHY THIS FILE EXISTS:
 *   This is the SINGLE ENTRY POINT for all LLM interactions in RegLayer.
 *   Every feature — violation explainer, compliance summary, visual scan,
 *   future chat, future agents — calls `complete()` or `stream()`.
 *
 *   Think of it as a reverse proxy for LLMs. Like Nginx sits in front of
 *   your web servers, the gateway sits in front of your LLM providers.
 *
 * WHAT IT DOES (in order, for every request):
 *   1. Resolves the model alias to a provider + model config (registry)
 *   2. Checks if the provider is available (API key set)
 *   3. Builds a LanguageModelV1 instance (provider adapter)
 *   4. Converts our Message[] to AI SDK's CoreMessage[] format
 *   5. Calls generateText() with retry logic
 *   6. Calculates cost from token usage
 *   7. Emits an event for observability
 *   8. Returns a normalized CompletionResponse
 *
 * HOW COMPANIES USE THIS PATTERN:
 *   - Cursor: routes different features to different models via a gateway
 *   - Perplexity: uses compound model routing (small model for query
 *     understanding, large model for answer generation)
 *   - Harvey: logs every LLM call for legal compliance audit
 *   - OpenAI's own platform: their API IS a gateway that routes to
 *     different model deployments
 *
 * DESIGN DECISIONS:
 *   - Functional, not class-based. No singleton. Functions are easier to test
 *     and tree-shake in serverless (each Vercel function only loads what it uses).
 *   - Graceful degradation: if no providers are configured, returns null.
 *     This matches the existing pattern in violationExplainer.ts.
 *   - Event emission is fire-and-forget (no await). Observability should
 *     never slow down the response.
 */

import "server-only";

import { generateText, type ModelMessage, type LanguageModel } from "ai";
import type {
  CompletionRequest,
  CompletionResponse,
  GatewayEvent,
  GatewayEventHandler,
  Message,
  ModelId,
  Provider,
} from "./types";
import { calculateCost, getModelConfig } from "./providers/registry";
import { createOpenAIModel } from "./providers/openai";
import { createAnthropicModel } from "./providers/anthropic";

// ── Event Subscribers ─────────────────────────────────────────────────────────
// Listeners register once at startup. The gateway calls them after every
// completion. This is the Observer pattern — decoupled, extensible.

const eventHandlers: GatewayEventHandler[] = [];

/**
 * Register a handler that fires after every AI completion.
 * Used by cost tracking, logging, and future analytics.
 */
export function onGatewayEvent(handler: GatewayEventHandler): void {
  eventHandlers.push(handler);
}

function emitEvent(event: GatewayEvent): void {
  // Fire-and-forget — never block the response for observability
  for (const handler of eventHandlers) {
    try {
      // Don't await — handlers run asynchronously
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((err) =>
          console.error("[ai-gateway] Event handler error:", err),
        );
      }
    } catch (err) {
      console.error("[ai-gateway] Event handler error:", err);
    }
  }
}

// ── Provider Resolution ───────────────────────────────────────────────────────

function getLanguageModel(
  provider: Provider,
  providerModelId: string,
): LanguageModel {
  switch (provider) {
    case "openai":
      return createOpenAIModel(providerModelId);
    case "anthropic":
      return createAnthropicModel(providerModelId);
    case "google":
      throw new Error(
        "Google provider not yet implemented. Coming when API key is configured.",
      );
  }
}

// ── Message Conversion ────────────────────────────────────────────────────────
// Our Message type → AI SDK's CoreMessage type.
// This is necessary because the AI SDK has its own message format that
// supports features like tool results, which we'll need later.

function toCoreMessages(messages: Message[]): ModelMessage[] {
  return messages.map((msg): ModelMessage => {
    if ("content" in msg && Array.isArray(msg.content)) {
      // Multimodal message (text + images)
      return {
        role: msg.role as "user",
        content: msg.content.map((part) => {
          if (part.type === "text") {
            return { type: "text" as const, text: part.text };
          }
          // Image part
          return {
            type: "image" as const,
            image: part.data,
            mimeType: part.mimeType,
          };
        }),
      };
    }
    // Text-only message
    return {
      role: msg.role,
      content: msg.content as string,
    } as ModelMessage;
  });
}

// ── Core Gateway Functions ────────────────────────────────────────────────────

/**
 * Generate a completion from an LLM.
 *
 * This is the primary function that all AI features should use.
 * Returns null if no provider is available (graceful degradation).
 *
 * @example
 * ```ts
 * const result = await complete({
 *   model: "gpt-4o-mini",
 *   messages: [
 *     { role: "system", content: "You are a helpful assistant." },
 *     { role: "user", content: "Explain this violation..." },
 *   ],
 *   temperature: 0.3,
 *   maxTokens: 500,
 *   jsonMode: true,
 *   metadata: { feature: "violation-explainer", workspaceId: "ws_123" },
 * });
 * ```
 */
export async function complete(
  request: CompletionRequest,
): Promise<CompletionResponse | null> {
  const startTime = Date.now();
  const modelConfig = getModelConfig(request.model);

  // Graceful degradation: if the provider isn't configured, return null.
  // This matches the existing pattern where AI features are optional.
  if (!modelConfig.isAvailable()) {
    return null;
  }

  try {
    const model = getLanguageModel(
      modelConfig.provider,
      modelConfig.providerModelId,
    );

    const result = await generateText({
      model,
      messages: toCoreMessages(request.messages),
      temperature: request.temperature ?? 0.3,
      maxOutputTokens: request.maxTokens,
    });

    const latencyMs = Date.now() - startTime;
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;
    const cost = calculateCost(request.model, inputTokens, outputTokens);

    const response: CompletionResponse = {
      content: result.text,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelConfig.providerModelId,
      provider: modelConfig.provider,
      latencyMs,
      cost,
    };

    // Emit event for observability (fire-and-forget)
    emitEvent({
      type: "ai.completion",
      timestamp: new Date(),
      request: {
        model: request.model,
        feature: request.metadata?.feature ?? "unknown",
        workspaceId: request.metadata?.workspaceId,
        userId: request.metadata?.userId,
      },
      response: {
        model: modelConfig.providerModelId,
        provider: modelConfig.provider,
        usage: response.usage,
        cost,
        latencyMs,
        success: true,
      },
    });

    return response;
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Emit failure event
    emitEvent({
      type: "ai.completion",
      timestamp: new Date(),
      request: {
        model: request.model,
        feature: request.metadata?.feature ?? "unknown",
        workspaceId: request.metadata?.workspaceId,
        userId: request.metadata?.userId,
      },
      response: {
        model: modelConfig.providerModelId,
        provider: modelConfig.provider,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
        latencyMs,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

/**
 * Check if ANY AI provider is configured and available.
 * Use this for feature gates: "should we show the AI button?"
 */
export function isAIAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Get the cheapest available model ID.
 * Convenience for features that don't care which model they use.
 */
export function getDefaultModelId(): ModelId | null {
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY) return "claude-haiku";
  return null;
}
