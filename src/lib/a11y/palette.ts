/**
 * RegLayer — accessible palette / tonal-ramp generator
 *
 * Given a brand color, produces a hue-preserving lightness ramp and, for each
 * shade, its contrast vs white and black with AA/AAA pass flags — so designers
 * can pick text/background shades that are accessible by construction. Plus
 * `bestTextColor` (the readable black-or-white for any background). Builds on the
 * WCAG contrast engine. Pure + deterministic.
 */
import { parseColor, toHex, contrastRatio, rgbToHsl, hslToRgb, type RGB } from "./contrast";

export interface ShadeContrast {
  ratio: number;
  aa: boolean; // >= 4.5 (normal text)
  aaLarge: boolean; // >= 3
  aaa: boolean; // >= 7
}

export interface Shade {
  hex: string;
  lightness: number; // 0–1 (HSL L)
  onWhite: ShadeContrast;
  onBlack: ShadeContrast;
}

export interface Palette {
  base: string;
  ramp: Shade[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const WHITE: RGB = { r: 255, g: 255, b: 255 };
const BLACK: RGB = { r: 0, g: 0, b: 0 };

function contrastFlags(c: RGB, bg: RGB): ShadeContrast {
  const ratio = contrastRatio(c, bg);
  return { ratio: round2(ratio), aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7 };
}

/**
 * Build a tonal ramp from a base color: `steps` shades sharing the base hue +
 * saturation, stepped across lightness (light → dark), each scored vs white/black.
 */
export function generateRamp(baseColor: string, steps = 10): Palette {
  const rgb = parseColor(baseColor);
  if (!rgb) throw new Error(`Unrecognized color: ${baseColor}`);
  const { h, s } = rgbToHsl(rgb);

  const ramp: Shade[] = [];
  const top = 0.95, bottom = 0.1;
  for (let i = 0; i < steps; i++) {
    const l = steps === 1 ? 0.5 : top - (i / (steps - 1)) * (top - bottom);
    const shade = hslToRgb({ h, s, l });
    ramp.push({
      hex: toHex(shade),
      lightness: round2(l),
      onWhite: contrastFlags(shade, WHITE),
      onBlack: contrastFlags(shade, BLACK),
    });
  }
  return { base: toHex(rgb), ramp };
}

/** The readable text color (black or white) for a given background + its ratio. */
export function bestTextColor(background: string): { hex: string; ratio: number } {
  const bg = parseColor(background);
  if (!bg) throw new Error(`Unrecognized color: ${background}`);
  const onBlack = contrastRatio(BLACK, bg);
  const onWhite = contrastRatio(WHITE, bg);
  return onBlack >= onWhite ? { hex: "#000000", ratio: round2(onBlack) } : { hex: "#ffffff", ratio: round2(onWhite) };
}
