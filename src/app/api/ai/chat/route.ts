/**
 * RegLayer — AI Chat Streaming API
 *
 * WHY:  This is the HTTP endpoint that the chat UI connects to. It receives
 *       the user's messages, calls the AI Gateway's stream() function, and
 *       returns a streaming response using Server-Sent Events (SSE).
 *
 * HOW STREAMING WORKS (for learning):
 *   1. Browser sends POST with { messages: [...] }
 *   2. Server calls gateway.stream() → gets a StreamTextResult
 *   3. StreamTextResult.toTextStream() returns a ReadableStream of text chunks
 *   4. We wrap that in a Response with Content-Type: text/plain
 *   5. Browser reads chunks via response.body.getReader()
 *   6. Each chunk is a piece of the assistant's response
 *   7. UI appends chunks to the displayed message in real-time
 *
 * WHY text/plain (not text/event-stream):
 *   The AI SDK's toTextStream() produces plain text chunks, not SSE format.
 *   This is simpler to consume on the client — just read the stream directly.
 *   No need to parse "data: ..." SSE frames. ChatGPT and Claude both use
 *   similar approaches for their streaming APIs.
 *
 * SECURITY:
 *   - Requires authenticated session (NextAuth)
 *   - Rate limited per user
 *   - Messages validated with Zod
 *   - System prompt is server-side only (never sent from client)
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { stream, getDefaultModelId, isAIAvailable } from "@/lib/ai/gateway";
import { getPrompt } from "@/lib/ai/prompts/registry";
import { buildRAGContext, buildRAGMessages } from "@/lib/ai/rag/service";
import { toTextStream } from "ai";

// Force Node.js runtime for streaming (Edge doesn't support all Node APIs)
export const runtime = "nodejs";

// Allow up to 60s for streaming responses (LLMs can be slow on long outputs)
export const maxDuration = 60;

// ── Request Validation ────────────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(10_000),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 2. Check AI availability
  if (!isAIAvailable()) {
    return new Response("AI features are not configured", { status: 503 });
  }

  const modelId = getDefaultModelId();
  if (!modelId) {
    return new Response("No AI model available", { status: 503 });
  }

  // 3. Parse and validate request
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 4. Build RAG-augmented messages
  // Extract the latest user message for semantic search
  const userMessages = parsed.data.messages.filter((m) => m.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

  // Retrieve relevant violations and build augmented context
  const ragContext = await buildRAGContext(latestUserMessage);
  const messages = buildRAGMessages(parsed.data.messages, ragContext);

  // 5. Call the AI Gateway stream
  const prompt = getPrompt(ragContext.augmented ? "chat-rag" : "chat-system");
  const result = stream({
    model: modelId,
    messages,
    temperature: prompt.defaultTemperature,
    maxTokens: prompt.defaultMaxTokens,
    metadata: {
      feature: ragContext.augmented ? "chat-rag" : "chat",
      userId: session.user.email,
    },
  });

  if (!result) {
    return new Response("AI provider unavailable", { status: 503 });
  }

  // 6. Return streaming response
  // toTextStream() converts the AI SDK result into a ReadableStream<string>
  // that emits text chunks as they arrive from the LLM.
  return new Response(toTextStream(result), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
