/**
 * RegLayer — OpenAI Provider Adapter
 *
 * WHY:  The gateway needs a uniform way to call any LLM provider. This adapter
 *       translates our gateway's `CompletionRequest` into Vercel AI SDK calls
 *       using the OpenAI provider. When the gateway says "call gpt-4o-mini with
 *       these messages," this adapter does the actual work.
 *
 * WHY VERCEL AI SDK (not raw `openai` package):
 *   The raw `openai` package works fine for basic chat completions (it's what
 *   the existing violationExplainer uses). But the Vercel AI SDK gives us:
 *   1. Streaming with `streamText()` — one function call, not manual chunk parsing
 *   2. Tool calling abstraction — same API for OpenAI functions and Anthropic tools
 *   3. Structured output with Zod — guaranteed schema conformance
 *   4. Unified provider interface — swap providers without changing calling code
 *
 *   We're NOT replacing the `openai` package globally. We're using the AI SDK
 *   inside the gateway. The `openai` package is still a transitive dependency
 *   (the AI SDK OpenAI adapter uses it under the hood).
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, EmbeddingModel } from "ai";

/**
 * Create an OpenAI language model instance for the given model ID.
 */
export function createOpenAIModel(providerModelId: string): LanguageModel {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  return openai(providerModelId);
}

/**
 * Create an OpenAI embedding model instance for the given model ID.
 * Used by the gateway's embed() function.
 */
export function createOpenAIEmbeddingModel(providerModelId: string): EmbeddingModel {
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY ?? "",
  });

  return openai.embedding(providerModelId);
}
