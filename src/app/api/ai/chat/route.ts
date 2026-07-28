/**
 * RegLayer — AI Chat Streaming API (Production Pipeline)
 *
 * The main chat endpoint wiring ALL AI infrastructure end-to-end:
 *
 *   Auth → Rate Limit → PII Redaction → Cache Check →
 *   Retrieval (hybrid + graph + knowledge) → Compression →
 *   Profile + Memory Injection → Stream LLM → Guardrails →
 *   Lineage Trace → Audit Trail → Memory Extraction → Response
 */

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { z } from "zod";
import { stream, getDefaultModelId, isAIAvailable } from "@/lib/ai/gateway";
import { getModelConfig } from "@/lib/ai/gateway/providers/registry";
import { routeToModel } from "@/lib/ai/routing/model-router";
import { trackAILatency, trackTokenUsage, incrementCounter } from "@/lib/telemetry/metrics";
import { getPrompt } from "@/lib/ai/prompts/registry";
import { createChatTools } from "@/lib/ai/tools/definitions";
import { containsPII, sanitizeForLLM } from "@/lib/ai/hardening";
import { detectJailbreakAttempt } from "@/lib/ai/safety/guardrails";
import { rateLimit, RATE_LIMITS, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/database/prisma";
import { toTextStream } from "ai";
// ── Integrated AI Infrastructure ──────────────────────────────────────────────
import { optimizedRetrieve, BALANCED_PRESET, FAST_PRESET } from "@/lib/ai/retrieval/pipeline";
import { classifyIntent } from "@/lib/ai/planner/engine";
import { LineageBuilder, traceToHeaders } from "@/lib/ai/lineage/tracker";
import { recordAuditEntry } from "@/lib/ai/audit/trail";
import { getProfile, formatProfileForPrompt, trackUsage } from "@/lib/ai/profile/service";
import { getMemories, formatMemoriesForPrompt, extractMemories, setMemory } from "@/lib/ai/memory/service";
import { runGuardrails, CHAT_GUARDS, type GuardContext } from "@/lib/ai/guardrails";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Request Validation ────────────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Allow empty content at the schema level so a single empty assistant reply
  // (e.g. a provider hiccup that returned no text) doesn't 400 the ENTIRE
  // conversation on the next turn. Empty messages are stripped after parsing.
  content: z.string().max(10_000),
});

const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Start lineage trace ─────────────────────────────────────────────────
  const lineage = new LineageBuilder();

  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── 2. Rate limit ───────────────────────────────────────────────────────
  const rl = await rateLimit(session.user.email, RATE_LIMITS.ai);
  if (!rl.success) {
    return new Response("Too many requests. Please wait before sending another message.", {
      status: 429,
      headers: rateLimitHeaders(rl),
    });
  }

  // ── 3. AI availability ──────────────────────────────────────────────────
  if (!isAIAvailable()) {
    return new Response("AI features are not configured", { status: 503 });
  }
  const fallbackModelId = getDefaultModelId();
  if (!fallbackModelId) {
    return new Response("No AI model available", { status: 503 });
  }

  // ── 4. Parse + validate ─────────────────────────────────────────────────
  let body: unknown;
  try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid request", details: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── 5. PII redaction ────────────────────────────────────────────────────
  // Drop empty-content messages first — a prior empty assistant reply must not
  // poison the history (the schema now permits them so this turn still succeeds).
  const nonEmptyMessages = parsed.data.messages.filter((m) => m.content.trim().length > 0);
  if (nonEmptyMessages.length === 0) {
    return new Response(
      JSON.stringify({ error: "No message content provided" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const sanitizedMessages = nonEmptyMessages.map((m) =>
    m.role === "user" && containsPII(m.content)
      ? { ...m, content: sanitizeForLLM(m.content) }
      : m,
  );

  const userMessages = sanitizedMessages.filter((m) => m.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1]?.content ?? "";

  // ── 5b. Jailbreak detection ─────────────────────────────────────────────
  if (detectJailbreakAttempt(latestUserMessage)) {
    lineage.addStage({ name: "jailbreak_blocked", category: "validation", details: { reason: "pattern_match" }, success: true });
    incrementCounter("ai.jailbreak.blocked");
    return new Response(
      "I can only help with accessibility and compliance topics. Please rephrase your question.",
      { status: 200 },
    );
  }

  // ── 5c. Dynamic model routing ───────────────────────────────────────────
  const wantsCode = /\b(code|fix|implement|html|css|javascript|jsx|tsx|react|component)\b/i.test(latestUserMessage);
  const routing = routeToModel({
    message: latestUserMessage,
    historyLength: sanitizedMessages.length,
    wantsCode,
  });
  const modelId = fallbackModelId;
  const dynamicMaxTokens = routing.config.maxTokens;
  lineage.addStage({
    name: "model_routing",
    category: "processing",
    details: { tier: routing.tier, complexity: routing.complexity, maxTokens: dynamicMaxTokens },
    success: true,
  });

  // ── 6. Resolve user + workspace ─────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true },
  });
  const membership = user ? await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  }) : null;

  const userId = user?.id ?? session.user.email;
  const workspaceId = membership?.workspaceId ?? null;

  lineage.recordInput(latestUserMessage, userId, workspaceId ?? "");

  // ── 7. Intent classification → retrieval preset ─────────────────────────
  const intent = classifyIntent(latestUserMessage);
  const preset = intent === "conversational" ? FAST_PRESET : BALANCED_PRESET;

  // ── 8+9. Retrieval + profile + memories (ALL in parallel for speed) ─────
  // These three are independent — running them concurrently saves 200-500ms
  // which is the difference between "instant" and "noticeable delay".
  const [retrieval, profile, memories] = await Promise.all([
    optimizedRetrieve(latestUserMessage, {
      ...preset,
      workspaceId: workspaceId ?? "",
      userId,
    }),
    getProfile(userId).catch(() => null),
    getMemories({ userId, workspaceId: workspaceId ?? null }).catch(() => []),
  ]);

  lineage.recordCache(retrieval.cached, retrieval.cacheLayer);

  for (const stage of retrieval.stages.filter((s) => !s.skipped && s.name.startsWith("retrieve") || s.name === "hybrid-search")) {
    lineage.recordRetrieval({
      source: stage.name,
      resultCount: stage.resultCount,
      durationMs: stage.latencyMs,
    });
  }

  if (retrieval.stages.some((s) => s.name === "compression")) {
    const comp = retrieval.stages.find((s) => s.name === "compression")!;
    lineage.recordCompression({
      inputTokens: retrieval.tokenCount * 2,
      outputTokens: retrieval.tokenCount,
      chunksIn: comp.resultCount * 2,
      chunksOut: comp.resultCount,
      durationMs: comp.latencyMs,
    });
  }

  const profileContext = profile ? formatProfileForPrompt(profile) : "";
  const memoryContext = formatMemoriesForPrompt(memories);

  // ── 10. Build augmented system prompt ───────────────────────────────────
  const isRAGAugmented = retrieval.context.length > 0;
  const basePrompt = getPrompt(isRAGAugmented ? "chat-rag" : "chat-system");

  lineage.recordPrompt(isRAGAugmented ? "chat-rag" : "chat-system", basePrompt.version ?? 1);

  let systemPrompt = basePrompt.system;
  if (isRAGAugmented) {
    // Wrap retrieved context in XML delimiters to prevent prompt injection via
    // malicious scan data (e.g. violation descriptions containing "ignore previous
    // instructions"). The model treats content inside <context> as data, not instructions.
    const escapedContext = `<context>\n${retrieval.context}\n</context>`;
    systemPrompt = systemPrompt.replace("{{context}}", escapedContext);
  }
  if (profileContext) systemPrompt += `\n\n<user_profile>\n${profileContext}\n</user_profile>`;
  if (memoryContext) systemPrompt += `\n\n<user_memory>\n${memoryContext}\n</user_memory>`;

  // ── 10b. Decision Engine — inject workspace decisions as constraints ────
  // This is RegLayer's moat: the AI enforces workspace-level decisions on
  // every response. If the workspace decided "WCAG 2.2 AA" and "TypeScript
  // required," the AI must follow those in all recommendations.
  if (workspaceId) {
    const { loadDecisions, formatDecisionsForPrompt } = await import("@/lib/ai/decisions/engine");
    const decisions = await loadDecisions(workspaceId);
    const decisionBlock = formatDecisionsForPrompt(decisions);
    if (decisionBlock) systemPrompt += decisionBlock;
  }

  // ── 11. Build final message array ───────────────────────────────────────
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...sanitizedMessages,
  ];

  // Token budget protection
  const estimatedTokens = messages.reduce((acc, m) => acc + m.content.length, 0) / 4;
  if (estimatedTokens > 100_000) {
    const systemMsg = messages[0];
    const recent = messages.slice(-10);
    messages.length = 0;
    messages.push(systemMsg, ...recent);
  }

  // ── 12. Tools (workspace-scoped) ────────────────────────────────────────
  const tools = createChatTools({ workspaceId, userId });

  // ── 13. Stream LLM response ─────────────────────────────────────────────
  const streamStart = Date.now();
  const result = stream({
    model: modelId,
    messages,
    tools,
    temperature: basePrompt.defaultTemperature,
    maxTokens: basePrompt.defaultMaxTokens,
    metadata: {
      feature: isRAGAugmented ? "chat-rag" : "chat",
      userId: session.user.email,
      workspaceId: workspaceId ?? undefined,
    },
  });

  if (!result) {
    return new Response("AI provider unavailable", { status: 503 });
  }

  const resolvedProvider = getModelConfig(modelId).provider;

  lineage.recordGeneration({
    model: modelId,
    provider: resolvedProvider,
    inputTokens: Math.round(estimatedTokens),
    outputTokens: 0, // unknown until stream completes
    costUsd: 0,
    durationMs: Date.now() - streamStart,
    temperature: basePrompt.defaultTemperature ?? 0.4,
  });

  // ── 14. Fire-and-forget: audit, memory, tracking ────────────────────────
  // These run AFTER the response starts streaming — they don't block the user.

  const traceId = lineage.getTraceId();

  // Audit trail
  recordAuditEntry({
    userId,
    email: session.user.email,
    workspaceId: workspaceId ?? undefined,
    action: "chat",
    feature: isRAGAugmented ? "chat-rag" : "chat",
    promptId: isRAGAugmented ? "chat-rag" : "chat-system",
    model: modelId,
    provider: resolvedProvider,
    input: latestUserMessage,
    inputTokens: Math.round(estimatedTokens),
    traceId,
    consentBasis: "legitimate_interest",
  }).catch(() => {}); // fire-and-forget

  // ── Metrics: track AI request latency and token usage ───────────────────
  const chatLatencyMs = Date.now() - streamStart;
  trackAILatency(modelId, chatLatencyMs, false);
  trackTokenUsage(modelId, Math.round(estimatedTokens), dynamicMaxTokens);
  incrementCounter("ai.chat.request", { tier: routing.tier });

  // Memory extraction from user message
  const extracted = extractMemories(latestUserMessage);
  for (const mem of extracted) {
    setMemory({ userId, workspaceId }, mem.key, mem.value, {
      source: "inferred",
      confidence: 0.7,
    }).catch(() => {});
  }

  // Usage tracking for profile
  trackUsage(userId, "chat").catch(() => {});

  // ── 15. Build lineage trace + headers ───────────────────────────────────
  lineage.recordOutput(0); // length unknown until stream completes
  const trace = lineage.build();
  const lineageHeaders = traceToHeaders(trace);

  // ── 16. Return structured streaming response ────────────────────────────
  // Format: Server-Sent Events style with typed chunks:
  //   data: {"type":"text","content":"..."}\n
  //   data: {"type":"tool_start","id":"...","name":"...","args":{...}}\n
  //   data: {"type":"tool_end","id":"...","result":"...","durationMs":42}\n
  //   data: {"type":"lineage","data":{...}}\n
  //   data: {"type":"done"}\n
  const textStream = toTextStream(result);
  const reader = textStream.getReader();
  const encoder = new TextEncoder();

  // Guardrails run on the FULL response, which for a streaming endpoint is only
  // available once the stream completes. They are therefore advisory here — we
  // surface warnings (e.g. hallucinated WCAG criteria) in the lineage trace so
  // the client's Explainability panel can flag them, but we cannot un-send text
  // that has already been streamed to the user.
  const guardContext: GuardContext = {
    feature: "chat",
    userMessage: latestUserMessage,
    ragAugmented: trace.summary.documentsRetrieved > 0,
  };

  const structuredStream = new ReadableStream({
    async start(controller) {
      try {
        let fullText = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // value is already a string from toTextStream()
          const textChunk = value as string;
          fullText += textChunk;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: textChunk })}\n`));
        }

        // Run guardrails on the accumulated response, then record the results
        // into the lineage so the emitted summary reflects real validation.
        let guardrailsPassed = trace.summary.guardrailsPassed;
        let guardrailsWarned = trace.summary.guardrailsWarned ?? [];
        try {
          const guardResult = runGuardrails(fullText, guardContext, CHAT_GUARDS);
          lineage.recordGuardrails(guardResult.results);
          const updated = lineage.build();
          guardrailsPassed = updated.summary.guardrailsPassed;
          guardrailsWarned = updated.summary.guardrailsWarned;
        } catch { /* guardrails are best-effort — never break the response */ }

        // After text is done, emit lineage
        const lineageSummary = {
          traceId: trace.traceId,
          model: modelId,
          provider: resolvedProvider,
          retrievalSources: trace.summary.retrievalSources,
          documentsRetrieved: trace.summary.documentsRetrieved,
          toolsCalled: trace.summary.toolsCalled,
          guardrailsPassed,
          guardrailsWarned,
          cached: trace.summary.cached,
          totalTokens: trace.summary.totalTokens,
          costUsd: trace.summary.costUsd,
          latencyMs: Date.now() - streamStart,
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "lineage", data: lineageSummary })}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Stream error" })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(structuredStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...lineageHeaders,
    },
  });
}
