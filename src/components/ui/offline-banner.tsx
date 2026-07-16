"use client";

/**
 * Offline detection banner — shows when the user loses network connectivity.
 *
 * WHY (DEF-082): Users get no indication when network drops. They wait
 *   indefinitely for operations that will never complete.
 * WHAT: Listens to online/offline events, shows a dismissible banner.
 * HOW: Uses navigator.onLine + event listeners. Banner appears at top
 *   of main content area with reconnection indicator.
 */

import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Check initial state
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOffline(true);
    }

    function handleOffline() {
      setIsOffline(true);
      setWasOffline(true);
    }

    function handleOnline() {
      setIsOffline(false);
      // Show "reconnected" briefly
      if (wasOffline) {
        setTimeout(() => setWasOffline(false), 3000);
      }
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [wasOffline]);

  if (!isOffline && !wasOffline) return null;

  if (!isOffline && wasOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 px-4 py-2 text-sm bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-b border-green-200 dark:border-green-800"
      >
        <Wifi className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Back online — your connection has been restored.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800"
    >
      <WifiOff className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
      <span>You&apos;re offline — changes won&apos;t sync until your connection is restored.</span>
    </div>
  );
}
