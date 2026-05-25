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

export function useScan() {
  const { setScanResult, setScanning } = useScanStore();

  return useMutation({
    mutationFn: async (url: string): Promise<ScanResponse> => {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
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
