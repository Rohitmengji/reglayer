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
import { getModelConfig, getAvailableModels } from "@/lib/ai/gateway/providers/registry";
import { routeToModel } from "@/lib/ai/routing/model-router";
import { selectModel } from "@/lib/ai/routing/selector";
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
import { selectContext } from "@/lib/ai/chat/context-budget";
import { composeSystemPrompt } from "@/lib/ai/prompts/compose";
import { planRequest } from "@/lib/ai/planner/pre-execution";
import { LineageBuilder, traceToHeaders } from "@/lib/ai/lineage/tracker";
import { recordAuditEntry } from "@/lib/ai/audit/trail";
import { getProfile, formatProfileForPrompt, trackUsage } from "@/lib/ai/profile/service";
import { getMemories, formatMemoriesForPrompt, extractMemories, setMemory } from "@/lib/ai/memory/service";
import { getViolationSummary, formatViolationSummaryForPrompt } from "@/lib/ai/chat/violation-summary";
import { runGuardrails, CHAT_GUARDS, type GuardContext } from "@/lib/ai/guardrails";
import { PLAN_LIMITS, type PlanType } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Provider budget for one streamed answer, kept under `maxDuration`.
 *
 * The provider timeout MUST fire before the platform's 60s kill, or it never fires at
 * all — an abort we raise is a diagnosable "the model stalled", a platform kill is an
 * opaque dropped connection the client can only report as "interrupted". 50s leaves
 * headroom for the post-stream finalisation (guardrails, lineage, the done frame).
 */
const CHAT_STREAM_BUDGET_MS = 50_000;

// ── Request Validation ────────────────────────────────────────────────────────

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Allow empty content at the schema level so a single empty assistant reply
  // (e.g. a provider hiccup that returned no text) doesn't 400 the ENTIRE
  // conversation on the next turn. Empty messages are stripped after parsing.
  content: z.string().max(10_000),
});

const chatRequestSchema = z.object({
  // Abuse guard only. Context fitting is the budget engine's job — a hard reject here
  // permanently bricked any conversation past the limit, because every retry of an
  // over-length history failed identically.
  messages: z.array(chatMessageSchema).min(1).max(200),
});

/**
 * Stand-in for a retrieval that the plan decided not to run.
 *
 * Shaped like a real result so every downstream consumer — lineage, compression
 * reporting, prompt composition — keeps working without a skip-specific branch.
 */
const EMPTY_RETRIEVAL = {
  context: "",
  cached: false,
  cacheLayer: null,
  stages: [],
  tokenCount: 0,
} as unknown as Awaited<ReturnType<typeof optimizedRetrieve>>;

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

  // The routed decision is now APPLIED. Previously this line read
  // `const modelId = fallbackModelId;`, so every request used the same default and the
  // documented cost savings were never realised — while lineage recorded a routing
  // decision the system had not acted on.
  const modelSelection = selectModel(
    { complexity: routing.complexity, objective: "balanced" },
    getAvailableModels(),
    fallbackModelId,
  );
  const modelId = modelSelection.modelId;
  const dynamicMaxTokens = routing.config.maxTokens;
  lineage.addStage({
    name: "model_routing",
    category: "processing",
    details: {
      tier: routing.tier,
      complexity: routing.complexity,
      maxTokens: dynamicMaxTokens,
      selectedModel: modelId,
      reason: modelSelection.reason,
    },
    success: true,
  });

  // ── 6. Resolve user + workspace ─────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, plan: true, isMasterAdmin: true },
  });
  const membership = user ? await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
    orderBy: { joinedAt: "asc" },
  }) : null;

  const userId = user?.id ?? session.user.email;
  const workspaceId = membership?.workspaceId ?? null;
  const userPlan = (user?.plan ?? "FREE") as PlanType;
  const isMasterAdmin = user?.isMasterAdmin ?? false;

  lineage.recordInput(latestUserMessage, userId, workspaceId ?? "");

  // ── 7. Plan the request before paying for any of it ─────────────────────
  const plan = planRequest(latestUserMessage);

  // Some questions have exactly one correct answer that we already hold. Answering
  // from the WCAG database is instant, free, and cannot hallucinate a criterion —
  // which is the failure mode this product cannot ship.
  if (plan.strategy === "direct-answer" && plan.directAnswer) {
    incrementCounter("ai.chat.direct_answer", { reason: plan.reason });
    return new Response(
      `data: ${JSON.stringify({ type: "text", content: plan.directAnswer })}\n` +
      `data: ${JSON.stringify({ type: "done" })}\n`,
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const preset = plan.tier === "fast" ? FAST_PRESET : BALANCED_PRESET;

  // ── 7b. Daily chat allowance ────────────────────────────────────────────
  //
  // Chat costs no AI credits (see the note on AI_CREDIT_COSTS), but it is still a
  // model call sitting behind a free signup, so it cannot be unbounded. The burst
  // limiter in step 2 stops hammering; this stops a slow drip running all day.
  //
  // Deliberately AFTER the direct-answer branch above: that path answers from the
  // WCAG database with no model call, so it costs nothing and shouldn't count
  // against the user's day.
  const dailyLimit = PLAN_LIMITS[userPlan].chatMessagesPerDay;
  if (dailyLimit !== -1 && !isMasterAdmin) {
    const daily = await rateLimit(userId, { limit: dailyLimit, windowSec: 86_400 }, "ai-chat-daily");
    if (!daily.success) {
      incrementCounter("ai.chat.daily_limit_reached", { plan: userPlan });
      return new Response(
        JSON.stringify({
          error: "chat_daily_limit",
          message: `You have reached your daily limit of ${dailyLimit} chat messages.`,
          resetAt: daily.resetAt,
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json", ...rateLimitHeaders(daily) },
        },
      );
    }
  }

  // ── 8+9. Retrieval + profile + memories (ALL in parallel for speed) ─────
  // These three are independent — running them concurrently saves 200-500ms
  // which is the difference between "instant" and "noticeable delay".
  //
  // Each is now CONDITIONAL. Previously every request ran a vector search, a profile
  // query, and a memory query — including "hi", and including reference questions
  // where personal memory cannot change the answer.
  const [retrieval, profile, memories, scanSummary] = await Promise.all([
    plan.needsRetrieval
      ? optimizedRetrieve(latestUserMessage, {
          ...preset,
          workspaceId: workspaceId ?? "",
          userId,
        })
      : Promise.resolve(EMPTY_RETRIEVAL),
    plan.needsMemory ? getProfile(userId).catch(() => null) : Promise.resolve(null),
    plan.needsMemory
      ? getMemories({ userId, workspaceId: workspaceId ?? null }).catch(() => [])
      : Promise.resolve([]),
    // Only when the question is about the user's own data. `needsTools` is the
    // planner's own "mentions my/our/scan/violations" signal, so a WCAG reference
    // question does not pay for two extra queries it cannot use.
    plan.needsTools
      ? getViolationSummary({ workspaceId: workspaceId ?? null, userId, isMasterAdmin }).catch(() => null)
      : Promise.resolve(null),
  ]);

  lineage.recordCache(retrieval.cached, retrieval.cacheLayer);

  // Accumulated while recording rather than recomputed later, so the sample size the
  // prompt states is the same number the "grounded in N sources" badge shows. Deriving
  // it twice is how the prompt and the UI would drift apart.
  let retrievedDocs = 0;
  for (const stage of retrieval.stages.filter((s) => !s.skipped && s.name.startsWith("retrieve") || s.name === "hybrid-search")) {
    retrievedDocs += stage.resultCount;
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

  // Authoritative totals, so "how many" is answered from the database rather than by
  // counting the retrieval window. The retrieved document count is passed in so the
  // block can state the size of the sample the model is actually looking at.
  const scanSummaryContext = scanSummary
    ? formatViolationSummaryForPrompt(scanSummary, retrievedDocs)
    : "";

  // Recorded as a retrieval source so the grounding badge tells the truth.
  //
  // `isGrounded` is driven by documentsRetrieved, which counts vector hits only. An
  // answer built from these totals but no vector hits was being labelled "general
  // guidance — not from your data" while quoting the user's own violation counts back
  // at them. Observed: "You have a total of 94 violations... 4 critical" under exactly
  // that badge. Understating grounding is a smaller lie than overstating it, but in a
  // compliance tool it still teaches the user to ignore the label.
  if (scanSummaryContext) {
    lineage.recordRetrieval({ source: "scan-summary", resultCount: 1, durationMs: 0 });
  }

  // ── 10. Build augmented system prompt ───────────────────────────────────
  const isRAGAugmented = retrieval.context.length > 0;
  const basePrompt = getPrompt(isRAGAugmented ? "chat-rag" : "chat-system");

  lineage.recordPrompt(isRAGAugmented ? "chat-rag" : "chat-system", basePrompt.version ?? 1);

  // ── 10b. Decision Engine — inject workspace decisions as constraints ────
  // This is RegLayer's moat: the AI enforces workspace-level decisions on
  // every response. If the workspace decided "WCAG 2.2 AA" and "TypeScript
  // required," the AI must follow those in all recommendations.
  let decisionBlock = "";
  if (workspaceId) {
    const { loadDecisions, formatDecisionsForPrompt } = await import("@/lib/ai/decisions/engine");
    decisionBlock = formatDecisionsForPrompt(await loadDecisions(workspaceId));
  }

  // Composition is extracted and tested: previously retrieval was wrapped against
  // injection but profile and memory were concatenated raw, so the protection was
  // inconsistent in a way that was invisible inline.
  const composed = composeSystemPrompt({
    base: basePrompt.system,
    retrievedContext: isRAGAugmented ? retrieval.context : undefined,
    scanSummary: scanSummaryContext || undefined,
    userProfile: profileContext || undefined,
    userMemory: memoryContext || undefined,
    workspaceDecisions: decisionBlock || undefined,
  });
  const systemPrompt = composed.system;

  // ── 11. Build final message array (model-aware token budget) ───────────
  // The previous guard compared a character-based estimate against a hardcoded
  // 100_000 and then kept `slice(-10)`. It ignored the routed model's real window
  // (32k for local models, 1M for Gemini) and could sever a question from its answer.
  const selection = selectContext({
    system: systemPrompt,
    history: sanitizedMessages,
    budget: {
      contextWindow: getModelConfig(modelId).contextWindow ?? 128_000,
      reserveOutputTokens: dynamicMaxTokens,
    },
  });

  if (selection.overflow) {
    // The system prompt plus the current question alone exceed the window. Trimming
    // cannot help, and answering from a mangled prompt would be confidently wrong.
    return new Response(
      "This request is too large for the available model. Try a shorter message or start a new conversation.",
      { status: 413 },
    );
  }

  const messages = selection.messages;
  const estimatedTokens = selection.usedTokens;


  // ── 12. Tools (workspace-scoped, and only when the plan needs them) ─────
  // Offering tools for a question about the WCAG spec invites a pointless database
  // round-trip and an extra model step.
  const tools = plan.needsTools ? createChatTools({ workspaceId, userId }) : undefined;

  // ── 13. Stream LLM response ─────────────────────────────────────────────
  const streamStart = Date.now();
  const result = await stream({
    model: modelId,
    messages,
    tools,
    temperature: basePrompt.defaultTemperature,
    // The ROUTED budget, not the prompt default. `dynamicMaxTokens` was previously
    // computed from the routing tier, reported to telemetry, and then discarded here —
    // so metrics described a limit the model was never given.
    maxTokens: dynamicMaxTokens,
    // Stop generating when the user cancels or the browser disconnects. Without this,
    // "Stop" only hid the client's reader while the model ran to completion on our bill.
    abortSignal: request.signal,
    // Below maxDuration so our own timeout fires first and is diagnosable.
    timeoutMs: CHAT_STREAM_BUDGET_MS,
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

  // ── Metrics: latency and token usage ───────────────────────────────
  // These describe the REQUEST, so they are recorded here. The completion counter is
  // deliberately NOT here — see `ai.chat.completed`, emitted after the stream ends.
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

        // Emitted ONLY after `done` is written. `ai.chat.request` counts attempts and
        // fires before the first token, so without this pair the success rate was
        // unmeasurable and every dashboard silently counted died-mid-stream runs as
        // successes.
        incrementCounter("ai.chat.completed", { tier: routing.tier });
      } catch (err) {
        incrementCounter("ai.chat.stream_failed", { tier: routing.tier });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "Stream error" })}\n`));
      } finally {
        controller.close();
      }
    },

    /**
     * The consumer (the HTTP response) was cancelled — the client disconnected or
     * navigated away. Release the upstream reader so the provider stream is torn down
     * rather than left draining into a controller nobody is listening to. The abort
     * signal already stops generation; this stops the plumbing.
     */
    async cancel() {
      incrementCounter("ai.chat.stream_cancelled", { tier: routing.tier });
      try { await reader.cancel(); } catch { /* already closed */ }
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
