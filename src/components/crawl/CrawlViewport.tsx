"use client";

/**
 * CrawlViewport — the "faux browser" hero of the live crawl visualization.
 *
 * Shows the page currently being scanned in a browser-chrome frame: the
 * address bar "navigates" to the live URL, a scanline sweeps the page body
 * (the "crawling / scrolling each element" feeling), and violation pins pop as
 * pages complete. When a page finishes, its REAL screenshot (lazy-loaded from
 * /api/scan/[scanId]/thumbnail) backs the frame; before that, an animated
 * wireframe skeleton stands in.
 *
 * This is a narrated reconstruction synchronized to real SSE events — not a
 * video feed (a live headless-browser screencast isn't feasible on serverless).
 * Every screenshot shown maps to a real scanned page.
 *
 * Animations are CSS-only and the global prefers-reduced-motion rule disables
 * them automatically.
 */

import { useState } from "react";
import { Globe, Lock, Loader2, CheckCircle2 } from "lucide-react";

interface CrawlViewportProps {
  phase: string;
  current: { url: string } | null;
  lastCaptured: { url: string; scanId: string; score: number; violations: number } | null;
  /** Target site root — shown in the address bar before the first page is captured. */
  rootUrl?: string | null;
  /**
   * Data-URL screenshot of the page the crawler is on RIGHT NOW (discovery or
   * scan). When present it backs the frame directly — this is what makes the
   * live view show real pages page-by-page through the WHOLE crawl, including
   * discovery (instead of a skeleton until the first scan completes).
   */
  currentShot?: string;
  /**
   * Aspect (height/width) of currentShot when it's a tall, full-content capture.
   * When tall enough, the viewport SCROLLS the page top→footer while scanning
   * (like a real scanner reading the whole page). Absent → static frame.
   */
  currentShotAspect?: number;
}

// The viewport frame is aspect-[16/10] → its height/width ratio is 10/16.
const FRAME_ASPECT = 10 / 16;

function scoreText(score: number): string {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// Deterministic pin spots over the page body (we don't have element coords —
// these are illustrative markers that pulse to draw the eye).
const PIN_SPOTS = [
  { top: "22%", left: "18%" },
  { top: "38%", left: "64%" },
  { top: "54%", left: "30%" },
  { top: "61%", left: "78%" },
  { top: "73%", left: "12%" },
  { top: "82%", left: "52%" },
];

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname + u.search) || "/";
  } catch {
    return url;
  }
}

export function CrawlViewport({ phase, current, lastCaptured, rootUrl, currentShot, currentShotAspect }: CrawlViewportProps) {
  // Thumbnails can 404 transiently (the Scan row persists a moment after the
  // page-complete event) or in environments without stored screenshots. Track
  // failures so we fall back to the wireframe skeleton instead of a blank hero.
  const [failedShots, setFailedShots] = useState<Set<string>>(new Set());
  // The live shot data-URL can occasionally fail to decode; track by URL so we
  // fall back to the skeleton rather than render a broken frame.
  const [failedLiveUrls, setFailedLiveUrls] = useState<Set<string>>(new Set());
  const showShot = !!lastCaptured && !failedShots.has(lastCaptured.scanId);
  const isScanning = phase === "scanning" && !!current;
  const isDiscovering = phase === "discovering" || phase === "connecting" || phase === "queued";
  const displayUrl = current?.url ?? lastCaptured?.url ?? rootUrl ?? "";
  // The page the browser is on right now backs the frame directly when we have
  // its live screenshot — covering discovery (no scanId/thumbnail yet) and
  // scanning seamlessly. Falls back to the completed-page thumbnail, then the
  // wireframe skeleton.
  const showLiveShot = !!currentShot && !failedLiveUrls.has(displayUrl);
  // A tall capture (clearly taller than the 16:10 frame) can be SCROLLED top→
  // footer while scanning. translateY % is relative to the image's own height:
  //   shift = (frameH - imgH)/imgH = (FRAME_ASPECT - aspect)/aspect  (negative).
  const canScrollShot = !!currentShotAspect && currentShotAspect > FRAME_ASPECT + 0.15;
  const scanShiftPct = canScrollShot ? ((FRAME_ASPECT - currentShotAspect!) / currentShotAspect!) * 100 : 0;
  const scrolling = canScrollShot && (isScanning || (isDiscovering && showLiveShot));
  // Pre-screenshot status so the viewport never looks blank/broken while the
  // browser is launching or discovering pages.
  const prepLabel =
    phase === "connecting" || phase === "queued" || phase === "" ? "Launching secure browser…"
    : phase === "discovering" ? "Discovering pages…"
    : phase === "analyzing" ? "Analyzing results…"
    : "Preparing scan…";
  const host = (() => {
    try {
      return new URL(displayUrl).host;
    } catch {
      return displayUrl;
    }
  })();

  const pinCount = lastCaptured ? Math.min(lastCaptured.violations, PIN_SPOTS.length) : 0;
  const extraPins = lastCaptured ? Math.max(0, lastCaptured.violations - PIN_SPOTS.length) : 0;

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
      {/* Browser chrome */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/60">
        <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-red-400/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-green-400/80" />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0 h-7 px-3 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
          {displayUrl.startsWith("https") ? (
            <Lock className="h-3 w-3 text-green-500 shrink-0" aria-hidden="true" />
          ) : (
            <Globe className="h-3 w-3 text-neutral-400 shrink-0" aria-hidden="true" />
          )}
          <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300 truncate">
            <span className="text-neutral-400">{host}</span>
            <span className="text-neutral-700 dark:text-neutral-200">{pathOf(displayUrl)}</span>
          </span>
          {(isScanning || (isDiscovering && showLiveShot)) && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0 ml-auto" aria-hidden="true" />}
        </div>
      </div>

      {/* Page body */}
      <div
        className="relative aspect-[16/10] bg-neutral-100 dark:bg-neutral-950 overflow-hidden"
        role="img"
        aria-label={
          isScanning
            ? `Scanning ${displayUrl}`
            : isDiscovering && showLiveShot
            ? `Discovering pages, currently viewing ${displayUrl}`
            : lastCaptured
            ? `Last captured page ${lastCaptured.url}, accessibility score ${Math.round(lastCaptured.score)}`
            : "Waiting for the first page"
        }
      >
        {showLiveShot ? (
          // The live page the browser is on right now (discovery or scan). Keyed
          // by URL so a NEW page remounts (the scroll pan restarts from the top),
          // while re-polling the SAME page just swaps the src in place — the pan
          // continues uninterrupted. A tall capture (canScrollShot) is rendered
          // full-width/auto-height and translated top→footer; short/viewport
          // shots use the static top-crop.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={displayUrl || "live"}
            src={currentShot}
            alt={`Live view of ${displayUrl}`}
            className={
              scrolling
                ? "absolute inset-x-0 top-0 w-full h-auto animate-fade-in animate-scan-scroll"
                : "absolute inset-0 h-full w-full object-cover object-top animate-fade-in"
            }
            style={scrolling ? ({ "--scan-shift": `${scanShiftPct}%` } as React.CSSProperties) : undefined}
            decoding="async"
            onError={() => {
              const u = displayUrl;
              setFailedLiveUrls((s) => { const n = new Set(s); n.add(u); return n; });
            }}
          />
        ) : showShot && lastCaptured ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={lastCaptured.scanId}
            src={`/api/scan/${lastCaptured.scanId}/thumbnail`}
            alt={`Screenshot of ${lastCaptured.url}`}
            className="absolute inset-0 h-full w-full object-cover object-top animate-fade-in"
            loading="lazy"
            decoding="async"
            onError={() => {
              const id = lastCaptured.scanId;
              setFailedShots((s) => { const n = new Set(s); n.add(id); return n; });
            }}
          />
        ) : (
          // Wireframe skeleton + an intentional "what it's doing now" overlay,
          // so the early connecting/discovering phase reads as live activity
          // rather than a blank/broken panel.
          <>
            <div className="absolute inset-0 p-6 space-y-3 opacity-60" aria-hidden="true">
              <div className="h-8 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
              <div className="h-3 w-3/4 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
              <div className="h-3 w-2/3 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="h-20 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
                <div className="h-20 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
                <div className="h-20 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse-soft" />
              </div>
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" aria-hidden="true" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{prepLabel}</p>
              {host && <p className="text-xs font-mono text-neutral-500 truncate max-w-full">{host}</p>}
            </div>
          </>
        )}

        {/* Scanline sweep — the "crawling each element" motion. Runs while
            scanning AND while discovering over a live page, so the whole crawl
            reads as active page-by-page work. */}
        {(isScanning || (isDiscovering && showLiveShot)) && (
          <div
            className="absolute left-0 right-0 h-16 animate-scanline pointer-events-none"
            aria-hidden="true"
            style={{
              background: "linear-gradient(to bottom, transparent, rgb(59 130 246 / 0.18), rgb(59 130 246 / 0.45))",
              boxShadow: "0 1px 0 rgb(59 130 246 / 0.8)",
            }}
          />
        )}

        {/* Violation pins on the completed page */}
        {!isScanning &&
          Array.from({ length: pinCount }).map((_, i) => (
            <span
              key={i}
              className="absolute h-3.5 w-3.5 rounded-full bg-red-500/90 ring-2 ring-white/70 dark:ring-black/40 animate-ping"
              style={{ top: PIN_SPOTS[i].top, left: PIN_SPOTS[i].left }}
              aria-hidden="true"
            />
          ))}

        {/* Status chip */}
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          {isScanning ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-600/90 text-white shadow">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Scanning page…
            </span>
          ) : isDiscovering && showLiveShot ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-violet-600/90 text-white shadow">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Discovering pages…
            </span>
          ) : lastCaptured ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/95 dark:bg-neutral-900/95 shadow border border-neutral-200 dark:border-neutral-700">
              <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" /> Captured ·{" "}
              <span className={scoreText(lastCaptured.score)}>score {Math.round(lastCaptured.score)}</span>
              {lastCaptured.violations > 0 && (
                <span className="text-red-500">
                  · {lastCaptured.violations} issue{lastCaptured.violations === 1 ? "" : "s"}
                </span>
              )}
            </span>
          ) : null}
          {extraPins > 0 && !isScanning && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/90 text-white shadow">
              +{extraPins} more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
