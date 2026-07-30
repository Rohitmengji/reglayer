/**
 * RegLayer — Chat Persistence Hook
 *
 * WHY: Chat conversations must survive device switches, browser clears, and
 *      session restarts. The store uses localStorage for instant in-session
 *      persistence; this hook adds server-side durability.
 *
 * HOW:
 * - Debounced auto-save: after streaming completes or on message changes,
 *   syncs the full conversation to /api/ai/conversations.
 * - On first save (no conversationId), creates a new server record.
 * - On subsequent saves, updates the existing record.
 * - On panel open: fetches conversation list for the dropdown.
 * - On conversation switch: loads messages from server.
 */

"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useChatStore } from "@/stores/chatStore";
import {
  persistConversation,
  resetPersistenceFingerprint,
} from "@/lib/ai/chat/persistence";

interface ConversationSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: string;
}

export function useChatSync() {
  const {
    messages,
    isStreaming,
    isSaving,
    setConversationId,
    setIsSaving,
    loadConversation,
    newConversation,
  } = useChatStore();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);

  /** Fetch conversation list from server. Only shows loading on first fetch. */
  const fetchConversations = useCallback(async (searchQuery?: string) => {
    // Only show the loading spinner on the very first fetch.
    // Subsequent refreshes happen silently in the background.
    if (!hasFetchedRef.current) setLoadingList(true);
    try {
      const url = searchQuery
        ? `/api/ai/conversations?q=${encodeURIComponent(searchQuery)}`
        : "/api/ai/conversations";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations ?? []);
        hasFetchedRef.current = true;
      }
    } catch { /* silent — list is non-critical */ }
    finally { setLoadingList(false); }
  }, []);

  /**
   * Background save for changes the completion sequence does not cover — feedback
   * ratings, edits, and any state left behind when a drain ends.
   *
   * The completed-run path does NOT rely on this: it persists synchronously as an
   * ordered step before the next prompt starts. Both paths share a fingerprint inside
   * `persistConversation`, so whichever runs second becomes a no-op instead of issuing
   * a duplicate write to a delete-and-recreate endpoint.
   */
  const saveToServer = useCallback(async () => {
    const state = useChatStore.getState();
    if (state.messages.length === 0 || state.isStreaming) return;

    setIsSaving(true);
    try {
      const result = await persistConversation({
        conversationId: state.conversationId,
        messages: state.messages,
      });
      if (result.ok && !result.skipped) {
        // Adopt the id whenever it differs — not only on the first save. A save that
        // recovered from a stale-id 404 comes back with a freshly created id, and
        // keeping the old one would 404-loop into a new conversation on every save.
        if (result.conversationId && result.conversationId !== state.conversationId) {
          setConversationId(result.conversationId);
        }
        // Silently refresh the conversation list so the sidebar stays current
        fetchConversations();
      }
    } catch { /* silent — will retry on next trigger */ }
    finally { setIsSaving(false); }
  }, [setConversationId, setIsSaving, fetchConversations]);

  // Auto-save: debounce 3s after streaming completes or message changes.
  // Also saves immediately on page unload (beforeunload) as a safety net.
  useEffect(() => {
    if (isStreaming || messages.length === 0) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveToServer, 3000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [messages, isStreaming, saveToServer]);

  // Save immediately when user is about to leave (tab close, navigate away)
  useEffect(() => {
    const handleUnload = () => {
      const state = useChatStore.getState();
      if (state.messages.length === 0) return;
      // Use fetch with keepalive: true — more reliable than sendBeacon because
      // it sends proper Content-Type headers and the server can parse JSON.
      // keepalive: true allows the request to outlive the page, same as sendBeacon.
      fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.conversationId || undefined,
          messages: state.messages.map((m) => ({
            id: m.id, role: m.role, content: m.content, feedback: m.feedback ?? 0,
          })),
        }),
        keepalive: true,
      }).catch(() => {}); // fire-and-forget
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  /** Switch to an existing conversation (load from server). */
  const switchConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          loadConversation(id, data.messages.map((m: { id: string; role: string; content: string; feedback?: number }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            timestamp: Date.now(),
            feedback: (m.feedback ?? 0) as -1 | 0 | 1,
            ...(m.role === "assistant" ? { status: "completed" as const } : {}),
          })));
          resetPersistenceFingerprint();
        }
      }
    } catch { /* silent */ }
  }, [loadConversation]);

  /** Start a fresh conversation. */
  const startNew = useCallback(() => {
    newConversation();
    resetPersistenceFingerprint();
  }, [newConversation]);

  /** Delete a conversation (soft-delete on server). */
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If we deleted the active conversation, start fresh
      if (useChatStore.getState().conversationId === id) {
        newConversation();
        resetPersistenceFingerprint();
      }
    } catch { /* silent */ }
  }, [newConversation]);

  return {
    conversations,
    loadingList,
    isSaving,
    fetchConversations,
    switchConversation,
    startNew,
    deleteConversation,
  };
}
