"use client";

/**
 * CrawlTheater — composes the live crawl visualization: a faux-browser viewport
 * (the page being scanned), an animated site-map graph, and a filmstrip of
 * completed pages. Driven entirely by the pure crawlTheater reducer state, which
 * the page folds SSE events into.
 *
 * This is the visual layer. The authoritative, screen-reader-friendly progress
 * (phase timeline, counts, ETA, per-page list with aria-live) remains in the
 * LiveProgressDashboard rendered alongside it.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Eye } from "lucide-react";
import { type TheaterState } from "@/lib/crawl-viz/crawlTheater";
import { CrawlViewport } from "./CrawlViewport";
import { CrawlSiteMap } from "./CrawlSiteMap";
import { CrawlFilmstrip } from "./CrawlFilmstrip";

interface CrawlTheaterProps {
  theater: TheaterState;
}

export function CrawlTheater({ theater }: CrawlTheaterProps) {
  const nodeCount = theater.order.length;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Viewport — the hero */}
        <div className="lg:col-span-2 space-y-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Live view
          </p>
          <CrawlViewport phase={theater.phase} current={theater.current} lastCaptured={theater.lastCaptured} rootUrl={theater.rootUrl} currentShot={theater.currentShot} />
        </div>

        {/* Site map */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500" aria-hidden="true" /> Site Map
              <span className="ml-auto text-[11px] font-normal text-neutral-400">{nodeCount} pages</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px]">
              <CrawlSiteMap state={theater} />
            </div>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[10px] text-neutral-500">
              <Legend color="#a1a1aa" label="Discovered" />
              <Legend color="#3b82f6" label="Scanning" />
              <Legend color="#22c55e" label="Pass" />
              <Legend color="#f59e0b" label="Issues" />
              <Legend color="#ef4444" label="Critical / error" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filmstrip */}
      {theater.filmstrip.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Captured Pages
              <span className="text-[11px] font-normal text-neutral-400">{theater.filmstrip.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <CrawlFilmstrip entries={theater.filmstrip} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
