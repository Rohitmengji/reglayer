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

import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Scan, Loader2, RotateCcw, Clock } from "lucide-react";
import { handleUpgradeResponse } from "@/lib/upgrade-prompt";
import { useI18n } from "@/components/i18n-provider";
import { useFeatures } from "@/hooks/use-features";
import { toast } from "sonner";
import { ScanAuthSection } from "@/components/scanner/scan-auth-section";
import { SCAN_REGIONS } from "@/lib/scanner/regions";
import { ConfettiBurst } from "@/components/ui/celebrations";
import { broadcastEvent } from "@/hooks/use-tab-sync";
import type { AuthConfig } from "@/lib/validations/auth";

const ERROR_MESSAGES: Record<string, string> = {
  TIMEOUT: "The site took too long to respond. It may be down or behind a firewall.",
  UNREACHABLE: "Cannot reach this URL. Please check the address is correct and publicly accessible.",
  BLOCKED: "This site blocks automated access. Try again later or contact the site owner.",
  BROWSER_CRASH: "Browser encountered an unexpected error. Please try again.",
  RATE_LIMITED: "You're sending requests too quickly. Please wait a minute before scanning again.",
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
  const [showConfetti, setShowConfetti] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthConfig | undefined>(undefined);
  const [deep, setDeep] = useState(false);
  const [region, setRegion] = useState("");
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { t } = useI18n();
  const { hasFeature, canRunScans, accessLoading, accessError, retryAccess } = useFeatures();
  const deepScanEnabled = hasFeature("deepScan");
  const deepScanId = useId();

  const handleAuthChange = useCallback((config: AuthConfig | undefined) => {
    setAuthConfig(config);
  }, []);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // Pick up a URL the user typed in the onboarding flow (the dashboard stashes it
  // in sessionStorage and fires "onboarding-scan"). Previously this was dropped,
  // so a new user had to retype the URL — friction at the most important moment.
  useEffect(() => {
    function pickUpOnboardingUrl() {
      const u = sessionStorage.getItem("reglayer_onboarding_url");
      if (u) {
        setUrl(u);
        sessionStorage.removeItem("reglayer_onboarding_url");
      }
    }
    pickUpOnboardingUrl();
    window.addEventListener("onboarding-scan", pickUpOnboardingUrl);
    return () => window.removeEventListener("onboarding-scan", pickUpOnboardingUrl);
  }, []);

  function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return trimmed;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canRunScans || isScanning) return;
    const targetUrl = normalizeUrl(url || lastUrl);
    if (!targetUrl) return;

    setIsScanning(true);
    setErrorInfo(null);
    setIsSlow(false);
    setLastUrl(targetUrl);

    // Show slow indicator after 25s
    slowTimerRef.current = setTimeout(() => setIsSlow(true), 25_000);

    // Abort controller for cleanup
    abortRef.current = new AbortController();

    try {
      const scanBody: Record<string, unknown> = { url: targetUrl };
      const options: Record<string, unknown> = {};
      if (authConfig && authConfig.method !== "none") options.auth = authConfig;
      if (deep && deepScanEnabled) options.deep = true;
      if (region) options.region = region;
      if (Object.keys(options).length > 0) scanBody.options = options;

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanBody),
        signal: abortRef.current.signal,
      });

      const data = await res.json().catch(() => ({
        error: res.status >= 500
          ? "Server error — please try again"
          : "Invalid response from server",
        code: res.status === 504 ? "TIMEOUT" : "UNKNOWN",
      }));

      if (!res.ok) {
        if (handleUpgradeResponse(data)) {
          setIsScanning(false);
          return;
        }
        const code = data.code as string | undefined;
        let message: string;
        if (res.status === 403 && data.error === "Forbidden: requires 'scans.run' permission") {
          message = "Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.";
        } else if (res.status === 429) {
          // Extract rate limit info from response headers for user feedback
          const resetHeader = res.headers.get("X-RateLimit-Reset");
          if (resetHeader) {
            const resetAt = parseInt(resetHeader, 10);
            const secsLeft = Math.max(1, Math.ceil((resetAt * 1000 - Date.now()) / 1000));
            message = secsLeft > 60
              ? `Too many requests. Try again in ${Math.ceil(secsLeft / 60)} minute${Math.ceil(secsLeft / 60) !== 1 ? "s" : ""}.`
              : `Too many requests. Try again in ${secsLeft} second${secsLeft !== 1 ? "s" : ""}.`;
          } else {
            message = ERROR_MESSAGES.RATE_LIMITED;
          }
        } else {
          message = (code && ERROR_MESSAGES[code]) || data.message || data.error || "Scan failed";
        }
        const retryable = res.status >= 500 || res.status === 504 || res.status === 429;
        setErrorInfo({ message, retryable });
        toast.error(message);
        return;
      }

      // Success
      const score = data.scan?.summary?.score;
      toast.success(
        score != null
          ? `Scan complete: automated accessibility score ${score}/100`
          : "Scan completed successfully"
      );

      // Celebrate high scores with confetti burst
      if (score != null && score >= 90) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }

      // Broadcast to other tabs so dashboards auto-refresh
      if (data.scan?.id && score != null) {
        broadcastEvent({ type: "scan_completed", scanId: data.scan.id, url, score });
      }

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
    <>
    <ConfettiBurst active={showConfetti} />
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan className="h-5 w-5" />
          {t("scanForm.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {accessLoading ? (
          <p role="status" className="text-sm text-neutral-600 dark:text-neutral-300">Checking scanning access...</p>
        ) : accessError ? (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-neutral-700 dark:text-neutral-200">Could not confirm scanning access. Check your connection or select an available workspace, then try again.</p>
            <Button variant="outline" size="sm" onClick={retryAccess}>{t("common.retry")}</Button>
          </div>
        ) : !canRunScans && (
          <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">Your role in this workspace does not allow new scans. Ask a workspace owner or administrator for scanning access.</p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 min-[371px]:flex-row">
          <Input
            id="scan-url"
            type="text"
            placeholder="https://www.google.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            disabled={isScanning || !canRunScans}
            className="w-full min-[371px]:flex-1"
            aria-label="Website URL to scan for accessibility compliance"
          />
          <Button type="submit" disabled={isScanning || !canRunScans || !url} className="w-full min-[371px]:w-auto">
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

        <details className="space-y-3">
          <summary className="cursor-pointer py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            Advanced options{authConfig && authConfig.method !== "none" || deep || region ? " (configured)" : ""}
          </summary>
        {/* Authentication Section */}
        <ScanAuthSection onAuthChange={handleAuthChange} scanUrl={normalizeUrl(url)} />

        {/* Deep Scan toggle — only visible when the deepScan feature is enabled for this workspace */}
        {deepScanEnabled && (
        <div className="flex items-start gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <input
            id={deepScanId}
            type="checkbox"
            aria-describedby={`${deepScanId}-description`}
            checked={deep}
            onChange={(e) => setDeep(e.target.checked)}
            disabled={isScanning}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 dark:border-neutral-600 accent-indigo-600 cursor-pointer"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium text-neutral-900 dark:text-white">
              <label htmlFor={deepScanId} className="cursor-pointer">Deep Scan</label>
              <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Pro</span>
            </div>
            <p id={`${deepScanId}-description`} className="text-xs text-neutral-500 dark:text-neutral-400">
              Also reveals interactive states (menus, dialogs, accordions) and re-scans them, plus checks keyboard reachability — catching issues a one-pass scan misses. Takes longer.
            </p>
          </div>
        </div>
        )}

        {/* Region picker */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              Scan Region
            </span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={isScanning}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              aria-label="Scan region"
            >
              <option value="">Auto (nearest)</option>
              {SCAN_REGIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.flag} {r.name}</option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Simulate scanning from a specific region to detect geo-specific content differences.
          </p>
        </div>
        </details>

        {/* Scanning progress */}
        {isScanning && (
          <div className="space-y-2 pt-1" aria-busy="true">
            <div
              className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
              <span>Scanning accessibility. Waiting for results...</span>
            </div>

            <div aria-live="polite">
              {isSlow && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  <span>The scan is still running. Complex or slow pages can take longer.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error with retry */}
        {errorInfo && (
          <div role="alert" className="flex items-center justify-between rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-4 py-3">
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
    </>
  );
}
