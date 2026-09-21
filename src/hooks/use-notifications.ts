"use client";

/**
 * RegLayer — useNotifications hook
 *
 * Fetches the read-only notification feed (/api/notifications/feed) on a 60s
 * interval. Explicit read IDs are stored per account/workspace in this browser.
 * Read changes do not write to the application database.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { NotificationItem } from "@/app/api/notifications/feed/route";

const READ_EVENT = "reglayer:notifications-read";
const memory = new Map<string, string>();
function readState(key: string): string | null {
  if (!key || typeof window === "undefined") return null;
  if (memory.has(key)) return memory.get(key)!;
  try { return localStorage.getItem(key); } catch { return null; }
}
function readIds(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(READ_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(READ_EVENT, listener);
  };
}

export function useNotifications() {
  const { data: session, status } = useSession();
  const [storageError, setStorageError] = useState(false);

  const query = useQuery<{ items: NotificationItem[]; scope: string }>({
    queryKey: ["notifications-feed", session?.user?.email],
    queryFn: async ({ signal }) => {
      const res = await fetch("/api/notifications/feed", { cache: "no-store", signal });
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: status === "authenticated" && !!session?.user,
    retry: false,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const key = status === "authenticated" && query.data?.scope
    ? `reglayer-notifications-read:v2:${encodeURIComponent(session?.user?.email ?? "")}:${encodeURIComponent(query.data.scope)}` : "";
  const snapshot = useSyncExternalStore(subscribe, useCallback(() => readState(key), [key]), () => null);
  const seen = new Set(readIds(snapshot));
  const items = status === "authenticated" ? query.data?.items ?? [] : [];
  const isUnread = (item: NotificationItem) => !seen.has(item.id);
  const unreadCount = items.filter(isUnread).length;

  function markSeen(ids: string[]) {
    if (!key || ids.length === 0) return;
    const merged = [...new Set([...readIds(readState(key)), ...ids])].slice(-1000);
    const value = JSON.stringify(merged);
    try {
      localStorage.setItem(key, value);
      memory.delete(key);
      setStorageError(false);
    } catch {
      memory.set(key, value);
      setStorageError(true);
    }
    window.dispatchEvent(new Event(READ_EVENT));
  }

  return {
    items,
    unreadCount,
    loading: query.isLoading,
    refreshing: query.isFetching,
    error: query.isError,
    storageError,
    refresh: query.refetch,
    markAllSeen: () => markSeen(items.map(item => item.id)),
    markSeen: (item: NotificationItem) => markSeen([item.id]),
    isUnread,
  };
}
