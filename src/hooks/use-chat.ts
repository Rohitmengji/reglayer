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

export function useChat() {
  const {
    messages,
    isStreaming,
    addMessage,
    appendToMessage,
    setStreaming,
    clearMessages,
  } = useChatStore();

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      // 1. Add user message to store
      addMessage("user", content.trim());

      // 2. Create placeholder for assistant response
      const assistantId = addMessage("assistant", "");

      // 3. Start streaming
      setStreaming(true);
      abortRef.current = new AbortController();

      try {
        // 4. Build message history for the API (exclude the empty placeholder)
        const apiMessages = useChatStore
          .getState()
          .messages.filter((m) => m.id !== assistantId)
          .map((m) => ({ role: m.role, content: m.content }));

        // 5. POST to the streaming endpoint
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          appendToMessage(
            assistantId,
            `Sorry, I couldn't respond. ${response.status === 401 ? "Please sign in." : errorText}`,
          );
          return;
        }

        // 6. Read the stream chunk-by-chunk
        const reader = response.body?.getReader();
        if (!reader) {
          appendToMessage(assistantId, "Sorry, streaming is not supported.");
          return;
        }

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and append to the assistant message
          const chunk = decoder.decode(value, { stream: true });
          appendToMessage(assistantId, chunk);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          // User cancelled — this is fine
          appendToMessage(assistantId, "\n\n*(Response cancelled)*");
        } else {
          appendToMessage(
            assistantId,
            "\n\nSorry, an error occurred. Please try again.",
          );
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, addMessage, appendToMessage, setStreaming],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    clearMessages,
  };
}
