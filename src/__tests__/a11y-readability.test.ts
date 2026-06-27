import { describe, it, expect } from "vitest";
import { countSyllables, analyzeReadability } from "@/lib/a11y/readability";

describe("countSyllables", () => {
  it("counts common words", () => {
    expect(countSyllables("cat")).toBe(1);
    expect(countSyllables("the")).toBe(1);
    expect(countSyllables("hello")).toBe(2);
    expect(countSyllables("accessibility")).toBeGreaterThanOrEqual(4);
  });
});

describe("analyzeReadability", () => {
  it("rates simple text as very easy and WCAG-AAA-friendly", () => {
    const r = analyzeReadability("The cat sat on the mat. The dog ran fast.");
    expect(r.words).toBe(10);
    expect(r.sentences).toBe(2);
    expect(r.fleschReadingEase).toBeGreaterThan(90);
    expect(r.fleschKincaidGrade).toBeLessThan(5);
    expect(r.meetsWcagAaa).toBe(true);
  });
  it("rates dense, polysyllabic prose as harder", () => {
    const simple = analyzeReadability("The cat sat on the mat. The dog ran fast.");
    const complex = analyzeReadability(
      "The utilization of sophisticated terminology substantially diminishes comprehension among readers.",
    );
    expect(complex.fleschKincaidGrade).toBeGreaterThan(simple.fleschKincaidGrade);
    expect(complex.fleschKincaidGrade).toBeGreaterThan(12);
    expect(complex.meetsWcagAaa).toBe(false);
  });
  it("handles empty input", () => {
    const r = analyzeReadability("");
    expect(r.words).toBe(0);
    expect(r.meetsWcagAaa).toBe(false);
    expect(r.level).toBe("No text");
  });
});
