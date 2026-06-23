"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function TestError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-3">
        <p className="text-lg font-semibold text-neutral-900 dark:text-white">Testing page error</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Something went wrong. Your scan data is safe.</p>
        <button onClick={reset} className="mt-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors">Try again</button>
      </div>
    </div>
  );
}
