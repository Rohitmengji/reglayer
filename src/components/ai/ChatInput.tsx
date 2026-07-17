/**
 * RegLayer — Chat Composer
 *
 * Production-grade message input:
 * - Auto-expanding textarea (up to 160px)
 * - Enter to send, Shift+Enter for newline
 * - Character counter on long messages
 * - Keyboard shortcut hint
 * - Focus ring on interaction
 * - Stop button with square icon during streaming
 * - Disabled state while streaming
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { SendHorizontal, Square } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
}

const MAX_CHARS = 10_000;

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput("");
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
    const value = e.target.value.slice(0, MAX_CHARS);
    setInput(value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  const charCount = input.length;
  const showCharCount = charCount > 200;
  const nearLimit = charCount > MAX_CHARS * 0.9;

  return (
    <div className="border-t border-neutral-200 dark:border-neutral-700 px-4 py-3">
      <div
        className={`flex items-end gap-2 rounded-xl border transition-colors ${
          focused
            ? "border-neutral-900 dark:border-neutral-100 bg-white dark:bg-neutral-800 shadow-sm"
            : "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
        }`}
      >
        {/*
         * INTENTIONAL: No blue focus ring on this textarea or its container.
         * The parent div already shows a black border on focus via the `focused`
         * state. Adding outline/ring here causes an ugly double-border.
         * DO NOT add focus:ring-*, focus-visible:outline-*, or border-accent here.
         * — Rohit, 2026-07-16
         */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask about accessibility..."
          disabled={isStreaming}
          rows={1}
          maxLength={MAX_CHARS}
          className="flex-1 resize-none bg-transparent px-3.5 py-2.5 text-[13px] text-neutral-900 placeholder-neutral-400 disabled:opacity-50 dark:text-neutral-100 dark:placeholder-neutral-500 overflow-hidden focus:outline-none focus-visible:outline-none"
          style={{ outline: "none" }}
          aria-label="Chat message input"
          autoFocus
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:bg-red-600 mb-1.5 mr-1.5"
            title="Stop generating"
            aria-label="Stop generating response"
          >
            <Square className="h-3 w-3" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-all hover:bg-accent/90 disabled:opacity-20 disabled:cursor-not-allowed mb-1.5 mr-1.5"
            title="Send message"
            aria-label="Send message"
          >
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Footer: keyboard hint + char count */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">Enter</kbd> to send · <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">Shift+Enter</kbd> new line
        </span>
        {showCharCount && (
          <span className={`text-[10px] tabular-nums ${nearLimit ? "text-red-500" : "text-neutral-400"}`}>
            {charCount.toLocaleString()}/{(MAX_CHARS / 1000).toFixed(0)}K
          </span>
        )}
      </div>
    </div>
  );
}
