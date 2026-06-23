import Link from "next/link";

export default function FixNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6 min-h-[60vh]">
      <div className="max-w-sm text-center space-y-3">
        <p className="text-5xl font-bold text-neutral-200 dark:text-neutral-800">404</p>
        <p className="text-lg font-semibold text-neutral-900 dark:text-white">Fix not found</p>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This violation fix may have been resolved or the scan was deleted.
        </p>
        <Link
          href="/violations"
          className="inline-block mt-2 rounded-lg bg-neutral-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
        >
          View violations
        </Link>
      </div>
    </div>
  );
}
