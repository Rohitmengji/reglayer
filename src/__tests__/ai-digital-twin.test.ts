/**
 * Tests for the Accessibility Digital Twin — the pure what-if simulation core:
 * fix selection, score/risk forecasting, and revenue scenario bands.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import {
  simulateDigitalTwin,
  resolveFixSelection,
  DEFAULT_ASSUMPTIONS,
  type TwinViolation,
} from "@/lib/simulator/digitalTwin";

const v = (id: string, ruleId: string, impact: string, nodes = 1): TwinViolation => ({
  id,
  ruleId,
  impact,
  affectedElements: Array.from({ length: nodes }, () => ({ html: "<x>", target: [".x"], failureSummary: "" })),
  url: "https://shop.example.com",
});

const sampleViolations: TwinViolation[] = [
  v("a", "image-alt", "critical", 3),
  v("b", "label", "serious", 2),
  v("c", "color-contrast", "moderate", 5),
  v("d", "region", "minor", 1),
];

describe("Accessibility Digital Twin", () => {
  describe("resolveFixSelection", () => {
    it("selects explicit violationIds when provided", () => {
      const ids = resolveFixSelection(sampleViolations, { violationIds: ["a", "c"] });
      expect([...ids].sort()).toEqual(["a", "c"]);
    });

    it("selects only critical for the critical strategy", () => {
      const ids = resolveFixSelection(sampleViolations, { strategy: "critical" });
      expect([...ids]).toEqual(["a"]);
    });

    it("selects critical + serious", () => {
      const ids = resolveFixSelection(sampleViolations, { strategy: "critical-serious" });
      expect([...ids].sort()).toEqual(["a", "b"]);
    });

    it("selects only litigation-driving rules", () => {
      const ids = resolveFixSelection(sampleViolations, { strategy: "litigation-drivers" });
      // image-alt, label, color-contrast are drivers; region is not.
      expect([...ids].sort()).toEqual(["a", "b", "c"]);
    });
  });

  describe("simulateDigitalTwin", () => {
    it("raises the score when issues are fixed", () => {
      const twin = simulateDigitalTwin(sampleViolations, new Set(["a", "b", "c", "d"]));
      expect(twin.score.after).toBe(100); // all fixed → perfect
      expect(twin.score.delta).toBeGreaterThan(0);
      expect(twin.fixed.count).toBe(4);
      expect(twin.fixed.remaining).toBe(0);
    });

    it("lowers legal risk and expected lawsuit probability", () => {
      const twin = simulateDigitalTwin(sampleViolations, new Set(["a", "b", "c"]), {
        assumptions: { industry: "ecommerce", geo: "NY" },
      });
      expect(twin.risk.after.lawsuitProbability).toBeLessThan(twin.risk.before.lawsuitProbability);
      expect(twin.risk.after.estimatedExposure).toBeLessThan(twin.risk.before.estimatedExposure);
      expect(twin.risk.legalCostAvoidedAnnual).toBeGreaterThan(0);
    });

    it("orders revenue scenarios conservative < likely < optimistic", () => {
      const twin = simulateDigitalTwin(sampleViolations, new Set(["a", "b", "c", "d"]), {
        assumptions: { monthlyVisitors: 50_000, conversionRate: 0.03, averageOrderValue: 120 },
      });
      const { conservative, likely, optimistic } = twin.scenarios;
      expect(conservative.totalAnnualBenefit).toBeLessThan(likely.totalAnnualBenefit);
      expect(likely.totalAnnualBenefit).toBeLessThan(optimistic.totalAnnualBenefit);
    });

    it("credits SEO uplift only for SEO-relevant fixes", () => {
      const withSeo = simulateDigitalTwin(sampleViolations, new Set(["a"])); // image-alt = SEO rule
      const withoutSeo = simulateDigitalTwin(sampleViolations, new Set(["d"])); // region = not SEO
      expect(withSeo.seo.fixCount).toBe(1);
      expect(withSeo.seo.upliftPct).toBeGreaterThan(0);
      expect(withoutSeo.seo.fixCount).toBe(0);
      expect(withoutSeo.seo.upliftPct).toBe(0);
    });

    it("is a no-op mirror when nothing is fixed", () => {
      const twin = simulateDigitalTwin(sampleViolations, new Set());
      expect(twin.score.delta).toBe(0);
      expect(twin.scenarios.likely.totalAnnualBenefit).toBe(0);
      expect(twin.narrative).toContain("today");
    });

    it("is deterministic — same inputs yield identical output", () => {
      const set = new Set(["a", "b"]);
      const one = simulateDigitalTwin(sampleViolations, set);
      const two = simulateDigitalTwin(sampleViolations, set);
      expect(one).toEqual(two);
    });

    it("applies default assumptions when none supplied", () => {
      const twin = simulateDigitalTwin(sampleViolations, new Set(["a"]));
      expect(twin.assumptions).toEqual(DEFAULT_ASSUMPTIONS);
    });
  });
});
