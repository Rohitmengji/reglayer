/**
 * RegLayer — Chat Store (Zustand + Persistence)
 *
 * WHY:  The chat needs state that persists across page navigations within a
 *       session. When a user chats on the dashboard, navigates to scans, then
 *       comes back — their conversation should still be there.
 *
 * DESIGN DECISIONS:
 * - Messages are stored in Zustand with localStorage persistence.
 *   This is the same pattern as scanStore.
 * - `isStreaming` tracks whether a response is in progress (disables input).
 * - No conversation IDs yet — single conversation per session.
 *   When we add multi-conversation support, we'll add conversationId.
 * - Max 100 messages to prevent localStorage bloat.
 *
 * HOW CHATGPT DOES IT:
 *   ChatGPT stores conversations server-side (database), not localStorage.
 *   We'll migrate to DB storage when we add conversation history as a feature.
 *   For now, localStorage is simpler and sufficient for the MVP.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;

  // Actions
  addMessage: (role: "user" | "assistant", content: string) => string;
  updateMessage: (id: string, content: string) => void;
  appendToMessage: (id: string, chunk: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

let messageCounter = 0;
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      isStreaming: false,

      addMessage: (role, content) => {
        const id = generateMessageId();
        set((state) => ({
          messages: [...state.messages, {
            id,
            role,
            content,
            timestamp: Date.now(),
          }].slice(-100), // Keep last 100 messages
        }));
        return id;
      },

      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, content } : msg,
          ),
        })),

      appendToMessage: (id, chunk) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, content: msg.content + chunk } : msg,
          ),
        })),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      clearMessages: () => set({ messages: [], isStreaming: false }),
    }),
    {
      name: "reglayer-chat",
      partialize: (state) => ({
        messages: state.messages,
        // Don't persist isStreaming — always start as false
      }),
    },
  ),
);
