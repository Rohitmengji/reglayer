/**
 * RegLayer — AI Gateway Types
 *
 * WHY:  Every caller must interact with the AI layer through a single,
 *       provider-agnostic contract. These types ARE the API surface.
 *       When violationExplainer, complianceSummary, or a future chat agent
 *       needs an LLM, it speaks these types — never OpenAI or Anthropic types.
 *
 * DESIGN DECISIONS:
 * - `ModelId` is a union of known model aliases, not raw strings.
 *   This prevents typos ("gpt-4o-mimi") and lets the registry map aliases
 *   to actual provider model IDs.
 * - `metadata` on requests enables per-feature cost tracking and audit
 *   logging without the caller needing to know how tracking works.
 * - `CompletionResponse` always includes cost and latency — these are
 *   first-class concerns in any production AI system, not afterthoughts.
 * - Provider-specific response shapes are normalized away. The caller
 *   gets `content`, `usage`, `cost`, and nothing else.
 */

import type { z } from "zod";
import type { ToolSet } from "ai";

// ── Model Identifiers ─────────────────────────────────────────────────────────
// These are RegLayer's internal model aliases. The registry maps them to
// actual provider model IDs (e.g., "gpt-4o-mini" → openai("gpt-4o-mini")).
// When Google is added later, add new aliases here — no calling code changes.

export type ModelId =
  // OpenAI models
  | "gpt-4o-mini"
  | "gpt-4o"
  | "gpt-4.1-mini"
  | "gpt-4.1"
  // Anthropic models
  | "claude-sonnet"
  | "claude-haiku"
  | "claude-opus"
  // Google models
  | "gemini-2.0-flash"
  | "gemini-2.5-pro";

export type Provider = "openai" | "anthropic" | "google";

// ── Embedding Model Identifiers ───────────────────────────────────────────────
// Separate from chat models — embeddings use specialized models optimized for
// vector similarity, not text generation.

export type EmbeddingModelId =
  | "text-embedding-3-small"
  | "text-embedding-3-large";

// ── Messages ──────────────────────────────────────────────────────────────────
// Mirrors the standard chat message format used by OpenAI, Anthropic, and
// Google. We don't support every exotic message type — just what we need now.

export interface TextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ImageContent {
  type: "image";
  /** base64-encoded image data (no data: prefix) */
  data: string;
  mimeType: string;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface MultimodalMessage {
  role: "user";
  content: (TextContent | ImageContent)[];
}

export interface ToolMessage {
  role: "tool";
  content: string;
  toolCallId: string;
}

export type Message = TextMessage | MultimodalMessage | ToolMessage;

// ── Completion Request ────────────────────────────────────────────────────────

export interface CompletionRequest {
  /** Which model to use. The registry resolves this to a provider + model ID. */
  model: ModelId;

  /** The conversation messages. */
  messages: Message[];

  /** Sampling temperature (0 = deterministic, 1 = creative). Default 0.3. */
  temperature?: number;

  /** Maximum tokens to generate. */
  maxTokens?: number;

  /** Request JSON output from the model. */
  jsonMode?: boolean;

  /**
   * Optional Zod schema for structured output.
   */
  schema?: z.ZodType;

  /**
   * Tools the LLM can call during this request.
   *
   * MUST be built with the `tool()` helper from "ai" — see lib/ai/tools/definitions.ts.
   *
   * WHY `ToolSet` and not `any`: this field was previously typed `any`, which let a
   * tool set using the pre-v5 `parameters` field compile cleanly while the SDK
   * (which reads `inputSchema`) silently ignored every schema. The result was five
   * tools that never executed, with no type error, no test failure and no runtime
   * error — the model simply answered without them. `ToolSet` makes that a compile error.
   */
  tools?: ToolSet;

  /**
   * Maximum number of sequential model steps (tool call → result → follow-up).
   * Without this the SDK stops after a single step, so the model can invoke a tool
   * but never gets to use its result. Defaults to 5 in the gateway.
   */
  maxSteps?: number;

  /**
   * Retry attempts for retryable provider failures (429/5xx/network).
   * Defaults to 2 in the gateway. Set 0 for latency-sensitive calls where a slow
   * failure is worse than a fast one.
   */
  maxRetries?: number;

  /**
   * Caller's abort signal — usually the incoming request's `request.signal`.
   *
   * Threaded into the provider call so that when the user cancels or the browser
   * disconnects, generation actually STOPS. Without it a "Stop" click only hides the
   * client's reader; the model keeps producing tokens to completion and we keep paying
   * for an answer nobody will read.
   */
  abortSignal?: AbortSignal;

  /**
   * Overall wall-clock budget for this call, in milliseconds.
   *
   * Defaults to the gateway's streaming ceiling. Serverless callers MUST pass a value
   * below their function's `maxDuration`, or the platform kills the request before this
   * fires and the timeout is decorative — an abort we control produces a diagnosable
   * error, a platform kill produces an opaque one.
   */
  timeoutMs?: number;

  /** Caller metadata — used for cost tracking, audit logging, and rate limiting. */
  metadata?: RequestMetadata;
}

export interface RequestMetadata {
  /** Which workspace is making this call (for per-workspace cost tracking). */
  workspaceId?: string;
  /** Which user triggered this call. */
  userId?: string;
  /** Which feature is using the LLM (e.g., "violation-explainer", "chat"). */
  feature: string;
}

// ── Completion Response ───────────────────────────────────────────────────────

export interface CompletionResponse {
  /** The model's text output. */
  content: string;

  /** Token usage reported by the provider. */
  usage: TokenUsage;

  /** Which model actually served the request (may differ from requested if fallback). */
  model: string;

  /** Which provider served the request. */
  provider: Provider;

  /** End-to-end latency in milliseconds. */
  latencyMs: number;

  /** Calculated cost based on token usage and model pricing. */
  cost: CostBreakdown;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostBreakdown {
  /** Cost of input tokens in USD. */
  inputCost: number;
  /** Cost of output tokens in USD. */
  outputCost: number;
  /** Total cost in USD. */
  totalCost: number;
}

// ── Model Registry Types ──────────────────────────────────────────────────────

export interface ModelConfig {
  /** RegLayer's alias for this model. */
  id: ModelId;
  /** The actual model identifier sent to the provider API. */
  providerModelId: string;
  /** Which provider serves this model. */
  provider: Provider;
  /** Display name for dashboards. */
  displayName: string;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Maximum output tokens. */
  maxOutputTokens: number;
  /** Pricing per 1M tokens (USD). */
  pricing: {
    inputPerMillion: number;
    outputPerMillion: number;
  };
  /** Whether this model supports vision/image inputs. */
  supportsVision: boolean;
  /** Whether this model supports JSON mode. */
  supportsJsonMode: boolean;
  /**
   * Relative capability, 1-10.
   *
   * WHY EXPLICIT: routing needs to know "is this model good enough for this question",
   * and the obvious shortcut — treating price as a proxy for capability — is a hidden
   * assumption that breaks the moment a cheaper frontier model appears. Stating it as
   * data keeps the router honest and makes adding a provider a registry edit.
   */
  quality: number;
  /** Typical end-to-end latency in ms, used for latency-optimised routing. */
  avgLatencyMs: number;
  /** Whether this model is currently available (env var set). */
  isAvailable: () => boolean;
}

// ── Embedding Request / Response ──────────────────────────────────────────────

export interface EmbedRequest {
  /** Which embedding model to use. */
  model?: EmbeddingModelId;
  /** The text(s) to embed. Single string or array for batch embedding. */
  input: string | string[];
  /** Caller metadata for cost tracking. */
  metadata?: RequestMetadata;
}

export interface EmbedResponse {
  /** The embedding vector(s). Single input → single vector, array → array. */
  embeddings: number[][];
  /** Token usage. */
  usage: { totalTokens: number };
  /** Cost in USD. */
  cost: CostBreakdown;
  /** Latency in milliseconds. */
  latencyMs: number;
}

// ── Gateway Events ────────────────────────────────────────────────────────────
// The gateway emits events for observability. Listeners (cost tracker, logger,
// future analytics) subscribe without coupling to the gateway internals.

export interface GatewayEvent {
  /**
   * "ai.guardrail" records a post-generation policy violation (e.g. a hallucinated
   * WCAG criterion). It carries zero tokens/cost — it is a quality signal, not a
   * spend signal — so aggregate cost queries must filter on type.
   */
  type: "ai.completion" | "ai.embedding" | "ai.guardrail";
  timestamp: Date;
  request: {
    model: ModelId;
    feature: string;
    workspaceId?: string;
    userId?: string;
  };
  response: {
    model: string;
    provider: Provider;
    usage: TokenUsage;
    cost: CostBreakdown;
    latencyMs: number;
    success: boolean;
    error?: string;
  };
}

export type GatewayEventHandler = (event: GatewayEvent) => void | Promise<void>;
