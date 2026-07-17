"use client";

/**
 * Multi-tab synchronization via BroadcastChannel API.
 *
 * WHY (DEF-075): User switches workspace in Tab B; Tab A still shows old
 *      workspace context. Actions in Tab A affect wrong workspace.
 * WHAT: Syncs workspace context, auth state, and chat panel across tabs.
 * HOW: BroadcastChannel sends events; all tabs listen and update state.
 */

import { useEffect, useCallback, useRef } from "react";

type SyncEvent =
  | { type: "workspace_changed"; workspaceId: string }
  | { type: "session_expired" }
  | { type: "chat_cleared" }
  | { type: "theme_changed"; theme: string }
  | { type: "scan_completed"; scanId: string; url: string; score: number };

const CHANNEL_NAME = "reglayer-sync";

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (!("BroadcastChannel" in window)) return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/**
 * Broadcast a sync event to all other tabs.
 */
export function broadcastEvent(event: SyncEvent): void {
  getChannel()?.postMessage(event);
}

/**
 * Hook to listen for cross-tab sync events.
 */
export function useTabSync(onEvent: (event: SyncEvent) => void): void {
  const callbackRef = useRef(onEvent);
  useEffect(() => { callbackRef.current = onEvent; });

  useEffect(() => {
    const ch = getChannel();
    if (!ch) return;

    function handler(e: MessageEvent<SyncEvent>) {
      callbackRef.current(e.data);
    }

    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  }, []);
}

/**
 * Hook that integrates tab sync with common app actions.
 * Listens for events and triggers appropriate state updates.
 */
export function useAppTabSync(handlers: {
  onWorkspaceChanged?: (workspaceId: string) => void;
  onSessionExpired?: () => void;
  onScanCompleted?: (scanId: string, url: string, score: number) => void;
}): { broadcastEvent: typeof broadcastEvent } {
  const handlersRef = useRef(handlers);
  useEffect(() => { handlersRef.current = handlers; });

  const handleEvent = useCallback((event: SyncEvent) => {
    switch (event.type) {
      case "workspace_changed":
        handlersRef.current.onWorkspaceChanged?.(event.workspaceId);
        break;
      case "session_expired":
        handlersRef.current.onSessionExpired?.();
        break;
      case "scan_completed":
        handlersRef.current.onScanCompleted?.(event.scanId, event.url, event.score);
        break;
    }
  }, []);

  useTabSync(handleEvent);

  return { broadcastEvent };
}
