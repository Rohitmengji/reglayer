import { describe, it, expect } from "vitest";
import { analyzeHeadings } from "@/lib/a11y/heading-outline";

describe("analyzeHeadings", () => {
  it("accepts a clean hierarchy and builds an indented outline", () => {
    const r = analyzeHeadings([
      { level: 1, text: "Title" },
      { level: 2, text: "Section" },
      { level: 3, text: "Detail" },
      { level: 2, text: "Section 2" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
    expect(r.outline.map((o) => o.depth)).toEqual([0, 1, 2, 1]);
  });
  it("flags a skipped level as an error", () => {
    const r = analyzeHeadings([{ level: 1, text: "A" }, { level: 3, text: "B" }]);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "skipped-level")).toBe(true);
  });
  it("flags a missing h1 and a non-h1 first heading", () => {
    const r = analyzeHeadings([{ level: 2, text: "A" }]);
    expect(r.issues.some((i) => i.code === "no-h1")).toBe(true);
    expect(r.issues.some((i) => i.code === "first-not-h1")).toBe(true);
  });
  it("warns on multiple h1", () => {
    const r = analyzeHeadings([{ level: 1, text: "A" }, { level: 1, text: "B" }]);
    expect(r.issues.some((i) => i.code === "multiple-h1")).toBe(true);
  });
  it("flags an empty heading as an error", () => {
    expect(analyzeHeadings([{ level: 1, text: "  " }]).issues.some((i) => i.code === "empty")).toBe(true);
  });
  it("warns (not errors) when there are no headings at all", () => {
    const r = analyzeHeadings([]);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.code === "no-headings")).toBe(true);
  });
});
