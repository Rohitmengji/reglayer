/**
 * RegLayer — touch-target size evaluator (WCAG 2.5.8 AA / 2.5.5 AAA)
 *
 * 2.5.8 (new in WCAG 2.2) requires interactive targets to be at least 24×24 CSS
 * px — OR smaller if sufficiently SPACED (a 24px circle on the target doesn't
 * overlap its neighbours) — with exceptions for inline and essential targets.
 * 2.5.5 (AAA) raises the floor to 44×44. Pure + deterministic.
 */
export type TouchLevel = "AA" | "AAA";

export interface TouchInput {
  width: number; // CSS px
  height: number;
  /** Clear gap (CSS px) to the nearest adjacent target — enables the 2.5.8 spacing exception. */
  spacing?: number;
  /** Target is inline within a sentence/block of text (2.5.8 exception). */
  inline?: boolean;
  /** A particular presentation is essential / legally required (2.5.8 exception). */
  essential?: boolean;
  level?: TouchLevel;
}

export interface TouchReport {
  meets: boolean;
  level: TouchLevel;
  required: number; // px
  actual: number; // min(width, height)
  exception: "inline" | "essential" | "spacing" | null;
  recommendation: string | null;
}

export function analyzeTouchTarget(input: TouchInput): TouchReport {
  const level = input.level ?? "AA";
  const required = level === "AAA" ? 44 : 24;
  const actual = Math.min(input.width, input.height);
  const base = (over: Partial<TouchReport>): TouchReport => ({
    meets: false, level, required, actual, exception: null, recommendation: null, ...over,
  });

  if (input.inline) return base({ meets: true, exception: "inline" });
  if (input.essential) return base({ meets: true, exception: "essential" });

  if (actual >= required) return base({ meets: true });

  // Spacing exception applies to 2.5.8 (AA) only: an undersized target is OK if a
  // 24px circle centred on it clears its neighbours — approximated as
  // size + 2×gap ≥ 24.
  if (level === "AA" && input.spacing !== undefined && actual + 2 * input.spacing >= 24) {
    return base({ meets: true, exception: "spacing" });
  }

  return base({
    recommendation: `Enlarge to at least ${required}×${required} CSS px (currently ${input.width}×${input.height})` +
      (level === "AA" ? `, or add spacing so a 24px circle clears adjacent targets.` : `.`),
  });
}
