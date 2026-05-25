/**
 * ---------------------------------------------------------
 * RegLayer — Custom Hooks: useScan
 * ---------------------------------------------------------
 *
 * Purpose:
 * React Query hook for scan operations.
 * Encapsulates API communication and cache management.
 * ---------------------------------------------------------
 */

"use client";

import { useMutation } from "@tanstack/react-query";
import type { ScanResult, ComplianceReport } from "@/lib/types";
import { useScanStore } from "@/stores/scanStore";

interface ScanResponse {
  scan: ScanResult;
  compliance: ComplianceReport;
}

interface ScanParams {
  url: string;
  includeScreenshot?: boolean;
}

export function useScan() {
  const { setScanResult, setScanning } = useScanStore();

  return useMutation({
    mutationFn: async (params: ScanParams): Promise<ScanResponse> => {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: params.url,
          options: { includeScreenshot: params.includeScreenshot },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? "Scan failed");
      }

      return response.json();
    },
    onMutate: () => {
      setScanning(true);
    },
    onSuccess: (data) => {
      setScanResult(data.scan, data.compliance);
    },
    onError: () => {
      setScanning(false);
    },
  });
}

/**
 * Hook for async (queue-based) scanning.
 */
export function useAsyncScan() {
  return useMutation({
    mutationFn: async (url: string) => {
      const response = await fetch("/api/scan/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? "Failed to queue scan");
      }

      return response.json();
    },
  });
}

/**
 * Hook for multi-page crawl scanning.
 */
export function useCrawlScan() {
  return useMutation({
    mutationFn: async (params: { url: string; maxPages: number }) => {
      const response = await fetch("/api/scan/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? "Crawl scan failed");
      }

      return response.json();
    },
  });
}
