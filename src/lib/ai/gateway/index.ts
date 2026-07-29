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

import { generateText, streamText, stepCountIs, embed as aiEmbed, embedMany as aiEmbedMany, type ModelMessage, type LanguageModel } from "ai";
import type {
  CompletionRequest,
  CompletionResponse,
  EmbedRequest,
  EmbedResponse,
  GatewayEvent,
  GatewayEventHandler,
  Message,
  TextMessage,
  ModelId,
  Provider,
} from "./types";
import { calculateCost, getModelConfig, calculateEmbeddingCost } from "./providers/registry";
import { createOpenAIModel, createOpenAIEmbeddingModel } from "./providers/openai";
import { createAnthropicModel } from "./providers/anthropic";
import { createGoogleModel } from "./providers/google";
import { consoleLogger } from "./logger";
import { persistEventHandler } from "../observability/service";
import { logger } from "@/lib/telemetry/logger";
import * as Sentry from "@sentry/nextjs";

// ── Resilience defaults ──────────────────────────────────────────────────────
//
// These exist because an LLM call is the slowest, least reliable dependency in the
// request path. Without explicit bounds a degraded provider does not fail — it hangs,
// holding a serverless function open until the platform kills it. Under load that
// converts a provider slowdown into an application-wide outage.

/** Hard ceiling for a non-streaming completion. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Streaming responses legitimately take longer — the user sees tokens as they arrive. */
const STREAM_TIMEOUT_MS = 120_000;

/**
 * Retries are handled by the AI SDK (exponential backoff, retryable errors only).
 * Made explicit so the policy is visible and tunable rather than an undocumented default.
 */
const DEFAULT_MAX_RETRIES = 2;

/**
 * Max sequential model steps when tools are in play: tool call → result → answer.
 * 5 allows a couple of chained lookups without risking a runaway loop.
 */
const DEFAULT_MAX_STEPS = 5;

// ── Initialize Gateway ────────────────────────────────────────────────────────
// Register default event handlers on module load.

const eventHandlers: GatewayEventHandler[] = [consoleLogger, persistEventHandler];

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
      return createGoogleModel(providerModelId);
  }
}

// ── Message Conversion ────────────────────────────────────────────────────────
// Our Message type → AI SDK's CoreMessage type.
// This is necessary because the AI SDK has its own message format that
// supports features like tool results, which we'll need later.

function toCoreMessages(messages: Message[]): ModelMessage[] {
  return messages
    .filter((msg) => !("role" in msg && msg.role === "system"))
    .map((msg): ModelMessage => {
    // Tool result message (Phase 6: tool calling)
    if ("role" in msg && msg.role === "tool") {
      return {
        role: "tool" as const,
        content: [{ type: "tool-result" as const, toolCallId: (msg as { toolCallId: string }).toolCallId, result: msg.content }],
      } as unknown as ModelMessage;
    }
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

/**
 * Extract system message content from messages array.
 * AI SDK v5 requires system messages as `instructions`, not in messages[].
 */
function extractSystemInstructions(messages: Message[]): string | undefined {
  const systemMessages = messages.filter(
    (msg): msg is TextMessage => "role" in msg && msg.role === "system",
  );
  if (systemMessages.length === 0) return undefined;
  return systemMessages.map((m) => m.content).join("\n\n");
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
      instructions: extractSystemInstructions(request.messages),
      messages: toCoreMessages(request.messages),
      temperature: request.temperature ?? 0.3,
      // Fall back to the model's own ceiling rather than leaving this undefined.
      // Undefined means "provider default", which on some models is tens of thousands
      // of tokens — unbounded latency and unbounded cost per request.
      maxOutputTokens: request.maxTokens ?? modelConfig.maxOutputTokens,
      // Without an explicit timeout a degraded provider holds the serverless function
      // open for its whole duration. Under load that exhausts concurrency and takes
      // down the entire app, not just AI.
      abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      maxRetries: request.maxRetries ?? DEFAULT_MAX_RETRIES,
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
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

/**
 * Stream a completion from an LLM.
 *
 * Unlike complete(), this returns the AI SDK's StreamTextResult which the
 * API route converts to an HTTP streaming response. The browser receives
 * tokens as they're generated — ~200ms to first token instead of 3-5s.
 *
 * WHY THIS RETURNS THE RAW RESULT (not a custom type):
 *   The AI SDK's streamText result has methods like toTextStream() and
 *   createTextStreamResponse() that produce the correct SSE format.
 *   Wrapping this in our own type would mean re-implementing SSE encoding.
 *   The gateway adds value by handling model resolution, provider routing,
 *   and event emission — not by re-wrapping the stream format.
 *
 * Cost tracking note:
 *   Token usage is only available AFTER the stream finishes. We register
 *   an onFinish callback to emit the event at that point.
 */
export function stream(request: CompletionRequest) {
  const startTime = Date.now();
  const modelConfig = getModelConfig(request.model);

  if (!modelConfig.isAvailable()) {
    return null;
  }

  try {
    const model = getLanguageModel(
      modelConfig.provider,
      modelConfig.providerModelId,
    );

    const result = streamText({
      model,
      instructions: extractSystemInstructions(request.messages),
      messages: toCoreMessages(request.messages),
      temperature: request.temperature ?? 0.5,
      maxOutputTokens: request.maxTokens ?? modelConfig.maxOutputTokens,
      abortSignal: AbortSignal.timeout(STREAM_TIMEOUT_MS),
      maxRetries: request.maxRetries ?? DEFAULT_MAX_RETRIES,
      ...(request.tools
        ? {
            tools: request.tools,
            // A tool call and the model's follow-up answer are separate steps. The SDK
            // default stops after the first, so without this the model can invoke a
            // tool but never gets to use the result.
            stopWhen: stepCountIs(request.maxSteps ?? DEFAULT_MAX_STEPS),
          }
        : {}),
      onFinish: async ({ usage, text }) => {
        const latencyMs = Date.now() - startTime;
        const inputTokens = usage?.inputTokens ?? 0;
        const outputTokens = usage?.outputTokens ?? 0;
        const cost = calculateCost(request.model, inputTokens, outputTokens);

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
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
            },
            cost,
            latencyMs,
            success: true,
          },
        });

        // Post-stream guardrails: validate the complete output for hallucinated WCAG
        // criteria, off-topic content, etc.
        //
        // Still fire-and-forget — a streamed response cannot be retracted — but the
        // result is now routed to logger + Sentry + AiEvent instead of console.warn.
        // Previously a detected hallucination was written to stdout and discarded:
        // the fact-checker worked, and nobody could see that it had fired.
        //
        // Runs for EVERY feature, not just chat. Explainers, summaries and agents
        // produce exactly the same class of factual claim and had no output check.
        if (text) {
          try {
            const { runGuardrails } = await import("@/lib/ai/guardrails");
            const feature = request.metadata?.feature ?? "unknown";
            const guardResult = runGuardrails(text, {
              feature,
              ragAugmented: feature.endsWith("-rag"),
            });

            if (!guardResult.passed) {
              const violations = guardResult.results.filter(
                (r: { severity: string }) => r.severity !== "pass",
              );

              logger.warn("ai.guardrail.violation", {
                feature,
                model: request.model,
                provider: modelConfig.provider,
                workspaceId: request.metadata?.workspaceId,
                userId: request.metadata?.userId,
                violations,
              });

              Sentry.captureMessage("AI guardrail violation", {
                level: "warning",
                tags: { feature, model: request.model, provider: modelConfig.provider },
                extra: { violations },
              });

              // Persist so violation rate becomes a queryable KPI alongside cost and
              // latency, rather than something only visible by tailing logs.
              emitEvent({
                type: "ai.guardrail",
                timestamp: new Date(),
                request: {
                  model: request.model,
                  feature,
                  workspaceId: request.metadata?.workspaceId,
                  userId: request.metadata?.userId,
                },
                response: {
                  model: modelConfig.providerModelId,
                  provider: modelConfig.provider,
                  usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                  cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
                  latencyMs: 0,
                  success: false,
                  error: violations
                    .map((v: { guardId?: string; reason?: string }) =>
                      `${v.guardId ?? "guard"}: ${v.reason ?? "violation"}`)
                    .join(" | ")
                    .slice(0, 500),
                },
              });
            }
          } catch { /* guardrail errors must never break the response */ }
        }
      },
      onError: ({ error }) => {
        const latencyMs = Date.now() - startTime;
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
            error: error instanceof Error ? error.message : "Stream error",
          },
        });
      },
    });

    return result;
  } catch (error) {
    // Synchronous error (e.g., invalid model, provider misconfiguration)
    const latencyMs = Date.now() - startTime;
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
    return null;
  }
}

/**
 * Get the cheapest available model ID.
 * Convenience for features that don't care which model they use.
 */
export function getDefaultModelId(): ModelId | null {
  if (process.env.OPENAI_API_KEY) return "gpt-4o-mini";
  if (process.env.ANTHROPIC_API_KEY) return "claude-haiku";
  if (process.env.GOOGLE_AI_API_KEY) return "gemini-2.0-flash";
  return null;
}

/**
 * Generate embeddings for text input(s).
 *
 * WHY THIS EXISTS:
 *   Embeddings convert text into numerical vectors (arrays of floats) that
 *   capture semantic meaning. "color contrast" and "foreground-background
 *   ratio" produce similar vectors even though they share no words.
 *
 *   These vectors are stored in pgvector and searched with cosine similarity
 *   to power semantic search across violations, documents, and scans.
 *
 * COST: text-embedding-3-small is $0.02/M tokens — embedding 10K violations
 *       costs ~$0.10. Negligible compared to chat completions.
 *
 * Returns null if no OpenAI API key is configured (embeddings are OpenAI-only
 * for now — Anthropic doesn't offer an embedding model).
 */
export async function embed(
  request: EmbedRequest,
): Promise<EmbedResponse | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const startTime = Date.now();
  const modelId = request.model ?? "text-embedding-3-small";

  try {
    const embeddingModel = createOpenAIEmbeddingModel(modelId);
    const inputs = Array.isArray(request.input) ? request.input : [request.input];

    let embeddings: number[][];
    let totalTokens: number;

    if (inputs.length === 1) {
      const result = await aiEmbed({ model: embeddingModel, value: inputs[0] });
      embeddings = [result.embedding];
      totalTokens = result.usage?.tokens ?? 0;
    } else {
      const result = await aiEmbedMany({ model: embeddingModel, values: inputs });
      embeddings = result.embeddings;
      totalTokens = result.usage?.tokens ?? 0;
    }

    const latencyMs = Date.now() - startTime;
    const cost = calculateEmbeddingCost(modelId, totalTokens);

    emitEvent({
      type: "ai.embedding",
      timestamp: new Date(),
      request: {
        model: modelId as ModelId,
        feature: request.metadata?.feature ?? "embedding",
        workspaceId: request.metadata?.workspaceId,
        userId: request.metadata?.userId,
      },
      response: {
        model: modelId,
        provider: "openai",
        usage: { inputTokens: totalTokens, outputTokens: 0, totalTokens },
        cost,
        latencyMs,
        success: true,
      },
    });

    return { embeddings, usage: { totalTokens }, cost, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    emitEvent({
      type: "ai.embedding",
      timestamp: new Date(),
      request: {
        model: modelId as ModelId,
        feature: request.metadata?.feature ?? "embedding",
        workspaceId: request.metadata?.workspaceId,
        userId: request.metadata?.userId,
      },
      response: {
        model: modelId,
        provider: "openai",
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
