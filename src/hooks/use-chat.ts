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

export function useChat() {
  const {
    messages,
    isStreaming,
    addMessage,
    updateMessage,
    appendToMessage,
    setStreaming,
    clearMessages,
    truncateFrom,
    editMessage,
    setFeedback,
    setLineage,
  } = useChatStore();

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  /** Core streaming logic — sends messages to the API and streams the response. */
  const streamResponse = useCallback(
    async (apiMessages: Array<{ role: string; content: string }>) => {
      const assistantId = addMessage("assistant", "");
      setStreaming(true);
      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          updateMessage(assistantId,
            `Sorry, I couldn't respond. ${response.status === 401 ? "Please sign in." : response.status === 429 ? "Rate limit reached — try again shortly." : errorText}`,
          );
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          appendToMessage(assistantId, "Sorry, streaming is not supported.");
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse line-delimited JSON events
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const jsonStr = trimmed.slice(6);
            try {
              const event = JSON.parse(jsonStr) as {
                type: string;
                content?: string;
                data?: MessageLineage;
                id?: string;
                name?: string;
                args?: Record<string, unknown>;
                result?: string;
                durationMs?: number;
                message?: string;
              };

              switch (event.type) {
                case "text":
                  if (event.content) appendToMessage(assistantId, event.content);
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
                case "error":
                  appendToMessage(assistantId, `\n\n*Error: ${event.message}*`);
                  break;
                case "done":
                  break;
              }
            } catch {
              // If JSON parse fails, treat as raw text (backward compat)
              appendToMessage(assistantId, jsonStr);
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const event = JSON.parse(trimmed.slice(6));
              if (event.type === "text" && event.content) {
                appendToMessage(assistantId, event.content);
              } else if (event.type === "lineage" && event.data) {
                setLineage(assistantId, event.data);
              }
            } catch {
              appendToMessage(assistantId, trimmed.slice(6));
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          appendToMessage(assistantId, "\n\n*(Response cancelled)*");
        } else {
          appendToMessage(assistantId, "\n\nSorry, an error occurred. Please try again.");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [addMessage, appendToMessage, setStreaming, updateMessage, setLineage],
  );

  /** Send a new user message. */
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;
      addMessage("user", content.trim());

      // Build API messages (full history minus the not-yet-existing assistant placeholder)
      const apiMessages = useChatStore
        .getState()
        .messages.map((m) => ({ role: m.role, content: m.content }));

      await streamResponse(apiMessages);
    },
    [isStreaming, addMessage, streamResponse],
  );

  /** Regenerate the last assistant response. */
  const regenerate = useCallback(async () => {
    if (isStreaming) return;
    const msgs = useChatStore.getState().messages;
    // Find the last assistant message and remove it
    const lastAssistantIdx = msgs.length - 1;
    if (lastAssistantIdx < 0 || msgs[lastAssistantIdx].role !== "assistant") return;
    truncateFrom(msgs[lastAssistantIdx].id);

    // Re-send everything up to (but not including) the removed assistant message
    const apiMessages = useChatStore
      .getState()
      .messages.map((m) => ({ role: m.role, content: m.content }));

    await streamResponse(apiMessages);
  }, [isStreaming, truncateFrom, streamResponse]);

  /** Edit a user message and re-run from that point. */
  const editAndResend = useCallback(
    async (messageId: string, newContent: string) => {
      if (isStreaming) return;
      editMessage(messageId, newContent);

      // Re-send the conversation up to and including the edited message
      const apiMessages = useChatStore
        .getState()
        .messages.map((m) => ({ role: m.role, content: m.content }));

      await streamResponse(apiMessages);
    },
    [isStreaming, editMessage, streamResponse],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    regenerate,
    editAndResend,
    stopStreaming,
    clearMessages,
    setFeedback,
  };
}
