/**
 * ---------------------------------------------------------
 * RegLayer — Scan Store (Zustand)
 * ---------------------------------------------------------
 *
 * Purpose:
 * Client-side state management for scan operations.
 *
 * Why Zustand:
 * - Minimal boilerplate
 * - No provider wrapping needed
 * - TypeScript-first
 * - Scales cleanly with slices pattern
 * ---------------------------------------------------------
 */

import { create } from "zustand";
import type { ScanResult, ComplianceReport } from "@/lib/types";

interface ScanState {
  currentScan: ScanResult | null;
  currentCompliance: ComplianceReport | null;
  scanHistory: ScanResult[];
  isScanning: boolean;

  // Actions
  setScanResult: (scan: ScanResult, compliance: ComplianceReport) => void;
  setScanning: (isScanning: boolean) => void;
  clearCurrentScan: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  currentScan: null,
  currentCompliance: null,
  scanHistory: [],
  isScanning: false,

  setScanResult: (scan, compliance) =>
    set((state) => ({
      currentScan: scan,
      currentCompliance: compliance,
      scanHistory: [scan, ...state.scanHistory].slice(0, 50),
      isScanning: false,
    })),

  setScanning: (isScanning) => set({ isScanning }),

  clearCurrentScan: () =>
    set({ currentScan: null, currentCompliance: null }),
}));
