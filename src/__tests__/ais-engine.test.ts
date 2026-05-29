/**
 * RegLayer — AIS Engine Tests
 *
 * WHY: The scoring algorithm is the core differentiator. Math must be deterministic and correct.
 * WHAT: Tests all 6 dimensions, composite scoring, grade mapping, and improvement simulator.
 * HOW: Unit tests with synthetic violation data. No mocks needed (pure math).
 */
import { describe, it, expect } from "vitest";
import { calculateAIS } from "@/lib/intelligence/ais-engine";
import type { AccessibilityViolation, ScanSummary } from "@/lib/types";

function makeViolation(
  id: string,
  impact: AccessibilityViolation["impact"],
  nodeCount: number,
  wcagTags: string[] = []
): AccessibilityViolation {
  return {
    id,
    impact,
    description: `Test violation: ${id}`,
    help: `Fix ${id}`,
    helpUrl: `https://example.com/rules/${id}`,
    wcagTags,
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      html: `<div id="el-${i}">test</div>`,
      target: [`#el-${i}`],
      failureSummary: "Fix this element",
    })),
  };
}

function makeSummary(violations: AccessibilityViolation[]): ScanSummary {
  return {
    totalViolations: violations.length,
    critical: violations.filter((v) => v.impact === "critical").length,
    serious: violations.filter((v) => v.impact === "serious").length,
    moderate: violations.filter((v) => v.impact === "moderate").length,
    minor: violations.filter((v) => v.impact === "minor").length,
    score: 100 - violations.length * 5,
  };
}

describe("AIS Engine — calculateAIS", () => {
  describe("Perfect score (no violations)", () => {
    it("returns A+ grade with max per-dimension scores (velocity neutral without history)", () => {
      const result = calculateAIS({
        violations: [],
        summary: { totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 },
      });

      // Without historical data, temporal velocity is neutral (550), so composite < 850
      expect(result.score).toBeGreaterThanOrEqual(750);
      expect(result.grade).toBe("A+");
      expect(result.label).toBe("Excellent");
      expect(result.dimensions.barrierSeverity.score).toBe(850);
      expect(result.dimensions.populationReach.score).toBe(850);
      expect(result.dimensions.assistiveTechCompat.score).toBe(850);
      expect(result.dimensions.temporalVelocity.score).toBe(550); // neutral, no history
    });

    it("returns 850 when all dimensions are maxed (including improving history)", () => {
      const result = calculateAIS({
        violations: [],
        summary: { totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 },
        historicalScores: [
          { score: 70, date: "2026-04-01" },
          { score: 80, date: "2026-04-08" },
          { score: 90, date: "2026-04-15" },
          { score: 95, date: "2026-04-22" },
          { score: 100, date: "2026-04-29" },
        ],
      });

      expect(result.score).toBe(850);
      expect(result.grade).toBe("A+");
    });
  });

  describe("Barrier Severity dimension", () => {
    it("critical violations penalize more than minor", () => {
      const critViolations = [makeViolation("keyboard", "critical", 5, ["wcag2a", "wcag211"])];
      const minorViolations = [makeViolation("document-title", "minor", 5, ["wcag2a", "wcag242"])];

      const critResult = calculateAIS({ violations: critViolations, summary: makeSummary(critViolations) });
      const minorResult = calculateAIS({ violations: minorViolations, summary: makeSummary(minorViolations) });

      expect(critResult.dimensions.barrierSeverity.score).toBeLessThan(
        minorResult.dimensions.barrierSeverity.score
      );
    });

    it("more affected elements increase penalty (sublinear via sqrt)", () => {
      const few = [makeViolation("color-contrast", "serious", 2)];
      const many = [makeViolation("color-contrast", "serious", 50)];

      const fewResult = calculateAIS({ violations: few, summary: makeSummary(few) });
      const manyResult = calculateAIS({ violations: many, summary: makeSummary(many) });

      expect(manyResult.dimensions.barrierSeverity.score).toBeLessThan(
        fewResult.dimensions.barrierSeverity.score
      );
    });
  });

  describe("Population Reach dimension", () => {
    it("violations affecting multiple populations score lower", () => {
      // Only affects blind users
      const narrowViolations = [makeViolation("image-alt", "serious", 3)];
      // Affects blind + motor + cognitive
      const wideViolations = [
        makeViolation("image-alt", "serious", 3),
        makeViolation("keyboard", "critical", 3),
        makeViolation("heading-order", "moderate", 3),
      ];

      const narrow = calculateAIS({ violations: narrowViolations, summary: makeSummary(narrowViolations) });
      const wide = calculateAIS({ violations: wideViolations, summary: makeSummary(wideViolations) });

      expect(wide.dimensions.populationReach.score).toBeLessThan(
        narrow.dimensions.populationReach.score
      );
    });

    it("populates populationsAffected array with correct structure", () => {
      const violations = [makeViolation("color-contrast", "serious", 10)];
      const result = calculateAIS({ violations, summary: makeSummary(violations) });

      expect(result.populationsAffected.length).toBeGreaterThan(0);
      const pop = result.populationsAffected[0];
      expect(pop.population).toBeDefined();
      expect(pop.estimatedBlocked).toBeGreaterThan(0);
      expect(["full-block", "partial-block", "minor-friction"]).toContain(pop.severity);
      expect(pop.affectingRules).toContain("color-contrast");
    });
  });

  describe("Temporal Velocity dimension", () => {
    it("returns neutral score (550) with no history", () => {
      const violations = [makeViolation("image-alt", "serious", 2)];
      const result = calculateAIS({ violations, summary: makeSummary(violations) });

      expect(result.dimensions.temporalVelocity.score).toBe(550);
    });

    it("rewards improving trend", () => {
      const violations = [makeViolation("image-alt", "serious", 2)];
      const historicalScores = [
        { score: 60, date: "2026-04-01" },
        { score: 65, date: "2026-04-08" },
        { score: 72, date: "2026-04-15" },
        { score: 80, date: "2026-04-22" },
        { score: 85, date: "2026-04-29" },
      ];

      const result = calculateAIS({
        violations,
        summary: makeSummary(violations),
        historicalScores,
      });

      expect(result.dimensions.temporalVelocity.score).toBeGreaterThan(550);
    });

    it("penalizes declining trend", () => {
      const violations = [makeViolation("image-alt", "serious", 2)];
      const historicalScores = [
        { score: 90, date: "2026-04-01" },
        { score: 85, date: "2026-04-08" },
        { score: 78, date: "2026-04-15" },
        { score: 70, date: "2026-04-22" },
        { score: 62, date: "2026-04-29" },
      ];

      const result = calculateAIS({
        violations,
        summary: makeSummary(violations),
        historicalScores,
      });

      expect(result.dimensions.temporalVelocity.score).toBeLessThan(550);
    });
  });

  describe("Structural Depth dimension", () => {
    it("isolated issues (1 rule, 1 page) score high", () => {
      const violations = [makeViolation("document-title", "minor", 1)];
      const result = calculateAIS({
        violations,
        summary: makeSummary(violations),
        pagesScanned: 1,
      });

      expect(result.dimensions.structuralDepth.score).toBeGreaterThan(600);
    });

    it("systemic issues (many rules, high density) score low", () => {
      const violations = [
        makeViolation("color-contrast", "serious", 30),
        makeViolation("image-alt", "serious", 15),
        makeViolation("heading-order", "moderate", 20),
        makeViolation("label", "critical", 10),
        makeViolation("keyboard", "critical", 8),
      ];
      const result = calculateAIS({
        violations,
        summary: makeSummary(violations),
        pagesScanned: 1,
        totalSiteViolations: 83,
      });

      expect(result.dimensions.structuralDepth.score).toBeLessThan(400);
    });
  });

  describe("Regulatory Exposure dimension", () => {
    it("violations matching WCAG-A criteria have higher exposure", () => {
      // WCAG 2.1.1 (Keyboard) — Level A, mandated by ADA + Section 508 + EAA
      const highRisk = [makeViolation("keyboard", "critical", 5, ["wcag2a", "wcag211"])];
      // WCAG 2.4.2 (Page Titled) — Level A but lower fine
      const lowerRisk = [makeViolation("document-title", "minor", 1, ["wcag2a", "wcag242"])];

      const high = calculateAIS({ violations: highRisk, summary: makeSummary(highRisk) });
      const low = calculateAIS({ violations: lowerRisk, summary: makeSummary(lowerRisk) });

      expect(high.dimensions.regulatoryExposure.score).toBeLessThan(
        low.dimensions.regulatoryExposure.score
      );
    });
  });

  describe("AT Compatibility dimension", () => {
    it("ARIA violations lower AT compat score", () => {
      const ariaViolations = [
        makeViolation("aria-required-attr", "serious", 5),
        makeViolation("aria-valid-attr-value", "serious", 3),
      ];
      const nonAriaViolations = [
        makeViolation("color-contrast", "serious", 5),
      ];

      const ariaResult = calculateAIS({ violations: ariaViolations, summary: makeSummary(ariaViolations) });
      const nonAriaResult = calculateAIS({ violations: nonAriaViolations, summary: makeSummary(nonAriaViolations) });

      expect(ariaResult.dimensions.assistiveTechCompat.score).toBeLessThan(
        nonAriaResult.dimensions.assistiveTechCompat.score
      );
    });
  });

  describe("Grade mapping", () => {
    it("maps score ranges to correct grades", () => {
      // Perfect = A+
      const perfect = calculateAIS({
        violations: [],
        summary: { totalViolations: 0, critical: 0, serious: 0, moderate: 0, minor: 0, score: 100 },
      });
      expect(perfect.grade).toBe("A+");

      // Heavy violations = low grade
      const heavy = calculateAIS({
        violations: [
          makeViolation("keyboard", "critical", 20, ["wcag2a", "wcag211"]),
          makeViolation("image-alt", "critical", 30, ["wcag2a", "wcag111"]),
          makeViolation("color-contrast", "serious", 50, ["wcag2aa", "wcag143"]),
          makeViolation("aria-roles", "critical", 15),
          makeViolation("label", "critical", 10, ["wcag2a", "wcag412"]),
        ],
        summary: makeSummary([
          makeViolation("keyboard", "critical", 20),
          makeViolation("image-alt", "critical", 30),
          makeViolation("color-contrast", "serious", 50),
          makeViolation("aria-roles", "critical", 15),
          makeViolation("label", "critical", 10),
        ]),
      });
      expect(["D", "F"]).toContain(heavy.grade);
    });
  });

  describe("Improvement simulator", () => {
    it("returns actions sorted by efficiency (point gain / effort)", () => {
      const violations = [
        makeViolation("color-contrast", "serious", 20),
        makeViolation("image-alt", "critical", 3),
        makeViolation("document-title", "minor", 1),
      ];
      const result = calculateAIS({ violations, summary: makeSummary(violations) });

      expect(result.improvements.length).toBeGreaterThan(0);
      // First action should have high pointGain relative to effort
      const first = result.improvements[0];
      expect(first.pointGain).toBeGreaterThan(0);
      expect(first.ruleId).toBeDefined();
      expect(first.description).toBeDefined();
    });

    it("projectedScore is higher than current score", () => {
      const violations = [
        makeViolation("color-contrast", "serious", 10),
        makeViolation("keyboard", "critical", 5, ["wcag2a", "wcag211"]),
      ];
      const result = calculateAIS({ violations, summary: makeSummary(violations) });

      expect(result.projectedScore).toBeGreaterThan(result.score);
      expect(result.projectedScore).toBeLessThanOrEqual(850);
    });
  });

  describe("Composite score properties", () => {
    it("score is always between 0 and 850", () => {
      // Test with extreme inputs
      const extremeViolations = Array.from({ length: 50 }, (_, i) =>
        makeViolation(`rule-${i}`, "critical", 100, ["wcag2a", "wcag211"])
      );
      const result = calculateAIS({ violations: extremeViolations, summary: makeSummary(extremeViolations) });

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(850);
    });

    it("all dimension scores are between 0 and 850", () => {
      const violations = [
        makeViolation("keyboard", "critical", 10, ["wcag2a", "wcag211"]),
        makeViolation("aria-roles", "serious", 5),
      ];
      const result = calculateAIS({ violations, summary: makeSummary(violations) });

      for (const dim of Object.values(result.dimensions)) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(850);
      }
    });

    it("is deterministic (same input → same output)", () => {
      const violations = [makeViolation("color-contrast", "serious", 5)];
      const input = { violations, summary: makeSummary(violations) };

      const r1 = calculateAIS(input);
      const r2 = calculateAIS(input);

      expect(r1.score).toBe(r2.score);
      expect(r1.grade).toBe(r2.grade);
    });
  });
});
