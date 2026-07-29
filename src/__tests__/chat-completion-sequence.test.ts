/**
 * Deterministic completion sequence.
 *
 * The guarantee under test is ORDERING: when a run completes, every step must finish
 * before the next begins, and the next queued prompt must not start until the answer
 * preceding it is durable.
 *
 * This previously did not hold. Persistence was a 3-second debounce that each new run
 * reset, so during a drain it never fired at all — a crash mid-drain lost every
 * completed answer while the queue happily carried on.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import {
  backoffMs,
  runCompletionSequence,
  type CompletionStep,
} from "@/lib/ai/chat/completion-pipeline";
import {
  conversationFingerprint,
  persistConversation,
  resetPersistenceFingerprint,
} from "@/lib/ai/chat/persistence";

const noSleep = { sleep: async () => {} };

function step(
  name: string,
  overrides: Partial<CompletionStep> = {},
): CompletionStep {
  return {
    name,
    policy: "continue",
    maxAttempts: 1,
    run: async () => {},
    ...overrides,
  };
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

// ── Ordering ─────────────────────────────────────────────────────────────────

describe("completion sequence ordering", () => {
  it("never starts a step before the previous one has settled", async () => {
    const events: string[] = [];
    const slow = (name: string, ms: number) =>
      step(name, {
        run: async () => {
          events.push(`${name}:start`);
          await new Promise((r) => setTimeout(r, ms));
          events.push(`${name}:end`);
        },
      });

    // The first step is deliberately the slowest: with concurrent execution its "end"
    // would land last instead of second.
    await runCompletionSequence([slow("persist", 20), slow("analytics", 1)], noSleep);

    expect(events).toEqual([
      "persist:start",
      "persist:end",
      "analytics:start",
      "analytics:end",
    ]);
  });

  it("stops immediately when a critical step fails, running no later steps", async () => {
    const ran: string[] = [];
    const report = await runCompletionSequence(
      [
        step("persist", { policy: "pause", run: async () => { throw new Error("down"); } }),
        step("analytics", { run: async () => { ran.push("analytics"); } }),
      ],
      noSleep,
    );

    expect(report.ok).toBe(false);
    expect(report.failedStep).toBe("persist");
    // Nothing may act on a completion that was not durably recorded.
    expect(ran).toEqual([]);
  });

  it("continues past a non-critical failure", async () => {
    const ran: string[] = [];
    const report = await runCompletionSequence(
      [
        step("analytics", { run: async () => { throw new Error("metrics down"); } }),
        step("usage", { run: async () => { ran.push("usage"); } }),
      ],
      noSleep,
    );

    // A metrics gap must never stall a user's queue.
    expect(report.ok).toBe(true);
    expect(ran).toEqual(["usage"]);
    expect(report.steps[0]).toMatchObject({ name: "analytics", outcome: "failed" });
  });

  it("retries a failing step up to its limit and then gives up", async () => {
    let attempts = 0;
    const report = await runCompletionSequence(
      [step("persist", {
        policy: "pause",
        maxAttempts: 3,
        run: async () => { attempts += 1; throw new Error("flaky"); },
      })],
      noSleep,
    );

    expect(attempts).toBe(3);
    expect(report.ok).toBe(false);
  });

  it("succeeds without further attempts once a retry works", async () => {
    let attempts = 0;
    const report = await runCompletionSequence(
      [step("persist", {
        policy: "pause",
        maxAttempts: 3,
        run: async () => {
          attempts += 1;
          if (attempts < 2) throw new Error("transient");
        },
      })],
      noSleep,
    );

    expect(attempts).toBe(2);
    expect(report.ok).toBe(true);
  });

  it("backs off increasingly but stays bounded", async () => {
    // A user is waiting on the queue, so backoff must not grow without limit.
    expect(backoffMs(1)).toBeLessThan(backoffMs(3));
    expect(backoffMs(50)).toBeLessThanOrEqual(2000);
  });
});

// ── Persistence primitive ────────────────────────────────────────────────────

describe("conversation persistence", () => {
  beforeEach(resetStore);

  it("treats an unchanged conversation as already durable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "conv-1" }), { status: 200 }),
    );
    const messages = [{ id: "m1", role: "user" as const, content: "hello" }];

    const first = await persistConversation({ conversationId: null, messages, fetchImpl });
    const second = await persistConversation({ conversationId: "conv-1", messages, fetchImpl });

    expect(first).toMatchObject({ ok: true, skipped: false });
    // A duplicate write to a delete-and-recreate endpoint is pure risk.
    expect(second).toMatchObject({ ok: true, skipped: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not mark state durable when the write failed", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "conv-1" }), { status: 200 }));
    const messages = [{ id: "m1", role: "user" as const, content: "hello" }];

    const failed = await persistConversation({ conversationId: null, messages, fetchImpl });
    const retried = await persistConversation({ conversationId: null, messages, fetchImpl });

    expect(failed).toEqual({ ok: false, retryable: true });
    // The retry must actually send, not be skipped as "unchanged".
    expect(retried).toMatchObject({ ok: true, skipped: false });
  });

  it("marks transport failures retryable and auth failures not", async () => {
    const messages = [{ id: "m1", role: "user" as const, content: "hi" }];

    const network = await persistConversation({
      conversationId: null,
      messages,
      fetchImpl: vi.fn().mockRejectedValue(new TypeError("offline")),
    });
    expect(network).toEqual({ ok: false, retryable: true });

    resetPersistenceFingerprint();
    const auth = await persistConversation({
      conversationId: null,
      messages,
      fetchImpl: vi.fn().mockResolvedValue(new Response("nope", { status: 401 })),
    });
    // Retrying an auth failure cannot succeed and only delays the user.
    expect(auth).toEqual({ ok: false, retryable: false });
  });

  it("changes fingerprint when content changes so growth is not missed", () => {
    const before = conversationFingerprint([{ id: "m1", role: "assistant", content: "ab" }]);
    const after = conversationFingerprint([{ id: "m1", role: "assistant", content: "abc" }]);
    expect(before).not.toBe(after);
  });
});

// ── Integration with the queue runner ────────────────────────────────────────

/** SSE body for a completed run. */
function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

describe("queue handoff is gated on durability", () => {
  beforeEach(resetStore);
  afterEach(() => vi.unstubAllGlobals());

  it("persists the completed answer before the next prompt starts", async () => {
    const order: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/ai/conversations")) {
        order.push("persist");
        return new Response(JSON.stringify({ id: "conv-1" }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { messages: { content: string }[] };
      order.push(`run:${body.messages.at(-1)?.content}`);
      return completedStream("answer");
    }));

    const { result } = renderHook(() => useChat());
    useChatStore.getState().enqueuePrompt("Q2");

    await act(async () => { await result.current.sendMessage("Q1"); });

    await waitFor(() => expect(useChatStore.getState().queuedPrompts).toHaveLength(0));
    // The durability write must sit BETWEEN the two runs, not after both.
    expect(order).toEqual(["run:Q1", "persist", "run:Q2", "persist"]);
  });

  it("pauses the queue instead of continuing when the answer cannot be saved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/api/ai/conversations")) {
        return new Response("storage down", { status: 500 });
      }
      return completedStream("answer");
    }));

    const { result } = renderHook(() => useChat());
    useChatStore.getState().enqueuePrompt("Q2");

    await act(async () => { await result.current.sendMessage("Q1"); });

    await waitFor(() => {
      expect(useChatStore.getState().queuePauseReason).toBe("persistence");
      // Generating more unsavable answers would widen the loss window.
      expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["Q2"]);
    });
    expect(useChatStore.getState().runnerToken).toBeNull();
  });
});

// ── Atomic handoff ───────────────────────────────────────────────────────────

describe("atomic handoff", () => {
  beforeEach(resetStore);

  it("dequeues and retains ownership in a single observable step", () => {
    const store = useChatStore.getState();
    store.tryAcquireRunner("worker-a");
    store.enqueuePrompt("next one");

    const next = store.handoffToNext("worker-a");

    expect(next?.content).toBe("next one");
    // No window exists in which the queue is unowned but still has work.
    expect(useChatStore.getState().runnerToken).toBe("worker-a");
    expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
  });

  it("releases the lock when nothing is left", () => {
    const store = useChatStore.getState();
    store.tryAcquireRunner("worker-a");

    expect(store.handoffToNext("worker-a")).toBeNull();
    expect(useChatStore.getState().runnerToken).toBeNull();
  });

  it("refuses to dequeue for a worker that does not own the queue", () => {
    const store = useChatStore.getState();
    store.tryAcquireRunner("worker-a");
    store.enqueuePrompt("guarded");

    // A non-owner reaching here means a second worker exists.
    expect(store.handoffToNext("worker-b")).toBeNull();
    expect(useChatStore.getState().queuedPrompts).toHaveLength(1);
    expect(useChatStore.getState().runnerToken).toBe("worker-a");
  });
});
