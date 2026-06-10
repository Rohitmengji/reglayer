"use client";

/**
 * ---------------------------------------------------------
 * RegLayer — Optimistic UI Hook
 * ---------------------------------------------------------
 *
 * WHY: Perceived speed > actual speed. When a user clicks "Save",
 * they should see the result instantly — not after a network round-trip.
 * Instagram likes, Notion edits, Linear status changes all use this.
 *
 * WHAT:
 * - useOptimistic() hook that applies changes immediately
 * - Automatic rollback on server error
 * - Loading state tracking
 * - Error notification with retry
 * - Works with any async operation
 *
 * HOW:
 * - State updated immediately (optimistic)
 * - Server request fires in background
 * - On success: state already correct, no action needed
 * - On failure: revert to previous state + show error toast
 * ---------------------------------------------------------
 */

import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/microcopy";

interface OptimisticOptions<T> {
  /** Function to perform the server mutation */
  mutate: (data: T) => Promise<void>;
  /** Called when mutation succeeds */
  onSuccess?: () => void;
  /** Called when mutation fails (after rollback) */
  onError?: (error: Error) => void;
  /** Custom error message (overrides microcopy) */
  errorMessage?: string;
  /** Show toast on error. Default: true */
  showToast?: boolean;
}

export function useOptimistic<T>(initialValue: T, options: OptimisticOptions<T>) {
  const [value, setValue] = useState<T>(initialValue);
  const [isPending, setIsPending] = useState(false);
  const previousRef = useRef<T>(initialValue);
  const { mutate, onSuccess, onError, errorMessage, showToast = true } = options;

  const update = useCallback(
    async (newValue: T | ((prev: T) => T)) => {
      const resolved = typeof newValue === "function"
        ? (newValue as (prev: T) => T)(value)
        : newValue;

      // Save previous for rollback
      previousRef.current = value;

      // Apply optimistically
      setValue(resolved);
      setIsPending(true);

      try {
        await mutate(resolved);
        onSuccess?.();
      } catch (err) {
        // Rollback
        setValue(previousRef.current);
        const error = err instanceof Error ? err : new Error("Unknown error");
        onError?.(error);

        if (showToast) {
          toast.error(errorMessage ?? getErrorMessage("generic"), {
            action: {
              label: "Retry",
              onClick: () => update(resolved),
            },
          });
        }
      } finally {
        setIsPending(false);
      }
    },
    [value, mutate, onSuccess, onError, errorMessage, showToast]
  );

  const reset = useCallback(() => {
    setValue(previousRef.current);
  }, []);

  return { value, update, isPending, reset };
}

// ─── Optimistic List Hook ─────────────────────────────────────────────────────
// Specialized for list operations (add, remove, update item)

interface OptimisticListOptions<T> {
  getId: (item: T) => string;
}

export function useOptimisticList<T>(initialItems: T[], options: OptimisticListOptions<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const { getId } = options;

  const addOptimistic = useCallback(
    async (item: T, mutate: () => Promise<void>) => {
      const id = getId(item);
      setItems((prev) => [...prev, item]);
      setPendingIds((prev) => new Set(prev).add(id));

      try {
        await mutate();
      } catch {
        // Remove optimistic item
        setItems((prev) => prev.filter((i) => getId(i) !== id));
        toast.error(getErrorMessage("generic"));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [getId]
  );

  const removeOptimistic = useCallback(
    async (id: string, mutate: () => Promise<void>) => {
      const removedItem = items.find((i) => getId(i) === id);
      setItems((prev) => prev.filter((i) => getId(i) !== id));
      setPendingIds((prev) => new Set(prev).add(id));

      try {
        await mutate();
      } catch {
        // Restore item
        if (removedItem) setItems((prev) => [...prev, removedItem]);
        toast.error(getErrorMessage("generic"));
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [items, getId]
  );

  const updateOptimistic = useCallback(
    async (id: string, updates: Partial<T>, mutate: () => Promise<void>) => {
      const prev = items.find((i) => getId(i) === id);
      setItems((list) =>
        list.map((i) => (getId(i) === id ? { ...i, ...updates } : i))
      );
      setPendingIds((s) => new Set(s).add(id));

      try {
        await mutate();
      } catch {
        if (prev) setItems((list) => list.map((i) => (getId(i) === id ? prev : i)));
        toast.error(getErrorMessage("generic"));
      } finally {
        setPendingIds((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [items, getId]
  );

  const isPending = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

  return { items, setItems, addOptimistic, removeOptimistic, updateOptimistic, isPending };
}
