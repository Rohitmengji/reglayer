/**
 * RegLayer — turn an axe color-contrast violation into a concrete fix.
 *
 * axe's `failureSummary` for `color-contrast` carries the actual colors + font,
 * e.g. "…(foreground color: #999999, background color: #ffffff, font size:
 * 12.0pt (16px), font weight: normal)…". This parses that and runs the WCAG
 * contrast engine to produce the nearest accessible (hue-preserving) color —
 * so the scan result shows the real fix, not just "fails". Pure + deterministic.
 */
import { analyzeContrast, type ContrastReport } from "./contrast";

export interface ContrastViolationFix {
  foreground: string;
  background: string;
  largeText: boolean;
  report: ContrastReport;
}

export function analyzeContrastViolation(failureSummary: string): ContrastViolationFix | null {
  if (!failureSummary || typeof failureSummary !== "string") return null;

  const fg = failureSummary.match(/foreground color:\s*(#?[0-9a-f]{3,8})/i)?.[1];
  const bg = failureSummary.match(/background color:\s*(#?[0-9a-f]{3,8})/i)?.[1];
  if (!fg || !bg) return null;

  const sizePt = parseFloat(failureSummary.match(/font size:\s*([\d.]+)\s*pt/i)?.[1] ?? "");
  const weightRaw = (failureSummary.match(/font weight:\s*(\w+)/i)?.[1] ?? "").toLowerCase();
  const bold = weightRaw === "bold" || Number(weightRaw) >= 700;
  // WCAG "large text": ≥ 18pt, or ≥ 14pt bold.
  const largeText = !Number.isNaN(sizePt) && (sizePt >= 18 || (sizePt >= 14 && bold));

  try {
    const report = analyzeContrast(fg, bg, { level: "AA", largeText });
    return { foreground: report.foreground, background: report.background, largeText, report };
  } catch {
    return null;
  }
}
