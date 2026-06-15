/**
 * RegLayer — Crawl Theater (live visualization) Tests
 *
 * WHY: The reducer folds an unordered, partially-typed SSE event stream into
 *      the view-model that drives the live crawl visualization. Edge de-dup,
 *      node-creation order, count reconciliation, and deterministic layout are
 *      all easy to get subtly wrong — and a wrong graph reads as a broken crawl.
 * WHAT: Exhaustive unit tests of reduceTheaterEvent + layoutSiteMap.
 * HOW: Pure functions, plain inputs, no mocks.
 */
import { describe, it, expect } from "vitest";
import {
  createInitialTheaterState,
  reduceTheaterEvent,
  layoutSiteMap,
  SITEMAP_MAX_NODES,
  type TheaterState,
  type TheaterEvent,
} from "@/lib/crawl-viz/crawlTheater";

function run(events: TheaterEvent[]): TheaterState {
  return events.reduce(reduceTheaterEvent, createInitialTheaterState());
}

describe("crawlTheater — initial state", () => {
  it("starts empty and queued", () => {
    const s = createInitialTheaterState();
    expect(s.phase).toBe("queued");
    expect(s.rootUrl).toBeNull();
    expect(s.order).toEqual([]);
    expect(s.edges).toEqual([]);
    expect(s.filmstrip).toEqual([]);
    expect(s.counts).toEqual({ discovered: 0, scanned: 0, failed: 0 });
  });
});

describe("crawlTheater — discovery & graph building", () => {
  it("creates a root node from a depth-0 discovery", () => {
    const s = run([{ type: "discovery", url: "https://x.com/", source: "bfs", depth: 0 }]);
    expect(s.rootUrl).toBe("https://x.com/");
    expect(s.nodes["https://x.com/"].depth).toBe(0);
    expect(s.nodes["https://x.com/"].status).toBe("discovered");
    expect(s.order).toEqual(["https://x.com/"]);
  });

  it("adds a parent->child edge and creates the parent node if unseen", () => {
    const s = run([
      { type: "discovery", url: "https://x.com/about", source: "bfs", from: "https://x.com/", depth: 1 },
    ]);
    // both nodes exist even though the parent was never discovered on its own
    expect(s.nodes["https://x.com/"]).toBeTruthy();
    expect(s.nodes["https://x.com/about"]).toBeTruthy();
    expect(s.edges).toEqual([{ from: "https://x.com/", to: "https://x.com/about" }]);
    // first node anchored the root via its `from`
    expect(s.rootUrl).toBe("https://x.com/");
  });

  it("de-dupes repeated edges", () => {
    const s = run([
      { type: "discovery", url: "https://x.com/a", from: "https://x.com/", depth: 1 },
      { type: "discovery", url: "https://x.com/a", from: "https://x.com/", depth: 1 },
    ]);
    expect(s.edges).toHaveLength(1);
    expect(s.order.filter((u) => u === "https://x.com/a")).toHaveLength(1);
  });

  it("handles sitemap events that reference the root before the root is visited", () => {
    // Real ordering: sitemap URLs (from=root) are emitted before BFS visits root.
    const s = run([
      { type: "discovery", url: "https://x.com/p1", source: "sitemap", from: "https://x.com/", depth: 1 },
      { type: "discovery", url: "https://x.com/", source: "bfs", depth: 0 },
    ]);
    expect(s.rootUrl).toBe("https://x.com/");
    expect(s.nodes["https://x.com/"].depth).toBe(0);
    expect(s.edges).toEqual([{ from: "https://x.com/", to: "https://x.com/p1" }]);
  });

  it("prefers the shallowest known depth for a node reached multiple ways", () => {
    const s = run([
      { type: "discovery", url: "https://x.com/deep", from: "https://x.com/b", depth: 3 },
      { type: "discovery", url: "https://x.com/deep", from: "https://x.com/", depth: 1 },
    ]);
    expect(s.nodes["https://x.com/deep"].depth).toBe(1);
  });

  it("does not create a self-edge", () => {
    const s = run([{ type: "discovery", url: "https://x.com/", from: "https://x.com/", depth: 0 }]);
    expect(s.edges).toEqual([]);
  });
});

describe("crawlTheater — scanning lifecycle", () => {
  it("page-start marks the node scanning and sets current", () => {
    const s = run([
      { type: "discovery", url: "https://x.com/", depth: 0 },
      { type: "page-start", url: "https://x.com/" },
    ]);
    expect(s.nodes["https://x.com/"].status).toBe("scanning");
    expect(s.current).toEqual({ url: "https://x.com/" });
  });

  it("page-complete records score/violations, filmstrip, lastCaptured, and count", () => {
    const s = run([
      { type: "page-start", url: "https://x.com/" },
      { type: "page-complete", url: "https://x.com/", scanId: "scan_1", score: 88, violations: 4 },
    ]);
    const node = s.nodes["https://x.com/"];
    expect(node.status).toBe("complete");
    expect(node.score).toBe(88);
    expect(node.violations).toBe(4);
    expect(node.scanId).toBe("scan_1");
    expect(s.lastCaptured).toEqual({ url: "https://x.com/", scanId: "scan_1", score: 88, violations: 4 });
    expect(s.filmstrip).toEqual([{ url: "https://x.com/", scanId: "scan_1", score: 88, violations: 4 }]);
    expect(s.counts.scanned).toBe(1);
  });

  it("ignores a page-complete with no scanId (cannot lazy-load a thumbnail)", () => {
    const before = run([{ type: "page-start", url: "https://x.com/" }]);
    const after = reduceTheaterEvent(before, { type: "page-complete", url: "https://x.com/" } as TheaterEvent);
    expect(after).toBe(before); // unchanged reference
    expect(after.counts.scanned).toBe(0);
  });

  it("de-dupes filmstrip by URL (a re-scanned page replaces its entry)", () => {
    const s = run([
      { type: "page-complete", url: "https://x.com/a", scanId: "s1", score: 50, violations: 9 },
      { type: "page-complete", url: "https://x.com/b", scanId: "s2", score: 70, violations: 3 },
      { type: "page-complete", url: "https://x.com/a", scanId: "s3", score: 90, violations: 1 },
    ]);
    expect(s.filmstrip.map((f) => f.url)).toEqual(["https://x.com/b", "https://x.com/a"]);
    expect(s.filmstrip.find((f) => f.url === "https://x.com/a")?.scanId).toBe("s3");
  });

  it("page-error marks the node and increments failed", () => {
    const s = run([
      { type: "page-start", url: "https://x.com/bad" },
      { type: "page-error", url: "https://x.com/bad", error: "timeout" },
    ]);
    expect(s.nodes["https://x.com/bad"].status).toBe("error");
    expect(s.counts.failed).toBe(1);
  });
});

describe("crawlTheater — progress reconciliation", () => {
  it("syncs phase and authoritative counts from progress events", () => {
    const s = run([
      { type: "phase", phase: "discovering" },
      { type: "progress", progress: { phase: "scanning", pagesDiscovered: 12, pagesScanned: 5, pagesFailed: 1 } },
    ]);
    expect(s.phase).toBe("scanning");
    expect(s.counts.discovered).toBe(12);
    expect(s.counts.scanned).toBe(5);
    expect(s.counts.failed).toBe(1);
  });

  it("never lets discovered count go backwards", () => {
    const s = run([
      { type: "progress", progress: { pagesDiscovered: 20 } },
      { type: "progress", progress: { pagesDiscovered: 3 } },
    ]);
    expect(s.counts.discovered).toBe(20);
  });
});

describe("crawlTheater — purity", () => {
  it("never mutates the input state", () => {
    const base = createInitialTheaterState();
    const frozen = JSON.stringify(base);
    reduceTheaterEvent(base, { type: "discovery", url: "https://x.com/", depth: 0 });
    reduceTheaterEvent(base, { type: "page-complete", url: "https://x.com/", scanId: "s", score: 1, violations: 0 });
    expect(JSON.stringify(base)).toBe(frozen);
  });

  it("ignores unknown event types", () => {
    const base = createInitialTheaterState();
    const after = reduceTheaterEvent(base, { type: "auth-status" } as TheaterEvent);
    expect(after).toBe(base);
  });
});

describe("crawlTheater — layoutSiteMap", () => {
  it("places a lone root at the center", () => {
    const s = run([{ type: "discovery", url: "https://x.com/", depth: 0 }]);
    const layout = layoutSiteMap(s);
    expect(layout.positions).toHaveLength(1);
    expect(layout.positions[0]).toMatchObject({ url: "https://x.com/", x: 0.5, y: 0.5, depth: 0 });
    expect(layout.overflow).toBe(0);
  });

  it("is deterministic — same state yields identical coordinates", () => {
    const events: TheaterEvent[] = [
      { type: "discovery", url: "https://x.com/", depth: 0 },
      { type: "discovery", url: "https://x.com/a", from: "https://x.com/", depth: 1 },
      { type: "discovery", url: "https://x.com/b", from: "https://x.com/", depth: 1 },
      { type: "discovery", url: "https://x.com/c", from: "https://x.com/a", depth: 2 },
    ];
    const a = layoutSiteMap(run(events));
    const b = layoutSiteMap(run(events));
    expect(a.positions).toEqual(b.positions);
  });

  it("keeps all positions within the unit box", () => {
    const events: TheaterEvent[] = [{ type: "discovery", url: "https://x.com/", depth: 0 }];
    for (let i = 0; i < 20; i++) {
      events.push({ type: "discovery", url: `https://x.com/p${i}`, from: "https://x.com/", depth: 1 });
    }
    const layout = layoutSiteMap(run(events));
    for (const p of layout.positions) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("caps the node count and reports overflow, restricting edges to shown nodes", () => {
    const events: TheaterEvent[] = [{ type: "discovery", url: "https://x.com/", depth: 0 }];
    const total = SITEMAP_MAX_NODES + 10;
    for (let i = 0; i < total; i++) {
      events.push({ type: "discovery", url: `https://x.com/p${i}`, from: "https://x.com/", depth: 1 });
    }
    const layout = layoutSiteMap(run(events));
    expect(layout.positions).toHaveLength(SITEMAP_MAX_NODES);
    expect(layout.overflow).toBe(total + 1 - SITEMAP_MAX_NODES); // +1 for the root
    const shown = new Set(layout.positions.map((p) => p.url));
    for (const e of layout.edges) {
      expect(shown.has(e.from)).toBe(true);
      expect(shown.has(e.to)).toBe(true);
    }
  });
});
