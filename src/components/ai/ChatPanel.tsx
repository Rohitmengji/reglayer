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
import { useChatStore } from "@/stores/chatStore";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { MessageSquare, Trash2, X, ArrowDown, Download, Plus, History, Loader2, Clock } from "lucide-react";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, regenerate, editAndResend, stopStreaming, clearMessages, setFeedback } =
    useChat();
  const { conversations, loadingList, isSaving, fetchConversations, switchConversation, startNew, deleteConversation } =
    useChatSync();
  const conversationId = useChatStore((s) => s.conversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
          </div>
          <div className="flex items-center gap-1">
            {/* Saving indicator */}
            {isSaving && (
              <span className="flex items-center gap-1 text-[10px] text-neutral-400 mr-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </span>
            )}
            {/* New conversation */}
            <button
              onClick={() => { startNew(); setShowHistory(false); }}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus className="h-4 w-4" />
            </button>
            {/* History toggle */}
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) fetchConversations(); }}
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
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <MessageSquare className="h-6 w-6 text-accent" />
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-neutral-800 dark:text-neutral-200">
                How can I help?
              </h3>
              <p className="mb-6 max-w-65 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                Ask about WCAG, violations, compliance, or remediation guidance.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-70">
                {[
                  "What is WCAG 2.1 SC 1.4.3?",
                  "How do I fix missing alt text?",
                  "Explain the European Accessibility Act",
                ].map((text) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-left text-xs text-neutral-700 transition-all hover:border-accent hover:text-accent dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-accent dark:hover:text-accent"
                  >
                    {text}
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

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          onStop={stopStreaming}
          isStreaming={isStreaming}
        />
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
