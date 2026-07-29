/**
 * Regenerate and edit-and-resend must behave like ordinary turns.
 *
 * Both paths predate the prompt queue and originally called the streaming primitive
 * directly. That meant a prompt queued during a regenerate was stranded: the turn
 * finished, nothing drained the queue, and the pending prompt sat there silently.
 * They also guarded on a render-time copy of `isStreaming`, which can be stale by the
 * time a click lands and would permit a second overlapping request.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";

vi.mock("@/hooks/use-chat-sync", () => ({
  useChatSync: () => ({ saveNow: vi.fn() }),
}));

/** Build a completed SSE response body with a single text chunk. */
function completedStream(text: string): Response {
  return new Response(
    `data: ${JSON.stringify({ type: "text", content: text })}\n` +
    `data: ${JSON.stringify({ type: "done" })}\n`,
    { status: 200 },
  );
}

const assistantTexts = () =>
  useChatStore.getState().messages.filter((m) => m.role === "assistant").map((m) => m.content);

const userTexts = () =>
  useChatStore.getState().messages.filter((m) => m.role === "user").map((m) => m.content);

/**
 * Respond with `text`, queuing `queued` exactly once while the FIRST request is in
 * flight. Queuing on every request would make each drained prompt enqueue another,
 * looping forever.
 */
function streamAndQueueOnce(text: string, queued: string) {
  let hasQueued = false;
  return vi.fn().mockImplementation(async () => {
    if (!hasQueued) {
      hasQueued = true;
      useChatStore.getState().enqueuePrompt(queued);
    }
    return completedStream(text);
  });
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

describe("regenerate and edit re-run as normal turns", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      queuedPrompts: [],
      isStreaming: false,
      conversationId: null,
      isSaving: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drains prompts queued during a regenerate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("first")));
    const { result } = renderHook(() => useChat());

    await act(async () => { await result.current.sendMessage("original question"); });
    await waitFor(() => expect(assistantTexts()).toEqual(["first"]));

    // Queue a follow-up while the regenerate is in flight, then let it finish.
    vi.stubGlobal("fetch", streamAndQueueOnce("regenerated", "follow-up"));

    await act(async () => { await result.current.regenerate(); });

    await waitFor(() => {
      // The follow-up must actually run rather than sit stranded in the queue.
      expect(userTexts()).toEqual(["original question", "follow-up"]);
      expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
    });
  });

  it("replaces the previous answer instead of appending a second one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("first")));
    const { result } = renderHook(() => useChat());

    await act(async () => { await result.current.sendMessage("question"); });
    await waitFor(() => expect(assistantTexts()).toEqual(["first"]));

    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("second")));
    await act(async () => { await result.current.regenerate(); });

    await waitFor(() => expect(assistantTexts()).toEqual(["second"]));
    expect(userTexts()).toEqual(["question"]);
  });

  it("drains prompts queued during an edit-and-resend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => completedStream("answer")));
    const { result } = renderHook(() => useChat());

    await act(async () => { await result.current.sendMessage("typo qeustion"); });
    await waitFor(() => expect(assistantTexts()).toEqual(["answer"]));
    const userMessageId = useChatStore.getState().messages[0].id;

    vi.stubGlobal("fetch", streamAndQueueOnce("corrected answer", "and one more thing"));

    await act(async () => {
      await result.current.editAndResend(userMessageId, "typo question");
    });

    await waitFor(() => {
      expect(userTexts()).toEqual(["typo question", "and one more thing"]);
      expect(useChatStore.getState().queuedPrompts).toHaveLength(0);
    });
  });

  it("refuses to regenerate while a response is still streaming", async () => {
    const fetchMock = hangingFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChat());

    act(() => { void result.current.sendMessage("question"); });
    await waitFor(() => expect(useChatStore.getState().isStreaming).toBe(true));

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => { await result.current.regenerate(); });

    // A second overlapping request would corrupt the transcript.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });
});
