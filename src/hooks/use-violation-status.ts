"use client";

/**
 * RegLayer — useViolationStatus Hook
 *
 * WHY: Violation status updates need optimistic UI (instant feedback) + server sync.
 *      Without this, every status change would show a loading spinner.
 *
 * WHAT: Hook that manages violation status state with optimistic updates,
 *       rollback on error, and verify-fix integration.
 *
 * HOW: Local state mirrors server state. On mutation, state updates immediately.
 *      If the API call fails, state reverts and a toast/error is surfaced.
 */

import { useState, useCallback } from "react";
import type { ViolationStatus } from "@/generated/prisma/client";

// ─────────────── Types ───────────────

interface ViolationStatusState {
  status: ViolationStatus;
  statusNote: string | null;
  statusUpdatedAt: string | null;
  statusUpdatedBy: string | null;
  verifiedAt: string | null;
}

interface UseViolationStatusOptions {
  /** Called when a status update fails (for toast/error UI) */
  onError?: (message: string) => void;
  /** Called when status update succeeds */
  onSuccess?: (newStatus: ViolationStatus) => void;
}

interface UseViolationStatusReturn {
  /** Current status state (optimistic) */
  state: ViolationStatusState;
  /** Whether a mutation is in flight */
  isUpdating: boolean;
  /** Whether verify-fix scan is in progress */
  isVerifying: boolean;
  /** Error message from last failed operation */
  error: string | null;
  /** Update the violation's status */
  updateStatus: (status: ViolationStatus, note?: string) => Promise<void>;
  /** Trigger a re-scan to verify the fix */
  verifyFix: () => Promise<boolean>;
}

// ─────────────── Hook ───────────────

/**
 * Manages violation status with optimistic updates and verify-fix functionality.
 *
 * @param violationId - The violation ID to manage
 * @param initialState - Initial status state from server
 * @param options - Callbacks for error/success handling
 * @returns State + mutation functions
 */
export function useViolationStatus(
  violationId: string,
  initialState: ViolationStatusState,
  options?: UseViolationStatusOptions
): UseViolationStatusReturn {
  const [state, setState] = useState<ViolationStatusState>(initialState);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Update violation status with optimistic UI.
   * Reverts on failure.
   */
  const updateStatus = useCallback(
    async (newStatus: ViolationStatus, note?: string) => {
      const previousState = { ...state };
      setError(null);
      setIsUpdating(true);

      // Optimistic update
      setState((prev) => ({
        ...prev,
        status: newStatus,
        statusNote: note ?? prev.statusNote,
        statusUpdatedAt: new Date().toISOString(),
      }));

      try {
        const response = await fetch("/api/violations/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ violationId, status: newStatus, note }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ message: "Update failed" }));
          throw new Error(data.message ?? `Status update failed (${response.status})`);
        }

        const result = await response.json();

        // Sync with server response
        setState((prev) => ({
          ...prev,
          status: result.status,
          statusNote: result.statusNote,
          statusUpdatedAt: result.statusUpdatedAt,
          statusUpdatedBy: result.statusUpdatedBy,
        }));

        options?.onSuccess?.(result.status);
      } catch (err) {
        // Revert optimistic update
        setState(previousState);
        const message = err instanceof Error ? err.message : "Failed to update status";
        setError(message);
        options?.onError?.(message);
      } finally {
        setIsUpdating(false);
      }
    },
    [violationId, state, options]
  );

  /**
   * Trigger a re-scan to verify the fix.
   * Returns true if verified, false if still failing.
   */
  const verifyFix = useCallback(async (): Promise<boolean> => {
    setError(null);
    setIsVerifying(true);

    try {
      const response = await fetch(`/api/violations/${violationId}/verify`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ message: "Verification failed" }));
        throw new Error(data.message ?? `Verification failed (${response.status})`);
      }

      const result = await response.json();

      if (result.verified) {
        setState((prev) => ({
          ...prev,
          status: "VERIFIED" as ViolationStatus,
          verifiedAt: result.verifiedAt,
          statusUpdatedAt: result.verifiedAt,
        }));
        options?.onSuccess?.("VERIFIED" as ViolationStatus);
        return true;
      }

      setError("Still failing — check your fix and try again");
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      setError(message);
      options?.onError?.(message);
      return false;
    } finally {
      setIsVerifying(false);
    }
  }, [violationId, options]);

  return { state, isUpdating, isVerifying, error, updateStatus, verifyFix };
}
