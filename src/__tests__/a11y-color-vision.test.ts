import { describe, it, expect } from "vitest";
import { simulate, simulateColorVision } from "@/lib/a11y/color-vision";
import { parseColor } from "@/lib/a11y/contrast";

const types = ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"] as const;

describe("color-vision simulate", () => {
  it("preserves the achromatic axis (white→white, black→black, gray→gray)", () => {
    for (const t of types) {
      expect(simulate({ r: 255, g: 255, b: 255 }, t)).toEqual({ r: 255, g: 255, b: 255 });
      expect(simulate({ r: 0, g: 0, b: 0 }, t)).toEqual({ r: 0, g: 0, b: 0 });
      const gray = simulate({ r: 128, g: 128, b: 128 }, t);
      expect(Math.abs(gray.r - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(gray.g - 128)).toBeLessThanOrEqual(2);
      expect(Math.abs(gray.b - 128)).toBeLessThanOrEqual(2);
    }
  });
  it("outputs in-range channels and is deterministic", () => {
    const red = { r: 255, g: 0, b: 0 };
    for (const t of types) {
      const a = simulate(red, t);
      const b = simulate(red, t);
      expect(a).toEqual(b);
      for (const ch of [a.r, a.g, a.b]) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(255);
      }
    }
  });
  it("achromatopsia returns a true neutral gray", () => {
    const g = simulate({ r: 255, g: 0, b: 0 }, "achromatopsia");
    expect(g.r).toBe(g.g);
    expect(g.g).toBe(g.b);
  });
  it("simulateColorVision returns hex for all types and throws on bad input", () => {
    const r = simulateColorVision("#ff0000");
    expect(r.original).toBe("#ff0000");
    expect(parseColor(r.deuteranopia)).not.toBeNull();
    expect(() => simulateColorVision("nope")).toThrow(/Unrecognized/);
  });
});
