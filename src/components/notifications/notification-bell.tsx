"use client";

/**
 * RegLayer — Notification Bell
 *
 * WHY: Users need to see in-app notifications without navigating away.
 * WHAT: Bell icon with unread badge, dropdown panel with notification list, mark-as-read.
 * HOW: Polls /api/notifications/inbox, renders dropdown with full keyboard/aria support.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function formatRelativeTime(iso: string, now: number) {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/inbox");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // Silent failure — non-critical UI
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetch("/api/notifications/inbox").catch(() => null);
      if (cancelled || !res?.ok) return;
      const data = await res.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    };
    load();
    const interval = setInterval(() => {
      fetchNotifications();
      setNow(Date.now());
    }, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  const markAsRead = async (ids: string[]) => {
    try {
      await fetch("/api/notifications/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationIds: ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - ids.length));
    } catch {
      // Silent failure
    }
  };

  const markAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length > 0) markAsRead(unreadIds);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="relative rounded-md p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg"
        >
          {/* Header */}
          <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Notifications</h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No notifications yet
            </div>
          ) : (
            <ul role="list" className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {notifications.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.link ?? "#"}
                    onClick={() => {
                      if (!n.readAt) markAsRead([n.id]);
                    }}
                    className={`block px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                      !n.readAt ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {!n.readAt && (
                        <span
                          aria-label="Unread"
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500"
                        />
                      )}
                      <div className={`flex-1 min-w-0 ${n.readAt ? "ml-4" : ""}`}>
                        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                          {n.title}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-0.5">
                          {n.body}
                        </p>
                        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                          {formatRelativeTime(n.createdAt, now)}
                        </p>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
