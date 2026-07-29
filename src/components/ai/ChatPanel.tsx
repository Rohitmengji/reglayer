/**
 * RegLayer — Chat Panel
 *
 * Slide-out panel with scroll-to-bottom navigation and consistent
 * design system colors (accent blue/indigo).
 */

"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "@/hooks/use-chat";
import { useChatSync } from "@/hooks/use-chat-sync";
import { useChatStore, MAX_QUEUED_PROMPTS } from "@/stores/chatStore";
import type { EnqueueRejection, QueuePauseReason } from "@/lib/ai/chat/queue";
import { queueAnnouncement } from "@/lib/ai/chat/queue";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { QueuedPrompts, COMPOSER_ID } from "./QueuedPrompts";
import { MessageSquare, Trash2, X, ArrowDown, Download, Plus, History, Loader2, Clock, Zap, RotateCcw, SkipForward, TriangleAlert } from "lucide-react";
import { useCredits } from "@/hooks/use-credits";
import { useFollowUpSuggestions } from "@/hooks/use-follow-up-suggestions";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const {
    messages,
    queuedPrompts,
    isStreaming,
    queueStatus,
    avgRunMs,
    queuePauseReason,
    sendMessage,
    regenerate,
    retryLastResponse,
    resumeQueue,
    pauseQueue,
    clearQueue,
    editAndResend,
    stopStreaming,
    clearMessages,
    setFeedback,
    updateQueuedPrompt,
    removeQueuedPrompt,
  } = useChat();
  const { conversations, loadingList, fetchConversations, switchConversation, startNew, deleteConversation } =
    useChatSync();
  const conversationId = useChatStore((s) => s.conversationId);
  const { credits } = useCredits();
  const followUps = useFollowUpSuggestions(messages);
  // Only the newest turn can be retried — older turns are settled history.
  const lastMessage = messages.at(-1);
  const lastResponseStatus = !isStreaming && lastMessage?.role === "assistant"
    ? lastMessage.status
    : undefined;
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  /**
   * Focus management for the panel.
   *
   * Replaces `autoFocus` on the composer, which fired on mount regardless of context
   * and never returned focus anywhere on close — leaving keyboard users on <body>.
   * Escape is added because the panel could previously only be dismissed by tabbing to
   * the close button.
   */
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => document.getElementById(COMPOSER_ID)?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      // Inner Escape handlers (queued-prompt editing) stop propagation, so this only
      // fires when nothing more specific has claimed the key.
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const [sendNotice, setSendNotice] = useState<EnqueueRejection | null>(null);

  // A rejected submission must say WHY. Silently dropping a prompt the user pressed
  // Enter on is the single worst outcome a queue can produce.
  const handleSend = async (text: string) => {
    setSendNotice(null);
    const result = await sendMessage(text);
    if (result && !result.ok && result.reason !== "empty") setSendNotice(result.reason);
  };
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // Fetch conversation list when panel opens
  useEffect(() => {
    if (open) fetchConversations();
  }, [open, fetchConversations]);

  // Track scroll position to show/hide scroll-to-bottom button
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 100);
  }, []);

  // Auto-scroll to bottom on new messages (only if already near bottom)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 150) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  /** Export conversation as markdown and copy to clipboard. */
  const exportConversation = useCallback(() => {
    if (!messages.length) return;
    const md = messages
      .map((m) => `**${m.role === "user" ? "You" : "RegLayer AI"}:**\n${m.content}`)
      .join("\n\n---\n\n");
    navigator.clipboard.writeText(md);
  }, [messages]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity lg:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-105 flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:bg-neutral-900"
        role="complementary"
        aria-label="AI Chat Assistant"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 dark:bg-white">
              <svg width="16" height="16" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round" className="text-white dark:text-neutral-900">
                <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" />
                <path d="M1.5 13 13 19 24.5 13" />
                <path d="M1.5 18.5 13 24.5 24.5 18.5" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                RegLayer AI
              </h2>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Accessibility assistant
              </p>
            </div>
            {/* Credit balance indicator */}
            {credits && (
              <span
                className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  credits.unlimited
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : credits.remaining <= 5
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                      : credits.remaining <= 20
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
                title={credits.unlimited ? "Unlimited AI credits" : `${credits.remaining} AI credits remaining (${credits.used}/${credits.limit} used)`}
              >
                <Zap className="h-2.5 w-2.5" aria-hidden="true" />
                {credits.unlimited ? "∞" : credits.remaining}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Saving indicator */}
            {/* New conversation */}
            <button
              onClick={() => { startNew(); setShowHistory(false); }}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            {/* History toggle — data is pre-loaded on panel open, toggle is instant */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`rounded-lg p-2 transition-colors ${showHistory ? "bg-accent/10 text-accent" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"}`}
              title="Conversation history"
              aria-label="Show conversation history"
            >
              <History className="h-4 w-4" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={exportConversation}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="Copy conversation as Markdown"
                aria-label="Export conversation"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="Clear conversation"
                aria-label="Clear conversation"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Close chat"
              aria-label="Close chat panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Conversation History Panel */}
        {showHistory && (
          <div className="border-b border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col" style={{ maxHeight: "min(50vh, 400px)" }}>
            {/* History header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50/80 dark:bg-neutral-800/40 border-b border-neutral-100 dark:border-neutral-800">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Recent Chats
              </span>
              <span className="text-[10px] text-neutral-400 tabular-nums">
                {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Search conversations */}
            <div className="px-3 pb-2">
              <input
                type="search"
                value={historySearch}
                onChange={(e) => {
                  setHistorySearch(e.target.value);
                  // Trigger search with debounce via fetchConversations
                  const q = e.target.value.trim();
                  if (q.length >= 2 || q.length === 0) fetchConversations(q || undefined);
                }}
                placeholder="Search conversations..."
                className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-[12px] text-neutral-700 dark:text-neutral-300 placeholder-neutral-400 focus:outline-none focus-visible:outline-none"
                style={{ outline: "none" }}
                aria-label="Search conversations"
              />
            </div>

            {/* History list */}
            <div className="flex-1 overflow-y-auto">
              {loadingList ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
                  <span className="text-xs text-neutral-400">Loading conversations...</span>
                </div>
              ) : conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <MessageSquare className="h-4 w-4 text-neutral-400" />
                  </div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">No conversations yet</p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">Your chats will appear here automatically</p>
                </div>
              ) : (
                <div className="py-1">
                  {conversations.map((conv) => {
                    const isActive = conv.id === conversationId;
                    const timeAgo = formatTimeAgo(conv.updatedAt);
                    return (
                      <div
                        key={conv.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => { switchConversation(conv.id); setShowHistory(false); }}
                        onKeyDown={(e) => { if (e.key === "Enter") { switchConversation(conv.id); setShowHistory(false); } }}
                        className={`w-full px-4 py-3 text-left transition-colors group cursor-pointer border-l-2 ${
                          isActive
                            ? "bg-accent/5 border-accent dark:bg-accent/10"
                            : "border-transparent hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${
                              isActive ? "text-accent" : "text-neutral-800 dark:text-neutral-200"
                            }`}>
                              {conv.title}
                            </p>
                            {conv.lastMessage && (
                              <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate mt-0.5 leading-snug">
                                {conv.lastMessage}
                              </p>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                              <Clock className="h-2.5 w-2.5 text-neutral-300 dark:text-neutral-600" />
                              <span className="text-[10px] text-neutral-400 dark:text-neutral-500">{timeAgo}</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                            className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 p-1.5 rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                            title="Delete conversation"
                            aria-label={`Delete conversation: ${conv.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="relative flex-1 overflow-y-auto"
        >
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              {/* AI avatar */}
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 dark:from-accent/30 dark:to-accent/10 shadow-sm">
                <svg width="24" height="24" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="text-accent">
                  <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" fillOpacity="0.15" />
                  <path d="M1.5 13 13 19 24.5 13" />
                  <path d="M1.5 18.5 13 24.5 24.5 18.5" />
                </svg>
              </div>
              <h3 className="mb-1 text-[15px] font-semibold text-neutral-800 dark:text-neutral-200">
                How can I help?
              </h3>
              <p className="mb-6 max-w-[260px] text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                I can help with WCAG compliance, explain violations, suggest fixes, and generate remediation code.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full max-w-[280px]">
                {[
                  { icon: "🔍", text: "What is WCAG SC 1.4.3 contrast?" },
                  { icon: "🛠", text: "How do I fix missing alt text?" },
                  { icon: "📋", text: "Summarize my latest scan results" },
                  { icon: "🇪🇺", text: "EAA compliance requirements" },
                ].map(({ icon, text }) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="flex items-center gap-2.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-[12px] text-neutral-700 transition-all hover:border-accent/50 hover:bg-accent/5 hover:text-accent dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-300 dark:hover:border-accent/40 dark:hover:bg-accent/10 dark:hover:text-accent"
                  >
                    <span className="text-sm">{icon}</span>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4">
              {messages.map((message, idx) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLast={idx === messages.length - 1}
                  isStreaming={isStreaming && idx === messages.length - 1}
                  onRegenerate={regenerate}
                  onEdit={editAndResend}
                  onFeedback={setFeedback}
                />
              ))}
            </div>
          )}

          {/* Follow-up suggestion chips — shown after AI responds */}
          {!isStreaming && followUps.length > 0 && messages.length > 0 && (
            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
              {followUps.map(({ icon, text }) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 px-2.5 py-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 transition-all hover:border-accent/50 hover:text-accent hover:bg-accent/5 dark:hover:border-accent/40 dark:hover:text-accent"
                >
                  <span className="text-xs">{icon}</span>
                  <span className="truncate max-w-[200px]">{text}</span>
                </button>
              ))}
            </div>
          )}

          {/* Scroll to bottom button — only shows when scrolled up in long conversations */}
          {showScrollDown && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-3 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 bg-white shadow-md transition-all hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              aria-label="Scroll to bottom"
              title="Scroll to latest message"
            >
              <ArrowDown className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
            </button>
          )}
        </div>

        {/* Recovery bar — the queue pauses on any non-success outcome, so the user
            is given an explicit way forward instead of a silently stalled queue. */}
        <RecoveryBar
          status={lastResponseStatus}
          pauseReason={queuePauseReason}
          queuedCount={queuedPrompts.length}
          onRetry={retryLastResponse}
          onResume={resumeQueue}
        />

        {/* Pending prompts accepted during generation */}
        <QueuedPrompts
          prompts={queuedPrompts}
          onEdit={updateQueuedPrompt}
          onRemove={removeQueuedPrompt}
          onPause={pauseQueue}
          onResume={resumeQueue}
          onClear={clearQueue}
          avgRunMs={avgRunMs}
          queueStatus={queueStatus}
        />

        {/*
          The ONLY live region for queue state. One region that states the whole
          situation is quieter and more informative than a badge on every message.
        */}
        <p className="sr-only" role="status" aria-live="polite">
          {queueAnnouncement({
            status: queueStatus,
            pendingCount: queuedPrompts.length,
            avgRunMs,
            pauseReason: queuePauseReason,
          })}
        </p>

        {sendNotice && (
          <p
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
            role="status"
            aria-live="polite"
          >
            {sendNotice === "duplicate"
              ? "That prompt is already queued."
              : "Queue is full — wait for a reply or remove a pending prompt."}
          </p>
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          onStop={stopStreaming}
          isStreaming={isStreaming}
          queueFull={queuedPrompts.length >= MAX_QUEUED_PROMPTS}
        />
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const RECOVERY_COPY = {
  failed: "That response failed.",
  interrupted: "That response was interrupted before it finished.",
  cancelled: "You stopped that response.",
} as const;

function RecoveryBar({
  status,
  pauseReason,
  queuedCount,
  onRetry,
  onResume,
}: {
  status?: string;
  pauseReason: QueuePauseReason | null;
  queuedCount: number;
  onRetry: () => void;
  onResume: () => void;
}) {
  // A persistence pause follows a SUCCESSFUL answer, so the message status is
  // "completed" and would not surface here on its own.
  const message = pauseReason === "persistence"
    ? "That answer could not be saved, so the queue stopped to avoid losing more."
    : status && status in RECOVERY_COPY
      ? RECOVERY_COPY[status as keyof typeof RECOVERY_COPY]
      : null;

  if (!message) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/40 dark:bg-amber-950/20"
      role="status"
      aria-live="polite"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
      <p className="flex-1 text-[12px] text-amber-900 dark:text-amber-200">
        {message}
        {queuedCount > 0 && ` ${queuedCount} queued prompt${queuedCount === 1 ? "" : "s"} paused.`}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-200 dark:hover:bg-neutral-800"
      >
        <RotateCcw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
      {queuedCount > 0 && (
        <button
          onClick={onResume}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-neutral-900 dark:text-amber-200 dark:hover:bg-neutral-800"
          title="Discard this turn and run the next queued prompt"
        >
          <SkipForward className="h-3 w-3" aria-hidden="true" />
          Skip
        </button>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
