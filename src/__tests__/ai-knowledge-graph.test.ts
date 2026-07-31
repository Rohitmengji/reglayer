/**
 * Tests for the Accessibility Knowledge Graph (aggregate, cross-scan) pure logic:
 * component identity, legal-risk ranking, and fix→reappear regression detection.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/database/prisma", () => ({ prisma: {} }));

import {
  componentSignature,
  impactWeight,
  rankComponentsByRisk,
  detectRegressionCycles,
  summarizeRegressions,
  type GraphViolationInput,
  type ScanPoint,
} from "@/lib/ai/graph/knowledge-graph";

const el = (target: string) => ({ affectedElements: [{ html: "<button>", target: [target], failureSummary: "" }] });

describe("Accessibility Knowledge Graph", () => {
  describe("componentSignature", () => {
    it("collapses ids and positional selectors to a stable structural signature", () => {
      const a = componentSignature(el("#user-42 > div:nth-child(3) .btn").affectedElements);
      const b = componentSignature(el("#user-99 > div:nth-child(7) .btn").affectedElements);
      expect(a).toBe(b);
      expect(a).toContain(".btn");
    });

    it("falls back to page-level for missing selectors", () => {
      expect(componentSignature(null)).toBe("*");
      expect(componentSignature([])).toBe("*");
    });
  });

  describe("impactWeight", () => {
    it("ranks critical above minor and defaults unknown to 1", () => {
      expect(impactWeight("critical")).toBeGreaterThan(impactWeight("serious"));
      expect(impactWeight("serious")).toBeGreaterThan(impactWeight("minor"));
      expect(impactWeight("nonsense")).toBe(1);
    });
  });

  describe("rankComponentsByRisk", () => {
    const legalWeights = new Map([
      ["color-contrast", { weight: 3, avgSettlement: 20000, frequency: 0.4 }],
      ["label", { weight: 5, avgSettlement: 50000, frequency: 0.6 }],
    ]);

    it("ranks the component with higher legal exposure first", () => {
      const violations: GraphViolationInput[] = [
        { ruleId: "label", impact: "critical", wcagCriteria: "4.1.2", ...el(".checkout .field") },
        { ruleId: "color-contrast", impact: "minor", wcagCriteria: "1.4.3", ...el(".footer .link") },
      ];
      const ranked = rankComponentsByRisk(violations, legalWeights);
      expect(ranked[0].topRules[0].ruleId).toBe("label");
      expect(ranked[0].legalExposureUsd).toBe(Math.round(50000 * 0.6));
      expect(ranked[0].riskScore).toBeGreaterThan(ranked[1].riskScore);
    });

    it("aggregates repeated violations on the same component", () => {
      const violations: GraphViolationInput[] = [
        { ruleId: "label", impact: "serious", wcagCriteria: "4.1.2", ...el("#a .field") },
        { ruleId: "label", impact: "serious", wcagCriteria: "4.1.2", ...el("#b .field") },
      ];
      const ranked = rankComponentsByRisk(violations, legalWeights);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].violationCount).toBe(2);
      expect(ranked[0].ruleCount).toBe(1);
    });

    it("handles rules with no litigation data (severity-only)", () => {
      const violations: GraphViolationInput[] = [
        { ruleId: "unknown-rule", impact: "critical", wcagCriteria: null, ...el(".widget") },
      ];
      const ranked = rankComponentsByRisk(violations, new Map());
      expect(ranked[0].legalExposureUsd).toBe(0);
      expect(ranked[0].riskScore).toBeGreaterThan(0);
    });
  });

  describe("detectRegressionCycles", () => {
    const day = (n: number) => new Date(2026, 0, n);
    const point = (id: string, dayN: number, rules: string[]): ScanPoint => ({
      scanId: id,
      url: "https://example.com",
      completedAt: day(dayN),
      ruleIds: new Set(rules),
      wcagByRule: new Map(rules.map((r) => [r, "1.4.3"])),
    });

    it("detects a fix→reappear cycle and measures survival time", () => {
      const timeline = [
        point("s1", 1, ["color-contrast"]),
        point("s2", 5, []), // fixed
        point("s3", 11, ["color-contrast"]), // regressed
      ];
      const events = detectRegressionCycles(timeline);
      expect(events).toHaveLength(1);
      expect(events[0].ruleId).toBe("color-contrast");
      expect(events[0].daysToRegress).toBe(10); // day 1 present → day 11 present again
    });

    it("does not flag a rule that was never fixed", () => {
      const timeline = [
        point("s1", 1, ["label"]),
        point("s2", 5, ["label"]),
        point("s3", 9, ["label"]),
      ];
      expect(detectRegressionCycles(timeline)).toHaveLength(0);
    });

    it("returns nothing for timelines shorter than 3 scans", () => {
      expect(detectRegressionCycles([point("s1", 1, ["label"]), point("s2", 2, [])])).toHaveLength(0);
    });
  });

  describe("summarizeRegressions", () => {
    it("aggregates events into per-rule stats with median survival", () => {
      const rules = summarizeRegressions([
        { ruleId: "color-contrast", wcagCriteria: "1.4.3", url: "a", daysToRegress: 10 },
        { ruleId: "color-contrast", wcagCriteria: "1.4.3", url: "b", daysToRegress: 20 },
        { ruleId: "label", wcagCriteria: "4.1.2", url: "a", daysToRegress: 5 },
      ]);
      expect(rules[0].ruleId).toBe("color-contrast");
      expect(rules[0].regressionCount).toBe(2);
      expect(rules[0].medianDaysToRegress).toBe(15);
      expect(rules[0].affectedUrls).toHaveLength(2);
    });
  });
});
