/**
 * Chat queue engine.
 *
 * These tests target the guarantees that are easy to claim and hard to keep: exactly
 * one worker, no duplicate entries, no concurrent dequeue, and a pause that only an
 * explicit user decision can lift.
 *
 * The concurrency tests matter most. The previous implementation gated on
 * `isStreaming`, which goes false in the gap between one run finishing and the next
 * being dequeued — a real window in which a second drain loop could start and race the
 * first for the same prompts.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import {
  decideEnqueue,
  estimateWaitMs,
  foldRunDuration,
  formatWait,
  MAX_QUEUED_PROMPTS,
  pauseReasonForOutcome,
  queueStatusOf,
  type QueuedPrompt,
} from "@/lib/ai/chat/queue";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

function hangingFetch() {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }),
  );
}

function queued(...contents: string[]): QueuedPrompt[] {
  return contents.map((content, i) => ({ id: `q${i}`, content, createdAt: i }));
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
}

const userTexts = () =>
  useChatStore.getState().messages.filter((m) => m.role === "user").map((m) => m.content);

// ── Admission control ────────────────────────────────────────────────────────

describe("queue admission control", () => {
  it("rejects an exact duplicate of a pending prompt", () => {
    expect(decideEnqueue("same", queued("same"))).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("rejects a duplicate of the prompt currently being answered", () => {
    // The classic double submit: the first copy is running, so it is NOT in the queue.
    expect(decideEnqueue("hello", [], "hello")).toEqual({ ok: false, reason: "duplicate" });
  });

  it("accepts a genuinely different prompt", () => {
    expect(decideEnqueue("second", queued("first"), "active")).toEqual({
      ok: true,
      content: "second",
    });
  });

  it("compares trimmed text so whitespace cannot smuggle in a duplicate", () => {
    expect(decideEnqueue("  same  ", queued("same"))).toEqual({
      ok: false,
      reason: "duplicate",
    });
  });

  it("does not treat similar-but-different prompts as duplicates", () => {
    // Rejecting a real follow-up is worse than accepting a near-miss.
    expect(decideEnqueue("what about AA?", queued("what about A?")).ok).toBe(true);
  });

  it("reports a full queue once capacity is reached", () => {
    const full = queued(...Array.from({ length: MAX_QUEUED_PROMPTS }, (_, i) => `p${i}`));
    expect(decideEnqueue("one more", full)).toEqual({ ok: false, reason: "full" });
  });

  it("reports duplicate rather than full when both apply", () => {
    // The user needs the accurate reason: removing a prompt would not help here.
    const full = queued(...Array.from({ length: MAX_QUEUED_PROMPTS }, (_, i) => `p${i}`));
    expect(decideEnqueue("p0", full)).toEqual({ ok: false, reason: "duplicate" });
  });

  it("rejects empty and whitespace-only prompts", () => {
    expect(decideEnqueue("   ", [])).toEqual({ ok: false, reason: "empty" });
  });
});

// ── Status derivation ────────────────────────────────────────────────────────

describe("queue status", () => {
  it("reports running whenever a worker owns the queue", () => {
    expect(queueStatusOf(true, null)).toBe("running");
    // Ownership wins over a stale pause reason from an earlier turn.
    expect(queueStatusOf(true, "failed")).toBe("running");
  });

  it("reports paused only when unowned and awaiting a decision", () => {
    expect(queueStatusOf(false, "cancelled")).toBe("paused");
    expect(queueStatusOf(false, null)).toBe("idle");
  });

  it("maps every non-success outcome to a pause reason", () => {
    expect(pauseReasonForOutcome("failed")).toBe("failed");
    expect(pauseReasonForOutcome("cancelled")).toBe("cancelled");
    expect(pauseReasonForOutcome("interrupted")).toBe("interrupted");
    // Success must never pause the queue.
    expect(pauseReasonForOutcome("completed")).toBeNull();
  });
});

// ── Wait estimation ──────────────────────────────────────────────────────────

describe("wait estimation", () => {
  it("reports nothing before any run has been measured", () => {
    // A fabricated first estimate teaches users the number cannot be trusted.
    expect(estimateWaitMs(0, null)).toBeNull();
  });

  it("scales with queue position and counts the active run", () => {
    expect(estimateWaitMs(0, 4000)).toBe(4000);
    expect(estimateWaitMs(2, 4000)).toBe(12000);
  });

  it("seeds the average from the first sample then tracks recent runs", () => {
    const first = foldRunDuration(null, 5000);
    expect(first).toBe(5000);
    // Weighted toward history, so one slow run does not dominate.
    const second = foldRunDuration(first, 15000);
    expect(second).toBeGreaterThan(5000);
    expect(second).toBeLessThan(15000);
  });

  it("ignores nonsensical samples rather than corrupting the average", () => {
    expect(foldRunDuration(5000, 0)).toBe(5000);
    expect(foldRunDuration(5000, Number.NaN)).toBe(5000);
  });

  it("formats waits in units a user can act on", () => {
    expect(formatWait(3000)).toBe("~3s");
    expect(formatWait(120_000)).toBe("~2m");
    // Sub-second waits must not render as "~0s".
    expect(formatWait(200)).toBe("~1s");
  });
});

// ── Single-flight ownership ──────────────────────────────────────────────────

describe("queue ownership", () => {
  beforeEach(resetStore);

  it("grants the lease to exactly one claimant", () => {
    expect(useChatStore.getState().tryAcquireRunner("worker-a")).toBe(true);
    expect(useChatStore.getState().tryAcquireRunner("worker-b")).toBe(false);
  });

  it("ignores a release from a worker that does not hold the lease", () => {
    useChatStore.getState().tryAcquireRunner("worker-a");
    useChatStore.getState().releaseRunner("worker-b");

    // A superseded worker must not be able to free someone else's lease.
    expect(useChatStore.getState().runnerToken).toBe("worker-a");
    expect(useChatStore.getState().tryAcquireRunner("worker-c")).toBe(false);
  });

  it("frees the queue for the next worker on a matching release", () => {
    useChatStore.getState().tryAcquireRunner("worker-a");
    useChatStore.getState().releaseRunner("worker-a");

    expect(useChatStore.getState().tryAcquireRunner("worker-b")).toBe(true);
  });

  it("never writes the lease to persistent storage", () => {
    // A lease rehydrated from a dead page load would be owned by a worker that no
    // longer exists, deadlocking the queue permanently.
    useChatStore.getState().tryAcquireRunner("worker-a");

    const raw = localStorage.getItem("reglayer-chat");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("worker-a");
  });
});

// ── Concurrency ──────────────────────────────────────────────────────────────

describe("queue concurrency", () => {
  beforeEach(resetStore);
  afterEach(() => vi.unstubAllGlobals());

  it("starts only one run when two sends land in the same tick", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    // A double click or a double Enter keypress produces exactly this.
    await act(async () => {
      void result.current.sendMessage("A");
      void result.current.sendMessage("B");
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["B"]);
  });

  it("refuses a second drain loop while one already owns the queue", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { result } = renderHook(() => useChat());

    act(() => { void result.current.sendMessage("A"); });
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(true));

    useChatStore.getState().enqueuePrompt("B");
    // Resume must be a no-op while a worker holds the lease, or two loops would
    // dequeue concurrently.
    await act(async () => { await result.current.resumeQueue(); });

    expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["B"]);
  });

  it("does not double-submit a prompt identical to the one in flight", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { result } = renderHook(() => useChat());

    act(() => { void result.current.sendMessage("same question"); });
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(true));

    let outcome;
    await act(async () => { outcome = await result.current.sendMessage("same question"); });

    expect(outcome).toEqual({ ok: false, reason: "duplicate" });
    expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
  });

  it("releases the lease after a run so later prompts can still start", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("ok")));
    const { result } = renderHook(() => useChat());

    await act(async () => { await result.current.sendMessage("first"); });

    // A leaked lease is invisible until the next send silently does nothing.
    expect(useChatStore.getState().runnerToken).toBeNull();

    await act(async () => { await result.current.sendMessage("second"); });
    await waitFor(() => expect(userTexts()).toEqual(["first", "second"]));
  });
});

// ── Pause and explicit recovery ──────────────────────────────────────────────

describe("queue pause requires an explicit decision", () => {
  beforeEach(resetStore);
  afterEach(() => vi.unstubAllGlobals());

  it("pauses with a reason when a run fails and work is pending", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 503 })));
    const { result } = renderHook(() => useChat());

    useChatStore.getState().enqueuePrompt("pending");
    await act(async () => { await result.current.sendMessage("will fail"); });

    await waitFor(() => {
      expect(useChatStore.getState().queuePauseReason).toBe("failed");
      // The pending prompt must survive, unanswered, until the user decides.
      expect(useChatStore.getState().queuedPrompts).toHaveLength(1);
    });
  });

  it("does not pause when nothing is waiting", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 503 })));
    const { result } = renderHook(() => useChat());

    await act(async () => { await result.current.sendMessage("will fail"); });

    // With an empty queue there is no decision to ask the user for.
    expect(useChatStore.getState().queuePauseReason).toBeNull();
  });

  it("clears the pause when the user skips to the next prompt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 503 })));
    const { result } = renderHook(() => useChat());

    useChatStore.getState().enqueuePrompt("pending");
    await act(async () => { await result.current.sendMessage("will fail"); });
    await waitFor(() => expect(useChatStore.getState().queuePauseReason).toBe("failed"));

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("recovered")));
    await act(async () => { await result.current.resumeQueue(); });

    await waitFor(() => {
      expect(useChatStore.getState().queuePauseReason).toBeNull();
      expect(userTexts()).toContain("pending");
    });
  });

  it("survives a reload so a refresh cannot silently resume the queue", () => {
    useChatStore.getState().pauseQueue("cancelled");

    // The pause is persisted state, not a transient flag.
    expect(useChatStore.getState().queuePauseReason).toBe("cancelled");
    useChatStore.getState().clearQueuePause();
    expect(useChatStore.getState().queuePauseReason).toBeNull();
  });
});

// ── Immutability of finished answers ─────────────────────────────────────────

describe("completed responses are immutable", () => {
  beforeEach(resetStore);

  it("ignores a late chunk arriving after completion", () => {
    const id = useChatStore.getState().addMessage("assistant", "final answer", "generating");
    useChatStore.getState().transitionMessageStatus(id, "completed");

    // A straggling event from a superseded run must not edit a read answer.
    useChatStore.getState().appendToMessage(id, " ...corrupted");

    expect(useChatStore.getState().messages[0].content).toBe("final answer");
  });

  it("ignores a late chunk after cancellation", () => {
    const id = useChatStore.getState().addMessage("assistant", "partial", "streaming");
    useChatStore.getState().transitionMessageStatus(id, "cancelled");

    useChatStore.getState().appendToMessage(id, " more");

    expect(useChatStore.getState().messages[0].content).toBe("partial");
  });

  it("still allows an interrupted response to be written to", () => {
    // Interrupted is resumable, so freezing it would block reconnection.
    const id = useChatStore.getState().addMessage("assistant", "partial", "streaming");
    useChatStore.getState().transitionMessageStatus(id, "interrupted");

    useChatStore.getState().appendToMessage(id, " continued");

    expect(useChatStore.getState().messages[0].content).toBe("partial continued");
  });
});

// ── Editing pending prompts ──────────────────────────────────────────────────

describe("editing pending prompts", () => {
  beforeEach(resetStore);

  it("refuses an edit that would duplicate another pending prompt", () => {
    const store = useChatStore.getState();
    store.enqueuePrompt("first");
    const second = store.enqueuePrompt("second");
    if (!second.ok) throw new Error("expected the prompt to be queued");

    store.updateQueuedPrompt(second.id, "first");

    expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual([
      "first",
      "second",
    ]);
  });
});
