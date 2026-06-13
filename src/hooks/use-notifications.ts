"use client";

/**
 * RegLayer — useNotifications hook
 *
 * Fetches the read-only notification feed (/api/notifications/feed) on a 60s
 * interval and derives an unread count by comparing each item's createdAt to a
 * client-side `lastSeenAt` timestamp persisted in localStorage. Marking all
 * seen is a purely local operation — no DB write.
 */

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import type { NotificationItem } from "@/app/api/notifications/feed/route";

const SEEN_KEY = "reglayer-notifications-seen";

function readSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(SEEN_KEY);
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function useNotifications() {
  const { data: session, status } = useSession();
  const [seenAt, setSeenAt] = useState<number>(() => readSeenAt());

  const query = useQuery<{ items: NotificationItem[] }>({
    queryKey: ["notifications-feed"],
    queryFn: async () => {
      const res = await fetch("/api/notifications/feed");
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: status === "authenticated" && !!session?.user,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const items = query.data?.items ?? [];
  const unreadCount = items.filter((i) => Date.parse(i.createdAt) > seenAt).length;

  const markAllSeen = useCallback(() => {
    const now = new Date().toISOString();
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SEEN_KEY, now);
    }
    setSeenAt(Date.parse(now));
  }, []);

  const isUnread = useCallback(
    (item: NotificationItem) => Date.parse(item.createdAt) > seenAt,
    [seenAt]
  );

  return {
    items,
    unreadCount,
    loading: query.isLoading,
    markAllSeen,
    isUnread,
  };
}
