"use client";

import { useCallback } from "react";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem("rl_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("rl_sid", id);
  }
  return id;
}

type ConversionEvent =
  | "demo_scan"
  | "demo_scan_result"
  | "signup_started"
  | "signup_completed"
  | "signup_google"
  | "first_scan"
  | "plan_upgraded";

export function useConversionTracker() {
  const track = useCallback((event: ConversionEvent, metadata?: Record<string, unknown>) => {
    const sessionId = getSessionId();
    if (!sessionId) return;

    // Fire-and-forget, never block UI
    fetch("/api/conversion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, sessionId, metadata }),
    }).catch(() => {});
  }, []);

  return { track };
}
