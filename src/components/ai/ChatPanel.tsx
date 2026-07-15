/**
 * RegLayer — Chat Panel (Modernized)
 *
 * Slide-out panel with a clean, modern design inspired by Cursor and Linear.
 * Features: gradient header accent, smooth slide-in animation, refined empty
 * state with sparkle icon, and polished spacing.
 */

"use client";

import { useRef, useEffect } from "react";
import { useChat } from "@/hooks/use-chat";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { Sparkles, Trash2, X } from "lucide-react";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { messages, isStreaming, sendMessage, stopStreaming, clearMessages } =
    useChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or content streams in
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity lg:hidden"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:bg-neutral-900"
        role="complementary"
        aria-label="AI Chat Assistant"
      >
        {/* Header — subtle gradient accent */}
        <div className="relative border-b border-neutral-100 dark:border-neutral-800">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent via-blue-400 to-purple-500" />
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10">
                <Sparkles className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                  RegLayer AI
                </h2>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500">
                  Accessibility assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <button
                  onClick={clearMessages}
                  className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                title="Close chat"
                aria-label="Close chat panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/10 to-purple-500/10">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <h3 className="mb-1.5 text-base font-semibold text-neutral-800 dark:text-neutral-200">
                How can I help?
              </h3>
              <p className="mb-6 max-w-[260px] text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                Ask about WCAG criteria, fix violations, check compliance, or get remediation guidance.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-[280px]">
                {[
                  { text: "What is WCAG 2.1 SC 1.4.3?", icon: "📋" },
                  { text: "How do I fix missing alt text?", icon: "🔧" },
                  { text: "Explain the European Accessibility Act", icon: "🇪🇺" },
                ].map(({ text, icon }) => (
                  <button
                    key={text}
                    onClick={() => sendMessage(text)}
                    className="flex items-center gap-2.5 rounded-xl border border-neutral-150 bg-neutral-50/50 px-3.5 py-2.5 text-left text-xs text-neutral-600 transition-all hover:border-accent/30 hover:bg-accent/5 hover:text-accent dark:border-neutral-800 dark:bg-neutral-800/30 dark:text-neutral-400 dark:hover:border-accent/30 dark:hover:bg-accent/5 dark:hover:text-accent"
                  >
                    <span className="text-sm">{icon}</span>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 px-4 py-4">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>
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
