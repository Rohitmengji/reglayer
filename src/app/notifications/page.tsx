"use client";

/**
 * RegLayer — Notifications Page
 *
 * WHY: Users need to manage notification preferences and view history.
 * WHAT: Notification settings (email, in-app) and historical notification list.
 * HOW: Redirects to /manage?tab=notifications (consolidated management page).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NotificationsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=notifications");
  }, [router]);
  return null;
}
