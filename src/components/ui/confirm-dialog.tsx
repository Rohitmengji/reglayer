"use client";

import { useCallback, useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // On open: remember the element that had focus, move focus into the dialog.
  // On close: restore focus to that element.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      // Focus trap: keep Tab / Shift+Tab cycling within the dialog.
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onCancel();
    },
    [onCancel],
  );

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    // The backdrop is click-to-dismiss for pointer users only — Escape (handled
    // above) is the keyboard equivalent, and the backdrop itself carries no dialog
    // semantics (role="dialog" belongs on the panel below, matching what a screen
    // reader should announce as the dialog's boundary).
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-desc"
        className="w-full max-w-md mx-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl animate-scale-in"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                isDanger
                  ? "bg-red-100 dark:bg-red-900/30"
                  : "bg-neutral-100 dark:bg-neutral-800"
              }`}
            >
              <AlertTriangle
                className={`h-5 w-5 ${
                  isDanger ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-300"
                }`}
              />
            </div>
            <div>
              <h3
                id="confirm-title"
                className="text-base font-semibold text-neutral-900 dark:text-white"
              >
                {title}
              </h3>
              <p
                id="confirm-desc"
                className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed"
              >
                {description}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 sm:gap-3 border-t border-neutral-100 dark:border-neutral-800 px-4 sm:px-6 py-3 sm:py-4">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`w-full sm:w-auto rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
              isDanger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
