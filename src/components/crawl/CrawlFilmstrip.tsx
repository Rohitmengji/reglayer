"use client";

/**
 * CrawlFilmstrip — a horizontal strip of completed-page thumbnails that fills
 * left→right as the crawl progresses, giving a tangible "page by page" history.
 * Thumbnails are lazy-loaded from /api/scan/[scanId]/thumbnail. Auto-scrolls to
 * the newest as pages land.
 */

import { useEffect, useRef } from "react";
import { type FilmstripEntry } from "@/lib/crawl-viz/crawlTheater";

interface CrawlFilmstripProps {
  entries: FilmstripEntry[];
}

// Cap the rendered thumbnails (newest kept) so very large crawls stay light.
const MAX_RENDERED = 40;

function scoreBadge(score: number): string {
  if (score >= 90) return "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300";
  if (score >= 70) return "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300";
  return "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300";
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

export function CrawlFilmstrip({ entries }: CrawlFilmstripProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shown = entries.slice(-MAX_RENDERED);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto pb-1 scroll-smooth"
      aria-label={`${entries.length} pages scanned`}
    >
      {shown.map((entry) => (
        <div
          key={entry.scanId}
          className="shrink-0 w-32 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden animate-scale-in"
          title={entry.url}
        >
          <div className="relative h-20 bg-neutral-100 dark:bg-neutral-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/scan/${entry.scanId}/thumbnail`}
              alt={`Screenshot of ${entry.url}`}
              className="h-full w-full object-cover object-top"
              loading="lazy"
              decoding="async"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
            />
            <span
              className={`absolute top-1 right-1 h-5 min-w-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold ${scoreBadge(entry.score)}`}
            >
              {Math.round(entry.score)}
            </span>
          </div>
          <div className="px-2 py-1">
            <p className="font-mono text-[10px] text-neutral-500 truncate">{pathOf(entry.url)}</p>
            {entry.violations > 0 && (
              <p className="text-[10px] text-red-500">{entry.violations} issue{entry.violations === 1 ? "" : "s"}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
