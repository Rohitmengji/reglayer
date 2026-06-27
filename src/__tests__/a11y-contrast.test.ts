/**
 * WCAG contrast engine + accessible-color solver.
 *
 * Ratios are checked against published WCAG reference values (black/white = 21:1,
 * the #767676-on-white AA boundary, etc.). The solver is checked for its three
 * guarantees: the result actually meets the target, it preserves the hue, and it
 * reports honestly when no color can satisfy the target against the background.
 */
import { describe, it, expect } from "vitest";
import {
  parseColor,
  toHex,
  relativeLuminance,
  contrastRatio,
  thresholdFor,
  rgbToHsl,
  analyzeContrast,
  suggestAccessibleColor,
} from "@/lib/a11y/contrast";

describe("parseColor", () => {
  it("parses #rgb, #rrggbb, bare hex, and rgb()/rgba()", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseColor("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor("ff8800")).toEqual({ r: 255, g: 136, b: 0 });
    expect(parseColor("rgb(18, 52, 86)")).toEqual({ r: 18, g: 52, b: 86 });
    expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseColor("rgb(100%, 0%, 0%)")).toEqual({ r: 255, g: 0, b: 0 });
  });
  it("rejects unparseable input", () => {
    expect(parseColor("rebeccapurple")).toBeNull(); // named colors unsupported
    expect(parseColor("hsl(0,100%,50%)")).toBeNull();
    expect(parseColor("#12")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 1 for white and 0 for black", () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it("is exactly 21 for black/white and symmetric", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 2);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 2);
  });
  it("is 1 for identical colors", () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });
  it("matches the WCAG #767676-on-white AA boundary (~4.54:1)", () => {
    const r = contrastRatio({ r: 0x76, g: 0x76, b: 0x76 }, white);
    expect(r).toBeGreaterThanOrEqual(4.5);
    expect(r).toBeLessThan(4.6);
    // #777777 sits just BELOW the 4.5 line — the classic "passes by a hair vs fails by a hair".
    expect(contrastRatio({ r: 0x77, g: 0x77, b: 0x77 }, white)).toBeLessThan(4.5);
  });
});

describe("thresholdFor", () => {
  it("returns the four standard WCAG thresholds", () => {
    expect(thresholdFor("AA", false)).toBe(4.5);
    expect(thresholdFor("AA", true)).toBe(3);
    expect(thresholdFor("AAA", false)).toBe(7);
    expect(thresholdFor("AAA", true)).toBe(4.5);
  });
});

describe("suggestAccessibleColor", () => {
  const white = { r: 255, g: 255, b: 255 };

  it("solves a failing gray to AA by darkening, staying gray", () => {
    const fail = { r: 0x99, g: 0x99, b: 0x99 }; // ~2.85:1 on white — fails AA
    const s = suggestAccessibleColor(fail, white, 4.5);
    expect(s.meetsTarget).toBe(true);
    expect(s.recommended.ratio).toBeGreaterThanOrEqual(4.5);
    const rgb = parseColor(s.recommended.hex)!;
    expect(rgb.r).toBe(rgb.g); // still neutral gray
    expect(rgb.g).toBe(rgb.b);
    expect(rgb.r).toBeLessThan(0x99); // darker than the original
    // Lightening can't help against a white background.
    expect(s.lighter).toBeNull();
    expect(s.darker).not.toBeNull();
  });

  it("preserves HUE when fixing a colored foreground", () => {
    const orange = { r: 0xff, g: 0x88, b: 0x00 }; // hue ~32°, fails AA on white
    const origHue = rgbToHsl(orange).h;
    const s = suggestAccessibleColor(orange, white, 4.5);
    expect(s.meetsTarget).toBe(true);
    expect(s.recommended.ratio).toBeGreaterThanOrEqual(4.5);
    const suggestedHue = rgbToHsl(parseColor(s.recommended.hex)!).h;
    expect(Math.abs(suggestedHue - origHue)).toBeLessThanOrEqual(6); // hue kept (±6° for 8-bit rounding)
  });

  it("is honest when NO color meets the target against a mid-gray background", () => {
    // AAA (7:1) is unreachable against #777777 — the best any color does is ~5.3:1 (black).
    // The best any color can do against #777777 is black (~4.69:1) — even pure
    // black/white can't reach 7:1, so AAA is mathematically impossible here.
    const s = suggestAccessibleColor({ r: 0xff, g: 0, b: 0 }, { r: 0x77, g: 0x77, b: 0x77 }, 7);
    expect(s.meetsTarget).toBe(false);
    expect(s.recommended.ratio).toBeLessThan(7);
    expect(s.recommended.ratio).toBeGreaterThan(4.5); // still hands back the highest-contrast fallback (≈4.69)
  });
});

describe("analyzeContrast", () => {
  it("flags pass/fail across all four thresholds and gives no suggestion when passing", () => {
    const r = analyzeContrast("#000000", "#ffffff");
    expect(r.ratio).toBeCloseTo(21, 1);
    expect(r.passes).toEqual({ aaLarge: true, aaNormal: true, aaaLarge: true, aaaNormal: true });
    expect(r.suggestion).toBeNull();
  });

  it("returns a suggestion that meets the requested target when failing", () => {
    const r = analyzeContrast("#9a9a9a", "#ffffff", { level: "AA", largeText: false });
    expect(r.passes.aaNormal).toBe(false);
    expect(r.suggestion).not.toBeNull();
    expect(r.suggestion!.meetsTarget).toBe(true);
    expect(r.suggestion!.recommended.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("normalizes input to #rrggbb and round-trips via toHex", () => {
    const r = analyzeContrast("FFF", "rgb(0,0,0)");
    expect(r.foreground).toBe("#ffffff");
    expect(r.background).toBe("#000000");
    expect(toHex({ r: 255, g: 136, b: 0 })).toBe("#ff8800");
  });

  it("throws on an unparseable color", () => {
    expect(() => analyzeContrast("not-a-color", "#fff")).toThrow(/Unrecognized/);
  });
});
