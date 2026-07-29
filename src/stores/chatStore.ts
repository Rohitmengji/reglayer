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
import {
  canTransitionChatResponse,
  type ChatResponseStatus,
} from "@/lib/ai/chat/message-status";
import {
  decideEnqueue,
  foldRunDuration,
  MAX_QUEUED_PROMPTS,
  type EnqueueRejection,
  type QueuedPrompt,
  type QueuePauseReason,
} from "@/lib/ai/chat/queue";

export { MAX_QUEUED_PROMPTS };
export type { QueuedPrompt, QueuePauseReason };

import {
  reconcileInterruptedRuns,
  shouldPauseAfterRecovery,
} from "@/lib/ai/chat/recovery";

/** Persisted key for the chat store. Referenced by the cross-tab convergence listener. */
const CHAT_STORAGE_KEY = "reglayer-chat";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  durationMs?: number;
  status: "running" | "completed" | "error";
}

export interface MessageLineage {
  traceId: string;
  model: string;
  provider: string;
  retrievalSources: string[];
  documentsRetrieved: number;
  toolsCalled: string[];
  guardrailsPassed: string[];
  guardrailsWarned: string[];
  cached: boolean;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** User feedback: 1 = helpful, -1 = not helpful, 0 = no feedback */
  feedback?: -1 | 0 | 1;
  /** True if user edited this message (fork point) */
  edited?: boolean;
  /** Tool calls made during this response */
  toolCalls?: ToolCall[];
  /** Lineage/provenance data for this response */
  lineage?: MessageLineage;
  /** Lifecycle of an assistant response. User messages do not carry this state. */
  status?: ChatResponseStatus;
}

export type EnqueueResult =
  | { ok: true; id: string }
  | { ok: false; reason: EnqueueRejection };

/**
 * Statuses after which a message's CONTENT is frozen.
 *
 * WHY: a late event from a superseded run must never mutate a finished answer. The
 * status machine already refuses illegal transitions, but content writes bypassed it
 * entirely, so a straggling chunk could append text to an answer the user had already
 * read and acted on.
 *
 * `interrupted` is deliberately absent — it is resumable, so it must stay writable.
 */
const CONTENT_FROZEN_STATUSES: ReadonlySet<ChatResponseStatus> = new Set([
  "completed",
  "cancelled",
  "failed",
]);

function isContentFrozen(status: ChatResponseStatus | undefined): boolean {
  return status !== undefined && CONTENT_FROZEN_STATUSES.has(status);
}

interface ChatState {
  messages: ChatMessage[];
  queuedPrompts: QueuedPrompt[];
  /**
   * Unsent composer text for the ACTIVE conversation.
   *
   * WHY IN THE STORE: the chat panel unmounts when closed, so a draft held in
   * component state is destroyed by closing the panel, navigating, or reloading.
   * Losing typed-but-unsent text is the most avoidable data loss in a chat UI.
   *
   * Scoped to the active conversation and cleared on switch, so a draft written
   * for one conversation can never reappear under another.
   */
  draft: string;
  isStreaming: boolean;
  /**
   * Identity of the single worker permitted to drain the queue, or null if free.
   *
   * WHY A LEASE AND NOT `isStreaming`: `isStreaming` goes false in the gap between one
   * run finishing and the next being dequeued. A user action landing in that gap
   * (Retry, Skip, or a fresh send) passed the `isStreaming` check and started a SECOND
   * drain loop, after which two loops raced to dequeue the same prompts. The lease is
   * held across the WHOLE loop, so that gap does not exist.
   *
   * Deliberately NOT persisted: a lease restored from a previous page load would be
   * owned by a worker that no longer exists and would deadlock the queue forever.
   */
  runnerToken: string | null;
  /** Non-null when the queue is stopped awaiting an explicit user decision. */
  queuePauseReason: QueuePauseReason | null;
  /** Rolling average run duration, used to estimate queue wait. Null until measured. */
  avgRunMs: number | null;
  /**
   * True when the persisted snapshot was trimmed to fit storage quota.
   *
   * A trimmed snapshot holds fewer messages than the server does, so it must never be
   * written back over the server record. Set by the storage adapter, consumed at
   * rehydration.
   */
  conversationTruncated: boolean;
  panelOpen: boolean;
  /** Server-side conversation ID. Null = new/unsaved conversation. */
  conversationId: string | null;
  /**
   * Version last confirmed by the server, sent with the next save.
   *
   * Null means "no version to compare", which the server treats as opting out of the
   * staleness check — correct for a first save, wrong to leave null afterwards.
   */
  conversationVersion: number | null;
  /** True when a background save is in progress */
  isSaving: boolean;

  // Actions
  addMessage: (role: "user" | "assistant", content: string, status?: ChatResponseStatus) => string;
  updateMessage: (id: string, content: string) => void;
  appendToMessage: (id: string, chunk: string) => void;
  transitionMessageStatus: (id: string, status: ChatResponseStatus) => void;
  enqueuePrompt: (content: string) => EnqueueResult;
  updateQueuedPrompt: (id: string, content: string) => void;
  removeQueuedPrompt: (id: string) => void;
  /** Discard every pending prompt. Does not affect the run in flight. */
  clearQueue: () => void;
  takeNextQueuedPrompt: () => QueuedPrompt | null;
  /** Claim exclusive right to drain the queue. False means another worker owns it. */
  tryAcquireRunner: (token: string) => boolean;
  /** Release the drain lease. Ignored unless `token` is the current owner. */
  releaseRunner: (token: string) => void;
  /**
   * Atomically release the lock, dequeue the next prompt, and re-acquire.
   * Returns null (and leaves the lock released) when nothing is pending.
   */
  handoffToNext: (token: string) => QueuedPrompt | null;
  pauseQueue: (reason: QueuePauseReason) => void;
  clearQueuePause: () => void;
  recordRunDuration: (ms: number) => void;
  setDraft: (value: string) => void;
  setStreaming: (streaming: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  clearMessages: () => void;
  /** Set feedback on a message (+1 helpful, -1 not helpful) */
  setFeedback: (id: string, feedback: -1 | 0 | 1) => void;
  /** Delete messages from the given ID onwards (for edit/regenerate) */
  truncateFrom: (id: string) => void;
  /** Edit a user message — truncates everything after it */
  editMessage: (id: string, newContent: string) => void;
  /** Server sync actions */
  setConversationId: (id: string | null) => void;
  setConversationVersion: (version: number | null) => void;
  setIsSaving: (saving: boolean) => void;
  /** Load a conversation from server (replaces current messages) */
  loadConversation: (id: string, messages: ChatMessage[]) => void;
  /** Start a new conversation (clear state + null conversationId) */
  newConversation: () => void;
  /** Add or update a tool call on a message */
  addToolCall: (messageId: string, toolCall: ToolCall) => void;
  /** Update a tool call status/result */
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
  /** Set lineage data on a message */
  setLineage: (messageId: string, lineage: MessageLineage) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

let messageCounter = 0;
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageCounter}`;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      queuedPrompts: [],
      runnerToken: null,
      queuePauseReason: null,
      avgRunMs: null,
      conversationTruncated: false,
      draft: "",
      isStreaming: false,
      panelOpen: false,
      conversationId: null,
      conversationVersion: null,
      isSaving: false,

      addMessage: (role, content, status) => {
        const id = generateMessageId();
        set((state) => ({
          messages: [...state.messages, {
            id,
            role,
            content,
            timestamp: Date.now(),
            ...(role === "assistant" && status ? { status } : {}),
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
            msg.id === id && !isContentFrozen(msg.status)
              ? { ...msg, content: msg.content + chunk }
              : msg,
          ),
        })),

      transitionMessageStatus: (id, status) =>
        set((state) => ({
          messages: state.messages.map((msg) => {
            if (msg.id !== id || msg.role !== "assistant") return msg;
            if (!msg.status || canTransitionChatResponse(msg.status, status)) {
              return { ...msg, status };
            }
            return msg;
          }),
        })),

      enqueuePrompt: (content) => {
        // The prompt currently being answered is not in the queue, so it must be passed
        // explicitly for duplicate detection to catch the common double submit.
        const state = get();
        const activePrompt = state.isStreaming
          ? [...state.messages].reverse().find((m) => m.role === "user")?.content ?? null
          : null;

        const decision = decideEnqueue(content, state.queuedPrompts, activePrompt);
        if (!decision.ok) return { ok: false, reason: decision.reason };

        const id = generateMessageId().replace("msg_", "queue_");
        let accepted = false;
        set((current) => {
          // Re-check under the same synchronous update that performs the write, so two
          // callers in the same tick cannot both pass admission control.
          const recheck = decideEnqueue(decision.content, current.queuedPrompts, activePrompt);
          if (!recheck.ok) return {};
          accepted = true;
          return {
            queuedPrompts: [...current.queuedPrompts, {
              id,
              content: decision.content,
              createdAt: Date.now(),
            }],
          };
        });
        return accepted ? { ok: true, id } : { ok: false, reason: "duplicate" };
      },

      updateQueuedPrompt: (id, content) => {
        const normalized = content.trim();
        if (!normalized) return;
        set((state) => ({
          // Editing into an exact duplicate of another pending prompt is rejected for
          // the same reason enqueueing one is.
          queuedPrompts: state.queuedPrompts.some(
            (p) => p.id !== id && p.content === normalized,
          )
            ? state.queuedPrompts
            : state.queuedPrompts.map((prompt) =>
                prompt.id === id ? { ...prompt, content: normalized } : prompt,
              ),
        }));
      },

      removeQueuedPrompt: (id) =>
        set((state) => ({
          queuedPrompts: state.queuedPrompts.filter((prompt) => prompt.id !== id),
        })),

      clearQueue: () =>
        // Clearing the backlog also lifts a pause: there is nothing left to decide about.
        set({ queuedPrompts: [], queuePauseReason: null }),

      takeNextQueuedPrompt: () => {
        let next: QueuedPrompt | null = null;
        set((state) => {
          next = state.queuedPrompts[0] ?? null;
          return next ? { queuedPrompts: state.queuedPrompts.slice(1) } : {};
        });
        return next;
      },

      tryAcquireRunner: (token) => {
        let acquired = false;
        // Zustand's updater runs synchronously, so this compare-and-set cannot be
        // interleaved by another caller — it is a genuine mutex in a single-threaded
        // runtime, not merely a check followed by a write.
        set((state) => {
          if (state.runnerToken !== null) return {};
          acquired = true;
          return { runnerToken: token };
        });
        return acquired;
      },

      releaseRunner: (token) =>
        set((state) =>
          // Guarded so a late release from a superseded worker cannot free a lease that
          // now belongs to someone else.
          state.runnerToken === token ? { runnerToken: null } : {},
        ),

      handoffToNext: (token) => {
        let next: QueuedPrompt | null = null;
        set((state) => {
          // Only the owner may hand off. A non-owner reaching here means a second
          // worker exists, and it must not be allowed to dequeue.
          if (state.runnerToken !== token) return {};

          const [head, ...rest] = state.queuedPrompts;
          // Queue drained: release and go idle.
          if (!head) return { runnerToken: null };

          next = head;
          // The prompt moves OUT of the queue and INTO the transcript in one update.
          // As two separate writes there was a window where a crash left the prompt in
          // neither place, losing it silently — the one outcome a queue must never have.
          return {
            queuedPrompts: rest,
            messages: [...state.messages, {
              id: generateMessageId(),
              role: "user" as const,
              content: head.content,
              timestamp: Date.now(),
            }].slice(-100), // Must match addMessage — this path bypassed the cap.
            // The lock is released and re-acquired within this SINGLE synchronous
            // update. A literal release-then-acquire across two statements would expose
            // a window in which another worker could claim the queue and dequeue
            // concurrently; because no code can observe the intermediate state, this is
            // equivalent to that ordering without the race.
            runnerToken: token,
          };
        });
        return next;
      },

      pauseQueue: (reason) => set({ queuePauseReason: reason }),

      clearQueuePause: () => set({ queuePauseReason: null }),

      recordRunDuration: (ms) =>
        set((state) => ({ avgRunMs: foldRunDuration(state.avgRunMs, ms) })),

      setDraft: (value) => set({ draft: value }),

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      setPanelOpen: (open) => set({ panelOpen: open }),

      clearMessages: () => set({ messages: [], queuedPrompts: [], queuePauseReason: null, draft: "", isStreaming: false, conversationId: null }),

      setFeedback: (id, feedback) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, feedback } : msg,
          ),
        })),

      truncateFrom: (id) =>
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === id);
          if (idx === -1) return state;
          return { messages: state.messages.slice(0, idx) };
        }),

      editMessage: (id, newContent) =>
        set((state) => {
          const idx = state.messages.findIndex((m) => m.id === id);
          if (idx === -1) return state;
          // Keep messages up to and including the edited one, truncate the rest
          const updated = state.messages.slice(0, idx + 1);
          updated[idx] = { ...updated[idx], content: newContent, edited: true };
          return { messages: updated };
        }),

      setConversationId: (id) => set({ conversationId: id }),

      setConversationVersion: (version) => set({ conversationVersion: version }),
      setIsSaving: (saving) => set({ isSaving: saving }),

      loadConversation: (id, messages) =>
        set({ conversationId: id, messages, queuedPrompts: [], queuePauseReason: null, draft: "", isStreaming: false }),

      newConversation: () =>
        set({ conversationId: null, conversationVersion: null, messages: [], queuedPrompts: [], queuePauseReason: null, draft: "", isStreaming: false }),

      addToolCall: (messageId, toolCall) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId
              ? { ...msg, toolCalls: [...(msg.toolCalls ?? []), toolCall] }
              : msg,
          ),
        })),

      updateToolCall: (messageId, toolCallId, updates) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId
              ? {
                  ...msg,
                  toolCalls: (msg.toolCalls ?? []).map((tc) =>
                    tc.id === toolCallId ? { ...tc, ...updates } : tc,
                  ),
                }
              : msg,
          ),
        })),

      setLineage: (messageId, lineage) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId ? { ...msg, lineage } : msg,
          ),
        })),
    }),
    {
      name: CHAT_STORAGE_KEY,
      partialize: (state) => ({
        messages: state.messages,
        queuedPrompts: state.queuedPrompts,
        draft: state.draft,
        conversationId: state.conversationId,
        conversationVersion: state.conversationVersion,
        // Pause survives reload on purpose: a reload must not be a way to silently
        // resume a queue the user was asked to make a decision about.
        queuePauseReason: state.queuePauseReason,
        // Kept so the first wait estimate after a reload is informed rather than absent.
        avgRunMs: state.avgRunMs,
        conversationTruncated: state.conversationTruncated,
        // `runnerToken` is intentionally omitted — see its declaration.
      }),
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // QuotaExceededError — keep the most recent messages so the session is
            // still usable, but MARK the snapshot as incomplete.
            //
            // WHY THE MARK MATTERS: the server save is a delete-all-and-recreate keyed
            // on conversationId. Without it, a reload from a trimmed snapshot sent 20
            // messages over a 100-message server record and permanently destroyed 80 —
            // a client-side cache eviction silently deleting the source of truth.
            try {
              const trimmed = {
                ...value,
                state: {
                  ...value.state,
                  messages: value.state.messages.slice(-20),
                  conversationTruncated: true,
                },
              };
              localStorage.setItem(name, JSON.stringify(trimmed));
            } catch {
              // Storage completely full — skip persistence
            }
          }
        },
        removeItem: (name) => { localStorage.removeItem(name); },
      },

      /**
       * Reconcile a session that was interrupted by refresh, crash, sleep, or close.
       *
       * No worker survives a page load, so any run still marked live in storage is
       * orphaned by definition. Left alone it renders a spinner that never stops and
       * that Retry explicitly refuses to act on.
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const { messages, recoveredCount } = reconcileInterruptedRuns(state.messages);
        state.messages = messages;

        // Belt and braces: neither is persisted, but a rehydrated session must never
        // begin life believing a run or a lock is still active.
        state.isStreaming = false;
        state.runnerToken = null;

        // A trimmed snapshot holds strictly less than the server does. Detaching the
        // conversation id makes this a NEW local conversation, so the next save cannot
        // delete-and-recreate over the fuller server record. The visible history is
        // shorter for this session; the durable copy survives intact, which is the only
        // trade that preserves the user's data.
        if (state.conversationTruncated) {
          state.conversationId = null;
          state.conversationTruncated = false;
        }

        if (shouldPauseAfterRecovery(recoveredCount, state.queuedPrompts.length)) {
          state.queuePauseReason = "interrupted";
        }
      },
    },
  ),
);

/**
 * Converge an IDLE tab when another tab writes newer state.
 *
 * WHY: `persist` writes to localStorage but never reads it again after load, so a
 * duplicated or long-open tab holds a stale snapshot and will overwrite newer work the
 * moment it saves. The `storage` event fires only in OTHER tabs, which is exactly the
 * signal needed.
 *
 * This is convergence, not mutual exclusion — it does not make concurrent generation
 * safe, and a tab that is mid-run is deliberately left alone rather than having the
 * conversation replaced underneath a live stream.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== CHAT_STORAGE_KEY) return;

    const state = useChatStore.getState();
    if (state.runnerToken !== null || state.isStreaming) return;

    void useChatStore.persist.rehydrate();
  });
}
