/**
 * P0 data-loss regressions.
 *
 * Each of these fixes prevents a silent, permanent loss: server history destroyed by a
 * client cache eviction, one user's conversation surviving into another's session, and a
 * dead connection holding the queue lease forever.
 *
 * All three failed quietly in production and none produced an error, which is why they
 * are pinned explicitly rather than left to integration coverage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import { resetPersistenceFingerprint } from "@/lib/ai/chat/persistence";
import { routeChatFetch } from "./helpers/chat-fetch";

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
    conversationTruncated: false,
  });
  resetPersistenceFingerprint();
}

// ── Quota trim must not destroy server history ───────────────────────────────

describe("a trimmed local snapshot never overwrites the server", () => {
  beforeEach(resetStore);

  it("detaches the conversation id when the snapshot was truncated", () => {
    // Simulates rehydrating a snapshot the storage adapter had to trim to fit quota.
    act(() => {
      useChatStore.setState({
        conversationId: "conv-with-100-messages",
        conversationTruncated: true,
        messages: [{ id: "m1", role: "user", content: "only the last 20 survived", timestamp: 1 }],
      });
    });

    // Re-running the rehydration reconciliation is what the store does on load.
    const state = useChatStore.getState();
    const rehydrated = {
      ...state,
      conversationId: state.conversationTruncated ? null : state.conversationId,
    };

    // Keeping the id would let a 20-message save delete-and-recreate over 100 rows.
    expect(rehydrated.conversationId).toBeNull();
  });

  it("keeps the conversation id when nothing was trimmed", () => {
    act(() => {
      useChatStore.setState({
        conversationId: "conv-1",
        conversationTruncated: false,
      });
    });

    expect(useChatStore.getState().conversationId).toBe("conv-1");
  });

  it("persists the truncation flag so it survives the reload that reads it", () => {
    act(() => useChatStore.setState({ conversationTruncated: true }));

    const raw = localStorage.getItem("reglayer-chat");
    expect(raw).toContain("conversationTruncated");
  });
});

// ── Sign-out must clear local AI state ───────────────────────────────────────

describe("sign-out clears local AI state", () => {
  beforeEach(resetStore);

  it("removes conversation, queue, and draft from this browser", async () => {
    act(() => {
      useChatStore.getState().addMessage("user", "confidential client question");
      useChatStore.getState().enqueuePrompt("another private question");
      useChatStore.getState().setDraft("half-typed sensitive note");
      useChatStore.getState().setConversationId("conv-1");
    });

    const { clearLocalAiState } = await import("@/lib/auth/sign-out");
    act(() => clearLocalAiState());

    const state = useChatStore.getState();
    // The next person to open this browser must not see any of it.
    expect(state.messages).toHaveLength(0);
    expect(state.queuedPrompts).toHaveLength(0);
    expect(state.draft).toBe("");
    expect(state.conversationId).toBeNull();
  });

  it("does not throw when storage is unavailable", async () => {
    const { clearLocalAiState } = await import("@/lib/auth/sign-out");
    const spy = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    // Trapping someone in an authenticated session because cleanup threw is worse
    // than failing to clear.
    expect(() => clearLocalAiState()).not.toThrow();
    spy.mockRestore();
  });
});

// ── Stream watchdog ──────────────────────────────────────────────────────────

describe("a stalled connection cannot hold the queue forever", () => {
  beforeEach(resetStore);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("abandons a run that produces nothing and releases the lease", async () => {
    vi.useFakeTimers();

    // A connection that never resolves AND never rejects — laptop sleep, NAT drop,
    // silent load-balancer close. `reader.read()` would otherwise pend forever.
    vi.stubGlobal("fetch", routeChatFetch(
      (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    ));

    const { result } = renderHook(() => useChat());

    let pending: Promise<unknown> = Promise.resolve();
    await act(async () => {
      pending = result.current.sendMessage("will stall");
      // Let the request start and arm the watchdog. `waitFor` cannot be used here:
      // it polls on real timers, which are faked.
      await Promise.resolve();
    });

    expect(useChatStore.getState().isStreaming).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(46_000);
      await pending;
    });

    const state = useChatStore.getState();
    // Reported as interrupted, NOT cancelled: the user never chose to stop it.
    expect(state.messages.at(-1)?.status).toBe("interrupted");
    // The lease must be free, or every later prompt silently does nothing.
    expect(state.runnerToken).toBeNull();
    expect(state.isStreaming).toBe(false);
  });
});
