"use client";

/**
 * RegLayer — Notifications Page
 *
 * WHY: Users need to manage notification preferences.
 * WHAT: Redirects to the alerts tab in settings (where notification preferences live).
 * HOW: Client redirect via router.replace.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=alerts");
  }, [router]);
  return null;
}
