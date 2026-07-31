/**
 * Tests for Organizational Accessibility Memory — the pure recall core:
 * evidence mapping, confidence grounding, and the reuse suggestion wording.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import { buildFixRecall } from "@/lib/memory/orgAccessibilityMemory";
import type { GenomeAggregate } from "@/lib/genome/fixGenome";

const agg = (over: Partial<GenomeAggregate>): GenomeAggregate => ({
  key: "k",
  ruleId: "image-alt",
  attempts: 5,
  successes: 4,
  successRate: 80,
  medianDaysToEffect: 2,
  lastObservedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("Organizational Accessibility Memory — buildFixRecall", () => {
  it("recalls precise same-component precedent and offers to reuse it", () => {
    const recall = buildFixRecall({
      ruleId: "image-alt",
      component: "header > nav .btn",
      fingerprint: "image-alt::header > nav .btn",
      componentAgg: agg({ key: "image-alt::header > nav .btn", successRate: 84, attempts: 6, successes: 5 }),
      ruleAgg: agg({ attempts: 12, successes: 10, successRate: 83 }),
      componentsFixedCount: 3,
    });
    expect(recall.hasPrecedent).toBe(true);
    expect(recall.confidence).toBe("high"); // 12 rule-level attempts ≥ high threshold
    expect(recall.onThisComponent?.successRate).toBe(84);
    expect(recall.suggestion).toContain("header > nav .btn");
    expect(recall.suggestion).toContain("84%");
    expect(recall.suggestion).toContain("Reuse that implementation?");
  });

  it("falls back to org-wide precedent when the component has no history", () => {
    const recall = buildFixRecall({
      ruleId: "label",
      component: ".checkout .field",
      fingerprint: "label::.checkout .field",
      componentAgg: null,
      ruleAgg: agg({ ruleId: "label", attempts: 8, successes: 7, successRate: 88 }),
      componentsFixedCount: 4,
    });
    expect(recall.onThisComponent).toBeNull();
    expect(recall.acrossOrg?.successRate).toBe(88);
    expect(recall.suggestion).toContain("88%");
    expect(recall.suggestion).toContain("4 components");
    expect(recall.suggestion).toContain("Apply the same approach");
  });

  it("reports no precedent gracefully when there is no history", () => {
    const recall = buildFixRecall({
      ruleId: "color-contrast",
      component: ".footer a",
      fingerprint: "color-contrast::.footer a",
      componentAgg: null,
      ruleAgg: null,
      componentsFixedCount: 0,
    });
    expect(recall.hasPrecedent).toBe(false);
    expect(recall.confidence).toBe("insufficient");
    expect(recall.suggestion).toContain("No verified fixes recorded");
  });

  it("does not claim precedent when attempts exist but all failed", () => {
    const recall = buildFixRecall({
      ruleId: "keyboard",
      component: "main .widget",
      fingerprint: "keyboard::main .widget",
      componentAgg: agg({ ruleId: "keyboard", attempts: 3, successes: 0, successRate: 0 }),
      ruleAgg: agg({ ruleId: "keyboard", attempts: 3, successes: 0, successRate: 0 }),
      componentsFixedCount: 0,
    });
    expect(recall.hasPrecedent).toBe(false);
    expect(recall.suggestion).toContain("No verified fixes recorded");
  });

  it("grades confidence by sample size", () => {
    const low = buildFixRecall({
      ruleId: "region",
      component: "x",
      fingerprint: "region::x",
      componentAgg: agg({ ruleId: "region", attempts: 1, successes: 1, successRate: 100 }),
      ruleAgg: agg({ ruleId: "region", attempts: 1, successes: 1, successRate: 100 }),
      componentsFixedCount: 1,
    });
    expect(low.confidence).toBe("low");
    // Small-sample org fallback should hedge — but here the component match wins.
    expect(low.onThisComponent?.attempts).toBe(1);
  });

  it("hedges org-wide suggestions on limited evidence", () => {
    const recall = buildFixRecall({
      ruleId: "bypass",
      component: ".nav",
      fingerprint: "bypass::.nav",
      componentAgg: null,
      ruleAgg: agg({ ruleId: "bypass", attempts: 1, successes: 1, successRate: 100 }),
      componentsFixedCount: 1,
    });
    expect(recall.confidence).toBe("low");
    expect(recall.suggestion).toContain("limited evidence");
  });
});
