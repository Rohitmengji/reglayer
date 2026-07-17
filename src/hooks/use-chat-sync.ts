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

interface ConversationSummary {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: string;
}

export function useChatSync() {
  const {
    messages,
    conversationId,
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
  const lastSavedRef = useRef<string>("");
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

  /** Save current conversation to server (debounced). */
  const saveToServer = useCallback(async () => {
    const state = useChatStore.getState();
    if (state.messages.length === 0 || state.isStreaming) return;

    // Skip if nothing changed since last save
    const fingerprint = JSON.stringify(state.messages.map((m) => m.id + m.content.length + (m.feedback ?? 0)));
    if (fingerprint === lastSavedRef.current) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: state.conversationId || undefined,
          messages: state.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            feedback: m.feedback ?? 0,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id && !state.conversationId) {
          setConversationId(data.id);
        }
        lastSavedRef.current = fingerprint;
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
          })));
          lastSavedRef.current = ""; // reset fingerprint
        }
      }
    } catch { /* silent */ }
  }, [loadConversation]);

  /** Start a fresh conversation. */
  const startNew = useCallback(() => {
    newConversation();
    lastSavedRef.current = "";
  }, [newConversation]);

  /** Delete a conversation (soft-delete on server). */
  const deleteConversation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/ai/conversations?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If we deleted the active conversation, start fresh
      if (useChatStore.getState().conversationId === id) {
        newConversation();
        lastSavedRef.current = "";
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
