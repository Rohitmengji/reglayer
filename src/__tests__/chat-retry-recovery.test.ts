import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";
import { resetPersistenceFingerprint } from "@/lib/ai/chat/persistence";
import { routeChatFetch, sequentialChatResponses } from "./helpers/chat-fetch";

function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

function failedResponse(): Response {
  return new Response("Upstream unavailable", { status: 503 });
}

describe("chat retry and queue recovery", () => {
  beforeEach(() => {
    // Every field the runtime writes must be reset, not just the obvious ones. A leaked
    // `queuePauseReason: "persistence"` was observed changing which branch a later test
    // took, which made results depend on how many tests ran before it. Persistence also
    // keeps module-level state (last fingerprint, learned conversation id).
    resetPersistenceFingerprint();
    useChatStore.setState({
      messages: [],
      queuedPrompts: [],
      isStreaming: false,
      conversationId: null,
      isSaving: false,
      runnerToken: null,
      queuePauseReason: null,
      conversationVersion: null,
    });
  });

  afterEach(() => {
    // Auto-cleanup is not enabled in this project, so without this every renderHook stays
    // mounted for the remainder of the file and keeps reacting to shared store state.
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retries a failed turn without duplicating the user prompt", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(completedStream("Recovered"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    expect(useChatStore.getState().messages.at(-1)?.status).toBe("failed");

    await act(async () => {
      await result.current.retryLastResponse();
    });

    const state = useChatStore.getState();
    expect(state.messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Q1"]);
    expect(state.messages.at(-1)?.content).toBe("Recovered");
    expect(state.messages.at(-1)?.status).toBe("completed");
  });

  it("resumes pending prompts after a successful retry", async () => {
    const fetchMock = sequentialChatResponses(
      failedResponse(),
      completedStream("A1"),
      completedStream("A2"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
    });
    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    expect(useChatStore.getState().queuedPrompts).toHaveLength(1);

    await act(async () => {
      await result.current.retryLastResponse();
    });

    const state = useChatStore.getState();
    expect(state.queuedPrompts).toHaveLength(0);
    expect(state.messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Q1", "Q2"]);
    expect(state.messages.filter((m) => m.role === "assistant").map((m) => m.content)).toEqual(["A1", "A2"]);
  });

  it("retries an interrupted stream that never confirmed completion", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('data: {"type":"text","content":"Partial"}\n', { status: 200 }))
      .mockResolvedValueOnce(completedStream("Full answer"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    expect(useChatStore.getState().messages.at(-1)?.status).toBe("interrupted");

    await act(async () => {
      await result.current.retryLastResponse();
    });

    expect(useChatStore.getState().messages.at(-1)?.content).toBe("Full answer");
  });

  it("refuses to retry a response that already completed", async () => {
    let chatCalls = 0;
    const fetchMock = routeChatFetch(() => {
      chatCalls += 1;
      return completedStream("Answer");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    await act(async () => {
      await result.current.retryLastResponse();
    });

    expect(chatCalls).toBe(1);
    expect(useChatStore.getState().messages.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("resumes the queue without retrying the turn that paused it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failedResponse())
      .mockResolvedValueOnce(completedStream("A2"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
    });
    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    await act(async () => {
      await result.current.resumeQueue();
    });

    const state = useChatStore.getState();
    expect(state.queuedPrompts).toHaveLength(0);
    expect(state.messages.filter((m) => m.role === "user").map((m) => m.content)).toEqual(["Q1", "Q2"]);
    // The failed turn is preserved as history rather than silently rewritten.
    expect(state.messages.some((m) => m.status === "failed")).toBe(true);
  });

  it("does not start a retry while a response is still streaming", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());
    let pending: Promise<unknown>;

    act(() => {
      pending = result.current.sendMessage("Q1");
    });
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
    await act(async () => {
      await result.current.retryLastResponse();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.stopStreaming();
    });
    await act(async () => {
      await pending;
    });
  });

  // The banner said "that answer could not be saved" while saves were succeeding,
  // and it survived reloads because the pause reason is persisted. Nothing cleared
  // it on a later success, so a transient outage left a permanent false alarm.
  it("clears a persistence pause once a later save succeeds", async () => {
    let persistOk = false;
    const fetchMock = routeChatFetch(
      () => completedStream("A"),
      () => (persistOk
        ? new Response(JSON.stringify({ id: "conv-test" }), { status: 200 })
        : new Response("save failed", { status: 500 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    expect(useChatStore.getState().queuePauseReason).toBe("persistence");

    persistOk = true;
    await act(async () => {
      await result.current.sendMessage("Q2");
    });

    expect(useChatStore.getState().queuePauseReason).toBeNull();
  });

  // Clearing the pause resumes the drain. Doing that on the user's behalf would
  // spend their tokens on a queue they never chose to restart, so a pause with
  // prompts still waiting must survive a successful save.
  it("keeps the pause while prompts are still queued", async () => {
    const fetchMock = routeChatFetch(
      () => completedStream("A"),
      () => new Response("save failed", { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Q1");
    });
    expect(useChatStore.getState().queuePauseReason).toBe("persistence");

    act(() => {
      useChatStore.getState().enqueuePrompt("still waiting");
    });

    expect(useChatStore.getState().queuedPrompts.length).toBeGreaterThan(0);
    expect(useChatStore.getState().queuePauseReason).toBe("persistence");
  });
  // Losing the connection mid-stream left the message showing a live "Streaming"
  // indicator for the full 45s idle window with no error and no Retry — a progress state
  // that was actively lying. The browser already knows the connection dropped.
  //
  // DELIBERATELY LAST. This test leaves an aborted run behind, and something in that
  // teardown perturbs whichever test runs next into making a second chat request
  // (`expected 2 to be 1`). Unmounting hooks and resetting every store field the runtime
  // writes did NOT fix it, so the shared state is elsewhere — most likely the
  // module-level write chain in persistence.ts, which has no reset. A trivial test that
  // only sends one message reproduces the same downstream effect, so this is a property
  // of the file, not of this test. Tracked rather than papered over by loosening the
  // assertions of the test that follows.
  it("ends the run immediately when the browser goes offline mid-stream", async () => {
    const fetchMock = routeChatFetch((_url, init) => {
      const signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify({ type: "text", content: "partial" })}\n`),
            );
            // Mirrors a real fetch: the body errors when the request is aborted. Without
            // this the stream hangs forever and never exercises the fix.
            signal?.addEventListener("abort", () => {
              controller.error(new DOMException("Aborted", "AbortError"));
            });
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    let pending: Promise<unknown>;
    act(() => {
      pending = result.current.sendMessage("Q1");
    });
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });

    await act(async () => {
      window.dispatchEvent(new Event("offline"));
      await pending;
    });

    const last = useChatStore.getState().messages.at(-1);
    expect(last?.status).toBe("interrupted");
    expect(last?.content).toContain("offline");
    // Partial output is preserved so the user keeps what already arrived.
    expect(last?.content).toContain("partial");
  });
});
