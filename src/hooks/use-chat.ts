/**
 * RegLayer — useChat Hook
 *
 * WHY:  Components shouldn't know HOW streaming works. This hook encapsulates:
 *       1. Sending messages to /api/ai/chat
 *       2. Reading the streaming response chunk-by-chunk
 *       3. Appending tokens to the assistant message in real-time
 *       4. Error handling and cleanup
 *
 * HOW STREAMING WORKS ON THE CLIENT (for learning):
 *   1. We POST to /api/ai/chat with the full message history
 *   2. The server returns a streaming Response (Content-Type: text/plain)
 *   3. We call response.body.getReader() to get a ReadableStreamReader
 *   4. We call reader.read() in a loop — each call gives us a chunk of text
 *   5. We append each chunk to the assistant message via the store
 *   6. The UI re-renders on each chunk, showing the text flowing in
 *   7. When reader.read() returns { done: true }, the stream is finished
 *
 *   This is the exact same pattern used by the OpenAI Chat SDK, Vercel AI SDK's
 *   useChat hook, and every production chat interface.
 *
 * WHY WE BUILT THIS INSTEAD OF USING AI SDK's useChat():
 *   The AI SDK provides a useChat() hook, but it:
 *   - Couples to the AI SDK's data stream format (not plain text)
 *   - Has opinions about state management (its own internal state)
 *   - Adds complexity we don't need yet (tool calling, file attachments)
 *   Our hook is ~50 lines and does exactly what we need. We can adopt
 *   AI SDK's useChat() later when we need tool calling in the UI.
 */

"use client";

import { useCallback, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import type { MessageLineage } from "@/stores/chatStore";
import { describeRequestFailure } from "@/lib/ai/chat/request-failure";
import {
  isRecoverableStatus,
  pauseReasonForOutcome,
  queueStatusOf,
  type EnqueueRejection,
} from "@/lib/ai/chat/queue";
import { runCompletionSequence } from "@/lib/ai/chat/completion-pipeline";
import { persistConversation } from "@/lib/ai/chat/persistence";
import { TokenBuffer } from "@/lib/ai/chat/stream-format";
import { browserTransport, ChatTelemetry } from "@/lib/ai/chat/telemetry";

/**
 * Longest gap permitted between stream chunks before a run is abandoned.
 *
 * WHY: `reader.read()` on a black-holed connection never resolves AND never rejects. A
 * laptop sleeping, a NAT table dropping the flow, or a load balancer closing silently
 * leaves the read pending forever — holding the queue lease with `isStreaming` stuck
 * true. Only the user noticing and pressing Stop recovered it.
 *
 * Generous enough to survive a slow first token from a cold model; short enough that a
 * dead connection cannot strand the queue for the rest of the session.
 */
const STREAM_IDLE_TIMEOUT_MS = 45_000;

/**
 * Module-level so batching spans a whole session rather than a single hook instance.
 * Every failure mode in the queue engine was previously invisible in production.
 */
const telemetry = new ChatTelemetry(browserTransport);

/**
 * A per-tab identity, stable for the life of this page.
 *
 * The server generation lease is keyed by conversation and owned by a tab: it stops two
 * tabs open on the SAME conversation from generating into it at once (the client-side
 * runnerToken only guards within one tab). A module-level id is exactly per-tab — a
 * second tab loads its own module instance and gets its own id — which is all the lease
 * needs to tell "me again" from "another tab".
 */
const TAB_ID = typeof crypto !== "undefined" && crypto.randomUUID
  ? crypto.randomUUID()
  : `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;

if (typeof window !== "undefined") {
  // The final events of an ABANDONED session are exactly the ones that define the
  // abandonment metric, so they must survive the page going away.
  window.addEventListener("pagehide", () => telemetry.flush());
}

type StreamOutcome = "completed" | "failed" | "cancelled" | "interrupted";

/** Result of a send: null when the prompt ran immediately, otherwise the queue verdict. */
export type SendResult = null | { ok: true; id: string } | { ok: false; reason: EnqueueRejection };

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}

export function useChat() {
  const {
    messages,
    queuedPrompts,
    isStreaming,
    runnerToken,
    queuePauseReason,
    avgRunMs,
    addMessage,
    updateMessage,
    appendToMessage,
    transitionMessageStatus,
    updateQueuedPrompt,
    removeQueuedPrompt,
    setStreaming,
    clearMessages,
    truncateFrom,
    editMessage,
    setFeedback,
    setLineage,
  } = useChatStore();

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);
  /** Guards Retry against same-tick double activation. See `retryLastResponse`. */
  const retryInFlightRef = useRef(false);

  /** Core streaming logic — sends messages to the API and streams the response. */
  const streamResponse = useCallback(
    async (apiMessages: Array<{ role: string; content: string }>): Promise<StreamOutcome> => {
      const assistantId = addMessage("assistant", "", "sending");
      const controller = new AbortController();
      setStreaming(true);
      abortRef.current = controller;
      let receivedDone = false;
      let terminalFailure = false;

      // Declared outside the try so the catch and finally paths can flush or discard it.
      // Coalesces tokens: each append re-renders the transcript AND serialises the whole
      // conversation to localStorage, so applying every chunk individually put hundreds
      // of re-parses and serialisations on the main thread per answer.
      const tokens = new TokenBuffer((chunk) => appendToMessage(assistantId, chunk));

      const runStartedAt = Date.now();
      let firstTokenAt: number | null = null;
      // Distinguishes a watchdog abort from a user pressing Stop. Both surface as
      // AbortError, but only one of them is the user's decision.
      let timedOut = false;
      // The idle watchdog is a backstop, not a detector. Losing the connection mid-stream
      // left the message showing a live "Streaming" indicator for the full 45s window with
      // no error and no Retry — a progress state that was actively lying. The browser
      // already knows the connection dropped, so use that and fail in ~0s instead.
      let wentOffline = false;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      const onOffline = () => {
        wentOffline = true;
        controller.abort();
      };
      if (typeof window !== "undefined") window.addEventListener("offline", onOffline);

      const resetIdleWatchdog = () => {
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, STREAM_IDLE_TIMEOUT_MS);
      };

      telemetry.event("run.started");
      telemetry.measure("queue_depth", useChatStore.getState().queuedPrompts.length);

      try {
        // Armed before the request: a connection that never responds at all must also
        // be abandoned, not just one that stalls mid-stream.
        resetIdleWatchdog();

        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // conversationId + tabId let the server hold a per-conversation generation
          // lease. Both are optional server-side: a brand-new conversation has no id
          // yet, and there is no collision to prevent until it has been saved once.
          body: JSON.stringify({
            messages: apiMessages,
            conversationId: useChatStore.getState().conversationId ?? undefined,
            tabId: TAB_ID,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          // The response body is intentionally not read: it is server-generated text
          // that can carry stack traces or HTML error pages, and it never tells the
          // user what to do next.
          updateMessage(assistantId, describeRequestFailure(response.status, response.headers));
          transitionMessageStatus(assistantId, "failed");
          terminalFailure = true;
          return "failed";
        }

        transitionMessageStatus(assistantId, "generating");

        const reader = response.body?.getReader();
        if (!reader) {
          appendToMessage(assistantId, "Sorry, streaming is not supported.");
          transitionMessageStatus(assistantId, "failed");
          terminalFailure = true;
          return "failed";
        }

        const decoder = new TextDecoder();
        let buffer = "";

        const handleEvent = (event: {
          type: string;
          content?: string;
          data?: MessageLineage;
          id?: string;
          name?: string;
          args?: Record<string, unknown>;
          result?: string;
          durationMs?: number;
          message?: string;
        }) => {
          switch (event.type) {
            case "text":
              if (event.content) {
                if (firstTokenAt === null) {
                  firstTokenAt = Date.now();
                  // Time to first token is what a user experiences as "fast";
                  // total duration is not.
                  telemetry.measure("ttft_ms", firstTokenAt - runStartedAt);
                }
                transitionMessageStatus(assistantId, "streaming");
                tokens.push(event.content);
              }
              break;
            case "tool_start":
              useChatStore.getState().addToolCall(assistantId, {
                id: event.id ?? crypto.randomUUID(),
                name: event.name ?? "unknown",
                args: event.args ?? {},
                status: "running",
              });
              break;
            case "tool_end":
              if (event.id) {
                useChatStore.getState().updateToolCall(assistantId, event.id, {
                  result: event.result,
                  durationMs: event.durationMs,
                  status: "completed",
                });
              }
              break;
            case "lineage":
              if (event.data) setLineage(assistantId, event.data);
              break;
            case "warning":
              // An early, mid-stream caution (e.g. a fabricated WCAG criterion). Shown
              // next to the text immediately; the authoritative post-stream guardrail
              // banner in the lineage supersedes it once `done` arrives.
              if (event.message) {
                useChatStore.getState().setStreamingWarning(assistantId, event.message);
              }
              break;
            case "error":
              // Flush first: a completed/failed message is content-frozen, so buffered
              // tokens applied after the transition would be silently discarded.
              tokens.flush();
              appendToMessage(assistantId, `\n\n*Error: ${event.message ?? "Stream error"}*`);
              transitionMessageStatus(assistantId, "failed");
              terminalFailure = true;
              break;
            case "done":
              tokens.flush();
              transitionMessageStatus(assistantId, "completed");
              receivedDone = true;
              break;
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Progress resets the deadline; the watchdog only fires on genuine silence.
          resetIdleWatchdog();
          buffer += decoder.decode(value, { stream: true });

          // Parse line-delimited JSON events
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);
            try {
              handleEvent(JSON.parse(jsonStr) as {
                type: string;
                content?: string;
                data?: MessageLineage;
                id?: string;
                name?: string;
                args?: Record<string, unknown>;
                result?: string;
                durationMs?: number;
                message?: string;
              });
            } catch {
              // If JSON parse fails, treat as raw text (backward compat)
              transitionMessageStatus(assistantId, "streaming");
              tokens.push(jsonStr);
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              handleEvent(JSON.parse(trimmed.slice(6)));
            } catch {
              transitionMessageStatus(assistantId, "streaming");
              tokens.push(trimmed.slice(6));
            }
          }
        }

        // The stream ended. Anything still buffered is real output the user is owed,
        // including when the connection died mid-answer.
        tokens.flush();

        if (!receivedDone && !terminalFailure) {
          transitionMessageStatus(assistantId, "interrupted");
          return "interrupted";
        }
        return terminalFailure ? "failed" : "completed";
      } catch (error) {
        // Partial output is preserved on both paths: a cancelled or failed answer is
        // still worth reading, and recovery relies on it being present.
        tokens.flush();

        if (isAbortError(error)) {
          // Checked before the watchdog: losing the network also stalls the stream, and
          // "you went offline" is a cause the user can act on, where "connection stalled"
          // is not. Both are `interrupted` so Retry stays available.
          if (wentOffline) {
            appendToMessage(assistantId, "\n\n*(You went offline — this answer stopped partway. Reconnect and retry.)*");
            transitionMessageStatus(assistantId, "interrupted");
            return "interrupted";
          }
          // A watchdog abort is NOT a user decision, so it must not be reported as one.
          // `interrupted` is also recoverable, which offers Retry rather than leaving
          // the user with a response they never chose to stop.
          if (timedOut) {
            appendToMessage(assistantId, "\n\n*(Connection stalled — no response received.)*");
            transitionMessageStatus(assistantId, "interrupted");
            return "interrupted";
          }
          appendToMessage(assistantId, "\n\n*(Response cancelled)*");
          transitionMessageStatus(assistantId, "cancelled");
          return "cancelled";
        } else {
          appendToMessage(assistantId, "\n\nSorry, an error occurred. Please try again.");
          transitionMessageStatus(assistantId, "failed");
          return "failed";
        }
      } finally {
        // Must always clear: a surviving timer would abort a LATER run through the
        // captured controller and leak the closure for the whole idle window.
        if (idleTimer !== null) clearTimeout(idleTimer);
        if (typeof window !== "undefined") window.removeEventListener("offline", onOffline);
        tokens.discard();
        if (abortRef.current === controller) {
          setStreaming(false);
          abortRef.current = null;
        }
      }
    },
    [addMessage, appendToMessage, setStreaming, transitionMessageStatus, updateMessage, setLineage],
  );

  /**
   * Run turns sequentially until the queue drains or a turn does not succeed.
   *
   * `initialContent` is null when resuming an existing prompt (retry), because the
   * user message is already in the transcript and must not be duplicated.
   */
  const runTurns = useCallback(
    async (initialContent: string | null) => {
      const token = crypto.randomUUID();
      // Exactly one drain loop may exist. Losing this race is not an error — the
      // existing owner will pick up whatever this call would have run.
      if (!useChatStore.getState().tryAcquireRunner(token)) return;

      try {
        let content = initialContent;
        let isFirstTurn = true;

        while (true) {
          // Only the initiating prompt is appended here. Queued prompts are appended
          // by `handoffToNext` in the same atomic update that dequeues them.
          if (isFirstTurn && content) addMessage("user", content);
          isFirstTurn = false;

          const apiMessages = useChatStore
            .getState()
            .messages.map((message) => ({ role: message.role, content: message.content }));

          const startedAt = Date.now();
          const outcome = await streamResponse(apiMessages);

          // These four outcomes must sum to `run.started`. A gap between them is itself
          // the signal that something is escaping the state machine.
          telemetry.event(`run.${outcome}`);
          telemetry.measure("run_duration_ms", Date.now() - startedAt);

          // Any non-success outcome pauses the queue. Pending prompts were written for
          // a conversation that did not happen, so continuing automatically would
          // answer follow-ups against missing context.
          if (outcome !== "completed") {
            const reason = pauseReasonForOutcome(outcome);
            // Only a queue with work left needs a decision from the user.
            if (reason && useChatStore.getState().queuedPrompts.length > 0) {
              useChatStore.getState().pauseQueue(reason);
              telemetry.event("queue.paused", reason);
            }
            return;
          }

          // ── Completion sequence ────────────────────────────────────────────
          // Ordered and awaited. The next prompt must not start until the answer
          // that precedes it is durable, otherwise a crash mid-drain loses answers
          // the user has already read.
          const report = await runCompletionSequence([
            {
              name: "persist",
              policy: "pause",
              maxAttempts: 3,
              run: async () => {
                const state = useChatStore.getState();
                const result = await persistConversation({
                  conversationId: state.conversationId,
                  messages: state.messages,
                  version: state.conversationVersion,
                });
                if (!result.ok) {
                  // A stale write is NOT retryable: retrying would re-apply this older
                  // message set over whatever another tab just saved. Surface it so the
                  // queue pauses and the user can reload.
                  throw new Error(result.stale ? "conversation changed elsewhere" : "persist failed");
                }
                if (result.conversationId && result.conversationId !== state.conversationId) {
                  state.setConversationId(result.conversationId);
                }
                if (result.version !== null && result.version !== state.conversationVersion) {
                  state.setConversationVersion(result.version);
                }
              },
            },
            {
              name: "analytics",
              policy: "continue",
              maxAttempts: 1,
              run: async () => {
                // Local only, and deliberately non-blocking: a metrics gap must never
                // stall a user's queue.
                useChatStore.getState().recordRunDuration(Date.now() - startedAt);
              },
            },
          ]);

          if (!report.ok) {
            useChatStore.getState().pauseQueue("persistence");
            telemetry.event("persist.failed");
            telemetry.event("queue.paused", "persistence");
            return;
          }

          // This save proves persistence recovered, so a leftover "could not be saved"
          // banner is now claiming something untrue about a turn that demonstrably was
          // saved. Only a persistence pause is cleared, and only with nothing queued:
          // an interrupted or user-requested pause is not resolved by this, and
          // clearing while prompts are waiting would spend the user's tokens on a
          // queue they never chose to resume.
          const paused = useChatStore.getState();
          if (paused.queuePauseReason === "persistence" && paused.queuedPrompts.length === 0) {
            paused.clearQueuePause();
          }

          // A pause requested mid-run takes effect at the TURN BOUNDARY: the answer
          // already in flight is allowed to finish, but nothing new starts. Killing a
          // half-written answer would destroy work the user is actively reading.
          if (useChatStore.getState().queuePauseReason) return;

          // Release, dequeue, and transcript append all happen atomically here.
          const next = useChatStore.getState().handoffToNext(token);
          if (!next) return;
          content = null;
        }
      } finally {
        useChatStore.getState().releaseRunner(token);
      }
    },
    [addMessage, streamResponse],
  );

  /** True while a drain loop owns the queue, so new prompts must be queued. */
  const isQueueBusy = () => {
    const state = useChatStore.getState();
    return state.runnerToken !== null || state.isStreaming;
  };

  /** Send a new user message, or queue it when a run is already in flight. */
  const sendMessage = useCallback(
    async (content: string): Promise<SendResult> => {
      const normalized = content.trim();
      if (!normalized) return { ok: false, reason: "empty" };

      if (isQueueBusy()) {
        const result = useChatStore.getState().enqueuePrompt(normalized);
        telemetry.event(result.ok ? "queue.enqueued" : "queue.rejected", result.ok ? undefined : result.reason);
        return result;
      }

      await runTurns(normalized);
      return null;
    },
    [runTurns],
  );

  /**
   * Retry the turn that failed, was interrupted, or was cancelled.
   * Reuses the original user prompt rather than asking the user to retype it.
   */
  const retryLastResponse = useCallback(async () => {
    // Synchronous, unlike the store read below: `isQueueBusy` cannot see a lease that
    // `runTurns` has not taken yet, so same-tick double activation (a double-click, or a
    // held Enter) slips past it. Cheap idempotency guard rather than a fix for a
    // reproduced defect — an adversarial run left Retry in a dead end, but the cause was
    // never isolated to this path and a regression test could not reproduce it here.
    if (retryInFlightRef.current) return;
    if (isQueueBusy()) return;
    const state = useChatStore.getState();

    const last = state.messages.at(-1);
    if (!last || last.role !== "assistant" || !isRecoverableStatus(last.status)) return;

    retryInFlightRef.current = true;
    try {
      // Drop the unusable response so the retry does not append to broken output.
      truncateFrom(last.id);
      state.clearQueuePause();
      telemetry.event("run.retried");
      await runTurns(null);
    } finally {
      retryInFlightRef.current = false;
    }
  }, [runTurns, truncateFrom]);

  /** Skip the turn that paused the queue and continue with the next pending prompt. */
  const resumeQueue = useCallback(async () => {
    if (isQueueBusy()) return;
    const state = useChatStore.getState();
    if (state.queuedPrompts.length === 0) return;

    state.clearQueuePause();
    telemetry.event("queue.resumed");
    const next = state.takeNextQueuedPrompt();
    if (next) await runTurns(next.content);
  }, [runTurns]);

  /**
   * Hold the queue at the next turn boundary.
   *
   * Deliberately does NOT stop the answer in flight — pausing a queue and destroying a
   * half-written answer are different intents, and Stop already exists for the latter.
   */
  const pauseQueue = useCallback(() => {
    useChatStore.getState().pauseQueue("user");
    telemetry.event("queue.paused", "user");
  }, []);

  /** Discard every pending prompt. */
  const clearQueue = useCallback(() => {
    useChatStore.getState().clearQueue();
    telemetry.event("queue.cleared");
  }, []);

  /** Regenerate the last assistant response. */
  const regenerate = useCallback(async () => {
    // Read live state: the value captured at render time can be stale by the time
    // the user clicks, which would allow a second overlapping request.
    if (isQueueBusy()) return;

    const msgs = useChatStore.getState().messages;
    const last = msgs.at(-1);
    if (!last || last.role !== "assistant") return;
    truncateFrom(last.id);

    // runTurns re-sends the remaining transcript and then drains any queued prompts,
    // so a regenerate behaves like any other turn instead of stalling the queue.
    await runTurns(null);
  }, [truncateFrom, runTurns]);

  /** Edit a user message and re-run from that point. */
  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      if (isQueueBusy()) return;
      editMessage(messageId, newContent);

      await runTurns(null);
    },
    [editMessage, runTurns],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    queuedPrompts,
    isStreaming,
    /** "idle" | "running" | "paused" — the single value the UI should branch on. */
    queueStatus: queueStatusOf(runnerToken !== null, queuePauseReason),
    queuePauseReason,
    /** Rolling average run duration, or null before any run has been measured. */
    avgRunMs,
    sendMessage,
    regenerate,
    retryLastResponse,
    resumeQueue,
    pauseQueue,
    clearQueue,
    editAndResend,
    stopStreaming,
    updateQueuedPrompt,
    removeQueuedPrompt,
    clearMessages,
    setFeedback,
  };
}
