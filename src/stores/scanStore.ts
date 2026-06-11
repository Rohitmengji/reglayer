/**
 * ---------------------------------------------------------
 * RegLayer — Scan Store (Zustand + Persistence)
 * ---------------------------------------------------------
 *
 * Purpose:
 * Client-side state management for scan operations
 * with localStorage persistence for scan history.
 *
 * Why Zustand with persist:
 * - Minimal boilerplate
 * - No provider wrapping needed
 * - TypeScript-first
 * - Built-in persistence middleware
 * - Scan history survives page refreshes
 * ---------------------------------------------------------
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScanResult, ComplianceReport } from "@/lib/types";

export interface ScanHistoryEntry {
  scan: ScanResult;
  compliance: ComplianceReport;
}

interface ScanState {
  scanHistory: ScanHistoryEntry[];

  // Actions
  setScanResult: (scan: ScanResult, compliance: ComplianceReport) => void;
  getScanById: (id: string) => ScanHistoryEntry | undefined;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      scanHistory: [],

      setScanResult: (scan, compliance) =>
        set((state) => ({
          scanHistory: [{ scan, compliance }, ...state.scanHistory].slice(0, 100),
        })),

      getScanById: (id) =>
        get().scanHistory.find((entry) => entry.scan.id === id),
    }),
    {
      name: "reglayer-scan-history",
      partialize: (state) => ({
        scanHistory: state.scanHistory,
      }),
    }
  )
);
