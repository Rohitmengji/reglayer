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
 *
 * WHY TYPING STAYS ENABLED WHILE GENERATING:
 *   Disabling the composer during a response throws away the user's next
 *   thought and forces them to wait. Typing is always allowed; submitting
 *   during generation QUEUES the prompt instead of interrupting the answer.
 *   Interrupting must stay an explicit choice (the stop button), never a
 *   side effect of pressing Enter.
 */

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SendHorizontal, Square, ListPlus } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import { COMPOSER_ID } from "./QueuedPrompts";

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  /** True when the pending queue is at capacity — further prompts are refused. */
  queueFull?: boolean;
}

const MAX_CHARS = 10_000;

/**
 * How long typing pauses before the draft is persisted.
 *
 * WHY DEBOUNCED: the persisted store also holds the message history, so writing it
 * on every keystroke would serialise the whole conversation to localStorage on each
 * character. The draft is also flushed on unmount, so nothing is lost by waiting.
 */
const DRAFT_SAVE_DELAY_MS = 300;

export function ChatInput({ onSend, onStop, isStreaming, queueFull = false }: ChatInputProps) {
  const setDraft = useChatStore((s) => s.setDraft);
  const conversationId = useChatStore((s) => s.conversationId);
  // Local state keeps typing responsive; the store is the durable copy.
  const [input, setInput] = useState(() => useChatStore.getState().draft);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestInputRef = useRef(input);

  useEffect(() => { latestInputRef.current = input; }, [input]);

  // Switching conversations clears the stored draft; mirror that locally so a draft
  // written for one conversation cannot leak into another.
  useEffect(() => {
    setInput(useChatStore.getState().draft); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: resync draft to the newly active conversation
  }, [conversationId]);

  // Keep the box sized to its content after PROGRAMMATIC changes (restored draft,
  // conversation switch). Typing resizes synchronously in handleInput; this recomputes
  // the same height there, so it never fights the typing path.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Flush on unmount so closing the panel or navigating away preserves the draft.
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDraft(latestInputRef.current);
  }, [setDraft]);

  const persistDraft = useCallback((value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setDraft(value), DRAFT_SAVE_DELAY_MS);
  }, [setDraft]);

  // While generating, a submission is a QUEUE action rather than an immediate send.
  const willQueue = isStreaming;
  const blocked = willQueue && queueFull;

  const handleSubmit = useCallback(() => {
    if (!input.trim() || blocked) return;
    onSend(input);
    setInput("");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, blocked, onSend, setDraft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, MAX_CHARS);
    setInput(value);
    persistDraft(value);
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  const charCount = input.length;
  const showCharCount = charCount > 200;
  const nearLimit = charCount > MAX_CHARS * 0.9;
  const atLimit = charCount >= MAX_CHARS;
  const countId = `${COMPOSER_ID}-charcount`;

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
          id={COMPOSER_ID}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={willQueue ? "Queue another question..." : "Ask about accessibility..."}
          rows={1}
          maxLength={MAX_CHARS}
          className="flex-1 resize-none bg-transparent px-3.5 py-2.5 text-[13px] text-neutral-900 placeholder-neutral-400 disabled:opacity-50 dark:text-neutral-100 dark:placeholder-neutral-500 overflow-hidden focus:outline-none focus-visible:outline-none"
          style={{ outline: "none" }}
          aria-label="Chat message input"
          // Without this the limit is sighted-only: the counter is a detached span, so a
          // screen reader user gets no warning and no explanation when `maxLength`
          // silently discards the tail of a long paste.
          aria-describedby={showCharCount ? countId : undefined}
        />

        {isStreaming && (
          <button
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:bg-red-600 mb-1.5"
            title="Stop generating"
            aria-label="Stop generating response"
          >
            <Square className="h-3 w-3" fill="currentColor" />
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || blocked}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-all hover:bg-accent/90 disabled:opacity-20 disabled:cursor-not-allowed mb-1.5 mr-1.5"
          title={blocked ? "Queue is full" : willQueue ? "Add to queue" : "Send message"}
          aria-label={blocked ? "Queue is full" : willQueue ? "Add message to queue" : "Send message"}
        >
          {willQueue ? <ListPlus className="h-3.5 w-3.5" /> : <SendHorizontal className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Footer: keyboard hint + char count */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
          {blocked ? (
            <span className="text-amber-600 dark:text-amber-500">
              Queue is full — wait for a reply or remove a pending prompt
            </span>
          ) : (
            <>
              <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">Enter</kbd> to {willQueue ? "queue" : "send"} · <kbd className="font-mono text-[9px] px-1 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">Shift+Enter</kbd> new line
            </>
          )}
        </span>
        {showCharCount && (
          <span
            id={countId}
            className={`text-[10px] tabular-nums ${nearLimit ? "text-red-500" : "text-neutral-400"}`}
          >
            <span aria-hidden="true">
              {charCount.toLocaleString()}/{(MAX_CHARS / 1000).toFixed(0)}K
            </span>
            {/* Spelled out for assistive tech — "9,990/10K" is read as digits and
                punctuation, which does not convey that a limit is being approached. */}
            <span className="sr-only">
              {atLimit
                ? `Character limit reached. Maximum ${MAX_CHARS.toLocaleString()} characters; further text will not be added.`
                : `${(MAX_CHARS - charCount).toLocaleString()} characters remaining of ${MAX_CHARS.toLocaleString()}.`}
            </span>
          </span>
        )}
      </div>

      {/* Announced once on crossing the limit, not per keystroke: a live region tied to
          every character would talk over the user as they type. */}
      <span className="sr-only" role="status" aria-live="polite">
        {atLimit ? "Character limit reached." : ""}
      </span>
    </div>
  );
}
