/**
 * RegLayer — Severity Engine Tests
 *
 * WHY: Violation severity scoring drives prioritization — must be accurate and consistent.
 * WHAT: Tests calculateSeverity(): maps axe impact + WCAG level + user count → weighted score.
 * HOW: Unit tests with various violation types. Verifies scoring formula and rank ordering.
 */
import { describe, it, expect } from "vitest";
import {
  calculateComplianceScore,
  generateScanSummary,
  getComplianceStatus,
} from "@/lib/scanner/accessibility/severityEngine";

describe("Severity Engine — calculateComplianceScore", () => {
  it("returns 100 for no violations", () => {
    expect(calculateComplianceScore([])).toBe(100);
  });

  it("penalizes critical violations heavily", () => {
    const violations = [
      {
        id: "image-alt",
        impact: "critical",
        description: "Images must have alt",
        help: "Add alt",
        helpUrl: "",
        tags: ["wcag2a"],
        nodes: [{ html: "<img>", target: ["img"], failureSummary: "No alt" }],
      },
    ];

    const score = calculateComplianceScore(violations as any);
    // critical base = 10, 1 node: multiplier = 1 + log2(1)/4 = 1
    // penalty = 10 → score = 90
    expect(score).toBe(90);
  });

  it("penalizes serious violations moderately", () => {
    const violations = [
      {
        id: "color-contrast",
        impact: "serious",
        description: "Contrast ratio",
        help: "Fix contrast",
        helpUrl: "",
        tags: ["wcag2aa"],
        nodes: [{ html: "<p>", target: ["p"], failureSummary: "Low contrast" }],
      },
    ];

    const score = calculateComplianceScore(violations as any);
    // serious base = 5, 1 node: multiplier = 1 → penalty = 5 → score = 95
    expect(score).toBe(95);
  });

  it("applies diminishing returns for multiple nodes", () => {
    const violations = [
      {
        id: "image-alt",
        impact: "critical",
        description: "",
        help: "",
        helpUrl: "",
        tags: [],
        nodes: [
          { html: "<img>", target: ["img:nth-child(1)"], failureSummary: "" },
          { html: "<img>", target: ["img:nth-child(2)"], failureSummary: "" },
          { html: "<img>", target: ["img:nth-child(3)"], failureSummary: "" },
          { html: "<img>", target: ["img:nth-child(4)"], failureSummary: "" },
        ],
      },
    ];

    const score = calculateComplianceScore(violations as any);
    // critical base = 10, 4 nodes: multiplier = 1 + log2(4)/4 = 1 + 0.5 = 1.5
    // penalty = 15 → score = 85
    expect(score).toBe(85);
  });

  it("clamps score to minimum 0", () => {
    // Many critical violations should not go below 0
    const violations = Array.from({ length: 20 }, (_, i) => ({
      id: `rule-${i}`,
      impact: "critical",
      description: "",
      help: "",
      helpUrl: "",
      tags: [],
      nodes: [{ html: "<div>", target: ["div"], failureSummary: "" }],
    }));

    const score = calculateComplianceScore(violations as any);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("minor violations have minimal impact", () => {
    const violations = [
      {
        id: "minor-rule",
        impact: "minor",
        description: "",
        help: "",
        helpUrl: "",
        tags: [],
        nodes: [{ html: "<span>", target: ["span"], failureSummary: "" }],
      },
    ];

    const score = calculateComplianceScore(violations as any);
    // minor base = 0.5, 1 node → penalty = 0.5 → score = 99.5
    expect(score).toBe(99.5);
  });
});

describe("Severity Engine — generateScanSummary", () => {
  it("returns zero counts for no violations", () => {
    const summary = generateScanSummary([]);

    expect(summary.totalViolations).toBe(0);
    expect(summary.critical).toBe(0);
    expect(summary.serious).toBe(0);
    expect(summary.moderate).toBe(0);
    expect(summary.minor).toBe(0);
    expect(summary.score).toBe(100);
  });

  it("counts nodes per severity level", () => {
    const violations = [
      {
        id: "rule-1",
        impact: "critical",
        description: "",
        help: "",
        helpUrl: "",
        tags: [],
        nodes: [
          { html: "", target: ["a"], failureSummary: "" },
          { html: "", target: ["b"], failureSummary: "" },
        ],
      },
      {
        id: "rule-2",
        impact: "moderate",
        description: "",
        help: "",
        helpUrl: "",
        tags: [],
        nodes: [{ html: "", target: ["c"], failureSummary: "" }],
      },
    ];

    const summary = generateScanSummary(violations as any);

    expect(summary.totalViolations).toBe(2);
    expect(summary.critical).toBe(2); // 2 nodes
    expect(summary.moderate).toBe(1); // 1 node
    expect(summary.serious).toBe(0);
    expect(summary.minor).toBe(0);
  });
});

describe("Severity Engine — getComplianceStatus", () => {
  it("returns 'passing' for score >= 90", () => {
    expect(getComplianceStatus(100)).toBe("passing");
    expect(getComplianceStatus(90)).toBe("passing");
    expect(getComplianceStatus(95)).toBe("passing");
  });

  it("returns 'warning' for score 70-89", () => {
    expect(getComplianceStatus(89)).toBe("warning");
    expect(getComplianceStatus(70)).toBe("warning");
    expect(getComplianceStatus(80)).toBe("warning");
  });

  it("returns 'failing' for score < 70", () => {
    expect(getComplianceStatus(69)).toBe("failing");
    expect(getComplianceStatus(0)).toBe("failing");
    expect(getComplianceStatus(50)).toBe("failing");
  });
});
