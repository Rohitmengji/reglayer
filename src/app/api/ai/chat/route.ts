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

// ── System Prompt ─────────────────────────────────────────────────────────────
// This is RegLayer's personality. It lives on the server — the client never
// sees it. This is standard practice: ChatGPT's system prompt is server-side too.

const SYSTEM_PROMPT = `You are RegLayer AI, an expert accessibility compliance assistant.

Your expertise:
- WCAG 2.1 and 2.2 (Levels A, AA, AAA)
- European Accessibility Act (EAA)
- EN 301 549
- ADA (Americans with Disabilities Act)
- Section 508

When answering:
- Be specific and actionable. Give code examples when relevant.
- Reference exact WCAG success criteria (e.g., "WCAG 2.1 SC 1.4.3 Contrast").
- Explain the business impact of accessibility violations.
- Provide remediation steps with priority (critical → serious → moderate → minor).
- If asked about something outside accessibility/compliance, politely redirect.
- Keep responses concise but thorough. Use markdown formatting.
- Never make up regulations or criteria that don't exist.`;

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

  // 4. Build messages with system prompt (server-side only)
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...parsed.data.messages,
  ];

  // 5. Call the AI Gateway stream
  const result = stream({
    model: modelId,
    messages,
    temperature: 0.5,
    maxTokens: 2000,
    metadata: {
      feature: "chat",
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
