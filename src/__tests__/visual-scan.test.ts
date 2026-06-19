/**
 * Unit tests for the AI Visual Review normalizer (pure). The vision API call
 * itself is integration-only and not exercised here.
 */

import { describe, it, expect } from "vitest";
import { normalizeVisualFindings } from "@/lib/ai/visualScan";

describe("normalizeVisualFindings", () => {
  it("accepts a {findings:[...]} payload and passes valid entries", () => {
    const out = normalizeVisualFindings({
      findings: [
        { category: "text-in-image", issue: "Logo contains the tagline as baked-in text", severity: "serious", confidence: 0.8 },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("text-in-image");
    expect(out[0].severity).toBe("serious");
    expect(out[0].confidence).toBe(0.8);
  });

  it("accepts a bare array too", () => {
    const out = normalizeVisualFindings([{ issue: "Color-only status dots", category: "color-only", severity: "moderate" }]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("color-only");
  });

  it("coerces unknown category to 'other' and invalid severity to 'moderate'", () => {
    const out = normalizeVisualFindings({ findings: [{ category: "wat", issue: "x", severity: "ultra" }] });
    expect(out[0].category).toBe("other");
    expect(out[0].severity).toBe("moderate");
  });

  it("clamps confidence into [0,1] and defaults when missing", () => {
    const out = normalizeVisualFindings({
      findings: [
        { issue: "a", confidence: 5 },
        { issue: "b", confidence: -2 },
        { issue: "c" },
      ],
    });
    expect(out[0].confidence).toBe(1);
    expect(out[1].confidence).toBe(0);
    expect(out[2].confidence).toBe(0.5);
  });

  it("drops entries with an empty issue", () => {
    const out = normalizeVisualFindings({ findings: [{ issue: "" }, { issue: "real" }] });
    expect(out).toHaveLength(1);
    expect(out[0].issue).toBe("real");
  });

  it("caps the number of findings at 8", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ issue: `issue ${i}` }));
    expect(normalizeVisualFindings({ findings: many })).toHaveLength(8);
  });

  it("returns [] for junk input", () => {
    expect(normalizeVisualFindings(null)).toEqual([]);
    expect(normalizeVisualFindings("nope")).toEqual([]);
    expect(normalizeVisualFindings({})).toEqual([]);
  });
});
