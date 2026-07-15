/**
 * RegLayer — Chat Input
 *
 * The message input box with send/stop button. Supports:
 * - Enter to send, Shift+Enter for newline
 * - Auto-expanding textarea
 * - Stop button during streaming (cancels the AbortController)
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { SendHorizontal, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-expand textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  return (
    <div className="border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask about accessibility..."
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-transparent bg-neutral-100 px-3.5 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 overflow-hidden transition-colors"
          style={{ outline: "none", boxShadow: "none" }}
          aria-label="Chat message input"
          autoFocus
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            title="Stop generating"
            aria-label="Stop generating response"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white transition-colors hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            title="Send message"
            aria-label="Send message"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-[10px] text-neutral-400 dark:text-neutral-500">
        AI responses may be inaccurate. Always verify compliance recommendations.
      </p>
    </div>
  );
}
