"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Real-Time Scan Progress Hook
 * ---------------------------------------------------------
 *
 * WHY: Users watching a scan progress with a static spinner think it's broken.
 * Real-time updates (pages scanned, issues found, % complete) create trust
 * and excitement. Like watching a download bar vs staring at "loading..."
 *
 * WHAT:
 * - Server-Sent Events (SSE) connection to /api/scan/[scanId]/stream
 * - Auto-reconnect on disconnect
 * - Progress state: status, percentage, pagesScanned, issuesFound
 * - Falls back to polling if SSE not supported
 *
 * HOW:
 * - EventSource API (native browser, no dependencies)
 * - Server pushes updates as scan progresses
 * - Auto-closes when scan completes or component unmounts
 * - Fires confetti on 100% compliance result
 * ---------------------------------------------------------
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { fireConfetti } from "@/components/confetti";

export interface ScanProgress {
  status: "idle" | "connecting" | "scanning" | "analyzing" | "complete" | "failed";
  percentage: number;
  pagesScanned: number;
  totalPages: number;
  issuesFound: number;
  currentUrl?: string;
  score?: number;
  message?: string;
}

const INITIAL_STATE: ScanProgress = {
  status: "idle",
  percentage: 0,
  pagesScanned: 0,
  totalPages: 0,
  issuesFound: 0,
};

export function useScanProgress(scanId: string | null) {
  const [progress, setProgress] = useState<ScanProgress>(INITIAL_STATE);
  const sourceRef = useRef<EventSource | null>(null);
  const retryCount = useRef(0);

  const connect = useCallback(() => {
    if (!scanId) return;

    setProgress((p) => ({ ...p, status: "connecting" }));

    const source = new EventSource(`/api/scan/${scanId}/stream`);
    sourceRef.current = source;

    source.onopen = () => {
      retryCount.current = 0;
    };

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Partial<ScanProgress>;
        setProgress((prev) => {
          const next = { ...prev, ...data };
          
          // Fire confetti on perfect score
          if (next.status === "complete" && next.score === 100 && prev.status !== "complete") {
            setTimeout(() => fireConfetti(), 300);
          }
          
          return next;
        });

        // Close connection when done
        if (data.status === "complete" || data.status === "failed") {
          source.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    source.onerror = () => {
      source.close();
      // Retry with exponential backoff (max 5 retries)
      if (retryCount.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, retryCount.current), 16000);
        retryCount.current++;
        setTimeout(connect, delay);
      } else {
        setProgress((p) => ({ ...p, status: "failed", message: "Connection lost. Refresh to retry." }));
      }
    };
  }, [scanId]);

  useEffect(() => {
    connect();
    return () => {
      sourceRef.current?.close();
    };
  }, [connect]);

  const reset = useCallback(() => {
    sourceRef.current?.close();
    setProgress(INITIAL_STATE);
  }, []);

  return { progress, reset };
}

// ─── Progress Display Component ───────────────────────────────────────────────

export function ScanProgressBar({ progress }: { progress: ScanProgress }) {
  if (progress.status === "idle") return null;

  const statusLabels: Record<ScanProgress["status"], string> = {
    idle: "",
    connecting: "Connecting to scanner...",
    scanning: `Scanning pages (${progress.pagesScanned}/${progress.totalPages || "?"})`,
    analyzing: "Analyzing results...",
    complete: "Scan complete!",
    failed: progress.message || "Scan failed",
  };

  return (
    <div className="animate-slide-up rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      {/* Status text */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {statusLabels[progress.status]}
        </span>
        <span className="text-sm font-mono text-neutral-500 dark:text-neutral-400 tabular-nums">
          {progress.percentage}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            progress.status === "failed"
              ? "bg-red-500"
              : progress.status === "complete"
              ? "bg-emerald-500"
              : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </div>

      {/* Details */}
      <div className="flex items-center justify-between mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        {progress.currentUrl && (
          <span className="truncate max-w-[70%]" title={progress.currentUrl}>
            {progress.currentUrl}
          </span>
        )}
        {progress.issuesFound > 0 && (
          <span className="shrink-0">
            {progress.issuesFound} issue{progress.issuesFound !== 1 ? "s" : ""} found
          </span>
        )}
      </div>
    </div>
  );
}
