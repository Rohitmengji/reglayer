"use client";

/**
 * CrawlSiteMap — animated SVG graph of the site as it's discovered & scanned.
 *
 * Nodes appear (and link to their parent) on discovery events, then recolor by
 * accessibility score as each page completes. It gives the "crawling the whole
 * site, page by page" story at a glance. Purely decorative (aria-hidden) — the
 * authoritative, screen-reader-friendly progress lives in the live results
 * list and stat cards.
 *
 * Layout is computed by the pure layoutSiteMap() so it is deterministic and
 * stable across re-renders.
 */

import { useMemo } from "react";
import { layoutSiteMap, type TheaterState, type NodeStatus } from "@/lib/crawl-viz/crawlTheater";

interface CrawlSiteMapProps {
  state: TheaterState;
}

// viewBox with a margin so edge nodes (and their radius) aren't clipped.
const VB = { min: -6, size: 112 };

function nodeFill(status: NodeStatus, score?: number): string {
  switch (status) {
    case "scanning":
      return "#3b82f6"; // blue-500
    case "error":
      return "#ef4444"; // red-500
    case "complete":
      if ((score ?? 0) >= 90) return "#22c55e"; // green-500
      if ((score ?? 0) >= 70) return "#f59e0b"; // amber-500
      return "#ef4444"; // red-500
    default:
      return "#a1a1aa"; // zinc-400 (discovered)
  }
}

export function CrawlSiteMap({ state }: CrawlSiteMapProps) {
  const { positions, edges, overflow } = useMemo(() => layoutSiteMap(state), [state]);
  // Normalized [0,1] coords → viewBox units (0..100).
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const p of positions) m.set(p.url, { x: p.x * 100, y: p.y * 100 });
    return m;
  }, [positions]);

  if (positions.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-xs text-neutral-400">
        Discovering pages…
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`${VB.min} ${VB.min} ${VB.size} ${VB.size}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* Edges */}
        <g stroke="currentColor" className="text-neutral-300 dark:text-neutral-700" strokeWidth={0.4}>
          {edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) return null;
            return <line key={`${e.from}->${e.to}-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {/* Nodes */}
        {positions.map((p) => {
          const node = state.nodes[p.url];
          const fill = nodeFill(node.status, node.score);
          const r = p.depth === 0 ? 2.6 : node.status === "scanning" ? 2.2 : 1.7;
          return (
            <g key={p.url} className="animate-node-pop">
              {node.status === "scanning" && (
                <circle cx={p.x * 100} cy={p.y * 100} r={r + 1.4} fill={fill} opacity={0.3} className="animate-ping" />
              )}
              <circle
                cx={p.x * 100}
                cy={p.y * 100}
                r={r}
                fill={fill}
                stroke="white"
                strokeWidth={0.4}
                className="dark:stroke-neutral-900"
              />
            </g>
          );
        })}
      </svg>

      {overflow > 0 && (
        <div className="absolute bottom-1 right-1 text-[10px] text-neutral-400 bg-white/70 dark:bg-neutral-900/70 rounded px-1.5 py-0.5">
          +{overflow} more pages
        </div>
      )}
    </div>
  );
}
