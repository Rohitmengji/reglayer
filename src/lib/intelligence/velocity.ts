/**
 * RegLayer — violation velocity (pure).
 *
 * Kept dependency-free (no prisma / server-only) so it can be unit-tested
 * directly and reused by both the analytics and forecasting engines.
 */

/**
 * Violation velocity from per-URL scan series.
 *
 * For each URL's chronological scans, a scan-over-scan DROP in the violation
 * count is treated as fixes and a RISE as introductions; totals are summed
 * across URLs and divided by the period length in weeks. Grouping by URL first
 * is what makes this honest — we never diff one site's count against another's.
 */
export function computeViolationVelocity(
  urlGroups: Array<Array<{ totalViolations: number }>>,
  weeks: number
): { violationsFixedPerWeek: number; violationsIntroducedPerWeek: number; netChangePerWeek: number } {
  let totalFixed = 0;
  let totalIntroduced = 0;
  for (const series of urlGroups) {
    for (let i = 1; i < series.length; i++) {
      const diff = series[i].totalViolations - series[i - 1].totalViolations;
      if (diff < 0) totalFixed += -diff;
      else totalIntroduced += diff;
    }
  }
  const w = Math.max(1, weeks);
  return {
    violationsFixedPerWeek: Math.round((totalFixed / w) * 10) / 10,
    violationsIntroducedPerWeek: Math.round((totalIntroduced / w) * 10) / 10,
    // Net change in outstanding violations: introductions minus fixes
    // (positive = violations growing, negative = shrinking).
    netChangePerWeek: Math.round(((totalIntroduced - totalFixed) / w) * 10) / 10,
  };
}
