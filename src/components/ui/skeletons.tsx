/**
 * Reusable loading skeletons for route-segment `loading.tsx` files.
 *
 * These are pure server components (no client/i18n dependencies) so each
 * `loading.tsx` can re-export one in three lines and stream instantly.
 * The markup vocabulary matches the existing skeletons in
 * `src/app/dashboard/loading.tsx` and `src/app/scans/loading.tsx`.
 */

function HeaderBlock() {
  return (
    <div className="space-y-2">
      <div className="h-7 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
      <div className="h-4 w-72 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
    </div>
  );
}

/** Header + filter bar + a list of rows. For tables/list views. */
export function ListPageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <HeaderBlock />
      {/* Filter / toolbar row */}
      <div className="flex flex-wrap gap-3">
        <div className="h-9 w-64 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg" />
        <div className="h-9 w-28 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg" />
        <div className="h-9 w-28 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg" />
      </div>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4">
            <div className="h-9 w-9 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
              <div className="h-3 w-1/2 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            </div>
            <div className="h-6 w-16 bg-neutral-100 dark:bg-neutral-800/50 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Header + stat-card grid + chart placeholder. For dashboards/analytics. */
export function DashboardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <HeaderBlock />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3"
          >
            <div className="h-4 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-8 w-16 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-3 w-32 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6"
          >
            <div className="h-5 w-32 bg-neutral-200 dark:bg-neutral-800 rounded mb-4" />
            <div className="h-48 w-full bg-neutral-100 dark:bg-neutral-800/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Header + a couple of large content panels. For detail/record pages. */
export function DetailPageSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <HeaderBlock />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3"
          >
            <div className="h-4 w-24 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-8 w-20 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        <div className="h-5 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-2/3 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            <div className="h-3 w-full bg-neutral-100 dark:bg-neutral-800/40 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Centered narrow form skeleton. For auth/contact/single-form pages. */
export function FormPageSkeleton() {
  return (
    <div className="mx-auto max-w-md p-6 space-y-6 animate-pulse">
      <div className="space-y-2 text-center">
        <div className="h-7 w-40 bg-neutral-200 dark:bg-neutral-800 rounded mx-auto" />
        <div className="h-4 w-56 bg-neutral-100 dark:bg-neutral-800/50 rounded mx-auto" />
      </div>
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
            <div className="h-10 w-full bg-neutral-100 dark:bg-neutral-800/40 rounded-lg" />
          </div>
        ))}
        <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
      </div>
    </div>
  );
}

/** Prose lines for documentation / long-form content pages. */
export function DocsSkeleton() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-8 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
        <div className="h-4 w-1/2 bg-neutral-100 dark:bg-neutral-800/50 rounded" />
      </div>
      {Array.from({ length: 3 }).map((_, section) => (
        <div key={section} className="space-y-3 pt-4">
          <div className="h-5 w-40 bg-neutral-200 dark:bg-neutral-800 rounded" />
          {Array.from({ length: 4 }).map((_, line) => (
            <div
              key={line}
              className="h-3 bg-neutral-100 dark:bg-neutral-800/40 rounded"
              style={{ width: `${95 - line * 7}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
