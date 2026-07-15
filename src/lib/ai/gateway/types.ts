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
  | "claude-opus";

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

export type Message = TextMessage | MultimodalMessage;

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
   * When provided, the gateway uses the AI SDK's structured output feature
   * to guarantee the response conforms to this schema.
   */
  schema?: z.ZodType;

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
  type: "ai.completion" | "ai.embedding";
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
