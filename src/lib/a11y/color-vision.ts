/**
 * RegLayer — color-vision-deficiency (CVD) simulator
 *
 * Simulates how a color is perceived under the three dichromacies (protanopia,
 * deuteranopia, tritanopia) and full achromatopsia, so teams can check that
 * meaning isn't carried by color alone (WCAG 1.4.1). Uses the Machado et al.
 * (2009) severity-1.0 matrices applied in LINEAR RGB; achromatopsia is a
 * luminance-preserving grayscale. Pure + deterministic.
 */
import { parseColor, toHex, type RGB } from "./contrast";

export type CvdType = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";

// Machado, Oliveira & Fernandes (2009), severity = 1.0. Each row sums to ~1, so
// the achromatic (gray) axis is preserved: white→white, black→black, gray→gray.
const MATRICES: Record<"protanopia" | "deuteranopia" | "tritanopia", number[][]> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c: number): number => {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
};
const fromLinear = (c: number): number => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/** Simulate a single CVD type on an RGB color. */
export function simulate(rgb: RGB, type: CvdType): RGB {
  const r = toLinear(rgb.r), g = toLinear(rgb.g), b = toLinear(rgb.b);

  if (type === "achromatopsia") {
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const v = fromLinear(y);
    return { r: v, g: v, b: v };
  }

  const m = MATRICES[type];
  return {
    r: fromLinear(m[0][0] * r + m[0][1] * g + m[0][2] * b),
    g: fromLinear(m[1][0] * r + m[1][1] * g + m[1][2] * b),
    b: fromLinear(m[2][0] * r + m[2][1] * g + m[2][2] * b),
  };
}

export interface ColorVisionReport {
  original: string;
  protanopia: string;
  deuteranopia: string;
  tritanopia: string;
  achromatopsia: string;
}

/** Simulate all CVD types for a color string. Throws on an unparseable color. */
export function simulateColorVision(color: string): ColorVisionReport {
  const rgb = parseColor(color);
  if (!rgb) throw new Error(`Unrecognized color: ${color}`);
  return {
    original: toHex(rgb),
    protanopia: toHex(simulate(rgb, "protanopia")),
    deuteranopia: toHex(simulate(rgb, "deuteranopia")),
    tritanopia: toHex(simulate(rgb, "tritanopia")),
    achromatopsia: toHex(simulate(rgb, "achromatopsia")),
  };
}
