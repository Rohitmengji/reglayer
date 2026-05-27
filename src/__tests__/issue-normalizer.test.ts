import { describe, it, expect } from "vitest";
import { normalizeViolations } from "@/lib/scanner/accessibility/issueNormalizer";

describe("Issue Normalizer — normalizeViolations", () => {
  it("returns empty array for no violations", () => {
    expect(normalizeViolations([])).toEqual([]);
  });

  it("transforms axe violation to internal format", () => {
    const axeViolations = [
      {
        id: "color-contrast",
        impact: "serious",
        description: "Elements must have sufficient color contrast",
        help: "Ensure sufficient color contrast",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.11/color-contrast",
        tags: ["wcag2aa", "wcag143", "cat.color"],
        nodes: [
          {
            html: "<p style='color:#aaa'>text</p>",
            target: ["p.low-contrast"],
            failureSummary: "Element has insufficient contrast ratio",
          },
        ],
      },
    ];

    const result = normalizeViolations(axeViolations as any);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("color-contrast");
    expect(result[0].impact).toBe("serious");
    expect(result[0].description).toBe("Elements must have sufficient color contrast");
    expect(result[0].help).toBe("Ensure sufficient color contrast");
    expect(result[0].helpUrl).toBe("https://dequeuniversity.com/rules/axe/4.11/color-contrast");
  });

  it("filters wcagTags to only wcag and best-practice tags", () => {
    const axeViolations = [
      {
        id: "test-rule",
        impact: "minor",
        description: "",
        help: "",
        helpUrl: "",
        tags: ["wcag2a", "wcag111", "best-practice", "cat.aria", "section508"],
        nodes: [{ html: "", target: ["div"], failureSummary: "" }],
      },
    ];

    const result = normalizeViolations(axeViolations as any);

    expect(result[0].wcagTags).toContain("wcag2a");
    expect(result[0].wcagTags).toContain("wcag111");
    expect(result[0].wcagTags).toContain("best-practice");
    expect(result[0].wcagTags).not.toContain("cat.aria");
    expect(result[0].wcagTags).not.toContain("section508");
  });

  it("normalizes node data correctly", () => {
    const axeViolations = [
      {
        id: "image-alt",
        impact: "critical",
        description: "",
        help: "",
        helpUrl: "",
        tags: ["wcag2a"],
        nodes: [
          {
            html: "<img src='photo.jpg'>",
            target: ["img.hero"],
            failureSummary: "Element does not have an alt attribute",
            extra: "should be stripped",
          },
          {
            html: "<img src='logo.png'>",
            target: [".header > img"],
            failureSummary: "Element does not have an alt attribute",
          },
        ],
      },
    ];

    const result = normalizeViolations(axeViolations as any);

    expect(result[0].nodes).toHaveLength(2);
    expect(result[0].nodes[0]).toEqual({
      html: "<img src='photo.jpg'>",
      target: ["img.hero"],
      failureSummary: "Element does not have an alt attribute",
    });
    expect(result[0].nodes[1].target).toEqual([".header > img"]);
  });

  it("handles multiple violations", () => {
    const axeViolations = [
      {
        id: "rule-1",
        impact: "critical",
        description: "First rule",
        help: "",
        helpUrl: "",
        tags: ["wcag2a"],
        nodes: [{ html: "", target: ["a"], failureSummary: "" }],
      },
      {
        id: "rule-2",
        impact: "moderate",
        description: "Second rule",
        help: "",
        helpUrl: "",
        tags: ["wcag2aa"],
        nodes: [{ html: "", target: ["div"], failureSummary: "" }],
      },
    ];

    const result = normalizeViolations(axeViolations as any);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("rule-1");
    expect(result[1].id).toBe("rule-2");
  });
});
