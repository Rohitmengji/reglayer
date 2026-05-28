/**
 * RegLayer — 404 Not Found Page
 *
 * WHY: Users navigating to non-existent routes need a helpful message.
 * WHAT: Friendly 404 page with link back to homepage/dashboard.
 * HOW: Next.js serves this for any unmatched route automatically.
 */
import Link from "next/link";

/**
 * Custom 404 page — clean, branded, helpful.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-md text-center space-y-4">
        <p className="text-7xl font-bold text-neutral-200 dark:text-neutral-800">404</p>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Page not found
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
