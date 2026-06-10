"use client";

/**
 * RegLayer — Global Error Boundary
 *
 * WHY: If even the root layout throws, this catches it (last resort).
 * WHAT: Minimal HTML error page that renders without any layout dependencies.
 * HOW: Next.js renders this when RootLayout itself throws. Includes its own <html>/<body>.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Global Error Boundary — catches errors in the root layout itself.
 * This is the last line of defense before a white screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            Something went wrong
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            An unexpected error occurred. Our team has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
