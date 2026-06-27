import { describe, it, expect } from "vitest";
import { analyzeTouchTarget } from "@/lib/a11y/touch-target";

describe("analyzeTouchTarget", () => {
  it("passes a 24×24 target at AA and fails an undersized one", () => {
    expect(analyzeTouchTarget({ width: 24, height: 24 }).meets).toBe(true);
    const small = analyzeTouchTarget({ width: 20, height: 20 });
    expect(small.meets).toBe(false);
    expect(small.required).toBe(24);
    expect(small.actual).toBe(20);
  });
  it("applies the 2.5.8 spacing exception for an undersized but well-spaced target", () => {
    const r = analyzeTouchTarget({ width: 20, height: 20, spacing: 4 }); // 20 + 8 ≥ 24
    expect(r.meets).toBe(true);
    expect(r.exception).toBe("spacing");
  });
  it("requires 44×44 at AAA (no spacing exception)", () => {
    expect(analyzeTouchTarget({ width: 40, height: 40, level: "AAA" }).meets).toBe(false);
    expect(analyzeTouchTarget({ width: 44, height: 44, level: "AAA" }).meets).toBe(true);
    expect(analyzeTouchTarget({ width: 20, height: 20, spacing: 20, level: "AAA" }).meets).toBe(false);
  });
  it("honors inline and essential exceptions", () => {
    expect(analyzeTouchTarget({ width: 12, height: 12, inline: true }).exception).toBe("inline");
    expect(analyzeTouchTarget({ width: 12, height: 12, essential: true }).exception).toBe("essential");
  });
});
