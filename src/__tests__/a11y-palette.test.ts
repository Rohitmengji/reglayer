import { describe, it, expect } from "vitest";
import { generateRamp, bestTextColor } from "@/lib/a11y/palette";
import { parseColor, rgbToHsl } from "@/lib/a11y/contrast";

describe("generateRamp", () => {
  it("produces the requested number of valid, hue-preserving shades", () => {
    const p = generateRamp("#3b82f6", 10);
    expect(p.ramp).toHaveLength(10);
    const baseHue = rgbToHsl(parseColor("#3b82f6")!).h;
    for (const shade of p.ramp) {
      expect(parseColor(shade.hex)).not.toBeNull();
      // Skip near-white/near-black ends where hue is unstable; check mid shades.
      if (shade.lightness > 0.2 && shade.lightness < 0.85) {
        expect(Math.abs(rgbToHsl(parseColor(shade.hex)!).h - baseHue)).toBeLessThanOrEqual(8);
      }
    }
  });
  it("dark shades pass AA on white; light shades pass AA on black", () => {
    const p = generateRamp("#3b82f6", 10);
    expect(p.ramp[p.ramp.length - 1].onWhite.aa).toBe(true); // darkest vs white
    expect(p.ramp[0].onBlack.aa).toBe(true); // lightest vs black
  });
  it("ratios are ordered (darker = more contrast on white)", () => {
    const p = generateRamp("#10b981", 6);
    const onWhite = p.ramp.map((s) => s.onWhite.ratio);
    for (let i = 1; i < onWhite.length; i++) expect(onWhite[i]).toBeGreaterThanOrEqual(onWhite[i - 1]);
  });
});

describe("bestTextColor", () => {
  it("picks the higher-contrast of black/white for a background", () => {
    expect(bestTextColor("#ffffff").hex).toBe("#000000");
    expect(bestTextColor("#000000").hex).toBe("#ffffff");
    expect(bestTextColor("#3b82f6").hex).toBe("#000000"); // mid-blue: black contrasts more
  });
});
