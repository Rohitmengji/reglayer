import { describe, it, expect } from "vitest";
import { analyzeAltText } from "@/lib/a11y/alt-text";

describe("analyzeAltText", () => {
  it("flags a missing alt attribute on a meaningful image", () => {
    const r = analyzeAltText(null);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "missing")).toBe(true);
  });
  it("accepts a missing/empty alt on a decorative image", () => {
    expect(analyzeAltText(null, { decorative: true }).issues).toHaveLength(0);
    expect(analyzeAltText("", { decorative: true }).issues).toHaveLength(0);
  });
  it("warns on an empty alt for a non-decorative image (but isn't an error)", () => {
    const r = analyzeAltText("");
    expect(r.issues.some((i) => i.code === "empty")).toBe(true);
    expect(r.ok).toBe(true);
  });
  it("flags redundant 'photo of' prefixes", () => {
    expect(analyzeAltText("Photo of a cat").issues.some((i) => i.code === "redundant-prefix")).toBe(true);
  });
  it("flags filenames and placeholders as errors", () => {
    expect(analyzeAltText("hero-banner.jpg").ok).toBe(false);
    expect(analyzeAltText("hero-banner.jpg").issues.some((i) => i.code === "filename")).toBe(true);
    expect(analyzeAltText("image").issues.some((i) => i.code === "placeholder")).toBe(true);
  });
  it("gives a clean, descriptive alt a perfect score", () => {
    const r = analyzeAltText("A golden retriever catching a frisbee at the park");
    expect(r.issues).toHaveLength(0);
    expect(r.score).toBe(100);
    expect(r.ok).toBe(true);
  });
  it("notes over-long alt text", () => {
    const r = analyzeAltText("x".repeat(200));
    expect(r.issues.some((i) => i.code === "too-long")).toBe(true);
  });
});
