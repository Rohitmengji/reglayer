/**
 * Tests for Accessibility Regression DNA — the pure lineage reconstruction and
 * the next-sprint regression predictor.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import {
  buildRegressionDNA,
  predictRegressions,
  inferRootCause,
  type ScanPresencePoint,
  type RegressionDNA,
} from "@/lib/intelligence/regressionDNA";

const day = (n: number) => new Date(2026, 0, n);
const pt = (n: number, present: boolean): ScanPresencePoint => ({ completedAt: day(n), present });

describe("Accessibility Regression DNA", () => {
  describe("buildRegressionDNA", () => {
    it("reconstructs an appear → fix → return lineage", () => {
      const dna = buildRegressionDNA(
        "image-alt::.hero img",
        "image-alt",
        ".hero img",
        [pt(1, true), pt(5, false), pt(11, true)],
        day(12),
      )!;
      expect(dna.events.map((e) => e.type)).toEqual(["appeared", "fixed", "returned"]);
      expect(dna.fixes).toBe(1);
      expect(dna.returns).toBe(1);
      expect(dna.currentState).toBe("open");
      expect(dna.meanFixSurvivalDays).toBe(6); // fixed day5 → returned day11
      expect(dna.firstAppearedAt).toBe(day(1).toISOString());
    });

    it("flags a chronic barrier that returns repeatedly", () => {
      const dna = buildRegressionDNA(
        "label::.form input",
        "label",
        ".form input",
        [pt(1, true), pt(3, false), pt(5, true), pt(7, false), pt(9, true)],
        day(10),
      )!;
      expect(dna.returns).toBe(2);
      expect(dna.fixes).toBe(2);
      expect(dna.chronic).toBe(true);
      expect(dna.currentState).toBe("open");
    });

    it("reports fixed state when the latest scan is clean", () => {
      const dna = buildRegressionDNA("region::main", "region", "main", [pt(1, true), pt(5, false)], day(6))!;
      expect(dna.currentState).toBe("fixed");
      expect(dna.lastFixedAt).toBe(day(5).toISOString());
    });

    it("returns null when the fingerprint never appeared", () => {
      expect(buildRegressionDNA("x::y", "x", "y", [pt(1, false), pt(2, false)])).toBeNull();
    });

    it("computes volatility from state flips", () => {
      const flappy = buildRegressionDNA("k::c", "keyboard", "c", [pt(1, true), pt(2, false), pt(3, true), pt(4, false)], day(5))!;
      expect(flappy.volatility).toBe(1); // every transition flipped
      const stable = buildRegressionDNA("k::c", "keyboard", "c", [pt(1, true), pt(2, true), pt(3, true)], day(4))!;
      expect(stable.volatility).toBe(0);
    });
  });

  describe("inferRootCause", () => {
    it("maps rules to a root-cause class", () => {
      expect(inferRootCause("image-alt")).toContain("content-value drift");
      expect(inferRootCause("color-contrast")).toContain("design-system drift");
      expect(inferRootCause("region")).toContain("structural markup");
      expect(inferRootCause("totally-unknown")).toContain("unclassified");
    });
  });

  describe("predictRegressions", () => {
    const base: RegressionDNA = {
      fingerprint: "f", ruleId: "image-alt", component: ".c", rootCause: inferRootCause("image-alt"),
      firstAppearedAt: day(1).toISOString(), currentState: "fixed", scansAnalyzed: 6, presentScans: 3,
      fixes: 3, returns: 3, volatility: 0.8, meanFixSurvivalDays: 5, lastFixedAt: day(20).toISOString(),
      lastReturnedAt: day(15).toISOString(), daysSinceLastChange: 2, chronic: true, events: [],
    };

    it("predicts an imminent regression for a fixed, flaky, short-survival fingerprint", () => {
      const [p] = predictRegressions([base], { sprintDays: 14 });
      expect(p.probability).toBeGreaterThan(0.5);
      expect(p.expectedDaysToRegress).toBe(3); // 5 mean survival − 2 since fixed
      expect(p.reason).toContain("within the sprint");
    });

    it("ignores fingerprints with no regression history", () => {
      const clean = { ...base, returns: 0, fixes: 1, chronic: false };
      expect(predictRegressions([clean])).toHaveLength(0);
    });

    it("discounts currently-open barriers below imminent regressions", () => {
      const openOne = { ...base, currentState: "open" as const, fingerprint: "open" };
      const fixedOne = { ...base, fingerprint: "fixed" };
      const preds = predictRegressions([openOne, fixedOne], { sprintDays: 14 });
      expect(preds[0].fingerprint).toBe("fixed");
      expect(preds.find((p) => p.fingerprint === "open")!.probability)
        .toBeLessThan(preds.find((p) => p.fingerprint === "fixed")!.probability);
    });

    it("grades confidence by number of fixes observed", () => {
      const [high] = predictRegressions([{ ...base, fixes: 5, returns: 4 }]);
      const [low] = predictRegressions([{ ...base, fixes: 1, returns: 1 }]);
      expect(high.confidence).toBe("high");
      expect(low.confidence).toBe("low");
    });
  });
});
