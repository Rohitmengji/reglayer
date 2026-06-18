/**
 * ---------------------------------------------------------
 * RegLayer — Crawl Theater (PURE core)
 * ---------------------------------------------------------
 *
 * Purpose:
 * Turn the live crawl SSE event stream into the view-model that drives the
 * "watch the crawl happen" visualization (faux browser viewport, animated
 * site-map graph, completed-pages filmstrip).
 *
 * Why a PURE core (no React, no Prisma, no "server-only"):
 * The event-folding and graph-layout logic is the load-bearing part of the
 * feature and the easiest to get subtly wrong (edge de-dup, node creation
 * order, count reconciliation, deterministic layout). Keeping it pure means it
 * is exhaustively unit-testable with plain inputs — exactly like vault/chain.ts.
 *
 * The React components are thin: they call reduceTheaterEvent() as events
 * arrive and layoutSiteMap() to position nodes, and render the result.
 * ---------------------------------------------------------
 */

// ── View model ────────────────────────────────────────────────────────────

export type NodeStatus = "discovered" | "scanning" | "complete" | "error";

export interface SiteNode {
  url: string;
  /** BFS depth from the root (0 = root). Best-effort; may be undefined early. */
  depth: number;
  status: NodeStatus;
  score?: number;
  violations?: number;
  scanId?: string;
}

export interface SiteEdge {
  from: string;
  to: string;
}

export interface FilmstripEntry {
  url: string;
  scanId: string;
  score: number;
  violations: number;
}

export interface TheaterState {
  /** queued | connecting | discovering | scanning | analyzing | complete | cancelled */
  phase: string;
  rootUrl: string | null;
  /** Nodes keyed by URL. */
  nodes: Record<string, SiteNode>;
  /** Discovery order of node URLs (stable, drives deterministic layout). */
  order: string[];
  edges: SiteEdge[];
  /** The page whose scan is currently animating in the viewport (latest start). */
  current: { url: string } | null;
  /** The most recently completed page — its screenshot backs the viewport. */
  lastCaptured: { url: string; scanId: string; score: number; violations: number } | null;
  /** Completed pages in completion order (newest last). */
  filmstrip: FilmstripEntry[];
  counts: { discovered: number; scanned: number; failed: number };
  /**
   * Data-URL screenshot of the page the crawler is on RIGHT NOW (discovery or
   * scan). When present it backs the viewport directly — this is what lets the
   * live view show real pages page-by-page through the whole crawl, including
   * discovery. Sourced from the polled durable snapshot (LiveSnapshot.currentShot).
   */
  currentShot?: string;
  /** Aspect (height/width) of currentShot when tall → drives the scroll-to-footer pan. */
  currentShotAspect?: number;
}

// ── Events (subset of JobEvent the theater consumes) ────────────────────────

export type TheaterEvent =
  | { type: "phase"; phase: string }
  | {
      type: "progress";
      progress?: {
        phase?: string;
        pagesDiscovered?: number;
        pagesScanned?: number;
        pagesFailed?: number;
      };
    }
  | { type: "discovery"; url: string; source?: "sitemap" | "bfs"; from?: string; depth?: number }
  | { type: "page-start"; url: string }
  | { type: "page-complete"; url: string; scanId: string; score: number; violations: number }
  | { type: "page-error"; url: string; error?: string }
  | { type: string };

export function createInitialTheaterState(): TheaterState {
  return {
    phase: "queued",
    rootUrl: null,
    nodes: {},
    order: [],
    edges: [],
    current: null,
    lastCaptured: null,
    filmstrip: [],
    counts: { discovered: 0, scanned: 0, failed: 0 },
  };
}

// ── Reducer ─────────────────────────────────────────────────────────────────

/** Return a shallow clone with a fresh nodes map (so callers/React see a new ref). */
function clone(state: TheaterState): TheaterState {
  return {
    ...state,
    nodes: { ...state.nodes },
    order: state.order,
    edges: state.edges,
    filmstrip: state.filmstrip,
    counts: { ...state.counts },
  };
}

function ensureNode(next: TheaterState, url: string, depth?: number): SiteNode {
  let node = next.nodes[url];
  if (!node) {
    node = { url, depth: depth ?? 0, status: "discovered" };
    next.nodes[url] = node;
    // order is shared by reference until first mutation — copy on write.
    if (next.order === undefined || !Array.isArray(next.order)) next.order = [];
    next.order = [...next.order, url];
  } else if (depth !== undefined && (node.depth === 0 || depth < node.depth)) {
    // Prefer the shallowest known depth (a page can be reached many ways).
    node = { ...node, depth };
    next.nodes[url] = node;
  }
  return node;
}

/**
 * Fold one event into the theater state. Pure: never mutates `state`, always
 * returns a new object. Unknown event types are ignored (returns same state).
 */
export function reduceTheaterEvent(state: TheaterState, event: TheaterEvent): TheaterState {
  switch (event.type) {
    case "phase": {
      const next = clone(state);
      if (typeof (event as { phase?: string }).phase === "string") {
        next.phase = (event as { phase: string }).phase;
      }
      return next;
    }

    case "progress": {
      const next = clone(state);
      const p = (event as {
        progress?: { phase?: string; pagesDiscovered?: number; pagesScanned?: number; pagesFailed?: number };
      }).progress;
      if (p) {
        if (typeof p.phase === "string") next.phase = p.phase;
        // Reconcile counts with the authoritative server figures when present.
        if (typeof p.pagesDiscovered === "number") next.counts.discovered = Math.max(next.counts.discovered, p.pagesDiscovered);
        if (typeof p.pagesScanned === "number") next.counts.scanned = p.pagesScanned;
        if (typeof p.pagesFailed === "number") next.counts.failed = p.pagesFailed;
      }
      return next;
    }

    case "discovery": {
      const e = event as { url?: string; from?: string; depth?: number };
      if (!e.url) return state;
      const next = clone(state);
      const node = ensureNode(next, e.url, e.depth);
      if (next.rootUrl === null) {
        // First node we ever see anchors the graph: a depth-0 node is the root;
        // otherwise the node it came from is the root.
        next.rootUrl = node.depth === 0 ? e.url : (e.from ?? e.url);
      }
      if (e.from && e.from !== e.url) {
        ensureNode(next, e.from, node.depth > 0 ? node.depth - 1 : 0);
        const exists = next.edges.some((edge) => edge.from === e.from && edge.to === e.url);
        if (!exists) next.edges = [...next.edges, { from: e.from, to: e.url }];
      }
      next.counts.discovered = Math.max(next.counts.discovered, Object.keys(next.nodes).length);
      return next;
    }

    case "page-start": {
      const e = event as { url?: string };
      if (!e.url) return state;
      const next = clone(state);
      const node = ensureNode(next, e.url);
      next.nodes[e.url] = { ...node, status: "scanning" };
      next.current = { url: e.url };
      return next;
    }

    case "page-complete": {
      const e = event as { url?: string; scanId?: string; score?: number; violations?: number };
      if (!e.url || !e.scanId) return state;
      const next = clone(state);
      const node = ensureNode(next, e.url);
      const score = typeof e.score === "number" ? e.score : 0;
      const violations = typeof e.violations === "number" ? e.violations : 0;
      next.nodes[e.url] = { ...node, status: "complete", score, violations, scanId: e.scanId };
      next.lastCaptured = { url: e.url, scanId: e.scanId, score, violations };
      // Append to the filmstrip (newest last), de-duping by URL.
      next.filmstrip = [
        ...next.filmstrip.filter((f) => f.url !== e.url),
        { url: e.url, scanId: e.scanId, score, violations },
      ];
      next.counts = { ...next.counts, scanned: next.counts.scanned + 1 };
      return next;
    }

    case "page-error": {
      const e = event as { url?: string };
      if (!e.url) return state;
      const next = clone(state);
      const node = ensureNode(next, e.url);
      next.nodes[e.url] = { ...node, status: "error" };
      next.counts = { ...next.counts, failed: next.counts.failed + 1 };
      return next;
    }

    default:
      return state;
  }
}

// ── Site-map layout (deterministic, no randomness) ──────────────────────────

export interface NodePosition {
  url: string;
  /** Normalized [0,1] coordinates within the layout box. */
  x: number;
  y: number;
  depth: number;
}

export interface SiteMapLayout {
  positions: NodePosition[];
  /** Edges restricted to the laid-out (non-overflow) nodes. */
  edges: SiteEdge[];
  /** Nodes beyond the display cap that were omitted. */
  overflow: number;
}

export const SITEMAP_MAX_NODES = 64;

/**
 * Lay out nodes radially by depth: root at center, each deeper ring further
 * out, nodes within a ring spread evenly by angle. Deterministic — the same
 * state always yields the same coordinates (no Date/Math.random), so it is
 * stable across re-renders and unit-testable.
 */
export function layoutSiteMap(state: TheaterState, maxNodes: number = SITEMAP_MAX_NODES): SiteMapLayout {
  const allUrls = state.order.filter((u) => state.nodes[u]);
  const overflow = Math.max(0, allUrls.length - maxNodes);
  const urls = allUrls.slice(0, maxNodes);
  const shown = new Set(urls);

  // Group by depth, preserving discovery order within each ring.
  const byDepth = new Map<number, string[]>();
  let maxDepth = 0;
  for (const url of urls) {
    const d = state.nodes[url].depth;
    maxDepth = Math.max(maxDepth, d);
    const ring = byDepth.get(d) ?? [];
    ring.push(url);
    byDepth.set(d, ring);
  }

  const positions: NodePosition[] = [];
  const ringStep = maxDepth > 0 ? 0.5 / maxDepth : 0; // outermost ring radius ≈ 0.5
  for (const [depth, ring] of byDepth) {
    if (depth === 0) {
      // Root(s) cluster at the center.
      ring.forEach((url, i) => {
        const offset = ring.length === 1 ? 0 : (i / (ring.length - 1) - 0.5) * 0.08;
        positions.push({ url, x: 0.5 + offset, y: 0.5, depth });
      });
      continue;
    }
    const radius = depth * ringStep;
    const count = ring.length;
    ring.forEach((url, i) => {
      // Spread evenly; offset alternate rings by half a slot so rings don't align.
      const angle = (i / count) * Math.PI * 2 + (depth % 2) * (Math.PI / count);
      positions.push({
        url,
        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
        depth,
      });
    });
  }

  const edges = state.edges.filter((e) => shown.has(e.from) && shown.has(e.to));
  return { positions, edges, overflow };
}
