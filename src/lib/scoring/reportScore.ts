/**
 * RegLayer — canonical report score (single source of truth)
 *
 * WHY: the same scan was being shown with DIFFERENT scores across surfaces —
 * some recalculated from violations, some read the stored `scan.score`. This
 * module is the one place every read surface (report/[id], public report, the
 * badge, and the certificate) computes a score from STORED violations.
 *
 * The formula is identical to the scanner's `calculateComplianceScore`
 * (src/lib/scanner/accessibility/severityEngine.ts) — severity-weighted penalty
 * with diminishing returns per affected node — so a score recomputed here on
 * read equals what the engine wrote at scan time. Recomputing (rather than
 * trusting the stored number) also guarantees the score always matches the
 * violation list actually shown, even for older rows written with an old formula.
 */

export interface StoredViolation {
  impact: string;
  /** Stored as a JSON array of axe nodes; only its length matters for scoring. */
  affectedElements: unknown;
}

const SEVERITY_BASE: Record<string, number> = {
  CRITICAL: 10, critical: 10,
  SERIOUS: 5, serious: 5,
  MODERATE: 2, moderate: 2,
  MINOR: 0.5, minor: 0.5,
};

/**
 * Accessibility score (0–100, one decimal) recomputed from stored violations.
 * Returns 100 when there are no violations.
 */
export function scoreFromStoredViolations(violations: StoredViolation[]): number {
  if (!violations || violations.length === 0) return 100;

  const totalPenalty = violations.reduce((sum, v) => {
    const base = SEVERITY_BASE[v.impact] ?? 1;
    const elements = Array.isArray(v.affectedElements) ? v.affectedElements : [];
    const nodeCount = Math.max(1, elements.length);
    const nodeMultiplier = 1 + Math.log2(nodeCount) / 4;
    return sum + base * nodeMultiplier;
  }, 0);

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  return Math.round(score * 10) / 10;
}
