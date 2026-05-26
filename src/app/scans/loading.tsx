/**
 * Generic page loading skeleton for scan/settings/team pages.
 */
export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-40 bg-neutral-200 dark:bg-neutral-800 rounded" />
        <div className="h-4 w-64 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
      </div>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <div className="h-4 flex-1 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            <div className="h-4 w-24 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
