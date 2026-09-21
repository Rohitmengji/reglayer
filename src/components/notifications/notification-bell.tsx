"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Notification bell
 * ---------------------------------------------------------
 *
 * WHY: Give returning users an at-a-glance "what happened" surface without
 * leaving the page they're on.
 *
 * WHAT: A bell button with an unread badge that opens a dropdown of recent
 * scans / critical issues / workspace activity (read-only, from
 * /api/notifications/feed). Read state changes only through explicit actions.
 *
 * HOW: Reuses the sidebar's outside-click + upward dropdown pattern. Relative
 * timestamps use Intl.RelativeTimeFormat in the active locale.
 * ---------------------------------------------------------
 */

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Scan, AlertTriangle, Activity, CheckCheck, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/components/i18n-provider";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationItem } from "@/app/api/notifications/feed/route";

const TYPE_ICON: Record<NotificationItem["type"], React.ComponentType<{ className?: string }>> = {
  scan: Scan,
  violation: AlertTriangle,
  activity: Activity,
};

const SEVERITY_STYLE: Record<NotificationItem["severity"], string> = {
  info: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function relativeTime(iso: string, locale: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const divisions: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
    { amount: 60, unit: "second" },
    { amount: 60, unit: "minute" },
    { amount: 24, unit: "hour" },
    { amount: 7, unit: "day" },
    { amount: 4.34524, unit: "week" },
    { amount: 12, unit: "month" },
    { amount: Number.POSITIVE_INFINITY, unit: "year" },
  ];
  let value = diffSec;
  for (const division of divisions) {
    if (Math.abs(value) < division.amount) {
      return rtf.format(Math.round(value), division.unit);
    }
    value /= division.amount;
  }
  return "";
}

export function NotificationBell() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { items, unreadCount, markAllSeen, markSeen, isUnread, loading, error, refreshing, refresh, storageError } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close on outside click (mirrors the sidebar workspace switcher).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="relative" ref={ref} role="presentation" onKeyDownCapture={event => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }}>
      <button
        ref={trigger}
        onClick={toggle}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label={`${t("notifications.title")}${unreadCount ? ` (${unreadCount})` : ""}`}
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
      >
        {/* Icon sized + anchored like the other menu-row icons (h-3.5) so the bell
            and label line up with Help / Sign out; the badge hangs off the icon. */}
        <span className="relative flex shrink-0">
          <Bell className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
              aria-hidden
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 text-left">
          {t("notifications.title")}
        </span>
      </button>

      {open && (
        <section id={panelId} aria-label={t("notifications.title")} className="absolute bottom-full left-0 right-0 mb-1 flex max-h-[min(60dvh,28rem)] flex-col overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg z-50">
          <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800 p-3">
            <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">
              {t("notifications.title")}
            </p>
            <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label={t("common.retry")} title={t("common.retry")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
            </div>
            <button type="button" onClick={markAllSeen} disabled={loading || error || unreadCount === 0} className="flex min-h-9 w-full items-center gap-2 rounded px-1 text-left text-xs font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50">
              <CheckCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              {t("notifications.markAllRead")}
            </button>
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400" role="status">{!loading && !error && unreadCount === 0 && items.length > 0 ? t("notifications.allRead") : ""}</p>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain">
          {error && <p role="alert" className="px-3 py-3 text-xs text-red-700 dark:text-red-400">{t("notifications.loadError")}</p>}
          {storageError && <p role="status" className="px-3 py-2 text-xs text-amber-800 dark:text-amber-300">{t("notifications.storageError")}</p>}
          {loading ? <p role="status" className="px-4 py-6 text-sm text-neutral-600 dark:text-neutral-300">{t("common.loading")}</p> : !error && items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("notifications.empty")}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                {t("notifications.emptyHint")}
              </p>
            </div>
          ) : (
            items.map((item) => {
              const Icon = TYPE_ICON[item.type];
              const unread = isUnread(item);
              return (
                <button
                  key={item.id}
                  onClick={() => { markSeen(item); go(item.href); }}
                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                      SEVERITY_STYLE[item.severity]
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                        {item.title}
                      </span>
                      {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-label={t("notifications.unread")} role="img" />}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {item.body}
                    </span>
                    <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">
                      {relativeTime(item.createdAt, locale)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
          </div>
          <button type="button" onClick={() => go("/audit-log")} className="min-h-10 shrink-0 border-t border-neutral-100 px-3 py-2 text-left text-xs font-medium text-neutral-700 dark:border-neutral-800 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800">{t("notifications.viewActivity")}</button>
        </section>
      )}
    </div>
  );
}
