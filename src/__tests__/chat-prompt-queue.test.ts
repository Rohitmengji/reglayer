import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChat } from "@/hooks/use-chat";
import { MAX_QUEUED_PROMPTS, useChatStore } from "@/stores/chatStore";
import { sequentialChatResponses } from "./helpers/chat-fetch";

/** Build a completed SSE response body with a single text chunk. */
function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

/** A fetch that never settles until its signal aborts — models an in-flight turn. */
function hangingFetch() {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });
    }),
  );
}

/** Enqueue and return the new prompt's id, failing loudly if it was rejected. */
function enqueueId(content: string): string {
  const result = useChatStore.getState().enqueuePrompt(content);
  if (!result.ok) throw new Error(`expected "${content}" to be queued, got ${result.reason}`);
  return result.id;
}

describe("chat prompt queue", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      queuedPrompts: [],
      isStreaming: false,
      conversationId: null,
      isSaving: false,
      // A lease leaked from a previous test would silently block every later drain,
      // because the runner refuses to start when the queue is already owned.
      runnerToken: null,
      queuePauseReason: null,
      avgRunMs: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues a prompt submitted while a response is generating", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { result } = renderHook(() => useChat());

    act(() => {
      void result.current.sendMessage("First");
    });
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
    await act(async () => {
      await result.current.sendMessage("Second");
    });

    const state = useChatStore.getState();
    expect(state.queuedPrompts.map((p) => p.content)).toEqual(["Second"]);
    // The queued prompt must NOT enter the transcript until it starts processing.
    expect(state.messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("processes queued prompts automatically in FIFO order after completion", async () => {
    const fetchMock = sequentialChatResponses(
      completedStream("A1"),
      completedStream("A2"),
      completedStream("A3"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
      useChatStore.getState().enqueuePrompt("Q3");
    });
    await act(async () => {
      await result.current.sendMessage("Q1");
    });

    const state = useChatStore.getState();
    expect(state.queuedPrompts).toHaveLength(0);
    expect(state.messages.filter((m) => m.role === "user").map((m) => m.content))
      .toEqual(["Q1", "Q2", "Q3"]);
    expect(state.messages.filter((m) => m.role === "assistant").map((m) => m.content))
      .toEqual(["A1", "A2", "A3"]);
    expect(state.messages.every((m) => m.role === "user" || m.status === "completed")).toBe(true);
  });

  it("pauses the queue when a turn fails and preserves pending prompts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
    });
    await act(async () => {
      await result.current.sendMessage("Q1");
    });

    const state = useChatStore.getState();
    expect(state.messages.at(-1)?.status).toBe("failed");
    expect(state.queuedPrompts.map((p) => p.content)).toEqual(["Q2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("pauses the queue when the user stops generation", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const { result } = renderHook(() => useChat());
    let pending: Promise<unknown>;

    act(() => {
      useChatStore.getState().enqueuePrompt("Q2");
      pending = result.current.sendMessage("Q1");
    });
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
    act(() => {
      result.current.stopStreaming();
    });
    await act(async () => {
      await pending;
    });

    const state = useChatStore.getState();
    expect(state.messages.at(-1)?.status).toBe("cancelled");
    expect(state.queuedPrompts.map((p) => p.content)).toEqual(["Q2"]);
  });

  it("caps the queue and rejects overflow instead of silently dropping order", () => {
    for (let i = 0; i < MAX_QUEUED_PROMPTS; i++) {
      expect(useChatStore.getState().enqueuePrompt(`Q${i}`).ok).toBe(true);
    }

    expect(useChatStore.getState().enqueuePrompt("Overflow")).toEqual({
      ok: false,
      reason: "full",
    });
    expect(useChatStore.getState().queuedPrompts).toHaveLength(MAX_QUEUED_PROMPTS);
  });

  it("supports editing and deleting prompts that have not started", () => {
    const first = enqueueId("Original");
    const second = enqueueId("Second");

    useChatStore.getState().updateQueuedPrompt(first, "Edited");
    useChatStore.getState().removeQueuedPrompt(second);

    expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["Edited"]);
  });

  it("ignores blank prompts for both submission and edits", () => {
    expect(useChatStore.getState().enqueuePrompt("   ")).toEqual({
      ok: false,
      reason: "empty",
    });

    const id = enqueueId("Keep");
    useChatStore.getState().updateQueuedPrompt(id, "   ");

    expect(useChatStore.getState().queuedPrompts.map((p) => p.content)).toEqual(["Keep"]);
  });

  it("clears pending prompts when the conversation context changes", () => {
    useChatStore.getState().enqueuePrompt("Q1");
    useChatStore.getState().newConversation();

    expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
  });
});
