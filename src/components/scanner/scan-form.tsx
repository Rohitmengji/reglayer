"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Scan Form Component
 * ---------------------------------------------------------
 *
 * WHY: The primary user action is scanning a URL. This form
 * handles the entire scan UX: input, validation, progress, results.
 *
 * WHAT:
 * - URL input field with validation
 * - Scan options (standard selection, screenshot toggle)
 * - Progress indicator showing pipeline stages
 * - Error handling with retry
 * - Passes completed scan data to parent via onScanComplete callback
 *
 * HOW:
 * - POSTs to /api/scan with URL and options
 * - Shows real-time pipeline stages (launching, analyzing, scoring...)
 * - Uses AbortController for cancellation
 * - Validates URL format before submission
 * - Manages loading/error states internally
 * ---------------------------------------------------------
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2, RotateCcw, Clock } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";
import { toast } from "sonner";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import type { AuthConfig } from "@/lib/validations/auth";

const SCAN_STAGES = [
  { label: "Connecting", duration: 2000 },
  { label: "Loading page", duration: 4000 },
  { label: "Analyzing accessibility", duration: 10000 },
  { label: "Scoring compliance", duration: 5000 },
] as const;

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The site took too long to respond. It may be down or behind a firewall.",
  UNREACHABLE: "Cannot reach this URL. Please check the address is correct and publicly accessible.",
  BLOCKED: "This site blocks automated access. Try again later or contact the site owner.",
  BROWSER_CRASH: "Browser encountered an unexpected error. Please try again.",
  UNKNOWN: "Something went wrong during the scan. Please try again.",
};

interface ScanFormProps {
  onScanComplete?: (result: unknown) => void;
}

export function ScanForm({ onScanComplete }: ScanFormProps) {
  const [url, setUrl] = useState("");
  const [lastUrl, setLastUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [errorInfo, setErrorInfo] = useState<{ message: string; retryable: boolean } | null>(null);
  const [authConfig, setAuthConfig] = useState<AuthConfig | undefined>(undefined);
  const [deep, setDeep] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const { t } = useI18n();

  const handleAuthChange = useCallback((config: AuthConfig | undefined) => {
    setAuthConfig(config);
  }, []);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      stageTimersRef.current.forEach(clearTimeout);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetUrl = normalizeUrl(url || lastUrl);
    if (!targetUrl) return;

    setIsScanning(true);
    setErrorInfo(null);
    setIsSlow(false);
    setCurrentStage(0);
    setLastUrl(targetUrl);

    // Show slow indicator after 25s
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 25_000);

    // Progress through stages on a timer
    stageTimersRef.current.forEach(clearTimeout);
    stageTimersRef.current = [];
    let elapsed = 0;
    for (let i = 1; i < SCAN_STAGES.length; i++) {
      elapsed += SCAN_STAGES[i - 1].duration;
      const timer = setTimeout(() => setCurrentStage(i), elapsed);
      stageTimersRef.current.push(timer);
    }

    // Abort controller for cleanup
    abortRef.current = new AbortController();

    try {
      const scanBody: Record<string, unknown> = { url: targetUrl };
      const options: Record<string, unknown> = {};
      if (authConfig && authConfig.method !== "none") options.auth = authConfig;
      if (deep) options.deep = true;
      if (Object.keys(options).length > 0) scanBody.options = options;

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanBody),
        signal: abortRef.current.signal,
      });

      const data = await res.json().catch(() => ({
        error: "The scan took too long or the server encountered an issue. Please try again.",
        code: "TIMEOUT",
      }));

      if (!res.ok) {
        if (handleUpgradeResponse(data)) {
          setIsScanning(false);
          return;
        }
        const code = data.code as string | undefined;
        const message = (code && ERROR_MESSAGES[code]) || data.message || data.error || "Scan failed";
        const retryable = res.status >= 500 || res.status === 504 || res.status === 429;
        setErrorInfo({ message, retryable });
        toast.error(message);
        return;
      }

      // Success
      toast.success(
        data.scan?.summary?.score != null
          ? `Scan complete — compliance score: ${data.scan.summary.score}/100`
          : "Scan completed successfully"
      );
      onScanComplete?.(data);
      setUrl("");
      setErrorInfo(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Network error — please check your connection";
      setErrorInfo({ message, retryable: true });
      toast.error(message);
    } finally {
      setIsScanning(false);
      setIsSlow(false);
      setCurrentStage(0);
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      stageTimersRef.current.forEach(clearTimeout);
      stageTimersRef.current = [];
    }
  }

  function handleRetry() {
    setErrorInfo(null);
    handleSubmit({ preventDefault: () => {} } as React.FormEvent);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          {t("scanForm.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <Input
            type="text"
            placeholder="https://www.google.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={isScanning}
            className="flex-1"
          />
          <Button type="submit" disabled={isScanning || !url}>
            {isScanning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("scanForm.scanning")}
              </>
            ) : (
              <>
                <Scan className="mr-2 h-4 w-4" />
                {t("scanForm.scan")}
              </>
            )}
          </Button>
        </form>

        {/* Authentication Section */}
        <ScanAuthSection onAuthChange={handleAuthChange} scanUrl={normalizeUrl(url)} />

        {/* Deep Scan toggle — goes beyond a single static pass: reveals interactive
            states (menus/dialogs/accordions) and probes keyboard reachability. */}
        <label className="flex items-start gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            disabled={isScanning}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600 accent-indigo-600 cursor-pointer"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white">
              Deep Scan
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Pro</span>
            </span>
            <span className="block text-xs text-neutral-500 dark:text-neutral-400">
              Also reveals interactive states (menus, dialogs, accordions) and re-scans them, plus checks keyboard reachability — catching issues a one-pass scan misses. Takes longer.
            </span>
          </span>
        </label>

        {/* Scanning progress */}
        {isScanning && (
          <div className="space-y-2 pt-1" aria-busy="true">
            <div
              className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span>{SCAN_STAGES[currentStage].label}...</span>
            </div>

            {/* Animated progress bar */}
            <div
              className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Scan progress"
              aria-valuenow={Math.round(((currentStage + 1) / SCAN_STAGES.length) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${SCAN_STAGES[currentStage].label}, step ${currentStage + 1} of ${SCAN_STAGES.length}`}
            >
              <div
                className="h-full bg-linear-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${((currentStage + 1) / SCAN_STAGES.length) * 100}%` }}
              />
            </div>

            <div aria-live="polite">
              {isSlow && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  <span>Taking longer than usual — complex sites can take up to 60s</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error with retry */}
        {errorInfo && (
          <div className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3">
            <p className="text-sm text-red-700 dark:text-red-300">{errorInfo.message}</p>
            {errorInfo.retryable && (
              <Button variant="ghost" size="sm" onClick={handleRetry} className="text-red-700 dark:text-red-300 hover:text-red-900">
                <RotateCcw className="mr-1 h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
