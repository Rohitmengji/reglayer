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

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2, RotateCcw, Clock } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";
import { toast } from "sonner";

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
  const [errorInfo, setErrorInfo] = useState<{ message: string; retryable: boolean } | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetUrl = url || lastUrl;
    if (!targetUrl) return;

    setIsScanning(true);
    setErrorInfo(null);
    setIsSlow(false);
    setLastUrl(targetUrl);

    // Show slow indicator after 15s
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 15_000);

    // Abort controller for cleanup
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
        signal: abortRef.current.signal,
      });

      const data = await res.json();

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
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
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
            type="url"
            placeholder="https://example.com"
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

        {/* Scanning indicator */}
        {isScanning && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Scanning {lastUrl}...</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
            {isSlow && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                <span>Taking longer than usual — complex sites can take up to 30s</span>
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
