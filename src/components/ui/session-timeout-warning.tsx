"use client";

/**
 * Session timeout warning — notifies user before JWT expires.
 *
 * WHY (DEF-107): Users working on long forms lose data when the session
 *   expires silently and the next save redirects to login.
 * WHAT: Shows a warning banner 5 minutes before session expiry.
 * HOW: Reads session.expires from NextAuth, sets a timer, and shows
 *   a banner with a "Refresh session" button.
 */

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Clock } from "lucide-react";

const WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry

export function SessionTimeoutWarning() {
  const { data: session, update } = useSession();
  const [showWarning, setShowWarning] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(0);

  useEffect(() => {
    if (!session?.expires) return;

    const expiresAt = new Date(session.expires).getTime();

    function checkExpiry() {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // Already expired — NextAuth will handle redirect
        setShowWarning(false);
        return;
      }
      if (remaining <= WARNING_THRESHOLD_MS) {
        setShowWarning(true);
        setMinutesLeft(Math.max(1, Math.ceil(remaining / 60000)));
      } else {
        setShowWarning(false);
      }
    }

    checkExpiry();
    const interval = setInterval(checkExpiry, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, [session?.expires]);

  const handleRefresh = useCallback(async () => {
    await update(); // Triggers NextAuth session refresh
    setShowWarning(false);
  }, [update]);

  if (!showWarning) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-b border-blue-200 dark:border-blue-800"
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Your session expires in {minutesLeft} minute{minutesLeft !== 1 ? "s" : ""}.
        </span>
      </div>
      <button
        onClick={handleRefresh}
        className="shrink-0 rounded-md px-3 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/50 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
      >
        Extend session
      </button>
    </div>
  );
}
