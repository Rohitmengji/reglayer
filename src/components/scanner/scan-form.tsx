"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2, RotateCcw, Clock } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";
import { toast } from "sonner";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued — waiting...",
  launching: "Launching browser...",
  analyzing: "Analyzing page with axe-core...",
  scoring: "Scoring violations...",
  screenshot: "Capturing screenshot...",
  persisting: "Saving results...",
  complete: "Complete!",
  failed: "Scan failed",
};

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The site took too long to respond. Try again or reduce the timeout.",
  UNREACHABLE: "Cannot reach this URL. Please check the address.",
  BLOCKED: "This site blocks automated access. Try again in a moment.",
  BROWSER_CRASH: "Browser crashed unexpectedly. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

interface ScanFormProps {
  onScanComplete?: (result: unknown) => void;
}

export function ScanForm({ onScanComplete }: ScanFormProps) {
  const [url, setUrl] = useState("");
  const [scanUrl, setScanUrl] = useState(""); // Track URL being scanned for retry
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [isSlow, setIsSlow] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ message: string; retryable: boolean } | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { t } = useI18n();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setIsSlow(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetUrl = url || scanUrl; // Use current input or saved scan URL (for retry)
    if (!targetUrl) return;

    setIsScanning(true);
    setProgress(0);
    setStage("queued");
    setErrorInfo(null);
    setIsSlow(false);
    setScanUrl(targetUrl);

    // Show "taking longer than usual" after 20 seconds
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 20_000);

    try {
      // Enqueue the scan (returns immediately)
      const enqueueRes = await fetch("/api/scan/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!enqueueRes.ok) {
        const data = await enqueueRes.json();
        if (handleUpgradeResponse(data)) {
          setIsScanning(false);
          stopPolling();
          return;
        }
        throw new Error(data.error ?? "Failed to start scan");
      }

      const { jobId } = await enqueueRes.json();

      // Poll for progress
      pollingRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/scan/async?jobId=${jobId}`);
          if (!statusRes.ok) return;

          const job = await statusRes.json();
          setProgress(job.progress ?? 0);
          setStage(job.stage ?? job.status);

          if (job.status === "completed") {
            stopPolling();
            setIsScanning(false);
            setProgress(100);
            setStage("complete");
            const score = job.result?.scan?.summary?.score;
            toast.success(
              score != null
                ? `Scan complete — compliance score: ${score}/100`
                : "Scan completed successfully"
            );
            onScanComplete?.(job.result);
            setUrl("");
            // Reset progress after a brief moment
            setTimeout(() => { setProgress(0); setStage(""); }, 2000);
          } else if (job.status === "failed") {
            stopPolling();
            setIsScanning(false);
            setStage("failed");
            const errorMsg = ERROR_MESSAGES[job.errorCode ?? "UNKNOWN"] ?? job.error ?? "Scan failed";
            setErrorInfo({ message: errorMsg, retryable: job.retryable ?? true });
            toast.error(errorMsg);
          }
        } catch {
          // Polling failure — keep trying
        }
      }, 1500);
    } catch (err) {
      setIsScanning(false);
      setStage("");
      const message = err instanceof Error ? err.message : "An error occurred";
      toast.error(message);
    }
  }

  function handleRetry() {
    setErrorInfo(null);
    setProgress(0);
    setStage("");
    // Re-submit with the URL that was scanned (not current input)
    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
    handleSubmit(fakeEvent);
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

        {/* Progress indicator */}
        {isScanning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
              <span>{STAGE_LABELS[stage] ?? stage}</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
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
