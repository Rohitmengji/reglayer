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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
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
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      <div className="w-full max-w-md mx-4 rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-150">
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
        <div className="flex items-center justify-end gap-3 border-t border-neutral-100 dark:border-neutral-800 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
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
