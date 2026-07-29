/**
 * Incremental audit intelligence.
 *
 * These decisions are customer-visible: a skipped page is a page nobody looked at, and
 * a missed regression is effort silently wasted. Both failures are quiet, so the rules
 * are pinned explicitly.
 */

import { describe, it, expect } from "vitest";
import {
  computeAuditProgress,
  DEFAULT_RESCAN_POLICY,
  detectRegressions,
  selectPagesForRescan,
  type PageState,
  type RuleSnapshot,
} from "@/lib/ai/audit/incremental";

const NOW = new Date("2026-06-01T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

function page(overrides: Partial<PageState> & { url: string }): PageState {
  return {
    contentHash: "hash-a",
    lastScannedAt: daysAgo(1),
    worstImpact: null,
    openViolations: 0,
    ...overrides,
  };
}

const urls = (decisions: { url: string }[]) => decisions.map((d) => d.url);

describe("re-scan selection", () => {
  it("puts never-scanned pages first, because unknown risk outranks known risk", () => {
    const decisions = selectPagesForRescan([
      page({ url: "/known", worstImpact: "critical", openViolations: 5, lastScannedAt: daysAgo(60) }),
      page({ url: "/new", contentHash: null, lastScannedAt: null }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    expect(urls(decisions)[0]).toBe("/new");
  });

  it("re-scans a page whose rendered content changed", () => {
    const decisions = selectPagesForRescan([
      page({ url: "/changed", contentHash: "old", currentHash: "new" }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    expect(decisions[0]).toMatchObject({ url: "/changed", reason: "content-changed" });
  });

  it("skips a recently scanned page whose content is unchanged", () => {
    const decisions = selectPagesForRescan([
      page({ url: "/same", contentHash: "h", currentHash: "h" }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    // Re-scanning an unchanged page spends budget that an unknown page needs.
    expect(decisions).toHaveLength(0);
  });

  it("does not treat an unknown current hash as proof of no change", () => {
    // Absence of evidence must not read as evidence of absence.
    const decisions = selectPagesForRescan([
      page({ url: "/unknown", contentHash: "h", currentHash: undefined, lastScannedAt: daysAgo(60) }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    expect(decisions[0].reason).toBe("stale");
  });

  it("rechecks severe pages on a shorter cycle than clean ones", () => {
    const decisions = selectPagesForRescan([
      page({ url: "/severe", worstImpact: "critical", openViolations: 3, lastScannedAt: daysAgo(10) }),
      page({ url: "/clean", lastScannedAt: daysAgo(10) }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    // 10 days exceeds the severe cycle (7) but not the general one (30).
    expect(urls(decisions)).toEqual(["/severe"]);
  });

  it("prioritises a changed page that previously carried critical findings", () => {
    const decisions = selectPagesForRescan([
      page({ url: "/changed-minor", contentHash: "a", currentHash: "b", worstImpact: "minor" }),
      page({ url: "/changed-critical", contentHash: "a", currentHash: "b", worstImpact: "critical" }),
    ], DEFAULT_RESCAN_POLICY, NOW);

    expect(urls(decisions)[0]).toBe("/changed-critical");
  });

  it("respects the crawl budget", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      page({ url: `/p${i}`, contentHash: null, lastScannedAt: null }),
    );

    const decisions = selectPagesForRescan(many, { ...DEFAULT_RESCAN_POLICY, maxPages: 10 }, NOW);

    expect(decisions).toHaveLength(10);
  });

  it("is deterministic, so a skipped page can be explained", () => {
    const pages = [
      page({ url: "/b", contentHash: null, lastScannedAt: null }),
      page({ url: "/a", contentHash: null, lastScannedAt: null }),
    ];

    expect(urls(selectPagesForRescan(pages, DEFAULT_RESCAN_POLICY, NOW)))
      .toEqual(urls(selectPagesForRescan(pages, DEFAULT_RESCAN_POLICY, NOW)));
  });

  it("handles an empty site", () => {
    expect(selectPagesForRescan([], DEFAULT_RESCAN_POLICY, NOW)).toEqual([]);
  });
});

describe("audit progress", () => {
  it("reports coverage separately from violation counts", () => {
    const progress = computeAuditProgress([
      page({ url: "/1", openViolations: 0 }),
      page({ url: "/2", contentHash: null, lastScannedAt: null }),
    ]);

    // "Zero violations" means something very different at 50% coverage than at 100%.
    expect(progress.coverage).toBe(0.5);
    expect(progress.openViolations).toBe(0);
  });

  it("surfaces the worst impact still open anywhere", () => {
    const progress = computeAuditProgress([
      page({ url: "/1", worstImpact: "minor", openViolations: 2 }),
      page({ url: "/2", worstImpact: "critical", openViolations: 1 }),
    ]);

    expect(progress.worstOpenImpact).toBe("critical");
  });

  it("ignores the historical impact of a page that is now clean", () => {
    const progress = computeAuditProgress([
      page({ url: "/fixed", worstImpact: "critical", openViolations: 0 }),
    ]);

    expect(progress.worstOpenImpact).toBeNull();
    expect(progress.pagesClean).toBe(1);
  });

  it("handles a site with no pages discovered yet", () => {
    expect(computeAuditProgress([])).toMatchObject({ coverage: 0, totalPages: 0 });
  });
});

describe("regression detection", () => {
  const finding = (url: string, ruleId: string): RuleSnapshot =>
    ({ url, ruleId, impact: "serious" });

  it("flags a fix that did not hold", () => {
    const regressions = detectRegressions(
      [finding("/checkout", "color-contrast")],  // originally present
      [],                                        // fixed
      [finding("/checkout", "color-contrast")],  // back again
    );

    // Reporting this as merely "a new violation" hides that effort was already spent.
    expect(regressions).toEqual([
      { url: "/checkout", ruleId: "color-contrast", impact: "serious" },
    ]);
  });

  it("does not flag a genuinely new violation", () => {
    const regressions = detectRegressions([], [], [finding("/new-page", "image-alt")]);

    // Sites evolve; a first-time finding is ordinary, not a regression.
    expect(regressions).toEqual([]);
  });

  it("does not flag a violation that was never fixed", () => {
    const regressions = detectRegressions(
      [finding("/a", "label")],
      [finding("/a", "label")],  // still present — never resolved
      [finding("/a", "label")],
    );

    expect(regressions).toEqual([]);
  });

  it("distinguishes the same rule on different pages", () => {
    const regressions = detectRegressions(
      [finding("/a", "label")],
      [],
      [finding("/b", "label")],
    );

    // A fix on /a says nothing about /b.
    expect(regressions).toEqual([]);
  });
});
