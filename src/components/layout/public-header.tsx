"use client";

/**
 * Shared header for all public (unauthenticated) pages — pricing, contact,
 * privacy, terms, cookie-policy. Matches the landing page's logo + style
 * for visual consistency across the marketing site.
 */

import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-b border-neutral-100 dark:border-neutral-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-900 dark:bg-white">
            <svg className="h-4 w-4 text-white dark:text-neutral-900" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinejoin="round" strokeLinecap="round">
              <path d="M13 1.5 24.5 7.5 13 13.5 1.5 7.5 13 1.5Z" fill="currentColor" />
              <path d="M1.5 13 13 19 24.5 13" />
              <path d="M1.5 18.5 13 24.5 24.5 18.5" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">RegLayer</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}
