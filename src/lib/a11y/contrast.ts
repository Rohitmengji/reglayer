/**
 * RegLayer — WCAG color-contrast engine + accessible-color solver
 *
 * WHY: Color contrast (WCAG 2.2 SC 1.4.3 / 1.4.6, EN 301 549 9.1.4.3) is the single
 *      most common accessibility violation. Most tools only FLAG it. This module
 *      also SOLVES it: given a failing foreground/background, it finds the nearest
 *      passing color that preserves the brand HUE — the smallest perceptual nudge
 *      that reaches AA/AAA — and reports honestly when no color can satisfy the
 *      target against that background (so the fix is to change the background).
 *
 * Pure + dependency-free (no prisma / server-only / DOM) so it runs anywhere and
 * is exhaustively unit-testable against the published WCAG reference formulas.
 *
 * Refs: WCAG 2.2 relative-luminance + contrast-ratio definitions
 *       (https://www.w3.org/TR/WCAG22/#dfn-relative-luminance,
 *        https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio).
 */

export interface RGB {
  r: number; // 0–255
  g: number;
  b: number;
}

export interface HSL {
  h: number; // 0–360
  s: number; // 0–1
  l: number; // 0–1
}

export type WcagLevel = "AA" | "AAA";

export interface ContrastReport {
  foreground: string; // normalized #rrggbb
  background: string;
  ratio: number; // 1–21, rounded to 2dp
  passes: {
    aaNormal: boolean; // >= 4.5
    aaLarge: boolean; // >= 3
    aaaNormal: boolean; // >= 7
    aaaLarge: boolean; // >= 4.5
  };
  /** Suggestion for the requested level + text size (only present when the input fails it). */
  suggestion: ContrastSuggestion | null;
  target: { level: WcagLevel; largeText: boolean; ratio: number };
}

export interface ContrastSuggestion {
  /** Did we find a foreground that meets the target against this background? */
  meetsTarget: boolean;
  /** Minimal hue-preserving change that meets the target (or, if impossible, the highest-contrast fallback). */
  recommended: ColorOption;
  /** Closest passing color DARKER than the original (null if none / not needed). */
  darker: ColorOption | null;
  /** Closest passing color LIGHTER than the original (null if none / not needed). */
  lighter: ColorOption | null;
}

export interface ColorOption {
  hex: string; // #rrggbb
  ratio: number; // vs the background, 2dp
}

const LARGE_TEXT_AA = 3;
const NORMAL_TEXT_AA = 4.5;
const LARGE_TEXT_AAA = 4.5;
const NORMAL_TEXT_AAA = 7;

/** Required contrast ratio for a WCAG level + text size. */
export function thresholdFor(level: WcagLevel, largeText: boolean): number {
  if (level === "AAA") return largeText ? LARGE_TEXT_AAA : NORMAL_TEXT_AAA;
  return largeText ? LARGE_TEXT_AA : NORMAL_TEXT_AA;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Parse a CSS color into RGB. Supports #rgb, #rrggbb (with/without #) and
 * rgb()/rgba(). Returns null for anything unrecognized (named colors, hsl(), etc.).
 */
export function parseColor(input: string): RGB | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();

  // #rgb / #rrggbb (with or without leading #)
  const hex = s.startsWith("#") ? s.slice(1) : /^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(s) ? s : "";
  if (hex) {
    if (/^[0-9a-f]{3}$/.test(hex)) {
      return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16) };
    }
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
    }
    return null;
  }

  // rgb(r,g,b) / rgba(r,g,b,a) — integer or percentage channels.
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).slice(0, 3);
    if (parts.length < 3) return null;
    const ch = parts.map((p) => (p.endsWith("%") ? Math.round((parseFloat(p) / 100) * 255) : parseFloat(p)));
    if (ch.some((n) => Number.isNaN(n))) return null;
    return { r: clamp(Math.round(ch[0]), 0, 255), g: clamp(Math.round(ch[1]), 0, 255), b: clamp(Math.round(ch[2]), 0, 255) };
  }

  return null;
}

export function toHex({ r, g, b }: RGB): string {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** WCAG relative luminance of an sRGB color (0 = black, 1 = white). */
export function relativeLuminance({ r, g, b }: RGB): number {
  const lin = (c: number) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── HSL conversion (preserve hue/saturation while we move lightness) ──────────

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return {
    r: Math.round(hue2rgb(p, q, hk + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hk) * 255),
    b: Math.round(hue2rgb(p, q, hk - 1 / 3) * 255),
  };
}

/**
 * Find the foreground color that meets `target` contrast against `bg` with the
 * SMALLEST change in HSL lightness from `fg` (hue + saturation preserved). Scans
 * lightness densely — contrast vs lightness is V-shaped around the background's
 * luminance, so we don't assume monotonicity; we just take the closest passing
 * lightness on each side. Honest about impossibility (mid-gray backgrounds can't
 * support AAA at all), returning the highest-contrast fallback instead.
 */
export function suggestAccessibleColor(fg: RGB, bg: RGB, target: number): ContrastSuggestion {
  const base = rgbToHsl(fg);
  const STEPS = 1000;

  let darker: ColorOption | null = null; // largest l <= base.l that passes (closest below)
  let lighter: ColorOption | null = null; // smallest l >= base.l that passes (closest above)
  let best: { rgb: RGB; ratio: number } | null = null;

  for (let i = 0; i <= STEPS; i++) {
    const l = i / STEPS;
    const rgb = hslToRgb({ h: base.h, s: base.s, l });
    const ratio = contrastRatio(rgb, bg);
    if (!best || ratio > best.ratio) best = { rgb, ratio };
    if (ratio >= target) {
      if (l <= base.l) darker = { hex: toHex(rgb), ratio: round2(ratio) }; // keeps last (highest) l <= base.l
      if (l >= base.l && lighter === null) lighter = { hex: toHex(rgb), ratio: round2(ratio) }; // first l >= base.l
    }
  }

  if (!darker && !lighter) {
    // No lightness at this hue/saturation reaches the target — be honest.
    return {
      meetsTarget: false,
      recommended: { hex: toHex(best!.rgb), ratio: round2(best!.ratio) },
      darker: null,
      lighter: null,
    };
  }

  // Minimal change = whichever passing side is closer in lightness to the original.
  let recommended: ColorOption;
  if (darker && lighter) {
    const dDark = base.l - rgbToHsl(parseColor(darker.hex)!).l;
    const dLight = rgbToHsl(parseColor(lighter.hex)!).l - base.l;
    recommended = dDark <= dLight ? darker : lighter;
  } else {
    recommended = (darker ?? lighter)!;
  }

  return { meetsTarget: true, recommended, darker, lighter };
}

/**
 * Full contrast report for a foreground/background pair, including pass flags for
 * all four standard thresholds and — when the input fails the requested target —
 * a hue-preserving fix suggestion. Throws on unparseable colors.
 */
export function analyzeContrast(
  foreground: string,
  background: string,
  opts: { level?: WcagLevel; largeText?: boolean } = {}
): ContrastReport {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg) throw new Error(`Unrecognized foreground color: ${foreground}`);
  if (!bg) throw new Error(`Unrecognized background color: ${background}`);

  const level: WcagLevel = opts.level ?? "AA";
  const largeText = opts.largeText ?? false;
  const ratio = contrastRatio(fg, bg);
  const targetRatio = thresholdFor(level, largeText);

  return {
    foreground: toHex(fg),
    background: toHex(bg),
    ratio: round2(ratio),
    passes: {
      aaLarge: ratio >= LARGE_TEXT_AA,
      aaNormal: ratio >= NORMAL_TEXT_AA,
      aaaLarge: ratio >= LARGE_TEXT_AAA,
      aaaNormal: ratio >= NORMAL_TEXT_AAA,
    },
    suggestion: ratio >= targetRatio ? null : suggestAccessibleColor(fg, bg, targetRatio),
    target: { level, largeText, ratio: targetRatio },
  };
}
