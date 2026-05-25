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
  currentScan: ScanResult | null;
  currentCompliance: ComplianceReport | null;
  scanHistory: ScanHistoryEntry[];
  isScanning: boolean;

  // Actions
  setScanResult: (scan: ScanResult, compliance: ComplianceReport) => void;
  setScanning: (isScanning: boolean) => void;
  clearCurrentScan: () => void;
  getScanById: (id: string) => ScanHistoryEntry | undefined;
  deleteScan: (id: string) => void;
  clearHistory: () => void;
}

export const useScanStore = create<ScanState>()(
  persist(
    (set, get) => ({
      currentScan: null,
      currentCompliance: null,
      scanHistory: [],
      isScanning: false,

      setScanResult: (scan, compliance) =>
        set((state) => ({
          currentScan: scan,
          currentCompliance: compliance,
          scanHistory: [{ scan, compliance }, ...state.scanHistory].slice(0, 100),
          isScanning: false,
        })),

      setScanning: (isScanning) => set({ isScanning }),

      clearCurrentScan: () =>
        set({ currentScan: null, currentCompliance: null }),

      getScanById: (id) =>
        get().scanHistory.find((entry) => entry.scan.id === id),

      deleteScan: (id) =>
        set((state) => ({
          scanHistory: state.scanHistory.filter((entry) => entry.scan.id !== id),
        })),

      clearHistory: () => set({ scanHistory: [] }),
    }),
    {
      name: "reglayer-scan-history",
      partialize: (state) => ({
        scanHistory: state.scanHistory,
      }),
    }
  )
);
