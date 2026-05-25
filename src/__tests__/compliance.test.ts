import { describe, it, expect } from "vitest";
import { evaluateCompliance } from "@/lib/compliance/policyEvaluator";
import type { AccessibilityViolation } from "@/lib/types";

describe("Policy Evaluator", () => {
  it("returns 100% compliance with no violations", () => {
    const result = evaluateCompliance("scan_test", []);

    expect(result.scanId).toBe("scan_test");
    expect(result.overallCompliance).toBe(100);
    expect(result.ruleResults.every((r) => r.passed)).toBe(true);
  });

  it("reduces compliance score when violations match WCAG criteria", () => {
    const violations: AccessibilityViolation[] = [
      {
        id: "color-contrast",
        impact: "serious",
        description: "Elements must have sufficient color contrast",
        help: "Ensure sufficient color contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        wcagTags: ["wcag2aa", "wcag143"],
        nodes: [
          {
            html: "<p style='color:#aaa'>Low contrast</p>",
            target: ["p"],
            failureSummary: "Element has insufficient color contrast ratio",
          },
        ],
      },
    ];

    const result = evaluateCompliance("scan_test", violations);

    expect(result.overallCompliance).toBeLessThan(100);
    expect(result.ruleResults.some((r) => !r.passed)).toBe(true);
  });

  it("includes timestamp in report", () => {
    const result = evaluateCompliance("scan_test", []);
    expect(result.timestamp).toBeDefined();
    expect(new Date(result.timestamp).getTime()).not.toBeNaN();
  });

  it("links violations to failed rules", () => {
    const violations: AccessibilityViolation[] = [
      {
        id: "image-alt",
        impact: "critical",
        description: "Images must have alternate text",
        help: "Ensure images have alt text",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/image-alt",
        wcagTags: ["wcag2a", "wcag111"],
        nodes: [
          {
            html: "<img src='photo.jpg'>",
            target: ["img"],
            failureSummary: "Element does not have an alt attribute",
          },
        ],
      },
    ];

    const result = evaluateCompliance("scan_test", violations);
    const failedRules = result.ruleResults.filter((r) => !r.passed);

    expect(failedRules.length).toBeGreaterThan(0);
    expect(failedRules[0].violations.length).toBeGreaterThan(0);
    expect(failedRules[0].violations[0].id).toBe("image-alt");
  });
});
