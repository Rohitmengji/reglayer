/**
 * Tests for the scan→remediation fixability analysis: how many of a scan's
 * violations the engine can auto-fix vs need a developer.
 */
import { describe, it, expect } from "vitest";
import { analyzeFixability, FIXABLE_RULES } from "@/lib/remediation/fixability";

describe("analyzeFixability", () => {
  it("splits auto-fixable from needs-developer by axe rule id", () => {
    const r = analyzeFixability([
      { id: "image-alt", impact: "critical" },
      { id: "label", impact: "serious" },
      { id: "color-contrast", impact: "serious" },
      { id: "aria-required-children", impact: "critical" }, // not engine-fixable
      { id: "duplicate-id-aria", impact: "minor" }, // not engine-fixable
    ]);
    expect(r.total).toBe(5);
    expect(r.autoFixable).toBe(3); // image-alt, label, color-contrast
    expect(r.needsDeveloper).toBe(2);
  });

  it("flags review-needed categories (alt/labels/buttons) within auto-fixable", () => {
    const r = analyzeFixability([
      { id: "image-alt" },
      { id: "button-name" },
      { id: "html-has-lang" }, // auto-fixable, NOT review-needed
    ]);
    expect(r.autoFixable).toBe(3);
    expect(r.needsReview).toBe(2); // image-alt + button-name
  });

  it("groups needs-developer rules by ruleId and sorts by impact", () => {
    const r = analyzeFixability([
      { id: "aria-valid-attr", impact: "minor" },
      { id: "aria-valid-attr", impact: "minor" },
      { id: "nested-interactive", impact: "critical" },
    ]);
    expect(r.needsDeveloperRules[0].ruleId).toBe("nested-interactive"); // critical first
    const ariaRule = r.needsDeveloperRules.find((x) => x.ruleId === "aria-valid-attr");
    expect(ariaRule?.count).toBe(2);
  });

  it("accepts ruleId via either `id` (ScanResult) or `ruleId` (raw) field", () => {
    expect(analyzeFixability([{ ruleId: "tabindex" }]).autoFixable).toBe(1);
    expect(analyzeFixability([{ id: "tabindex" }]).autoFixable).toBe(1);
  });

  it("handles empty / malformed input safely", () => {
    expect(analyzeFixability([]).total).toBe(0);
    expect(analyzeFixability([{ impact: "critical" }]).total).toBe(0); // no rule id → skipped
  });

  it("byCategory tallies + sorts by count, marking risky contrast", () => {
    const r = analyzeFixability([
      { id: "image-alt" },
      { id: "input-image-alt" },
      { id: "color-contrast" },
    ]);
    expect(r.byCategory[0]).toMatchObject({ category: "alt-text", count: 2 });
    const contrast = r.byCategory.find((c) => c.category === "contrast");
    expect(contrast?.risky).toBe(true);
  });

  it("every mapped rule points at a known engine category", () => {
    const cats = new Set(["lang-attribute", "skip-links", "landmarks", "alt-text", "form-labels", "button-labels", "focus-order", "contrast"]);
    for (const cat of Object.values(FIXABLE_RULES)) expect(cats.has(cat)).toBe(true);
  });
});
