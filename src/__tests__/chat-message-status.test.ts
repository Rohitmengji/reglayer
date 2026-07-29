import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canTransitionChatResponse } from "@/lib/ai/chat/message-status";
import { useChat } from "@/hooks/use-chat";
import { useChatStore } from "@/stores/chatStore";

describe("chat response status", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      isStreaming: false,
      conversationId: null,
      isSaving: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts the successful streaming lifecycle", () => {
    expect(canTransitionChatResponse("sending", "generating")).toBe(true);
    expect(canTransitionChatResponse("generating", "streaming")).toBe(true);
    expect(canTransitionChatResponse("streaming", "completed")).toBe(true);
  });

  it("supports queued, retry, cancellation, and reconnect paths", () => {
    expect(canTransitionChatResponse("sending", "queued")).toBe(true);
    expect(canTransitionChatResponse("queued", "cancelled")).toBe(true);
    expect(canTransitionChatResponse("streaming", "retrying")).toBe(true);
    expect(canTransitionChatResponse("retrying", "generating")).toBe(true);
    expect(canTransitionChatResponse("streaming", "interrupted")).toBe(true);
    expect(canTransitionChatResponse("interrupted", "streaming")).toBe(true);
  });

  it("keeps terminal states terminal", () => {
    expect(canTransitionChatResponse("completed", "streaming")).toBe(false);
    expect(canTransitionChatResponse("cancelled", "completed")).toBe(false);
    expect(canTransitionChatResponse("failed", "completed")).toBe(false);
  });

  it("ignores an invalid late transition in the store", () => {
    const assistantId = useChatStore.getState().addMessage("assistant", "Answer", "streaming");

    useChatStore.getState().transitionMessageStatus(assistantId, "completed");
    useChatStore.getState().transitionMessageStatus(assistantId, "failed");

    expect(useChatStore.getState().messages[0]?.status).toBe("completed");
  });

  it("does not attach response lifecycle state to user messages", () => {
    useChatStore.getState().addMessage("user", "Question", "sending");

    expect(useChatStore.getState().messages[0]?.status).toBeUndefined();
  });

  it("completes only after the server emits done", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"type":"text","content":"Answer"}\n' +
      'data: {"type":"done"}\n',
      { status: 200 },
    )));
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Question");
    });

    const assistant = useChatStore.getState().messages.at(-1);
    expect(assistant?.content).toBe("Answer");
    expect(assistant?.status).toBe("completed");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("marks a stream interrupted when transport ends without done", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      'data: {"type":"text","content":"Partial"}\n',
      { status: 200 },
    )));
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Question");
    });

    expect(useChatStore.getState().messages.at(-1)?.status).toBe("interrupted");
  });

  it("marks rejected requests failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Question");
    });

    expect(useChatStore.getState().messages.at(-1)?.status).toBe("failed");
  });

  it("marks the active response cancelled when the user stops it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    ));
    const { result } = renderHook(() => useChat());
    let sendPromise: Promise<unknown>;

    act(() => {
      sendPromise = result.current.sendMessage("Question");
    });
    await waitFor(() => {
      expect(useChatStore.getState().isStreaming).toBe(true);
    });
    act(() => {
      result.current.stopStreaming();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(useChatStore.getState().messages.at(-1)?.status).toBe("cancelled");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });
});