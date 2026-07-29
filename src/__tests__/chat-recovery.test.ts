/**
 * Session recovery.
 *
 * A run's worker lives in the page. Refresh, crash, sleep, close, or navigation kills
 * it — but the message it was writing is already persisted in a live-looking status.
 *
 * Before reconciliation existed this was a permanent dead end: the message rendered a
 * spinner forever, no recovery bar appeared because `streaming` is not a recoverable
 * status, and `retryLastResponse` refused for the same reason. These tests pin the
 * escape route and the rules that stop recovery from causing new harm.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import {
  reconcileInterruptedRuns,
  shouldPauseAfterRecovery,
  type RecoverableMessage,
} from "@/lib/ai/chat/recovery";
import { resetPersistenceFingerprint } from "@/lib/ai/chat/persistence";
import { routeChatFetch } from "./helpers/chat-fetch";

function msg(
  role: "user" | "assistant",
  content: string,
  status?: RecoverableMessage["status"],
): RecoverableMessage {
  return { role, content, ...(status ? { status } : {}) };
}

function resetStore() {
  useChatStore.setState({
    messages: [],
    queuedPrompts: [],
    isStreaming: false,
    conversationId: null,
    isSaving: false,
    runnerToken: null,
    queuePauseReason: null,
    avgRunMs: null,
  });
  resetPersistenceFingerprint();
}

// ── Reconciliation rules ─────────────────────────────────────────────────────

describe("interrupted run reconciliation", () => {
  it.each(["sending", "generating", "streaming", "retrying"] as const)(
    "recovers a run orphaned in %s",
    (status) => {
      const { messages, recoveredCount } = reconcileInterruptedRuns([
        msg("user", "question"),
        msg("assistant", "partial", status),
      ]);

      // Without this the UI spins forever and Retry refuses to act.
      expect(messages[1].status).toBe("interrupted");
      expect(recoveredCount).toBe(1);
    },
  );

  it("preserves partial output rather than discarding it", () => {
    const { messages, preservedPartial } = reconcileInterruptedRuns([
      msg("assistant", "Half an answer that is still useful", "streaming"),
    ]);

    expect(messages[0].content).toBe("Half an answer that is still useful");
    expect(preservedPartial).toBe(true);
  });

  it("leaves completed answers untouched so they can never re-run", () => {
    const original = [
      msg("user", "q"),
      msg("assistant", "done", "completed"),
    ];
    const { messages, recoveredCount } = reconcileInterruptedRuns(original);

    expect(messages[1].status).toBe("completed");
    expect(recoveredCount).toBe(0);
  });

  it.each(["failed", "cancelled", "interrupted"] as const)(
    "leaves already-settled status %s alone",
    (status) => {
      const { recoveredCount } = reconcileInterruptedRuns([msg("assistant", "x", status)]);
      expect(recoveredCount).toBe(0);
    },
  );

  it("never rewrites user messages", () => {
    const { messages } = reconcileInterruptedRuns([msg("user", "my question")]);
    expect(messages[0]).toEqual({ role: "user", content: "my question" });
  });

  it("holds the queue only when a recovery left work pending", () => {
    // Auto-resuming on load would start billable generation nobody asked for.
    expect(shouldPauseAfterRecovery(1, 2)).toBe(true);
    // Nothing pending means there is no decision to interrupt the user for.
    expect(shouldPauseAfterRecovery(1, 0)).toBe(false);
    // A clean session must not be paused for no reason.
    expect(shouldPauseAfterRecovery(0, 3)).toBe(false);
  });
});

// ── Recovery restores a usable path forward ──────────────────────────────────

describe("recovered sessions are actionable", () => {
  beforeEach(resetStore);
  afterEach(() => vi.unstubAllGlobals());

  it("makes Retry available after an interrupted run, which it refused before", async () => {
    vi.stubGlobal("fetch", routeChatFetch(() =>
      new Response(
        `data: ${JSON.stringify({ type: "text", content: "Full answer" })}\n` +
        `data: ${JSON.stringify({ type: "done" })}\n`,
        { status: 200 },
      ),
    ));
    const { result } = renderHook(() => useChat());

    // Exactly the state a refresh mid-stream leaves behind, post-reconciliation.
    act(() => {
      useChatStore.setState({
        messages: [
          { id: "u1", role: "user", content: "question", timestamp: 1 },
          { id: "a1", role: "assistant", content: "half", timestamp: 2, status: "interrupted" },
        ],
      });
    });

    await act(async () => { await result.current.retryLastResponse(); });

    await waitFor(() => {
      const messages = useChatStore.getState().messages;
      expect(messages.at(-1)?.content).toBe("Full answer");
      expect(messages.at(-1)?.status).toBe("completed");
    });
    // The original prompt is reused, not duplicated.
    expect(useChatStore.getState().messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("does not resume a paused queue without an explicit decision", async () => {
    const fetchMock = routeChatFetch(() => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    act(() => {
      useChatStore.setState({
        messages: [
          { id: "u1", role: "user", content: "q", timestamp: 1 },
          { id: "a1", role: "assistant", content: "half", timestamp: 2, status: "interrupted" },
        ],
        queuePauseReason: "interrupted",
      });
      useChatStore.getState().enqueuePrompt("pending work");
    });

    renderHook(() => useChat());
    // Merely mounting a recovered session must not start generation.
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useChatStore.getState().queuedPrompts).toHaveLength(1);
  });
});

// ── Crash-safety of the dequeue transition ───────────────────────────────────

describe("dequeue is crash-safe", () => {
  beforeEach(resetStore);

  it("moves a prompt out of the queue and into the transcript atomically", () => {
    const store = useChatStore.getState();
    store.tryAcquireRunner("worker-a");
    store.enqueuePrompt("queued question");

    store.handoffToNext("worker-a");

    const state = useChatStore.getState();
    // As two separate writes, a crash between them lost the prompt from BOTH places.
    expect(state.queuedPrompts).toHaveLength(0);
    expect(state.messages.at(-1)).toMatchObject({
      role: "user",
      content: "queued question",
    });
  });

  it("leaves the prompt queued when a non-owner attempts the handoff", () => {
    const store = useChatStore.getState();
    store.tryAcquireRunner("worker-a");
    store.enqueuePrompt("queued question");

    store.handoffToNext("worker-b");

    // Neither dequeued nor appended — a second worker must change nothing.
    expect(useChatStore.getState().queuedPrompts).toHaveLength(1);
    expect(useChatStore.getState().messages).toHaveLength(0);
  });
});
