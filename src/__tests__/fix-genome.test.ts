/**
 * RegLayer — Fix Genome tests (pure core)
 *
 * Fingerprint normalization, outcome aggregation (success rate + median days-to-effect),
 * and confidence-rated recommendation. No Prisma, no Next.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeSelector,
  computeFingerprint,
  aggregateOutcomes,
  recommendForRule,
  CONFIDENCE_THRESHOLDS,
  type FixOutcome,
} from "@/lib/genome/fixGenome";

const at = (n: number) => new Date(Date.UTC(2026, 0, 1 + n, 12));

function outcome(over: Partial<FixOutcome> = {}): FixOutcome {
  return {
    ruleId: "color-contrast",
    fingerprint: "color-contrast::.btn",
    success: true,
    daysToEffect: 2,
    verifiedAt: at(0),
    ...over,
  };
}

describe("normalizeSelector", () => {
  it("drops positional pseudo-classes and genericizes ids, attrs, and digits", () => {
    expect(normalizeSelector("#user-42 > div:nth-child(3) .btn[data-x='9']")).toBe(
      "#id > div .btn[attr]"
    );
  });

  it("returns * for null/empty", () => {
    expect(normalizeSelector(null)).toBe("*");
    expect(normalizeSelector("")).toBe("*");
  });

  it("collapses two selectors that differ only by index/id to the same fingerprint", () => {
    const a = normalizeSelector("#row-1 td:nth-child(2) a");
    const b = normalizeSelector("#row-99 td:nth-child(7) a");
    expect(a).toBe(b);
  });
});

describe("computeFingerprint", () => {
  it("combines ruleId with the normalized selector", () => {
    expect(computeFingerprint("image-alt", "#hero-3 img")).toBe("image-alt::#id img");
  });
  it("falls back to * when no selector", () => {
    expect(computeFingerprint("image-alt")).toBe("image-alt::*");
  });
});

describe("aggregateOutcomes", () => {
  it("computes success rate and counts per rule", () => {
    const out = [
      outcome({ success: true }),
      outcome({ success: true }),
      outcome({ success: false }),
      outcome({ success: false }),
    ];
    const [agg] = aggregateOutcomes(out);
    expect(agg.attempts).toBe(4);
    expect(agg.successes).toBe(2);
    expect(agg.successRate).toBe(50);
  });

  it("computes median days-to-effect over SUCCESSFUL outcomes only", () => {
    const out = [
      outcome({ success: true, daysToEffect: 1 }),
      outcome({ success: true, daysToEffect: 3 }),
      outcome({ success: true, daysToEffect: 11 }),
      outcome({ success: false, daysToEffect: 0 }), // excluded from duration
    ];
    const [agg] = aggregateOutcomes(out);
    expect(agg.medianDaysToEffect).toBe(3);
  });

  it("ignores null / negative durations and reports null when none are usable", () => {
    const out = [
      outcome({ success: true, daysToEffect: null }),
      outcome({ success: true, daysToEffect: -5 }),
    ];
    const [agg] = aggregateOutcomes(out);
    expect(agg.medianDaysToEffect).toBeNull();
  });

  it("groups by rule vs fingerprint", () => {
    const out = [
      outcome({ ruleId: "label", fingerprint: "label::.a" }),
      outcome({ ruleId: "label", fingerprint: "label::.b" }),
    ];
    expect(aggregateOutcomes(out, { by: "rule" })).toHaveLength(1);
    expect(aggregateOutcomes(out, { by: "fingerprint" })).toHaveLength(2);
  });

  it("sorts best success rate (then sample size) first", () => {
    const out = [
      outcome({ ruleId: "a", fingerprint: "a::x", success: false }),
      outcome({ ruleId: "b", fingerprint: "b::x", success: true }),
    ];
    const aggs = aggregateOutcomes(out);
    expect(aggs[0].ruleId).toBe("b"); // 100% before 0%
  });
});

describe("recommendForRule", () => {
  function manyOutcomes(ruleId: string, n: number, successes: number): FixOutcome[] {
    return Array.from({ length: n }, (_, i) =>
      outcome({ ruleId, fingerprint: `${ruleId}::.x`, success: i < successes, daysToEffect: 4 })
    );
  }

  it("returns found=false with an insufficient verdict when the rule is unseen", () => {
    const r = recommendForRule("keyboard", aggregateOutcomes(manyOutcomes("image-alt", 5, 5)));
    expect(r.found).toBe(false);
    expect(r.confidence).toBe("insufficient");
  });

  it("rates confidence by sample size (high/medium/low)", () => {
    const high = recommendForRule("r", aggregateOutcomes(manyOutcomes("r", CONFIDENCE_THRESHOLDS.high, CONFIDENCE_THRESHOLDS.high)));
    expect(high.confidence).toBe("high");
    const medium = recommendForRule("r", aggregateOutcomes(manyOutcomes("r", CONFIDENCE_THRESHOLDS.medium, 3)));
    expect(medium.confidence).toBe("medium");
    const low = recommendForRule("r", aggregateOutcomes(manyOutcomes("r", 1, 1)));
    expect(low.confidence).toBe("low");
  });

  it("reports the success rate and a non-empty message for a known rule", () => {
    const r = recommendForRule("color-contrast", aggregateOutcomes(manyOutcomes("color-contrast", 10, 8)));
    expect(r.found).toBe(true);
    expect(r.successRate).toBe(80);
    expect(r.attempts).toBe(10);
    expect(r.message.length).toBeGreaterThan(0);
  });
});
