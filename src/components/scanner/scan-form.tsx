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
      if (authConfig && authConfig.method !== "none") {
        scanBody.options = { auth: authConfig };
      }

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

        {/* Scanning progress */}
        {isScanning && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span>{SCAN_STAGES[currentStage].label}...</span>
            </div>

            {/* Animated progress bar */}
            <div className="w-full h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${((currentStage + 1) / SCAN_STAGES.length) * 100}%` }}
              />
            </div>

            {isSlow && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                <span>Taking longer than usual — complex sites can take up to 60s</span>
              </div>
            )}
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
