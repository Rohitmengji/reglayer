/**
 * Server-safe loading spinner for Next.js loading.tsx files.
 * Shows a centered spinner as the initial loading state (before JS hydrates).
 * Modern pattern: spinner → skeleton (inside page) → content.
 *
 * This is a SERVER component — no "use client", no hooks, no browser APIs.
 */

export function InitialSpinner({ message = "Loading..." }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-neutral-200 border-t-neutral-900 dark:border-neutral-700 dark:border-t-white" />
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{message}</p>
      </div>
    </div>
  );
}
