/**
 * Dashboard loading skeleton — shows while data is fetching.
 * Uses shimmer animation for perceived performance.
 */
export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
        <div className="h-4 w-72 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-3 w-32 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
        <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded mb-4" />
        <div className="h-48 w-full bg-neutral-100 dark:bg-neutral-800/30 rounded" />
      </div>

      {/* Table placeholder */}
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-3">
        <div className="h-5 w-40 bg-neutral-200 dark:bg-neutral-800 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-2">
            <div className="h-4 w-48 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            <div className="h-4 w-20 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            <div className="h-4 w-16 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
