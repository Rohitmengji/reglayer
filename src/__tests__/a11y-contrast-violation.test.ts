import { describe, it, expect } from "vitest";
import { analyzeContrastViolation } from "@/lib/a11y/contrast-violation";

const AXE_SUMMARY =
  "Fix any of the following:\n  Element has insufficient color contrast of 2.85 (foreground color: #999999, background color: #ffffff, font size: 12.0pt (16px), font weight: normal). Expected contrast ratio of 4.5:1";

describe("analyzeContrastViolation", () => {
  it("parses an axe color-contrast failureSummary and suggests a fix", () => {
    const fix = analyzeContrastViolation(AXE_SUMMARY);
    expect(fix).not.toBeNull();
    expect(fix!.foreground).toBe("#999999");
    expect(fix!.background).toBe("#ffffff");
    expect(fix!.largeText).toBe(false);
    expect(fix!.report.ratio).toBeCloseTo(2.85, 1);
    expect(fix!.report.passes.aaNormal).toBe(false);
    expect(fix!.report.suggestion?.meetsTarget).toBe(true);
    expect(fix!.report.suggestion!.recommended.ratio).toBeGreaterThanOrEqual(4.5);
  });
  it("detects large text (≥14pt bold) and applies the 3:1 threshold", () => {
    const fix = analyzeContrastViolation(
      "(foreground color: #949494, background color: #ffffff, font size: 14.0pt (18.7px), font weight: bold)",
    );
    expect(fix!.largeText).toBe(true);
    expect(fix!.report.target.ratio).toBe(3);
  });
  it("returns null when colors can't be parsed", () => {
    expect(analyzeContrastViolation("Some unrelated failure summary")).toBeNull();
    expect(analyzeContrastViolation("")).toBeNull();
  });
});
